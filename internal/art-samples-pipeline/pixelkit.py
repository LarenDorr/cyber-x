"""Cyber-X Caves+ v4 像素后处理工具库：
24 色色相偏移精炼色板（冷靛蓝暗部 → 冰银/暖金亮部）+ 双阶平涂色块归并（Pixel Clustering）+ 孤立单像素噪点清除。"""
from __future__ import annotations

import os

import numpy as np
from PIL import Image, ImageDraw, ImageFont
from scipy import ndimage

ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, "src")
BUILD = os.path.join(ROOT, "build")
OUT = os.path.abspath(os.path.join(ROOT, "..", "..", "media", "art-samples"))
FONT_CJK = "/usr/share/fonts/truetype/wqy/wqy-microhei.ttc"
FONT_MONO = "/usr/share/fonts/truetype/macos/JetBrainsMono-Regular.ttf"


def hx(s: str) -> tuple[int, int, int]:
    s = s.lstrip("#")
    return tuple(int(s[i:i + 2], 16) for i in (0, 2, 4))


# 锁定 24 色色相偏移主色板（7 组短色阶，暗部统一向 224°~228° 冷靛蓝偏移，高光向冰银/暖金偏移，剔除泥泞过渡杂色）
PAL = {
    # 1. 环境与墨线（5）：平静低噪深靛灰底板（地面明度 ≤19%）
    "E0": "#080a11", "E1": "#101522", "E2": "#171f30", "E6": "#2b3650", "ST": "#455373",
    # 2. 机甲冷钢（4）：角色本体仅用 B2（冷钴暗面）+ B3（冰银亮面）双阶大色块平涂！
    "B1": "#2c3650", "B2": "#465575", "B3": "#96a8c4", "B4": "#d6e0ee",
    # 3. 导电与积水青蓝（4）：群青 → 电弧青 → 电芯白
    "WA": "#122459", "WAL": "#2458ab", "CY": "#3be4ff", "WB": "#e2fcff",
    # 4. 极寒冰面（2）：降饱和钢青色，不抢角色 C2 霓虹主权
    "IC": "#3b6b8c", "ICL": "#9ad6f0",
    # 5. 骇客光学翠绿（2）
    "GRD": "#1c8259", "GR": "#4ef595",
    # 6. 橙装 / 货舱 / 工业暖金橙（4）：焦痕 → 暗锈 → 传奇橙 → 暖金
    "SC": "#361612", "ORD": "#993b17", "OR": "#ff8c1a", "ORL": "#ffe066",
    # 7. 红温 / 护目镜猩红与火舌（3）
    "RDD": "#8c1d45", "RD": "#ff335c", "FI": "#ff5526",
}
assert len(PAL) == 24, len(PAL)
PAL_RGB = {k: hx(v) for k, v in PAL.items()}

GREY_RAMP = ["B1", "B2", "B3", "B4"]
INK = "E0"
COLOR_KEYS = ["CY", "WB", "GR", "GRD", "RD", "RDD", "OR", "ORL", "ORD", "IC", "ICL", "FI"]
NEON_KEYS = {"CY", "WB", "GR", "RD", "OR", "ORL", "FI", "ICL"}
NEON_SET = {PAL_RGB[k] for k in NEON_KEYS}


def palette_array(keys):
    return np.array([PAL_RGB[k] for k in keys], dtype=np.float32)


def nearest(rgb: np.ndarray, keys) -> np.ndarray:
    """rgb: (...,3) float → 最近调色板颜色（加权 RGB 距离），返回 (...,3) uint8。"""
    pal = palette_array(keys)
    w = np.array([2.0, 4.0, 3.0], dtype=np.float32)
    d = (((rgb[..., None, :] - pal) ** 2) * w).sum(-1)
    return pal[d.argmin(-1)].astype(np.uint8)


def is_color_in(rgba: np.ndarray, color_set) -> np.ndarray:
    m = np.zeros(rgba.shape[:2], bool)
    for rgb in color_set:
        m |= (rgba[..., :3] == rgb).all(-1) & (rgba[..., 3] > 0)
    return m


def load(path: str) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGB")).astype(np.float32)


def magenta_bg_mask(rgb: np.ndarray) -> np.ndarray:
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    return (np.minimum(r, b) - g) > 60


