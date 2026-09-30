# Seamless additive textures for Floor Is Lava (black = invisible on Spectacles)
# Usage: python3 tools/make_lava_textures.py Assets/Textures/Lava   (needs numpy + Pillow)
import numpy as np
from PIL import Image
import sys, os
OUT = sys.argv[1] if len(sys.argv) > 1 else "."
rng = np.random.default_rng(7)

def value_noise(w, h, px, py, seed):
    # periodic value noise: px, py lattice cells across the image (wraps exactly)
    r = np.random.default_rng(seed).random((py, px))
    ys, xs = np.mgrid[0:h, 0:w]
    fx = xs / w * px; fy = ys / h * py
    x0 = np.floor(fx).astype(int); y0 = np.floor(fy).astype(int)
    tx = fx - x0; ty = fy - y0
    tx = tx * tx * (3 - 2 * tx); ty = ty * ty * (3 - 2 * ty)
    x1 = (x0 + 1) % px; y1 = (y0 + 1) % py; x0 %= px; y0 %= py
    a = r[y0, x0]; b = r[y0, x1]; c = r[y1, x0]; d = r[y1, x1]
    return (a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty

def fbm(w, h, px, py, octaves, seed):
    total = np.zeros((h, w)); amp = 1.0; norm = 0.0
    for o in range(octaves):
        total += amp * value_noise(w, h, px * 2 ** o, py * 2 ** o, seed + o); norm += amp; amp *= 0.5
    return total / norm

def worley_edges(w, h, cells, warp, seed):
    # periodic Worley F2-F1 (cell borders = cracks), domain-warped
    r = np.random.default_rng(seed)
    pts = (np.arange(cells)[None, :, None] + r.random((cells, cells, 2)).transpose(0, 1, 2))
    gx, gy = np.meshgrid(np.arange(cells), np.arange(cells))
    feat = np.stack([gx + r.uniform(0.2, 0.8, (cells, cells)), gy + r.uniform(0.2, 0.8, (cells, cells))], -1)  # bounded jitter: no coincident points, no blobs
    ys, xs = np.mgrid[0:h, 0:w].astype(float)
    wx = fbm(w, h, 4, 4, 3, seed + 11) - 0.5; wy = fbm(w, h, 4, 4, 3, seed + 23) - 0.5
    u = (xs / w + wx * warp) * cells; v = (ys / h + wy * warp) * cells
    f1 = np.full((h, w), 9.0); f2 = np.full((h, w), 9.0)
    cu = np.floor(u).astype(int); cv = np.floor(v).astype(int)
    for dy in (-1, 0, 1):
        for dx in (-1, 0, 1):
            nx = cu + dx; ny = cv + dy
            fp = feat[ny % cells, nx % cells]
            px_ = fp[..., 0] + (nx - (nx % cells)); py_ = fp[..., 1] + (ny - (ny % cells))
            d = np.sqrt((u - px_) ** 2 + (v - py_) ** 2)
            f2 = np.where(d < f1, f1, np.minimum(f2, d)); f1 = np.minimum(f1, d)
    return f2 - f1

def ramp(t, stops):
    t = np.clip(t, 0, 1); out = np.zeros(t.shape + (3,))
    for (t0, c0), (t1, c1) in zip(stops[:-1], stops[1:]):
        m = (t >= t0) & (t <= t1); k = ((t - t0) / (t1 - t0))[m][:, None]
        out[m] = np.array(c0) * (1 - k) + np.array(c1) * k
    return out

def save(arr, name):
    Image.fromarray(np.clip(arr * 255 + 0.5, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name)); print("wrote", name, arr.shape)

# 1) T_LavaVeins 256x256: bright branching cracks, heat-ramped, black crust
W = H = 256
e1 = worley_edges(W, H, 5, 0.11, 101)          # main cracks
e2 = worley_edges(W, H, 9, 0.08, 202)          # secondary cracks (kept >=3px wide)
main = 1 - np.clip(e1 / 0.16, 0, 1); main = main ** 2.2
fine = (1 - np.clip(e2 / 0.16, 0, 1)) ** 2.5 * 0.18
heat = fbm(W, H, 4, 4, 3, 303)                  # hot and cool stretches along the cracks
t = np.clip((main + fine) * (0.55 + 0.7 * heat), 0, 1)
lava = ramp(t, [(0, (0, 0, 0)), (0.18, (0.35, 0.04, 0.0)), (0.45, (0.95, 0.30, 0.03)), (0.75, (1.0, 0.62, 0.15)), (1.0, (1.0, 0.95, 0.75))])
save(lava, "T_LavaVeins.png")

# 2) T_FlameNoise 128x256: upward-streaked turbulence, grayscale, tiles on both axes
W, H = 128, 256
n = fbm(W, H, 5, 2, 4, 404)
ridge = 1 - np.abs(2 * fbm(W, H, 8, 3, 3, 505) - 1)          # ridged turbulence = licking tongues
flame = np.clip((0.75 * n + 0.25 * ridge ** 4 - 0.33) * 2.6, 0, 1) ** 1.4
save(np.repeat(flame[..., None], 3, -1), "T_FlameNoise.png")

# 3) T_Sparks 128x256: ~55 small soft dots, some streaked upward, black background, wraps
W, H = 128, 256
sp = np.zeros((H, W)); ys, xs = np.mgrid[0:H, 0:W]
r = np.random.default_rng(606)
for i in range(55):
    cx, cy = r.random() * W, r.random() * H
    sx = r.uniform(0.9, 1.5); sy = sx * r.uniform(1.0, 3.5); b = r.uniform(0.55, 1.0)
    dx = (xs - cx + W / 2) % W - W / 2; dy = (ys - cy + H / 2) % H - H / 2
    sp = np.maximum(sp, b * np.exp(-(dx ** 2) / (2 * sx ** 2) - (dy ** 2) / (2 * sy ** 2)))
save(np.repeat(sp[..., None], 3, -1), "T_Sparks.png")
