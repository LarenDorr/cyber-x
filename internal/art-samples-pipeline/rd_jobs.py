"""Retro Diffusion 任务表（单一数据源）：
docs/retro-diffusion-prompt-kit.md 的提示词清单与 rd_gen.py 的自动化调用都从这里取。

设计约定：
- 一次生成 = 一个槽位的一个部件（不再像 v1~v4 那样一张表塞 6~8 个连通域），彻底绕开品红抠图与连通域切分。
- prompt 只描述主体（RD 官方规则：不写 "pixel art"，像素渲染由 prompt_style 负责）。
- 一律声明高对比纯白背景，配合 remove_bg=true 得到透明图；绝不写 "transparent background"。
- gen = 生成尺寸，target = 落进 20×22 画布的槽位尺寸，两者成整数倍（部件 ÷4、地块 ÷2）保证缩图后像素仍是真网格。
"""

# 直接在目标尺寸生成，不做超采样。
# 2026-11-18 实测更正：RD 按请求的 width×height 原生作画（÷4 块同色率仅 54~61%，
# 边缘跳变 mod 4 分布均匀），所以"生成 4 倍再 ÷4"不是保留细节，而是压掉 93.75% 的细节。
# 详见 docs/retro-diffusion-prompt-kit.md 第十二节。
GEN_FACTOR = 1
TILE_GEN = 24   # rd_tile__single_tile 支持 16~64，直接出 24

# 三种风格选择（改这里即可整体换模型）
STYLE_QUALITY = "rd_pro__default"    # 主力：12~256px，batch<=16，支持 9 张参考图
STYLE_DRAFT = "default:rd_flux"      # 起草：~$0.03/张（RD Fast 的 style id 不是 rd_fast__default，
                                     # 实际叫 default:rd_flux，且最小边 64、尺寸必须 >=64）
STYLE_TILE = "rd_tile__single_tile"  # 地块：16~64px，专为俯视瓦片训练

POSES = "three-quarter view facing right, slightly off-center"

