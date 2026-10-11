#!/usr/bin/env python3
"""Generate minimal valid PNG icon for the extension package."""
import struct
import sys
import zlib


def make_png(path: str, size: int = 128) -> None:
    w = h = size
    raw = bytearray()
    for y in range(h):
        raw.append(0)  # filter byte per row
        for x in range(w):
            # simple DeadEnd-ish block: dark bg, red band, white gap
            edge = min(x, y, w - 1 - x, h - 1 - y)
            if edge < 6:
                raw += bytes((32, 36, 46))
            elif 52 <= y <= 68 and x > 20:
                raw += bytes((214, 69, 65))
            elif edge % 12 == 0 and edge < 40:
                raw += bytes((90, 96, 110))
            else:
                raw += bytes((24, 26, 32))
    def chunk(tag: bytes, data: bytes) -> bytes:
        return (struct.pack(">I", len(data)) + tag + data +
                struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF))
    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    png = (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) +
           chunk(b"IDAT", zlib.compress(bytes(raw))) + chunk(b"IEND", b""))
    with open(path, "wb") as f:
        f.write(png)
    print(f"icon written: {path}")


if __name__ == "__main__":
    make_png(sys.argv[1] if len(sys.argv) > 1 else "icon.png")
