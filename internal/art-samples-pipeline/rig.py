"""步骤 2：Caves+ v4 灵动微像素 × 极简色块归并五槽合成器（Nimble & Clustered Rig）。
核心设计：
1. 精巧留白与体型阶梯：普通人类级单位仅 13~15×16~17px（占 24×24 地格约 45% 面积），仅重装与 Boss 逐级放大至 19×20px；
2. 3/4 微侧身错步 + 斜向持械 + 肘下负空间留白，打破呆板对称铁桶感；
3. 单角色严控 4~6 色（含外轮廓 E0）：全身金属仅用 B2（冷钴暗块）+ B3（冰银亮块）双阶大色块平涂，合成后再跑整身色块去噪，实现 0 金属孤立碎点；
4. 背部微模块采用 2×2 纯色单块贴背挂载（橙 OR = 货舱，青 CY = 散热器，空槽不占体积），单角色焦点色高度收敛。"""
import os

import numpy as np
from scipy import ndimage

from pixelkit import (BUILD, NEON_SET, PAL_RGB, despeckle_binary, is_color_in,
                      load_rgba, wrap_exterior_outline)

W, H = 20, 22
BACK_COLORS = {
    "cargo": ["OR", "OR"],
    "sink": ["CY", "CY"],
    "empty": [None, None],
}


def part(kind, name):
    return load_rgba(os.path.join(BUILD, "parts", f"{kind}_{name}.png"))


