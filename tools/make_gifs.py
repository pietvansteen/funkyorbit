#!/usr/bin/env python3
"""
Make our own starter set of success GIFs for the Add page (site/gifs/), in our club colours.
Standard library only: shapes are drawn at twice the size and scaled down (smooth edges), then
written as an animated GIF with our own LZW encoder.

  python3 tools/make_gifs.py

Any other GIF (or .webp / .png / .jpg / .mp4 / .webm) dropped in site/gifs/ joins in after
`python3 tools/release.py`, no code needed.
"""

import math
import pathlib
import random
import struct

OUT = pathlib.Path(__file__).resolve().parent.parent / "site" / "gifs"
SIZE = 240          # output pixels
SS = 2              # drawn at 2x, then scaled down
FRAMES = 40
DELAY = 5           # hundredths of a second per frame

# the background is the card the GIF sits on (--surface), so the smooth edges blend into it
BASE = {
    "bg": (0x15, 0x1d, 0x31), "w": (0xee, 0xef, 0xf2), "b": (0x1f, 0x4f, 0xd1), "o": (0xee, 0x5a, 0x2c),
    "r": (0xe6, 0x38, 0x6a), "teal": (0x2b, 0xb5, 0xaa), "knob": (0xd9, 0x3a, 0x78), "tape": (0xf4, 0xf5, 0xf7),
    "star": (0xf5, 0xbf, 0x3c), "orbit": (0x3d, 0xd6, 0xc4), "muted": (0x5a, 0x66, 0x83),
}
NAMES = list(BASE)
C = {n: i for i, n in enumerate(NAMES)}


def build_palette():
    """The base colours, plus each of them mixed with the background (for the smooth edges); 64 in all."""
    pal = list(BASE.values())
    bg = BASE["bg"]
    for n in NAMES[1:]:
        for f in (0.25, 0.5, 0.75):
            pal.append(tuple(round(bg[k] + (BASE[n][k] - bg[k]) * f) for k in range(3)))
    while len(pal) < 64:
        pal.append((0, 0, 0))
    return pal


PALETTE = build_palette()


class Canvas:
    def __init__(self):
        self.n = SIZE * SS
        self.px = bytearray(self.n * self.n)  # all background (index 0)

    def poly(self, pts, color):
        """Filled polygon (even-odd), points in output pixels."""
        pts = [(x * SS, y * SS) for x, y in pts]
        ys = [p[1] for p in pts]
        y0, y1 = max(0, int(min(ys))), min(self.n - 1, int(math.ceil(max(ys))))
        fill = bytes([color])
        for y in range(y0, y1 + 1):
            yc = y + 0.5
            xs = []
            for (xa, ya), (xb, yb) in zip(pts, pts[1:] + pts[:1]):
                if (ya <= yc < yb) or (yb <= yc < ya):
                    xs.append(xa + (yc - ya) * (xb - xa) / (yb - ya))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                a, b = max(0, math.ceil(a - 0.5)), min(self.n, math.floor(b - 0.5) + 1)
                if b > a:
                    self.px[y * self.n + a:y * self.n + b] = fill * (b - a)

    def circle(self, cx, cy, r, color):
        cx, cy, r = cx * SS, cy * SS, r * SS
        fill = bytes([color])
        for y in range(max(0, int(cy - r)), min(self.n, int(cy + r) + 2)):
            dy = y + 0.5 - cy
            if abs(dy) >= r:
                continue
            h = math.sqrt(r * r - dy * dy)
            a, b = max(0, math.ceil(cx - h - 0.5)), min(self.n, math.floor(cx + h - 0.5) + 1)
            if b > a:
                self.px[y * self.n + a:y * self.n + b] = fill * (b - a)

    def frame(self, cache={}):
        """Scale down 2x: a pixel whose four sub-pixels differ gets the nearest palette colour of their average."""
        n, out = self.n, bytearray(SIZE * SIZE)
        px = self.px
        for y in range(SIZE):
            r0, r1 = 2 * y * n, (2 * y + 1) * n
            for x in range(SIZE):
                a, b, c, d = px[r0 + 2 * x], px[r0 + 2 * x + 1], px[r1 + 2 * x], px[r1 + 2 * x + 1]
                if a == b == c == d:
                    out[y * SIZE + x] = a
                    continue
                key = tuple(sorted((a, b, c, d)))
                if key not in cache:
                    avg = [sum(BASE[NAMES[i]][k] for i in key) / 4 for k in range(3)]
                    cache[key] = min(range(len(PALETTE)), key=lambda i: sum((PALETTE[i][k] - avg[k]) ** 2 for k in range(3)))
                out[y * SIZE + x] = cache[key]
        return bytes(out)


