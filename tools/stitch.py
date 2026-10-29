"""Stitch n×n lossless zoom tiles into one cover and write the full-size and thumbnail JPEGs.
usage: stitch.py <recipe-id> <n> <tile1.png> [tile2.png ...]   (tiles in row-major order)"""
import sys
from PIL import Image
rid, n, tiles = sys.argv[1], int(sys.argv[2]), sys.argv[3:]
from PIL import ImageStat
def fix_edges(im):
    # a 1px dark seam can appear on a tile's last row/column; replace it with its neighbour
    w, h = im.size
    for axis in ("row", "col"):
        last = im.crop((0, h-1, w, h) if axis=="row" else (w-1, 0, w, h))
        prev = im.crop((0, h-2, w, h-1) if axis=="row" else (w-2, 0, w-1, h))
        if sum(ImageStat.Stat(last).mean) < 0.8 * sum(ImageStat.Stat(prev).mean):
            im.paste(prev, (0, h-1) if axis=="row" else (w-1, 0))
    return im
ims = [fix_edges(Image.open(t).convert("RGB")) for t in tiles]
w, h = ims[0].size
out = Image.new("RGB", (w * n, h * n))
for k, im in enumerate(ims):
    out.paste(im.resize((w, h)), ((k % n) * w, (k // n) * h))
W = min(1280, out.width)
big = out.resize((W, round(out.height * W / out.width)), Image.LANCZOS)
big.save(f"img/{rid}.jpg", quality=86, optimize=True, progressive=True, subsampling=0)
big.resize((640, round(big.height * 640 / big.width)), Image.LANCZOS).save(f"img/t/{rid}.jpg", quality=82, optimize=True, progressive=True)
import os
print(rid, big.size, os.path.getsize(f"img/{rid}.jpg") // 1024, "KB", os.path.getsize(f"img/t/{rid}.jpg") // 1024, "KB thumb")
