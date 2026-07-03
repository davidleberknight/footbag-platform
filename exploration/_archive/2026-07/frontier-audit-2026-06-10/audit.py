#!/usr/bin/env python3
"""Frontier audit: current freestyle-dictionary state after recent promotions,
PassBack orphan reduction, alias wiring, and Red doctrine updates.

Read-only. Reconciles the live DB with current CSV inputs (canon = DB active
UNION slugify(active red_additions)) so the 11 not-yet-reloaded promotions count.
Emits the 7 deliverable CSVs and prints the summary numbers for FRONTIER_AUDIT.md.
"""
import csv, re, sqlite3
from pathlib import Path
from collections import Counter, defaultdict

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "exploration/frontier-audit-2026-06-10"
TD = ROOT / "legacy_data/inputs/curated/tricks"
NOISE = ROOT / "legacy_data/inputs/noise"
CAND = ROOT / "exploration/passback-intake/passback_reports/new_candidates.csv"
OBS = ROOT / "src/content/freestyleObservationalTricks.ts"
SNIP = ROOT / "legacy_data/tools/trick_video_discovery/snippet_candidates.csv"

conn = sqlite3.connect(ROOT / "database/footbag.db")


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.strip().lower()).strip("-")


# ---- canon + aliases (DB UNION current CSV state) ----
db_rows = {r[0]: {"adds": r[1], "opn": r[2] or "", "name": (r[3] or "").lower()}
           for r in conn.execute(
    "SELECT slug, adds, operational_notation, canonical_name FROM freestyle_tricks WHERE is_active=1")}
canon = set(db_rows)
canon_names = {v["name"] for v in db_rows.values()}
ra_meta = {}  # pending red_additions: slug -> (adds, opnotation later)
for line in (TD / "red_additions_2026_04_20.csv").read_text().splitlines():
    p = line.split(",")
    if len(p) > 8 and re.fullmatch(r"\d+", p[1].strip()) and p[8].strip() == "1":
        sl = slugify(p[0])
        canon.add(sl)
        canon_names.add(sl.replace("-", " "))
        if sl not in db_rows:
            ra_meta[sl] = p[1].strip()
opn = {}  # slug -> operational_notation, from red_corrections (current) overlaying DB
for v_slug, v in db_rows.items():
    if v["opn"]:
        opn[v_slug] = v["opn"]
for line in (TD / "red_corrections_2026_04_20.csv").read_text().splitlines():
    p = line.split(",")
    if len(p) >= 4 and p[1] == "operational_notation" and p[3].strip():
        opn[p[0]] = p[3]
alias = set()
for r in csv.DictReader((NOISE / "tricks.csv").open()):
    alias |= {a.strip().lower() for a in (r.get("aliases") or "").split("|") if a.strip()}
for r in csv.DictReader((NOISE / "trick_aliases.csv").open()):
    if r.get("alias"):
        alias.add(r["alias"].strip().lower())
for line in (TD / "red_additions_2026_04_20.csv").read_text().splitlines():
    p = line.split(",")
    if len(p) > 4:
        alias |= {a.strip().lower() for a in p[4].split("|") if a.strip()}

BRACKET = re.compile(r"\[(BOD|DEX|XBD|DEL|UNS|PDX|XDEX)\]")
DEX = re.compile(r"\[(DEX|XDEX)\]")


def adds_of(slug):
    if slug in db_rows and db_rows[slug]["adds"] not in (None, ""):
        try:
            return int(db_rows[slug]["adds"])
        except ValueError:
            return None
    if slug in ra_meta:
        return int(ra_meta[slug])
    return None


# ---- bucket 1: counts ----
active_canon = len(canon)
n_pending = len(ra_meta)
# first-class proxy: active trick with op_notation whose bracket-count == adds
fc = 0
for sl in canon:
    a = adds_of(sl)
    n = opn.get(sl, "")
    if n and a is not None and len(BRACKET.findall(n)) == a:
        fc += 1
