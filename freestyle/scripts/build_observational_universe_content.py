#!/usr/bin/env python3
"""Generate src/content/freestyleObservationalUniverse.ts from the Phase E packet.

Read-only over the committed Phase E exploration CSVs. Emits a deterministic,
typed TS content module that the freestyle service reads to render the
/freestyle/observational governance surface. Mirrors the existing
build_tracked_names_content.py → freestyleTrackedNames.ts pattern (generated TS
content, schema-free, reversible — no DB).

The module is the DATA spine (one row per unresolved observational name +
overall stats), and it carries the classification: every row is stamped with
one of the nine Emerging Vocabulary ladder states (evState) plus a finer hold
kind and orthogonal flags, all computed HERE, once. The service reads those
fields and owns only sampling / presentation; it never re-derives the state at
request time, so the generated data and the rendered page cannot disagree.

Overlap-safe by construction: the source CSVs already exclude in_db /
governance_state∈{1,2} / alias-to-canon rows, so nothing here collides with a
published canonical trick.

Inputs:
  freestyle/inputs/observational/promotion_candidates_clean.csv
  freestyle/inputs/observational/promotion_candidates_curator_confirm.csv
  freestyle/inputs/observational/promotion_candidates_deferred.csv
  freestyle/inputs/observational/CLASSIFIED_UNIVERSE.csv   (stats only)

Output:
  src/content/freestyleObservationalUniverse.ts

Run:
  python3 freestyle/scripts/build_observational_universe_content.py
"""
from __future__ import annotations

import csv
import json
import re
import sqlite3
from collections import Counter
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
FREESTYLE = Path(__file__).resolve().parents[1]
# Promotion-packet + classified-universe CSVs live under freestyle/inputs/ so
# this generator reads nothing outside the self-contained freestyle tree.
OBS = FREESTYLE / "inputs/observational"
OUT = REPO / "src/content/freestyleObservationalUniverse.ts"
# Canonical CSVs (loader 17 + loader 19). Any slug present here is
# canonical-published; the observational layer must never also carry it (layer
# separation forbids one slug in both). Mirrors the dual-gate in
# build_tracked_names_content.py so a promoted slug leaves this surface on the
# next regen even when the upstream packet CSVs still list it.
TRICKS_CSV = FREESTYLE / "inputs/noise/tricks.csv"
RED_ADD_CSV = FREESTYLE / "inputs/curated/tricks/red_additions_2026_04_20.csv"
# Live platform DB: authoritative canonical/alias gate (see build_tracked_names_content.py).
DB = REPO / "database/footbag.db"

# Doctrine-blocked clusters whose STRUCTURE is known (blocked only on an ADD /
# policy ruling, not on the movement reading) — promotion-frontier eligible. The
# remaining clusters are undefined-operator / structural-reading questions →
# lexical archive. (Curator-set; reversible — edit this set to retune the frontier.)
COHERENT_DOCTRINE_CLUSTERS = {"dod-ddd"}
# Three-layer ontology: frontier buckets are promotable candidate structures; archive
# buckets are lexical history (never counted as candidate tricks).
FRONTIER_BUCKETS = {"promotion_ready", "doctrine_pending", "unresolved_candidate"}
ARCHIVE_BUCKETS = {"alias", "equivalence", "duplicate_variant", "low_confidence", "doctrine_unresolved"}
INTAKE_BUCKETS = [
    "promotion_ready", "doctrine_pending", "unresolved_candidate",
    "alias", "equivalence", "duplicate_variant", "low_confidence", "doctrine_unresolved",
]
# Public-facing (renders on /freestyle/observational): no individual names, no
# internal ruling identifiers (per the no-individual-names-on-freestyle-views rule).
BLOCKING_QUESTION = {
    "dod-ddd":  "Down-family compounds: which frame names the embedded base? (labeling only; the downs are ruled one family, a single structural decomposition with set/foot variants, and scoring is unaffected)",
    "weaving":  "Weaving is an undefined folk operator; movement structure unruled.",
    "shooting": "Shooting is an undefined folk operator; structural reading unruled.",
    "other":    "Operator weight or definition pending (fairy / pixie weight; folk operators).",
}


# Unresolved doctrine blocker for a row name, highest-priority first. The shipped
# operators (illusioning / furious / nuclear / quantum / symposium / paradox /
# barraging, plus miraging / spinning / ducking / stepping / tapping / whirling /
# swirling / gyro / diving) are resolved and never block on their own. Blurry and
# Pogo are likewise settled: blurry reads as stepping with a paradox, and pogo is
# a zero-ADD set whose composition is understood, so both route out of doctrine
# into the needs-authoring frontier rather than holding as doctrine questions.
# Side qualifiers (near / same-side / far / opposite) never block: the notation
# already encodes the side, so a positional name is needs-authoring, not doctrine.
# Returns a cluster key, or None when the row carries only resolved operators —
# those route out of doctrine into the needs-authoring frontier.
def doctrine_blocker(name: str) -> str | None:
    n = " " + name.lower() + " "
    if re.search(r"double (over )?down|double-down|\bdod\b|\bddd\b", n):
        return "dod-ddd"
    if "weaving" in n:
        return "weaving"
    if re.search(r"\bfairy\b|\bpixie\b", n):
        return "other"
    for folk in ("splicing", "floating", "warping", "flailing", "surfing",
                 "railing", "slapping", "frantic", "rooting", "sailing", "alpine", "zulu"):
        if folk in n:
            return "other"
    return None
