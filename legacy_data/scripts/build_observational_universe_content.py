#!/usr/bin/env python3
"""Generate src/content/freestyleObservationalUniverse.ts from the Phase E packet.

Read-only over the committed Phase E exploration CSVs. Emits a deterministic,
typed TS content module that the freestyle service reads to render the
/freestyle/observational governance surface. Mirrors the existing
build_tracked_names_content.py → freestyleTrackedNames.ts pattern (generated TS
content, schema-free, reversible — no DB).

The module is the DATA spine (one row per unresolved observational name +
overall stats). The SERVICE owns sectioning / sampling / labeling.

Overlap-safe by construction: the source CSVs already exclude in_db /
governance_state∈{1,2} / alias-to-canon rows, so nothing here collides with a
published canonical trick.

Inputs:
  exploration/phase-e-promotion-packet-2026-05-28/promotion_candidates_clean.csv
  exploration/phase-e-promotion-packet-2026-05-28/promotion_candidates_curator_confirm.csv
  exploration/phase-e-promotion-packet-2026-05-28/promotion_candidates_deferred.csv
  exploration/phase-e-implementation-2026-05-28/CLASSIFIED_UNIVERSE.csv   (stats only)

Output:
  src/content/freestyleObservationalUniverse.ts

Run:
  python3 legacy_data/scripts/build_observational_universe_content.py
"""
from __future__ import annotations

import csv
import json
from collections import Counter
from datetime import date
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
PACKET = REPO / "exploration/phase-e-promotion-packet-2026-05-28"
IMPL = REPO / "exploration/phase-e-implementation-2026-05-28"
OUT = REPO / "src/content/freestyleObservationalUniverse.ts"

DOCTRINE_CLUSTERS = {"blurry/furious", "weaving", "pogo", "shooting"}
BLOCKING_QUESTION = {
    "blurry/furious": "Does `blurry`/`furious` carry +2 on rotational bases? (Red Q1.A)",
    "weaving": "Weaving movement structure unruled.",
    "pogo": "Pogo structural / ADD reading unruled (Red Wave-3 Q3).",
    "shooting": "Shooting structural reading unruled.",
    "other": "Curator / Red ruling pending.",
}
# corpus → short source badge (reuses the template's PB/FM/SG/FB chip vocab)
SOURCE_BADGE = {
    "stanford": "SG", "passback": "PB", "footbagmoves": "FM",
    "fborg": "FB", "ifpa-canonical": "IFPA", "multi": "MULTI", "curator": "CUR",
}


def read(p: Path) -> list[dict]:
    with p.open(encoding="utf-8") as f:
        return list(csv.DictReader(f))


def badge(corpus: str) -> str:
    return SOURCE_BADGE.get((corpus or "").strip(), (corpus or "?").upper()[:5])