def hsv_arrays(rgb: np.ndarray):
    mx = rgb.max(-1) / 255.0
    mn = rgb.min(-1) / 255.0
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1e-6), 0)
    return sat, mx


def find_parts(rgb: np.ndarray, min_area=1500, dilate=7):
    """返回按行（y 聚类）再按 x 排序的部件包围盒列表。"""
    fg = ~magenta_bg_mask(rgb)
    fg = ndimage.binary_opening(fg, iterations=1)
    lab, _ = ndimage.label(ndimage.binary_dilation(fg, iterations=dilate))
    boxes = []
    for i, sl in enumerate(ndimage.find_objects(lab), start=1):
        area = int(((lab[sl] == i) & fg[sl]).sum())
        if area >= min_area:
            boxes.append((sl[1].start, sl[0].start, sl[1].stop, sl[0].stop))
    boxes.sort(key=lambda b: (b[1] + b[3]) / 2)
    rows, cur = [], []
    for b in boxes:
        if cur and (b[1] + b[3]) / 2 - (cur[-1][1] + cur[-1][3]) / 2 > 80:
            rows.append(cur)
            cur = []
        cur.append(b)
    if cur:
        rows.append(cur)
    return [sorted(r, key=lambda b: b[0]) for r in rows], fg


def _box_resize(arr: np.ndarray, size) -> np.ndarray:
    return np.asarray(Image.fromarray(arr.astype(np.float32), mode="F").resize(size, Image.BOX))


def downscale_part(rgb, fg, box, target, xstretch=1.0, cov_thr=0.36, neon_thr=0.10, max_neon_px=None):
    """把 AI 源图部件缩到槽位原生尺寸：覆盖率二值 Alpha + 霓虹焦点保护（支持限制最大霓虹像素数）。"""
    x0, y0, x1, y1 = box
    crop = rgb[y0:y1, x0:x1]
    m = fg[y0:y1, x0:x1].astype(np.float32)
    ys, xs = np.nonzero(m)
    crop, m = crop[ys.min():ys.max() + 1, xs.min():xs.max() + 1], m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    h, w = m.shape
    tw, th = target
    s = min(tw / w, th / h)
    sx = min(tw / w, s * xstretch)
    ow, oh = max(1, round(w * sx)), max(1, round(h * s))
    sat, val = hsv_arrays(crop)
    is_greenish = (crop[..., 1] > crop[..., 0] + 25) & (crop[..., 1] > crop[..., 2] + 15)
    neon = (((sat > 0.50) & (val > 0.55)) | (is_greenish & (sat > 0.36) & (val > 0.45))).astype(np.float32) * m
    cov = _box_resize(m, (ow, oh))
    ncov = _box_resize(neon, (ow, oh))
    ratio = ncov / np.maximum(cov, 1e-6)
    alpha = cov > cov_thr
    is_neon = (ratio > neon_thr) & alpha
    if max_neon_px is not None:
        if max_neon_px == 0:
            is_neon = np.zeros_like(alpha)
        else:
            masked_r = np.where(alpha, ratio, 0.0)
            if not is_neon.any() and masked_r.max() > 0.025:
                flat_idx = np.argsort(masked_r.ravel())[::-1][:max_neon_px]
                is_neon = np.zeros_like(alpha)
                for idx in flat_idx:
                    if masked_r.ravel()[idx] > 0.025:
                        is_neon.ravel()[idx] = True
            elif is_neon.sum() > max_neon_px:
                flat_idx = np.argsort(masked_r.ravel())[::-1][:max_neon_px]
                is_neon = np.zeros_like(alpha)
                for idx in flat_idx:
                    is_neon.ravel()[idx] = True
    col = np.stack([_box_resize(crop[..., c] * m, (ow, oh)) for c in range(3)], -1) / np.maximum(cov, 1e-6)[..., None]
    ncol = np.stack([_box_resize(crop[..., c] * neon, (ow, oh)) for c in range(3)], -1) / np.maximum(ncov, 1e-6)[..., None]
    col = np.where(is_neon[..., None], ncol, col)
    return col, alpha, is_neon


