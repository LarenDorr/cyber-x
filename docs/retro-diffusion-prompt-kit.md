# 《Cyber-X》× Retro Diffusion 使用手册与提示词清单

> **用途**：把 v4 的「AI 伪像素 → 品红抠图 → 连通域切分 → 锁色」流水线，换成 Retro Diffusion（下称 RD）的原生网格出图，并给出可直接粘贴的 43 条提示词。
> **配套文件**：提示词与任务参数的唯一数据源是 `internal/art-samples-pipeline/rd_jobs.py`；自动化客户端是同目录的 `rd_gen.py`。本文所有表格由 `python3 rd_jobs.py` 自动导出，改脚本后重新生成即可，不必手改文档。
> **调色板参考图**：`media/art-samples/palette-24.png`（6×4 色块，96×96）与 `palette-24-strip.png`（单行细条），直接作为 `input_palette` 上传。

---

## 一、为什么要换（换的到底是什么）

v1~v4 的痛点全部来自同一件事：**通用生图模型画不出真像素网格**。它输出的是 8~10 倍、不对齐网格的“伪像素”，所以我们才要用品红背景抠图、膨胀 7px 做连通域、按覆盖率二值化 Alpha，再靠亮度分位把 5 阶碎灰压回 2 阶——这条链路的每一步都在给模型擦屁股，而且擦不干净（下肢可读性最差、6×5 头的眼点会整个消失、跨批次线条粗细漂移）。

RD 的价值正好落在这一层：**输出本身就是 1× 真像素网格 + 有限色板**，放大 4× 后每颗粒子仍是正方形。于是：

| 环节 | v4 做法 | RD 做法 |
| :--- | :--- | :--- |
| 一张图几个部件 | 一张表塞 6~8 个，靠连通域切 | **一次生成 = 一个槽位的一个部件**，天然独立文件 |
| 抠图 | 品红 `#FF00FF` + 阈值 + 开运算 | `remove_bg=true` + 提示词里写“flat white background” |
| 缩放 | BOX 面积平均（会插值、会糊） | 按 4× 超采样生成，本地 ÷4 块取众数（整数倍，零插值） |
| 色板 | 亮度分位映射 + 加权 RGB 吸附 | `input_palette` 直接锁 24 色（可选），落位后再补一次双阶归并 |
| 透视/朝向 | 提示词求它，它经常不听（等距落地窗） | 专用 style（`topdown` / `single_tile`）把视角烧进模型 |

**不能指望 RD 替我们做的**：单角色 4~6 色纪律、B2/B3 双阶平涂、1px 外轮廓、背部 2×2 指示块、L 角标、明度预算。这些仍然由 `pixelkit.py` / `rig.py` 兜底——RD 只是把“画得像不像像素”这个问题解决了，“合不合我们的美术纪律”还是代码的事。

---

## 二、三种用法，先选一个

| 用法 | 适合谁 | 成本 | 说明 |
| :--- | :--- | :--- | :--- |
| **A. 官网/网页编辑器**（retrodiffusion.ai） | 只想先试试手感、改一两张 | 按张计费，和 API 共用一个余额 | 有画布编辑、去底、换色、动画，最省心，但不适合 43 张的批量重跑 |
| **B. API + `rd_gen.py`**（**推荐**） | 要把这批资产接进流水线、以后还要反复重生成 | RD Pro $0.18/张，RD Fast $0.03/张 | 本文的主路径。任务表在 `rd_jobs.py`，一条命令跑全表 |
| **C. Aseprite 插件** | 习惯在 Aseprite 里手改 | 一次性买断、本地跑 | **扩展和网站/API 用的不是同一套模型**，出图质量和网站不可比，且没有 API。只建议当“手改工具”，别当生产主力 |

> 补充：官网正在把插件功能收敛到自家的原生像素编辑器里，插件属于逐步淘汰状态。若目标是量产，直接走 B。

### B 路径的准备（5 分钟）

1. 注册后在 **Developer Tools**（`https://www.retrodiffusion.ai/app/devtools`）创建 API Key，形如 `rdpk-...`，每账号最多 5 个。
2. **充值**——这一步不能跳。API 只花预付 USD 余额（`balance`），**网页端的免费额度是 website-only，API 永远不消耗它**（官方文档原文：*free daily usage is website-only and never used by the API*）。新账号会看到 `credits: 50`、免费额度 100%，这些数字在 `check_cost` 里会显示 `would_use: "blocked"`，真实生成则一律 `insufficient_balance`。在 Payment Methods 里自助充值。
3. 导出环境变量：`export RD_API_KEY="rdpk-..."`。
4. 先跑 `python3 rd_gen.py balance` 确认 `balance > 0`——这是唯一可信的开工信号。

```bash
cd /cursor/stores/bc-cb76bd7a-4096-4324-9a66-e2a728347fac/internal/art-samples-pipeline

python3 rd_gen.py balance    # 余额 / 免费额度 / 订阅状态（免费，先跑这个）
python3 rd_gen.py styles     # 列出账号可用的 style 及各自尺寸/批次上限（免费）
python3 rd_gen.py cost       # 全表 dry-run 报价（免费，一次调用算一张）
python3 rd_gen.py gen        # 按任务表出图，落到 src-rd/
python3 rd_gen.py promote    # ÷4 块降采样 → 聚色 → build/parts、build/tiles → 调色板审计
python3 make_enemies_sheet.py && python3 make_tiles_sheet.py && python3 make_mockup.py
```

`gen` 的几个开关：`--draft` 改用 `rd_fast__default` 起草（价格约 1/6，用来先验证提示词），`--only arm_hf_blade legs_biped` 只跑指定任务，`--palette` 给地块带上 `input_palette`。已经生成过的文件默认跳过，不会重复扣费；每张都带独立 `Idempotency-Key`，重跑安全。

---

## 三、提示词的六条硬规则（RD 和通用模型完全相反）

这几条是从 RD 官方文档和 MCP 工具描述里提炼的，直接决定成败：

1. **只描述主体，绝不写 “pixel art”。** 像素渲染是 `prompt_style` 的职责；写了反而会触发风格叠加，输出变脏。
2. **只描述你要的东西。** `negative` 字段虽然能传，但**当前没有任何模型使用它**，是个占位符——不要靠负面词，改成正面描述。
3. **独立资产必须声明高对比纯色背景**（我们用 `on a flat white background`），然后靠 `remove_bg=true` 抠透明。**绝不写 “transparent background”**——那是 `remove_bg` 的活；也绝不能不写背景，留空它会漂成一片脏深灰。
4. **一次生成只出一个东西。** N 个可用资产 = N 次生成（或 `num_images=N` 拿 N 个变体），不要把 N 个部件塞进一张网格图——那正是 v1~v4 的老路。唯一例外是 `rd_pro__inventory_items` / `rd_pro__spritesheet` 这类“表格本身就是交付物”的 style。
5. **不要在 prompt 里指定像素尺寸。** 尺寸走 `width`/`height` 字段。同一个“6×6”的部件，我们生成 24×24 再 ÷4，而不是让模型去画 6×6。
6. **同一构图反复迭代时复用 `seed`**，只改提示词里的一个变量，否则每次都是无关的新图。

