#!/usr/bin/env python3
"""
Give the app icon its margins back, without re-rendering the artwork.

The icon was generated edge-to-edge: the mark's bounding box is 93% of the
canvas tall with 24px of clearance at the top, and iOS then lays its rounded-rect
mask over that, so the top loop and the bottom curve sit right on the clip edge.
Apple's icon grid wants roughly a tenth of the canvas clear on every side.

The naive fix -- shrink the whole PNG and pad the border -- does not work here.
The background is a vertical gradient (#43AEF8 at the top down to #1D86DC at the
bottom), so any flat pad colour lands wrong on at least two edges, and pasting a
shrunken copy leaves a visible rectangle where the compressed gradient meets the
new one.

So this shrinks the MARK and leaves the BACKGROUND alone. The background is
recovered per row from the two side columns the mark never reaches, giving bg(y)
for the full height. Everything else is expressed as a signed deviation from
that, dev = px - bg(y), which carries the mark, its bevel, its drop shadow and
every antialiased edge pixel. Scale the deviation field, drop it back onto the
untouched full-size background, and the gradient is continuous by construction --
there is no seam to hide because nothing about the background ever moved.

Additive rather than multiplicative compositing is an approximation for the drop
shadow (a shadow darkens proportionally, it does not subtract a constant). Over
the ~110px the mark travels it is not a visible difference.

Stdlib only -- Pillow and ImageMagick are both absent on this machine, and an
icon pipeline is not worth a dependency.

Usage:
    python3 tools/repad-icon.py --out /tmp/icon-78.png --target-frac 0.78
    python3 tools/repad-icon.py --out /tmp/icon-78.png --target-frac 0.78 --mask-preview
"""

from __future__ import annotations

import argparse
import struct
import sys
import zlib

# The mark is white on saturated blue; this separates them with room to spare.
WHITE_CUTOFF = 200
# Columns the mark never reaches, used to recover the background per row.
# The mark spans x 132..900, so these are pure background top to bottom.
BG_LEFT = 100
BG_RIGHT = 924
# Vertical smoothing radius for bg(y) -- kills generator noise without flattening
# the gradient, which changes far too slowly for this to touch it.
BG_SMOOTH = 3
# Triangular dither, in LSB, applied before rounding.
#
# Recovering the background as a smooth function of y throws away the grain the
# original was generated with, and a clean gradient spanning only ~38 levels of
# red over 1024px quantises into visible bands -- measured at 58px plateaus
# against the original's 6px. A little noise turns the step into grain the eye
# integrates away. This is still far less texture than the source had (~7 LSB),
# so it reads as clean, not noisy.
DITHER = 1.0
# Noise is tiled rather than computed per pixel: a 64px tile at this amplitude is
# indistinguishable from per-pixel noise and keeps the whole run a few seconds.
DITHER_TILE = 64


def read_png(path: str) -> tuple[int, int, int, bytearray]:
    """Decode a non-interlaced 8-bit PNG. Returns (w, h, channels, pixels)."""
    data = open(path, "rb").read()
    if data[:8] != b"\x89PNG\r\n\x1a\n":
        raise SystemExit(f"{path}: not a PNG")

    idat = bytearray()
    width = height = depth = color = None
    interlace = 0
    pos = 8
    while pos < len(data):
        (length,) = struct.unpack(">I", data[pos : pos + 4])
        kind = data[pos + 4 : pos + 8]
        chunk = data[pos + 8 : pos + 8 + length]
        if kind == b"IHDR":
            width, height, depth, color, _, _, interlace = struct.unpack(">IIBBBBB", chunk[:13])
        elif kind == b"IDAT":
            idat += chunk
        elif kind == b"IEND":
            break
        pos += 12 + length

    if depth != 8:
        raise SystemExit(f"{path}: only 8-bit PNGs are supported (got {depth}-bit)")
    if interlace:
        raise SystemExit(f"{path}: interlaced PNGs are not supported")
    channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[color]

    raw = zlib.decompress(bytes(idat))
    stride = width * channels
    out = bytearray(stride * height)
    prev = bytearray(stride)
    src = 0
    for y in range(height):
        ftype = raw[src]
        src += 1
        line = bytearray(raw[src : src + stride])
        src += stride
        if ftype == 1:
            for x in range(channels, stride):
                line[x] = (line[x] + line[x - channels]) & 0xFF
        elif ftype == 2:
            for x in range(stride):
                line[x] = (line[x] + prev[x]) & 0xFF
        elif ftype == 3:
            for x in range(stride):
                left = line[x - channels] if x >= channels else 0
                line[x] = (line[x] + ((left + prev[x]) >> 1)) & 0xFF
        elif ftype == 4:
            for x in range(stride):
                a = line[x - channels] if x >= channels else 0
                b = prev[x]
                c = prev[x - channels] if x >= channels else 0
                p = a + b - c
                pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
                pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
                line[x] = (line[x] + pred) & 0xFF
        elif ftype != 0:
            raise SystemExit(f"{path}: bad filter type {ftype} on row {y}")
        out[y * stride : (y + 1) * stride] = line
        prev = line
    return width, height, channels, out


