"""步骤 1：从 3/4 灵动 AI 源图中切出部件与地块，执行 24 色色相偏移量化与双阶色块归并（去噪），输出到 build/。"""
import json
import os

import numpy as np

from pixelkit import (BUILD, PAL_RGB, SRC, add_corner_marks, cluster_part, downscale_part,
                      find_parts, load, quantize_part, save_rgba, tile_quantize)

ARM_NAMES = ["plain", "shock_baton", "power_fist", "hf_blade", "hf_blade_orange", "emp_cannon", "plasma_rifle", "data_spike"]
LEG_NAMES = ["biped", "treads", "hover", "reverse_joint", "spider", "boss_stomper"]
CHEST_NAMES = ["security", "enforcer", "drone", "hacker", "boss", "worker"]
HEAD_NAMES = ["security_visor", "enforcer_helm", "drone_eye", "hacker_optic", "boss_horned", "worker"]

PROP_SPECS = [("cargo_pod", (12, 12), 1.0), ("heat_sink", (12, 12), 1.0), ("scrap_arm", (16, 10), 1.0),
              ("pipe_burst", (14, 9), 1.0), ("flame", (10, 12), 1.0)]

# 平静暗色环境子集（地面仅用 E1+E2，明度 ≤19%，彻底消除背景碎噪点）
FLOOR_ENV = ["E1", "E2"]
DARK_ENV = ["E0", "E1", "E2"]
TILE_SPECS = [
    ("floor", FLOOR_ENV),
    ("wall_neon", DARK_ENV + ["E6", "ST", "CY"]),
    ("water", FLOOR_ENV + ["WA", "WAL"]),
    ("ice", ["E2", "IC", "ICL"]),
    ("scorch", DARK_ENV + ["SC", "FI", "OR", "ORL"]),
    ("pipe_burst", FLOOR_ENV + ["B2", "B3", "IC", "ICL", "WB"]),
    ("window_iso", ["E0", "E1", "E2", "WAL", "CY", "WB", "RDD"]),
    ("electrified", DARK_ENV + ["WAL", "CY", "WB"]),
]

TILE_GAIN = {"ice": 0.72, "pipe_burst": 0.8}


def bevel(tile):
    """墙体倒角：顶边 1px 亮边 + 底边 2px 投影。"""
    t = tile.copy()
    t[0, :, :3] = PAL_RGB["ST"]
    t[1, 1:-1, :3] = PAL_RGB["E6"]
    t[-2:, :, :3] = PAL_RGB["E0"]
    t[:, 0, :3] = PAL_RGB["E0"]
    t[:, -1, :3] = PAL_RGB["E0"]
    return t


def ice_streaks(tile):
    """补 2 道干净的斜向镜面高光。"""
    t = tile.copy()
    ic = np.array(PAL_RGB["IC"])
    for c, (a, b) in ((6, (4, 11)), (15, (9, 18))):
        for x in range(a, b):
            y = x - c + 10
            if 0 <= y < 24 and (t[y, x, :3] == ic).all():
                t[y, x, :3] = PAL_RGB["ICL"]
    return t


