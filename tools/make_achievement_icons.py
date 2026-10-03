# Generates the Minefield, Tone Pads and Floor Is Lava achievement icons in the style of the Classic ones:
# a dark tile with a glowing isometric floor tile, the mode's symbol lying on it, a green check and a label.
# Run: python3 tools/make_achievement_icons.py  (writes Assets/Textures/achivment_icons/<id>.png, 512x512)
import math
import os
from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

OUT = os.environ.get("ICON_OUT") or os.path.join(os.path.dirname(__file__), "..", "Assets", "Textures", "achivment_icons")
SIZE = 512
FONT = "/System/Library/Fonts/Supplemental/Arial Rounded Bold.ttf"

RED = (255, 70, 60)
MAGENTA = (225, 80, 255)
ORANGE = (255, 104, 18)  # deeper than the menu orange: the glow adds back the yellow
GREEN = (60, 240, 120)
GOLD = (255, 205, 70)
ICE = (120, 220, 255)

# id: (tile colour, symbol, symbol colour, label, label colour, crown)
ICONS = {
    "safe_crossing": (RED, "mine", RED, "1", RED, False),
    "mine_dodger": (RED, "mine", RED, "3", RED, False),
    "minefield_master": (RED, "mine", RED, "6", GOLD, True),
    "light_feet": (RED, "foot", (255, 150, 140), "1st", RED, False),
    "untouchable": (RED, "shield", GOLD, "ALL", GOLD, False),
    "first_tune": (MAGENTA, "note", MAGENTA, "1", MAGENTA, False),
    "in_tune": (MAGENTA, "note", MAGENTA, "3", MAGENTA, False),
    "maestro": (MAGENTA, "note", MAGENTA, "6", GOLD, True),
    "perfect_pitch": (MAGENTA, "note_star", MAGENTA, "1st", MAGENTA, False),
    "long_memory": (MAGENTA, "notes", MAGENTA, "10", MAGENTA, False),
    "hot_feet": (ORANGE, "flame", ORANGE, "1", ORANGE, False),
    "fire_walker": (ORANGE, "flame", ORANGE, "3", ORANGE, False),
    "lava_lord": (ORANGE, "flame", ORANGE, "6", GOLD, True),
    "not_even_warm": (ORANGE, "snow", ICE, "1st", ICE, False),
    "survivor": (ORANGE, "flame", GOLD, "50", GOLD, False),
}


def neon(layer):
    """Glow: a soft halo and a tight halo under the crisp line (kept light so warm colours don't wash to yellow)"""
    wide = layer.filter(ImageFilter.GaussianBlur(20))
    tight = layer.filter(ImageFilter.GaussianBlur(5))
    return ImageChops.add(ImageChops.add(wide, tight), layer)


def background():
    img = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    d.rounded_rectangle((6, 6, SIZE - 6, SIZE - 6), 46, fill=(12, 16, 22, 255), outline=(40, 70, 70, 255), width=4)
    grid = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    g = ImageDraw.Draw(grid)
    for k in range(-SIZE, 2 * SIZE, 34):
        g.line([(k, 0), (k + SIZE, SIZE / 2)], fill=(30, 50, 60, 60), width=1)
        g.line([(k, SIZE), (k + SIZE, SIZE / 2)], fill=(30, 50, 60, 60), width=1)
    mask = Image.new("L", (SIZE, SIZE), 0)
    ImageDraw.Draw(mask).rounded_rectangle((10, 10, SIZE - 10, SIZE - 10), 42, fill=255)
    img.paste(grid, (0, 0), ImageChops.multiply(grid.split()[3], mask))
    return img