def write_png(path: str, width: int, height: int, pixels: bytearray) -> None:
    """Encode 8-bit RGB with per-row adaptive filtering. No alpha -- an alpha
    channel in an app icon is rejected at upload time."""
    stride = width * 3
    body = bytearray()
    prev = bytearray(stride)
    for y in range(height):
        line = pixels[y * stride : (y + 1) * stride]
        candidates = []

        none = bytes(line)
        candidates.append((sum(v if v < 128 else 256 - v for v in none), 0, none))

        sub = bytearray(stride)
        for x in range(stride):
            left = line[x - 3] if x >= 3 else 0
            sub[x] = (line[x] - left) & 0xFF
        candidates.append((sum(v if v < 128 else 256 - v for v in sub), 1, bytes(sub)))

        up = bytearray(stride)
        for x in range(stride):
            up[x] = (line[x] - prev[x]) & 0xFF
        candidates.append((sum(v if v < 128 else 256 - v for v in up), 2, bytes(up)))

        paeth = bytearray(stride)
        for x in range(stride):
            a = line[x - 3] if x >= 3 else 0
            b = prev[x]
            c = prev[x - 3] if x >= 3 else 0
            p = a + b - c
            pa, pb, pc = abs(p - a), abs(p - b), abs(p - c)
            pred = a if (pa <= pb and pa <= pc) else (b if pb <= pc else c)
            paeth[x] = (line[x] - pred) & 0xFF
        candidates.append((sum(v if v < 128 else 256 - v for v in paeth), 4, bytes(paeth)))

        _, ftype, best = min(candidates, key=lambda t: t[0])
        body.append(ftype)
        body += best
        prev = line

    def chunk(kind: bytes, payload: bytes) -> bytes:
        return (
            struct.pack(">I", len(payload))
            + kind
            + payload
            + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
        )

    png = bytearray(b"\x89PNG\r\n\x1a\n")
    png += chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(bytes(body), 9))
    png += chunk(b"IEND", b"")
    open(path, "wb").write(bytes(png))


def background_profile(width: int, height: int, ch: int, px: bytearray) -> list[tuple[float, float, float]]:
    """bg(y) -- the background colour of each row, averaged from the two side
    columns the mark never enters, then lightly smoothed."""
    rough = []
    for y in range(height):
        base = y * width * ch
        r = g = b = 0
        n = 0
        for x in list(range(0, BG_LEFT)) + list(range(BG_RIGHT, width)):
            o = base + x * ch
            r += px[o]
            g += px[o + 1]
            b += px[o + 2]
            n += 1
        rough.append((r / n, g / n, b / n))

    smooth = []
    for y in range(height):
        lo, hi = max(0, y - BG_SMOOTH), min(height, y + BG_SMOOTH + 1)
        window = rough[lo:hi]
        n = len(window)
        smooth.append(
            (
                sum(c[0] for c in window) / n,
                sum(c[1] for c in window) / n,
                sum(c[2] for c in window) / n,
            )
        )
    return smooth