def extract_arms():
    """3/4 斜向持械手臂：单部件锁死唯一焦点色系，纯枪灰副手不带杂色点。"""
    rgb = load(os.path.join(SRC, "src-agile-arms.jpg"))
    rows, fg = find_parts(rgb)
    assert len(rows[0]) == len(ARM_NAMES)
    arm_specs = [
        ("plain",           (6, 6), 0.34, 0.12, 0, None),            # 纯钢灰副手，零杂色
        ("shock_baton",     (7, 6), 0.30, 0.08, 2, ["CY"]),          # 纯电青棍头
        ("power_fist",      (6, 6), 0.36, 0.10, 8, ["OR", "ORL"]),   # 暖金橙液压拳套
        ("hf_blade",        (8, 7), 0.11, 0.05, None, ["CY", "WB"]), # 斜举青色高频太刀
        ("hf_blade_orange", (8, 7), 0.11, 0.05, None, ["OR", "ORL"]),# 斜举橙金传奇太刀
        ("emp_cannon",      (6, 6), 0.34, 0.09, 2, ["CY"]),          # EMP 枪口青光
        ("plasma_rifle",    (7, 6), 0.32, 0.09, 2, ["GR"]),          # 等离子绿准星
        ("data_spike",      (7, 6), 0.28, 0.08, 2, ["GR"]),          # 骇客数据刺绿尖
    ]
    out = {}
    for (name, tgt, ct, nt, mnp, akeys), box in zip(arm_specs, rows[0]):
        col, alpha, neon = downscale_part(rgb, fg, box, target=tgt, xstretch=1.0, cov_thr=ct, neon_thr=nt, max_neon_px=mnp)
        spr = cluster_part(col, alpha, neon, accent_keys=akeys, light_bias=0.45)
        if name in ("hf_blade", "hf_blade_orange"):
            bcol = PAL_RGB["CY" if name == "hf_blade" else "OR"]
            hcol = PAL_RGB["WB" if name == "hf_blade" else "ORL"]
            h_s, w_s = spr.shape[:2]
            spr[:, :] = 0
            for yy, xx, ck in ((1, 0, "B3"), (1, 1, "B3"), (2, 0, "B2"), (2, 1, "B3"), (3, 1, "B2"), (3, 2, "B3"), (4, 2, "B2")):
                spr[yy, xx] = (*PAL_RGB[ck], 255)
            for i_p, (bx, by) in enumerate([(3, 4), (4, 3), (5, 2), (6, 1), (7, 0)]):
                spr[by, bx] = (*(hcol if i_p >= 3 else bcol), 255)
                if by + 1 < h_s and i_p < 4:
                    spr[by + 1, bx] = (*bcol, 255)
        path = os.path.join(BUILD, "parts", f"arm_{name}.png")
        save_rgba(spr, path)
        out[name] = {"file": os.path.relpath(path, BUILD), "size": [spr.shape[1], spr.shape[0]], "src_box": list(map(int, box))}
    return out


def extract_chests_and_heads():
    """3/4 收腰倒梯形胸腔 + 富有辨识度的大头盔比例，单部件严格 2 阶钢灰 + 1~2px 纯色焦点。"""
    rgb = load(os.path.join(SRC, "src-agile-chassis.jpg"))
    rows, fg = find_parts(rgb)
    assert len(rows[0]) == len(CHEST_NAMES) and len(rows[1]) == len(HEAD_NAMES)
    chest_specs = [
        ("security", (6, 5), 1.15, ["CY"]),
        ("enforcer", (8, 5), 1.25, ["CY"]),
        ("drone",    (6, 5), 1.10, ["CY"]),
        ("hacker",   (5, 5), 1.10, ["GR"]),
        ("boss",     (9, 6), 1.20, ["RD"]),
        ("worker",   (6, 5), 1.15, ["ORL"]),
    ]
    head_specs = [
        ("security_visor", (5, 5), 1.10, 2, ["RD"]),
        ("enforcer_helm",  (5, 4), 1.15, 2, ["OR"]),
        ("drone_eye",      (5, 4), 1.10, 2, ["CY"]),
        ("hacker_optic",   (5, 5), 1.10, 2, ["GR"]),
        ("boss_horned",    (6, 5), 1.15, 2, ["RD"]),
        ("worker",         (5, 4), 1.15, 2, ["ORL"]),
    ]
    chests, heads = {}, {}
    for (name, tgt, xs, akeys), box in zip(chest_specs, rows[0]):
        c, a, ne = downscale_part(rgb, fg, box, target=tgt, xstretch=xs, cov_thr=0.36, neon_thr=0.08, max_neon_px=2)
        spr = cluster_part(c, a, ne, accent_keys=akeys, light_bias=0.50)
        path = os.path.join(BUILD, "parts", f"chest_{name}.png")
        save_rgba(spr, path)
        chests[name] = {"file": os.path.relpath(path, BUILD), "size": [spr.shape[1], spr.shape[0]]}
    for (name, tgt, xs, mnp, akeys), box in zip(head_specs, rows[1]):
        c, a, ne = downscale_part(rgb, fg, box, target=tgt, xstretch=xs, cov_thr=0.36, neon_thr=0.08, max_neon_px=mnp)
        spr = cluster_part(c, a, ne, accent_keys=akeys, light_bias=0.55)
        path = os.path.join(BUILD, "parts", f"head_{name}.png")
        save_rgba(spr, path)
        heads[name] = {"file": os.path.relpath(path, BUILD), "size": [spr.shape[1], spr.shape[0]]}
    return chests, heads