media_tricks = conn.execute(
    "SELECT count(DISTINCT tag_display) FROM media_tags WHERE tag_display LIKE '#%' "
    "AND tag_display NOT IN ('#freestyle','#trick','#tricks_of_the_trade','#passback_records')"
).fetchone()[0]

# ---- PassBack residual (re-derive, alias-aware) ----
ABBR = {"dlo": "double-leg-over", "dso": "double-switchover", "datw": "double-around-the-world",
        "dod": "double-over-down", "ddd": "down-double-down", "atw": "around-the-world"}
SIDE = {"far", "near", "same", "op", "full", "rev"}
QUAL = {"ss", "op", "far", "near", "same", "full", "same-side", "opposite", "s.s."}
NONTRICK = {">", "contact", "dex", "dexterity", "in(-out) dex", "out(-in) dex",
            "strong side", "flip side", "gyro", "spinning", "double spinning"}
known = set()
for s in canon:
    known |= set(s.split("-"))
mods = {r[0].lower() for r in conn.execute("SELECT slug FROM freestyle_trick_modifiers")}
known |= mods | {"far","near","same","op","full","rev","double","triple","symposium","symp",
    "dex","jump","toe","clip","set","spin","swirl","back","front","into","plant","no","while",
    "downtime","uptime","midtime","double-dex","triple-dex","quad-dex","xbd","bxd","in","out","bs",
    "ps","dlo","dso","datw","dod","ddd","atw","blurry","clipper","crossbody","cross","body","leg",
    "over","side","opposite"}


def base(raw):
    return raw.split("/")[0].split("(")[0].strip().lower()


def namevar(raw):
    t = [x for x in base(raw).split() if x not in QUAL]
    return " ".join(t), "-".join(ABBR.get(x, x) for x in t)


def norm_decomp(tn):
    tn = tn.split(",")[0].replace("Symp.", "symposium").replace("Symp", "symposium")
    return "-".join(ABBR.get(x, x) for x in (w.strip().lower().rstrip(".") for w in re.split(r"\s+", tn.strip()))
                    if x and x not in SIDE and not x.startswith("(") and x not in (">", ">>"))


def undef_tokens(tn):
    out = []
    for w in re.split(r"\s+", (tn or "").split(",")[0]):
        t = w.strip().lower().rstrip(".")
        if not t or t.startswith("(") or t in (">", ">>") or t in SIDE:
            continue
        if t not in known and t not in alias:
            out.append(t)
    return out


residual = []
seen = set()
for r in csv.DictReader(CAND.open()):
    raw = r["passback_primary_name"].strip()
    if raw in seen:
        continue
    seen.add(raw)
    if raw.lower() in NONTRICK or base(raw).split(",")[0].strip() in NONTRICK or base(raw) in NONTRICK:
        continue
    if base(raw) in alias:
        continue
    nm, sl = namevar(raw)
    if nm in canon_names or sl in canon or norm_decomp(r["passback_technical_name"]) in canon:
        continue
    residual.append((raw, r["passback_technical_name"].strip(), r["passback_dex_count"].strip()))


# ---- parse observational vocab (emerging) ----
obs = []
text = OBS.read_text()
for chunk in text.split("folkSlug:")[1:]:
    g = lambda pat: (re.search(pat, chunk, re.DOTALL))
    folk = g(r"\s*'([^']+)'")
    name = g(r"displayName:\s*'([^']*)'")
    add = g(r"proposedAddTotal:\s*(\d+|null)")
    lane = g(r"governanceLane:\s*'([^']+)'")
    status = g(r"status:\s*'([^']+)'")
    blk = g(r"unresolvedBlockers:\s*\[(.*?)\]")
    readings = g(r"proposedReadings:\s*\[(.*?)\]")
    obs.append({
        "slug": folk.group(1) if folk else "",
        "name": name.group(1) if name else "",
        "add": None if (not add or add.group(1) == "null") else int(add.group(1)),
        "lane": lane.group(1) if lane else "source-only",
        "status": status.group(1) if status else "",
        "blockers": re.findall(r"'([^']+)'", blk.group(1)) if blk else [],
        "readings": re.findall(r"'([^']+)'", readings.group(1)) if readings else [],
    })