def mark_bbox(width: int, height: int, ch: int, px: bytearray) -> tuple[int, int, int, int]:
    """Bounding box of the white mark. Deliberately keyed on the mark itself and
    not on the deviation field -- the drop shadow bleeds well past the artwork
    and would inflate the box, shrinking the mark more than asked for."""
    minx, maxx, miny, maxy = width, -1, height, -1
    for y in range(height):
        base = y * width * ch
        for x in range(width):
            o = base + x * ch
            if px[o] > WHITE_CUTOFF and px[o + 1] > WHITE_CUTOFF and px[o + 2] > WHITE_CUTOFF:
                if x < minx:
                    minx = x
                if x > maxx:
                    maxx = x
                if y < miny:
                    miny = y
                if y > maxy:
                    maxy = y
    if maxx < 0:
        raise SystemExit("no white mark found -- is this the right image?")
    return minx, miny, maxx, maxy


def dither_tiles() -> list[list[float]]:
    """Three independent tiles of triangular noise, one per channel. Seeded, so
    a rerun of this script reproduces the same PNG byte for byte."""
    import random

    rng = random.Random(0x6759_4E43)
    tiles = []
    for _ in range(3):
        tiles.append(
            [
                (rng.random() + rng.random() - 1.0) * DITHER
                for _ in range(DITHER_TILE * DITHER_TILE)
            ]
        )
    return tiles


def repad(src: str, dst: str, target_frac: float, quiet: bool = False) -> None:
    w, h, ch, px = read_png(src)
    if ch < 3:
        raise SystemExit(f"{src}: expected RGB, got {ch} channel(s)")

    bg = background_profile(w, h, ch, px)
    minx, miny, maxx, maxy = mark_bbox(w, h, ch, px)
    mark_w, mark_h = maxx - minx + 1, maxy - miny + 1

    # Scale off the tighter axis so the *tightest* margin is the one that hits
    # the target -- scaling off height alone would over-shrink a wide mark.
    scale = (target_frac * h) / max(mark_w, mark_h)
    cx_src, cy_src = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    cx_dst, cy_dst = w / 2.0, h / 2.0

    if not quiet:
        print(f"  source mark : {mark_w}x{mark_h}px  ({mark_h / h:.1%} tall, {mark_w / w:.1%} wide)")
        print(f"  scale       : {scale:.4f}")
        print(f"  new mark    : {round(mark_w * scale)}x{round(mark_h * scale)}px")
        print(f"  margins     : {round((h - mark_h * scale) / 2)}px top/bottom, "
              f"{round((w - mark_w * scale) / 2)}px left/right")

    # Signed deviation from the row background. Floats, because the resample
    # below interpolates between them and rounding here would band the edges.
    dev = [0.0] * (w * h * 3)
    for y in range(h):
        br, bgc, bb = bg[y]
        base = y * w * ch
        out = y * w * 3
        for x in range(w):
            o = base + x * ch
            d = out + x * 3
            dev[d] = px[o] - br
            dev[d + 1] = px[o + 1] - bgc
            dev[d + 2] = px[o + 2] - bb

    inv = 1.0 / scale
    tiles = dither_tiles()
    result = bytearray(w * h * 3)
    for Y in range(h):
        sy = (Y - cy_dst) * inv + cy_src
        y0 = int(sy) if sy >= 0 else int(sy) - 1
        fy = sy - y0
        y1 = y0 + 1
        row_ok = 0 <= y0 < h or 0 <= y1 < h
        br, bgc, bb = bg[Y]
        out = Y * w * 3
        trow = (Y % DITHER_TILE) * DITHER_TILE
        for X in range(w):
            o = out + X * 3
            t = trow + (X % DITHER_TILE)
            n0, n1, n2 = tiles[0][t], tiles[1][t], tiles[2][t]
            if not row_ok:
                r, g, b = br + n0, bgc + n1, bb + n2
                result[o] = 0 if r < 0 else (255 if r > 255 else int(r + 0.5))
                result[o + 1] = 0 if g < 0 else (255 if g > 255 else int(g + 0.5))
                result[o + 2] = 0 if b < 0 else (255 if b > 255 else int(b + 0.5))
                continue
            sx = (X - cx_dst) * inv + cx_src
            x0 = int(sx) if sx >= 0 else int(sx) - 1
            fx = sx - x0
            x1 = x0 + 1

            dr = dg = db = 0.0
            for xi, wx in ((x0, 1.0 - fx), (x1, fx)):
                if not (0 <= xi < w) or wx == 0.0:
                    continue
                for yi, wy in ((y0, 1.0 - fy), (y1, fy)):
                    if not (0 <= yi < h) or wy == 0.0:
                        continue
                    wgt = wx * wy
                    d = (yi * w + xi) * 3
                    dr += dev[d] * wgt
                    dg += dev[d + 1] * wgt
                    db += dev[d + 2] * wgt

            r = br + dr + n0
            g = bgc + dg + n1
            b = bb + db + n2
            result[o] = 0 if r < 0 else (255 if r > 255 else int(r + 0.5))
            result[o + 1] = 0 if g < 0 else (255 if g > 255 else int(g + 0.5))
            result[o + 2] = 0 if b < 0 else (255 if b > 255 else int(b + 0.5))

    write_png(dst, w, h, result)
    if not quiet:
        print(f"  wrote       : {dst}")