def extract_legs():
    """灵动前后错步下肢：远端后腿整块平涂 B2 暗钢并抬高 1px，近端前跨腿整块平涂 B3 亮钢，零内部碎点！"""
    rgb_l1 = load(os.path.join(SRC, "src-legs.jpg"))
    rl1, fgl1 = find_parts(rgb_l1)
    rgb_l2 = load(os.path.join(SRC, "src-agile-legs.jpg"))
    rl2, fgl2 = find_parts(rgb_l2)
    rgb_lv2 = load(os.path.join(SRC, "src-legs-v2.jpg"))
    rlv2, fglv2 = find_parts(rgb_lv2)

    parts = {}

    # 1. biped: 精悍 7×6 错步双足
    c, a, ne = downscale_part(rgb_l1, fgl1, rl1[0][0], target=(7, 6), xstretch=2.0, cov_thr=0.32, max_neon_px=0)
    sp = cluster_part(c, a, ne)
    sp[-1, :3] = 0
    sp[:, :3][sp[:, :3, 3] > 0, :3] = PAL_RGB["B2"]
    sp[:, 3:][sp[:, 3:, 3] > 0, :3] = PAL_RGB["B3"]
    sp[0, :][sp[0, :, 3] > 0, :3] = PAL_RGB["B2"]
    parts["biped"] = sp

    # 2. treads: 紧凑前倾 11×5 履带（上沿 B3 装甲裙板，下沿 B2 履带 + 2 颗 B3 滚轮点簇）
    c, a, ne = downscale_part(rgb_l2, fgl2, rl2[0][1], target=(11, 5), xstretch=1.05, cov_thr=0.38, max_neon_px=0)
    sp = cluster_part(c, a, ne)
    sp[:2][sp[:2, :, 3] > 0, :3] = PAL_RGB["B3"]
    sp[2:][sp[2:, :, 3] > 0, :3] = PAL_RGB["B2"]
    for wx in (3, 7):
        if sp[-2, wx, 3] > 0:
            sp[-2, wx:wx + 2, :3] = PAL_RGB["B3"]
    parts["treads"] = sp

    # 3. hover: 小巧 7×6 悬浮喷口（纯 CY 电青尾焰）
    c, a, ne = downscale_part(rgb_l2, fgl2, rl2[0][2], target=(7, 6), xstretch=1.1, cov_thr=0.34, neon_thr=0.06, max_neon_px=4)
    parts["hover"] = cluster_part(c, a, ne, accent_keys=["CY"], light_bias=0.55)

    # 4. reverse_joint: 7×7 折线逆足弹跳腿（远腿 B2 / 近腿 B3 整块区分）
    c, a, ne = downscale_part(rgb_l1, fgl1, rl1[0][3], target=(7, 7), xstretch=2.1, cov_thr=0.32, max_neon_px=0)
    sp = cluster_part(c, a, ne)
    sp[-1, :3] = 0
    sp[:, :3][sp[:, :3, 3] > 0, :3] = PAL_RGB["B2"]
    sp[:, 3:][sp[:, 3:, 3] > 0, :3] = PAL_RGB["B3"]
    sp[0, :][sp[0, :, 3] > 0, :3] = PAL_RGB["B2"]
    parts["reverse_joint"] = sp

    # 5. spider: 低趴灵巧 13×6 四足底盘（左侧远足 B2，右侧近足 B3）
    c, a, ne = downscale_part(rgb_l2, fgl2, rl2[0][4], target=(13, 6), xstretch=1.05, cov_thr=0.26, max_neon_px=0)
    sp = cluster_part(c, a, ne, light_bias=0.55)
    sp[:, :6][sp[:, :6, 3] > 0, :3] = PAL_RGB["B2"]
    sp[:, 6:][sp[:, 6:, 3] > 0, :3] = PAL_RGB["B3"]
    parts["spider"] = sp

    # 6. boss_stomper: 高大威猛 11×8 阔步首领重腿（远腿 B2 / 近腿 B3）
    c, a, ne = downscale_part(rgb_lv2, fglv2, rlv2[0][5], target=(11, 8), xstretch=1.15, cov_thr=0.40, max_neon_px=0)
    sp = cluster_part(c, a, ne)
    mid = sp.shape[1] // 2
    sp[2:, mid - 1:mid + 1] = 0
    sp[-1, :mid] = 0
    sp[:, :mid][sp[:, :mid, 3] > 0, :3] = PAL_RGB["B2"]
    sp[:, mid:][sp[:, mid:, 3] > 0, :3] = PAL_RGB["B3"]
    sp[0, :][sp[0, :, 3] > 0, :3] = PAL_RGB["B2"]
    parts["boss_stomper"] = sp

    out = {}
    for name in LEG_NAMES:
        sp = parts[name]
        path = os.path.join(BUILD, "parts", f"legs_{name}.png")
        save_rgba(sp, path)
        out[name] = {"file": os.path.relpath(path, BUILD), "size": [sp.shape[1], sp.shape[0]]}
    return out