def despeckle_binary(lit: np.ndarray, mask: np.ndarray, passes=3) -> np.ndarray:
    """色块归并：翻转在四邻域中完全孤立的单像素色点，将细碎明暗噪点归并为连续平涂色块。"""
    h, w = mask.shape
    for _ in range(passes):
        nl = lit.copy()
        for r in range(h):
            for c in range(w):
                if not mask[r, c]:
                    continue
                nbs = [lit[r + dr, c + dc] for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1))
                       if 0 <= r + dr < h and 0 <= c + dc < w and mask[r + dr, c + dc]]
                if nbs and sum(x == lit[r, c] for x in nbs) == 0:
                    nl[r, c] = not lit[r, c]
        lit = nl
    return lit


def cluster_part(col, alpha, is_neon, accent_keys=None, light_bias=0.45):
    """小尺寸角色专用 2 阶平涂归并量化：
    - 金属仅使用 B2（冷钴暗块）+ B3（冰银亮块）双阶大色块，叠加右上 3/4 受光平面权重并清除单像素噪点；
    - 发光/彩色像素仅吸附到该部件指定的单一色系 accent_keys，杜绝彩虹串色。"""
    h, w = alpha.shape
    out = np.zeros((h, w, 4), np.uint8)
    colored = (alpha & is_neon) if accent_keys else np.zeros_like(alpha)
    grey = alpha & ~colored

    if grey.any():
        lum = (col @ np.array([0.299, 0.587, 0.114], np.float32)) / 255.0
        g_vals = lum[grey]
        lo, hi = (np.percentile(g_vals, 10), np.percentile(g_vals, 90)) if g_vals.size > 2 else (0.0, 1.0)
        norm_l = np.clip((lum - lo) / max(hi - lo, 0.08), 0.0, 1.0)
        yy, xx = np.mgrid[0:h, 0:w].astype(np.float32)
        plane = (1.0 - yy / max(h - 1, 1)) * 0.65 + (xx / max(w - 1, 1)) * 0.35
        score = (1.0 - light_bias) * norm_l + light_bias * plane
        lit = grey & (score >= np.median(score[grey]))
        lit = despeckle_binary(lit, grey, passes=3)
        out[grey & ~lit, :3] = PAL_RGB["B2"]
        out[lit, :3] = PAL_RGB["B3"]

    if colored.any() and accent_keys:
        out[..., :3] = np.where(colored[..., None], nearest(col, accent_keys), out[..., :3])
    out[..., 3] = alpha * 255
    return out


def quantize_part(col, alpha, is_neon, outline=False, grey_cuts=(0.25, 0.65, 0.92),
                  color_keys=None):
    """独立地面道具与整身对照组量化（适配 4 阶 B1~B4 钢灰）。"""
    h, w = alpha.shape
    out = np.zeros((h, w, 4), np.uint8)
    sat, _ = hsv_arrays(col)
    colored = alpha & (is_neon | (sat > (0.25 if color_keys else 0.42)))
    color_keys = color_keys or COLOR_KEYS
    grey = alpha & ~colored
    lum = col @ np.array([0.299, 0.587, 0.114], np.float32)
    if grey.any():
        g = lum[grey]
        qs = np.quantile(g, grey_cuts) if g.size > 3 else np.array([g.min()] * 3)
        idx = np.searchsorted(qs, lum)
        ramp = palette_array(GREY_RAMP).astype(np.uint8)
        out[..., :3] = np.where(grey[..., None], ramp[np.clip(idx, 0, 3)], out[..., :3])
    if colored.any():
        out[..., :3] = np.where(colored[..., None], nearest(col, color_keys), out[..., :3])
    out[..., 3] = alpha * 255
    if outline:
        er = ndimage.binary_erosion(alpha, border_value=0)
        edge = alpha & ~er & ~is_neon
        out[edge, :3] = PAL_RGB[INK]
    return out


def wrap_exterior_outline(spr: np.ndarray, pad=1) -> np.ndarray:
    """在不吞噬内部金属像素的前提下，向精灵外部空白像素扩展 1px E0 墨线轮廓。"""
    if pad > 0:
        can = np.zeros((spr.shape[0] + 2 * pad, spr.shape[1] + 2 * pad, 4), np.uint8)
        can[pad:-pad, pad:-pad] = spr
    else:
        can = spr.copy()
    occ = can[..., 3] > 0
    padded = np.pad(occ, 1, constant_values=False)
    empty_lab, _ = ndimage.label(~padded)
    ext_empty = (empty_lab == empty_lab[0, 0])[1:-1, 1:-1]
    ring = ndimage.binary_dilation(occ) & ext_empty
    can[ring] = (*PAL_RGB[INK], 255)
    return can


