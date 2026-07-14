#!/usr/bin/env python3
"""Generate src/content/freestyleObservationalUniverse.ts from the observational inputs.

Read-only over the committed observational-inputs CSVs. Emits a deterministic,
typed TS content module that the freestyle service reads to render the
/freestyle/observational governance surface. Mirrors the existing
build_tracked_names_content.py → freestyleTrackedNames.ts pattern (generated TS
content, schema-free, reversible — no DB).

The module is the DATA spine (one row per documented observational name +
identity grouping + question/decision registries + overall stats), and it
carries the classification: every row is stamped with the six orthogonal
lifecycle dimensions (object type, resolved identity target, evidence state,
blocker, decision owner, derived publication state and public section), all
computed HERE, once. The service reads those fields and owns only sampling /
presentation; it never re-derives state at request time, so the generated
data and the rendered page cannot disagree.

Inputs:
  freestyle/inputs/observational/promotion_candidates_clean.csv
  freestyle/inputs/observational/promotion_candidates_curator_confirm.csv
  freestyle/inputs/observational/promotion_candidates_deferred.csv
  freestyle/inputs/observational/CLASSIFIED_UNIVERSE.csv   (stats only)
  exploration/ev-formula-identity-audit-2026-07-10/EV_FORMULA_IDENTITY_ROWS.csv
      (the ruling ledger — the adjudication AUTHORITY; see below)
  freestyle/doctrine/QUESTION_REGISTRY.csv
      (the named open doctrine questions — the only valid doctrine blockers)

Source precedence (highest first):
  1. The live canonical database decides publication (applied at REQUEST time
     by the service; this generator applies the committed-CSV mirror of it).
  2. Registered aliases decide whether a name already resolves to a published
     identity (full name, parenthetical folk names, normalized variants, and
     abbreviations are all tested).
  3. The operator registry (trick_modifiers.csv) decides whether an operator
     is defined; a ledger blocker claiming an operator undefined while the
     registry defines it is a reconciliation defect and the registry wins.
  4. The ruling ledger decides adjudication: object type, identity target,
     evidence state, blocker, owner.
  5. The question registry decides what each doctrine blocker means; a
     doctrine block must reference a known, open question.
  6. The observational CSVs supply evidence and provenance only.
  7. Parser results are internal diagnostics, never lifecycle.
The retired nine-state ladder heading has no authoritative role; the frozen
`section`/`intakeBucket` fields remain on rows as migration provenance only.
Disagreements print a warning summary at regen time; unknown or closed
question references are fatal.

Output:
  src/content/freestyleObservationalUniverse.ts

Run:
  python3 freestyle/scripts/build_observational_universe_content.py
"""
from __future__ import annotations

import csv
import json
import os
import re
import sys
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
TRICKS_CSV = FREESTYLE / "inputs/base_dictionary/tricks.csv"
RED_ADD_CSV = FREESTYLE / "inputs/curated/tricks/red_additions_2026_04_20.csv"
# The ruling ledger: one row per adjudicated observational name, carrying the
# current ev_state / final_disposition / blocker_subtype. It is the ONE
# exception to the freestyle-inputs-only rule, because it is the committed
# ruling record this generator must treat as the classification authority
# (never legacy_data, never the network). Missing ledger = fatal: without it
# the classification would silently regress to the frozen CSV snapshot.
LEDGER_CSV = REPO / "exploration/ev-formula-identity-audit-2026-07-10/EV_FORMULA_IDENTITY_ROWS.csv"
# The named open doctrine questions. A row may only be doctrine-blocked by
# referencing one of these; free-text doctrine labels are invalid.
QUESTION_REGISTRY_CSV = FREESTYLE / "doctrine/QUESTION_REGISTRY.csv"
# Registered alias texts and operator/set names. A queue name that resolves to
# one of these is already represented (alias archive) or is not a trick at all
# (operator/set object), so it must never render as authoring backlog.
MODIFIERS_CSV = FREESTYLE / "inputs/base_dictionary/trick_modifiers.csv"
TRICK_ALIASES_CSV = FREESTYLE / "inputs/base_dictionary/trick_aliases.csv"
ALIAS_ADDITIONS_CSV = FREESTYLE / "inputs/base_dictionary/alias_additions.csv"

