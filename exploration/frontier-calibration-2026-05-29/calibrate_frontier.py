#!/usr/bin/env python3
"""Frontier calibration — READ-ONLY analysis. No DB writes, no promotion.

Part A: attestation counts for the operator-intake tokens (how often each token
        appears as a name-component across the FM/folk/PassBack corpora).
Part B: existence + external-attestation check over the PassBack Bucket-6 set
        (passback_reports/new_candidates.csv, 187 rows).

Outputs:
  bucket6_attestation.csv   — per-row classification + source counts
  partA_token_attestation.csv — per-token frequency + examples
  partB_summary.txt / partA_summary.txt — console-style rollups

Sources (all read-only):
  - database/footbag.db (freestyle_tricks, freestyle_trick_aliases)
  - exploration/passback-intake/passback_reports/new_candidates.csv
  - exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv
"""
import csv, re, sqlite3, sys
from pathlib import Path
from collections import defaultdict

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / "database/footbag.db"
NEWCAND = ROOT / "exploration/passback-intake/passback_reports/new_candidates.csv"
MASTER = ROOT / "exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv"
OUTDIR = Path(__file__).resolve().parent

def slugify(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"[^a-z0-9]+", "-", s)
    return s.strip("-")

# ---- DB (read-only) ----
conn = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
db_slugs, db_canon, db_active = set(), {}, {}
for slug, name, active in conn.execute("SELECT slug, canonical_name, is_active FROM freestyle_tricks"):
    db_slugs.add(slug)
    db_canon[slugify(name)] = slug
    db_active[slug] = active
alias_map = {}  # alias_slug-or-slugified-text -> trick_slug
for aslug, atext, tslug in conn.execute("SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases"):
    alias_map[aslug] = tslug
    alias_map[slugify(atext)] = tslug
modifier_slugs = {r[0] for r in conn.execute("SELECT modifier_name FROM freestyle_trick_modifiers")}
conn.close()

def db_existence(norm_slug: str):
    """Return (matched_slug, how) or (None, None)."""
    if norm_slug in db_slugs: return norm_slug, "slug"
    if norm_slug in db_canon: return db_canon[norm_slug], "canonical_name"
    if norm_slug in alias_map: return alias_map[norm_slug], "alias"
    return None, None

# ---- Symbolic master corpus: name -> set(source_system) ----
name_systems = defaultdict(set)   # slugified source_name -> {source_system}
slug_systems = defaultdict(set)   # canonical_slug -> {source_system}
with MASTER.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        sysname = (row.get("source_system") or "").strip()
        if not sysname: continue
        nm = slugify(row.get("source_name") or "")
        cs = (row.get("canonical_slug") or "").strip()
        if nm: name_systems[nm].add(sysname)
        if cs: slug_systems[cs].add(sysname)

# Collapse raw source_system labels to TRUE independent source families.
# Multiple tables/projections of the same upstream source are NOT independent
# attestation; derived TS/DB content is not attestation at all. This collapse
# is the load-bearing anti-inflation step.
SOURCE_FAMILY = {
    "fm_inventory": "FM", "fm_symbolic_grammar": "FM",
    "PB": "PassBack", "passback": "PassBack",
    "passback_intake": "PassBack", "passback_source_links": "PassBack",
    "fborg_text": "footbag.org", "fborg_insert_staging": "footbag.org",
    "stanford_corpus": "Stanford",
    "canonical_db": "(derived-db)", "tracked_names_ts": "(derived)",
    "observational_ts": "(derived)",
}
DERIVED = {"(derived)", "(derived-db)"}

def external_systems(norm_slug: str, matched_slug):
    sys_set = set(name_systems.get(norm_slug, set()))
    if matched_slug:
        sys_set |= slug_systems.get(matched_slug, set())
    sys_set |= slug_systems.get(norm_slug, set())
    return sys_set

def families(sys_set):
    fams = {SOURCE_FAMILY.get(s, s) for s in sys_set}
    return fams

