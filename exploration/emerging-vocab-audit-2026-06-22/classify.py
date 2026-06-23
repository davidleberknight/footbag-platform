#!/usr/bin/env python3
"""Read-only Emerging Vocabulary corpus audit (v2: token-decomposition).

Classifies every unique frontier slug into the six audit buckets by joining the
comprehensive symbolic corpus against the live dictionary, the alias tables, the
modifier registry, and the authoritative doctrine-blocker packet.

Bucket logic (priority order):
  C PROMOTED ALREADY  slug active in freestyle_tricks                (exact)
  B ALIAS             slug resolves via alias tables                 (exact)
  A REMOVE            noise: explanatory text / attribution / number /
                      dex term / glossary term / source name / artifact
  E DOCTRINE BLOCKED  contains a token from one of the 5 open packet
                      questions (DOD-DDD / weaving / pogo / atomic-rotational
                      X-Dex / same-side); cites the question
  D RESOLVABLE NOW    decomposes to known operators + a known base
                      (operator-strip lands on an active canonical / core atom)
  F UNKNOWN           tail is not a known base and not noise

Mechanical buckets (C, B) are exact joins. A/D/E use registry + packet + noise
heuristics and are proposals for curator confirmation. No DB writes.
"""
import csv, sqlite3, json, re, collections, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
CORPUS = ROOT/"exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv"
DB = ROOT/"database/footbag.db"
OUTDIR = pathlib.Path(__file__).resolve().parent

rows = list(csv.DictReader(open(CORPUS, encoding="utf-8")))
by_slug = collections.defaultdict(list)
for r in rows:
    by_slug[r["canonical_slug"]].append(r)

con = sqlite3.connect(DB)
active = {x[0] for x in con.execute("SELECT slug FROM freestyle_tricks WHERE is_active=1")}
base_add = {s: a for s, a in con.execute("SELECT slug, adds FROM freestyle_tricks WHERE is_active=1")}
op_notn = {s: (o or "") for s, o in con.execute("SELECT slug, operational_notation FROM freestyle_tricks")}
alias_slugs = {x[0]: x[1] for x in con.execute("SELECT alias_slug, trick_slug FROM freestyle_trick_aliases")}
alias_texts = {}
for txt, trick in con.execute("SELECT alias_text, trick_slug FROM freestyle_trick_aliases"):
    alias_texts[re.sub(r"[^a-z0-9]+", "-", (txt or "").lower()).strip("-")] = trick
for slug, aj in con.execute("SELECT slug, aliases_json FROM freestyle_tricks WHERE aliases_json IS NOT NULL AND aliases_json!=''"):
    try:
        for a in json.loads(aj):
            alias_texts[re.sub(r"[^a-z0-9]+", "-", str(a).lower()).strip("-")] = slug
    except Exception:
        pass

# modifier registry -> operator tokens + ADD bonus
OP_BONUS = {n: int(b) for n, b, in con.execute("SELECT modifier_name, add_bonus FROM freestyle_trick_modifiers")}
# structural prefix/qualifier tokens that are not registry modifiers but are known
QUALIFIERS = {"reverse", "rev", "double", "triple", "in", "out", "op", "ss", "same",
              "side", "near", "far", "front", "back", "uptime", "downtime"}
OPERATORS = set(OP_BONUS) | QUALIFIERS
CORE_ATOMS = {"toe-stall","clipper-stall","around-the-world","orbit","legover","leg-over",
              "pickup","mirage","illusion","butterfly","osis","whirl","swirl"}
KNOWN_BASES = active | CORE_ATOMS

# doctrine blocker tokens, mapped to the packet question
ROTATIONAL = {"mirage","whirl","swirl","torque","dyno","drifter","illusion"}
GLOSSARY = {"guiltless","tiltless","fearless","tripless","beastly","godly","bop","dropless",
            "shuffle","density","shred-circle","shred","run","add","contact","blocking"}
SOURCE_NAME_NOISE = {"footbag moves","footbag worldwide","footbagmoves","passback","footbag.org",
                     "stanford","shred global","anztrikz","tricks of the trade","footbagspot","worldfootbag"}
STOPWORDS = {"the","of","is","it","and","to","for","with","before","until","when","that","this",
             "in","on","at","be","a","an","greatest","journey","adventure"}
