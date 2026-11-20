"""整身试跑：一次性生成完整角色（不拆槽），用来先判断整体观感是否成立。

与 rd_trial.py 的分工：
- rd_trial.py  → 逐槽部件，验证"5×5 的头还认不认得出"这类极限问题
- rd_whole.py  → 整身角色，验证"这套材质语言整体看起来对不对"

用法：
    mkdir -p trial-out && cp ~/Downloads/boss*.png trial-in/
    python3 rd_whole.py                 # 落位到 20×22 并与 v4 拼装结果同屏对比

整身产物**不能热插拔**，只用于观感判断；正式资产仍走 5 槽拼装。
"""
from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

from pixelkit import load_rgba, paste, text, up  # noqa: E402
from rd_gen import block_downscale  # noqa: E402
from rd_trial import key_white  # noqa: E402

TRIAL_IN = ROOT / "trial-in"
TRIAL_OUT = ROOT / "trial-out"

W, H = 20, 22          # 与 rig.py 的画布一致
GEN = (W * 4, H * 4)   # 80×88：rd_pro 支持，÷4 落位
K = 10

# 整身提示词：一个单位一条。只描述主体，不写 pixel art，声明白底。
WHOLE = [
    dict(id="whole_player", cn="玩家 / 拾荒工兵",
         desc="amber core, hydraulic power fist, two cargo packs on the back",
         prompt="a single small cyberpunk robot scavenger standing in a three-quarter view facing right, "
                "compact armored body with a narrow waist, amber reactor core in the chest, one arm ending in a chunky "
                "yellow hydraulic power fist, two small orange cargo packs mounted on its back, flat amber visor band "
                "for a face, staggered leg stance, dark gunmetal steel with only one or two tiny glowing accent pixels, "
                "on a flat white background, centered, one object only, no shadow"),
    dict(id="whole_grunt", cn="企业安保步兵",
         desc="red visor, shock baton, one heat sink on the back",
         prompt="a single small corporate security robot soldier standing in a three-quarter view facing right, "
                "compact armored body with a narrow waist, cyan reactor core in the chest, one arm holding a short shock "
                "baton with an electric blue tip, one small ice-blue heat sink fin on its back, angled red visor slit "
                "for a face, staggered leg stance, dark gunmetal steel with only one or two tiny glowing accent pixels, "
                "on a flat white background, centered, one object only, no shadow"),
    dict(id="whole_boss", cn="首领：橙刃处刑者",
         desc="orange HF blade, red core, four orange cargo packs",
         prompt="a single large cyberpunk robot commander standing in a wide three-quarter view facing right, "
                "broad V-shaped armored torso tapering to a narrow waist, huge red reactor core in the chest, one arm "
                "holding a long legendary high-frequency katana with a gold-orange glowing edge, two short curved horns "
                "on its helmet, four orange cargo packs mounted across its back, heavy wide-stance piston legs, "
                "dark gunmetal steel with only one or two tiny glowing accent pixels, "
                "on a flat white background, centered, one object only, no shadow"),
    dict(id="whole_drone", cn="悬浮无人机",
         desc="floating, cyan thruster, EMP arms",
         prompt="a single small sleek flying drone robot hovering in a three-quarter view facing right, "
                "round aerodynamic body with a glowing cyan core, two stubby EMP cannon arms with cyan muzzle rings, "
                "two small ice-blue heat sink fins on its back, one round camera lens glowing cyan for a face, "
                "no legs, a short cyan jet flame underneath, dark gunmetal steel with only one or two tiny glowing accent pixels, "
                "on a flat white background, centered, one object only, no shadow"),
]

SLOT_CN = {"whole_player": "玩家（参照）", "whole_grunt": "企业安保步兵",
           "whole_boss": "首领：橙刃处刑者", "whole_drone": "悬浮无人机"}


