"""Render the favicon PNGs from the same geometry as favicon.svg (64-unit grid, drawn at 8x)."""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
K = 8
RED, CREAM, INK, OCHRE = (194, 47, 27), (244, 236, 220), (27, 24, 20), (209, 154, 40)


def u(*v):
    return [x * K for x in v]


def render():
    tile = Image.new("RGBA", (64 * K, 64 * K), (0, 0, 0, 0))
    ImageDraw.Draw(tile).rounded_rectangle(u(0, 0, 64, 64), radius=9 * K, fill=RED)

    band = Image.new("RGBA", tile.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(band)
    for y in (25.5, 29.8, 34.2, 38.5):  # fringe
        d.line(u(3, y, 8, y), fill=CREAM, width=int(2.2 * K))
        d.line(u(56, y, 61, y), fill=CREAM, width=int(2.2 * K))
        for x in (3, 61):
            d.ellipse(u(x - 1.1, y - 1.1, x + 1.1, y + 1.1), fill=CREAM)
    d.rounded_rectangle(u(8, 22, 56, 42), radius=int(1.5 * K), fill=CREAM)
    for x, w, c in ((13, 5, INK), (46, 5, INK), (26, 12, OCHRE), (30.5, 3, INK)):
        d.rectangle(u(x, 22, x + w, 42), fill=c)
    band = band.rotate(38, resample=Image.BICUBIC, center=(32 * K, 32 * K))

    # keep the band inside the rounded tile
    mask = tile.split()[3]
    clipped = Image.new("RGBA", tile.size, (0, 0, 0, 0))
    clipped.paste(band, (0, 0), Image.composite(band.split()[3], Image.new("L", tile.size, 0), mask))
    return Image.alpha_composite(tile, clipped)


if __name__ == "__main__":
    big = render()
    for size, name in ((180, "apple-touch-icon.png"), (32, "favicon-32.png"), (16, "favicon-16.png")):
        big.resize((size, size), Image.LANCZOS).save(os.path.join(ROOT, name), optimize=True)
    big.resize((48, 48), Image.LANCZOS).save(os.path.join(ROOT, "favicon.ico"), sizes=[(16, 16), (32, 32), (48, 48)])
    print("favicons written")