DEX_TERM_RE = re.compile(r"\bdex(es|terity)?\b", re.I)

def norm(s): return re.sub(r"[^a-z0-9]+", "-", (s or "").lower()).strip("-")

def is_noise(slug, names):
    lname = " ".join(names).lower()
    if any(n.lower() in SOURCE_NAME_NOISE for n in names): return "source/site/project name"
    if slug in GLOSSARY or norm(lname) in GLOSSARY: return "glossary / run-quality term"
    if re.search(r"\.txt$|__|/", slug): return "parser/source artifact (path/filename leak)"
    if slug.isdigit(): return "numeric token, not a trick"
    if "&" in slug or "`" in slug or "'" in slug: return "attribution/title text, not a trick"
    segs = slug.split("-")
    if sum(1 for s in segs if s in STOPWORDS) >= 2: return "explanatory text, not a trick"
    if slug == "anonymous": return "unattributed placeholder, not a trick"
    if slug in ("dex","dex-dexterity","in-out-dex","out-in-dex") or \
       (DEX_TERM_RE.search(slug.replace("-", " ")) and "dex" in segs[-1:]):
        return "dexterity terminology, not a trick"
    return None

# Positional / side qualifiers. Per the Relative-Side reconciliation (2026-06-22),
# these are NO LONGER blanket doctrine-blocked: SAME/OP already encode the
# distinction in the notation layer. A positional variant is mechanically
# classifiable when its operational notation carries SAME/OP markers, needs only
# notation authoring when it does not, and is doctrine-review ONLY for the few
# rows whose notation contradicts the name. (Atomic-rotational X-Dex stays blocked
# separately below — that is the X-Dex scoring question, not the side question.)
POSITIONAL_QUAL = {"ss", "op", "same", "side", "near", "far", "opposite", "crossbody"}

# The only positional rows whose operational notation contradicts the name (name
# asserts same-side; notation shows OP only). Genuine review items.
POSITIONAL_CONFLICTS = {
    "inspinning-same-side-illusion", "inspinning-same-side-mirage", "whirl-same-side",
}

def is_positional(slug):
    return any(seg in POSITIONAL_QUAL for seg in slug.split("-"))

def has_op_markers(slug):
    n = op_notn.get(slug, "")
    return ("SAME" in n) or bool(re.search(r"\bOP\b", n))

def targeting_verdict(slug):
    """Relative-Side Targeting Rule: the qualifier modifies the unique off-side
    element of the BASE notation (Rule A = the one off-side dex; Rule B = the
    catch when no dex is off-side). X-Dex stays receiver-gated. Returns
    (bucket, reason)."""
    segs = slug.split("-")
    far = any(s in ("far", "op", "opp", "opposite") for s in segs)
    target = "OP" if far else "SAME"
    base = "-".join(x for x in segs if x not in POSITIONAL_QUAL)
    if base not in active:
        return "G", "positional: base not active (author the base first)"
    bn = op_notn.get(base, "")
    if not bn.strip():
        return "G", "positional: base has no operational notation"
    def side(seg):
        m = re.match(r".*?\b(SAME/OP|OP/SAME|SAME|OP)\b", seg.strip())
        return m.group(1) if m else None
    parts = re.split(r">+", bn)
    dexes = [side(s) for s in parts if "[DEX]" in s and side(s)]
    off_dex = [d for d in dexes if d != target]
    if len(off_dex) == 1:
        if far and (set(base.split("-")) & ROTATIONAL):
            return "E", "positional far variant of a rotational receiver: targeting fixed (Rule A) but X-Dex scoring pending (held)"
        return "D", "targeting Rule A: qualifier modifies the unique off-side dex; mechanically derivable from the base"
    if len(off_dex) == 0:
        catch = [side(s) for s in parts if ("[XBD]" in s or "[DEL]" in s) and "[DEX]" not in s and side(s)]
        if any(c != target for c in catch):
            return "D", "targeting Rule B: qualifier modifies the catch; mechanically derivable from the base"
        return "B", "positional alias: every element already on the qualifier side"
    return "G", "positional multi-off-side: targeting rule does not resolve (>=2 off-side dexes)"

