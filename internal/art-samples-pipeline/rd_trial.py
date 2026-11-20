"""把网站上手动下载的 RD 出图落位、并与 v4 现有部件同屏对比。

用途：在没钱付 API 的情况下，用网页免费额度先验证"RD 出的图落到 6×6~12×12 到底能不能认出来"。

用法：
    mkdir -p trial-in && cp ~/Downloads/*.png trial-in/
    python3 rd_trial.py                    # 落位 + 生成对比图
    python3 rd_trial.py --no-cluster       # 只看 RD 原色，不做双阶聚色

约定：
- `trial-in/` 里的文件名必须以任务 id 开头，例如 `arm_hf_blade.png`、
  `legs_biped-2.png`、`chest_boss (1).png` 都能认出来。
- 源图尺寸任意，脚本自动居中裁到"目标尺寸的整数倍"再块降采样，保证像素网格不糊。
- 白底会被自动抠掉（只抠与画布边缘连通的白，保留角色内部的高光像素）。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from pixelkit import PAL_RGB, load_rgba, palette_audit, paste, text, up  # noqa: E402
from rd_gen import block_downscale, cluster_to_palette  # noqa: E402
from rd_jobs import JOBS  # noqa: E402

TRIAL_IN = ROOT / "trial-in"
TRIAL_OUT = ROOT / "trial-out"
K = 10          # 对比图放大倍数


def key_white(img: np.ndarray, thr=242, spread=14) -> np.ndarray:
    """抠掉与画布边缘连通的白色背景，保留角色内部的浅色高光。"""
    out = img.copy()
    rgb = out[..., :3].astype(int)
    whitish = (rgb.min(-1) >= thr) & ((rgb.max(-1) - rgb.min(-1)) <= spread)
    if out.shape[-1] == 4:
        whitish &= out[..., 3] > 0
    lab, _ = ndimage.label(whitish)
    if lab.max() == 0:
        out[..., 3] = np.where(whitish, 0, 255)
        return out
    border = set(np.concatenate([lab[0, :], lab[-1, :], lab[:, 0], lab[:, -1]]).tolist())
    border.discard(0)
    bg = np.isin(lab, list(border))
    out[bg, 3] = 0
    out[..., 3] = np.where(out[..., 3] > 0, 255, 0)
    return out


def slot_of(name: str):
    """按最长 id 前缀匹配任务，避免 arm_hf_blade 抢走 arm_hf_blade_orange。"""
    stem = re.sub(r"[^a-z0-9_]", "", name.lower())
    for job in sorted(JOBS, key=lambda j: -len(j["id"])):
        if stem.startswith(job["id"]):
            return job
    return None


def land(path: Path, job: dict, cluster=True):
    tw, th = job["target"]
    img = np.asarray(Image.open(path).convert("RGBA")).copy()
    img = key_white(img)
    h, w = img.shape[:2]
    if w < tw or h < th:                      # 源图比槽位还小 → 先最近邻放大到能整数倍
        k = max(-(-tw // max(w, 1)), -(-th // max(h, 1)))
        img = np.asarray(Image.fromarray(img, "RGBA").resize((w * k, h * k), Image.NEAREST))
        h, w = img.shape[:2]
    f = max(1, min(w // tw, h // th))
    cw, ch = f * tw, f * th
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    crop = Image.fromarray(img[y0:y0 + ch, x0:x0 + cw], "RGBA")
    crop.save(ROOT / "trial-out" / "_crop_tmp.png")
    spr = block_downscale(ROOT / "trial-out" / "_crop_tmp.png", f, cutout=True)
    mode = "原色"
    if cluster and job["kind"] != "tile":
        spr, mode = cluster_to_palette(spr, job.get("accent"))
    return spr, f, mode


def floor_tile():
    p = ROOT / "build" / "tiles" / "tile_floor.png"
    if p.exists():
        return load_rgba(str(p))
    return np.dstack([np.full((24, 24, 3), PAL_RGB["E1"], np.uint8),
                      np.full((24, 24), 255, np.uint8)])


def on_floor(spr):
    fl = floor_tile()
    can = fl.copy()
    paste(can, spr, (24 - spr.shape[1]) // 2, 24 - spr.shape[0] - 1)
    return can


def compare_sheet(job, new, old):
    from PIL import ImageDraw
    tiles = []
    labels = []
    if old is not None:
        tiles.append(on_floor(old))
        labels.append("v4 参考")
    tiles.append(on_floor(new))
    labels.append("RD 落位")

    pad, top = 14, 24
    tw = sum(24 for _ in tiles) + pad * (len(tiles) + 1)
    big = 24 * K
    sheet = Image.new("RGB", (tw * 2 + big + pad, big + top + 46), (11, 13, 20))
    d = ImageDraw.Draw(sheet)

    x = pad
    for t, lb in zip(tiles, labels):
        sheet.paste(Image.fromarray(t), (x, top))
        sheet.paste(up(Image.fromarray(t), K // 2), (x, top + 26))
        text(d, (x, top + 4), lb, 11, (150, 162, 184), shadow=False)
        x += 24 + pad

    ox = x + 6
    sheet.paste(up(Image.fromarray(on_floor(new)), K), (ox, top))

    opaque = int((new[..., 3] > 0).sum())
    colors = len(np.unique(new[new[..., 3] > 0][:, :3], axis=0)) if opaque else 0
    off = palette_audit(new)
    info = f"{job['id']}  {new.shape[1]}×{new.shape[0]}  {colors}色  {opaque}px  调色板外{len(off)}"
    text(d, (pad, sheet.height - 26), info, 12, (210, 220, 236), shadow=False)
    return sheet


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default=str(TRIAL_IN))
    ap.add_argument("--no-cluster", dest="cluster", action="store_false")
    args = ap.parse_args()

    src_dir = Path(args.src)
    if not src_dir.exists():
        sys.exit(f"没有 {src_dir}，先把网站下载的 png 放进这个目录")
    TRIAL_OUT.mkdir(exist_ok=True)

    files = sorted(p for p in src_dir.iterdir() if p.suffix.lower() in (".png", ".jpg", ".webp"))
    if not files:
        sys.exit(f"{src_dir} 里没有图片")

    done, skipped = [], []
    for p in files:
        job = slot_of(p.stem)
        if job is None:
            skipped.append(p.name)
            continue
        new, f, mode = land(p, job, args.cluster)
        if job["kind"] == "tile":
            dst = TRIAL_OUT / f"tile_{job['id'].removeprefix('tile_')}.png"
        else:
            dst = TRIAL_OUT / f"{job['id']}.png"
        Image.fromarray(new, "RGBA").save(dst)

        old = None
        cand = ROOT / "build" / ("tiles" if job["kind"] == "tile" else "parts") / dst.name
        if cand.exists():
            old = load_rgba(str(cand))
        sheet = compare_sheet(job, new, old)
        sheet.save(TRIAL_OUT / f"compare-{job['id']}.png")
        done.append((job["id"], f, mode, dst.name))

    (TRIAL_OUT / "_crop_tmp.png").unlink(missing_ok=True)

    print(f"\n{'id':<26}{'倍率':<6}{'模式':<6}落位文件")
    for r in done:
        print(f"{r[0]:<26}÷{r[1]:<5}{r[2]:<6}{r[3]}")
    if skipped:
        print("\n认不出任务 id 的文件（已跳过）：")
        for s in skipped:
            print("  ", s)
    print(f"\n对比图：{TRIAL_OUT}/compare-*.png  （左=v4 参考，右=RD 8× 放大）")


if __name__ == "__main__":
    main()
