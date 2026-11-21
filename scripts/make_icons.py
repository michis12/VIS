"""Renders the VIS app icon (chrome V on black) to PNG without external deps."""
import math
import struct
import sys
import zlib
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "public"
STOPS = [(0, (255, 255, 255)), (.3, (199, 199, 204)), (.5, (142, 142, 147)), (.72, (229, 229, 234)), (1, (174, 174, 178))]


def chrome(t):
    for (a, ca), (b, cb) in zip(STOPS, STOPS[1:]):
        if t <= b:
            f = (t - a) / (b - a)
            return tuple(ca[i] + (cb[i] - ca[i]) * f for i in range(3))
    return STOPS[-1][1]


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    t = max(0, min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
    return math.hypot(px - (ax + t * dx), py - (ay + t * dy))


def render(size):
    s = size / 512
    pts = [(136 * s, 150 * s), (256 * s, 380 * s), (376 * s, 150 * s)]
    half = 22 * s
    rows = []
    for y in range(size):
        row = bytearray([0])
        for x in range(size):
            d = min(seg_dist(x + .5, y + .5, *pts[0], *pts[1]), seg_dist(x + .5, y + .5, *pts[1], *pts[2]))
            a = max(0.0, min(1.0, half - d + .5))
            c = chrome((x + y) / (2 * size))
            row += bytes(int(ch * a) for ch in c)
        rows.append(bytes(row))
    raw = b"".join(rows)

    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", size, size, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))


if __name__ == "__main__":
    for name, size in [("icon-192.png", 192), ("icon-512.png", 512), ("apple-touch-icon.png", 180)]:
        (OUT / name).write_bytes(render(size))
        print(name, file=sys.stderr)
