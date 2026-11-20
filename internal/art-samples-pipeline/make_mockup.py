"""步骤 5：1920×1080 战斗场景 combat-scene-mockup.png。
底层：原生 24×24 地块 + 20×22 单位拼成 240×168 棋盘 → 6× 最近邻（硬边像素）。
顶层：1080p 原生分辨率的平滑点光源、电弧、Bloom、暗角，以及不受光照的明牌 UI（意图 / 位移预览）。"""
import math
import os
import random

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

from pixelkit import BUILD, NEON_KEYS, OUT, PAL_RGB, font, load_rgba, paste, text, up
from rig import severed_prop, unit

S = 6                     # 原生像素 → 屏幕像素
T = 24 * S                # 一格 144px
COLS, ROWS = 10, 7
OX, OY = 28, 52           # 棋盘左上角
SW, SH = 1920, 1080

# 地图：W 墙 N 霓虹墙 F 地面 V 通风 s 焦痕 P 爆裂冷却管 I 冰 w 积水 E 电击地板 G 落地窗 X 破裂窗
MAP = [
    "WWWNFFssFG",
    "WFFFFVFsFG",
    "FFFFFPFFFG",
    "FFFFFIIIIG",
    "FFFFFFFFFG",
    "EwFwFFFFFX",
    "FFFFVFFFFG",
]
TILE_OF = {"W": "wall", "N": "wall_neon", "F": "floor", "V": "vent", "s": "scorch", "P": "pipe_burst",
           "I": "ice", "w": "water", "E": "electrified", "G": "window", "X": "window_cracked"}

UNITS = [  # (单位, 列, 行, 朝左?)
    ("player", 4, 3, False),
    ("boss", 5, 3, True),
    ("grunt", 3, 5, True),
    ("hacker", 1, 2, False),
    ("drone", 7, 1, True),
    ("enforcer", 7, 5, True),
]


def tile(name):
    return load_rgba(os.path.join(BUILD, "tiles", f"tile_{name}.png"))


def center(c, r, dy=0.0):
    return (OX + c * T + T / 2, OY + r * T + T / 2 + dy * T)


def build_board():
    nat = np.zeros((ROWS * 24, COLS * 24, 4), np.uint8)
    for r, row in enumerate(MAP):
        for c, ch in enumerate(row):
            nat[r * 24:(r + 1) * 24, c * 24:(c + 1) * 24] = tile(TILE_OF[ch])
    flame = load_rgba(os.path.join(BUILD, "parts", "prop_flame.png"))
    for c in (6, 7):
        paste(nat, flame, c * 24 + 7, 0 * 24 + 6)
    paste(nat, flame, 7 * 24 + 7, 1 * 24 + 6)
    arm = severed_prop("plain")
    paste(nat, arm, 2 * 24 + 6, 5 * 24 + 10)
    pod = load_rgba(os.path.join(BUILD, "parts", "prop_cargo_pod.png"))
    paste(nat, pod, 8 * 24 + 6, 4 * 24 + 6)
    for name, c, r, flip in UNITS:
        spr, _ = unit(name)
        paste(nat, spr, c * 24 + 2, r * 24 + 1, flip=flip)
    return nat


def emissive_mask(nat):
    """霓虹调色板像素 = 自发光，光照后保持满亮并参与 Bloom。"""
    m = np.zeros(nat.shape[:2], bool)
    for k in NEON_KEYS:
        m |= (nat[..., :3] == PAL_RGB[k]).all(-1) & (nat[..., 3] > 0)
    return m


def radial(light, x, y, rgb, radius, power):
    h, w = light.shape[:2]
    x0, x1 = int(max(0, x - radius * 2.2)), int(min(w, x + radius * 2.2))
    y0, y1 = int(max(0, y - radius * 2.2)), int(min(h, y + radius * 2.2))
    if x1 <= x0 or y1 <= y0:
        return
    yy, xx = np.mgrid[y0:y1, x0:x1].astype(np.float32)
    f = np.exp(-(((xx - x) ** 2 + (yy - y) ** 2) / (radius ** 2))) * power
    light[y0:y1, x0:x1] += f[..., None] * (np.array(rgb, np.float32) / 255.0)


