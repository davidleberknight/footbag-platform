#!/usr/bin/env python3
"""Author the 33 cat-1 (missing-authoring) frontier candidates: settled ADD +
base + operator, no doctrine work. Publishes structure now (ADD / base /
family / JOB notation / modifier links / structural decomposition);
operational_notation is left pending for a dedicated backfill pass (an
established pattern — 44 active rows already publish op_notation-pending).

--dry-run prints the rows; --apply appends to red_additions + red_corrections.
"""
from __future__ import annotations
import json, re, sqlite3, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
RA = ROOT / "legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv"
RC = ROOT / "legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv"

src = (ROOT / "src/content/freestyleObservationalUniverse.ts").read_text()
rows = []
for m in re.finditer(r'\{"name":.*?\},?\s*$', src, re.M):
    try: rows.append(json.loads(m.group(0).rstrip(',')))
    except Exception: pass
fr = [r for r in rows if r.get('layer') == 'frontier' and r.get('intakeBucket') == 'promotion_ready'
      and r.get('doctrineConfidence') == 'stable' and r.get('provisionalAdd') and r.get('decomposition')
      and '+2 rot' not in r.get('decomposition', '').lower()
      and not r['name'].lower().startswith('illusioning')]

con = sqlite3.connect(str(ROOT / "database/footbag.db"))
fam = {s: f for s, f in con.execute("SELECT slug, trick_family FROM freestyle_tricks WHERE is_active=1")}
pub = set(fam)

# Loader-19 default trick_family = base slug, which matches the modal convention
# for every Group-A base EXCEPT these two (where compounds mode to the terminal).
FAMILY_OVERRIDE = {"guay": "inside-stall", "blur": "mirage"}

# Hold out of this batch: B = alias-shaped (no operator, ADD = base ADD) →
# aliases of their base, not new rows; C = deep multi-operator chains needing
# careful per-row derivation; plus two unusual-base rows.
EXCLUDE = {
    # B (aliases)
    "reverse-guay", "sailing-clipper", "toe-mobius", "toe-barrage",
    # C (deep chains)
    "pixie-miraging-symposium-miraging-legover", "reverse-swirling-paradox-symposium-whirl",
    "spinning-miraging-symposium-miraging-refraction", "surging-ducking-paradox-symposium-whirling-rake",
    "surging-ducking-torque", "surging-ducking-blender",
    # unusual base / entry
    "spyro-gyro", "backside-symposium-toe-blizzard",
}

def csvq(s: str) -> str:
    return '"' + s.replace('"', '""') + '"' if (',' in s or '"' in s) else s

add_rows, corr_rows, skipped = [], [], []
for r in sorted(fr, key=lambda x: x['name']):
    slug = r['slug']; name = r['name']; add = r['provisionalAdd']; dec = r['decomposition']; job = r.get('semanticJob', '')
    if slug in pub:
        skipped.append((slug, 'already published')); continue
    if slug in EXCLUDE:
        skipped.append((slug, 'held (alias / deep-chain / unusual)')); continue
    toks = re.findall(r'([a-z][a-z\-]*)\(', dec.lower())  # operator/base tokens in order
    if not toks:
        skipped.append((slug, 'no parseable decomposition')); continue
    base = toks[-1]; ops = [o for o in toks[:-1]]
    base_slug = base
    if base_slug not in fam:
        skipped.append((slug, f'base {base_slug} not published')); continue
    mod = "|".join(dict.fromkeys(ops))  # dedupe, preserve order
    desc = f"{name} ({dec})."
    note = f"Frontier cat-1 author-now promotion: settled operator(s) on a published base; ADD per decomposition ({dec}); operational_notation backfill pending."
    add_rows.append(",".join([slug, add, base_slug, "compound", "", mod, csvq(desc), "expert_reviewed", "1", csvq(note)]))
    if job:
        corr_rows.append(",".join([slug, "notation", "", job, csvq("Frontier cat-1 promotion: JOB = curator semantic notation.")]))
    if base_slug in FAMILY_OVERRIDE:
        fv = FAMILY_OVERRIDE[base_slug]
        corr_rows.append(",".join([slug, "trick_family", base_slug, fv,
            csvq(f"Family per the modal convention for {base_slug}-based compounds ({fv}), overriding the loader-19 base-slug default.")]))

print(f"# {len(add_rows)} additions, {len(corr_rows)} corrections, {len(skipped)} skipped")
if skipped:
    print("# skipped:", skipped)
if "--dry-run" in sys.argv:
    print("\n--- red_additions ---");  [print(x) for x in add_rows]
    print("\n--- red_corrections ---"); [print(x) for x in corr_rows]
elif "--apply" in sys.argv:
    for f, new in ((RA, add_rows), (RC, corr_rows)):
        txt = f.read_text()
        if not txt.endswith("\n"): txt += "\n"
        f.write_text(txt + "\n".join(new) + "\n")
    print("applied.")
else:
    print("pass --dry-run or --apply")
