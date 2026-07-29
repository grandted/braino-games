#!/usr/bin/env python3
"""Render the Braino Games mark to the PNGs a home screen needs.

Run from the project root, only when the mark in public/favicon.svg changes:

    python3 scripts/icons.py

Nothing in the build calls this — the PNGs it writes are committed. It exists
so those binaries are reproducible rather than mystery files, and so the mark
lives in exactly one place: change favicon.svg, mirror the numbers below, run
this again.

Pure standard library on purpose. The project has no runtime dependencies and
no asset pipeline, and a home screen icon is not a good enough reason to grow
either. That rules out rasterising the SVG itself, so the geometry is
transcribed here and drawn with signed distance fields — every shape in the
mark (rounded rect, round-capped stroke, circle) has an exact one, which is
also how the edges come out antialiased without supersampling.
"""

import struct
import zlib
from math import hypot
from pathlib import Path

# --- the mark, transcribed from public/favicon.svg (48x48 viewBox) ---------

BG = (0x0A, 0x0A, 0x0F)
EDGE = (0xCB, 0xA6, 0xF7)
EDGE_ALPHA = 0.55
STROKE_HALF = 1.0  # stroke-width: 2
CORNER = 11.0  # rx on the backing rect

EDGES = [
    ((15, 16), (26, 12)),
    ((15, 16), (14, 28)),
    ((26, 12), (34, 20)),
    ((34, 20), (27, 31)),
    ((14, 28), (27, 31)),
    ((26, 12), (27, 31)),
]

NODES = [
    (26, 12, 5.0, (0xF9, 0xE2, 0xAF)),
    (34, 20, 4.0, (0xF3, 0x8B, 0xA8)),
    (27, 31, 5.0, (0x89, 0xB4, 0xFA)),
    (14, 28, 4.0, (0xA6, 0xE3, 0xA1)),
    (15, 16, 3.5, (0xCB, 0xA6, 0xF7)),
]

# The cluster does not sit centred in the 48-box — it leans up and left. A
# maskable icon has to be centred on its own art or the safe zone clips it,
# so measure rather than assume.
ART_MIN_X = min(x - r for x, _, r, _ in NODES)
ART_MAX_X = max(x + r for x, _, r, _ in NODES)
ART_MIN_Y = min(y - r for _, y, r, _ in NODES)
ART_MAX_Y = max(y + r for _, y, r, _ in NODES)
ART_CX = (ART_MIN_X + ART_MAX_X) / 2
ART_CY = (ART_MIN_Y + ART_MAX_Y) / 2
ART_SPAN = max(ART_MAX_X - ART_MIN_X, ART_MAX_Y - ART_MIN_Y)


# --- distance fields ------------------------------------------------------


def sd_round_rect(px, py, half, radius):
    """Signed distance to a square of half-extent `half`, corners rounded."""
    qx = abs(px) - half + radius
    qy = abs(py) - half + radius
    outside = hypot(max(qx, 0.0), max(qy, 0.0))
    return outside + min(max(qx, qy), 0.0) - radius


def sd_segment(px, py, ax, ay, bx, by):
    """Signed distance to the line segment ab — a capsule once inset."""
    pax, pay = px - ax, py - ay
    bax, bay = bx - ax, by - ay
    denom = bax * bax + bay * bay
    t = 0.0 if denom == 0 else max(0.0, min(1.0, (pax * bax + pay * bay) / denom))
    return hypot(pax - bax * t, pay - bay * t)


def coverage(distance):
    """Distance in pixels to alpha, giving a one-pixel antialiased edge."""
    return max(0.0, min(1.0, 0.5 - distance))


def over(src, alpha, dst):
    """Composite src over dst. Both premultiplied-free, alpha in 0..1."""
    if alpha <= 0:
        return dst
    if alpha >= 1:
        return src
    return tuple(s * alpha + d * (1 - alpha) for s, d in zip(src, dst))


