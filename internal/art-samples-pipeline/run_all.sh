#!/usr/bin/env bash
# 一键重建全部样张：src/*.jpg（AI 源图）→ build/（原生部件 / 地块）→ media/art-samples/*.png
set -euo pipefail
cd "$(dirname "$0")"
python3 -c "import PIL, numpy, scipy" 2>/dev/null || pip install pillow numpy scipy
python3 extract_parts.py
python3 make_enemies_sheet.py
python3 make_tiles_sheet.py
python3 make_mockup.py
python3 preview_parts.py

# 可选：走 Retro Diffusion 量产路径（需 RD_API_KEY；未设置则整段跳过）
if [[ -n "${RD_API_KEY:-}" ]]; then
  python3 rd_gen.py gen
  python3 rd_gen.py promote
  python3 make_enemies_sheet.py
  python3 make_tiles_sheet.py
  python3 make_mockup.py
fi
