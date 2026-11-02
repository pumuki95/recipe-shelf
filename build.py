"""Combine data/*.json (one file per video) into recipes.json, newest playlist videos first.
Also fills in estimated fiber / sugars (tools/nutrition.py) and attaches comparison families (data/_families.json)."""
import json, glob, os, sys
sys.path.insert(0, "tools"); import nutrition
order = [l.strip() for l in open("data/_playlist-order.txt") if l.strip()]
families = json.load(open("data/_families.json"))
fam_of = {}
for name, ids in families.items():
    for i in ids: fam_of.setdefault(i, []).append(name)
sources, recipes = [], []
files = [json.load(open(f)) for f in sorted(glob.glob("data/*.json")) if not os.path.basename(f).startswith("_")]
files.sort(key=lambda d: order.index(d["src"]["key"]) if d["src"]["key"] in order else len(order))
seen = set()
for d in files:
    s = d["src"]; sources.append(s)
    for r in d["recipes"]:
        assert r["id"] not in seen, f"duplicate id {r['id']}"; seen.add(r["id"])
        assert os.path.exists(r["img"]), f"missing image {r['img']}"
        nutrition.fill(r)
        recipes.append({**r, "src": s["key"], "families": fam_of.get(r["id"], [])})
missing = [i for v in families.values() for i in v if i not in seen]
assert not missing, f"families reference unknown ids: {missing}"
json.dump({"sources": sources, "recipes": recipes, "families": {k: v for k, v in families.items() if len(v) > 1}},
          open("recipes.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(sources), "videos,", len(recipes), "recipes,", len(families), "comparison groups")
