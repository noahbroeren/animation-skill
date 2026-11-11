#!/usr/bin/env python3
"""Contact sheet of rendered stills with the cue name on each tile.

  py tools/sheet.py <stills dir> <out.jpg> [--cols 7] [--tile 270]

Reads index.json next to the stills when it exists (`render.mjs --stills cues` writes cue -> frame) so every tile
carries its beat name: the fastest way to check a storyboard, one picture per beat.
"""
import glob
import json
import os
import sys

from PIL import Image, ImageDraw


def main():
    d, out = sys.argv[1], sys.argv[2]
    cols = int(sys.argv[sys.argv.index("--cols") + 1]) if "--cols" in sys.argv else 7
    tw = int(sys.argv[sys.argv.index("--tile") + 1]) if "--tile" in sys.argv else 270
    names = {}
    if os.path.exists(os.path.join(d, "index.json")):
        for k, v in json.load(open(os.path.join(d, "index.json"), encoding="utf-8")).items():
            names.setdefault(int(v), k.split(".", 1)[-1])
    files = sorted(glob.glob(os.path.join(d, "f*.png")))
    if not files:
        print("no stills in", d)
        return
    w, h = Image.open(files[0]).size
    th = round(tw * h / w)
    rows = (len(files) + cols - 1) // cols
    sheet = Image.new("RGB", (cols * tw, rows * th), (16, 12, 20))
    for i, p in enumerate(files):
        f = int(os.path.basename(p)[1:-4])
        im = Image.open(p).convert("RGB").resize((tw, th))
        g = ImageDraw.Draw(im)
        g.rectangle((0, 0, tw, 16), fill=(0, 0, 0))
        g.text((4, 2), f"{names.get(f, '')} f{f}".strip(), fill=(255, 230, 60))
        sheet.paste(im, ((i % cols) * tw, (i // cols) * th))
    sheet.save(out, quality=86)
    print(f"{len(files)} stills -> {out}")


if __name__ == "__main__":
    main()