# ---------------------------------------------------------------- shapes

def bezier(p0, p1, p2, p3, steps=8):
    pts = []
    for i in range(1, steps + 1):
        t = i / steps
        u = 1 - t
        pts.append(tuple(u ** 3 * p0[k] + 3 * u * u * t * p1[k] + 3 * u * t * t * p2[k] + t ** 3 * p3[k] for k in range(2)))
    return pts


# The club from our logo (site/shared.js clubIcon), 145 units long, turning around its balance point (y = 60).
_LEFT = [(-6.4, 3.4)] + bezier((-6.4, 3.4), (-9.6, 12), (-11.6, 24), (-11.6, 33)) + bezier((-11.6, 33), (-11.6, 45), (-6.4, 60), (-4.8, 74))
BODY = _LEFT + [(-x, y) for x, y in reversed(_LEFT)]
rect = lambda x0, y0, x1, y1: [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]
CLUB_PARTS = [
    ([(-4, 78), (4, 78), (3, 135.5), (-3, 135.5)], "teal"),
    (rect(-5, 135, 5, 142.6), "knob"),
    (BODY, None),  # the club's own colour
    (rect(-5.2, 73.6, 5.2, 78.2), "tape"),
    (rect(-6.6, -1.2, 6.6, 3.2), "knob"),
]


def club(cv, x, y, angle, length, color):
    s, co, si = length / 145, math.cos(angle), math.sin(angle)
    for pts, part in CLUB_PARTS:
        cv.poly([(x + ((px * co - (py - 60) * si) * s), y + ((px * si + (py - 60) * co) * s)) for px, py in pts], C[part or color])


def star(cv, x, y, r, color, points=5, turn=0.0):
    pts = []
    for i in range(points * 2):
        a = turn - math.pi / 2 + i * math.pi / points
        rr = r if i % 2 == 0 else r * 0.45
        pts.append((x + rr * math.cos(a), y + rr * math.sin(a)))
    cv.poly(pts, C[color])


CLUB_COLORS = ["w", "b", "o", "r"]


# ---------------------------------------------------------------- the animations (t goes 0 -> 1, then loops)

def confetti(t, rnd=random.Random(7), parts=[]):
    """A burst of confetti and clubs from the middle, falling down."""
    if not parts:
        for i in range(46):
            a = rnd.uniform(-math.pi * 0.95, -math.pi * 0.05)
            v = rnd.uniform(150, 290)
            parts.append(dict(vx=math.cos(a) * v * rnd.uniform(0.6, 1.2), vy=math.sin(a) * v, spin=rnd.choice([-1, 1]) * rnd.randint(1, 3),
                              kind="club" if i < 6 else rnd.choice(["rect", "rect", "dot", "star"]),
                              color=rnd.choice(CLUB_COLORS + ["star", "orbit", "teal"]) if i >= 6 else CLUB_COLORS[i % 4],
                              size=rnd.uniform(5, 9), turn=rnd.uniform(0, 6.3)))
    cv = Canvas()
    tt = t * 1.25
    for p in parts:
        x, y = 120 + p["vx"] * tt, 150 + p["vy"] * tt + 330 * tt * tt
        a = p["turn"] + p["spin"] * 2 * math.pi * t
        if p["kind"] == "club":
            club(cv, x, y, a, 46, p["color"])
        elif p["kind"] == "rect":
            w, h = p["size"], p["size"] * 0.5
            co, si = math.cos(a), math.sin(a) * 0.6
            cv.poly([(x + dx * co - dy * si, y + dx * si + dy * co) for dx, dy in ((-w, -h), (w, -h), (w, h), (-w, h))], C[p["color"]])
        elif p["kind"] == "dot":
            cv.circle(x, y, p["size"] * 0.55, C[p["color"]])
        else:
            star(cv, x, y, p["size"], p["color"], turn=a)
    return cv


def orbit(t):
    """Four clubs spinning in orbit around a little planet: Funky Orbit."""
    cv = Canvas()
    cx, cy = 120, 122
    for i in range(48):  # the orbit, dotted
        a = i / 48 * 2 * math.pi
        cv.circle(cx + 96 * math.cos(a), cy + 46 * math.sin(a), 1.4, C["muted"])
    behind, front = [], []
    for i in range(4):
        a = 2 * math.pi * (t + i / 4)
        x, y = cx + 96 * math.cos(a), cy + 46 * math.sin(a)
        (behind if math.sin(a) < 0 else front).append((x, y, 2 * math.pi * 2 * t + i, 0.8 + 0.2 * math.sin(a), CLUB_COLORS[i]))
    for x, y, spin, depth, col in behind:
        club(cv, x, y, spin, 58 * depth, col)
    cv.circle(cx, cy, 36, C["orbit"])
    cv.circle(cx - 11, cy - 10, 9, C["teal"])
    cv.circle(cx + 13, cy + 12, 6, C["teal"])
    for x, y, spin, depth, col in front:
        club(cv, x, y, spin, 58 * depth, col)
    for i, (sx, sy) in enumerate(((34, 34), (206, 44), (196, 206), (40, 196), (120, 20))):
        r = 4 + 4 * max(0, math.sin(2 * math.pi * (t * 2 + i / 5)))
        star(cv, sx, sy, r, "star", points=4)
    return cv