def main() -> None:
    rows: list[dict] = []

    # n_sources corroboration signal (single source ⇒ low_confidence_noise) sourced
    # from the classified universe; keyed by slug (max across rows for that slug).
    classified = read(IMPL / "CLASSIFIED_UNIVERSE.csv")
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
            "intakeBucket": intake, "lexicalVariants": [],
        }

    # clean + curator-confirm rows are mechanically-derivable modifier+base
    # compositions: under the unique-trick doctrine they are modifier combinations
    # of an existing base (modifier_links candidates), NOT unresolved unique
    # structures. They are fully RESOLVED compositions → parser_generated_compound.
    for r in read(PACKET / "promotion_candidates_clean.csv"):
        rows.append(row(r["name"], r["proposed_slug"], r["source_corpus"], r["ecosystem"],
                        r["parent_family"], "ready", "", r["parser_confidence"],
                        r["doctrine_confidence"], r["proposed_add"], r["add_accounting"],
                        r["proposed_job_semantic"], "", "parser_generated_compound"))

    for r in read(PACKET / "promotion_candidates_curator_confirm.csv"):
        rows.append(row(r["name"], r["proposed_slug"], r["source_corpus"], r["ecosystem"],
                        r["parent_family"], "frontier", "", r["parser_confidence"],
                        r["doctrine_confidence"], r["proposed_add"], r["add_accounting"],
                        r["proposed_job_semantic"], "", "parser_generated_compound"))

    for r in read(PACKET / "promotion_candidates_deferred.csv"):
        db = r["deferral_bucket"]
        fc = r["failure_class"]
        eco = r["ecosystem"]
        if db == "doctrine-sensitive":
            section = "doctrine"
            cluster = eco if eco in DOCTRINE_CLUSTERS else "other"
            intake = "doctrine_blocked"
        elif db == "alias-collapse":
            # Routed OUT of the old "folk" bucket: these collapse to an existing
            # canonical and never count as structures. (Phase 1 folds the
            # alias-vs-equivalence distinction here; equivalence_candidate is
            # split out in a later phase via the CLASSIFIED_UNIVERSE equivalent_to
            # signal.)
            section, cluster = "folk", ""
            intake = "alias_candidate"
        elif fc == "folk-name-opacity":
            section, cluster = "folk", ""
            intake = "unresolved_structure" if corroborated(r["slug"]) else "low_confidence_noise"
        else:
            section, cluster = "parser", ""
            intake = "unresolved_structure" if corroborated(r["slug"]) else "low_confidence_noise"
        rows.append(row(r["name"], r["slug"], r["source_corpus"], eco, "",
                        section, cluster, "", r["doctrine_confidence"], "", "", "", fc, intake))

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
            r["intakeBucket"] = "duplicate_source_variant"
        else:
            _first[s] = r

    # ── stats (headline scale of the governed universe) ──
    canonical = sum(1 for c in classified if c["governance_state"].startswith("1"))
    total = len(rows)

    # ── intake-bucket classification (Phase 1 — governance-workflow taxonomy) ──
    # Each row carries an intakeBucket. Distinct-SLUG counts per bucket are the
    # honest figures (names dedupe to structures). The scholarly metric is
    # `unresolvedStructures`: distinct slugs that are genuinely unresolved — NOT
    # aliases, NOT resolved modifier compounds, NOT lexical duplicates, NOT noise.
    BUCKETS = [
        "alias_candidate", "equivalence_candidate", "duplicate_source_variant",
        "parser_generated_compound", "unresolved_structure", "doctrine_blocked",
        "low_confidence_noise",
    ]
    _bnames = {b: 0 for b in BUCKETS}
    _bslugs: dict[str, set] = {b: set() for b in BUCKETS}
    for r in rows:
        b = r["intakeBucket"]
        _bnames[b] = _bnames.get(b, 0) + 1
        _bslugs.setdefault(b, set()).add(r["slug"])
    intake_buckets = {
        b: {"names": _bnames[b], "distinctStructures": len(_bslugs[b])} for b in BUCKETS
    }
    unresolved_structures = len(_bslugs["unresolved_structure"])

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
        # Phase 1 intake-bucket classification + the scholarly frontier metric.
        "intakeBuckets": intake_buckets,
        "unresolvedStructures": unresolved_structures,
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
        "generatedOn": date.today().isoformat(),
    }

    # ── emit TS ──
    header = (
        "// GENERATED by legacy_data/scripts/build_observational_universe_content.py\n"
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
        "  /** Phase-1 intake bucket: alias_candidate | equivalence_candidate |\n"
        "   *  duplicate_source_variant | parser_generated_compound |\n"
        "   *  unresolved_structure | doctrine_blocked | low_confidence_noise. */\n"
        "  intakeBucket: string;\n"
        "  /** Folded wording/source variants of this slug (on the surviving row). */\n"
        "  lexicalVariants: string[];\n"
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
        "  /** Phase-1 intake buckets: per-bucket name + distinct-structure counts. */\n"
        "  intakeBuckets: Record<string, { names: number; distinctStructures: number }>;\n"
        "  /** Distinct genuinely-unresolved structures (the scholarly frontier metric). */\n"
        "  unresolvedStructures: number;\n"
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
    print(f"  sections: {dict(by_section)}")
    print(f"  stats: ready={stats['ready']} frontier={stats['frontier']} "
          f"doctrine={stats['doctrineBlocked']} folk={stats['folkUnresolved']} "
          f"parser={stats['parserUnresolved']}")
    print(f"  promotion-ready={stats['promotionReadyPct']}%  "
          f"doctrine-blocked={stats['doctrineBlockedPct']}%  "
          f"canonical-coverage={stats['canonicalCoveragePct']}%")


if __name__ == "__main__":
    main()