# ── Emerging Vocabulary nine-state ladder ────────────────────────────────────
# Every emitted row lands in exactly ONE of these states. The order is the
# distance-to-canonical ladder (closest to publication first); the public page
# renders its sections, health tiles, and counts straight from this field, so
# the classification lives here, at generation time, and nowhere else.
EV_STATES = [
    "ready",               # fully resolved; a curator can review and publish as-is
    "authoring",           # structure understood; the notation write-up is pending
    "doctrine",            # rests on an open expert ruling, not an authoring step
    "governance",          # needs a curator editorial / verification call
    "identification",      # which movement the name refers to is unconfirmed
    "parser",              # documented execution; notation resolves to no single reading
    "undefined_operator",  # carries a folk operator with no settled definition
    "folk",                # community name with no recoverable structure yet
    "alias",               # resolves to an existing trick; lookup archive, not frontier
]

# Folk operators with no settled definition or weight. A name carrying one of
# these cannot be authored until the operator itself is defined; defining the
# operator unblocks every name that uses it. Curator-tunable.
EV_UNDEFINED_OPERATORS = {
    "blazing", "symple", "slapping", "fusing", "phasing", "slaying", "sonic",
    "twinspinning", "frootie", "fyro", "leaning", "twisted", "twisting",
    "wonton", "wrecking", "snapping", "zipper",
}
# Named structures whose identity (which movement the name refers to) is the
# open question, not their operators.
EV_IDENTIFICATION_NAMED = {"dragon", "refraction"}
# Open expert-ruling gates. Blurry-named compounds wait on the ruling that
# decides when a blurry name carries the extra paradox element; terraging waits
# on the ruling reconciling its chain value; the cross-body rake base has no
# settled structural definition; a repeated operator inside one compound has no
# scoring rule yet. Weaving and zulu are NOT here: their compounds author
# mechanically as the matching ducking compound, so they are authoring work.
EV_BLURRY_TOKENS = {"blurry", "blurrier", "blurriest"}
# Parser failure classes that are genuine notation gaps (ambiguous terminal,
# compression, directional syntax), distinct from an undefined operator.
EV_PARSER_CLASSES = {
    "ambiguous-terminal-mechanic", "compression-ambiguity",
    "unresolved-directional-syntax", "parser-ambiguity",
}
# Source-data spelling typos that resolve to a known operator; they are not new
# frontier operators, so normalize before the known-token check.
EV_TYPO_FIXES = {
    "butterfy": "butterfly", "baragging": "barraging",
    "royall": "royale", "eggbeating": "eggbeater",
}
# X-Dex receiver bases: a "far" qualifier on one of these fires a conditional
# +1 that must be confirmed in the stored decomposition.
EV_XDEX_RECEIVERS = {"mirage", "illusion", "whirl", "torque", "drifter"}
# Side qualifiers (never blocking on their own; the notation encodes the side).
EV_POSITIONAL = {"ss", "near", "far", "op", "os"}
# Intake buckets that make a row archive material rather than frontier work.
EV_ALIAS_BUCKETS = {"alias", "duplicate_variant"}


def ev_resolves_known(name: str) -> bool:
    """Every token of the name resolves to a settled operator / atom / directional."""
    toks = name_tokens(name)
    if not toks:
        return False
    return all(len(t) <= 1 or EV_TYPO_FIXES.get(t, t) in KNOWN_TOKENS for t in toks)


def ev_fully_derived(r: dict) -> bool:
    """Derivation complete: numeric provisional ADD and a decomposition present."""
    return bool(re.fullmatch(r"[0-9]+", r["provisionalAdd"] or "")
                and (r["decomposition"] or "").strip())