# ── Curator decision groups ── the compact decide-now clusters. Each groups
# rows one answer resolves; membership comes from the ledger's blocker_id.
# These are curator decisions, NOT doctrine questions (those live in the
# question registry); nothing here is answered by this generator.
DECISION_GROUPS = [
    {
        "id": "D1", "title": "Down-family cell labels",
        "question": "Confirm that a down-family name's own set and side markers (or a leg-parity trace where a JOB exists) assign its cell in the ratified four-cell grid, then label each row's cell.",
        "recommendation": "Yes: the four-cell grid is ratified doctrine, every cell is a live canonical, and each held name carries explicit set/side markers; the labeling is mechanical once the convention is confirmed.",
        "alternatives": "Route each row to the rules expert individually (rejected by the audit: the grid ruling already decides the structure; only the label is open).",
        "evidence": "The down-family doctrine records the ratified 2x2 grid with all four cells live and bare-attested; the deterministic parity-trace classifier reproduces every traceable corpus JOB.",
        "consequences": "Each answered row files as an alias of its cell canonical or as a positional variant of it; no ADD changes anywhere.",
    },
    {
        "id": "D2", "title": "Registry-defined operators govern",
        "question": "Confirm that the operator registry's definitions of railing (+2), surfing (+3), splicing (+2), and floating (+3) supersede the ledger's stale undefined-operator tags on their compounds.",
        "recommendation": "Yes: the registry is the ruled single authority for operator weight and structure, each definition carries a worked example, and live canonical compounds already use these operators.",
        "alternatives": "Treat the ledger tags as authoritative and re-ask the definitions (rejected: it would re-open settled registry contracts).",
        "consequences": "Eleven compounds become mechanically authorable in a later promotion batch; nothing authors in this phase.",
        "evidence": "trick_modifiers.csv rows for railing/surfing/splicing/floating with worked examples; live canonicals rail_warrior, big_papa_smurf, liquifier, floatation.",
    },
    {
        "id": "D3", "title": "Sailing and inspinning same-side derivations",
        "question": "Confirm the distributive same-side rule derives the sailing ss and inspinning ss rows from their live plain siblings, exactly as the shipped nuclear/pogo/shooting same-side batches.",
        "recommendation": "Yes: every plain sibling is live and the ratified distributive rule is the same one already applied three times.",
        "alternatives": "Hold for per-row footage (rejected: positional configuration is derivable and positional change never alters ADD).",
        "consequences": "Eight rows become mechanically authorable in a later promotion batch.",
        "evidence": "Live sailing_butterfly / _double_leg_over / _illusion / _legover / _mirage / _pickup and inspinning_illusion / inspinning_mirage; the ratified distributive same-side ruling.",
    },
    {
        "id": "D4", "title": "Dragon catch token",
        "question": "Name the operational-notation token for the dragon catch (the ruled terminal contact behind the five dragon compounds).",
        "recommendation": "Write it as a named unusual-surface delay (DRAGON [UNS] [DEL]), mirroring how other named unusual surfaces are notated.",
        "alternatives": "Introduce a new dedicated token class for posture catches (heavier; no second exemplar yet).",
        "consequences": "Five dragon rows become authorable, and Miraging Dragon follows mechanically.",
        "evidence": "The 2026-07-13 identity rulings (single-form Firefly / Spitfire) and the ledger formulas (dex + dragon catch with bracket parity).",
    },
    {
        "id": "D5", "title": "Nuclear ss Reverse Guay alias target",
        "question": "Decide which live identity the name denotes: the plain nuclear_rev_guay (distributive reading restates it verbatim) or nuclear_guay_same_side (catch-targeted reading restates it), or retire the name.",
        "recommendation": "Alias to nuclear_rev_guay: the distributive reading is the ratified default for a trick-level ss qualifier.",
        "alternatives": "Alias to nuclear_guay_same_side (catch-targeted reading), or retire the name as redundant.",
        "consequences": "One row leaves the surface as an alias; no new dictionary row under any answer.",
        "evidence": "Both candidate notations are live and character-identical to the two readings; recorded at the stopped promotion.",
    },
    {
        "id": "D6", "title": "Pyro folds into fyro",
        "question": "Confirm Pyro Torque is a misspelling of the fyro token and folds into the fyro operator gate rather than standing as its own name.",
        "recommendation": "Yes: single-source, one edit-distance from fyro, no independent evidence.",
        "alternatives": "Keep it as an independent folk name (rejected: no distinguishing evidence).",
        "consequences": "One row leaves the decide pile and joins the fyro rows under the operator-definitions question.",
        "evidence": "FootbagMoves carries Fyro Torque and Pyro Torque with no structural difference recorded.",
    },
    {
        "id": "A0", "title": "Author the adjudicated rows",
        "question": "Author the rows whose identity is already adjudicated and whose notation is derivable (currently POD, ruled from footage).",
        "recommendation": "Author POD via the standard red_additions + red_corrections path in a promotion batch.",
        "alternatives": "None: the identity ruling is recorded; only the clerical authoring remains.",
        "consequences": "One canonical row per name; full surface propagation per the standing rule.",
        "evidence": "The POD footage ruling (setting leg performs the pixie dex and returns for the second downtime dex).",
    },
]
DECISION_GROUP_IDS = {g["id"] for g in DECISION_GROUPS}

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


