"""Retro Diffusion 生成器：按 rd_jobs.py 的任务表批量出图 → 落位到 build/parts 与 build/tiles。

用法：
    export RD_API_KEY="rdpk-..."          # https://www.retrodiffusion.ai/app/devtools
    python3 rd_gen.py styles              # 列出账号可用的 style 与其尺寸/批次上限（只读免费）
    python3 rd_gen.py cost                # 免费 dry-run 报价（一次调用算全表）
    python3 rd_gen.py gen                 # 全部生成（跳过已存在的文件）
    python3 rd_gen.py gen --only arm_hf_blade legs_biped
    python3 rd_gen.py gen --draft         # 用 rd_fast 起草全表，~1/6 价格
    python3 rd_gen.py promote             # 落位：整数倍降采样 → build/parts、build/tiles → 调色板审计

约定：
- 只依赖标准库（urllib / base64 / json），服务器上无需 pip install。
- 每张图都带 Idempotency-Key，重跑不会重复扣费；已存在的输出直接跳过。
- 生成的原图留在 src-rd/ 不再改动，promote 只写 build/ 下的落位结果。
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import sys
import time
import urllib.error
import urllib.request
import uuid
from collections import Counter
from pathlib import Path

from rd_jobs import STYLE_DRAFT, TILE_GEN, TILE_KEYS, targets

API = "https://api.retrodiffusion.ai/v2"
ROOT = Path(__file__).resolve().parent
SRC_RD = ROOT / "src-rd"
PARTS = ROOT / "build" / "parts"
TILES = ROOT / "build" / "tiles"
PALETTE_PNG = ROOT.parent.parent / "media" / "art-samples" / "palette-24.png"

# 各 style 的最小边（来自 /v2/styles/selector）：rd_fast / rd_plus 是 64，rd_pro / rd_core 是 12/16。
# 低于下限的宽高会被服务端以 invalid_style_dimensions 拒绝，所以小部件要等比例放大到合法尺寸。
MIN_EDGE = {"default:rd_flux": 64, "rd_plus__default": 64, "rd_core__default": 16,
            "rd_pro__default": 12, "rd_tile__single_tile": 16}


def token() -> str:
    key = os.environ.get("RD_API_KEY", "").strip()
    if not key:
        sys.exit("缺少 RD_API_KEY 环境变量（rdpk- 开头，在 Developer Tools 里创建）")
    return key


def call(method: str, path: str, body: dict | None = None, idem: str | None = None) -> dict:
    headers = {"X-RD-Token": token(), "Content-Type": "application/json"}
    if idem:
        headers["Idempotency-Key"] = idem
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(API + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        payload = e.read().decode(errors="replace")
        sys.exit(f"HTTP {e.code} {path}: {payload}")


def poll(task_id: str, every=2.0, limit=600) -> dict:
    for _ in range(int(limit / every)):
        task = call("GET", f"/inferences/tasks/{task_id}")
        if task["status"] in ("pending", "running"):
            time.sleep(every)
            continue
        if task["status"] == "failed":
            sys.exit(f"生成失败（已自动退款）：{task.get('error')}")
        return task["result"]
    sys.exit(f"轮询超时：{task_id}")


def b64(path: Path) -> str:
    return base64.b64encode(path.read_bytes()).decode()


def cmd_styles(_args):
    data = call("GET", "/styles/selector")
    print(f"{len(data['styles'])} styles（models: {', '.join(data['models'])}）\n")
    for s in data["styles"]:
        flags = []
        if s.get("require_input_image"):
            flags.append("需要输入图")
        if s.get("supports_reference_images"):
            flags.append("支持参考图")
        print(f"{s['prompt_style']:<34} {s['min_width']}-{s['max_width']}px "
              f"batch<={s['max_number_of_images']} {' '.join(flags)}".rstrip())


def build_body(job: dict, draft: bool, palette: bool) -> dict:
    style = job["prompt_style"]
    if draft:
        style = STYLE_DRAFT
    w, h = job["gen"]
    body = {
        "prompt": job["prompt"],
        "prompt_style": style,
        "width": w,
        "height": h,
        "num_images": 1,
        "bypass_prompt_expansion": True,   # 提示词已按槽位写死，禁止 LLM 改写加戏
    }
    if job["kind"] == "tile":
        body["remove_bg"] = False          # 地块必须铺满，不能透明
        if draft:                          # 起草模型最小边 64；96 可被 24 整除，落位零裁切
            body["width"] = body["height"] = 96
        if palette:
            body["input_palette"] = b64(PALETTE_PNG)
    else:
        body["remove_bg"] = True           # 主体抠成透明，交给锚点拼装
    return body


def min_cost_dim(style: str, want: tuple[int, int]) -> tuple[int, int]:
    """style 有最小边限制（rd_fast 64 / rd_plus 64），而我们的部件只要 16~40px。
    等比例放大到合法尺寸，promote 的落位倍率随源图尺寸自适应。"""
    w, h = want
    lo = MIN_EDGE.get(style, 12)
    m = max(w, h)
    if m >= lo:
        return want
    k = -(-lo // m)                       # 向上取整
    return (w * k, h * k)


def credits() -> dict:
    return call("GET", "/inferences/credits")


def cmd_balance(_args):
    d = credits()
    print(f"余额 balance ${d.get('balance', 0):.2f}    credits {d.get('credits', 0)}")
    free = (d.get("usage") or {}).get("free") or {}
    if free:
        print(f"免费额度（仅网页端可用，API 不消耗）：{free.get('units_left_pct')}%  "
              f"下次可领 {free.get('next_claim_at')}")
    plan = (d.get("usage") or {}).get("plan")
    print(f"订阅 plan：{plan or '无'}")
    if (d.get("balance") or 0) <= 0 and not plan:
        print("\n⚠ API 余额为 0 且无订阅：生成必然失败 insufficient_balance。"
              "\n  网页端的每日免费额度按官方文档明确不供 API 使用，需在 Payment Methods 充值。")


def cmd_cost(args):
    total = 0.0
    for job in targets():
        body = {**build_body(job, args.draft, False), "check_cost": True}
        body["width"], body["height"] = min_cost_dim(body["prompt_style"], (body["width"], body["height"]))
        r = call("POST", "/inferences", body)
        total += r.get("balance_cost", 0)
        print(f"{job['id']:<26} {body['width']:>3}×{body['height']:<3} ${r.get('balance_cost', 0):.3f}"
              f"  {r.get('would_use', '')}")
    print(f"\n合计 ${total:.2f}")
    print(f"余额 ${r.get('remaining_balance', '?')}")


def cmd_gen(args):
    bal = credits()
    if (bal.get("balance") or 0) <= 0 and not ((bal.get("usage") or {}).get("plan")):
        sys.exit("余额为 0 且无订阅，拒绝提交（避免全表注定失败）。先看 rd_gen.py balance，或到 "
                 "https://www.retrodiffusion.ai/app/payment-methods 充值。")
    SRC_RD.mkdir(parents=True, exist_ok=True)
    only = set(args.only or [])
    todo = [j for j in targets() if not only or j["id"] in only]
    for i, job in enumerate(todo, 1):
        out = SRC_RD / f"{job['id']}.png"
        if out.exists() and not args.force:
            print(f"[{i}/{len(todo)}] {job['id']:<26} 已存在，跳过")
            continue
        body = build_body(job, args.draft, args.palette)
        body["width"], body["height"] = min_cost_dim(body["prompt_style"], (body["width"], body["height"]))
        idem = uuid.uuid4().hex
        accepted = call("POST", "/inferences", body, idem=idem)
        result = poll(accepted["task_id"])
        out.write_bytes(base64.b64decode(result["base64_images"][0]))
        print(f"[{i}/{len(todo)}] {job['id']:<26} ${result.get('balance_cost', 0):.3f}  "
              f"余额 ${result.get('remaining_balance', '?')}  -> {out.relative_to(ROOT)}")


def block_downscale(path: Path, factor: int, cutout: bool):
    """整数倍降采样：每个 factor×factor 块取出现最多的颜色，保证像素网格不糊、不插值。
    factor=2/3 时这就是 RD 官方 k_centroid_downscale 的本地等价做法（免费）。"""
    from PIL import Image
    import numpy as np
    im = np.asarray(Image.open(path).convert("RGBA"))
    h, w = im.shape[:2]
    nh, nw = h // factor, w // factor
    im = im[:nh * factor, :nw * factor]
    blocks = im.reshape(nh, factor, nw, factor, 4).transpose(0, 2, 1, 3, 4).reshape(nh, nw, -1, 4)
    out = np.zeros((nh, nw, 4), np.uint8)
    for r in range(nh):
        for c in range(nw):
            px = blocks[r, c]
            if cutout:
                px = px[px[:, 3] > 127]          # 只统计不透明像素，避免白底污染边缘
                if len(px) == 0:
                    continue                     # 整块透明 → 保持透明
            vals, counts = np.unique(px, axis=0, return_counts=True)
            out[r, c] = vals[counts.argmax()]
    return out


def cluster_to_palette(spr, accent=None):
    """把 RD 的落位图压进 v4 的色板纪律：
    - 金属只留 B2（冷钴暗块）/ B3（冰银亮块）双阶，用右上 3/4 受光平面做二分并做四邻域去噪；
    - 彩色像素只吸附到该部件指定的 accent 色系，杜绝串色；
    - 若已用 input_palette 生成且完全合规，则原样返回（不破坏 RD 自身的像素排布）。
    """
    import numpy as np
    sys.path.insert(0, str(ROOT))
    from pixelkit import PAL_RGB, nearest, palette_audit

    if not palette_audit(spr):
        return spr, "原样（已合规）"

    a = spr[..., 3] > 0
    rgb = spr[..., :3].astype(np.float32)
    mx = rgb.max(-1) / 255.0
    mn = rgb.min(-1) / 255.0
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    colored = a & (sat > 0.42) & (mx > 0.5)
    if accent:
        colored &= a
    grey = a & ~colored

    out = spr.copy()
    if grey.any():
        lum = (rgb @ np.array([0.299, 0.587, 0.114], np.float32)) / 255.0
        h, w = a.shape
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        plane = (1.0 - yy / max(h - 1, 1)) * 0.65 + (xx / max(w - 1, 1)) * 0.35
        score = 0.5 * lum + 0.5 * plane
        lit = grey & (score >= np.median(score[grey]))
        out[grey, :3] = PAL_RGB["B2"]
        out[lit, :3] = PAL_RGB["B3"]
    if colored.any() and accent:
        out[colored, :3] = nearest(rgb[colored], accent)
    elif colored.any():
        out[colored, :3] = PAL_RGB["B2"]     # 无 accent 的部件一律去色，保持"只有 1~2 颗霓虹"的纪律
    return out, "聚色"


def crop_to_multiple(path: Path, f: int, tw: int, th: int):
    """源图不是目标尺寸整数倍时（例如 rd_fast 强制 64），居中裁到 f*tw × f*th。"""
    from PIL import Image
    import numpy as np
    im = np.asarray(Image.open(path).convert("RGBA"))
    h, w = im.shape[:2]
    cw, ch = f * tw, f * th
    if w < cw or h < ch:
        return im
    x0, y0 = (w - cw) // 2, (h - ch) // 2
    return im[y0:y0 + ch, x0:x0 + cw]


def cmd_promote(args):
    import numpy as np
    from PIL import Image
    sys.path.insert(0, str(ROOT))
    from pixelkit import add_corner_marks, despeckle_tile, palette_audit, tile_quantize

    PARTS.mkdir(parents=True, exist_ok=True)
    TILES.mkdir(parents=True, exist_ok=True)
    bad_all, rows = set(), []
    for job in targets():
        src = SRC_RD / f"{job['id']}.png"
        if not src.exists():
            print(f"  缺源图 {job['id']}（先跑 gen）")
            continue
        tw, th = job["target"]
        with Image.open(src) as _im:
            gw, gh = _im.size          # 用实际源图尺寸，兼容 min_cost_dim 放大过的批次
        mode = "—"
        if job["kind"] == "tile":
            f = max(1, min(gw // tw, gh // th))
            if gw % tw or gh % th:
                cropped = ROOT / "src-rd" / "_crop.png"
                from PIL import Image as _I
                _I.fromarray(crop_to_multiple(src, f, tw, th), "RGBA").save(cropped)
                src = cropped
            spr = block_downscale(src, f, cutout=False)
            if args.cluster:
                # 按地块类型锁子集 → 吸附 → 去雪花噪点 → 补 2×2 L 角标（与 v4 完全一致）
                keys = TILE_KEYS.get(job["id"], ["E0", "E1", "E2"])
                name = job["id"] if job["id"] != "tile_ceiling_light" else ""
                spr = tile_quantize(spr[..., :3].astype(np.float32), keys, clean=True)
                if name:
                    spr = add_corner_marks(spr)
                mode = "锁子集"
            dst = TILES / f"tile_{job['id'].removeprefix('tile_')}.png"
        else:
            f = max(1, min(gw // tw, gh // th))
            if gw % f or gh % f:
                from PIL import Image as _I
                cw, ch = (gw // f) * f, (gh // f) * f
                cropped = ROOT / "src-rd" / "_crop.png"
                _I.fromarray(crop_to_multiple(src, f, cw // f, ch // f), "RGBA").save(cropped)
                src = cropped
            spr = block_downscale(src, f, cutout=True)
            if args.cluster:
                spr, mode = cluster_to_palette(spr, job.get("accent"))
            dst = PARTS / f"{job['id']}.png"
        Image.fromarray(spr, "RGBA").save(dst)
        bad = palette_audit(spr)
        bad_all |= bad
        opaque = int((spr[..., 3] > 0).sum())
        colors = len(np.unique(spr[spr[..., 3] > 0][:, :3], axis=0)) if opaque else 0
        rows.append((job["id"], f"{spr.shape[1]}×{spr.shape[0]}", f"÷{f}", colors, opaque, len(bad), mode))

    print(f"\n{'id':<26} {'尺寸':<8} {'倍率':<5} {'色数':<5} {'不透明像素':<10} {'调色板外':<8} 模式")
    for r in rows:
        print(f"{r[0]:<26} {r[1]:<8} {r[2]:<5} {r[3]:<5} {r[4]:<10} {r[5]:<8} {r[6]}")
    if bad_all:
        print(f"\n⚠ {len(bad_all)} 个调色板外颜色，需要跑量化（或换成 input_palette 生成）：")
        for c in sorted(bad_all)[:12]:
            print("  ", c)
    else:
        print("\n✓ 全部落在锁定 24 色板内")


def main():
    ap = argparse.ArgumentParser(description="Cyber-X × Retro Diffusion")
    sub = ap.add_subparsers(dest="cmd", required=True)
    sub.add_parser("styles").set_defaults(fn=cmd_styles)
    sub.add_parser("balance").set_defaults(fn=cmd_balance)

    c = sub.add_parser("cost"); c.add_argument("--draft", action="store_true"); c.set_defaults(fn=cmd_cost)

    g = sub.add_parser("gen")
    g.add_argument("--only", nargs="*")
    g.add_argument("--draft", action="store_true", help="改用 rd_fast__default 起草")
    g.add_argument("--palette", action="store_true", help="地块带 input_palette 锁 24 色")
    g.add_argument("--force", action="store_true", help="覆盖已存在的输出")
    g.set_defaults(fn=cmd_gen)

    p = sub.add_parser("promote")
    p.add_argument("--cluster", action="store_true", default=True,
                   help="落位后压进 24 色板（默认开；--no-cluster 关闭）")
    p.add_argument("--no-cluster", dest="cluster", action="store_false")
    p.set_defaults(fn=cmd_promote)

    args = ap.parse_args()
    args.fn(args)


if __name__ == "__main__":
    main()
