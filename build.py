"""Combine data/*.json (one file per video) into recipes.json, newest additions first.
Also fills in estimated fiber / sugars (tools/nutrition.py) and attaches comparison families (data/_families.json)."""
import json, glob, os, sys
sys.path.insert(0, "tools"); import nutrition
order = [l.strip() for l in open("data/_playlist-order.txt") if l.strip()]
families = json.load(open("data/_families.json"))
fam_of = {}
for name, ids in families.items():
    for i in ids: fam_of.setdefault(i, []).append(name)
sources, recipes = [], []
import datetime
now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
files = []
for i, f in enumerate(sorted(glob.glob("data/*.json"))):
    if os.path.basename(f).startswith("_"): continue
    d = json.load(open(f))
    if not d["src"].get("added"):          # first build after a recipe is added: stamp the date it went on the shelf
        d["src"]["added"] = now
        json.dump(d, open(f, "w"), ensure_ascii=False, indent=1)
    files.append((d, i))
# Newest first: by the date each source was added; ties keep playlist order, then later files first.
files.sort(key=lambda x: (datetime.datetime.fromisoformat(x[0]["src"]["added"]), -(order.index(x[0]["src"]["key"]) if x[0]["src"]["key"] in order else len(order)), x[1]), reverse=True)
files = [d for d, _ in files]
seen = set()
for d in files:
    s = d["src"]; sources.append(s)
    for n, r in enumerate(d["recipes"], 1):
        if len(d["recipes"]) > 1: r.setdefault("part", n)   # "2 of 8" badge on multi-recipe posts
        assert r["id"] not in seen, f"duplicate id {r['id']}"; seen.add(r["id"])
        assert os.path.exists(r["img"]), f"missing image {r['img']}"
        nutrition.fill(r)
        recipes.append({**r, "src": s["key"], "families": fam_of.get(r["id"], [])})
missing = [i for v in families.values() for i in v if i not in seen]
assert not missing, f"families reference unknown ids: {missing}"
json.dump({"sources": sources, "recipes": recipes, "families": {k: v for k, v in families.items() if len(v) > 1}},
          open("recipes.json", "w"), ensure_ascii=False, separators=(",", ":"))
print(len(sources), "videos,", len(recipes), "recipes,", len(families), "comparison groups")
