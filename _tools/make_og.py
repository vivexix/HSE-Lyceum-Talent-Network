#!/usr/bin/env python3
"""Generate images/og-cover.png - the Open Graph / Twitter card image.

Run once (or after editing the wording) with:

    python _tools/make_og.py

The output is committed to the repo, so the published site never depends on
this script or on Pillow being installed. Fonts come from the Windows core
set; the card is a flat gradient + type, so nothing here needs the site's
own woff2 files.
"""
import os

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
OUT = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                   "images", "og-cover.png")

BG_TOP = (11, 18, 40)
BG_BOTTOM = (3, 4, 11)
ACCENT = (143, 176, 255)
ACCENT_2 = (155, 107, 255)
INK = (238, 242, 255)
INK_2 = (166, 180, 214)
INK_3 = (108, 122, 156)

FONTS = r"C:\Windows\Fonts"


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def vertical_gradient(size, top, bottom):
    """One-row gradient stretched to full size - cheap and banding-free enough."""
    strip = Image.new("RGB", (1, size[1]))
    px = strip.load()
    for y in range(size[1]):
        t = y / max(1, size[1] - 1)
        px[0, y] = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
    return strip.resize(size, Image.BICUBIC)


def radial_glow(canvas, cx, cy, radius, color, strength):
    """Composite a soft radial light over the canvas.

    The falloff is computed once at 256px and upscaled, which is far cheaper
    than evaluating it per output pixel and is visually identical for a glow
    this soft. The tint is masked rather than screen-blended: a screen blend
    against a *solid* colour would ignore the falloff entirely and paint a
    hard-edged rectangle. The blend region is clipped to the canvas so a glow
    centred near an edge never raises.
    """
    d = 256
    glow = Image.new("L", (d, d), 0)
    g = glow.load()
    c = d / 2
    for y in range(d):
        for x in range(d):
            dist = ((x - c) ** 2 + (y - c) ** 2) ** 0.5 / c
            g[x, y] = 0 if dist >= 1 else round((1 - dist) ** 2 * 255 * strength)

    mask = glow.resize((radius * 2, radius * 2), Image.BICUBIC)
    box = (cx - radius, cy - radius, cx + radius, cy + radius)
    if box[0] < 0 or box[1] < 0 or box[2] > canvas.width or box[3] > canvas.height:
        left, top = max(0, box[0]), max(0, box[1])
        right, bottom = min(canvas.width, box[2]), min(canvas.height, box[3])
        if right <= left or bottom <= top:
            return
        mask = mask.crop((left - box[0], top - box[1], right - box[0], bottom - box[1]))
        box = (left, top, right, bottom)

    tint = Image.new("RGB", mask.size, color)
    canvas.paste(Image.composite(tint, canvas.crop(box), mask), (box[0], box[1]))


def main():
    img = vertical_gradient((W, H), BG_TOP, BG_BOTTOM)
    radial_glow(img, 980, 90, 460, (42, 62, 140), 0.85)
    radial_glow(img, 150, 600, 400, (58, 34, 110), 0.7)

    draw = ImageDraw.Draw(img)

    # Hairline top edge, echoing the site header.
    draw.rectangle([0, 0, W, 3], fill=ACCENT_2)

    # Brand mark: a ring + monogram echoing the site logo. The real logo is
    # near-black (it is designed for a light header), so it is re-tinted light
    # here to stay legible on the dark card.
    cx, cy, r = 108, 116, 42
    draw.ellipse([cx - r, cy - r, cx + r, cy + r], outline=INK, width=4)
    draw.text((cx, cy + 2), "H", font=font("arialbd.ttf", 46), fill=INK, anchor="mm")

    draw.text((cx + r + 28, cy - 26), "HSE LYCEUM", font=font("arialbd.ttf", 30), fill=INK)
    draw.text((cx + r + 28, cy + 12), "TALENT NETWORK",
              font=font("arialbd.ttf", 30), fill=ACCENT)

    draw.text((96, 268), "Informatics class", font=font("arial.ttf", 62), fill=INK)
    draw.text((96, 344), "applicant pool", font=font("arial.ttf", 62), fill=ACCENT)

    draw.text((96, 452), "14 transcribed profiles  \u00b7  searchable  \u00b7  filterable",
              font=font("arial.ttf", 27), fill=INK_2)

    # Mono-style chips along the bottom.
    chips = ["no trackers", "vanilla js", "static site"]
    x = 96
    for label in chips:
        w = draw.textlength(label, font=font("arial.ttf", 22)) + 34
        draw.rounded_rectangle([x, 512, x + w, 552], radius=20,
                               fill=(18, 24, 46), outline=(60, 72, 110), width=2)
        draw.text((x + w / 2, 533), label, font=font("arial.ttf", 22),
                  fill=INK_3, anchor="mm")
        x += w + 14

    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    img.save(OUT, "PNG", optimize=True)
    print("wrote", OUT, os.path.getsize(OUT) // 1024, "KB")


if __name__ == "__main__":
    main()