还有一条工程约定：**`bypass_prompt_expansion: true`**。RD 默认会用 LLM 自动扩写提示词，会给我们已经写死的槽位描述加戏（加阴影、加背景、加装饰），必须关掉。

---

## 四、尺寸策略 ⚠️ 本节结论已被第十二节的实测推翻

> **直接看结论**：RD 是**按你请求的尺寸原生作画**的，不存在"小尺寸生成再放大"这回事。所以正确做法是**直接请求目标尺寸**（手臂 6×6、地块 24×24），而不是生成 4 倍再压。下面这段保留作为推理记录，请结合第十二节阅读。

## 四、尺寸策略：为什么生成 24×24 而不是 6×6

这是整套方案里最容易踩坑的一处。RD Pro 确实能出 12×12，`rd_pro__default` 下限就是 12px，但**12px 以下没有生成模型还能保持结构**：给 6×6 的手臂，出来的是一团不可辨认的色块。

我们的做法是 **4× 超采样**：

```
生成 24×24  ──÷4 块取众数──▶  落位 6×6     （每颗成品像素 = 源图一个 4×4 块）
地块 48×48  ──÷2 块取众数──▶  落位 24×24
```

这样做的三个好处：

- 模型在它擅长的尺度工作（24~48px 有足够像素表达肩关节、肘部、护胫）；
- 降采样是**整数倍块取众数**，不做任何插值，落位后像素网格严格对齐（`rd_gen.block_downscale`，等价于 RD 官方 `k_centroid_downscale` 编辑工具的本地免费版）；
- 落位尺寸仍与 `rig.py` 的锚点严丝合缝（手臂 6×6、下肢 7×6~9×8、胸腔 4×5~6×6、头 4×4~5×5），**v4 的拼装代码一行都不用改**。

离线往返测试已验证：把现有 6×6 部件 4× 最近邻上采样再 ÷4，结果与原图**逐像素完全一致**；叠加 ±18 的抗锯齿噪声后，平均色差仅 10/255，且尺寸不变。

---

## 五、模型与 style 选择

| 用途 | style | 理由 |
| :--- | :--- | :--- |
| **角色部件、道具**（主力） | `rd_pro__default` | 12~256px 全覆盖、batch≤16、支持 9 张参考图（后续换装变体靠它保持一致）、细节跟随最准 |
| 起草 / 试提示词 | `default:rd_flux` | $0.03，先用它把 43 条提示词验证一遍，再用 RD Pro 出终稿。**注意 id 不是 `rd_fast__default`**——RD Fast 的 style id 是冒号格式，`rd_fast__default` 在 selector 里根本不存在 |
| **地块** | `rd_tile__single_tile` | 16~64px，专为俯视瓦片训练，能真正听懂“seen from directly above” |
| 整套地形（带 Wang 拼接） | `rd_tile__tileset` / `_advanced` | 如果要自动生成 47 张 Wang 边角组合，用这个；但它的输出去不了背景，需自行切分 |
| 需要 2/3 俯视而非正俯视 | `rd_pro__topdown` | 视角烧进模型，比在提示词里求它可靠 |
| 一致性要求极高时 | 自定义 style（`user__*`） | 用一张参考图 + `user_prompt_template` 把我们的材质语言固化，见第八节 |

预算：全表 43 张 = RD Pro 31 张 × $0.18（$5.58）+ 地块 12 张 × $0.06（$0.72）= **$6.30 一轮**。先跑 `--draft` 全表验证提示词约 $1.29，确认后再出终稿。

**尺寸下限是硬约束，且 `check_cost` 不会替你检查。** 各 style 的最小边实测如下（来自 `/v2/styles/selector`）：`rd_pro__default` 12、`rd_core__default` 16、`rd_tile__single_tile` 16、`rd_plus__default` 与 `default:rd_flux` **都是 64**。低于下限的宽高会以 `invalid_style_dimensions` 被拒——而 `check_cost` 只报价、**不校验 style 与尺寸的合法性**，所以报价全绿也可能一提交就报错。`rd_gen.py` 里的 `min_cost_dim()` 会自动把过小的部件等比例放大到合法尺寸（例如 24×24 → 72×72），`promote` 再按实际源图尺寸自适应降采样。

**别踩的坑**：`rd_pro__spritesheet` / `rd_pro__inventory_items` 看着很诱人（一次出一整张表），但它们的输出是“一张图里有多个物体”，与我们的“一部件一文件 + 固定锚点拼装”直接冲突——拼装需要每个部件独立的透明画布。这类 style 只适合做概念探索。

---

## 六、43 条提示词清单

> 全部由 `python3 rd_jobs.py` 从 `rd_jobs.py` 导出。生成尺寸已是 4× 超采样后的值，落位尺寸即 `rig.py` 的槽位尺寸。
> 提示词里刻意**没有**写“pixel art”“no antialiasing”“hard edges”——这些是 style 的职责。