def jagged(points, rng, amp=14, seg=18):
    out = []
    for (x0, y0), (x1, y1) in zip(points, points[1:]):
        n = max(2, int(math.hypot(x1 - x0, y1 - y0) / seg))
        for i in range(n):
            t = i / n
            j = 0 if i == 0 else rng.uniform(-amp, amp)
            nx, ny = -(y1 - y0), (x1 - x0)
            l = math.hypot(nx, ny) or 1
            out.append((x0 + (x1 - x0) * t + nx / l * j, y0 + (y1 - y0) * t + ny / l * j))
    out.append(points[-1])
    return out


def blur(arr, sigma, down=4):
    h, w = arr.shape[:2]
    small = Image.fromarray(np.clip(arr * 255 / 4, 0, 255).astype(np.uint8)).resize((w // down, h // down), Image.BILINEAR)
    small = small.filter(ImageFilter.GaussianBlur(sigma / down))
    return np.asarray(small.resize((w, h), Image.BILINEAR)).astype(np.float32) * 4 / 255


def arrow(d: ImageDraw.ImageDraw, pts, fill, width=16, head=34, outline=(5, 6, 10)):
    """《陷阵之志》式粗箭头：黑描边 + 实心箭身 + 三角箭头。"""
    for wdt, col in ((width + 8, outline), (width, fill)):
        d.line(pts[:-1] + [_back(pts[-2], pts[-1], head * 0.6)], fill=col, width=wdt, joint="curve")
    (x0, y0), (x1, y1) = pts[-2], pts[-1]
    a = math.atan2(y1 - y0, x1 - x0)
    tri = [(x1, y1), (x1 - head * math.cos(a) + head * 0.62 * math.sin(a), y1 - head * math.sin(a) - head * 0.62 * math.cos(a)),
           (x1 - head * math.cos(a) - head * 0.62 * math.sin(a), y1 - head * math.sin(a) + head * 0.62 * math.cos(a))]
    d.polygon(tri, fill=fill, outline=outline, width=4)


def _back(p0, p1, dist):
    a = math.atan2(p1[1] - p0[1], p1[0] - p0[0])
    return (p1[0] - dist * math.cos(a), p1[1] - dist * math.sin(a))


def corners(d, c, r, col, ln=30, w=6, inset=6):
    x0, y0 = OX + c * T + inset, OY + r * T + inset
    x1, y1 = x0 + T - 2 * inset, y0 + T - 2 * inset
    for (x, y, sx, sy) in ((x0, y0, 1, 1), (x1, y0, -1, 1), (x0, y1, 1, -1), (x1, y1, -1, -1)):
        d.line([(x, y), (x + sx * ln, y)], fill=col, width=w)
        d.line([(x, y), (x, y + sy * ln)], fill=col, width=w)


def badge(d, xy, s, bg, fg=(10, 12, 18), size=22):
    f = font(size)
    tw = d.textlength(s, font=f)
    x, y = xy
    d.rounded_rectangle([x - tw / 2 - 10, y - size / 2 - 6, x + tw / 2 + 10, y + size / 2 + 8], radius=8, fill=bg, outline=(5, 6, 10), width=3)
    d.text((x - tw / 2, y - size / 2 - 2), s, font=f, fill=fg)


def main():
    rng = random.Random(7)
    nat = build_board()
    big = np.asarray(up(Image.fromarray(nat), S)).astype(np.float32) / 255.0
    emis = np.asarray(up(Image.fromarray(emissive_mask(nat).astype(np.uint8) * 255), S)) > 0

    canvas = np.zeros((SH, SW, 3), np.float32)
    canvas[...] = np.array([7, 8, 13], np.float32) / 255
    bh, bw = big.shape[:2]
    canvas[OY:OY + bh, OX:OX + bw] = big[..., :3]
    emis_full = np.zeros((SH, SW), bool)
    emis_full[OY:OY + bh, OX:OX + bw] = emis

    # ---- 1080p 平滑光照层 ----
    light = np.zeros((SH, SW, 3), np.float32)
    for r in range(ROWS):  # 落地窗外的霓虹城市光
        x, y = center(9, r)
        radial(light, x + 40, y, PAL_RGB["CY"], 170, 0.55)
    for (c, r) in ((6, 0), (7, 0), (7, 1)):  # 火焰
        x, y = center(c, r)
        radial(light, x, y, PAL_RGB["FI"], 150, 0.6)
        radial(light, x, y - 10, PAL_RGB["ORL"], 50, 0.3)
    for c in range(5, 9):  # 冰面冷光
        x, y = center(c, 3)
        radial(light, x, y, PAL_RGB["ICL"], 110, 0.28)
    x, y = center(5, 2)
    radial(light, x, y, PAL_RGB["WB"], 120, 0.45)  # 冷却管冰雾
    reactor = {"player": "ORL", "boss": "RD", "grunt": "CY", "hacker": "GR", "drone": "CY", "enforcer": "CY"}
    for name, c, r, _ in UNITS:
        x, y = center(c, r, dy=-0.05)
        radial(light, x, y, PAL_RGB[reactor[name]], 100 if name != "boss" else 170, 0.3 if name != "boss" else 0.6)
    radial(light, *center(1, 2, -0.25), PAL_RGB["GR"], 60, 0.9)  # 骇客义眼

    # 电弧：电击地板 → 积水 → 断臂桥 → 积水 → 站在水里的安保步兵
    arc_pts = [center(0, 5), center(1, 5, 0.1), center(2, 5, 0.12), center(3, 5, 0.1), center(3, 5, -0.15)]
    arcs = [jagged(arc_pts, rng, amp=16) for _ in range(3)]
    for p in arc_pts:
        radial(light, *p, PAL_RGB["CY"], 110, 0.55)
        radial(light, *p, PAL_RGB["WB"], 36, 0.3)

    ambient = 0.58
    lit = canvas * (ambient + 1.1 * (1 - np.exp(-light)))
    lit = np.where(emis_full[..., None], np.maximum(lit, canvas * 1.2), lit)

    # 电弧本体（高清抗锯齿线，叠加在像素层之上）
    arc_layer = Image.new("RGB", (SW, SH), (0, 0, 0))
    ad = ImageDraw.Draw(arc_layer)
    for i, pts in enumerate(arcs):
        ad.line(pts, fill=(30, 130, 210) if i else (70, 200, 255), width=7 if i == 0 else 3, joint="curve")
    for pts in arcs[:1]:
        ad.line(pts, fill=(235, 250, 255), width=3, joint="curve")
    for _ in range(24):  # 1px 物理火花（像素尺度）
        px, py = rng.choice(arc_pts)
        sx, sy = px + rng.uniform(-50, 50), py + rng.uniform(-50, 40)
        ad.rectangle([sx // S * S, sy // S * S, sx // S * S + S - 1, sy // S * S + S - 1], fill=(214, 247, 255))
    arc_arr = np.asarray(arc_layer).astype(np.float32) / 255
    lit = lit + arc_arr * 0.85

    # Bloom：多半径高斯叠加
    bright = np.clip(lit - 0.8, 0, None) + arc_arr * 0.35 + emis_full[..., None] * canvas * 0.6
    bloom = blur(bright, 8, 2) * 0.55 + blur(bright, 26, 4) * 0.45 + blur(bright, 70, 8) * 0.35
    lit = lit + bloom

    # 暗角 + 极淡扫描线（12% 级别只给质感，不压像素锐度）
    yy, xx = np.mgrid[0:SH, 0:SW].astype(np.float32)
    vig = 1 - 0.38 * (((xx - SW * 0.42) / (SW * 0.75)) ** 2 + ((yy - SH * 0.5) / (SH * 0.8)) ** 2)
    lit *= np.clip(vig, 0.55, 1)[..., None]
    lit[::3] *= 0.94

    out = Image.fromarray((np.clip(lit, 0, 1) * 255).astype(np.uint8))

    # ---- 最顶层：不受光照的明牌 UI ----
    ui = Image.new("RGBA", (SW, SH), (0, 0, 0, 0))
    d = ImageDraw.Draw(ui)
    # 位移落点的幽灵剪影
    boss_spr, _ = unit("boss")
    ghost = up(Image.fromarray(boss_spr[:, ::-1]), S)
    ga = np.asarray(ghost).copy()
    ga[..., :3] = (ga[..., :3] * 0.4 + np.array([159, 214, 240]) * 0.6).astype(np.uint8)
    ga[..., 3] = (ga[..., 3] > 0) * 110
    ui.alpha_composite(Image.fromarray(ga), (int(OX + 8 * T + 2 * S), int(OY + 3 * T + S)))
    # 玩家攻击意图：破拳 15
    corners(d, 4, 3, (82, 242, 150))
    arrow(d, [(center(4, 3)[0] + 54, center(4, 3)[1] + 8), (center(5, 3)[0] - 50, center(5, 3)[1] + 8)], (255, 214, 64), width=12, head=26)
    badge(d, center(4, 3, 0.62), "破拳 15", (255, 214, 64))
    # 冰面滑行 ×3 → 撞窗
    p0 = (center(5, 3)[0] + 58, center(5, 3, 0.28)[1])
    pts = [p0, center(6, 3, 0.28), center(7, 3, 0.28), center(8, 3, 0.28), (OX + 9 * T + 26, p0[1])]
    arrow(d, pts, (159, 214, 240), width=18, head=40)
    for i, c in enumerate((6, 7, 8), 1):
        badge(d, center(c, 3, -0.38), f"{i}", (159, 214, 240), size=20)
    badge(d, (center(7, 3)[0], center(7, 3, 0.5)[1] + 28), "冰面滑行 ×3", (159, 214, 240), size=22)
    # 破窗坠落警示
    wx, wy = center(9, 3)
    d.rounded_rectangle([wx - 62, wy - 70, wx + 62, wy + 70], radius=10, outline=(255, 51, 85), width=6)
    badge(d, (wx, wy - 20), "破窗", (255, 51, 85), fg=(255, 255, 255), size=22)
    badge(d, (wx, wy + 30), "坠落", (255, 51, 85), fg=(255, 255, 255), size=22)
    # Boss 锁定准星 + 橙装提示
    corners(d, 5, 3, (255, 51, 85), ln=34, w=7, inset=2)
    badge(d, (center(5, 3)[0], OY + 3 * T - 30), "橙装 · 右臂高频刃", (255, 154, 31), size=18)
    # 无人机 EMP 意图（敌方回合预告）
    dx, dy = center(7, 1)
    tx, ty = center(4, 2)
    d.line([(dx - 30, dy + 10), (tx + 20, ty - 6)], fill=(255, 51, 85), width=6)
    for k in range(6):
        t = k / 6
        d.ellipse([dx - 30 + (tx + 20 - dx + 30) * t - 6, dy + 10 + (ty - 6 - dy - 10) * t - 6,
                   dx - 30 + (tx + 20 - dx + 30) * t + 6, dy + 10 + (ty - 6 - dy - 10) * t + 6], fill=(255, 51, 85))
    d.rectangle([OX + 4 * T + 10, OY + 2 * T + 10, OX + 5 * T - 10, OY + 3 * T - 10], outline=(255, 51, 85), width=5)
    badge(d, (tx, ty - 30), "EMP 2", (255, 51, 85), fg=(255, 255, 255), size=18)
    # 导电连锁标注
    badge(d, (center(2, 5)[0], OY + 6 * T + 26), "导电：积水 → 断臂桥 → 积水", (62, 240, 255), size=18)
    badge(d, center(3, 5, -0.62), "麻痹", (62, 240, 255), size=18)

    # 顶栏
    d.rectangle([0, 0, SW, 40], fill=(8, 10, 16, 235))
    d.text((OX, 8), "CYBER-X  ·  80F 企业塔  ·  回合 3  ·  你的回合", font=font(20), fill=(220, 230, 245))
    d.text((OX + 900, 10), "[Z] 撤回本回合   [Alt] 义眼标签视图   [Space] 结束回合", font=font(16), fill=(130, 145, 170))

    # 右侧面板：目标 5 槽读数
    px = OX + COLS * T + 24
    d.rounded_rectangle([px, OY, SW - 20, SH - 24], radius=12, fill=(10, 13, 20, 235), outline=(44, 52, 72), width=2)
    d.text((px + 18, OY + 14), "目标：橙刃处刑者", font=font(24), fill=(255, 154, 31))
    d.text((px + 18, OY + 48), "HP 300 · 反应堆热量 86%（红温漏电）", font=font(15), fill=(255, 120, 140))
    port = up(Image.fromarray(boss_spr), 8)
    d.rounded_rectangle([px + 18, OY + 80, px + 18 + 176, OY + 80 + 192], radius=8, fill=(20, 24, 36))
    ui.alpha_composite(port, (px + 26, OY + 88))
    rows = [("右臂", "橙装高频刃", "100%", (255, 154, 31)), ("左臂", "液压破拳套", "72%", (190, 198, 214)),
            ("胸腔", "超频反应堆", "86°", (255, 51, 85)), ("下肢", "重装踏足", "90%", (190, 198, 214)),
            ("背部", "货舱 ×4 / 散热 0", "满载", (255, 154, 31))]
    for i, (slot, item, val, col) in enumerate(rows):
        y = OY + 86 + i * 38
        d.text((px + 210, y), slot, font=font(15), fill=(130, 145, 170))
        d.text((px + 252, y), item, font=font(15), fill=col)
        d.text((px + 210, y + 18), val, font=font(13, mono=True), fill=(150, 160, 180))
    y = OY + 300
    d.line([(px + 18, y), (SW - 38, y)], fill=(44, 52, 72), width=2)
    d.text((px + 18, y + 14), "明牌预览", font=font(20), fill=(235, 240, 250))
    preview = ["破拳 15 伤害 → 击退 1 格", "落在冰面 → 滑行 ×3", "撞破落地窗 → 坠落 80F",
               "结果：击杀 · 但橙装高频刃 0% 回收", "", "替代：把货舱扔到 (8,3) 垫刀", "→ 撞货舱眩晕，再用高频刃无损斩件"]
    for i, s in enumerate(preview):
        col = (255, 120, 140) if "0%" in s else (159, 214, 240) if i < 3 else (190, 198, 214)
        d.text((px + 18, y + 50 + i * 26), s, font=font(15), fill=col)
    y = OY + 560
    d.line([(px + 18, y), (SW - 38, y)], fill=(44, 52, 72), width=2)
    d.text((px + 18, y + 14), "四力 · 场上状态", font=font(20), fill=(235, 240, 250))
    forces = [("导电", "积水 ×2 + 断臂桥 → 安保步兵麻痹", (62, 240, 255)),
              ("极寒", "冷却管爆裂 → 4 格冰面", (159, 214, 240)),
              ("高热", "焦痕起火 ×3 · 无人机过热", (255, 90, 31)),
              ("动能", "冰面推力 ×3 · 落地窗脆弱", (255, 214, 64))]
    for i, (k, s, col) in enumerate(forces):
        yy2 = y + 52 + i * 34
        d.rounded_rectangle([px + 18, yy2, px + 72, yy2 + 24], radius=6, fill=col)
        d.text((px + 26, yy2 + 2), k, font=font(15), fill=(10, 12, 18))
        d.text((px + 84, yy2 + 2), s, font=font(15), fill=(190, 198, 214))
    y = OY + 760
    d.line([(px + 18, y), (SW - 38, y)], fill=(44, 52, 72), width=2)
    d.text((px + 18, y + 14), "你的背部：货舱 2 / 空 2", font=font(17), fill=(235, 240, 250))
    pl, _ = unit("player")
    ui.alpha_composite(up(Image.fromarray(pl), 5), (px + 18, y + 48))
    d.text((px + 130, y + 56), "热量 41%  琥珀", font=font(15), fill=(255, 210, 122))
    d.text((px + 130, y + 82), "主手 液压破拳套 · 副手 轻甲臂", font=font(15), fill=(190, 198, 214))
    d.text((px + 130, y + 108), "下肢 错步双足（轻巧突进）", font=font(15), fill=(190, 198, 214))
    d.text((px + 18, SH - 56), "样张 · AI 部件 + 代码合成 · 非实机截图", font=font(13), fill=(90, 100, 120))

    out = out.convert("RGBA")
    out.alpha_composite(ui)
    out.convert("RGB").save(os.path.join(OUT, "combat-scene-mockup.png"))
    print("combat-scene-mockup.png", out.size)


if __name__ == "__main__":
    main()