def tile(color):
    """Isometric floor tile: a glowing diamond outline with a faint inner frame and a thin front edge"""
    cx, cy, hw, hh, depth = 256, 340, 175, 88, 16
    top = [(cx, cy - hh), (cx + hw, cy), (cx, cy + hh), (cx - hw, cy)]
    inner = [(cx, cy - hh + 22), (cx + hw - 44, cy), (cx, cy + hh - 22), (cx - hw + 44, cy)]
    fill = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(fill).polygon(top, fill=color + (38,))
    lines = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(lines)
    d.line(top + [top[0]], fill=color + (255,), width=7, joint="curve")
    d.line([(cx - hw, cy), (cx - hw, cy + depth), (cx, cy + hh + depth), (cx + hw, cy + depth), (cx + hw, cy)], fill=color + (200,), width=4, joint="curve")
    d.line(inner + [inner[0]], fill=color + (110,), width=3, joint="curve")
    return Image.alpha_composite(fill, neon(lines))


def symbol(kind, color):
    """Draws the symbol upright on a square canvas; it's laid onto the tile afterwards"""
    s = 300
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    c = color + (255,)
    m = s / 2
    w = 12
    if kind == "mine":
        d.ellipse((m - 62, m - 62, m + 62, m + 62), outline=c, width=w)
        for i in range(8):
            a = i * math.pi / 4
            x1, y1 = m + 62 * math.cos(a), m + 62 * math.sin(a)
            x2, y2 = m + 96 * math.cos(a), m + 96 * math.sin(a)
            d.line([(x1, y1), (x2, y2)], fill=c, width=w)
            d.ellipse((x2 - 10, y2 - 10, x2 + 10, y2 + 10), fill=c)
        d.ellipse((m - 28, m - 34, m - 6, m - 12), fill=c)
    elif kind == "foot":
        sole = [(0, 112), (-30, 104), (-42, 66), (-36, 16), (-46, -36), (-32, -72), (0, -84), (30, -68), (40, -28),
                (30, 22), (36, 70), (26, 102), (0, 112)]
        d.line([(m + x, m + 20 + y) for x, y in sole], fill=c, width=w, joint="curve")
        for dx, dy, r in [(-34, -100, 15), (-8, -112, 14), (16, -110, 12), (36, -100, 10), (52, -86, 9)]:
            d.ellipse((m + dx - r, m + dy - r, m + dx + r, m + dy + r), outline=c, width=7)
    elif kind == "shield":
        pts = [(m, m - 105), (m + 90, m - 70), (m + 78, m + 30), (m, m + 110), (m - 78, m + 30), (m - 90, m - 70), (m, m - 105)]
        d.line(pts, fill=c, width=w, joint="curve")
        star = []
        for i in range(10):
            a = -math.pi / 2 + i * math.pi / 5
            r = 46 if i % 2 == 0 else 19
            star.append((m + r * math.cos(a), m - 5 + r * math.sin(a)))
        d.line(star + [star[0]], fill=c, width=7, joint="curve")
    elif kind in ("note", "notes", "note_star"):
        def note(x, y, scale):
            d.ellipse((x - 34 * scale, y - 24 * scale, x + 34 * scale, y + 24 * scale), outline=c, width=w)
            d.line([(x + 30 * scale, y - 6 * scale), (x + 30 * scale, y - 140 * scale)], fill=c, width=w)
            d.line([(x + 30 * scale, y - 140 * scale), (x + 78 * scale, y - 104 * scale), (x + 66 * scale, y - 70 * scale)], fill=c, width=w, joint="curve")
        if kind == "note":
            note(m - 20, m + 70, 1.0)
        elif kind == "note_star":
            note(m - 40, m + 70, 1.0)
            star = []
            for i in range(8):
                a = -math.pi / 2 + i * math.pi / 4
                r = 44 if i % 2 == 0 else 12
                star.append((m + 70 + r * math.cos(a), m - 60 + r * math.sin(a)))
            d.line(star + [star[0]], fill=GOLD + (255,), width=7, joint="curve")
        else:
            note(m - 70, m + 76, 0.8)
            note(m + 40, m + 50, 0.8)
    elif kind == "fork":
        d.arc((m - 52, m - 120, m + 52, m + 10), 0, 180, fill=c, width=w)
        d.line([(m - 52, m - 55), (m - 52, m - 120)], fill=c, width=w)
        d.line([(m + 52, m - 55), (m + 52, m - 120)], fill=c, width=w)
        d.line([(m, m + 10), (m, m + 110)], fill=c, width=w)
        for r in (78, 104):
            d.arc((m - r, m - 64 - r, m + r, m - 64 + r), 200, 240, fill=c, width=5)
            d.arc((m - r, m - 64 - r, m + r, m - 64 + r), 300, 340, fill=c, width=5)
    elif kind == "flame":
        outline = [(0, 108), (52, 92), (82, 50), (84, 0), (66, -44), (52, -20), (46, -62), (22, -100), (0, -128),
                   (-10, -88), (-34, -60), (-46, -88), (-70, -34), (-84, 14), (-74, 62), (-46, 96), (0, 108)]
        d.line([(m + x, m + y * 0.95 + 10) for x, y in outline], fill=c, width=w, joint="curve")
        inner = [(0, 96), (30, 80), (42, 44), (32, 4), (10, -34), (2, -10), (-18, -40), (-34, 0), (-40, 46), (-26, 80), (0, 96)]
        d.line([(m + x, m + y * 0.95 + 10) for x, y in inner], fill=c, width=7, joint="curve")
    elif kind == "snow":
        for i in range(6):
            a = i * math.pi / 3
            x2, y2 = m + 100 * math.cos(a), m + 100 * math.sin(a)
            d.line([(m, m), (x2, y2)], fill=c, width=w)
            for t in (0.55, 0.8):
                bx, by = m + 100 * t * math.cos(a), m + 100 * t * math.sin(a)
                for side in (-1, 1):
                    b = a + side * math.pi / 4
                    d.line([(bx, by), (bx + 26 * math.cos(b), by + 26 * math.sin(b))], fill=c, width=6)
    return img


