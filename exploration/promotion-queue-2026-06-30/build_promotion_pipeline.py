#!/usr/bin/env python3
"""Build the Unknown reclassification + merged promotion queue, with a
depends_on_parent DB pass. Reads DB + the committed frontier artifact + the
generated universe. Writes CSVs to scratchpad; prints summary to stderr.
Deterministic; read-only against the repo."""
import sqlite3, csv, re, io, sys, os, collections

ROOT = "."
DB = "database/footbag.db"
SCRATCH = os.path.dirname(os.path.abspath(__file__))
FRONTIER_CSV = "exploration/frontier-reclassification-2026-06-30/CLASSIFICATION.csv"
UNIVERSE = "src/content/freestyleObservationalUniverse.ts"

def norm(s):
    s = (s or "").lower().strip()
    return re.sub(r"[^a-z0-9]+", "_", s).strip("_")

# ---- canonical membership ------------------------------------------------
con = sqlite3.connect(DB); cur = con.cursor()
cur.execute("""SELECT slug, COALESCE(canonical_name,''), COALESCE(adds,''), COALESCE(base_trick,''),
  COALESCE(trick_family,''), COALESCE(category,''), COALESCE(notation,''),
  COALESCE(jobs_notation_normalized,'')||COALESCE(jobs_notation_raw,''),
  COALESCE(add_formula_status,''), COALESCE(operational_notation,'')
  FROM freestyle_tricks WHERE is_active=1""")
active = cur.fetchall()
slug_norm = {norm(r[0]): r[0] for r in active}
name_norm = {norm(r[1]): r[0] for r in active if r[1]}
compact = {}
for r in active:
    compact[norm(r[0]).replace("_", "")] = r[0]
    if r[1]: compact.setdefault(norm(r[1]).replace("_", ""), r[0])
alias = set()
try:
    cur.execute("SELECT alias_slug FROM freestyle_trick_aliases")
    alias = {norm(a) for (a,) in cur.fetchall()}
except Exception:
    pass

def canonical_slug(base):
    n = norm(base)
    if not n: return None
    if n in slug_norm: return slug_norm[n]
    if n in name_norm: return name_norm[n]
    if n in alias: return n
    c = n.replace("_", "")
    if c in compact: return compact[c]
    return None

NB_UNDEFINED = {"blazing","symple","slapping","fusing","phasing","slaying","sonic","twinspinning",
                "frootie","fyro","leaning","twisted","twisting","wonton","wrecking","snapping","zipper"}
SETTLED_OPS = {"atomic","illusioning","shooting","backside","furious","barraging","blurry","nuclear",
               "quantum","flailing","tapping","inspinning","pogo","miraging","whirling","swirling",
               "spinning","gyro","stepping","ducking","diving","symposium","paradox","fairy","pixie",
               "surging","terraging","terrage","reverse","far","near","ss"}
CURATOR_OVERRIDE = {"big_apple_sauce"}   # genuine multi-reading canonical choice

def toks(s): return re.findall(r"[a-z]+", (s or "").lower())

# ---- Unknown / notation-pending reclassification -------------------------
unknown_rows = [r for r in active if not r[9].strip()]   # empty operational_notation

def classify_unknown(r):
    slug, name, adds, base, fam, cat, notn, job, afs, op = r
    t = toks(name or slug)
    flags = []
    if notn.strip() or job.strip(): flags.append("notation_placeholder")
    lead = next((x for x in t if x in SETTLED_OPS), None)
    if lead: flags.append("operator_now_settled")
    if any(x in NB_UNDEFINED for x in t):
        flags = ["undefined_operator"] + flags
        return "Doctrine Blocked", flags, "Operator definition pending (Red): %s" % ",".join(x for x in t if x in NB_UNDEFINED), \
               "undefined folk operator in name"
    if cat == "modifier":
        return "Needs Curator Review", flags + ["operator_anchor"], \
               "Decide surfacing: operator-definition row, not a dex-trick", \
               "category=modifier; an operator anchor, not an authorable dex-trick"
    if any(x in ("down","dod","ddd") for x in t):
        if "verification_needed" not in flags: flags.append("verification_needed")
        return "Needs Curator Review", flags, "Curator verifies down-family decomposition (DOD vs DDD)", \
               "down-family terminal; governance/verification, not a ruling"
    if slug in CURATOR_OVERRIDE:
        flags.append("verification_needed")
        return "Needs Curator Review", flags, "Curator selects canonical reading (multiple plausible)", \
               "documented but carries a genuine multi-reading canonical choice"
    if afs in ("approximate", "policy_dependent"):
        if "verification_needed" not in flags: flags.append("verification_needed")
    if notn.strip() or job.strip():
        return "Ready for Authoring", flags, "Write operational notation; movement JOB + ADD already present", \
               "settled operators; only symbolic operational_notation pending"
    return "Ready for Authoring", flags, "Author operational notation + ADD", \
           "settled operators; structure understood, notation not yet written"