| # | id | 槽位 | 生成尺寸（=落位尺寸） | style | 提示词 |
| :-- | :--- | :--- | :--- | :--- | :--- |
| 1 | `arm_plain` | arm | 6×6 → 6×6 | `rd_pro__default` | a single compact cyborg robot forearm, small round shoulder joint at the upper left, elbow bent, forearm hanging slightly forward, plain dark gunmetal steel plating with one tiny cyan wrist light, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no body, no legs, no shadow |
| 2 | `arm_shock_baton` | arm | 6×6 → 6×6 | `rd_pro__default` | a single cyborg robot arm holding a short shock baton, shoulder joint at the upper left, elbow bent, forearm angled diagonally forward to the right, the baton tip glowing electric blue, dark gunmetal steel plating, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 3 | `arm_power_fist` | arm | 6×6 → 6×6 | `rd_pro__default` | a single cyborg robot arm ending in a huge industrial hydraulic power fist, shoulder joint at the upper left, elbow bent, oversized blocky fist in worn yellow and dark grey with black hazard stripes, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 4 | `arm_hf_blade` | arm | 8×7 → 8×7 | `rd_pro__default` | a single cyborg robot arm holding a thin high-frequency katana blade angled diagonally up to the right, shoulder joint at the upper left, slim forearm, the blade edge glowing bright cyan with a white core, dark gunmetal steel plating, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 5 | `arm_hf_blade_orange` | arm | 8×6 → 8×6 | `rd_pro__default` | a single cyborg robot arm holding a legendary high-frequency katana blade angled diagonally up to the right, shoulder joint at the upper left, slim forearm, the blade edge glowing gold-orange with a pale yellow core, dark gunmetal steel plating, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 6 | `arm_emp_cannon` | arm | 6×6 → 6×6 | `rd_pro__default` | a single compact cyborg robot arm ending in a stubby electromagnetic cannon barrel, shoulder joint at the upper left, elbow bent, barrel pointing to the right with a glowing cyan ring at the muzzle, dark gunmetal steel plating, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 7 | `arm_plasma_rifle` | arm | 7×6 → 7×6 | `rd_pro__default` | a single compact cyborg robot arm holding a short plasma carbine aimed to the right, shoulder joint at the upper left, elbow bent, small green sight light on top of the receiver, dark gunmetal steel plating, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 8 | `arm_data_spike` | arm | 6×6 → 6×6 | `rd_pro__default` | a single cyborg robot arm ending in a long thin hacker data spike blade lunging forward to the right, shoulder joint at the upper left, elbow bent, the spike tip glowing green, thin cables coiled around the forearm, dark gunmetal steel plating, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 9 | `legs_biped` | legs | 7×6 → 7×6 | `rd_pro__default` | a pair of nimble armored robot legs only, solid flat-topped hip block at the top, no torso, no arms, staggered walking stride with the front right knee slightly bent forward and the back left foot raised, thick greaves and wide mechanical boots, dark gunmetal steel with one tiny cyan knee light, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 10 | `legs_treads` | legs | 9×5 → 9×5 | `rd_pro__default` | a compact low-profile robot tank tread chassis only, no torso, no arms, chunky side skirts, bright wheel hub dots along the bottom, leaning slightly forward, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 11 | `legs_hover` | legs | 7×6 → 7×6 | `rd_pro__default` | a small sleek robot hover thruster pod only, no torso, no arms, angled armored skirt, floating with a short bright cyan jet flame underneath, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 12 | `legs_reverse_joint` | legs | 7×7 → 7×7 | `rd_pro__default` | a pair of agile crouched reverse-joint digitigrade robot legs only, hip block at the top, no torso, no arms, poised to spring forward to the right, thick outward-angled knees and clawed mech feet, dark gunmetal steel with one tiny green joint light, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 13 | `legs_spider` | legs | 10×6 → 10×6 | `rd_pro__default` | a low wide crouching four-legged spider walker base only, no torso, no arms, four thick hydraulic legs splayed diagonally with sharp tips, dark gunmetal steel with small cyan joint dots, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 14 | `legs_boss_stomper` | legs | 9×8 → 9×8 | `rd_pro__default` | a pair of massive wide-stance juggernaut robot legs only, heavy hip block at the top, no torso, no arms, thick plated thighs and piston boots stepping forward to the right, dark gunmetal steel with two tiny red warning lights, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 15 | `chest_security` | chest | 5×5 → 5×5 | `rd_pro__default` | a headless armored robot chest plate, broad angled shoulders tapering sharply to a narrow waist, no head, no arms, no legs, one small square reactor core glowing cyan just right of center, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 16 | `chest_enforcer` | chest | 6×5 → 6×5 | `rd_pro__default` | a headless bulky robot chest plate with layered shoulder plating and a sloped collar, tapering to a narrow waist, no head, no arms, no legs, one small square reactor core glowing cyan just right of center, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 17 | `chest_drone` | chest | 5×5 → 5×5 | `rd_pro__default` | a small sleek round flying drone body, no head, no arms, no legs, one glowing cyan core in the middle, smooth curved plating with tiny vents, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 18 | `chest_hacker` | chest | 4×5 → 4×5 | `rd_pro__default` | a headless very slim agile robot torso, narrow asymmetric plating with thin cables running down one side, no head, no arms, no legs, one small glowing green core just right of center, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 19 | `chest_boss` | chest | 6×6 → 6×6 | `rd_pro__default` | a headless broad V-shaped robot cuirass, heavy angular shoulder blocks tapering to a narrow waist, no head, no arms, no legs, one large reactor core glowing red just right of center, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 20 | `chest_worker` | chest | 4×5 → 4×5 | `rd_pro__default` | a headless agile scavenger robot rig torso, exposed frame with two chunky backpack mounting plates on the back, no head, no arms, no legs, one small glowing amber core just right of center, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 21 | `head_security_visor` | head | 5×5 → 5×5 | `rd_pro__default` | a small robot security helmet head only, angled red visor slit, one short antenna stub on the side, compact rounded shell, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 22 | `head_enforcer_helm` | head | 4×4 → 4×4 | `rd_pro__default` | a small heavy robot enforcer helmet head only, rounded dome with a wide orange visor slit and two side vents, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 23 | `head_drone_eye` | head | 4×4 → 4×4 | `rd_pro__default` | a small aerodynamic drone sensor pod head only, one round camera lens glowing cyan, no neck, smooth tapered shell, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 24 | `head_hacker_optic` | head | 5×5 → 5×5 | `rd_pro__default` | a small asymmetric hooded robot head only, one large glowing green optic lens implant on one side, the other side plain plating with a thin cable, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 25 | `head_boss_horned` | head | 5×5 → 5×5 | `rd_pro__default` | a small sharp horned robot commander helmet head only, two short curved horns, narrow red eye slit, aggressive angular jaw plate, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 26 | `head_worker` | head | 5×4 → 5×4 | `rd_pro__default` | a small boxy scavenger robot head only, flat amber visor band across the front, one small antenna, slightly dented plating, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| 27 | `prop_cargo_pod` | prop | 12×12 → 12×12 | `rd_pro__default` | a square industrial cargo pod crate seen from a top-down three-quarter view, worn orange panels with dark grey bands and one small black hazard stripe, chunky corners, on a flat white background, centered, one object only, no shadow |
| 28 | `prop_heat_sink` | prop | 12×11 → 12×11 | `rd_pro__default` | an ice-blue heat sink module seen from a top-down three-quarter view, a stack of metal cooling fins with frost creeping on the edges, dark grey frame, on a flat white background, centered, one object only, no shadow |
| 29 | `prop_scrap_arm` | prop | 10×10 → 10×10 | `rd_pro__default` | a broken scrap robot arm lying flat on the ground seen from above, exposed cut wires and a single spark at the torn shoulder, dull grey metal, on a flat white background, centered, one object only, no shadow |
| 30 | `prop_pipe_burst` | prop | 12×9 → 12×9 | `rd_pro__default` | a short burst coolant pipe segment seen from above, split open with white frost cloud and ice crystals spraying out, dark industrial metal fittings, on a flat white background, centered, one object only, no shadow |
| 31 | `prop_flame` | prop | 9×12 → 9×12 | `rd_pro__default` | a small ground fire, orange flame tongues with a yellow core and two rising embers, seen from a top-down three-quarter view, on a flat white background, centered, one object only, no shadow |
| 32 | `tile_floor` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a dark riveted metal floor plate with faint scratches and four bolts near the corners, seen from directly above |
| 33 | `tile_wall` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a solid dark steel wall block seen from directly above, smooth top face with a thin lighter rim |
| 34 | `tile_wall_neon` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a dark steel wall block seen from directly above with a thin bright cyan neon strip running along one edge |
| 35 | `tile_vent` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a dark metal floor vent grate seen from directly above, horizontal slats with deep shadow between them |
| 36 | `tile_water` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a shallow puddle of deep ultramarine water on a dark metal floor seen from directly above, soft ripple rings |
| 37 | `tile_ice` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a thin sheet of pale blue ice covering a dark floor seen from directly above, two diagonal white mirror highlights |
| 38 | `tile_scorch` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a scorched blackened floor plate seen from directly above, cracked charred metal with a few orange embers in the cracks |
| 39 | `tile_pipe_burst` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a burst coolant pipe crossing a dark floor seen from directly above, white frost and ice shards sprayed around the break |
| 40 | `tile_window` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a high-rise window edge seen from directly above: dark metal floor, a thin steel frame, then a vertical glass pane with two bright cyan highlight bars and a black void beyond it with a few tiny distant neon city lights |
| 41 | `tile_window_cracked` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a high-rise window edge seen from directly above with the glass pane shattered, white fracture lines radiating from one impact point, dark metal floor on the left, black void beyond |
| 42 | `tile_electrified` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | an electrified metal floor plate seen from directly above, bright white-blue lightning arcs crawling across the surface |
| 43 | `tile_ceiling_light` | tile | 24×24 → 24×24 | `rd_tile__single_tile` | a dark floor plate under a flickering ceiling light seen from directly above, one soft pale cyan pool of light with a dark grid shadow |