def apply_mask(src: str, dst: str) -> None:
    """Preview the icon the way iOS shows it: continuous rounded corners at
    ~22.37% of the width, on a checkerboard so the clipping is obvious."""
    w, h, ch, px = read_png(src)
    radius = 0.2237 * w
    ss = 4  # supersample the mask edge, otherwise the corners look chewed
    out = bytearray(w * h * 3)
    for y in range(h):
        for x in range(w):
            cover = 0
            for sy in range(ss):
                py = y + (sy + 0.5) / ss
                for sx in range(ss):
                    pxx = x + (sx + 0.5) / ss
                    dx = max(radius - pxx, pxx - (w - radius), 0.0)
                    dy = max(radius - py, py - (h - radius), 0.0)
                    # Squircle-ish: exponent 4 sits between a circle and a square,
                    # much closer to Apple's continuous corner than a plain radius.
                    if dx == 0.0 and dy == 0.0:
                        cover += 1
                    elif (dx / radius) ** 4 + (dy / radius) ** 4 <= 1.0:
                        cover += 1
            a = cover / (ss * ss)
            o = (y * w + x) * 3
            s = (y * w + x) * ch
            check = 210 if ((x // 64) + (y // 64)) % 2 == 0 else 170
            for c in range(3):
                out[o + c] = int(px[s + c] * a + check * (1 - a) + 0.5)
    write_png(dst, w, h, out)
    print(f"  wrote       : {dst}  (iOS-masked preview)")


def _catmull(t: float) -> tuple[float, float, float, float]:
    """Catmull-Rom weights. Bicubic rather than bilinear because framing a
    source whose mark is smaller than the target means upscaling, and bilinear
    turns a crisp bevel into a smear at anything above 1.2x."""
    t2, t3 = t * t, t * t * t
    return (
        -0.5 * t3 + t2 - 0.5 * t,
        1.5 * t3 - 2.5 * t2 + 1.0,
        -1.5 * t3 + 2.0 * t2 + 0.5 * t,
        0.5 * t3 - 0.5 * t2,
    )


def frame(src: str, dst: str, target_frac: float, size: int = 1024) -> None:
    """Crop a square around the mark so it occupies `target_frac` of the frame,
    then resample to `size`.

    This is the path for a source that already has generous margins -- there is
    nothing to repad, only to crop to. Unlike repad(), the background is never
    reconstructed: whatever gradient and grain the source has comes through the
    resample untouched, so there is no banding to dither away.
    """
    w, h, ch, px = read_png(src)
    if ch < 3:
        raise SystemExit(f"{src}: expected RGB, got {ch} channel(s)")

    minx, miny, maxx, maxy = mark_bbox(w, h, ch, px)
    mark_w, mark_h = maxx - minx + 1, maxy - miny + 1
    side = max(mark_w, mark_h) / target_frac

    cx, cy = (minx + maxx) / 2.0, (miny + maxy) / 2.0
    # Keep the crop inside the image; a square that would hang over the edge
    # slides back in rather than sampling nothing.
    half = side / 2.0
    if side > min(w, h):
        raise SystemExit(
            f"{src}: mark is too large to frame at {target_frac:.0%} "
            f"(needs a {side:.0f}px square from a {w}x{h} image)"
        )
    cx = min(max(cx, half), w - half)
    cy = min(max(cy, half), h - half)
    x0, y0 = cx - half, cy - half

    print(f"  source      : {w}x{h}")
    print(f"  source mark : {mark_w}x{mark_h}px  ({mark_h / h:.1%} tall)")
    print(f"  crop        : {side:.0f}x{side:.0f} at ({x0:.0f}, {y0:.0f})")
    print(f"  resample    : {side:.0f} -> {size}  ({size / side:.3f}x)")
    print(f"  result mark : {round(mark_w * size / side)}x{round(mark_h * size / side)}px "
          f"({mark_h / side:.1%} tall)")

    step = side / size
    out = bytearray(size * size * 3)
    for Y in range(size):
        sy = y0 + (Y + 0.5) * step - 0.5
        iy = int(sy) if sy >= 0 else int(sy) - 1
        wy = _catmull(sy - iy)
        row = Y * size * 3
        for X in range(size):
            sx = x0 + (X + 0.5) * step - 0.5
            ix = int(sx) if sx >= 0 else int(sx) - 1
            wx = _catmull(sx - ix)

            r = g = b = 0.0
            for j in range(4):
                yy = iy - 1 + j
                yy = 0 if yy < 0 else (h - 1 if yy >= h else yy)
                wj = wy[j]
                if wj == 0.0:
                    continue
                base = yy * w * ch
                for i in range(4):
                    xx = ix - 1 + i
                    xx = 0 if xx < 0 else (w - 1 if xx >= w else xx)
                    wgt = wj * wx[i]
                    if wgt == 0.0:
                        continue
                    o = base + xx * ch
                    r += px[o] * wgt
                    g += px[o + 1] * wgt
                    b += px[o + 2] * wgt

            o = row + X * 3
            out[o] = 0 if r < 0 else (255 if r > 255 else int(r + 0.5))
            out[o + 1] = 0 if g < 0 else (255 if g > 255 else int(g + 0.5))
            out[o + 2] = 0 if b < 0 else (255 if b > 255 else int(b + 0.5))

    write_png(dst, size, size, out)
    print(f"  wrote       : {dst}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--src", default="assets/icon.png")
    ap.add_argument("--out", required=True)
    ap.add_argument(
        "--target-frac",
        type=float,
        default=0.78,
        help="mark size as a fraction of the canvas (0.78 = Apple's icon grid)",
    )
    ap.add_argument("--mask-preview", metavar="PATH", help="also write an iOS-masked preview here")
    ap.add_argument(
        "--mode",
        choices=("repad", "frame"),
        default="repad",
        help="repad: shrink the mark in place, keeping the background full-bleed "
        "(for an edge-to-edge source). frame: crop a square around the mark and "
        "resample (for a source that already has margins).",
    )
    args = ap.parse_args()

    print(f"{args.mode} {args.src} -> {args.out} at {args.target_frac:.0%}")
    if args.mode == "frame":
        frame(args.src, args.out, args.target_frac)
    else:
        repad(args.src, args.out, args.target_frac)
    if args.mask_preview:
        apply_mask(args.out, args.mask_preview)


if __name__ == "__main__":
    sys.exit(main())
