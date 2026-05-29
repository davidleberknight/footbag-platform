"""
FM/folk >=7 triage generator (read-only, no promotion, no DB writes).

Applies the Phase 2 methodology (PHASE2_FM_FOLK_ADJUDICATION_METHODOLOGY.md) to the FM-attested
folk-named >=7-ADD cohort. The engine is STRUCTURAL: it decomposes each FM technical name into a
(registered-operator-set + base) and matches that against canonical rows' modifier_links+base, so
folk names resolve to existing structures (the gauntlet / alpine-big-apple pattern) rather than by
name string.

SAFETY: a structural duplication match is claimed ONLY when the decomposition is COMPLETE — i.e. every
token resolves to a registered operator, a known base, or a positional. Any unrecognized token blocks
the match and routes the candidate to Tier C (incomplete decomposition / operator-intake). This
prevents false alias matches from silently-dropped tokens.

Outputs: fm_folk_ge7_triage.csv (one row per candidate) in this directory. Read-only on the DB.
Run from repo root: python3 exploration/frontier-canonicalization-initiative/build_fm_folk_ge7_triage.py
"""
import csv, sqlite3, re, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
CORPUS = ROOT / "exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv"
OUT = Path(__file__).resolve().parent / "fm_folk_ge7_triage.csv"

conn = sqlite3.connect(f"file:{ROOT/'database/footbag.db'}?mode=ro", uri=True)
ROTATIONAL = {"mirage","whirl","torque","blender","swirl","drifter"}
REG = {r[0] for r in conn.execute("SELECT slug FROM freestyle_trick_modifiers")}
OP_FORMS = {"spinning":"spinning","miraging":"miraging","symp":"symposium","symposium":"symposium",
  "pixie":"pixie","fairy":"fairy","ducking":"ducking","diving":"diving","atomic":"atomic",
  "stepping":"stepping","nuclear":"nuclear","whirling":"whirling","swirling":"swirling",
  "barraging":"barraging","blurry":"blurry","tapping":"tapping","gyro":"gyro","quantum":"quantum",
  "terraging":"terraging","weaving":"weaving","backside":"backside","blazing":"blazing",
  "furious":"furious","pogo":"pogo","rooted":"rooted","shooting":"shooting"}
POS = {"ss","op","far","near","full","rev","reverse","same","side"}   # diving is a MODIFIER, not positional
MULTIWORD = [("double over down","double-over-down"),("down over down","down-over-down"),
  ("double down","double-down"),("double leg over","double-leg-over"),("leg over","legover")]
BASES = set()
for (b,) in conn.execute("SELECT DISTINCT base_trick FROM freestyle_tricks WHERE base_trick IS NOT NULL"):
    BASES.add(re.sub(r"[^a-z0-9]+","-",b.lower()).strip("-"))
for (f,) in conn.execute("SELECT DISTINCT trick_family FROM freestyle_tricks WHERE trick_family IS NOT NULL"):
    BASES.add(re.sub(r"[^a-z0-9]+","-",f.lower()).strip("-"))
