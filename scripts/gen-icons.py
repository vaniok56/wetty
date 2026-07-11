#!/usr/bin/env python3
"""Generate PWA icons.

No ImageMagick, no Pillow, no rsvg on this box — so we emit PNGs by hand.
A PNG is just a signature plus IHDR/IDAT/IEND chunks, and IDAT is zlib over
scanlines each prefixed with a filter byte. That is the whole format for our
purposes.

Draws a terminal prompt glyph: a chevron and an underscore caret, in the app's
accent colours on the app's background.
"""
import struct
import zlib
from pathlib import Path

BG = (0x05, 0x07, 0x0A, 0xFF)
CHEVRON = (0x7C, 0xE2, 0xC3, 0xFF)   # accent-2
CARET = (0x8A, 0xB4, 0xFF, 0xFF)     # accent
PANEL = (0x0D, 0x11, 0x17, 0xFF)


def png_bytes(pixels, w, h):
    """pixels: list of rows, each a list of (r,g,b,a)."""
    raw = bytearray()
    for row in pixels:
        raw.append(0)  # filter type 0 (None)
        for r, g, b, a in row:
            raw += bytes((r, g, b, a))

    def chunk(tag, data):
        c = struct.pack('>I', len(data)) + tag + data
        return c + struct.pack('>I', zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0)  # 8-bit RGBA
    return (
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', ihdr)
        + chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        + chunk(b'IEND', b'')
    )


def blend(dst, src):
    a = src[3] / 255.0
    return tuple(int(src[i] * a + dst[i] * (1 - a)) for i in range(3)) + (255,)


def make(size, maskable=False):
    # Maskable icons get cropped to a circle by the launcher; keep the art
    # inside the 80% safe zone and let the background bleed to the edges.
    scale = 0.62 if maskable else 0.80
    px = [[BG for _ in range(size)] for _ in range(size)]

    # rounded panel backdrop (skipped for maskable: it would get clipped)
    if not maskable:
        pad = int(size * 0.07)
        radius = int(size * 0.18)
        for y in range(pad, size - pad):
            for x in range(pad, size - pad):
                dx = min(x - pad, size - pad - 1 - x)
                dy = min(y - pad, size - pad - 1 - y)
                if dx < radius and dy < radius:
                    if (radius - dx) ** 2 + (radius - dy) ** 2 > radius ** 2:
                        continue
                px[y][x] = PANEL

    cx, cy = size / 2, size / 2
    art = size * scale
    stroke = max(2, int(art * 0.085))

    # chevron ">" occupying the left half of the art box
    x0 = cx - art * 0.34
    y0 = cy - art * 0.26
    y1 = cy + art * 0.26
    apex_x = cx - art * 0.02

    def stamp(x, y, colour):
        xi, yi = int(round(x)), int(round(y))
        rad = stroke // 2
        for j in range(yi - rad, yi + rad + 1):
            for i in range(xi - rad, xi + rad + 1):
                if 0 <= i < size and 0 <= j < size:
                    if (i - xi) ** 2 + (j - yi) ** 2 <= rad * rad:
                        px[j][i] = blend(px[j][i], colour)

    steps = int(art * 2)
    for s in range(steps + 1):
        t = s / steps
        stamp(x0 + (apex_x - x0) * t, y0 + (cy - y0) * t, CHEVRON)   # upper arm
        stamp(apex_x + (x0 - apex_x) * t, cy + (y1 - cy) * t, CHEVRON)  # lower

    # underscore caret to the right
    ux0 = cx + art * 0.10
    ux1 = cx + art * 0.36
    uy = cy + art * 0.24
    for s in range(int(ux1 - ux0) + 1):
        stamp(ux0 + s, uy, CARET)

    return png_bytes(px, size, size)


out = Path(__file__).resolve().parent.parent / 'src' / 'assets' / 'icons'
out.mkdir(parents=True, exist_ok=True)

targets = [
    ('icon-180.png', 180, False),
    ('icon-192.png', 192, False),
    ('icon-512.png', 512, False),
    ('icon-maskable-512.png', 512, True),
]
for name, size, maskable in targets:
    data = make(size, maskable)
    (out / name).write_bytes(data)
    print(f'{name}: {size}x{size}, {len(data)} bytes')