# Unambiguous community shorthands that name a settled published base. Each maps
# one token to the full slug form so an observational name written in shorthand
# resolves to the same trick the canonical browse already shows. Positional
# tokens (ss / os / far / near) are deliberately absent: a side configuration is
# structural identity and must never expand or collapse to its base.
_EV_ABBREV = {
    "dlo": "double_leg_over",
    "dso": "double_switch_over",
    "dod": "double_over_down",
    "ddd": "down_double_down",
    "datw": "double_around_the_world",
}
# Parenthetical contents that are a positional marker, not a folk nickname. A
# folk nickname in parentheses ("(Godzilla)", "(69)") is decoration to strip; a
# positional marker in parentheses ("(ss)", "(same side)", "(far)") is part of
# the trick's identity and is kept so the row is only ever matched by an explicit
# same-side alias, never folded into its base.
_EV_POSITIONAL_PAREN = {
    "ss", "os", "far", "near", "opposite", "same side", "same-side",
}


def _represented_norm_candidates(name: str, slug: str) -> set[str]:
    """Normalized slug candidates for the canonical-gate membership test.

    The gate drops an observational row when the trick it names is already
    published. Comparing only the row's own slug misses two honest matches: a
    name carrying a folk-nickname suffix (``Nuclear Drifter (69)`` is the
    published ``nuclear_drifter``) and a name written in shorthand (``Nuclear
    DLO`` is ``nuclear_double_leg_over``). This returns every normalized slug the
    name could legitimately mean: the raw slug, the folk-suffix-stripped slug,
    and the abbreviation-expanded slug. A positional parenthetical is preserved
    (never stripped), so a same-side variant is matched only by an explicit
    same-side alias and is never collapsed to its base.
    """
    cands = {slug.replace("-", "_")}
    stripped = name
    for inner in re.findall(r"\(([^)]*)\)", name):
        if inner.strip().lower() not in _EV_POSITIONAL_PAREN:
            stripped = stripped.replace(f"({inner})", " ")
    base = re.sub(r"[^a-z0-9]+", "_", stripped.lower()).strip("_")
    if base:
        cands.add(base)
        cands.add("_".join(_EV_ABBREV.get(t, t) for t in base.split("_")))
    return {_norm_slug(c) for c in cands if c}


def _alias_name_targets() -> dict[str, str]:
    """Normalized alias-text key -> canonical target slug, for every registered
    alias.

    Sources: the pipe-delimited `aliases` columns on the two canonical trick
    CSVs plus the two standalone alias files. Each text is keyed both verbatim
    and with community abbreviations expanded, so "stepping DLO" and "stepping
    double legover" resolve to the same key. Positional qualifiers are part of
    the text and are never stripped, so a same-side name only ever matches an
    explicit same-side alias. Carrying the TARGET (not just membership) makes
    every suppression explainable in the emitted metadata.
    """
    targets: dict[str, str] = {}

    def add(text: str, target: str) -> None:
        base = re.sub(r"[^a-z0-9]+", "_", (text or "").lower()).strip("_")
        if not base or not target:
            return
        targets.setdefault(_norm_slug(base), target)
        targets.setdefault(_norm_slug("_".join(_EV_ABBREV.get(t, t) for t in base.split("_"))), target)

    for p, name_col in ((TRICKS_CSV, "trick_canon"), (RED_ADD_CSV, "canonical_name")):
        if p.exists():
            for c in read(p):
                target = _norm_slug(c.get(name_col, "")) and re.sub(r"[^a-z0-9]+", "_", (c.get(name_col, "") or "").lower()).strip("_")
                for a in (c.get("aliases", "") or "").split("|"):
                    add(a, target)
    if TRICK_ALIASES_CSV.exists():
        for c in read(TRICK_ALIASES_CSV):
            add(c.get("alias", ""), re.sub(r"[^a-z0-9]+", "_", (c.get("trick_canon", "") or "").lower()).strip("_"))
    if ALIAS_ADDITIONS_CSV.exists():
        for c in read(ALIAS_ADDITIONS_CSV):
            add(c.get("alias_text", ""), re.sub(r"[^a-z0-9]+", "_", (c.get("target_canonical_slug", "") or "").lower()).strip("_"))
    return targets