def find_grid_cells(rgb, thr=14):
    lum = rgb.mean(-1)

    def runs(profile):
        on = profile > thr
        cells, start = [], None
        for i, v in enumerate(on):
            if v and start is None:
                start = i
            if not v and start is not None:
                if i - start > 40:
                    cells.append((start, i))
                start = None
        if start is not None and len(on) - start > 40:
            cells.append((start, len(on)))
        return cells

    return runs(lum.mean(0)), runs(lum.mean(1))


def extract_tiles():
    from PIL import Image
    rgb = load(os.path.join(SRC, "src-tiles.jpg"))
    cols, rows = find_grid_cells(rgb)
    assert len(cols) == 4 and len(rows) == 2
    out = {}
    for i, (name, keys) in enumerate(TILE_SPECS):
        (x0, x1), (y0, y1) = cols[i % 4], rows[i // 4]
        side = min(x1 - x0, y1 - y0) - 6
        cx, cy = (x0 + x1) // 2, (y0 + y1) // 2
        crop = rgb[cy - side // 2: cy + side // 2, cx - side // 2: cx + side // 2]
        small = np.asarray(Image.fromarray(crop.astype(np.uint8)).resize((24, 24), Image.BOX)).astype(np.float32)
        small *= TILE_GAIN.get(name, 1.0)
        tile = tile_quantize(small, keys, clean=True)
        if name == "ice":
            tile = ice_streaks(tile)
        if not name.startswith("window"):
            tile = add_corner_marks(tile)
        if name.startswith("wall"):
            tile = bevel(tile)
        path = os.path.join(BUILD, "tiles", f"tile_{name}.png")
        save_rgba(tile, path)
        out[name] = {"file": os.path.relpath(path, BUILD), "src_cell": [int(x0), int(y0), int(x1), int(y1)]}
    return out


TILE2_SPECS = [
    ("window", ["E0", "E1", "E2", "ST", "WAL", "CY", "WB", "RDD", "GRD"]),
    ("window_cracked", ["E0", "E1", "E2", "ST", "WAL", "CY", "WB", "RDD", "GRD"]),
    ("wall", DARK_ENV + ["E6", "ST"]),
    ("vent", DARK_ENV),
]


def extract_tiles2():
    from PIL import Image
    rgb = load(os.path.join(SRC, "src-tiles-2.jpg"))
    lum = rgb.mean(-1)
    (_, (y0, y1)), = [(None, r) for r in find_grid_cells(rgb, thr=3)[1]]
    side = y1 - y0
    prof = lum[y0:y1].mean(0)
    starts = [x for x in range(8, len(prof)) if prof[x] > 3 and (prof[x - 8:x] <= 3).all()]
    assert len(starts) == 4
    runs = [r for r in find_grid_cells(rgb, thr=3)[0] if r[0] in starts and r[1] - r[0] > 0.8 * side]
    width = min(r[1] - r[0] for r in runs)
    out = {}
    for (name, keys), x0 in zip(TILE2_SPECS, starts):
        crop = rgb[y0 + 3:y1 - 3, x0 + 3:x0 + width - 3]
        small = np.asarray(Image.fromarray(crop.astype(np.uint8)).resize((24, 24), Image.BOX)).astype(np.float32)
        tile = tile_quantize(small, keys, clean=True)
        if not name.startswith("window"):
            tile = add_corner_marks(tile)
        if name.startswith("wall"):
            tile = bevel(tile)
        path = os.path.join(BUILD, "tiles", f"tile_{name}.png")
        save_rgba(tile, path)
        out[name] = {"file": os.path.relpath(path, BUILD), "src_x": int(x0), "src_y": [int(y0), int(y1)]}
    return out


PROP_KEYS = {
    "cargo_pod": ["OR", "ORL", "ORD", "SC"],
    "heat_sink": ["IC", "ICL", "WAL", "WB"],
}


def extract_props():
    rgb = load(os.path.join(SRC, "src-props.jpg"))
    rows, fg = find_parts(rgb)
    assert len(rows[0]) == len(PROP_SPECS)
    out = {}
    for (name, target, xs), box in zip(PROP_SPECS, rows[0]):
        col, alpha, neon = downscale_part(rgb, fg, box, target=target, xstretch=xs, cov_thr=0.45)
        spr = quantize_part(col, alpha, neon, outline=True, color_keys=PROP_KEYS.get(name))
        path = os.path.join(BUILD, "parts", f"prop_{name}.png")
        save_rgba(spr, path)
        out[name] = {"file": os.path.relpath(path, BUILD), "size": [spr.shape[1], spr.shape[0]]}
    return out


def extract_lineup():
    rgb = load(os.path.join(SRC, "src-lineup.jpg"))
    rows, fg = find_parts(rgb, dilate=22)
    out = {}
    for i, box in enumerate(rows[0]):
        col, alpha, neon = downscale_part(rgb, fg, box, target=(20, 22), xstretch=1.0, cov_thr=0.45)
        spr = quantize_part(col, alpha, neon, outline=True)
        path = os.path.join(BUILD, "parts", f"lineup_{i}.png")
        save_rgba(spr, path)
        out[f"lineup_{i}"] = {"file": os.path.relpath(path, BUILD), "size": [spr.shape[1], spr.shape[0]]}
    return out


if __name__ == "__main__":
    chests, heads = extract_chests_and_heads()
    manifest = {
        "arms": extract_arms(),
        "legs": extract_legs(),
        "chests": chests,
        "heads": heads,
        "props": extract_props(),
        "tiles": {**extract_tiles(), **extract_tiles2()},
        "lineup": extract_lineup(),
    }
    with open(os.path.join(BUILD, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=1, ensure_ascii=False)
    print("parts:", sum(len(v) for v in manifest.values()))