def now_canonical(o):
    # identity-based only: the folk name itself is now a canonical slug, a
    # canonical name, or a registered alias. NOT readings-based (a reading may
    # cite a canonical the entry is merely derived-near, e.g. "Rev. Big Apple").
    return bool(o["slug"]) and (
        o["slug"] in canon or o["name"].lower() in canon_names or base(o["name"]) in alias)


def reading_undef(o):
    u = set()
    for rd in o["readings"]:
        u |= set(undef_tokens(rd))
    return u


# ---- blocker categorization ----
def blocker_group(text_blob):
    t = text_blob.lower()
    if any(k in t for k in ["x-dex", "xdex", "atomic", "quantum", "nuclear"]):
        return "atomic/quantum X-Dex"
    if any(k in t for k in ["blur", "furious", "railing", "barrag"]):
        return "blur/furious"
    if "weav" in t:
        return "weaving"
    if "shoot" in t:
        return "shooting"
    if "pogo" in t:
        return "pogo"
    if any(k in t for k in ["dod", "ddd", "dragon", "down-double", "double-over", "over-down",
                            "double down", "double-down", "down double"]):
        return "DOD/DDD/dragon"
    if any(k in t for k in ["motion", "twisting", "frantic", "flailing", "slapping", "zulu"]):
        return "motion/twisting/frantic/undefined"
    return "other"


DOD_RE = re.compile(r"double\s+down|down\s+double|over\s+down|down-double|double-over", re.I)


# ---- classify observational (emerging vocab) into bucket 7 ----
# Real fields: readings (structure), add (PB claim or null), blockers ([] for this
# doctrine-safe cohort). No governanceLane. So: identity-canonical -> already done;
# reading has undefined operator -> doctrine/undefined; single clean reading + ADD
# claim -> promotion-candidate (fastest: author op_notation from the reading, verify
# bracket==ADD); clean reading(s) w/o single+ADD -> needs-authoring; no reading ->
# source-only/historical.
g7 = defaultdict(list)
for o in obs:
    if not o["slug"]:
        continue
    if now_canonical(o):
        o["_class"] = "already-canonical-or-alias"
    else:
        u = reading_undef(o)
        if any(DOD_RE.search(rd) for rd in o["readings"]):
            u = u | {"double-down (DOD/DDD policy open)"}
        o["_undef"] = u
        if u or o["blockers"]:
            o["_class"] = "doctrine/undefined-operator"
        elif o["add"] is not None and len(o["readings"]) == 1:
            o["_class"] = "promotion-candidate"
        elif o["readings"]:
            o["_class"] = "needs-authoring"
        else:
            o["_class"] = "source-only/historical"
    g7[o["_class"]].append(o)

# ---- bucket 2: promotion-ready = single clean reading + ADD claim (needs only
# op_notation authoring; no zero-edit promotions remain, Tier-1 runway exhausted) ----
promo = g7["promotion-candidate"]
# ---- bucket 3: needs authoring (clean structure, ambiguous/absent ADD or formula) ----
authoring = g7["needs-authoring"]
# ---- bucket 4: doctrine-blocked = observational undefined-operator + residual undefined ----
blocked = []
for o in g7["doctrine/undefined-operator"]:
    grp = blocker_group(" ".join(o["_undef"]) + " " + " ".join(o["blockers"]) + " " + o["name"])
    blocked.append((o["name"], o["slug"], grp,
                    "undefined: " + ", ".join(sorted(o["_undef"])) if o["_undef"] else "; ".join(o["blockers"])))
for raw, tn, dex in residual:
    u = undef_tokens(tn)
    if u:
        blocked.append((raw, slugify(raw), blocker_group(" ".join(u)), "undefined op: " + ", ".join(u)))
# ---- bucket 5: unknown add or dex ----
unknown = []
for sl in canon:
    if sl in mods:
        continue  # operator/modifier row -- ADD is N/A by definition, not a terminal trick
    a = adds_of(sl)
    n = opn.get(sl, "")
    if a is None:
        unknown.append((sl, "active-canonical", "null ADD", "derivable" if sl in ra_meta else "needs Red"))
    elif not n:
        unknown.append((sl, "active-canonical", "no op_notation -> unknown dex", "source missing / derivable"))