unk_out = []
for r in unknown_rows:
    slug, name, adds, base, fam, cat, notn, job, afs, op = r
    primary, flags, action, rationale = classify_unknown(r)
    unk_out.append(dict(slug=slug, current_label="Unknown (dex-count: notation pending)",
                        primary=primary, flags=flags, next_action=action, rationale=rationale,
                        add=adds, job=("JOB" if job.strip() else ("notation" if notn.strip() else "")),
                        base=base, family=fam or base, source="unknown-notation"))

# ---- frontier artifact + universe (name -> slug, ecosystem) --------------
uni = {}
for line in open(UNIVERSE):
    s = line.strip().rstrip(",")
    if s.startswith("{") and s.endswith("}"):
        try:
            import json; o = json.loads(s)
            uni[o["name"]] = o
        except Exception: pass

def terminal_base(decomp, name):
    if decomp:
        terms = re.findall(r"([A-Za-z][\w\-' ]*?)\((\+?\d+)\)", decomp)
        bases = [t.strip() for t, v in terms if not v.startswith("+")]
        if bases: return bases[-1]
    t = toks(name.split("(")[0])
    return t[-1] if t else ""

front = []
with open(FRONTIER_CSV) as f:
    for row in csv.DictReader(f):
        front.append(row)

# ---- depends_on_parent across both Ready populations ---------------------
# Resolve the immediate base/parent by trying, in order: the decomposition's
# terminal base, an explicit DB base_trick, then the longest canonical suffix of
# the name's tokens (handles multi-word bases like "leg over"->legover,
# "da da curve"->dada_curve that a last-token grab would miss).
def resolve_parent(decomp, name, explicit_base=""):
    cands = []
    db = terminal_base(decomp, name)
    if explicit_base: cands.append(explicit_base)
    if db: cands.append(db)
    t = toks(name.split("(")[0])
    for i in range(len(t)):
        for j in range(len(t), i, -1):
            cands.append(" ".join(t[i:j]))
    for c in cands:
        cs = canonical_slug(c)
        if cs: return True, None
    best = explicit_base or db or (t[-1] if t else "")
    return False, norm(best)

# frontier Ready
front_ready = []
for row in front:
    if row["primary"] != "Ready for Authoring": continue
    name = row["name"]; u = uni.get(name, {})
    ok, missing = resolve_parent(row.get("decomposition",""), name)
    flags = [x for x in row["flags"].split("|") if x]
    if not ok and "depends_on_parent" not in flags:
        flags.append("depends_on_parent")
    front_ready.append(dict(slug=u.get("slug", norm(name)), name=name, source="frontier",
                            add=row.get("provisional_add",""), family=u.get("ecosystem","(unclassified)"),
                            base=missing or "", flags=flags, missing_parent=missing,
                            rationale=row.get("rationale",""), next_action=row.get("next_action","")))
# unknown Ready
unk_ready = []
for u in unk_out:
    if u["primary"] != "Ready for Authoring": continue
    ok, missing = resolve_parent("", u["slug"], explicit_base=u["base"])
    flags = list(u["flags"])
    if not ok and "depends_on_parent" not in flags: flags.append("depends_on_parent")
    unk_ready.append(dict(slug=u["slug"], name=u["slug"], source="unknown-notation",
                          add=u["add"], family=u["family"], base=u["base"], flags=flags,
                          missing_parent=missing, rationale=u["rationale"], next_action=u["next_action"]))

# ---- wave assignment -----------------------------------------------------
def wave(flags, missing):
    fs = set(flags)
    if "duplicate_or_alias_candidate" in fs: return "hold_curator_review"
    if "depends_on_parent" in fs:
        if missing and any(x in NB_UNDEFINED for x in toks(missing)): return "hold_doctrine"
        return "wave_3_parent_dependency"
    if "verification_needed" in fs: return "wave_2_no_dependency_verification_flag"
    return "wave_1_no_dependency_no_verification"