# ===================== PART B: Bucket-6 attestation =====================
PLACEHOLDER = {"anonymous", "unknown", "untitled", "n-a", "na", "tbd", "", "various"}
rows_out = []
cls_counts = defaultdict(int)
with NEWCAND.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        primary = (row.get("passback_primary_name") or "").strip()
        norm = (row.get("normalized_primary_name") or "").strip() or slugify(primary)
        tech = (row.get("passback_technical_name") or "").strip()
        alts = (row.get("passback_alternate_names") or "").strip()

        matched_slug, how = db_existence(norm)
        sys_set = external_systems(norm, matched_slug)
        fams = families(sys_set)
        # canonical_db family attests the name is already canonical — treat as a
        # recovery signal even if the slug matcher missed it.
        canonical_db_attests = "(derived-db)" in fams
        # independent = real external source families, minus PassBack-self, minus derived
        independent = fams - {"PassBack"} - DERIVED
        sys_count = len(fams - DERIVED)

        # folk-name signal: does the primary name differ from its technical decomposition?
        distinct_folk_name = bool(tech) and slugify(primary) != slugify(tech) and norm not in PLACEHOLDER

        # mechanically-derivable: technical name present and decomposes to modifier(s)+something
        tech_tokens = [slugify(t) for t in re.split(r"[ ,]+", tech) if t]
        has_known_modifier = any(t in modifier_slugs for t in tech_tokens)

        # ---- classification ----
        if norm in PLACEHOLDER:
            cls = "malformed/placeholder"
        elif matched_slug or canonical_db_attests:
            cls = "duplicate/recovered (already canonical)"
        elif len(independent) >= 2:
            cls = "strongly attested (>=2 independent sources)"
        elif len(independent) == 1:
            cls = "weakly attested (1 independent source + PassBack)"
        elif distinct_folk_name:
            cls = "single-source only (PassBack-only folk name)"
        elif not tech:
            cls = "malformed/impossible (no decomposition)"
        else:
            cls = "parser-derived only (name == decomposition)"

        cls_counts[cls] += 1
        rows_out.append({
            "primary_name": primary,
            "normalized": norm,
            "technical_name": tech,
            "alt_names": alts,
            "db_match": matched_slug or ("canonical_db" if canonical_db_attests else ""),
            "db_match_via": how or ("canonical_db_corpus" if canonical_db_attests else ""),
            "independent_families": "|".join(sorted(independent)) or "(none)",
            "all_families": "|".join(sorted(fams - DERIVED)) or "(none)",
            "independent_source_count": len(independent),
            "distinct_folk_name": "Y" if distinct_folk_name else "N",
            "decomposable": "Y" if has_known_modifier else "N",
            "classification": cls,
        })

with (OUTDIR / "bucket6_attestation.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(rows_out[0].keys()))
    w.writeheader(); w.writerows(rows_out)

partb = []
partb.append(f"PART B — Bucket-6 existence/attestation pass ({len(rows_out)} new_candidate rows)\n")
for cls, n in sorted(cls_counts.items(), key=lambda x: -x[1]):
    partb.append(f"  {n:4d}  {cls}")
# derived rollups
recovered = cls_counts["duplicate/recovered (already canonical)"]
placeholder = cls_counts["malformed/placeholder"] + cls_counts.get("malformed/impossible (no decomposition)", 0)
strong = cls_counts["strongly attested (>=2 independent sources)"]
weak = cls_counts["weakly attested (1 independent source + PassBack)"]
single = cls_counts["single-source only (PassBack-only folk name)"]
parser = cls_counts.get("parser-derived only (name == decomposition)", 0)
genuinely_new = len(rows_out) - recovered - placeholder
partb.append("")
partb.append(f"  Reported Bucket-6 size:            {len(rows_out)}")
partb.append(f"  - Already in DB (false-new):       {recovered}")
partb.append(f"  - Malformed / placeholder:         {placeholder}")
partb.append(f"  = Genuinely-new candidates:        {genuinely_new}")
partb.append(f"      of which strongly attested:    {strong}")
partb.append(f"      of which weakly attested:      {weak}")
partb.append(f"      of which single-source folk:   {single}")
partb.append(f"      of which parser-derived only:  {parser}")
(OUTDIR / "partB_summary.txt").write_text("\n".join(partb) + "\n", encoding="utf-8")
print("\n".join(partb))

# ===================== PART A: operator-intake token attestation =====================
TOKENS = ["railing","flailing","floating","surfing","splicing","warping",
          "motion","os","xbd","x-body","zulu","warp","nova","star","double","p.s","torquescrew","bent"]
# count token occurrences across all source_name strings in the master corpus + new_candidate technical names
corpus_names = []
with MASTER.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        nm = (row.get("source_name") or "").strip()
        if nm: corpus_names.append((nm, (row.get("source_system") or "").strip()))
with NEWCAND.open(newline="", encoding="utf-8") as f:
    for row in csv.DictReader(f):
        for col in ("passback_primary_name","passback_technical_name","passback_alternate_names"):
            v = (row.get(col) or "").strip()
            if v: corpus_names.append((v, "PB"))

parta_rows = []
for tok in TOKENS:
    pat = re.compile(r"(?<![a-z])" + re.escape(tok) + r"(?![a-z])", re.I)
    hits = [(nm, sysn) for nm, sysn in corpus_names if pat.search(nm)]
    examples = sorted({nm for nm, _ in hits})[:5]
    systems = sorted({s for _, s in hits if s})
    parta_rows.append({
        "token": tok,
        "occurrences": len(hits),
        "distinct_names": len(set(nm for nm, _ in hits)),
        "source_systems": "|".join(systems),
        "examples": " ; ".join(examples),
    })

with (OUTDIR / "partA_token_attestation.csv").open("w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(parta_rows[0].keys()))
    w.writeheader(); w.writerows(parta_rows)

parta = ["", "PART A — operator-intake token attestation (corpus-wide occurrence)\n"]
for r in sorted(parta_rows, key=lambda x: -x["occurrences"]):
    parta.append(f"  {r['occurrences']:4d}x ({r['distinct_names']} distinct names)  {r['token']:12s} [{r['source_systems']}]")
(OUTDIR / "partA_summary.txt").write_text("\n".join(parta) + "\n", encoding="utf-8")
print("\n".join(parta))
