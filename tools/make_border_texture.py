# Caution-tape stripes for board borders (black = invisible on Spectacles)
# Usage: python3 tools/make_border_texture.py Assets/Textures/Border   (needs numpy + Pillow)
# 64x64, tileable on both axes: one 45-degree stripe per tile, soft-edged so it doesn't shimmer when it scrolls
import numpy as np
from PIL import Image
import sys, os

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
N = 64
ys, xs = np.mgrid[0:N, 0:N].astype(float)
s = ((xs + ys) / N) % 1.0                    # position across the stripe period
d = np.minimum(np.abs(s - 0.25), 1 - np.abs(s - 0.25))  # distance from the stripe's centre line (wraps)
stripe = np.clip((0.2 - d) / 0.05, 0, 1)      # 40% duty, 5% soft edge each side
img = np.repeat(stripe[..., None], 3, -1)
Image.fromarray((img * 255 + 0.5).astype(np.uint8)).save(os.path.join(OUT, "T_HazardStripes.png"))
print("wrote T_HazardStripes.png", img.shape)