queue = []
for r in front_ready + unk_ready:
    flags = list(r["flags"])
    has_add = bool(re.match(r"^\d+$", str(r["add"]).strip()))
    if has_add and "decomposition_present" not in flags:
        flags.append("decomposition_present")   # ADD already derived -> lightest promote
    w = wave(flags, r["missing_parent"])
    queue.append(dict(slug=r["slug"], source_bucket=r["source"], ADD=r["add"],
                      family_operator_group=r["family"], flags="|".join(flags),
                      missing_parent_slug=r["missing_parent"] or "", recommended_wave=w,
                      rationale=r["rationale"], next_action=r["next_action"]))

# ---- write CSVs ----------------------------------------------------------
def writecsv(path, fields, rows):
    with open(path, "w", newline="") as fh:
        w = csv.DictWriter(fh, fieldnames=fields); w.writeheader()
        for r in rows: w.writerow({k: r.get(k, "") for k in fields})

# unknown CLASSIFICATION
ufields = ["slug","current_label","primary","flags","next_action","rationale","add","job","base","family"]
urows = [dict(slug=u["slug"], current_label=u["current_label"], primary=u["primary"],
             flags="|".join(u["flags"]), next_action=u["next_action"], rationale=u["rationale"],
             add=u["add"], job=u["job"], base=u["base"], family=u["family"]) for u in
         sorted(unk_out, key=lambda x:(x["primary"], x["slug"]))]
writecsv(os.path.join(SCRATCH,"unknown_CLASSIFICATION.csv"), ufields, urows)

qfields = ["slug","source_bucket","ADD","family_operator_group","flags","missing_parent_slug",
           "recommended_wave","rationale","next_action"]
WAVE_ORDER = {"wave_1_no_dependency_no_verification":0,"wave_2_no_dependency_verification_flag":1,
              "wave_3_parent_dependency":2,"hold_curator_review":3,"hold_parser":4,"hold_doctrine":5}
queue.sort(key=lambda r:(WAVE_ORDER.get(r["recommended_wave"],9), r["family_operator_group"], r["slug"]))
writecsv(os.path.join(SCRATCH,"PROMOTION_QUEUE.csv"), qfields, queue)

# ---- summary -------------------------------------------------------------
e = sys.stderr
e.write("\n==== UNKNOWN RECLASS ====\n")
pc = collections.Counter(u["primary"] for u in unk_out)
e.write("rows: %d | %s\n" % (len(unk_out), dict(pc)))
e.write("\n==== PROMOTION QUEUE (Ready-for-Authoring only) ====\n")
e.write("total Ready rows: frontier=%d unknown=%d total=%d\n" % (len(front_ready), len(unk_ready), len(queue)))
wc = collections.Counter(r["recommended_wave"] for r in queue)
for w in sorted(wc, key=lambda x: WAVE_ORDER.get(x,9)):
    e.write("  %-40s %d\n" % (w, wc[w]))
dep = [r for r in queue if r["missing_parent_slug"]]
e.write("depends_on_parent rows: %d ; distinct missing parents: %s\n" %
        (len(dep), sorted({r["missing_parent_slug"] for r in dep})))
ver = sum(1 for r in queue if "verification_needed" in r["flags"])
e.write("verification_needed rows: %d\n" % ver)
e.write("\ntop family/operator groups (queue):\n")
for fam, n in collections.Counter(r["family_operator_group"] for r in queue).most_common(15):
    e.write("  %-22s %d\n" % (fam, n))
w1 = [r for r in queue if r["recommended_wave"]=="wave_1_no_dependency_no_verification"]
w1_with_add = [r for r in w1 if "decomposition_present" in r["flags"]]
w1_no_add = [r for r in w1 if "decomposition_present" not in r["flags"]]
e.write("\nwave_1 (no dependency, no verification) = %d\n" % len(w1))
e.write("  of which ADD/decomposition ALREADY present (lightest promote) = %d\n" % len(w1_with_add))
e.write("  of which settled-operator but ADD not yet authored = %d\n" % len(w1_no_add))
e.write("\nwave_1 WITH decomposition, by family (the clean first-batch candidates):\n")
for fam, n in collections.Counter(r["family_operator_group"] for r in w1_with_add).most_common(15):
    e.write("  %-22s %d\n" % (fam, n))
# proposed first batch: wave_1 + decomposition_present + no positional flag, capped per family
fb = [r for r in w1_with_add if "positional_variant" not in r["flags"]]
e.write("\nproposed FIRST BATCH (wave_1 + decomposition_present + non-positional) = %d\n" % len(fb))
for fam, n in collections.Counter(r["family_operator_group"] for r in fb).most_common(20):
    e.write("  %-22s %d\n" % (fam, n))