def doctrine_block(slug):
    # Pogo is intentionally NOT blocked: evidence (official ADDs + footbag.org + FM +
    # an extra scored [DEX] in notation) all give +1; only the registry says +0. Pogo
    # compounds are RESOLVABLE NOW; the registry conflict is a curator-review note,
    # not a public doctrine question.
    segs = slug.split("-"); segset = set(segs)
    if "weaving" in segset:
        return "A2 Weaving: operator weight (+N / +0 / naming) unresolved; no weaving notation authored"
    if "dod" in segset or "ddd" in segset or "down-double-down" in slug or "double-over-down" in slug:
        return "A1 DOD/DDD: same structure vs two distinct bases unresolved"
    xdex_set = segs and segs[0] in ("atomic", "quantum", "nuclear", "sailing")
    if xdex_set and (segset & ROTATIONAL):
        return "A5 atomic-rotational X-Dex: hidden-carry weight on rotational receiver unresolved (HELD)"
    return None

def decompose(slug):
    """Return (base, prefix_ops) if slug = known operators + a known base. Slugs
    carrying a positional qualifier are routed to E (under review) BEFORE this runs,
    so they are not collapsed here."""
    core = slug.split("-")
    for cut in range(len(core)):
        prefix, tail = core[:cut], "-".join(core[cut:])
        if tail in KNOWN_BASES and all(p in OPERATORS for p in prefix):
            return tail, prefix
    return None

def est_add(base, prefix):
    b = base_add.get(base)
    if b is None or not str(b).strip().isdigit(): return ""
    total = int(b)
    for p in prefix:
        # Pogo is treated as +1 here per the audit evidence (official ADDs + footbag.org
        # + FM + an extra scored [DEX]); the modifier registry still encodes 0 and is
        # awaiting curator review. Other operators use the registry bonus.
        total += 1 if p == "pogo" else OP_BONUS.get(p, 0)
    return str(total)

def classify(slug, recs):
    names = {(r["source_name"] or "").strip() for r in recs}
    add = next((r["official_add"] for r in recs if (r.get("official_add") or "").strip()), "")
    if slug in active: return "C", "active canonical", add
    if slug in alias_slugs: return "B", f"alias -> {alias_slugs[slug]}", add
    if slug in alias_texts: return "B", f"alias-text -> {alias_texts[slug]}", add
    n = is_noise(slug, names)
    if n: return "A", n, add
    blk = doctrine_block(slug)
    if blk: return "E", blk, add
    if is_positional(slug):
        if slug in POSITIONAL_CONFLICTS:
            return "E", "positional name/notation conflict: name asserts same-side, notation shows OP only; review", add
        if has_op_markers(slug):
            return "D", "positional variant: SAME/OP notation present, mechanically classifiable from existing notation", add
        b, reason = targeting_verdict(slug)
        return b, reason, add
    dec = decompose(slug)
    if dec:
        base, prefix = dec
        ea = est_add(base, prefix) or add
        ops = "+".join(prefix) if prefix else "(base)"
        return "D", f"{ops} + {base}; est ADD {ea or '?'}", ea
    return "F", "tail is not a known base; structure not inferable", add

result = {s: classify(s, r) for s, r in by_slug.items()}
newcat = collections.Counter(v[0] for v in result.values())

def current_cat(recs):
    pubs = [(r["publication_status"] or "").strip() for r in recs]
    order = ["canonical_active","canonical_curated","canonical_pending","first_class_ready",
             "tracked_unpublished","observational","passback_intake_matched_existing",
             "passback_intake_new_candidate","passback_intake","passback_intake_conflict",
             "passback_source_link_authored","fborg_staging_accept","fborg_staging_defer",
             "fborg_staging_reject","fborg_corpus_entry","fm_corpus_entry","fm_grammar_observation",
             "stanford_shorthand_authored","candidate","intake"]
    for o in order:
        if o in pubs: return o
    return pubs[0] if pubs else ""

curcat = collections.Counter(current_cat(r) for r in by_slug.values())
migration = collections.Counter((current_cat(by_slug[s]), result[s][0]) for s in by_slug)