JOBS = [
    # ---------------- 手臂 ×8（target 与 rig.py 的槽位一致） ----------------
    dict(id="arm_plain", accent=["CY"], kind="arm", target=(6, 6),
         prompt=f"a single compact cyborg robot forearm, small round shoulder joint at the upper left, elbow bent, "
                f"forearm hanging slightly forward, plain dark gunmetal steel plating with one tiny cyan wrist light, "
                f"{POSES}, on a flat white background, centered, one object only, no body, no legs, no shadow",
         note="纯钢灰副手，不带杂色点"),
    dict(id="arm_shock_baton", accent=["CY"], kind="arm", target=(6, 6),
         prompt=f"a single cyborg robot arm holding a short shock baton, shoulder joint at the upper left, elbow bent, "
                f"forearm angled diagonally forward to the right, the baton tip glowing electric blue, "
                f"dark gunmetal steel plating, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="电击棍，棍头纯电青"),
    dict(id="arm_power_fist", accent=["OR", "ORL"], kind="arm", target=(6, 6),
         prompt=f"a single cyborg robot arm ending in a huge industrial hydraulic power fist, shoulder joint at the upper left, "
                f"elbow bent, oversized blocky fist in worn yellow and dark grey with black hazard stripes, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="工业黄液压破拳套"),
    dict(id="arm_hf_blade", accent=["CY", "WB"], kind="arm", target=(8, 7),
         prompt=f"a single cyborg robot arm holding a thin high-frequency katana blade angled diagonally up to the right, "
                f"shoulder joint at the upper left, slim forearm, the blade edge glowing bright cyan with a white core, "
                f"dark gunmetal steel plating, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="青色高频太刀"),
    dict(id="arm_hf_blade_orange", accent=["OR", "ORL"], kind="arm", target=(8, 6),
         prompt=f"a single cyborg robot arm holding a legendary high-frequency katana blade angled diagonally up to the right, "
                f"shoulder joint at the upper left, slim forearm, the blade edge glowing gold-orange with a pale yellow core, "
                f"dark gunmetal steel plating, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="橙金传奇太刀（棋盘的保件目标）"),
    dict(id="arm_emp_cannon", accent=["CY"], kind="arm", target=(6, 6),
         prompt=f"a single compact cyborg robot arm ending in a stubby electromagnetic cannon barrel, shoulder joint at the upper left, "
                f"elbow bent, barrel pointing to the right with a glowing cyan ring at the muzzle, "
                f"dark gunmetal steel plating, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="EMP 炮，枪口青光"),
    dict(id="arm_plasma_rifle", accent=["GR"], kind="arm", target=(7, 6),
         prompt=f"a single compact cyborg robot arm holding a short plasma carbine aimed to the right, shoulder joint at the upper left, "
                f"elbow bent, small green sight light on top of the receiver, dark gunmetal steel plating, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="等离子卡宾，绿色瞄具"),
    dict(id="arm_data_spike", accent=["GR"], kind="arm", target=(6, 6),
         prompt=f"a single cyborg robot arm ending in a long thin hacker data spike blade lunging forward to the right, "
                f"shoulder joint at the upper left, elbow bent, the spike tip glowing green, thin cables coiled around the forearm, "
                f"dark gunmetal steel plating, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="骇客数据刺，绿尖"),

    # ---------------- 下肢 ×6（髋部承重块 + 错步站姿） ----------------
    dict(id="legs_biped", accent=["CY"], kind="legs", target=(7, 6),
         prompt=f"a pair of nimble armored robot legs only, solid flat-topped hip block at the top, no torso, no arms, "
                f"staggered walking stride with the front right knee slightly bent forward and the back left foot raised, "
                f"thick greaves and wide mechanical boots, dark gunmetal steel with one tiny cyan knee light, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="轻巧错步双足"),
    dict(id="legs_treads", accent=[], kind="legs", target=(9, 5),
         prompt=f"a compact low-profile robot tank tread chassis only, no torso, no arms, chunky side skirts, "
                f"bright wheel hub dots along the bottom, leaning slightly forward, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="紧凑前倾履带"),
    dict(id="legs_hover", accent=["CY"], kind="legs", target=(7, 6),
         prompt=f"a small sleek robot hover thruster pod only, no torso, no arms, angled armored skirt, "
                f"floating with a short bright cyan jet flame underneath, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="悬浮喷口，纯青尾焰"),
    dict(id="legs_reverse_joint", accent=["GR"], kind="legs", target=(7, 7),
         prompt=f"a pair of agile crouched reverse-joint digitigrade robot legs only, hip block at the top, no torso, no arms, "
                f"poised to spring forward to the right, thick outward-angled knees and clawed mech feet, "
                f"dark gunmetal steel with one tiny green joint light, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="弓身逆足弹跳腿"),
    dict(id="legs_spider", accent=["CY"], kind="legs", target=(10, 6),
         prompt=f"a low wide crouching four-legged spider walker base only, no torso, no arms, four thick hydraulic legs splayed diagonally "
                f"with sharp tips, dark gunmetal steel with small cyan joint dots, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="低趴四足哨戒底盘"),
    dict(id="legs_boss_stomper", accent=["RD"], kind="legs", target=(9, 8),
         prompt=f"a pair of massive wide-stance juggernaut robot legs only, heavy hip block at the top, no torso, no arms, "
                f"thick plated thighs and piston boots stepping forward to the right, "
                f"dark gunmetal steel with two tiny red warning lights, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="Boss 阔步重腿"),

    # ---------------- 胸腔 ×6（收腰倒梯形 + 中心反应堆焦点） ----------------
    dict(id="chest_security", accent=["CY"], kind="chest", target=(5, 5),
         prompt=f"a headless armored robot chest plate, broad angled shoulders tapering sharply to a narrow waist, no head, no arms, no legs, "
                f"one small square reactor core glowing cyan just right of center, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="安保轻甲胸"),
    dict(id="chest_enforcer", accent=["CY"], kind="chest", target=(6, 5),
         prompt=f"a headless bulky robot chest plate with layered shoulder plating and a sloped collar, tapering to a narrow waist, "
                f"no head, no arms, no legs, one small square reactor core glowing cyan just right of center, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="执法者重甲胸"),
    dict(id="chest_drone", accent=["CY"], kind="chest", target=(5, 5),
         prompt=f"a small sleek round flying drone body, no head, no arms, no legs, one glowing cyan core in the middle, "
                f"smooth curved plating with tiny vents, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="悬浮无人机球体"),
    dict(id="chest_hacker", accent=["GR"], kind="chest", target=(4, 5),
         prompt=f"a headless very slim agile robot torso, narrow asymmetric plating with thin cables running down one side, "
                f"no head, no arms, no legs, one small glowing green core just right of center, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="骇客瘦身胸，绿核心"),
    dict(id="chest_boss", accent=["RD"], kind="chest", target=(6, 6),
         prompt=f"a headless broad V-shaped robot cuirass, heavy angular shoulder blocks tapering to a narrow waist, "
                f"no head, no arms, no legs, one large reactor core glowing red just right of center, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="Boss V 型胸甲，红核心"),
    dict(id="chest_worker", accent=["ORL"], kind="chest", target=(4, 5),
         prompt=f"a headless agile scavenger robot rig torso, exposed frame with two chunky backpack mounting plates on the back, "
                f"no head, no arms, no legs, one small glowing amber core just right of center, dark gunmetal steel, "
                f"{POSES}, on a flat white background, centered, one object only, no shadow",
         note="玩家/工兵拾荒胸，琥珀核心"),

    # ---------------- 头部 ×6（高辨识度剪影） ----------------
    dict(id="head_security_visor", accent=["RD"], kind="head", target=(5, 5),
         prompt=f"a small robot security helmet head only, angled red visor slit, one short antenna stub on the side, "
                f"compact rounded shell, dark gunmetal steel, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="安保头盔，红色斜视镜"),
    dict(id="head_enforcer_helm", accent=["OR"], kind="head", target=(4, 4),
         prompt=f"a small heavy robot enforcer helmet head only, rounded dome with a wide orange visor slit and two side vents, "
                f"dark gunmetal steel, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="执法者圆顶，橙色横缝"),
    dict(id="head_drone_eye", accent=["CY"], kind="head", target=(4, 4),
         prompt=f"a small aerodynamic drone sensor pod head only, one round camera lens glowing cyan, no neck, "
                f"smooth tapered shell, dark gunmetal steel, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="无人机传感器球"),
    dict(id="head_hacker_optic", accent=["GR"], kind="head", target=(5, 5),
         prompt=f"a small asymmetric hooded robot head only, one large glowing green optic lens implant on one side, "
                f"the other side plain plating with a thin cable, dark gunmetal steel, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="骇客义眼头"),
    dict(id="head_boss_horned", accent=["RD"], kind="head", target=(5, 5),
         prompt=f"a small sharp horned robot commander helmet head only, two short curved horns, narrow red eye slit, "
                f"aggressive angular jaw plate, dark gunmetal steel, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="Boss 双角盔，红眼"),
    dict(id="head_worker", accent=["ORL"], kind="head", target=(5, 4),
         prompt=f"a small boxy scavenger robot head only, flat amber visor band across the front, one small antenna, "
                f"slightly dented plating, dark gunmetal steel, {POSES}, on a flat white background, centered, one object only, no shadow",
         note="玩家工兵头，琥珀视带"),

    # ---------------- 棋盘道具 ×5 ----------------
    dict(id="prop_cargo_pod", accent=["OR", "ORL", "ORD", "SC"], kind="prop", target=(12, 12),
         prompt="a square industrial cargo pod crate seen from a top-down three-quarter view, worn orange panels with dark grey bands "
                "and one small black hazard stripe, chunky corners, on a flat white background, centered, one object only, no shadow",
         note="货舱：实体阻挡(重量级) + 导电"),
    dict(id="prop_heat_sink", accent=["IC", "ICL", "WAL", "WB"], kind="prop", target=(12, 11),
         prompt="an ice-blue heat sink module seen from a top-down three-quarter view, a stack of metal cooling fins with frost creeping on the edges, "
                "dark grey frame, on a flat white background, centered, one object only, no shadow",
         note="散热器：背部槽掉落物"),
    dict(id="prop_scrap_arm", accent=[], kind="prop", target=(10, 10),
         prompt="a broken scrap robot arm lying flat on the ground seen from above, exposed cut wires and a single spark at the torn shoulder, "
                "dull grey metal, on a flat white background, centered, one object only, no shadow",
         note="废弃机械臂：金属导电，可搭水桥"),
    dict(id="prop_pipe_burst", accent=["IC", "ICL", "WB"], kind="prop", target=(12, 9),
         prompt="a short burst coolant pipe segment seen from above, split open with white frost cloud and ice crystals spraying out, "
                "dark industrial metal fittings, on a flat white background, centered, one object only, no shadow",
         note="爆裂冷却管：极寒源"),
    dict(id="prop_flame", accent=["FI", "OR", "ORL", "SC"], kind="prop", target=(9, 12),
         prompt="a small ground fire, orange flame tongues with a yellow core and two rising embers, seen from a top-down three-quarter view, "
                "on a flat white background, centered, one object only, no shadow",
         note="火焰：高热"),

    # ---------------- 地块 ×12（严格俯视，48 生成 → ÷2 到 24） ----------------
    dict(id="tile_floor", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a dark riveted metal floor plate with faint scratches and four bolts near the corners, seen from directly above",
         note="暗色地面（生成后代码补 L 角标）"),
    dict(id="tile_wall", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a solid dark steel wall block seen from directly above, smooth top face with a thin lighter rim",
         note="墙体：代码补倒角与投影"),
    dict(id="tile_wall_neon", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a dark steel wall block seen from directly above with a thin bright cyan neon strip running along one edge",
         note="霓虹墙"),
    dict(id="tile_vent", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a dark metal floor vent grate seen from directly above, horizontal slats with deep shadow between them",
         note="通风格栅"),
    dict(id="tile_water", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a shallow puddle of deep ultramarine water on a dark metal floor seen from directly above, soft ripple rings",
         note="积水：导电"),
    dict(id="tile_ice", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a thin sheet of pale blue ice covering a dark floor seen from directly above, two diagonal white mirror highlights",
         note="冰面：推力滑行，代码再乘 0.72 压暗"),
    dict(id="tile_scorch", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a scorched blackened floor plate seen from directly above, cracked charred metal with a few orange embers in the cracks",
         note="焦痕"),
    dict(id="tile_pipe_burst", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a burst coolant pipe crossing a dark floor seen from directly above, white frost and ice shards sprayed around the break",
         note="爆裂冷却管地块"),
    dict(id="tile_window", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a high-rise window edge seen from directly above: dark metal floor, a thin steel frame, then a vertical glass pane with two bright cyan "
                "highlight bars and a black void beyond it with a few tiny distant neon city lights",
         note="落地窗：脆弱玻璃，必须严格俯视"),
    dict(id="tile_window_cracked", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a high-rise window edge seen from directly above with the glass pane shattered, white fracture lines radiating from one impact point, "
                "dark metal floor on the left, black void beyond",
         note="破裂窗"),
    dict(id="tile_electrified", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="an electrified metal floor plate seen from directly above, bright white-blue lightning arcs crawling across the surface",
         note="电击地板"),
    dict(id="tile_ceiling_light", kind="tile", style=STYLE_TILE, target=(24, 24),
         prompt="a dark floor plate under a flickering ceiling light seen from directly above, one soft pale cyan pool of light with a dark grid shadow",
         note="新增：灯光地块，用来做 1080p 点光源锚点"),
]

# 地块按类型限定调色板子集（沿用 v4 extract_parts.py 的 TILE_SPECS 纪律）
FLOOR_ENV = ["E1", "E2"]
DARK_ENV = ["E0", "E1", "E2"]
TILE_KEYS = {
    "tile_floor": FLOOR_ENV,
    "tile_wall": DARK_ENV + ["E6", "ST"],
    "tile_wall_neon": DARK_ENV + ["E6", "ST", "CY"],
    "tile_vent": DARK_ENV,
    "tile_water": FLOOR_ENV + ["WA", "WAL"],
    "tile_ice": ["E2", "IC", "ICL"],
    "tile_scorch": DARK_ENV + ["SC", "FI", "OR", "ORL"],
    "tile_pipe_burst": FLOOR_ENV + ["B2", "B3", "IC", "ICL", "WB"],
    "tile_window": ["E0", "E1", "E2", "ST", "WAL", "CY", "WB", "RDD", "GRD"],
    "tile_window_cracked": ["E0", "E1", "E2", "ST", "WAL", "CY", "WB", "RDD", "GRD"],
    "tile_electrified": DARK_ENV + ["WAL", "CY", "WB"],
    "tile_ceiling_light": ["E0", "E1", "E2", "E6", "CY", "WB"],
}

# 创建自定义风格用的模板（把 {prompt} 换成各槽提示词即可复用同一套材质语言）
USER_STYLE_TEMPLATE = (
    "{prompt}. Extremely compact game sprite part, neutral cold gunmetal steel in only two flat shades, "
    "a hard one-pixel dark outline, no gradient shading, no dithering, and at most two saturated neon accent pixels."
)


def targets(style=STYLE_QUALITY):
    """展开成可直接 POST 的请求体列表。"""
    out = []
    for job in JOBS:
        tw, th = job["target"]
        gen = (tw * GEN_FACTOR, th * GEN_FACTOR)
        if job["kind"] == "tile":
            gen = (TILE_GEN, TILE_GEN)
        out.append({**job, "gen": gen, "prompt_style": job.get("style", style)})
    return out


def to_markdown():
    """生成 docs 里的提示词清单表格。"""
    rows = ["| # | id | 槽位 | 生成→落位 | style | 提示词 |",
            "| :-- | :--- | :--- | :--- | :--- | :--- |"]
    for i, j in enumerate(targets(), 1):
        g = f"{j['gen'][0]}×{j['gen'][1]} → {j['target'][0]}×{j['target'][1]}"
        rows.append(f"| {i} | `{j['id']}` | {j['kind']} | {g} | `{j['prompt_style']}` | {j['prompt']} |")
    return "\n".join(rows)


if __name__ == "__main__":
    js = targets()
    from collections import Counter
    print(f"{len(js)} 个任务；成本估算：")
    for s, n in Counter(j["prompt_style"] for j in js).items():
        price = 0.18 if s.startswith("rd_pro") else 0.06
        print(f"  {s}: {n} 张 × ${price} = ${n * price:.2f}")
    print()
    print(to_markdown())
