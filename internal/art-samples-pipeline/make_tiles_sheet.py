"""步骤 4：环境地块表 environment-tiles.png（24×24 原生 + 8× 最近邻），并做地面明度审计。"""
import os

import numpy as np
from PIL import Image, ImageDraw

from pixelkit import BUILD, OUT, load_rgba, palette_audit, paste, text, up
from rig import severed_prop

K = 8


def tile(name):
    return load_rgba(os.path.join(BUILD, "tiles", f"tile_{name}.png"))


def prop(name):
    return load_rgba(os.path.join(BUILD, "parts", f"prop_{name}.png"))


def on(base, spr, dy=0):
    t = base.copy()
    paste(t, spr, (24 - spr.shape[1]) // 2, (24 - spr.shape[0]) // 2 + dy)
    return t


def build_items():
    floor = tile("floor")
    return [
        ("暗色地面", "明度 ≤27% · L 角标", tile("floor")),
        ("墙体", "实体阻挡", tile("wall")),
        ("霓虹墙体", "墙顶青色灯带", tile("wall_neon")),
        ("通风格栅", "地面变体", tile("vent")),
        ("积水", "导电 · 群青", tile("water")),
        ("冰面", "推力 → 3 格滑行", tile("ice")),
        ("焦痕 + 火焰", "高热 · 易燃", on(tile("scorch"), prop("flame"), dy=-2)),
        ("爆裂冷却管", "极寒源 · 喷冰雾", tile("pipe_burst")),
        ("落地窗 / 高楼边缘", "脆弱玻璃 · 80F 深渊", tile("window")),
        ("破裂落地窗", "撞击后状态", tile("window_cracked")),
        ("电击地板", "导电中", tile("electrified")),
        ("掉落货舱", "实体阻挡(重量级) 12×12", on(floor, prop("cargo_pod"))),
        ("废弃机械臂", "金属导电 · AI 独立道具", on(floor, prop("scrap_arm"))),
        ("断臂（复用手臂贴图）", "手臂贴图旋转 90° + 外描边", on(floor, severed_prop("power_fist"))),
        ("散热器模块", "背部槽掉落物", on(floor, prop("heat_sink"))),
        ("积水 + 断臂桥", "导电桥组合示例", on(tile("water"), severed_prop("plain"))),
    ]


def main():
    items = build_items()
    cols = 8
    cw, ch = 228, 300
    rows = (len(items) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * cw + 24, rows * ch + 170), (10, 12, 18))
    d = ImageDraw.Draw(sheet)
    text(d, (24, 18), "《Cyber-X》Caves+ 环境地块与道具 · 24×24 原生 + 8× 最近邻", 28, (240, 245, 255))
    text(d, (24, 58), "AI 生成俯视地块表 → 网格切分 → BOX 缩放到 24×24 → 按地块类型限定调色板子集吸附 → 代码补 L 角标；道具复用部件流程（品红抠图 + 二值 Alpha）。",
         15, (150, 160, 180))
    bad = set()
    for i, (name, sub, t) in enumerate(items):
        bad |= palette_audit(t)
        x, y = 12 + (i % cols) * cw, 100 + (i // cols) * ch
        d.rounded_rectangle([x, y, x + cw - 10, y + ch - 10], radius=10, fill=(16, 19, 28), outline=(44, 52, 72))
        sheet.paste(up(Image.fromarray(t), K), (x + 13, y + 12))
        sheet.paste(Image.fromarray(t), (x + 13, y + 24 * K + 22))
        text(d, (x + 46, y + 24 * K + 18), name, 15, (230, 236, 248))
        text(d, (x + 46, y + 24 * K + 40), sub, 12, (140, 150, 170), shadow=False)
    assert not bad, f"off-palette colours: {bad}"

    # 明度审计：地面类地块除 L 角标外的最大 HSV Value
    audit = []
    for n in ("floor", "wall", "vent"):
        t = tile(n)[..., :3].astype(int)
        v = t.max(-1)
        mark = np.zeros(v.shape, bool)
        for (cx, cy) in [(1, 1), (22, 1), (1, 22), (22, 22)]:
            mark[max(0, cy - 1):cy + 2, max(0, cx - 1):cx + 2] = True
        audit.append(f"{n}: 最大明度 {v[~mark].max() / 255:.0%} / 平均 {v[~mark].mean() / 255:.0%}")
    text(d, (24, rows * ch + 112), "明度审计（不含 L 角标）：" + "   ".join(audit) + "   （墙体 44% 来自代码加的 1px 顶部倒角亮边，属刻意设计）",
         15, (150, 160, 180))
    sheet.save(os.path.join(OUT, "environment-tiles.png"))
    print("environment-tiles.png", sheet.size, audit)


if __name__ == "__main__":
    main()