# --- rendering ------------------------------------------------------------


def render(size, *, rounded, opaque, art_fraction=None):
    """One icon.

    rounded       draw the backing rect's rounded corners (a home screen that
                  masks the icon itself wants a full bleed square instead)
    opaque        no alpha channel at all — iOS composites a transparent
                  apple-touch-icon onto white, which would wreck a dark mark
    art_fraction  if set, ignore the 48-box framing and scale the cluster to
                  this fraction of the canvas, centred on the art's own
                  bounding box. This is what keeps a maskable icon inside its
                  safe zone.
    """
    if art_fraction is None:
        k = size / 48.0
        cx48, cy48 = 24.0, 24.0
    else:
        k = art_fraction * size / ART_SPAN
        cx48, cy48 = ART_CX, ART_CY

    half = size / 2.0

    def to_px(x, y):
        return (x - cx48) * k + half, (y - cy48) * k + half

    edges = [(*to_px(*a), *to_px(*b)) for a, b in EDGES]
    nodes = [(*to_px(x, y), r * k, colour) for x, y, r, colour in NODES]
    stroke_half = STROKE_HALF * k
    corner = CORNER * k

    rows = []
    for py in range(size):
        y = py + 0.5
        row = bytearray()
        for px in range(size):
            x = px + 0.5

            if rounded:
                bg_alpha = coverage(sd_round_rect(x - half, y - half, half, corner))
            else:
                bg_alpha = 1.0

            if bg_alpha <= 0:
                row += b"\x00\x00\x00\x00" if not opaque else bytes(BG)
                continue

            colour = BG
            for ax, ay, bx, by in edges:
                a = coverage(sd_segment(x, y, ax, ay, bx, by) - stroke_half)
                if a > 0:
                    colour = over(EDGE, a * EDGE_ALPHA, colour)
            for nx, ny, r, node_colour in nodes:
                a = coverage(hypot(x - nx, y - ny) - r)
                if a > 0:
                    colour = over(node_colour, a, colour)

            r8, g8, b8 = (int(c + 0.5) for c in colour)
            if opaque:
                row += bytes((r8, g8, b8))
            else:
                row += bytes((r8, g8, b8, int(bg_alpha * 255 + 0.5)))
        rows.append(bytes(row))
    return rows


def write_png(path, rows, width, opaque):
    colour_type = 2 if opaque else 6
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, payload):
        body = tag + payload
        return (
            struct.pack(">I", len(payload))
            + body
            + struct.pack(">I", zlib.crc32(body) & 0xFFFFFFFF)
        )

    png = (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, len(rows), 8, colour_type, 0, 0, 0))
        + chunk(b"IDAT", zlib.compress(raw, 9))
        + chunk(b"IEND", b"")
    )
    path.write_bytes(png)
    print(f"  {path}  {width}x{len(rows)}  {len(png) / 1024:.1f} kB")


# --- iOS launch screens ---------------------------------------------------

# Logical size and pixel ratio of every device we care to greet properly.
# Safari matches these against device-width/height, which stay portrait-side
# even in landscape, so each entry yields two images.
DEVICES = [
    (320, 568, 2),  # SE (1st), 5s
    (375, 667, 2),  # SE (2nd/3rd), 6-8
    (414, 736, 3),  # 8 Plus
    (375, 812, 3),  # X, XS, 11 Pro, 12/13 mini
    (414, 896, 2),  # XR, 11
    (414, 896, 3),  # XS Max, 11 Pro Max
    (390, 844, 3),  # 12, 13, 14
    (393, 852, 3),  # 14 Pro, 15, 16
    (402, 874, 3),  # 16 Pro
    (428, 926, 3),  # 12/13 Pro Max, 14 Plus
    (430, 932, 3),  # 14 Pro Max, 15 Plus/Pro Max, 16 Plus
    (440, 956, 3),  # 16 Pro Max
    (768, 1024, 2),  # iPad, iPad mini
    (810, 1080, 2),  # iPad 10.2"
    (820, 1180, 2),  # iPad Air 10.9"
    (834, 1112, 2),  # iPad Pro 10.5"
    (834, 1194, 2),  # iPad Pro 11"
    (1024, 1366, 2),  # iPad Pro 12.9"
]