def lay_on_tile(glyph):
    """Isometric projection: rotate 45 degrees, squash to half height, centre on the tile"""
    rotated = glyph.rotate(45, resample=Image.BICUBIC, expand=True)
    w, h = rotated.size
    flat = rotated.resize((int(w * 1.18), int(h * 0.6)), Image.LANCZOS)
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    layer.paste(flat, (256 - flat.size[0] // 2, 336 - flat.size[1] // 2), flat)
    return neon(layer)


def crown(color):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    cx, base = 256, 252
    pts = [(cx - 62, base), (cx - 72, base - 62), (cx - 34, base - 30), (cx, base - 78), (cx + 34, base - 30), (cx + 72, base - 62), (cx + 62, base), (cx - 62, base)]
    d.line(pts, fill=color + (255,), width=8, joint="curve")
    return neon(layer)


def check():
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    ImageDraw.Draw(layer).line([(70, 118), (112, 160), (196, 72)], fill=GREEN + (255,), width=16, joint="curve")
    return neon(layer)


def label(text, color):
    layer = Image.new("RGBA", (SIZE, SIZE), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    size = 170 if len(text) == 1 else (132 if len(text) == 2 else 104)
    font = ImageFont.truetype(FONT, size)
    box = d.textbbox((0, 0), text, font=font, stroke_width=7)
    x = 448 - (box[2] - box[0])
    y = 168 - (box[3] - box[1])
    d.text((x - box[0], y - box[1]), text, font=font, fill=(0, 0, 0, 0), stroke_width=7, stroke_fill=color + (255,))
    return neon(layer)


def make(icon_id, spec):
    tile_color, kind, symbol_color, text, text_color, has_crown = spec
    img = background()
    for part in (tile(tile_color), lay_on_tile(symbol(kind, symbol_color)), check(), label(text, text_color)):
        img = Image.alpha_composite(img, part)
    if has_crown:
        img = Image.alpha_composite(img, crown(GOLD))
    img.save(os.path.join(OUT, icon_id + ".png"))


if __name__ == "__main__":
    for icon_id, spec in ICONS.items():
        make(icon_id, spec)
    print("wrote", len(ICONS), "icons to", os.path.normpath(OUT))