### 提示词的写法拆解（以 `arm_hf_blade` 为例）

```
a single cyborg robot arm holding a thin high-frequency katana blade angled diagonally up to the right,
  ↑ 数量与对象：a single ... arm —— 明确“只有一个”，杜绝多画一条手臂
shoulder joint at the upper left, elbow bent,
  ↑ 锚点朝向：告诉模型肩枢在哪、怎么拐 —— 这决定了它能不能塞进 8×7 槽位
the blade edge glowing bright cyan with a white core,
  ↑ 焦点色：只给 1 个霓虹色系（v4 的“单部件单色系锁死”在提示词层的对应写法）
dark gunmetal steel plating,
  ↑ 材质：统一枪灰，这样落位后 B2/B3 双阶归并才有素材可归
three-quarter view facing right, slightly off-center,
  ↑ 姿态：与 v4 的 3/4 微侧身一致，也是水平翻转策略的前提
on a flat white background, centered, one object only, no shadow
  ↑ 抠图前提：纯白高对比 + 居中 + 单个 + 不要阴影（阴影会把 remove_bg 弄脏）
```

### 每个槽位的额外约束

- **手臂**：必须写清“shoulder joint at the upper left, elbow bent”，否则模型会画成直垂的一根棍子，塞不进 6×6。
- **下肢**：必须写“no torso, no arms”和“hip block at the top”——v1 的教训是它会顺手给你画个上身。
- **胸腔**：必须写“no head”和核心位置“just right of center”，反应堆焦点靠这半句话定位。
- **头部**：尺寸最小（4×4~5×5），**只写一个剪影特征**（红视镜 / 双角 / 大义眼），写多了必然糊掉。
- **地块**：必须写“seen from directly above”。第一版地块表把落地窗画成等距透视的坑，就是靠这句 + `rd_tile__single_tile` 双重保险。
- **道具**：写“top-down three-quarter view”而不是“above”——货舱要有体积感才认得出是“重量级阻挡”。

---

## 七、落位之后的处理（`promote` 干了什么）

RD 出的是真像素，但用的是**它自己的色板**，不是我们的 24 色。所以落位后还有三步，全部在 `rd_gen.py promote` 里：

1. **块降采样**：÷4（部件）/ ÷2（地块），每个块取出现次数最多的颜色。带透明通道的部件只统计不透明像素，避免白底污染边缘。
2. **聚色到色板**
   - 部件：灰色按“亮度 50% + 右上 3/4 受光平面 50%”打分二分到 `B2`（冷钴暗块）/ `B3`（冰银亮块）；彩色像素只吸附到该部件 `accent` 字段指定的色系（如高频刃只有 `CY`/`WB`），没有 accent 的部件直接去色——这就把 v4 的“单角色 4~6 色”纪律移植过来了。
   - 地块：按类型锁子集（地面只允许 `E1/E2`）→ `tile_quantize` 吸附 → `despeckle_tile` 去雪花噪点 → 补 2×2 `L` 角标。
3. **调色板审计**：`palette_audit` 断言，任何色板外颜色直接报出来。离线跑通的样例里，43 张全部 `调色板外 = 0`。

如果觉得“聚色”破坏了 RD 原始像素排布（有时候会），可以 `promote --no-cluster` 保留原图，只做审计；那就需要接受色板外颜色，并在 `rig.py` 里改审计断言。

---

## 八、两个能显著提质的高级用法

### 8.1 自定义 style：把材质语言固化（推荐）

`POST /v2/styles` 可以创建 `user__*` 风格：给**恰好 1 张**参考图 + 一个必须含 `{prompt}` 的模板。把我们的材质纪律写进模板，就不用每条提示词重复一遍：

```json
{
  "name": "CyberX Micro Rig",
  "description": "Cyber-X 20x22 五槽义体的统一材质语言",
  "reference_images": ["<base64: 一张已定稿的 v4 部件，比如 arm_plain.png 放大 4x>"],
  "user_prompt_template": "{prompt}. Extremely compact game sprite part, neutral cold gunmetal steel in only two flat shades, a hard one-pixel dark outline, no gradient shading, no dithering, and at most two saturated neon accent pixels.",
  "force_palette": true,
  "force_bg_removal": true
}
```

返回的 `prompt_style`（形如 `user__cyberx_micro_rig_1a2b3c4d`）直接填进 `rd_jobs.py` 顶部的 `STYLE_QUALITY`，全表 43 张就共享同一套材质与去掉背景的设定。`force_palette` 需要配合调色板用；`rd_jobs.USER_STYLE_TEMPLATE` 已存了这段模板文案。

### 8.2 参考图保一致性（做变体时必用）