for o in obs:
    if o.get("_class") not in (None, "already-canonical-or-alias") and o["add"] is None:
        unknown.append((o["slug"], "observational", "null proposed ADD",
                        "needs Red" if o["_class"] == "doctrine/undefined-operator" else "derivable"))
# ---- bucket 6: orphan videos ----
orphan_vid = []
for row in list(csv.reader(SNIP.open()))[1:]:
    if len(row) < 3:
        continue
    sl = row[2].strip()
    if sl and sl not in canon and sl.replace(" ", "-") not in canon:
        nm = sl.replace("-", " ")
        proposed = ""
        if base(nm) in alias:
            proposed = "alias-resolves"
        orphan_vid.append((row[5] if len(row) > 5 else "", sl, proposed or "Red-needed"))

# ---- write CSVs ----
OUT.mkdir(exist_ok=True)


def w(name, header, rows):
    with (OUT / name).open("w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(header)
        wr.writerows(rows)


w("promotion_ready_now.csv", ["display_name", "folk_slug", "pb_add_claim", "reading", "next_action"],
  sorted([(o["name"], o["slug"], o["add"], o["readings"][0] if o["readings"] else "",
           "author op_notation from reading; verify bracket-count == ADD; then promote")
          for o in promo], key=lambda x: (x[2] if x[2] is not None else 99)))
w("needs_authoring.csv", ["display_name", "folk_slug", "pb_add_claim", "n_readings", "reason"],
  sorted([(o["name"], o["slug"], o["add"], len(o["readings"]),
           "multiple competing readings" if len(o["readings"]) > 1 else "no ADD claim / thin structure")
          for o in authoring], key=lambda x: x[0].lower()))
w("doctrine_blocked_current.csv", ["name", "slug", "blocker_group", "detail"],
  sorted(blocked, key=lambda x: (x[2], x[0].lower())))
w("unknown_add_or_dex.csv", ["slug", "layer", "issue", "disposition"],
  sorted(unknown, key=lambda x: (x[1], x[0])))
w("orphan_video_residual.csv", ["video_label", "current_slug", "proposed"],
  sorted(orphan_vid))
w("emerging_vocab_classified.csv", ["name", "slug", "classification", "pb_add_claim", "readings"],
  sorted([(o["name"], o["slug"], o.get("_class", "skip"), o["add"], " | ".join(o["readings"]))
          for o in obs if o["slug"]], key=lambda x: (x[2], x[0].lower())))

# ---- summary ----
print(f"== BUCKET 1 counts ==")
print(f"active canonical: {active_canon} (DB {len(db_rows)} + pending {n_pending})")
print(f"aliases (current CSV source): {len(alias)} | DB freestyle_trick_aliases: 166")
print(f"first-class (convergence proxy, bracket==adds): {fc}")
print(f"media coverage (distinct tricks): {media_tricks}")
print(f"PassBack residual: {len(residual)}")
print(f"== observational vocab: {len(obs)} entries ==")
for k in sorted(g7):
    print(f"  bucket7 {k}: {len(g7[k])}")
print(f"== BUCKET 2 promotion-ready (with ADD): {len(promo)} ==")
print("  by ADD:", dict(sorted(Counter(o['add'] for o in promo).items(), key=lambda x:(x[0] if x[0] is not None else 99))))
print(f"== BUCKET 3 needs-authoring: {len(authoring)} ==")
print(f"== BUCKET 4 doctrine-blocked: {len(blocked)} ==")
print("  by group:", dict(Counter(b[2] for b in blocked)))
print(f"== BUCKET 5 unknown add/dex: {len(unknown)} ==")
print("  by issue:", dict(Counter(u[2] for u in unknown)))
print(f"== BUCKET 6 orphan videos on non-canonical slugs: {len(orphan_vid)} ==")
print(f"wrote 6 CSVs + emerging_vocab_classified.csv to {OUT}")