def despeckle_tile(tile: np.ndarray, protect_neon=True) -> np.ndarray:
    """清除 24×24 地块在缩图量化后产生的孤立单像素雪花噪点，让背景安静干净。"""
    out = tile.copy()
    h, w = out.shape[:2]
    for r in range(1, h - 1):
        for c in range(1, w - 1):
            cur = tuple(out[r, c, :3])
            if protect_neon and cur in NEON_SET:
                # 仅保留至少与另一颗亮色像素 8-邻接连通的电弧/裂纹，清掉完全孤立的 1px 闪烁碎点
                nbs8 = [tuple(out[r + dr, c + dc, :3]) for dr in (-1, 0, 1) for dc in (-1, 0, 1) if (dr, dc) != (0, 0)]
                if any(nb in NEON_SET for nb in nbs8):
                    continue
            nbs = [tuple(out[r + dr, c + dc, :3]) for dr, dc in ((-1, 0), (1, 0), (0, -1), (0, 1))]
            if cur not in nbs:
                vals, counts = np.unique(np.array(nbs), axis=0, return_counts=True)
                out[r, c, :3] = vals[counts.argmax()]
    return out


def tile_quantize(rgb: np.ndarray, keys, clean=True) -> np.ndarray:
    q = nearest(rgb, keys)
    t = np.dstack([q, np.full(q.shape[:2], 255, np.uint8)])
    return despeckle_tile(t) if clean else t


def add_corner_marks(tile: np.ndarray, color="E6") -> np.ndarray:
    t = tile.copy()
    n = t.shape[0]
    c = (*PAL_RGB[color], 255)
    for (x, y, dx, dy) in [(1, 1, 1, 1), (n - 2, 1, -1, 1), (1, n - 2, 1, -1), (n - 2, n - 2, -1, -1)]:
        t[y, x] = c
        t[y, x + dx] = c
        t[y + dy, x] = c
    return t


def save_rgba(arr: np.ndarray, path: str):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    Image.fromarray(arr, "RGBA").save(path)


def load_rgba(path: str) -> np.ndarray:
    return np.asarray(Image.open(path).convert("RGBA")).copy()


def up(img: Image.Image, k: int) -> Image.Image:
    return img.resize((img.width * k, img.height * k), Image.NEAREST)


def paste(dst: np.ndarray, spr: np.ndarray, x: int, y: int, flip=False):
    if flip:
        spr = spr[:, ::-1]
    h, w = spr.shape[:2]
    H, W = dst.shape[:2]
    sx0, sy0 = max(0, -x), max(0, -y)
    dx0, dy0 = max(0, x), max(0, y)
    dx1, dy1 = min(W, x + w), min(H, y + h)
    if dx1 <= dx0 or dy1 <= dy0:
        return
    s = spr[sy0:sy0 + dy1 - dy0, sx0:sx0 + dx1 - dx0]
    m = s[..., 3] > 0
    dst[dy0:dy1, dx0:dx1][m] = s[m]


def font(size, mono=False):
    return ImageFont.truetype(FONT_MONO if mono else FONT_CJK, size)


def text(draw: ImageDraw.ImageDraw, xy, s, size=18, fill=(220, 228, 240), mono=False, shadow=True):
    f = font(size, mono)
    if shadow:
        draw.text((xy[0] + 1, xy[1] + 1), s, font=f, fill=(0, 0, 0))
    draw.text(xy, s, font=f, fill=fill)


def palette_audit(img: np.ndarray) -> set:
    """返回图中不属于锁定 24 色调色板的颜色（忽略全透明像素）。"""
    a = img.reshape(-1, img.shape[-1])
    if a.shape[1] == 4:
        a = a[a[:, 3] > 0][:, :3]
    allowed = {tuple(v) for v in PAL_RGB.values()}
    return {tuple(c) for c in np.unique(a, axis=0)} - allowed