with open(OUTDIR/"per_slug_classification.csv", "w", newline="", encoding="utf-8") as fh:
    w = csv.writer(fh); w.writerow(["slug","new_bucket","reason","est_add","current_category"])
    for s in sorted(by_slug):
        b, reason, add = result[s]; w.writerow([s, b, reason, add, current_cat(by_slug[s])])

NB = {"A":"REMOVE","B":"ALIAS","C":"PROMOTED ALREADY","D":"RESOLVABLE NOW",
      "E":"DOCTRINE BLOCKED","F":"UNKNOWN","G":"NEEDS-AUTHORING"}
print("UNIQUE FRONTIER SLUGS:", len(by_slug))
print("\n== 1. CURRENT counts by category (deduped per slug) ==")
for k, v in curcat.most_common(): print(f"  {v:5d}  {k}")
print("\n== 2. NEW counts by bucket ==")
for k in "ABCDEFG": print(f"  {k} {NB[k]:18s} {newcat.get(k,0):5d}")
non_promoted = len(by_slug) - newcat.get("C",0)
doctrine_frontier = newcat.get("E",0) + newcat.get("F",0)
print(f"\n== 7. ESTIMATED final frontier ==")
print(f"   doctrine-blocked/unknown (E+F) = {doctrine_frontier}  (from {non_promoted} non-promoted; {len(by_slug)} total)")
print(f"   needs-authoring (G, positional, NOT doctrine-blocked) = {newcat.get('G',0)}")
print(f"   resolved/removed (A+B+C+D) = {newcat.get('A',0)+newcat.get('B',0)+newcat.get('C',0)+newcat.get('D',0)}")
print("\n== 3. MIGRATION matrix (current -> new : count) ==")
for (cur, new), c in migration.most_common(30):
    print(f"  {c:5d}  {cur:36s} -> {NB[new]}")

def bucket(b): return [(s, result[s][1], result[s][2]) for s in sorted(by_slug) if result[s][0]==b]
A, D, E, F, G = bucket("A"), bucket("D"), bucket("E"), bucket("F"), bucket("G")
print(f"\n== 4. REMOVALS ({len(A)}) ==")
for s, r, a in A: print(f"  {s:42s} {r}")
print(f"\n== 5. RESOLUTIONS (showing 40 of {len(D)}) ==")
for s, r, a in D[:40]: print(f"  {s:38s} {r}")
print(f"\n== 6. DOCTRINE BLOCKERS ({len(E)}) by question ==")
byq = collections.Counter(r.split(":")[0] for s, r, a in E)
for q, c in sorted(byq.items()): print(f"  {c:4d}  {q}")
print(f"\n== NEEDS-AUTHORING ({len(G)}) — positional, missing operational notation, NOT doctrine-blocked ==")
for s, r, a in G[:30]: print(f"  {s}")
print(f"\n== F UNKNOWN ({len(F)}) sample ==")
for s, r, a in F[:30]: print(f"  {s}")

# verify named promoted / resolved entries are out of the unknown/blocked frontier
print("\n== VERIFY named promoted/resolved entries ==")
for name in ["toe-whirr","voodoo","flog","toe-double-drifter","leg-over-flapper-stall",
             "blistering-whirl","pogo-pickup","pogo-mirage","pogo-whirl","pogo-paradox-mirage"]:
    if name in result:
        b, reason, add = result[name]; print(f"  {name:26s} -> {NB[b]:16s} ({reason})")
    else:
        print(f"  {name:26s} -> not in corpus")

# moved-entries diff vs the prior snapshot
prev_path = OUTDIR/"per_slug_prev.csv"
if prev_path.exists():
    prev = {r["slug"]: r["new_bucket"] for r in csv.DictReader(open(prev_path))}
    moves = collections.Counter()
    detail = collections.defaultdict(list)
    for s in by_slug:
        old, new = prev.get(s), result[s][0]
        if old and old != new:
            moves[(old, new)] += 1; detail[(old, new)].append(s)
    print(f"\n== 4. ENTRIES MOVED BETWEEN BUCKETS (vs prior run) — {sum(moves.values())} total ==")
    for (o, n), c in moves.most_common():
        ex = ", ".join(detail[(o, n)][:6])
        print(f"  {c:4d}  {NB[o]:16s} -> {NB[n]:16s}  e.g. {ex}")
print(f"\nWrote {OUTDIR/'per_slug_classification.csv'}")