RD Core / RD Pro 支持最多 **9 张 `reference_images`**，作用是“引导风格和内容但不重绘”。做同一件义体的稀有度变体（青色刃 → 橙金刃）时：

```
生成 arm_hf_blade（青色）
    ↓ 把它的落位图（4× 放大后）作为 reference_images
生成 arm_hf_blade_orange（同一提示词，只改 "bright cyan" → "gold-orange"）
```

这样两把刀的握柄、肩枢、刃长是同一套几何，只有刃口颜色不同——正是游戏里稀有度变体该有的样子。**不要**用 `image_edit` 工具去调色，那会改变像素排布。

### 8.3 地块的 Wang 变体

`rd_tile__tile_variation`（16~128px，需要输入图）可以把一张定稿地块衍生出若干随机变体，避免棋盘上同一张地面砖铺满全屏的机械感。建议每种地面做 3 张变体，按坐标做确定性随机选取。

---

## 九、成本、限额与故障处理

| 项目 | 数值 |
| :--- | :--- |
| RD Pro | $0.18/张（任意尺寸），batch ≤ 16 |
| RD Fast | $0.03/张，batch ≤ 16 |
| 地块类（`rd_tile__*`） | $0.06/张 |
| 全表一轮（终稿） | **$6.30**（RD Pro $5.58 + 地块 $0.72） |
| 全表一轮（起草，全用 RD Fast） | 约 $1.3 |

`check_cost: true` 是免费 dry-run，返回精确价格且不生成任何东西——**每次改任务表后先跑 `rd_gen.py cost`**。

故障处理要点：

- **V2 全是异步**：POST 立即返 `task_id`，必须轮询 `GET /v2/inferences/tasks/{task_id}`。`async` 字段只是兼容旧版，传不传都一样。
- **失败自动退款**，所以“失败重试一次”基本零成本。`provider_busy` 是动画 provider 过载，等几分钟再试。
- **幂等**：每张付费请求都带独立 `Idempotency-Key`。如果 POST 的响应丢了（超时/断连），用同一个 key 重发不会二次扣费；换成不同输入复用同一个 key 会 409。
- **结果可能不在 `base64_images` 里**：编辑类工具（`image_edit` / `inpainting` / `outpainting`）经常返回空数组，只给 `output_urls`。只读 base64 的代码会静默丢结果却照常扣费。纯生成不会这样，但写工具时要注意。
- **限流** 429 时看 `Retry-After`；批量前可先 `GET /v2/status`（无需 key，实测 rd_fast/rd_pro/rd_plus/animations/background_removal 全部 `ok`）。
- **`check_cost` 不是校验器**：它只算钱。尺寸非法、style id 拼错都不会被它拦下。要验证参数，只能真提交（余额为 0 时提交会被接受入队、随后 `insufficient_balance` 失败、不扣费，反倒可以当免费校验器用）。
- **API 并发槽位只有 2 个**（网页端是 5 个）。批量跑表时 `rd_gen.py` 是串行的，不用管；若自己并发，第 3 个请求会排队。

---

## 十、下一步建议（按顺序做）

1. **先起草 8 张关键件**（`--draft --only arm_hf_blade arm_hf_blade_orange arm_power_fist legs_biped chest_boss head_boss_horned prop_cargo_pod tile_window`）。这 8 个覆盖了最难的几类：细长刃、体积拳套、错步腿、Boss 胸、小头、道具、俯视窗。约 $0.35。
2. 落位后直接跑 `make_enemies_sheet.py`，**看 1× 尺寸下能不能认出来**——这是唯一的验收标准，8× 好看不算数。
3. 提示词按需微调，把改动的 `seed` 记下来。
4. 全表 `--draft` 验证 → 全表终稿 → `promote` → 三张样张重建。
5. 视效果决定是否建立 8.1 的自定义 style，把材质纪律固化。

**验证状态（2026-11-18 首次真机联调）**：

- ✅ **鉴权与端点**：`/v2/styles/selector` 返回 103 个 style（models: rd_core / rd_fast / rd_mini / rd_plus / rd_pro），`/v2/status` 五大子系统全 `ok`。字段名、端点、异步轮询流程（POST 拿 `task_id` → GET 轮询）与文档完全一致。
- ✅ **43 个任务的参数全部合法**：全表逐条真实提交，服务器全部返回 `accepted`，零 `invalid_style_dimensions`。
- ✅ **全程零扣费**：47 个测试任务全部以 `insufficient_balance` 失败，`balance_cost` 均为空，余额始终 `$0.00`。失败自动退款机制属实。
- ✅ **离线链路**：`promote` 的降采样、聚色、地块子集量化、调色板审计用伪造的 RD 输出端到端跑通（43 张全部 `调色板外 = 0`）。
- ❌ **未验证：真实出图效果**。账号 `balance = $0`、无订阅，而网页端免费额度不供 API 使用，所以没有任何一张图真正生成过。**图片质量、`remove_bg` 抠图干净度、4× 超采样后落位是否可读，全部仍待充值后验证。**

联调中修掉的两个真 bug（文档前述内容已同步更正）：`STYLE_DRAFT` 原本写成不存在的 `rd_fast__default`（实际是 `default:rd_flux`）；小部件按 4× 生成后仍低于 RD Fast 的 64px 下限，现由 `min_cost_dim()` 自动放大。另外发现 `check_cost` **只报价不校验**，不能拿它当参数验证器。

---

## 十一、零成本试跑：网页端免费额度验证（推荐先做这一步）

API 必须充值，但**网页端的免费额度足够把最关键的问题验证掉**。新账号注册即送 **$0.50 余额**（16 张 RD Fast 或 2 张 RD Pro，无需绑卡）。更关键的是：**`Palette Converter`、`Color Reducer`、`K-Centroid Downscale` 这三个画布工具在网页端是免费的**——它们正好覆盖了落位流程里最贵的两步（锁色 + 整数倍降采样）。

所以完整的"零成本验证闭环"可以在浏览器里走完：

### 11.1 先想清楚要验证什么

不要试图在网站上把 43 个部件都跑一遍。**真正未知的只有三件事**，用 5 张图就能全部回答：

| 要验证的 | 用哪个部件 | 为什么是它 |
| :--- | :--- | :--- |
| 小尺寸下还认不认得出 | `head_boss_horned`（落位 5×5） | 全表最小，5×5 能立住，别的都能 |
| 细长结构会不会糊成一坨 | `arm_hf_blade`（落位 8×7） | 刃是一条斜线，最容易在小尺寸消失 |
| 俯视视角听不听话 | `tile_window`（落位 24×24） | v1 在这里翻过车（被画成等距透视） |

再加两张做对照：`chest_boss`（体积感 + 红核心焦点）和 `legs_biped`（错步腿，v4 公认最差的一槽）。

### 11.2 网站上的操作步骤

