"""Combine data/*.json (one file per video) into recipes.json, newest playlist videos first."""
import json, glob, os
order = [l.strip() for l in open("data/_playlist-order.txt") if l.strip()]
sources, recipes = [], []
files = [json.load(open(f)) for f in sorted(glob.glob("data/*.json"))]
files.sort(key=lambda d: order.index(d["src"]["key"]) if d["src"]["key"] in order else len(order))
seen = set()
for d in files:
    s = d["src"]; sources.append(s)
    for r in d["recipes"]:
        assert r["id"] not in seen, f"duplicate id {r['id']}"; seen.add(r["id"])
        assert os.path.exists(r["img"]), f"missing image {r['img']}"
        recipes.append({**r, "src": s["key"]})
json.dump({"sources": sources, "recipes": recipes}, open("recipes.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(sources), "videos,", len(recipes), "recipes")
