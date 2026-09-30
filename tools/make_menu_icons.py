# Board icons for the main menu's mode cards, in the game's glowing-tile style (transparent background)
# Usage: python3 tools/make_menu_icons.py Assets/Textures/Menu   (needs numpy + Pillow)
import sys, os
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "."
S = 256
PAD = 22

WHITE = (220, 230, 240)
GREEN = (60, 255, 130)
YELLOW = (255, 225, 60)
BLUE = (60, 150, 255)
RED = (255, 60, 50)
CYAN = (40, 220, 255)
MAGENTA = (240, 70, 220)
ORANGE = (255, 140, 30)
LAVA = (255, 110, 20)
AMBER = (255, 185, 40)


def tiles(n):
    """Tile rectangles for an n x n board, row 0 at the top"""
    size = (S - 2 * PAD) / n
    gap = size * 0.12
    rects = {}
    for z in range(n):
        for x in range(n):
            x0 = PAD + x * size + gap / 2
            y0 = PAD + z * size + gap / 2
            rects[(x, z)] = (x0, y0, x0 + size - gap, y0 + size - gap)
    return rects


def draw_tile(draw, rect, color, lit):
    """A glowing frame; lit tiles also get a filled inner glow"""
    r = (rect[2] - rect[0]) * 0.16
    if lit:
        draw.rounded_rectangle(rect, r, fill=color + (150,), outline=color + (255,), width=5)
    else:
        draw.rounded_rectangle(rect, r, fill=color + (28,), outline=color + (150,), width=3)


def finish(layer, name):
    glow = layer.filter(ImageFilter.GaussianBlur(9))
    out = Image.alpha_composite(glow, layer)
    out = Image.alpha_composite(out, layer)
    out.save(os.path.join(OUT, name))
    print("wrote", name)


def board(n, looks):
    """looks: {(x, z): (color, lit)}; every other tile is a dim white frame"""
    layer = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    for key, rect in tiles(n).items():
        color, lit = looks.get(key, (WHITE, False))
        draw_tile(draw, rect, color, lit)
    return layer, draw


# Classic: a lit path from the yellow start to the blue end
layer, draw = board(4, {
    (0, 3): (YELLOW, True), (1, 3): (GREEN, True), (1, 2): (GREEN, True), (2, 2): (GREEN, True),
    (2, 1): (GREEN, True), (3, 1): (GREEN, True), (3, 0): (BLUE, True),
})
finish(layer, "Icon_Classic.png")

# Minefield: red mines, a blue goal, and the amber caution border
layer, draw = board(4, {(1, 0): (BLUE, True), (0, 1): (RED, True), (2, 1): (RED, True), (1, 2): (RED, True), (3, 3): (RED, True)})
dash = 14
for i in range(PAD - 12, S - PAD + 12, dash * 2):
    for (a, b) in [((i, PAD - 12), (i + dash, PAD - 12)), ((i, S - PAD + 12), (i + dash, S - PAD + 12)),
                   ((PAD - 12, i), (PAD - 12, i + dash)), ((S - PAD + 12, i), (S - PAD + 12, i + dash))]:
        draw.line([a, b], fill=AMBER + (230,), width=5)
for key in [(0, 1), (2, 1), (1, 2), (3, 3)]:
    x0, y0, x1, y1 = tiles(4)[key]
    m = (x1 - x0) * 0.28
    draw.line([(x0 + m, y0 + m), (x1 - m, y1 - m)], fill=(255, 235, 230, 255), width=5)
    draw.line([(x1 - m, y0 + m), (x0 + m, y1 - m)], fill=(255, 235, 230, 255), width=5)
finish(layer, "Icon_Minefield.png")

# Tone Pads: four coloured pads in a diamond around the white home tile
layer, draw = board(3, {(1, 2): (GREEN, True), (0, 1): (CYAN, True), (1, 0): (MAGENTA, True), (2, 1): (ORANGE, True), (1, 1): (WHITE, True)})
for key in [(0, 0), (2, 0), (0, 2), (2, 2)]:
    x0, y0, x1, y1 = tiles(3)[key]
    draw.rounded_rectangle((x0, y0, x1, y1), (x1 - x0) * 0.16, fill=(0, 0, 0, 0), outline=(0, 0, 0, 0))
layer = layer.copy()
cx0, cy0, cx1, cy1 = tiles(3)[(1, 1)]
ImageDraw.Draw(layer).ellipse((cx0 + 18, cy0 + 18, cx1 - 18, cy1 - 18), outline=(255, 255, 255, 255), width=4)
finish(layer, "Icon_TonePads.png")

# Floor Is Lava: molten tiles with cracks and flame tips, one cyan safe tile
layer, draw = board(4, {})
rects = tiles(4)
for key, rect in rects.items():
    if key == (2, 1):
        draw_tile(draw, rect, CYAN, True)
        continue
    if key in [(0, 0), (3, 0), (0, 3), (3, 3), (1, 2)]:
        draw_tile(draw, rect, WHITE, False)
        continue
    draw_tile(draw, rect, LAVA, True)
    x0, y0, x1, y1 = rect
    w = x1 - x0
    draw.line([(x0 + w * 0.2, y0 + w * 0.3), (x0 + w * 0.5, y0 + w * 0.5), (x0 + w * 0.45, y0 + w * 0.8)], fill=(255, 240, 180, 255), width=3)
    draw.line([(x0 + w * 0.5, y0 + w * 0.5), (x0 + w * 0.82, y0 + w * 0.4)], fill=(255, 240, 180, 255), width=3)
# Flame tongues rising from the middle of the board
for (fx, fh) in [(0.36, 0.30), (0.5, 0.42), (0.64, 0.28)]:
    cx = S * fx
    base = S * 0.62
    draw.polygon([(cx - 16, base), (cx, base - S * fh), (cx + 16, base)], fill=(255, 170, 40, 170))
    draw.polygon([(cx - 8, base), (cx, base - S * fh * 0.6), (cx + 8, base)], fill=(255, 240, 170, 220))
finish(layer, "Icon_Lava.png")