canon = {r[0] for r in conn.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1")}
aliases = {r[0] for r in conn.execute("SELECT alias_slug FROM freestyle_trick_aliases")}
modlinks = collections.defaultdict(set)
for t,m in conn.execute("SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links"):
    modlinks[t].add(m)
struct_index = {}
for slug, base in conn.execute("SELECT slug, base_trick FROM freestyle_tricks WHERE is_active=1"):
    b = re.sub(r"[^a-z0-9]+","-",(base or "").lower()).strip("-")
    struct_index[(frozenset(modlinks.get(slug,set())), b)] = slug

# Curator verification verdicts on the structural-alias candidates (2026-05-29 individual review),
# recorded alongside the automated triage. The automated columns show what the matcher found; this
# column records the human ruling after verification (which can override a matcher false-positive).
VERIFIED_VERDICTS = {
    "alpine-big-apple": "WIRED 2026-05-29: verified structural alias -> gyro-ducking-symposium-torque (ADD 7=7; exact modifier-set+base match; unique target). Alias live.",
    "assassin-ss": "VERIFY FAIL 2026-05-29 (REJECTED): fm=8 vs pixie-diving-mirage 4-ADD; the (ss) same-side qualifier was dropped by the matcher, so the structural match is false. NOT an alias -> route to above-7 FM-only adjudication.",
    "superdeeduperfly": "HELD 2026-05-29: target spinning-ducking-symposium-double-over-down is in the DOD-policy cluster; do not verify-to-wire until the DOD doctrine is ruled.",
}

def decompose(tech):
    s = " "+tech.lower()+" "
    for ph,rep in MULTIWORD:
        s = s.replace(" "+ph+" ", " "+rep+" ")
    toks = [t.strip(".()\"'") for t in re.split(r"[\s,]+", s) if t.strip(".()\"'")]
    ops, unknown, base = [], [], None
    for t in toks:
        if not t or t in POS: continue
        if t == "surging":
            for d in ("spinning","stepping"):
                if d not in ops: ops.append(d)
            continue
        if t in OP_FORMS:
            slug = OP_FORMS[t]
            if slug in REG:
                if slug not in ops: ops.append(slug)
            elif slug not in unknown: unknown.append(slug)
        elif t in BASES:
            base = t  # trailing known base wins
        elif t not in unknown:
            unknown.append(t)   # unrecognized token -> blocks a clean structural match
    return ops, unknown, base

def gates(ops, base, tech):
    g=[]
    if "blurry" in ops: g.append("blurry-transitivity")
    if "atomic" in ops and base in ROTATIONAL: g.append("atomic-rotational-Q3")
    if base in ("double-over-down","down-over-down","double-down") or "double over down" in tech.lower(): g.append("DOD-policy")
    return g

def i(v):
    v=(v or "").strip(); return int(v) if v.lstrip("-").isdigit() else None

rows=list(csv.DictReader(open(CORPUS)))
best={}
for r in rows:
    fm=i(r.get("fm_add_claim"))
    if fm is None or fm<7: continue
    slug=r.get("canonical_slug") or ""
    if not slug: continue
    rec=(slug,fm,i(r.get("official_add")),i(r.get("fborg_add_claim")),
         r.get("fm_technical_name","") or r.get("source_name",""))
    if slug not in best or fm>best[slug][1]: best[slug]=rec

out=[]; tiers=collections.Counter(); op_intake=collections.Counter()
for slug,fm,off,fb,tech in sorted(best.values(), key=lambda x:(-x[1],x[0])):
    ops,unknown,base = decompose(tech)
    struct = "-".join(ops+[base]) if base else ("-".join(ops) or "?")
    corroborated = bool((off and off>=7) or (fb and fb>=7))
    dgates = gates(ops, base, tech)
    matched=""
    if slug in canon or slug in aliases:
        tier,status,action = "B","already-canonical","already canonical/alias — no action"; matched=slug
    elif unknown:                                   # incomplete decomposition: do NOT claim a match
        tier,status,action = "C","parser_blocked", f"unrecognized token(s): {','.join(unknown)} -> operator-triage / incomplete decomposition"
        for u in unknown: op_intake[u]+=1
    else:
        m = struct_index.get((frozenset(ops), base)) if base else None
        if not m and base and struct in (canon|aliases): m=struct
        if m:
            tier,status,action = "B","alias-on-existing", f"structural duplication -> alias-wire to {m} (gauntlet pattern)"; matched=m
        elif dgates:
            tier,status,action = "C","frontier_review", f"doctrine gate(s): {','.join(dgates)} -> Red"
        elif base and base in (canon|BASES):
            tier,status,action = ("A","frontier_stable","corroborated + clean -> fast-track candidate") if corroborated \
                else ("B","frontier_review","clean decomp but FM-only -> needs source corroboration")
        else:
            tier,status,action = "D","observational","no clean decomposition / single-source folk"
    tiers[tier]+=1
    out.append({"slug":slug,"fm_add":fm,"official_add":off or "","fborg_add":fb or "",
      "fm_technical_name":tech,"decomposed_structure":struct,"matched_canonical":matched,
      "corroborated":"yes" if corroborated else "no","doctrine_gates":"|".join(dgates),
      "unrecognized_tokens":"|".join(unknown),"tier":tier,"frontier_status":status,"action":action,
      "verification":VERIFIED_VERDICTS.get(slug,"")})

with OUT.open("w",newline="",encoding="utf-8") as f:
    w=csv.DictWriter(f,fieldnames=list(out[0].keys()),lineterminator="\n"); w.writeheader(); w.writerows(out)

print(f"candidates triaged: {len(out)}  tiers: {dict(tiers)}")
print("\nTier B — already canonical/alias (no action):")
for r in out:
    if r["tier"]=="B" and r["frontier_status"]=="already-canonical": print(f"  {r['slug']}")
print("\nTier B — STRUCTURAL DUPLICATION (alias-wire opportunities, verify each):")
for r in out:
    if r["frontier_status"]=="alias-on-existing": print(f"  {r['slug']:26} -> {r['matched_canonical']}  ('{r['fm_technical_name']}')")
print("\nTier B — clean decomp but FM-only (needs corroboration):")
for r in out:
    if r["frontier_status"]=="frontier_review" and r["tier"]=="B": print(f"  {r['slug']:26} struct={r['decomposed_structure']}  ('{r['fm_technical_name']}')")
print("\nTier C — doctrine-gated:")
for r in out:
    if r["tier"]=="C" and r["doctrine_gates"]: print(f"  {r['slug']:26} gates={r['doctrine_gates']}  ('{r['fm_technical_name']}')")
print("\nTier C — unrecognized-token / operator-intake:")
for r in out:
    if r["tier"]=="C" and r["unrecognized_tokens"]: print(f"  {r['slug']:26} tokens={r['unrecognized_tokens']}  ('{r['fm_technical_name']}')")
print("\nTier D — observational:")
for r in out:
    if r["tier"]=="D": print(f"  {r['slug']:26} ('{r['fm_technical_name']}')")
print("\noperator-intake candidates surfaced:", dict(op_intake))
print(f"wrote {OUT.relative_to(ROOT)}")
