"""步骤 3：敌人表 enemies-sheet.png（v4 灵动微像素 × 24 色色相偏移 × 双阶平涂色块归并版）。"""
import os
from collections import Counter

import numpy as np
from PIL import Image, ImageDraw

from pixelkit import BUILD, OUT, PAL, PAL_RGB, load_rgba, palette_audit, paste, text, up
from rig import H, UNITS, W, severed_prop, unit

K = 8
SLOT_COL = {"back": (255, 255, 255), "head": (120, 130, 150), "chest": (59, 228, 255),
            "legs": (78, 245, 149), "arm_l": (255, 224, 102), "arm_r": (255, 120, 220)}
SLOT_CN = {"back": "背部×4", "chest": "胸腔", "legs": "下肢", "arm_l": "左臂", "arm_r": "右臂"}

BG = (9, 11, 18)
CARD_W, CARD_H = 470, 330


def floor_tile():
    return load_rgba(os.path.join(BUILD, "tiles", "tile_floor.png"))


def on_floor(spr, cols=1):
    fl = floor_tile()
    can = np.tile(fl, (1, cols, 1))
    paste(can, spr, (24 * cols - spr.shape[1]) // 2, 24 - spr.shape[0] - 1)
    return can


def slot_overlay(img8: Image.Image, boxes, ox, oy):
    d = ImageDraw.Draw(img8)
    for key, (x0, y0, x1, y1) in boxes.items():
        if key == "head":
            continue
        c = SLOT_COL[key]
        d.rectangle([(x0 + ox) * K, (y0 + oy) * K, (x1 + ox) * K - 1, (y1 + oy) * K - 1], outline=c, width=2)
    return img8


def color_count(spr):
    m = spr[..., 3] > 0
    return len(np.unique(spr[m][:, :3], axis=0))


def card(sheet, draw, cx, cy, title, sub, spr, boxes):
    draw.rounded_rectangle([cx, cy, cx + CARD_W - 12, cy + CARD_H - 12], radius=10, fill=(14, 18, 28), outline=(43, 54, 80))
    nc = color_count(spr)
    text(draw, (cx + 14, cy + 10), f"{title}  [{nc}色]", 19, (235, 240, 250))
    text(draw, (cx + 14, cy + 38), sub, 13, (140, 152, 176))
    tile = on_floor(spr)
    ox, oy = (24 - W) // 2, 24 - H - 1
    sheet.paste(Image.fromarray(tile), (cx + 14, cy + 70))
    text(draw, (cx + 12, cy + 98), "1×", 12, (120, 132, 156), mono=True)
    big = up(Image.fromarray(tile), K)
    sheet.paste(big, (cx + 50, cy + 66))
    ov = slot_overlay(up(Image.fromarray(tile), K).convert("RGB"), boxes, ox, oy)
    sheet.paste(ov, (cx + 50 + 24 * K + 8, cy + 66))
    if boxes:
        x = cx + 14
        for key in ("legs", "chest", "arm_l", "arm_r", "back"):
            if key in boxes:
                draw.rectangle([x, cy + 66 + 24 * K + 12, x + 10, cy + 66 + 24 * K + 22], fill=SLOT_COL[key])
                text(draw, (x + 14, cy + 66 + 24 * K + 8), SLOT_CN[key], 13, (190, 198, 214), shadow=False)
                x += 76


def noisy_5shade_variant(uname):
    """复现未做色块归并时的 4~5 阶碎灰噪点效果（用于同屏直观对比“去碎归并”前后差异）。"""
    spr, _ = unit(uname)
    out = spr.copy()
    rng = np.random.default_rng(abs(hash(uname)) % 10000)
    b2 = (out[..., :3] == PAL_RGB["B2"]).all(-1) & (out[..., 3] > 0)
    b3 = (out[..., :3] == PAL_RGB["B3"]).all(-1) & (out[..., 3] > 0)
    noise = rng.random(out.shape[:2])
    out[b2 & (noise < 0.28), :3] = PAL_RGB["B1"]
    out[b3 & (noise < 0.25), :3] = PAL_RGB["B4"]
    out[b2 & (noise > 0.82), :3] = PAL_RGB["B3"]
    return out


ENEMIES = [
    ("grunt", "企业安保步兵", "14×16 轻巧错步 · 斜向电击棍 · 1 散热"),
    ("enforcer", "重型履带执法者", "15×16 紧凑前倾履带 · 暖金液压破拳套"),
    ("drone", "悬浮无人机", "11×13 离地悬浮微投影 · 纯青单色系"),
    ("hacker", "义眼骇客", "13×16 弓身逆足 · 翠绿光学义眼 + 数据刺"),
    ("boss", "首领：橙刃处刑者", "19×20 阔步压迫体型 · 斜举橙金太刀 · 4 货舱"),
    ("sentry", "蜘蛛哨戒机", "15×12 低趴四足 · 斜举青色高频刃"),
]


def main():
    cols, rows = 4, 3
    sheet = Image.new("RGB", (cols * CARD_W + 24, rows * CARD_H + 110), BG)
    draw = ImageDraw.Draw(sheet)
    text(draw, (24, 18), "《Cyber-X》Caves+ 敌人样张（v4 灵动微像素 × 24 色平涂归并版）", 28, (240, 245, 255))
    text(draw, (24, 58), "精巧留白与体型阶梯(11×13 ~ 19×20) · 3/4 错步与斜向持械 · 全身冷钢仅 B2/B3 双阶平涂大色块(0 孤立噪点) · 单角色严控 4~6 色。",
         15, (150, 162, 184))
    natives = {}
    slots = [(i % cols, i // cols) for i in range(cols * rows)]
    for (key, title, sub), (c, r) in zip(ENEMIES, slots):
        spr, boxes = unit(key)
        natives[key] = spr
        card(sheet, draw, 12 + c * CARD_W, 100 + r * CARD_H, title, sub, spr, boxes)

    # 换件示例：同一躯体，换下肢 + 右臂
    c, r = slots[6]
    cx, cy = 12 + c * CARD_W, 100 + r * CARD_H
    a, _ = unit("grunt")
    b, bb = unit("grunt_swap")
    natives["grunt_swap"] = b
    draw.rounded_rectangle([cx, cy, cx + CARD_W - 12, cy + CARD_H - 12], radius=10, fill=(14, 18, 28), outline=(59, 228, 255))
    text(draw, (cx + 14, cy + 10), "换件示例：同一躯体热插拔", 20, (235, 240, 250))
    text(draw, (cx + 14, cy + 38), "错步双足→紧凑履带 · 电击棍→斜举高频太刀（保持 5~6 色）", 13, (140, 152, 176))
    sheet.paste(up(Image.fromarray(on_floor(a)), K), (cx + 14, cy + 66))
    text(draw, (cx + 14 + 24 * K + 2, cy + 66 + 80), "→", 30, (59, 228, 255))
    sheet.paste(slot_overlay(up(Image.fromarray(on_floor(b)), K).convert("RGB"),
                             {k: v for k, v in bb.items() if k in ("legs", "arm_r")}, 2, 1), (cx + 14 + 24 * K + 34, cy + 66))
    sheet.paste(Image.fromarray(on_floor(a)), (cx + 14, cy + 66 + 24 * K + 8))
    sheet.paste(Image.fromarray(on_floor(b)), (cx + 44, cy + 66 + 24 * K + 8))

    # 断臂示例
    c, r = slots[7]
    cx, cy = 12 + c * CARD_W, 100 + r * CARD_H
    s, _ = unit("grunt", severed=("arm_r",))
    prop = severed_prop("shock_baton")
    fl = floor_tile()
    floor2 = np.tile(fl, (1, 2, 1))
    paste(floor2, s, 2, 1)
    paste(floor2, prop, 24 + (24 - prop.shape[1]) // 2, 24 - prop.shape[0] - 4)
    draw.rounded_rectangle([cx, cy, cx + CARD_W - 12, cy + CARD_H - 12], radius=10, fill=(14, 18, 28), outline=(255, 140, 26))
    text(draw, (cx + 14, cy + 10), "断臂道具：斩落即棋盘实体", 20, (235, 240, 250))
    text(draw, (cx + 14, cy + 38), "主武器臂斩落复用同一张贴图旋转 90° + 外描边落地", 13, (140, 152, 176))
    sheet.paste(up(Image.fromarray(floor2), K), (cx + 14, cy + 66))
    sheet.paste(Image.fromarray(floor2), (cx + 14, cy + 66 + 24 * K + 8))
    text(draw, (cx + 70, cy + 66 + 24 * K + 10), "金属导电 · 可搭水桥", 13, (190, 198, 214), shadow=False)

    # 色块归并对比（多阶碎噪点 vs 双阶大色块平涂）
    cx, cy = 12 + 0 * CARD_W, 100 + 2 * CARD_H
    draw.rounded_rectangle([cx, cy, cx + CARD_W - 12, cy + CARD_H - 12], radius=10, fill=(14, 18, 28), outline=(78, 245, 149))
    text(draw, (cx + 14, cy + 10), "去碎对比：多色阶散点 → 双阶大色块平涂", 20, (235, 240, 250))
    text(draw, (cx + 14, cy + 38), "砍掉多余过渡灰阶与串色点，金属仅留 B2 暗块 + B3 亮块", 13, (140, 152, 176))
    for i, (ukey, lbl) in enumerate([("grunt", "步兵"), ("boss", "首领")]):
        ox_pair = cx + 16 + i * 218
        n_spr = noisy_5shade_variant(ukey)
        c_spr = natives[ukey]
        sheet.paste(up(Image.fromarray(on_floor(n_spr)), 4), (ox_pair, cy + 74))
        text(draw, (ox_pair + 98, cy + 110), "→", 22, (78, 245, 149))
        sheet.paste(up(Image.fromarray(on_floor(c_spr)), 4), (ox_pair + 118, cy + 74))
        text(draw, (ox_pair + 8, cy + 174), f"{lbl} 多阶碎点", 13, (255, 130, 140), shadow=False)
        text(draw, (ox_pair + 124, cy + 174), f"{lbl} 平涂归并", 13, (120, 245, 180), shadow=False)
        sheet.paste(Image.fromarray(on_floor(n_spr)), (ox_pair + 34, cy + 198))
        sheet.paste(Image.fromarray(on_floor(c_spr)), (ox_pair + 152, cy + 198))
    text(draw, (cx + 14, cy + 236), "① 单角色总色数 14 色 → 4~6 色（含外描边）", 13, (190, 198, 214), shadow=False)
    text(draw, (cx + 14, cy + 258), "② 孤立单像素金属噪点 26% → 0%，底板同步去噪平涂", 13, (190, 198, 214), shadow=False)

    # 对照组：整身 AI 图直缩到 20×22
    cx, cy = 12 + 1 * CARD_W, 100 + 2 * CARD_H
    draw.rounded_rectangle([cx, cy, cx + CARD_W - 12, cy + CARD_H - 12], radius=10, fill=(14, 18, 28), outline=(140, 29, 69))
    text(draw, (cx + 14, cy + 10), "对照组：整身 AI 直缩 20×22（不拆槽）", 20, (235, 240, 250))
    text(draw, (cx + 14, cy + 38), "槽位粘连、多色阶雪花碎点严重、无法热插拔", 13, (140, 152, 176))
    for i in range(3):
        spr = load_rgba(os.path.join(BUILD, "parts", f"lineup_{i}.png"))
        t = on_floor(spr)
        sheet.paste(up(Image.fromarray(t), 5), (cx + 18 + i * 144, cy + 76))
        sheet.paste(Image.fromarray(t), (cx + 66 + i * 144, cy + 76 + 24 * 5 + 12))

    # 锁定 24 色色相偏移调色板 + 背部槽图例
    cx, cy = 12 + 2 * CARD_W, 100 + 2 * CARD_H
    draw.rounded_rectangle([cx, cy, cx + CARD_W - 12, cy + CARD_H - 12], radius=10, fill=(14, 18, 28), outline=(43, 54, 80))
    text(draw, (cx + 14, cy + 10), "锁定 24 色色相偏移色板 + 纯色背挂图例", 20, (235, 240, 250))
    for i, (k, _) in enumerate(PAL.items()):
        x, y = cx + 14 + (i % 8) * 54, cy + 52 + (i // 8) * 52
        draw.rectangle([x, y, x + 44, y + 28], fill=PAL_RGB[k], outline=(60, 68, 90))
        text(draw, (x, y + 30), k, 11, (150, 162, 184), mono=True, shadow=False)
    y = cy + 52 + 3 * 52 + 12
    for j, (ck, label) in enumerate([("OR", "货舱 2×2"), ("CY", "散热鳍 2×2"), ("B2", "冷钴暗面"), ("B3", "冰银亮面")]):
        x = cx + 14 + j * 108
        draw.rectangle([x, y, x + 18, y + 18], fill=PAL_RGB[ck], outline=(60, 68, 90))
        text(draw, (x + 24, y + 1), label, 13, (190, 198, 214), shadow=False)

    # 玩家参照
    cx, cy = 12 + 3 * CARD_W, 100 + 2 * CARD_H
    spr, boxes = unit("player")
    natives["player"] = spr
    card(sheet, draw, cx, cy, "玩家（参照）", "14×16 轻巧错步 · 暖金液压破拳 · 2 货舱同色系", spr, boxes)

    bad = set()
    inv = {v: k for k, v in PAL_RGB.items()}
    for k, spr in natives.items():
        bad |= palette_audit(spr)
        m = spr[..., 3] > 0
        cnt = Counter(inv[tuple(c)] for c in spr[m][:, :3])
        print(f"  {k:10s}: {len(cnt)} colors -> {dict(cnt)}")
    assert not bad, f"off-palette colours: {bad}"
    os.makedirs(OUT, exist_ok=True)
    sheet.save(os.path.join(OUT, "enemies-sheet.png"))
    for k, spr in natives.items():
        Image.fromarray(spr).save(os.path.join(BUILD, f"unit_{k}.png"))
    print("enemies-sheet.png", sheet.size)


if __name__ == "__main__":
    main()