def key_white_tight(img: np.ndarray) -> np.ndarray:
    """抠白底 + 裁到内容包围盒，让不同生成结果的构图差异不影响落位。"""
    out = key_white(img)
    a = out[..., 3] > 0
    if not a.any():
        return out
    ys, xs = np.nonzero(a)
    return out[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def land_whole(path: Path) -> tuple[np.ndarray, int]:
    img = key_white_tight(np.asarray(Image.open(path).convert("RGBA")))
    h, w = img.shape[:2]
    f = max(1, min(w // W, h // H))
    if f < 2:                                  # 源图太小 → 先放大到可整数倍
        k = 2
        img = np.asarray(Image.fromarray(img, "RGBA").resize((w * k, h * k), Image.NEAREST))
        h, w = img.shape[:2]
        f = max(1, min(w // W, h // H))
    cw, ch = f * W, f * H
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    tmp = TRIAL_OUT / "_whole_tmp.png"
    Image.fromarray(img[y0:y0 + ch, x0:x0 + cw], "RGBA").save(tmp)
    return block_downscale(tmp, f, cutout=True), f


def floor():
    p = ROOT / "build" / "tiles" / "tile_floor.png"
    if p.exists():
        return load_rgba(str(p))
    from pixelkit import PAL_RGB
    return np.dstack([np.full((24, 24, 3), PAL_RGB["E1"], np.uint8),
                      np.full((24, 24), 255, np.uint8)])


def on_floor(spr):
    can = floor().copy()
    paste(can, spr, (24 - spr.shape[1]) // 2, 24 - spr.shape[0] - 1)
    return can


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--in", dest="src", default=str(TRIAL_IN))
    args = ap.parse_args()
    src_dir = Path(args.src)
    if not src_dir.exists():
        sys.exit(f"没有 {src_dir}，把整身出图放进去（文件名以 whole_xxx 开头）")
    TRIAL_OUT.mkdir(exist_ok=True)

    rows = []
    for spec in WHOLE:
        hits = sorted(p for p in src_dir.iterdir()
                      if p.suffix.lower() in (".png", ".jpg", ".webp")
                      and re.sub(r"[^a-z0-9_]", "", p.stem.lower()).startswith(spec["id"]))
        for i, p in enumerate(hits):
            new, f = land_whole(p)
            suffix = "" if i == 0 else f"-{i+1}"
            dst = TRIAL_OUT / f"{spec['id']}{suffix}.png"
            Image.fromarray(new, "RGBA").save(dst)
            old_p = ROOT / "build" / f"unit_{spec['id'].removeprefix('whole_')}.png"
            old = load_rgba(str(old_p)) if old_p.exists() else None
            rows.append((spec, new, old, p.name))

    if not rows:
        sys.exit("没匹配到文件名以 whole_ 开头的图")

    pad, top = 16, 46
    cols = len(rows)
    cell = 24 * K + 300
    sheet = Image.new("RGB", (min(cols, 2) * cell + pad, ((cols + 1) // 2) * (24 * K + top + 40) + pad),
                      (11, 13, 20))
    d = ImageDraw.Draw(sheet)
    text(d, (pad, 12), "整身对比：v4 拼装（左）  vs  RD 一次生成（右）", 18, (238, 244, 255))

    for n, (spec, new, old, fname) in enumerate(rows):
        cx = pad + (n % 2) * cell
        cy = top + (n // 2) * (24 * K + top + 40)
        d.rectangle([cx, cy, cx + cell - 20, cy + 24 * K + 34], outline=(44, 54, 78))
        text(d, (cx + 10, cy + 8), SLOT_CN.get(spec["id"], spec["id"]), 15, (226, 234, 248))
        text(d, (cx + 10, cy + 28), spec["desc"], 11, (132, 146, 172), shadow=False)
        x = cx + 10
        if old is not None:
            t = on_floor(old)
            sheet.paste(up(Image.fromarray(t), K), (x, cy + 50))
            text(d, (x, cy + 50 + 24 * K + 4), f"v4 {old.shape[1]}×{old.shape[0]}", 11, (150, 162, 184), shadow=False)
            x += 24 * K + 20
        t2 = on_floor(new)
        sheet.paste(up(Image.fromarray(t2), K), (x, cy + 50))
        text(d, (x, cy + 50 + 24 * K + 4), f"RD {new.shape[1]}×{new.shape[0]}", 11, (120, 245, 180), shadow=False)

    out = TRIAL_OUT / "compare-whole.png"
    sheet.save(out)
    (TRIAL_OUT / "_whole_tmp.png").unlink(missing_ok=True)
    print(f"{len(rows)} 张整身已落位 → {out}")
    for spec, new, old, fname in rows:
        print(f"  {spec['id']:<16} {fname:<28} → {new.shape[1]}×{new.shape[0]}")


if __name__ == "__main__":
    main()