def ev_classify(r: dict) -> tuple[str, str]:
    """One (state, holdKind) per row, most-binding gate first."""
    name = r["name"]
    toks = name_tokens(name)
    lead = name.split("(")[0].lower()
    if r["intakeBucket"] in EV_ALIAS_BUCKETS:
        return "alias", "alias"
    # Open expert-ruling gates outrank everything but the alias archive.
    if any(t in EV_BLURRY_TOKENS for t in toks):
        return "doctrine", "blurry_expansion"
    if "terraging" in toks or "terrage" in toks:
        return "doctrine", "terraging_chain"
    if "rake" in toks and ("xbd" in toks or "crossbody" in toks
                           or ("x" in toks and "body" in toks)):
        return "doctrine", "crossbody_rake_base"
    ing_ops = [t for t in toks if t.endswith("ing") and t in KNOWN_TOKENS]
    if any(ing_ops.count(t) >= 2 for t in set(ing_ops)):
        return "doctrine", "repeated_operator"
    # Multi-alias parentheticals are an identity question: which movement (and
    # which of the competing folk names) the row actually is.
    if name.count("(") >= 2:
        return "identification", "identity"
    if "nuclear" in lead and "osis" in lead:
        return "identification", "identity"
    if r["section"] == "doctrine":
        if r["cluster"] == "weaving":
            # Weaving itself is settled (compounds author as the matching ducking
            # compound); the row is undefined-operator work only when another
            # unsettled operator rides the same name, else it is authoring work.
            und = [t for t in toks if t in EV_UNDEFINED_OPERATORS]
            if und:
                return "undefined_operator", und[0]
            return "authoring", "authoring"
        if r["cluster"] == "dod-ddd":
            # Down-family names need a per-trick curator verification of which
            # embedded base the name describes, not an expert ruling.
            return "governance", "down_family_verification"
        return "identification", "identity"
    if r["section"] in ("ready", "frontier"):
        return ("ready", "ready") if ev_fully_derived(r) else ("authoring", "authoring")
    if r["failureClass"] == "unknown-modifier-token":
        # Many of these flags are stale: when every token now resolves to a
        # settled operator the row is not blocked, only unauthored.
        if ev_resolves_known(name):
            return ("ready", "ready") if ev_fully_derived(r) else ("authoring", "authoring")
        und = [t for t in toks if t in EV_UNDEFINED_OPERATORS]
        if und:
            return "undefined_operator", und[0]
        if any(t in EV_IDENTIFICATION_NAMED for t in toks):
            return "identification", "identity"
        return "folk", "folk"
    if r["failureClass"] in EV_PARSER_CLASSES:
        return "parser", "parser"
    return "folk", "folk"


def ev_flags(r: dict, state: str) -> list[str]:
    """Orthogonal, stackable row flags (a row may carry several or none)."""
    name = r["name"]
    toks = name_tokens(name)
    low = name.lower()
    flags: list[str] = []
    if any(t in EV_POSITIONAL for t in toks) or "opposite" in low or "same side" in low:
        flags.append("positional_variant")
    if r["intakeBucket"] in ("duplicate_variant", "alias", "equivalence", "low_confidence"):
        flags.append("duplicate_or_alias_candidate")
    verification = False
    if state == "governance":
        verification = True            # per-trick down-family check owed
    if state == "identification" and name.count("(") >= 2:
        verification = True            # competing identities to reconcile
        if "duplicate_or_alias_candidate" not in flags:
            flags.append("duplicate_or_alias_candidate")
    if state == "ready" and "far" in toks and "paradox" not in toks and "pdx" not in toks \
            and any(t in EV_XDEX_RECEIVERS for t in toks):
        verification = True            # far X-Dex +1 to confirm in the decomposition
    if verification:
        flags.append("verification_needed")
    return flags


# corpus → short source badge (reuses the template's PB/FM/SG/FB chip vocab)
SOURCE_BADGE = {
    "stanford": "SG", "passback": "PB", "footbagmoves": "FM",
    "fborg": "FB", "ifpa-canonical": "IFPA", "multi": "MULTI", "curator": "CUR",
}

# ── Long-tail disposition: fold non-frontier noise OUT of the public surface ──
# The folk / parser long tail mixes genuine community names with aliases,
# misspellings, malformed scrape strings, and single-source junk. This set +
# the helpers below route each long-tail row to: keep public (plausibly real),
# alias (resolves to canonical), or junk (internal-only, dropped from the TS and
# written to a reports CSV). Curator-tunable; reversible (re-run the generator).
# Mirrors the service's KNOWN_FRONTIER_TOKENS so "carries a real operator/atom" is
# judged the same way on both surfaces.
KNOWN_TOKENS = {
    "toe", "stall", "clipper", "clip", "around", "world", "atw", "orbit", "legover", "leg", "over",
    "pickup", "mirage", "illusion", "butterfly", "osis", "whirl", "swirl", "sole",
    "blender", "torque", "drifter", "dyno", "barfly", "eclipse", "flail", "guay", "eggbeater", "dada",
    "curve", "da", "paradon", "flurry", "blur", "fog", "smoke", "smog", "haze", "fury", "nemesis",
    "royale", "mobius", "bubba", "witchdoctor", "spyro", "hatchet", "smear", "magellan", "infinity",
    "flapper", "bar", "rake", "scoop", "neutron",
    "pogo", "terraging", "terrage", "blurry", "blurrier", "blurriest", "furious", "barraging",
    "sailing", "shooting", "frantic", "nuclear", "atomic", "quantum", "illusioning", "miraging",
    "whirling", "swirling", "gyro", "flailing", "surfing", "slicing", "splicing", "warping", "railing",
    "rooted", "floating", "tapping", "backside", "inspinning", "spinning", "stepping", "ducking",
    "diving", "symposium", "paradox", "fairy", "pixie", "blistering", "zulu", "weaving",
    "far", "near", "op", "os", "reverse", "rev", "same", "ss", "double", "triple", "down", "up",
    "set", "kick", "side", "front", "back", "inside", "outside", "cross", "body", "in", "out",
    "dex", "xbd", "bs", "dod", "ddd", "plo", "dlo", "dso", "pdx", "bod", "del", "uns", "xdex", "symp",
    "inward", "outward", "wo", "crossbody", "hopover", "ps", "twirl", "arctic", "alpine", "pinching", "pincher",
    "muted", "flying",
}
# Folk operators that are undefined but recur often enough to be worth investigating;
# this constant only sets the "repeated enough" threshold (see disposition()).
REPEATED_OPERATOR_MIN = 3
# A name carrying anything outside this set is a malformed scrape/OCR string.
_ALLOWED_NAME_CHARS = re.compile(r"^[A-Za-z0-9 ()/'.&\-]+$")