def compose(head, chest, legs, arm_l, arm_r, back=("empty",) * 4, severed=(), reactor=None):
    """返回 20×22 RGBA 原生精灵与每个槽位的实际包围盒。"""
    can = np.zeros((H, W, 4), np.uint8)
    pid = np.zeros((H, W), np.uint8)  # 1=背部, 2=下肢, 3=胸腔, 4=头, 5=远端臂, 6=近端主武器臂
    boxes = {}

    def put_part(spr, x, y, p_id, key=None):
        h, w = spr.shape[:2]
        sx0, sy0 = max(0, -x), max(0, -y)
        dx0, dy0 = max(0, x), max(0, y)
        dx1, dy1 = min(W, x + w), min(H, y + h)
        if dx1 <= dx0 or dy1 <= dy0:
            return
        s = spr[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
        m = s[..., 3] > 0
        can[dy0:dy1, dx0:dx1][m] = s[m]
        pid[dy0:dy1, dx0:dx1][m] = p_id
        if key:
            ys_m, xs_m = np.nonzero(m)
            if ys_m.size:
                boxes[key] = (dx0 + int(xs_m.min()), dy0 + int(ys_m.min()),
                              dx0 + int(xs_m.max()) + 1, dy0 + int(ys_m.max()) + 1)

    lg = part("legs", legs)
    ch = part("chest", chest)
    hd = part("head", head)

    float_dy = 3 if legs == "hover" else 0
    foot_y = 20 - float_dy
    x_mid = 9

    ly = foot_y - lg.shape[0] + 1
    lx = x_mid - lg.shape[1] // 2
    cy = ly - ch.shape[0] + 1
    cx = x_mid - ch.shape[1] // 2
    hy = cy - hd.shape[0] + 1
    hx = x_mid - hd.shape[1] // 2 + (1 if chest != "drone" else 0)

    # 1. 贴背 2×2 纯色微模块（空槽零体积膨胀，不画 14px 肩扛横梁）
    pack_slots = [(cx - 2, cy), (cx - 2, cy - 2), (cx, cy - 3), (cx + ch.shape[1] - 1, cy - 2)]
    bxs, bys = [], []
    for (bx, by), kind in zip(pack_slots, back):
        bx, by = int(np.clip(bx, 1, W - 3)), int(np.clip(by, 1, H - 3))
        ck = BACK_COLORS[kind][0]
        if ck is not None:
            can[by:by + 2, bx:bx + 2] = (*PAL_RGB[ck], 255)
            pid[by:by + 2, bx:bx + 2] = 1
            bxs.extend([bx, bx + 2])
            bys.extend([by, by + 2])
    if bxs:
        boxes["back"] = (min(bxs), min(bys), max(bxs), max(bys))
    else:
        boxes["back"] = (cx - 2, max(1, cy - 2), cx, cy)

    # 2. 远端副手（arm_l）：整块平涂 B2 冷钴暗面压在侧后肩，建立干净前后景深
    if "arm_l" not in severed:
        al = part("arm", arm_l)[:, ::-1].copy()
        al_grey = (al[..., 3] > 0) & ~is_color_in(al, NEON_SET)
        al[al_grey, :3] = PAL_RGB["B2"]
        top_rows = np.where(al[:3, :, 3] > 0)
        piv_x = int(top_rows[1].max()) if top_rows[1].size else al.shape[1] - 1
        put_part(al, max(1, cx - piv_x + 1), cy, 5, "arm_l")
    else:
        sx = max(1, cx - 1)
        can[cy + 1, sx] = (*PAL_RGB["OR"], 255)
        pid[cy + 1, sx] = 5
        boxes["arm_l"] = (sx, cy + 1, sx + 1, cy + 2)

    # 3. 错步下肢 + 3px 收腰连接柱（不断腰、不臃肿）
    put_part(lg, lx, ly, 2, "legs")
    for xx in range(x_mid - 1, x_mid + 2):
        for yy in range(ly - 1, ly + 2):
            if 1 <= yy < H - 1 and pid[yy, xx] == 0:
                can[yy, xx] = (*PAL_RGB["B2"], 255)
                pid[yy, xx] = 2

    # 4. 收腰胸腔 + 2×1 纯色反应堆焦点
    put_part(ch, cx, cy, 3, "chest")
    if reactor:
        ry = cy + ch.shape[0] // 2
        can[ry, x_mid:x_mid + 2] = (*PAL_RGB[reactor], 255)
        pid[ry, x_mid:x_mid + 2] = 3

    # 5. 3/4 头部内嵌领口
    for xx in range(x_mid - 1, x_mid + 2):
        if pid[cy, xx] == 0:
            can[cy, xx] = (*PAL_RGB["B2"], 255)
            pid[cy, xx] = 3
    put_part(hd, hx, hy, 4, "head")

    # 6. 近端主武器手（arm_r）：顶部 2px 肩枢咬合，肘部以下斜向前伸留出负空间呼吸孔
    sh_r = cx + ch.shape[1] - 1
    if "arm_r" not in severed:
        ar = part("arm", arm_r)
        top_rows = np.where(ar[:3, :, 3] > 0)
        piv_x = int(top_rows[1].min()) if top_rows[1].size else 0
        arx = min(W - 1 - ar.shape[1], sh_r - piv_x)
        ary = cy + (0 if arm_r not in ("hf_blade", "hf_blade_orange") else -1)
        for bx_s in range(min(sh_r, arx + piv_x), max(sh_r, arx + piv_x) + 1):
            for by_s in (cy + 1, cy + 2):
                if 1 <= bx_s < W - 1 and 1 <= by_s < H - 1 and pid[by_s, bx_s] == 0:
                    can[by_s, bx_s] = (*PAL_RGB["B3"], 255)
                    pid[by_s, bx_s] = 6
        put_part(ar, arx, ary, 6, "arm_r")
    else:
        sx = min(W - 2, sh_r + 1)
        can[cy + 1, sx] = (*PAL_RGB["OR"], 255)
        pid[cy + 1, sx] = 6
        boxes["arm_r"] = (sx, cy + 1, sx + 1, cy + 2)

    # 7. 合成后整身金属二次色块归并：把拼接边界偶发的 1px 孤立明暗点全部并入相邻大色块（0 金属碎点！）
    b2 = (can[..., :3] == PAL_RGB["B2"]).all(-1) & (pid > 0)
    b3 = (can[..., :3] == PAL_RGB["B3"]).all(-1) & (pid > 0)
    metal = b2 | b3
    lit_clean = despeckle_binary(b3, metal, passes=3)
    can[metal & ~lit_clean, :3] = PAL_RGB["B2"]
    can[lit_clean, :3] = PAL_RGB["B3"]

    # 8. 干净统一的 1px E0 外部轮廓线 + 悬浮单位脚底微投影
    occ = pid > 0
    padded = np.pad(occ, 1, constant_values=False)
    empty_lab, _ = ndimage.label(~padded)
    ext_empty = (empty_lab == empty_lab[0, 0])[1:-1, 1:-1]
    ring = ndimage.binary_dilation(occ) & ext_empty
    can[ring] = (*PAL_RGB["E0"], 255)
    enclosed = (~occ) & (~ext_empty)
    can[enclosed] = (*PAL_RGB["B2"], 255)

    if float_dy > 0:
        can[21, x_mid - 2:x_mid + 2] = (*PAL_RGB["E0"], 255)

    return can, boxes


def severed_prop(arm_name):
    """斩落的手臂直接复用同一张手臂贴图，旋转 90° 平放并补 1px 外轮廓充当导电桥道具。"""
    rot = np.rot90(part("arm", arm_name), k=-1).copy()
    return wrap_exterior_outline(rot, pad=1)


# 单角色焦点色高度收敛（每个角色仅 4~6 色，含轮廓 E0 + 双阶冷钢 B2/B3 + 1~2 个纯色霓虹焦点）
UNITS = {
    "grunt": dict(head="security_visor", chest="security", legs="biped", arm_l="plain", arm_r="shock_baton",
                  back=("sink", "empty", "empty", "empty"), reactor="CY"),
    "enforcer": dict(head="enforcer_helm", chest="enforcer", legs="treads", arm_l="plain", arm_r="power_fist",
                     back=("sink", "sink", "empty", "empty"), reactor="CY"),
    "drone": dict(head="drone_eye", chest="drone", legs="hover", arm_l="emp_cannon", arm_r="emp_cannon",
                  back=("empty", "sink", "sink", "empty"), reactor="CY"),
    "hacker": dict(head="hacker_optic", chest="hacker", legs="reverse_joint", arm_l="plain", arm_r="data_spike",
                   back=("cargo", "empty", "empty", "empty"), reactor="GR"),
    "boss": dict(head="boss_horned", chest="boss", legs="boss_stomper", arm_l="power_fist", arm_r="hf_blade_orange",
                 back=("cargo", "cargo", "cargo", "cargo"), reactor="RD"),
    "sentry": dict(head="drone_eye", chest="enforcer", legs="spider", arm_l="emp_cannon", arm_r="hf_blade",
                   back=("sink", "empty", "empty", "sink"), reactor="CY"),
    "grunt_swap": dict(head="security_visor", chest="security", legs="treads", arm_l="plain", arm_r="hf_blade",
                       back=("sink", "empty", "empty", "empty"), reactor="CY"),
    "player": dict(head="worker", chest="worker", legs="biped", arm_l="plain", arm_r="power_fist",
                   back=("cargo", "cargo", "empty", "empty"), reactor="ORL"),
}


def unit(name, **over):
    spec = {**UNITS[name], **over}
    return compose(**spec)