def _canonical_name_targets() -> dict[str, str]:
    """Normalized canonical name/slug key -> canonical slug (loader 17 + 19)."""
    targets: dict[str, str] = {}
    for p, name_col in ((TRICKS_CSV, "trick_canon"), (RED_ADD_CSV, "canonical_name")):
        if p.exists():
            for c in read(p):
                raw = (c.get(name_col, "") or "").strip()
                if not raw:
                    continue
                slug = re.sub(r"[^a-z0-9]+", "_", raw.lower()).strip("_")
                targets.setdefault(_norm_slug(raw), slug)
                targets.setdefault(_norm_slug("_".join(_EV_ABBREV.get(t, t) for t in slug.split("_"))), slug)
    return targets


def _operator_object_norms() -> set[str]:
    """Registered operator / set names (the modifier registry), normalized."""
    if not MODIFIERS_CSV.exists():
        return set()
    return {_norm_slug(c.get("modifier", "")) for c in read(MODIFIERS_CSV)} - {""}


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
            "ledger": "absent",
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
    # The database-tracked exclusion (every freestyle_tricks slug plus every
    # registered alias) is applied at REQUEST TIME by the service, not baked in
    # here. After cutover the live database is the source of truth for publication
    # state, and a build-time gate against a rebuilt-from-CSV database cannot see
    # in-app edits, so it would leave the rendered surface stale. This generator
    # is therefore pure over the committed CSVs; the rendered Emerging Vocabulary
    # surface filters out every db-tracked name (any status) and alias live, which
    # also keeps a name that has a pending external row from double-rendering.
    # Compare on the alphanumeric-normalized slug: observational rows use hyphen
    # slugs while the canonical DB / CSV slugs use underscores, so a raw-string
    # membership test never matched and the gate let published slugs through.
    # Test every slug the row could legitimately mean (its own slug, the
    # folk-suffix-stripped slug, the abbreviation-expanded slug); a row whose
    # trick is published under any of these leaves the surface. Positional
    # variants are never collapsed to their base here (see
    # _represented_norm_candidates).
    _canonical_norm = {_norm_slug(s) for s in canonical_slugs}
    rows = [r for r in rows
            if not (_represented_norm_candidates(r["name"], r["slug"]) & _canonical_norm)]

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

    # ── six-dimension lifecycle classification ── the ledger carries the
    # adjudicated dimensions (object type, evidence state, blocker, owner);
    # identity resolution against the canonical/alias layer and the operator
    # registry is re-derived here every run under the precedence order in the
    # module docstring, so a published identity or a defined operator always
    # wins over a stale ledger label, loudly.
    if not LEDGER_CSV.exists():
        raise SystemExit(f"ruling ledger missing: {LEDGER_CSV} — the adjudication authority is unavailable")
    if not QUESTION_REGISTRY_CSV.exists():
        raise SystemExit(f"question registry missing: {QUESTION_REGISTRY_CSV} — doctrine blockers cannot be validated")
    questions = {(q.get("question_id") or "").strip(): q for q in read(QUESTION_REGISTRY_CSV)}
    ledger = {(L.get("normalized_name") or "").strip(): L for L in read(LEDGER_CSV)}
    alias_targets = _alias_name_targets()
    canonical_targets = _canonical_name_targets()
    operator_norms = _operator_object_norms()
    warn: Counter = Counter()
    warn_examples: dict[str, list[str]] = {}

    def note_warn(kind: str, detail: str) -> None:
        warn[kind] += 1
        ex = warn_examples.setdefault(kind, [])
        if len(ex) < 5:
            ex.append(detail)

    VALID_BLOCKERS = set(questions) | set(DECISION_GROUP_IDS) | {"source-recovery", ""}
    NON_TRICK_OBJECTS = {"set-operator", "modifier", "terminal-contact", "generic-term"}

    def resolve_identity(r: dict) -> tuple[str, bool]:
        """(resolved canonical/alias endpoint, conflict?) for a row's name.

        Tests the full name, the parenthetical-stripped name, the
        abbreviation-expanded name, the slug, and EVERY non-positional
        parenthetical folk name against the canonical names/slugs and the
        registered alias texts. Distinct endpoints from different candidates
        are a conflict to surface, never a silent suppression.
        """
        endpoints: dict[str, str] = {}
        for cand in _represented_norm_candidates(r["name"], r["slug"]):
            if cand in canonical_targets:
                endpoints[canonical_targets[cand]] = f"canonical:{canonical_targets[cand]}"
            elif cand in alias_targets:
                endpoints[alias_targets[cand]] = f"alias:{alias_targets[cand]}"
        primary_endpoints = set(endpoints)
        for inner in re.findall(r"\(([^)]*)\)", r["name"]):
            if inner.strip().lower() in _EV_POSITIONAL_PAREN:
                continue
            for key in (_norm_slug(inner), _norm_slug("_".join(_EV_ABBREV.get(t, t) for t in re.findall(r"[a-z0-9]+", inner.lower())))):
                if key in canonical_targets:
                    endpoints[canonical_targets[key]] = f"canonical:{canonical_targets[key]}"
                elif key in alias_targets:
                    endpoints[alias_targets[key]] = f"alias:{alias_targets[key]}"
        # Positional identity guard: a folk-name parenthetical registered on a
        # BASE trick never collapses a positional variant onto that base (the
        # side configuration is structural identity). A paren-only resolution
        # on a positional name is a curated-equivalence question, surfaced,
        # never a silent suppression.
        positional = any(t in ("ss", "os", "op", "near", "far", "opposite", "same")
                         for t in re.findall(r"[a-z]+", r["name"].split("(")[0].lower()))
        paren_only = {e for e in endpoints if e not in primary_endpoints}
        if positional and paren_only and not primary_endpoints:
            note_warn("positional-paren-resolution-held", f"{r['name']} -> " + "; ".join(sorted(endpoints[e] for e in paren_only)))
            return "", False
        if len(endpoints) > 1:
            return "; ".join(sorted(endpoints.values())), True
        return next(iter(endpoints.values()), ""), False

    for r in rows:
        name_key = _norm_slug(r["name"])
        L = ledger.get(name_key)
        if L is not None:
            r["ledger"] = f"{(L.get('ev_state') or '').strip()}/{(L.get('final_disposition') or '').strip()}"
            obj = (L.get("object_type") or "").strip()
            evid = (L.get("evidence_state") or "").strip()
            blocker = (L.get("blocker_id") or "").strip()
            owner = (L.get("owner") or "").strip()
            if not (obj and evid and owner):
                note_warn("ledger-row-missing-dimensions", r["name"])
                obj = obj or "complete-trick"
                evid = evid or "folk-name-only"
                owner = owner or "none"
        else:
            r["ledger"] = "absent"
            obj, evid, blocker, owner = "complete-trick", "folk-name-only", "", "none"

        if blocker not in VALID_BLOCKERS:
            raise SystemExit(f"unknown blocker '{blocker}' on '{r['name']}' — not a registered question or decision group")
        if blocker in questions:
            q = questions[blocker]
            if (q.get("status") or "").strip().lower().startswith("answered"):
                raise SystemExit(f"closed question {blocker} still blocks '{r['name']}' — retag the ledger row")
            q_owner = (q.get("owner") or "").strip()
            if owner and q_owner and owner != q_owner:
                note_warn("row-owner-conflicts-with-question", f"{r['name']} ({owner} vs {blocker}={q_owner})")

        # registry-over-ledger operator definedness: a doctrine block on an
        # operator the registry defines is a stale gate, not doctrine. The
        # gated token is the one named by the ledger's blocker subtype.
        if blocker == "Q02" and L is not None:
            sub = (L.get("blocker_subtype") or "").strip()
            tok = sub.split(":", 1)[1] if sub.startswith("undefined-operator:") else ""
            if tok and _norm_slug(tok) in operator_norms:
                note_warn("registry-defines-gated-operator", f"{r['name']} ({tok})")

        resolved, conflict = resolve_identity(r)
        if conflict:
            note_warn("conflicting-parenthetical-resolutions", f"{r['name']} -> {resolved}")
            r["resolvedTarget"] = resolved
            resolved_final = ""       # surfaced for adjudication, never silently suppressed
        else:
            r["resolvedTarget"] = resolved
            resolved_final = resolved
        if resolved_final and L is not None and (L.get("final_disposition") or "").strip() not in ("A",) and blocker != "Q01":
            note_warn("live-resolution-overrides-ledger", f"{r['name']} -> {resolved_final}")

        # derived publication state + public section
        ledger_disp = (L.get("final_disposition") or "").strip() if L is not None else ""
        if not resolved_final and L is not None and ledger_disp == "A":
            # the ledger adjudicated the name an alias/duplicate even where the
            # committed-CSV name maps cannot re-derive the target (formula-row
            # matches, historical targets); carry its recorded target through.
            resolved_final = (L.get("matched_existing_object") or "").strip()
            if resolved_final and not r["resolvedTarget"]:
                r["resolvedTarget"] = f"ledger:{resolved_final}"
        if obj == "malformed":
            pub, section = "rejected", "archive"
        elif obj == "source-fragment":
            pub, section = "rejected", "archive"
        elif obj in NON_TRICK_OBJECTS:
            pub, section = "not-a-trick", "archive"
        elif blocker == "Q01" and r["resolvedTarget"] and not conflict:
            pub, section = "doctrine-blocked", "ruling"   # published identity; name form rides Q01
        elif (resolved_final or ledger_disp == "A" or owner == "mechanical") and blocker != "Q01":
            pub, section = "already-represented", "archive"
        elif blocker in questions:
            pub, section = "doctrine-blocked", "ruling"
        elif blocker == "source-recovery":
            pub, section = "evidence-pending", "evidence"
        elif blocker in DECISION_GROUP_IDS or (owner == "james" and blocker == ""):
            pub, section = "adjudication-pending", "decide"
            if owner == "james" and blocker == "":
                blocker = "A0"        # the authorable cluster (POD class)
        elif obj == "observational-name" or owner in ("none", ""):
            pub, section = "observational", "archive"
        else:
            note_warn("unclassifiable-row", r["name"])
            pub, section = "observational", "archive"

        r["objectType"] = obj
        r["evidenceState"] = evid
        r["blockerId"] = blocker
        r["owner"] = owner
        r["publicationState"] = pub
        r["publicSection"] = section
        r["resolutionConflict"] = conflict

    # ── identity-level duplicate grouping ── one public entity per identity.
    # Grouping key: the parenthetical-stripped, abbreviation-expanded name (the
    # same identity under multiple source spellings). Positional parentheticals
    # never strip, so side configurations stay distinct identities. The primary
    # spelling prefers the member carrying a folk-name parenthetical; the
    # others render only through the primary's `alsoRecordedAs`.
    def identity_key(r: dict) -> str:
        stripped = r["name"]
        for inner in re.findall(r"\(([^)]*)\)", r["name"]):
            if inner.strip().lower() not in _EV_POSITIONAL_PAREN:
                stripped = stripped.replace(f"({inner})", " ")
        toks = re.findall(r"[a-z0-9]+", stripped.lower())
        return _norm_slug("_".join(_EV_ABBREV.get(t, t) for t in toks)) or _norm_slug(r["slug"])

    groups: dict[str, list[dict]] = {}
    for r in rows:
        groups.setdefault(identity_key(r), []).append(r)
    SECTION_RANK = {"decide": 0, "ruling": 1, "evidence": 2, "archive": 3}
    for key, members in groups.items():
        # A LIVE resolution on any spelling covers the whole identity: the
        # twins share the published target. (A ledger formula-row match does
        # not imply published, so it never propagates.)
        live = next((m for m in members
                     if m["resolvedTarget"].startswith(("canonical:", "alias:"))
                     and not m["resolutionConflict"] and m["blockerId"] != "Q01"), None)
        if live is not None:
            for m in members:
                if m["publicationState"] not in ("already-represented", "rejected", "not-a-trick"):
                    m["publicationState"] = "already-represented"
                    m["publicSection"] = "archive"
                    m["resolvedTarget"] = m["resolvedTarget"] or live["resolvedTarget"]
        # Primary spelling: the most actionable member first (decide > ruling >
        # evidence > archive), then prefer a folk-name parenthetical spelling.
        primary = sorted(members, key=lambda m: (SECTION_RANK[m["publicSection"]], "(" not in m["name"], m["name"]))[0]
        blockers = {m["blockerId"] for m in members if m["publicSection"] in ("decide", "ruling")}
        if len(blockers) > 1:
            note_warn("duplicate-group-dimension-conflict", f"{key}: " + "; ".join(sorted(m["name"] for m in members)))
        for m in members:
            m["identityKey"] = key
            m["groupPrimary"] = m is primary
            m["alsoRecordedAs"] = sorted(x["name"] for x in members if x is not primary) if m is primary else []

    if warn:
        print(f"  WARNING reconciliation: {sum(warn.values())} findings across {len(warn)} classes", file=sys.stderr)
        for kind, n in sorted(warn.items(), key=lambda kv: -kv[1]):
            print(f"    {kind}: {n}  (e.g. {'; '.join(warn_examples[kind])})", file=sys.stderr)

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

    # ── lifecycle-model counts ── per-section, per-blocker, per-owner counts
    # over PRIMARY identity rows (duplicate spellings never double-count), plus
    # the reconciliation-warning tallies, all computed here so the rendered
    # numbers can never drift from the row data. The service recomputes the
    # live-filtered variants at request time.
    primaries = [r for r in rows if r["groupPrimary"]]
    section_counts = Counter(r["publicSection"] for r in primaries)
    blocker_counts = Counter(r["blockerId"] for r in primaries if r["blockerId"])
    owner_counts = Counter(r["owner"] for r in primaries)
    publication_counts = Counter(r["publicationState"] for r in primaries)

    # external database-tracked adjudications (ledger rows carrying an
    # external-db-row slug marker); the service joins these to the live
    # is_active=0 pending rows at request time.
    external_adjudications: dict[str, dict] = {}
    for L in ledger.values():
        m = re.search(r"external-db-row slug=([a-z0-9_]+)", L.get("note", "") or "")
        if not m:
            continue
        b = (L.get("blocker_id") or "").strip()
        ext_section = ("ruling" if b in questions
                       else "evidence" if b == "source-recovery"
                       else "decide" if b in DECISION_GROUP_IDS else "archive")
        external_adjudications[m.group(1)] = {
            "name": (L.get("submitted_name") or "").strip(),
            "objectType": (L.get("object_type") or "").strip(),
            "evidenceState": (L.get("evidence_state") or "").strip(),
            "blockerId": b,
            "owner": (L.get("owner") or "").strip(),
            "publicSection": ext_section,
        }

    # An external database row whose name is ALSO a universe row (same corpus
    # name, now DB-tracked) counts once: the universe primary carries it in the
    # build-time census, and the service's live filter swaps in the external
    # row at request time.
    primary_keys = {_norm_slug(r["name"]) for r in primaries}
    externals_only = {slug: x for slug, x in external_adjudications.items()
                      if _norm_slug(x["name"]) not in primary_keys}

    emerging_questions = []
    for qid, q in sorted(questions.items()):
        gated = blocker_counts.get(qid, 0) + sum(1 for x in externals_only.values() if x["blockerId"] == qid)
        emerging_questions.append({
            "id": qid,
            "title": (q.get("title") or "").strip(),
            "question": (q.get("exact_question") or "").strip(),
            "status": (q.get("status") or "").strip(),
            "owner": (q.get("owner") or "").strip(),
            "vehicle": (q.get("vehicle") or "").strip(),
            "unlockCount": gated,
        })

    decision_groups = []
    for g in DECISION_GROUPS:
        members = sorted(r["name"] for r in primaries if r["blockerId"] == g["id"])
        members += sorted(x["name"] for x in externals_only.values() if x["blockerId"] == g["id"])
        decision_groups.append({**g, "memberCount": len(members), "members": members})

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
        # Lifecycle-model counts over primary identities (build-time census;
        # the service recomputes live-filtered variants at request time).
        "publicSections": dict(sorted(section_counts.items())),
        "publicationStates": dict(sorted(publication_counts.items())),
        "blockerCounts": dict(sorted(blocker_counts.items())),
        "ownerCounts": dict(sorted(owner_counts.items())),
        "identityCount": len(primaries),
        "reconciliationWarnings": dict(sorted(warn.items())),
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
        "// Source: observational-universe reconciliation (overlap-safe: in_db=false, governance_state∉{1,2}).\n"
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
        "  /** Ruling-ledger provenance: 'ev_state/disposition', or 'absent'. */\n"
        "  ledger: string;\n"
        "  /** Object type: complete-trick | set-operator | modifier |\n"
        "   *  terminal-contact | generic-term | observational-name |\n"
        "   *  source-fragment | malformed. A non-trick object never renders as\n"
        "   *  an unresolved trick candidate. */\n"
        "  objectType: string;\n"
        "  /** Evidence basis: exact-notation | verified-footage |\n"
        "   *  authoritative-prose | derivable-notation | partial-structure |\n"
        "   *  compositional-name-only | folk-name-only | contradictory | none |\n"
        "   *  not-applicable. Parser confidence never drives this. */\n"
        "  evidenceState: string;\n"
        "  /** '' (none), a question-registry id (Q01..Q14), a decision-group id\n"
        "   *  (D1..D6, A0), or 'source-recovery'. A doctrine block MUST carry a\n"
        "   *  registered question id. */\n"
        "  blockerId: string;\n"
        "  /** Decision owner: mechanical | james | james+dave | james+red |\n"
        "   *  evidence | none. */\n"
        "  owner: string;\n"
        "  /** Derived: already-represented | not-a-trick | doctrine-blocked |\n"
        "   *  evidence-pending | adjudication-pending | observational | rejected. */\n"
        "  publicationState: string;\n"
        "  /** Derived public section: decide | ruling | evidence | archive. */\n"
        "  publicSection: string;\n"
        "  /** Canonical/alias endpoint(s) the name resolves to ('' when none);\n"
        "   *  'canonical:slug' or 'alias:slug', semicolon-joined on a conflict. */\n"
        "  resolvedTarget: string;\n"
        "  /** True when distinct candidates resolve to different endpoints; the\n"
        "   *  row is surfaced for adjudication, never silently suppressed. */\n"
        "  resolutionConflict: boolean;\n"
        "  /** Identity-group key (parenthetical-stripped, abbreviation-expanded).\n"
        "   *  All spellings of one identity share it. */\n"
        "  identityKey: string;\n"
        "  /** True on the one spelling that renders publicly for its identity. */\n"
        "  groupPrimary: boolean;\n"
        "  /** Other recorded spellings of this identity (primary rows only). */\n"
        "  alsoRecordedAs: string[];\n"
        "}\n\n"
        "export interface EmergingQuestion {\n"
        "  id: string;\n"
        "  title: string;\n"
        "  /** The exact unresolved issue, in full. */\n"
        "  question: string;\n"
        "  /** drafted | sent | answered (answered never gates a row). */\n"
        "  status: string;\n"
        "  owner: string;\n"
        "  /** Controlling paper / packet (Scoring paper, Notation paper, Rider list). */\n"
        "  vehicle: string;\n"
        "  /** Names this question currently gates (primary identities + external rows). */\n"
        "  unlockCount: number;\n"
        "}\n\n"
        "export interface EmergingDecisionGroup {\n"
        "  id: string;\n"
        "  title: string;\n"
        "  /** The smallest exact decision. */\n"
        "  question: string;\n"
        "  recommendation: string;\n"
        "  alternatives: string;\n"
        "  evidence: string;\n"
        "  consequences: string;\n"
        "  memberCount: number;\n"
        "  members: string[];\n"
        "}\n\n"
        "export interface ExternalAdjudication {\n"
        "  name: string;\n"
        "  objectType: string;\n"
        "  evidenceState: string;\n"
        "  blockerId: string;\n"
        "  owner: string;\n"
        "  publicSection: string;\n"
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
        "  /** Lifecycle-model counts over primary identities (build-time census). */\n"
        "  publicSections: Record<string, number>;\n"
        "  publicationStates: Record<string, number>;\n"
        "  blockerCounts: Record<string, number>;\n"
        "  ownerCounts: Record<string, number>;\n"
        "  identityCount: number;\n"
        "  /** Reconciliation findings by class (source disagreement visibility). */\n"
        "  reconciliationWarnings: Record<string, number>;\n"
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
    body.append("export const EMERGING_QUESTIONS: readonly EmergingQuestion[] =")
    body.append("  " + json.dumps(emerging_questions, ensure_ascii=False, indent=2).replace("\n", "\n  ") + ";\n")
    body.append("export const EMERGING_DECISION_GROUPS: readonly EmergingDecisionGroup[] =")
    body.append("  " + json.dumps(decision_groups, ensure_ascii=False, indent=2).replace("\n", "\n  ") + ";\n")
    body.append("export const EXTERNAL_ADJUDICATIONS: Record<string, ExternalAdjudication> =")
    body.append("  " + json.dumps(external_adjudications, ensure_ascii=False, indent=2).replace("\n", "\n  ") + ";\n")

    OUT.write_text(header + "\n".join(body) + "\n", encoding="utf-8")
    print(f"Wrote {OUT.relative_to(REPO)} — {total} rows, {stats['identityCount']} identities")
    print(f"  folded {len(junk)} junk rows out to {junk_csv.relative_to(REPO)} "
          f"(public universe is now {total}, was {total + len(junk)} before folding)")
    print(f"  sections: {stats['publicSections']}")
    print(f"  owners:   {stats['ownerCounts']}")
    print(f"  blockers: {stats['blockerCounts']}")
    print(f"  publication: {stats['publicationStates']}")
    print(f"  canonical-coverage={stats['canonicalCoveragePct']}%")


if __name__ == "__main__":
    main()