def name_tokens(name: str) -> list[str]:
    return re.findall(r"[a-z]+", name.split("(")[0].lower())


def is_malformed(name: str) -> bool:
    """A scrape/OCR/parser artifact, not a trick name."""
    n = (name or "").strip()
    if not n:
        return True
    if "," in n:                       # list / two-names-mashed artifact
        return True
    if re.match(r"^\d", n):            # starts with a number ("84")
        return True
    if not _ALLOWED_NAME_CHARS.match(n):   # stray OCR characters
        return True
    toks = name_tokens(n)
    if "is" in toks and len(toks) >= 4:    # prose ("Alex Zerbe is the greatest")
        return True
    return False


def _norm_slug(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", (s or "").lower())


def _lev1(a: str, b: str) -> bool:
    """True if edit distance(a, b) <= 1 (cheap, length-gated by the caller)."""
    if a == b:
        return True
    la, lb = len(a), len(b)
    if abs(la - lb) > 1:
        return False
    if la == lb:                       # one substitution
        return sum(1 for x, y in zip(a, b) if x != y) <= 1
    if la > lb:                        # one deletion from a
        a, b = b, a
    i = j = 0
    skipped = False
    while i < len(a) and j < len(b):
        if a[i] == b[j]:
            i += 1
            j += 1
        elif skipped:
            return False
        else:
            skipped = True
            j += 1
    return True


def read(p: Path) -> list[dict]:
    with p.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def badge(corpus: str) -> str:
    return SOURCE_BADGE.get((corpus or "").strip(), (corpus or "?").upper()[:5])


def main() -> None:
    rows: list[dict] = []

    # n_sources corroboration signal (single source ⇒ low_confidence_noise) sourced
    # from the classified universe; keyed by slug (max across rows for that slug).
    classified = read(OBS / "CLASSIFIED_UNIVERSE.csv")
    nsources: dict[str, int] = {}
    for c in classified:
        s = (c.get("slug", "") or "").strip()
        try:
            n = int((c.get("n_sources", "") or "0") or 0)
        except ValueError:
            n = 0
        if s:
            nsources[s] = max(nsources.get(s, 0), n)

    def corroborated(slug: str) -> bool:
        return nsources.get((slug or "").strip(), 0) >= 2

    def row(name, slug, source, ecosystem, parent, section, cluster,
            pconf, dconf, add, decomp, job, fc, intake):
        return {
            "name": name, "slug": slug, "source": badge(source),
            "ecosystem": ecosystem or "", "parentFamily": parent or "",
            "section": section, "cluster": cluster or "",
            "parserConfidence": pconf or "", "doctrineConfidence": dconf or "",
            "provisionalAdd": add or "", "decomposition": decomp or "",
            "semanticJob": job or "", "failureClass": fc or "",
            "intakeBucket": intake, "lexicalVariants": [], "layer": "",
        }

    # clean + curator-confirm rows are mechanically-coherent modifier+base
    # compositions with stable doctrine: promotion-frontier candidates that are
    # promotable now (modeled later as a canonical row or a modifier_link).
    for r in read(OBS / "promotion_candidates_clean.csv"):
        rows.append(row(r["name"], r["proposed_slug"], r["source_corpus"], r["ecosystem"],
                        r["parent_family"], "ready", "", r["parser_confidence"],
                        r["doctrine_confidence"], r["proposed_add"], r["add_accounting"],
                        r["proposed_job_semantic"], "", "promotion_ready"))

    for r in read(OBS / "promotion_candidates_curator_confirm.csv"):
        rows.append(row(r["name"], r["proposed_slug"], r["source_corpus"], r["ecosystem"],
                        r["parent_family"], "frontier", "", r["parser_confidence"],
                        r["doctrine_confidence"], r["proposed_add"], r["add_accounting"],
                        r["proposed_job_semantic"], "", "promotion_ready"))

    for r in read(OBS / "promotion_candidates_deferred.csv"):
        db = r["deferral_bucket"]
        fc = r["failure_class"]
        eco = r["ecosystem"]
        dconf = r["doctrine_confidence"]
        if db == "doctrine-sensitive":
            blocker = doctrine_blocker(r["name"])
            if blocker is None:
                # Resolved-only: every operator is shipped doctrine, so this is not a
                # doctrine question — it is structurally understood and awaiting
                # notation authoring. Route to the needs-authoring frontier and clear
                # the stale blocked confidence carried from ingestion.
                section, cluster = "frontier", ""
                intake = "unresolved_candidate"
                dconf = "stable"
            else:
                section = "doctrine"
                cluster = blocker
                # Structure-known clusters (blurry / DOD-DDD) are promotion-frontier;
                # undefined-operator clusters are lexical archive.
                intake = "doctrine_pending" if blocker in COHERENT_DOCTRINE_CLUSTERS else "doctrine_unresolved"
        elif db == "alias-collapse":
            # Collapses to an existing canonical: lexical archive, never a candidate.
            section, cluster = "folk", ""
            intake = "alias"
        elif fc == "folk-name-opacity":
            section, cluster = "folk", ""
            intake = "unresolved_candidate" if corroborated(r["slug"]) else "low_confidence"
        else:
            section, cluster = "parser", ""
            intake = "unresolved_candidate" if corroborated(r["slug"]) else "low_confidence"
        rows.append(row(r["name"], r["slug"], r["source_corpus"], eco, "",
                        section, cluster, "", dconf, "", "", "", fc, intake))

    # ── canonical dual-gate ── drop any row whose slug is now canonical-
    # published (loader 17 tricks.csv `trick_canon` or loader 19 red_additions
    # `canonical_name`). A promoted slug leaves the observational surface here
    # even when the upstream packet CSVs still carry it, so the layer never
    # shows a slug that is also a published canonical trick.
    canonical_slugs: set[str] = set()
    if TRICKS_CSV.exists():
        for c in read(TRICKS_CSV):
            s = (c.get("trick_canon", "") or "").strip()
            if s:
                canonical_slugs.add(s)
    if RED_ADD_CSV.exists():
        for c in read(RED_ADD_CSV):
            s = (c.get("canonical_name", "") or "").strip()
            if s:
                canonical_slugs.add(s)
    # ── live-DB gate (authoritative) ── exclude EVERY database-tracked slug
    # (active or not) plus aliases. An active row renders in the canonical
    # browse; an inactive row is either a pending external entry (rendered from
    # the database in the Emerging Vocabulary external section) or a deliberate
    # adjudicated hold. Either way the database is that name's home, so the
    # generated universe must never also carry it; otherwise a pending database
    # row would appear twice on the Emerging Vocabulary page (once as a
    # universe row, once in the external section).
    if DB.exists():
        con = sqlite3.connect(f"file:{DB}?mode=ro", uri=True)
        try:
            for (s,) in con.execute("SELECT slug FROM freestyle_tricks"):
                if s:
                    canonical_slugs.add(s.strip())
            for (s,) in con.execute("SELECT alias_slug FROM freestyle_trick_aliases"):
                if s:
                    canonical_slugs.add(s.strip())
        finally:
            con.close()
    # Compare on the alphanumeric-normalized slug: observational rows use hyphen
    # slugs while the canonical DB / CSV slugs use underscores, so a raw-string
    # membership test never matched and the gate let published slugs through.
    _canonical_norm = {_norm_slug(s) for s in canonical_slugs}
    rows = [r for r in rows if _norm_slug(r["slug"]) not in _canonical_norm]

    # ── long-tail disposition ── fold aliases / misspellings / malformed scrape
    # strings / single-source junk OUT of the public folk + parser long tail so the
    # public counts are honest and small. Genuine folk names (carry a real atom /
    # operator), recurring undefined operators (worth investigating), and
    # multi-source names stay public; high-confidence misspellings become aliases
    # (lookup-only); everything else is junk, dropped from the TS and written to an
    # internal reports CSV. Frontier / doctrine / already-archive rows are untouched.
    canon_norm = {_norm_slug(s) for s in canonical_slugs}
    canon_by_len: dict[int, list[str]] = {}
    for s in canonical_slugs:
        canon_by_len.setdefault(len(s), []).append(s)

    def is_misspelling(slug: str) -> bool:
        ns = _norm_slug(slug)
        if ns and ns in canon_norm:        # hyphen/space-only normalized duplicate
            return True
        for L in (len(slug) - 1, len(slug), len(slug) + 1):
            for cs in canon_by_len.get(L, ()):
                if _lev1(slug, cs):
                    return True
        return False

    LONGTAIL = {"folk", "parser"}
    unknown_freq: Counter = Counter(
        t for r in rows if r["section"] in LONGTAIL
        for t in name_tokens(r["name"]) if t not in KNOWN_TOKENS and len(t) > 1
    )
    kept: list[dict] = []
    junk: list[dict] = []
    for r in rows:
        if r["section"] not in LONGTAIL or r["intakeBucket"] in ("alias", "duplicate_variant"):
            kept.append(r)                 # frontier / doctrine / already-archive: untouched
            continue
        name, slug = r["name"], r["slug"]
        if is_malformed(name):
            r["_junkReason"] = "malformed"
            junk.append(r)
            continue
        if is_misspelling(slug):
            r["intakeBucket"] = "alias"     # resolves to a canonical trick (high-confidence)
            r["section"] = "folk"
            kept.append(r)
            continue
        toks = name_tokens(name)
        has_known = any(t in KNOWN_TOKENS for t in toks)
        repeated_operator = any(
            unknown_freq.get(t, 0) >= REPEATED_OPERATOR_MIN
            for t in toks if t not in KNOWN_TOKENS and len(t) > 1
        )
        if corroborated(slug) or has_known or repeated_operator:
            kept.append(r)                 # plausibly real / multi-source / operator worth investigating
            continue
        r["_junkReason"] = "low-confidence-no-signal"
        junk.append(r)
    rows = kept

    # Folded junk → internal reports CSV (lookup-only; never on the public surface).
    REPORTS = FREESTYLE / "reports"
    REPORTS.mkdir(parents=True, exist_ok=True)
    junk_csv = REPORTS / "observational_junk_folded.csv"
    with junk_csv.open("w", encoding="utf-8", newline="") as jf:
        w = csv.writer(jf)
        w.writerow(["name", "slug", "source", "section", "failure_class", "fold_reason", "n_sources"])
        for r in sorted(junk, key=lambda r: (r.get("_junkReason", ""), r["name"].lower())):
            w.writerow([r["name"], r["slug"], r["source"], r["section"],
                        r["failureClass"], r.get("_junkReason", ""), nsources.get((r["slug"] or "").strip(), 0)])

    # ── lexical-duplicate collapse (Phase 1) ──
    # Same canonical slug across rows is wording/source drift, not distinct
    # structures. Keep the first occurrence as the survivor (fold variant names
    # into its lexicalVariants); retag later occurrences `duplicate_source_variant`
    # so they never count as structures. Rows are retained for provenance; the
    # distinct-slug + bucket counts do the deduping.
    _first: dict[str, dict] = {}
    for r in rows:
        s = r["slug"]
        if s in _first:
            if r["name"] != _first[s]["name"] and r["name"] not in _first[s]["lexicalVariants"]:
                _first[s]["lexicalVariants"].append(r["name"])
            r["intakeBucket"] = "duplicate_variant"
        else:
            _first[s] = r

    # ── three-layer assignment ── frontier (promotable candidate structures) vs
    # lexical archive (aliases / duplicates / single-source noise / unresolved
    # doctrine). Canonical ontology is a separate layer (published, not in intake).
    for r in rows:
        r["layer"] = "frontier" if r["intakeBucket"] in FRONTIER_BUCKETS else "archive"

    # ── nine-state ladder classification ── stamped after every bucket
    # reassignment above so the state reflects the row's final intake bucket.
    for r in rows:
        state, hold = ev_classify(r)
        r["evState"] = state
        r["holdKind"] = hold
        r["flags"] = ev_flags(r, state)

    # ── stats (headline scale of the governed universe) ──
    canonical = sum(1 for c in classified if c["governance_state"].startswith("1"))
    total = len(rows)

    # ── intake-bucket classification + three-layer ontology ──
    # Each row carries an intakeBucket and a layer (frontier | archive). Distinct-
    # SLUG counts per bucket are the honest figures (names dedupe to structures).
    # The public story is three layers: canonical ontology (~500, published) /
    # promotion frontier (mechanically coherent candidate structures) / lexical
    # archive (aliases, duplicates, single-source noise, unresolved doctrine).
    _bnames = {b: 0 for b in INTAKE_BUCKETS}
    _bslugs: dict[str, set] = {b: set() for b in INTAKE_BUCKETS}
    for r in rows:
        b = r["intakeBucket"]
        _bnames[b] = _bnames.get(b, 0) + 1
        _bslugs.setdefault(b, set()).add(r["slug"])
    intake_buckets = {
        b: {"names": _bnames[b], "distinctStructures": len(_bslugs[b])} for b in INTAKE_BUCKETS
    }
    # Layer counts are SURVIVOR-based (one layer per distinct slug): a slug's layer
    # is its canonical-occurrence bucket, so duplicate rows never double-count it.
    # frontier + archive therefore partition the distinct-slug universe exactly.
    frontier_slugs = {s for s, fr in _first.items() if fr["intakeBucket"] in FRONTIER_BUCKETS}
    archive_slugs = {s for s, fr in _first.items() if fr["intakeBucket"] in ARCHIVE_BUCKETS}
    promotion_frontier = len(frontier_slugs)
    lexical_archive = len(archive_slugs)

    # ── Typed-counter resolution (single source: CLASSIFIED_UNIVERSE.csv) ──
    # `total` is the INTAKE-QUEUE size (promotion-packet rows) — a work subset, NOT
    # the universe and NOT unique tricks. The UNIVERSE census below is computed
    # straight from the classified universe so the two populations are never
    # conflated in a public headline. Distinct-structure counts collapse lexical
    # wording/source variants to one slug: these are the ontology-honest figures,
    # while the *name* counts are publication/lexical. (Cross-file reconciliation:
    # 2460 universe = 510 published + 5 alias/equiv + 1945 observational; published
    # 510 names collapse to ~507 distinct structures and ~499 live canonical tricks.)
    def _gov1(c: dict) -> str:
        return (c.get("governance_state", "") or "")[:1]
    published_distinct = len({(c.get("slug", "") or "") for c in classified if _gov1(c) == "1"})
    alias_equivalent_names = sum(1 for c in classified if _gov1(c) == "2")
    _obs_states = {"3", "4", "5", "7"}
    _obs_universe = [c for c in classified if _gov1(c) in _obs_states]
    observational_universe_names = len(_obs_universe)
    observational_universe_distinct = len({(c.get("slug", "") or "") for c in _obs_universe})
    by_section = Counter(r["section"] for r in rows)
    by_source = Counter(r["source"] for r in rows)
    derivable = by_section["ready"] + by_section["frontier"]

    def pct(x: int) -> int:
        return round(100 * x / total) if total else 0

    # ── nine-state ladder counts + the generated progress metric ──
    # The page's headline progress figure is (ready + authoring) over the
    # non-alias universe: the share of genuine frontier names that are a
    # candidate or one authoring step away. Computed here so the rendered
    # number can never drift from the row data.
    ev_states = {s: 0 for s in EV_STATES}
    for r in rows:
        ev_states[r["evState"]] += 1
    ev_denominator = len(rows) - ev_states["alias"]
    ev_numerator = ev_states["ready"] + ev_states["authoring"]
    ev_progress = {
        "numerator": ev_numerator,
        "denominator": ev_denominator,
        "pct": round(100 * ev_numerator / ev_denominator) if ev_denominator else 0,
    }

    classified_total = len(classified)
    stats = {
        "total": total,
        "canonicalPublished": canonical,
        "universeTotal": classified_total,
        # Typed counters (publication = names; distinct = unique structures). The
        # published name count is NOT a unique-trick count.
        "publishedDistinctStructures": published_distinct,
        "aliasEquivalentNames": alias_equivalent_names,
        "observationalUniverseNames": observational_universe_names,
        "observationalUniverseDistinctStructures": observational_universe_distinct,
        # Three-layer ontology + intake-bucket classification.
        # canonicalOntology: published distinct structures (Layer 1).
        # promotionFrontier: distinct mechanically-coherent candidate structures
        #   (Layer 2 = promotion_ready + doctrine_pending + unresolved_candidate).
        # lexicalArchive: distinct archived names (Layer 3 = aliases / duplicates /
        #   single-source noise / unresolved doctrine).
        "canonicalOntology": published_distinct,
        "promotionFrontier": promotion_frontier,
        "lexicalArchive": lexical_archive,
        "intakeBuckets": intake_buckets,
        "evStates": ev_states,
        "evProgress": ev_progress,
        "ready": by_section["ready"],
        "frontier": by_section["frontier"],
        "doctrineBlocked": by_section["doctrine"],
        "folkUnresolved": by_section["folk"],
        "parserUnresolved": by_section["parser"],
        # promotion-ready = clean + curator-confirm (actionable now). This is NOT
        # the same as A0 mechanical-derivability (~36%), which also counts
        # doctrine-blocked-but-computable rows; those live under doctrineBlocked.
        "promotionReadyPct": pct(derivable),
        "doctrineBlockedPct": pct(by_section["doctrine"]),
        "folkUnresolvedPct": pct(by_section["folk"]),
        "parserUnresolvedPct": pct(by_section["parser"]),
        "canonicalCoveragePct": round(100 * canonical / classified_total) if classified_total else 0,
        "sources": dict(sorted(by_source.items(), key=lambda kv: -kv[1])),
        # Long-tail rows folded OUT of the public surface to the internal junk CSV
        # (aliases stay in the TS archive; this counts only the dropped junk).
        "foldedJunk": len(junk),
        "generatedOn": date.today().isoformat(),
    }

    # ── emit TS ──
    header = (
        "// GENERATED by freestyle/scripts/build_observational_universe_content.py\n"
        "// DO NOT EDIT BY HAND. Re-run the generator to refresh.\n"
        "// Source: Phase E reconciliation (overlap-safe: in_db=false, governance_state∉{1,2}).\n"
        "// Observational layer ONLY — no row here is canonical; provisional ADD/decomposition\n"
        "// are observationally extrapolated, never authoritative.\n\n"
        "export interface ObservationalUniverseRow {\n"
        "  /** Display name as documented by the source corpus. */\n"
        "  name: string;\n"
        "  /** Proposed canonical slug (normalized); NOT a live route. */\n"
        "  slug: string;\n"
        "  /** Short source badge: PB / FM / SG / FB / IFPA / MULTI. */\n"
        "  source: string;\n"
        "  ecosystem: string;\n"
        "  parentFamily: string;\n"
        "  /** ready | frontier | doctrine | folk | parser */\n"
        "  section: string;\n"
        "  /** doctrine cluster key (doctrine section only). */\n"
        "  cluster: string;\n"
        "  parserConfidence: string;\n"
        "  doctrineConfidence: string;\n"
        "  /** Provisional, observationally-extrapolated ADD; '' when not derived. */\n"
        "  provisionalAdd: string;\n"
        "  /** Human-readable ADD accounting; '' when not derived. */\n"
        "  decomposition: string;\n"
        "  /** Semantic JOB (name uppercased); operational notation is NOT generated. */\n"
        "  semanticJob: string;\n"
        "  /** Parser failure class for unresolved rows; '' when derived. */\n"
        "  failureClass: string;\n"
        "  /** Intake bucket. Frontier: promotion_ready | doctrine_pending |\n"
        "   *  unresolved_candidate. Archive: alias | equivalence |\n"
        "   *  duplicate_variant | low_confidence | doctrine_unresolved. */\n"
        "  intakeBucket: string;\n"
        "  /** Three-layer ontology: 'frontier' (promotable candidate) | 'archive' (lexical history). */\n"
        "  layer: string;\n"
        "  /** Folded wording/source variants of this slug (on the surviving row). */\n"
        "  lexicalVariants: string[];\n"
        "  /** Nine-state Emerging Vocabulary ladder (distance to canonical, closest\n"
        "   *  first): ready | authoring | doctrine | governance | identification |\n"
        "   *  parser | undefined_operator | folk | alias. Every row is in exactly\n"
        "   *  one state; the page sections, tiles, and counts read this field. */\n"
        "  evState: string;\n"
        "  /** Finer hold label inside the state (e.g. blurry_expansion,\n"
        "   *  terraging_chain, down_family_verification, identity, or the\n"
        "   *  undefined operator's own token). */\n"
        "  holdKind: string;\n"
        "  /** Orthogonal, stackable row flags: positional_variant |\n"
        "   *  duplicate_or_alias_candidate | verification_needed. */\n"
        "  flags: string[];\n"
        "}\n\n"
        "export interface ObservationalUniverseStats {\n"
        "  /** Intake-queue size: promotion-packet rows (a work subset, NOT the universe, NOT unique tricks). */\n"
        "  total: number;\n"
        "  /** Published canonical NAMES (publication count, not unique tricks). */\n"
        "  canonicalPublished: number;\n"
        "  universeTotal: number;\n"
        "  /** Distinct published structures (slugs); the 510 published names collapse to these. */\n"
        "  publishedDistinctStructures: number;\n"
        "  aliasEquivalentNames: number;\n"
        "  /** Full observational universe (governance states 3/4/5/7), single-sourced from CLASSIFIED_UNIVERSE. */\n"
        "  observationalUniverseNames: number;\n"
        "  observationalUniverseDistinctStructures: number;\n"
        "  /** Three-layer ontology (distinct structures). canonicalOntology = published;\n"
        "   *  promotionFrontier = mechanically-coherent candidates; lexicalArchive = history. */\n"
        "  canonicalOntology: number;\n"
        "  promotionFrontier: number;\n"
        "  lexicalArchive: number;\n"
        "  /** Per-bucket name + distinct-structure counts (8 intake buckets). */\n"
        "  intakeBuckets: Record<string, { names: number; distinctStructures: number }>;\n"
        "  /** Row count per nine-state ladder state; sums to `total`. */\n"
        "  evStates: Record<string, number>;\n"
        "  /** Headline progress: (ready + authoring) over the non-alias universe.\n"
        "   *  pct = round(100 * numerator / denominator). */\n"
        "  evProgress: { numerator: number; denominator: number; pct: number };\n"
        "  ready: number;\n"
        "  frontier: number;\n"
        "  doctrineBlocked: number;\n"
        "  folkUnresolved: number;\n"
        "  parserUnresolved: number;\n"
        "  promotionReadyPct: number;\n"
        "  doctrineBlockedPct: number;\n"
        "  folkUnresolvedPct: number;\n"
        "  parserUnresolvedPct: number;\n"
        "  canonicalCoveragePct: number;\n"
        "  sources: Record<string, number>;\n"
        "  /** Long-tail rows folded out to the internal junk CSV (not in this universe). */\n"
        "  foldedJunk: number;\n"
        "  generatedOn: string;\n"
        "}\n\n"
    )

    body = ["export const OBSERVATIONAL_UNIVERSE: readonly ObservationalUniverseRow[] = ["]
    for r in rows:
        body.append("  " + json.dumps(r, ensure_ascii=False) + ",")
    body.append("];\n")
    body.append("export const OBSERVATIONAL_UNIVERSE_STATS: ObservationalUniverseStats =")
    body.append("  " + json.dumps(stats, ensure_ascii=False, indent=2).replace("\n", "\n  ") + ";\n")
    body.append("export const DOCTRINE_BLOCKING_QUESTIONS: Record<string, string> =")
    body.append("  " + json.dumps(BLOCKING_QUESTION, ensure_ascii=False, indent=2).replace("\n", "\n  ") + ";\n")

    OUT.write_text(header + "\n".join(body) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)} — {total} rows")
    print(f"  folded {len(junk)} junk rows out to {junk_csv.relative_to(REPO)} "
          f"(public universe is now {total}, was {total + len(junk)} before folding)")
    print(f"  sections: {dict(by_section)}")
    print(f"  stats: ready={stats['ready']} frontier={stats['frontier']} "
          f"doctrine={stats['doctrineBlocked']} folk={stats['folkUnresolved']} "
          f"parser={stats['parserUnresolved']}")
    print(f"  promotion-ready={stats['promotionReadyPct']}%  "
          f"doctrine-blocked={stats['doctrineBlockedPct']}%  "
          f"canonical-coverage={stats['canonicalCoveragePct']}%")
    print("  ladder: " + "  ".join(f"{s}={ev_states[s]}" for s in EV_STATES))
    print(f"  progress: {ev_progress['numerator']}/{ev_progress['denominator']} "
          f"= {ev_progress['pct']}% (ready or one authoring step away, non-alias)")


if __name__ == "__main__":
    main()