def render_splash(width, height):
    """Flat background with the mark centred.

    Drawn as a band rather than pixel by pixel: these are up to 3.8 megapixels
    and all but a small square of that is one flat colour, which would be a
    minute of arithmetic to reach the same bytes.
    """
    tile_size = max(96, int(min(width, height) * 0.30))
    tile = render(tile_size, rounded=False, opaque=True, art_fraction=0.86)

    background = bytes(BG) * width
    top = (height - tile_size) // 2
    left = (width - tile_size) // 2
    prefix = bytes(BG) * left
    suffix = bytes(BG) * (width - left - tile_size)

    rows = []
    for y in range(height):
        if top <= y < top + tile_size:
            rows.append(prefix + tile[y - top] + suffix)
        else:
            rows.append(background)
    return rows


def splash_links():
    """The <link> tags index.html needs, printed for pasting."""
    lines = []
    for logical_w, logical_h, dpr in DEVICES:
        for orientation in ("portrait", "landscape"):
            w, h = logical_w * dpr, logical_h * dpr
            if orientation == "landscape":
                w, h = h, w
            media = (
                f"(device-width: {logical_w}px) and (device-height: {logical_h}px) "
                f"and (-webkit-device-pixel-ratio: {dpr}) "
                f"and (orientation: {orientation})"
            )
            lines.append(
                f'    <link rel="apple-touch-startup-image" '
                f'href="/splash/{w}x{h}.png" media="{media}" />'
            )
    return lines


def main():
    out = Path(__file__).resolve().parent.parent / "public"
    out.mkdir(exist_ok=True)
    print("rendering icons:")

    # Manifest icons. Rounded and transparent-cornered: Android draws these
    # as-is when it has no maskable to mask.
    for size in (192, 512):
        write_png(out / f"icon-{size}.png", render(size, rounded=True, opaque=False), size, False)

    # Maskable: full bleed, art well inside the safe zone, because the
    # launcher will crop this to whatever silhouette it likes.
    write_png(
        out / "icon-maskable-512.png",
        render(512, rounded=False, opaque=True, art_fraction=0.58),
        512,
        True,
    )

    # iOS. Square and opaque — it rounds the corners itself, and it has no
    # alpha channel to give back. Scaled off the art rather than the 48-box:
    # that framing is tuned for a 16px favicon, and at tile size it leaves the
    # mark adrift in the middle of a black square.
    write_png(
        out / "apple-touch-icon.png",
        render(180, rounded=False, opaque=True, art_fraction=0.64),
        180,
        True,
    )

    # iOS launch screens. Without these an installed app flashes white on
    # every cold start, which is the one detail that gives away a web app
    # pretending to be a native one.
    splash = out / "splash"
    splash.mkdir(exist_ok=True)
    print("rendering launch screens:")
    seen = set()
    total = 0
    for logical_w, logical_h, dpr in DEVICES:
        for w, h in (
            (logical_w * dpr, logical_h * dpr),
            (logical_h * dpr, logical_w * dpr),
        ):
            if (w, h) in seen:
                continue
            seen.add((w, h))
            path = splash / f"{w}x{h}.png"
            write_png(path, render_splash(w, h), w, True)
            total += path.stat().st_size
    print(f"  {len(seen)} launch screens, {total / 1024:.0f} kB total")

    links = Path(__file__).resolve().parent / "splash-links.html"
    links.write_text("\n".join(splash_links()) + "\n")
    print(f"  link tags for index.html written to {links}")


if __name__ == "__main__":
    main()
