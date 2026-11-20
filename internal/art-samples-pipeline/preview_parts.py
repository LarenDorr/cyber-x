"""调试用：把 build/ 下所有部件 / 地块按 8× 最近邻平铺成一张预览图。"""
import glob
import os

from PIL import Image

from pixelkit import BUILD, up

files = sorted(glob.glob(os.path.join(BUILD, "parts", "*.png"))) + sorted(glob.glob(os.path.join(BUILD, "tiles", "*.png")))
cell, cols = 8 * 26, 8
sheet = Image.new("RGBA", (cell * cols, cell * ((len(files) + cols - 1) // cols)), (40, 20, 50, 255))
for i, f in enumerate(files):
    im = up(Image.open(f).convert("RGBA"), 8)
    sheet.alpha_composite(im, ((i % cols) * cell + 4, (i // cols) * cell + 4))
sheet.save(os.path.join(BUILD, "preview_parts.png"))
print(len(files))