1. 打开 [retrodiffusion.ai](https://retrodiffusion.ai) 登录，进入生成器。
2. **Style 选 `Default`**（对应 API 的 `rd_pro__default`）。别选 Fantasy/Painterly——它们带渐变和抖动，和我们的双阶平涂纪律相反。
3. **尺寸**按下面的表填。这是最容易错的一步：**要填 4 倍尺寸，不是落位尺寸**。模型在 20~48px 才有足够像素表达肩关节和护胫，直接要 5×5 只会得到一团色块。
4. **Prompt** 粘贴下面的原文。**不要改写成中文**，也不要加 "pixel art"。RD 的 style 已经负责渲染，提示词里出现 "pixel art" 会触发风格叠加。
5. **Generate**，下载 PNG。文件名改成**任务 id** 再加后缀（`arm_hf_blade.png`、`head_boss_horned-2.png` 都可以），脚本靠前缀认任务。
6. 全部下载后放进 `trial-in/`，跑 `python3 rd_trial.py`，它会自动抠白底、居中裁到整数倍、块降采样落位，并生成 `trial-out/compare-*.png`（左边是 v4 参考、右边是 RD 结果，都是 1×+10× 并排）。

### 11.3 五张图的精确参数

> 尺寸列给的是 **RD Pro / RD Core** 的值（这两者的最小边足够小）。如果想用最便宜的 **RD Fast**，它最小边是 64，全部填 `64×64`，脚本会自动居中裁切——但 Fast 的细节跟随明显弱于 Pro，验证结论会偏悲观，**建议把 $0.50 花在 RD Core（$0.10/张，正好 5 张）上**。

| 部件 | 网站尺寸 | 落位 | 目标 style | 提示词 |
| :--- | :--- | :--- | :--- | :--- |
| `head_boss_horned` | **20×20** | 5×5 (÷4) | `Default` | a small sharp horned robot commander helmet head only, two short curved horns, narrow red eye slit, aggressive angular jaw plate, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| `chest_boss` | **24×24** | 6×6 (÷4) | `Default` | a headless broad V-shaped robot cuirass, heavy angular shoulder blocks tapering to a narrow waist, no head, no arms, no legs, one large reactor core glowing red just right of center, dark gunmetal steel, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| `legs_biped` | **28×24** | 7×6 (÷4) | `Default` | a pair of nimble armored robot legs only, solid flat-topped hip block at the top, no torso, no arms, staggered walking stride with the front right knee slightly bent forward and the back left foot raised, thick greaves and wide mechanical boots, dark gunmetal steel with one tiny cyan knee light, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| `arm_hf_blade` | **32×28** | 8×7 (÷4) | `Default` | a single cyborg robot arm holding a thin high-frequency katana blade angled diagonally up to the right, shoulder joint at the upper left, slim forearm, the blade edge glowing bright cyan with a white core, dark gunmetal steel plating, three-quarter view facing right, slightly off-center, on a flat white background, centered, one object only, no shadow |
| `tile_window` | **48×48** | 24×24 (÷2) | `Single Tile` | a high-rise window edge seen from directly above: dark metal floor, a thin steel frame, then a vertical glass pane with two bright cyan highlight bars and a black void beyond it with a few tiny distant neon city lights |

### 11.4 免费的锁色与降采样（可选，但强烈建议至少试一次）

落位脚本在本地做了双阶聚色，但网页端有两个免费工具能让你**直接看到 RD 原生像素被压进 24 色板是什么样**：

1. 生成图落到画布后，点 **Palette Converter**（免费）→ 上传 `media/art-samples/palette-24.png` 作为目标色板。
2. 再点 **K-Centroid Downscale**（免费）→ 填落位尺寸（如 `6×6`）。这个工具就是官方版的整数倍块降采样，和脚本里的 `block_downscale` 是同一个算法。
3. 对比"直接缩到 6×6"和"4× 生成再 K-Centroid 降到 6×6"的差别——这就是第四节那套 4× 超采样策略的现场证明。

如果 Palette Converter 的输出比脚本的聚色更好看，说明该把 `cluster_to_palette` 换成"生成时就带 `input_palette`"的路线（API 侧的 `--palette` 开关已经预留）。

### 11.5 怎么判断结果能不能用

只看 **1× 尺寸**，不要被 10× 放大图骗了。三条验收线：

- **能不能一眼认出是什么**：5×5 的头如果只看得出"有个红色小点"，那这个规格本身就该放弃，得把头部槽位放大到 6×6。
- **颜色有没有跑**：RD 可能给金属加了三四个灰阶，落位后聚色成 B2/B3 会损失体积感——如果损失得太多，说明需要保留 3 阶灰（这会推翻 v4 的"双阶平涂"结论，是个重要发现）。
- **轮廓有没有断**：细腿、刃尖这类 1px 结构在 ÷4 后容易断成孤立点，`despeckle` 会把它们清掉，导致剪影残缺。

把这三条的主观评分记下来，再决定要不要给 API 充值跑全表。**如果 5 张全过，$6.30 的全表投入就是安全的；如果有 3 张不过，问题在提示词或规格，充值只会浪费钱。**

### 11.6 一个必须知道的限制

网页端的免费工具**只作用于画布上的图**，不能批量。所以 43 个部件的正式量产仍然必须走 API —— 这一步只是花 $0.50 把风险验证掉，不是替代方案。

### 11.7 想先看整体：整身一次生成（4 张）

逐槽验证回答的是"极限尺寸能不能立住"，但如果你现在想先判断的是**这套材质语言整体好不好看**，那应该先跑整身——一次生成一个完整角色，不拆槽。

代价与边界要说清楚：

- **整身产物不能热插拔。** 它只能用来判断观感（比例、剪影、配色、材质），不能进 5 槽拼装。正式资产仍然必须走分槽路线——v1~v4 的对照组结论（整身直缩的槽位边界糊在一起、换件为零）依然成立。
- **但它极便宜。** 4 张就能覆盖玩家/小兵/Boss/无人机四个体型档，花 $0.40。
- **而且它能提前暴露一个关键风险**：RD 会不会在整身上把"四个背部货舱"画成一堆分不清的装饰块。如果会，说明背部指示块必须继续由代码绘制（v4 的结论），这个信息值 $0.40。

尺寸用 **80×88**（= 20×22 的 4 倍），落到 `rig.py` 的同一张 20×22 画布，这样能和 v4 拼装结果直接并排比。

#### `whole_player` — 玩家 / 拾荒工兵

尺寸 **80×88** / Style `Default` / 4 张约 $0.40（RD Core）

```
a single small cyberpunk robot scavenger standing in a three-quarter view facing right, compact armored body with a narrow waist, amber reactor core in the chest, one arm ending in a chunky yellow hydraulic power fist, two small orange cargo packs mounted on its back, flat amber visor band for a face, staggered leg stance, dark gunmetal steel with only one or two tiny glowing accent pixels, on a flat white background, centered, one object only, no shadow
```

#### `whole_grunt` — 企业安保步兵

尺寸 **80×88** / Style `Default` / 4 张约 $0.40（RD Core）

```
a single small corporate security robot soldier standing in a three-quarter view facing right, compact armored body with a narrow waist, cyan reactor core in the chest, one arm holding a short shock baton with an electric blue tip, one small ice-blue heat sink fin on its back, angled red visor slit for a face, staggered leg stance, dark gunmetal steel with only one or two tiny glowing accent pixels, on a flat white background, centered, one object only, no shadow
```

#### `whole_boss` — 首领：橙刃处刑者

尺寸 **80×88** / Style `Default` / 4 张约 $0.40（RD Core）

```
a single large cyberpunk robot commander standing in a wide three-quarter view facing right, broad V-shaped armored torso tapering to a narrow waist, huge red reactor core in the chest, one arm holding a long legendary high-frequency katana with a gold-orange glowing edge, two short curved horns on its helmet, four orange cargo packs mounted across its back, heavy wide-stance piston legs, dark gunmetal steel with only one or two tiny glowing accent pixels, on a flat white background, centered, one object only, no shadow
```

#### `whole_drone` — 悬浮无人机

尺寸 **80×88** / Style `Default` / 4 张约 $0.40（RD Core）

```
a single small sleek flying drone robot hovering in a three-quarter view facing right, round aerodynamic body with a glowing cyan core, two stubby EMP cannon arms with cyan muzzle rings, two small ice-blue heat sink fins on its back, one round camera lens glowing cyan for a face, no legs, a short cyan jet flame underneath, dark gunmetal steel with only one or two tiny glowing accent pixels, on a flat white background, centered, one object only, no shadow
```

下载后文件名以 `whole_` 开头（`whole_boss.png`、`whole_grunt-2.png`），丢进 `trial-in/` 跑：

```bash
python3 rd_whole.py
```

输出 `trial-out/compare-whole.png`：每个角色左边是 v4 拼装、右边是 RD 一次生成，都是 10× 放大，下方标注实际像素尺寸。

---

## 十二、实测结论（用两张真实出图推翻了 4× 超采样假设）

> ⚠️ **本节有两个地方需要更正，以第十三节为准**：① v4 的基线像素量我报错了 296px（那是 RD 自己的输出），v4 真实值是 136~203px；② 因此"20×22 不适合 RD"的结论是**错的**——20×20 直出实测 203~243px，可用。本节保留作为推理过程，结论请看第十三节。

2026-11-18，用户用网页端免费额度跑了两张整身图（玩家、悬浮无人机），尺寸 80×80。这两张图的量化分析**证伪了本文第四节的核心假设**，必须更正。

### 12.1 决定性证据：RD 不是"小尺寸作画再放大"

如果 RD 是按 80×80 请求、但实际在 20×22 上作画再 4× 放大，那么图像里每个 4×4 块必然完全同色。实测：

| 图 | ÷2 块同色率 | ÷4 块同色率 | 水平边缘跳变位置的 mod 4 分布 |
| :--- | :--- | :--- | :--- |
| 玩家 | 65.2% | **53.8%** | `[17, 18, 17, 17]` 完全均匀 |
| 无人机 | 69.8% | **60.9%** | `[18, 19, 18, 18]` 完全均匀 |

两条证据独立指向同一结论：

- 若是 4× 放大，÷4 块同色率必须接近 100%，实测只有 54~61%；
- 若是 4× 放大，边缘只可能落在 4 的倍数边界，实测 mod 4 分布完全均匀——边缘出现在任意像素位置。

**结论：RD 就是按你请求的 `width×height` 原生作画。** 你要 80×80，它就在 80×80 的网格上画，细节密度是 80×80 的，`÷4` 只是把这份细节压掉 93.75%（16 个像素里只留 1 个）。

### 12.2 这让"4× 超采样"从优势变成了损失

本文第四节建议"按槽位 4× 生成再 ÷4"，理由是"没有模型能在 6×6 上工作"。**这个理由本身没错，但推论错了**：真正该做的是**直接在目标尺寸生成**，而不是生成大图再压。

| 落位路径（同源 80×80 出图） | 结果尺寸 | 聚色后色数 | 不透明像素 |
| :--- | :--- | :--- | :--- |
| ÷4（原方案） | 17×18 | 4 | **202** |
| ÷2 | 34×36 | 4 | 693 |

÷4 之后玩家只剩 202 个不透明像素，而 v4 手工拼装的同尺寸单位是 296 px、5 色。**RD 生成 + ÷4 的信息量反而低于手工拼装**——这正是对比图里 RD 版本看起来"糊成一团、剪影认不出"的原因。

### 12.3 修正后的尺寸策略

| 场景 | 原方案（已否定） | 新方案 |
| :--- | :--- | :--- |
| 槽位部件 | 6×6 的 4 倍 = 24×24，再 ÷4 | **直接请求槽位尺寸本身**，`rd_pro__default` 下限 12px 够用 |
| 整身角色 | 20×22 的 4 倍 = 80×88，再 ÷4 | **直接 40×44 或 20×22 生成**，看 40×44 是否比 20×22 更稳 |
| 地块 | 48×48 再 ÷2 | 直接 24×24（`rd_tile__single_tile` 下限 16） |

`rd_gen.py` 的 `GEN_FACTOR` 已从 4 改为 1，`min_cost_dim()` 仍保留——它的职责变成"把低于 style 下限的尺寸抬到合法值"（如 rd_pro 的 12、rd_tile 的 16），而不是"统一放大 4 倍"。

### 12.4 一个更值得关注的发现：RD 的像素密度远超我们的槽位

两张 80×80 出图各有 **77~78 种颜色**。压进 24 色板后只剩 4 色和 3 色——**损失了 95% 的颜色信息**。

这说明两件事：

1. **RD 的"真像素"是真的，但它的默认美学是 16-bit 级细节**（50~80 色、多阶明暗、抗锯齿边缘），不是我们 `20×22 / 4~6 色 / 双阶平涂` 的极简纪律。我们和 RD 之间不是"清晰度"的差距，是**美术取向的根本冲突**。
2. **在 20×22 这个尺度上，RD 生成的资产打不过手工拼装。** 对比图里 v4 拼装的剪影更清楚、色块更干净、可读性更好，因为它是为这个尺寸专门设计的；RD 是先画一张 80×80 的精细图，再硬压到 20×22，等于让一个画 64×64 的画师去画 16×16。

### 12.5 那么 RD 到底该用在哪

基于实测，重新定位 RD 的适用边界：

| 用途 | 是否适合 RD | 理由 |
| :--- | :--- | :--- |
| **20×22 棋盘单位** | ❌ 不适合 | 细节密度过载，压到目标尺寸后低于手工拼装 |
| **黑市机库的义体检视大图（64~256px）** | ✅ **最合适** | RD 的原生美学正好在这个尺度，且我们本来就没有大图资产 |
| **地块 24×24~48×48** | ⚠️ 可试 | 地块不太需要剪影辨识，主要看材质；但要接受它带 50+ 色 |
| **UI 图标、技能图标、蓝图** | ✅ 适合 | 尺寸 32~96px，正是 RD 舒适区 |
| **概念探索 / 配色试验** | ✅ 适合 | 便宜、快，用来找方向而不是出终稿 |

**这个结论会改变项目的美术管线定位**：v4 的手工/程序化拼装继续负责棋盘资产（它更擅长），RD 负责局外大图与 UI。这与 `game-art-design-research.md` 第 7.3 节"风险 4：20×22 棋盘小人在局外缺乏收藏满足感 → 采用双轨制"的建议完全吻合——**RD 正好补上缺的那一轨**。

### 12.6 待验证（还需 1~2 张图）

上面的结论建立在 2 张 80×80 整身图上。有一个可能性尚未排除：**如果在 24×24 / 20×22 这样的小尺寸直接生成，RD 会不会自动切换到"低细节模式"、反而更接近我们的风格？**

值得花 $0.10 试一张：`head_boss_horned`，尺寸直接填 **20×20**（不放大），看它出的是"精细缩略图"还是"真正的 5×5 级简笔"。这一张能决定 RD 在棋盘资产上是否彻底出局。

---

## 十三、20×20 直出实测：结论反转，并更正第十二节的一个错误

用户用网页端直接生成 20×20（不放大）跑了两张。这一轮数据**反转了第十二节的结论**，同时暴露我在那一节里犯的一个数字错误。

### 13.1 先更正错误：v4 的基线我报错了

第十二节我写：「RD ÷4 只剩 202px，而 v4 手工拼装是 296px，所以 RD 信息量不足」。

**296px 这个数字不是 v4 的，是 RD 自己 80×80÷4 的产物**（`whole_player`）。我把 RD 的输出当成了 v4 的基线，导致结论方向错误。v4 的真实数字：

| v4 单位 | 不透明像素 | 色数 |
| :--- | :--- | :--- |
| grunt | 144 | 5 |
| player | 143 | 5 |
| enforcer | 152 | 5 |
| hacker | 143 | 5 |
| sentry | 159 | 5 |
| drone | 136 | 4 |
| boss | 203 | 6 |

### 13.2 20×20 直出的真实表现：可用

| 方案 | 尺寸 | 聚色后色数 | 不透明像素 |
| :--- | :--- | :--- | :--- |
| v4 手工拼装（均值） | 20×22 | 4~6 | **136~203** |
| RD 80×80 → ÷4 | 17×18 / 18×16 | 3~4 | 168~202 |
| **RD 直接 20×20** | 20×20 | 4 | **203 / 243** |

**20×20 直出的像素量（203、243）反而高于 80×80÷4（168~202），也达到甚至超过 v4 的上限（203）。** 这证明第十二节"直接按目标尺寸生成"的修正方向是对的，而且效果比预期好。

### 13.3 但有一个必须知道的真相：RD 的 20×20 不是"平涂像素画"

这是本轮最有价值的发现。400 个格子的图，颜色数据如下：

| 图 | 非白唯一色 | 平均每色占用 | 只出现 1 次的色 | 夹在两个差异明显邻居之间的像素 |
| :--- | :--- | :--- | :--- | :--- |
| A | 66 种 | 3.1 px | 29 种（44%） | **73%** |
| B | 79 种 | 3.1 px | 27 种（34%） | **81%** |

73~81% 的像素是"介于两个差异明显的邻居之间"的过渡色——**这是抗锯齿/平滑渲染的典型特征**。真正的平涂像素画里，相邻色块之间是硬切的，不该有中间值。

结论：**RD 在 20×20 上画的是一张"极小的平滑插画"，不是"平涂像素画"。** 它满足"1× 真网格"（没有缩放模糊），但不满足我们的"双阶大色块"纪律。

这不算坏事——**我们的管线本来就有 `cluster_to_palette` 这一步**，压完之后就是干净的 4 色：

| 图 | 聚色后 | 结果 |
| :--- | :--- | :--- |
| A | 4 色 | `B3` 98 / `B2` 97 / `CY` 7 / `WB` 1 |
| B | 4 色 | `B3` 103 / `B2` 103 / `OR` 31 / `ORL` 6 |

色数、像素量、剪影密度全部落在 v4 的同一区间。

### 13.4 修正后的最终结论

**第十二节说的"20×22 棋盘单位不适合 RD"是错的。** 正确的结论是：

| 用途 | 第十二节结论 | 修正后 |
| :--- | :--- | :--- |
| 20×22 棋盘单位 | ❌ 不适合 | ✅ **可用，但必须「按目标尺寸直出 + 聚色」，绝不可「生成大图再压」** |
| 黑市机库大图 64~256px | ✅ 最合适 | ✅ 仍然最合适（RD 原生美学本来就吃大尺寸） |
| 地块 24~48px | ⚠️ 可试 | ✅ 可用（同样直出+聚色） |
| UI / 技能图标 | ✅ 适合 | ✅ 适合 |

**关键操作纪律**（这是本轮唯一的硬结论）：

1. **`width`/`height` 直接填目标尺寸**（手臂 6×6、整身 20×20、地块 24×24），不要放大生成。
2. 落位后**必须跑 `cluster_to_palette`**——不是为了省色，而是因为 RD 的输出带 73~81% 的抗锯齿过渡色，不聚色就是一张糊图。
3. 聚色后**色数会掉到 3~4 色**，比 v4 的 4~6 色还少，说明这套流程在色板纪律上是安全的。

### 13.5 唯一还需要人眼判断的事

像素量和色数都达标之后，剩下的是**美术取向**问题：

上表的两张 RD 20×20 出图，剪影比 v4 更"肌肉化"、内部细节更多（更接近 Shattered Pixel Dungeon 的厚实感），而 v4 是更瘦、留白更多的 Caves 微像素风格。**两者都能用，但气质不同。**

这不是技术问题，是风格选择。需要看 8 个敌人同屏排列后才能判断——单看一个都好看，铺满棋盘可能 RD 版本更拥挤。**建议下一步是把已有 4 张 RD 出品和 v4 的 8 个单位拼成一张 12 个单位的对比墙，看哪种更适合 10×7 的棋盘密度。**