def fireworks(t):
    """Three bursts in our club colours."""
    cv = Canvas()
    bursts = [(0.0, 78, 86, "o", "w"), (0.33, 168, 70, "b", "orbit"), (0.66, 120, 150, "r", "star")]
    for start, bx, by, c1, c2 in bursts:
        dt = (t - start) % 1
        if dt > 0.62:
            continue
        if dt < 0.12:  # the rocket going up
            k = dt / 0.12
            cv.circle(bx, by + 140 * (1 - k), 3, C["star"])
            continue
        k = (dt - 0.12) / 0.5
        ease = 1 - (1 - k) ** 3
        for i in range(18):
            a = i / 18 * 2 * math.pi
            for j, f in enumerate((1.0, 0.82, 0.64)):  # a little trail
                r = 70 * ease * f
                size = (3.6 - j) * (1 - 0.5 * k)
                if size > 0.6:
                    cv.circle(bx + r * math.cos(a), by + r * math.sin(a) + 18 * k * k, size, C[c1 if i % 2 else c2])
    return cv


def spin(t):
    """One big club doing a full turn (a single spin, like a 3), with stars popping around it."""
    cv = Canvas()
    for i in range(7):
        a = i / 7 * 2 * math.pi + 0.4
        k = (t * 2 + i / 7) % 1
        r = 10 * math.sin(math.pi * k)
        if r > 1:
            star(cv, 120 + 92 * math.cos(a), 120 + 92 * math.sin(a), r, ["star", "orbit", "r"][i % 3], turn=k * 2)
    club(cv, 120, 124, 2 * math.pi * t, 170, "o")
    return cv


# ---------------------------------------------------------------- GIF writer

def lzw(data, min_size):
    clear, eoi = 1 << min_size, (1 << min_size) + 1
    out, acc, nbits = bytearray(), 0, 0
    code_size, next_code, table = min_size + 1, eoi + 1, {}

    def emit(code):
        nonlocal acc, nbits
        acc |= code << nbits
        nbits += code_size
        while nbits >= 8:
            out.append(acc & 0xFF)
            acc >>= 8
            nbits -= 8

    emit(clear)
    prefix = data[0]
    for k in data[1:]:
        key = (prefix << 8) | k
        code = table.get(key)
        if code is not None:
            prefix = code
            continue
        emit(prefix)
        if next_code < 4096:
            table[key] = next_code
            next_code += 1
            if next_code > (1 << code_size) and code_size < 12:
                code_size += 1
        else:
            emit(clear)
            table, code_size, next_code = {}, min_size + 1, eoi + 1
        prefix = k
    emit(prefix)
    emit(eoi)
    if nbits:
        out.append(acc & 0xFF)
    return bytes(out)


def write_gif(path, frames):
    gif = bytearray(b"GIF89a")
    gif += struct.pack("<HHBBB", SIZE, SIZE, 0xF5, 0, 0)  # global palette of 64 colours
    for rgb in PALETTE:
        gif += bytes(rgb)
    gif += b"\x21\xFF\x0BNETSCAPE2.0\x03\x01\x00\x00\x00"  # loop forever
    for f in frames:
        gif += b"\x21\xF9\x04\x04" + struct.pack("<H", DELAY) + b"\x00\x00"
        gif += b"\x2C" + struct.pack("<HHHHB", 0, 0, SIZE, SIZE, 0)
        gif.append(6)
        data = lzw(f, 6)
        for i in range(0, len(data), 255):
            chunk = data[i:i + 255]
            gif.append(len(chunk))
            gif += chunk
        gif.append(0)
    gif.append(0x3B)
    path.write_bytes(gif)


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    for name, fn in (("confetti", confetti), ("orbit", orbit), ("fireworks", fireworks), ("spin", spin)):
        frames = [fn(i / FRAMES).frame() for i in range(FRAMES)]
        path = OUT / f"funky-{name}.gif"
        write_gif(path, frames)
        print(f"{path.relative_to(OUT.parent.parent)}: {path.stat().st_size // 1024} kB")


if __name__ == "__main__":
    main()
