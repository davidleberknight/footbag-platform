# Coverage Semantics & Relationship Language (Part 4)

Formalizes the coverage vocabulary so metrics stay honest and media never implies doctrine. Builds on
the shipped direct-vs-embedded split (`24_qc_freestyle_media_coverage.py`, `freestyleEmbeddedCoverage.ts`)
and `ARCHITECTURE.md` §3a. **No new relationship edges implemented here** — this is semantic/governance
clarity only.

## The two coverage kinds (shipped — restated as the contract)

- **Direct coverage:** a curated `media_item` carries `#<slug>` — a clip *dedicated to that trick*.
  Strength is derived from `source_id` via `SOURCE_TIER` (TUTORIAL / DEMONSTRATION / RECORD). This is
  the headline coverage number.
- **Embedded coverage:** a trick is *taught inside another trick's lesson* with no dedicated clip
  (`freestyleEmbeddedCoverage.ts`, e.g. orbit inside the ATW tutorial). Reported **separately**, never
  added to the direct headline.

**Honesty rule #1 (load-bearing):** embedded coverage MUST NOT inflate direct tutorial coverage. A
trick with only an embedded edge is `embedded_only`, not "covered." The coverage dashboard already
enforces this split; keep it.

## Tier ↔ strength (the role of a clip)

| Clip role | Tier | Counts as | Primary-eligible? |
|---|---|---|---|
| **Tutorial** | CANONICAL_TUTORIAL / STRONG_TUTORIAL | strong direct coverage | yes (preferred) |
| **Demonstration** | HIGH_QUALITY_DEMO | strong direct coverage | yes (after tutorials) |
| **Record** | RECORD / WEAK_RECORD | proof-of-rep, NOT instructional | never primary if a tutorial exists |

**Honesty rule #2:** tier is *presentation/strength*, derived from source, never a free tag. A "wrong"
tier is a curator-judgment finding, not a data-integrity break.

## Exemplar vs incidental (a needed new distinction)

Two clips can both carry `#<slug>` yet differ in pedagogical intent:
- **Exemplar:** curator-selected as *the* reference clip for a trick/family ("watch this one").
- **Incidental:** the trick appears but the clip isn't its canonical reference (a combo clip that
  passes through it).

Today both are flattened to "has direct coverage." Recommendation: model **exemplar** as a curator
flag (metadata field or an `exemplar_of` relationship — see below), so family-page heroes and "best
clip" selection are explicit, not inferred from record value. Incidental inclusion should *not* count
as exemplar coverage. (Design only — not built.)

## Pedagogical reach (the honest aggregate)

"Reach" = direct ∪ embedded ∪ (component-covered, future). It must always be reported as a *union with
labeled parts*, never collapsed into one inflated percentage. The dashboard's current shape
(`strong_coverage_pct` direct + a separate embedded line) is the correct pattern; extend it
additively, never by merging.

## Future relationship vocabulary (semantic clarity — NOT implemented)

When a media-relationship layer is built (post-sprint), use this controlled vocabulary. Each edge is a
**pedagogical fact about a video**, firewalled from structural claims (the embedded-coverage firewall
generalizes to all of these):

| Edge | Meaning | Counts toward | Doctrine-safe? |
|---|---|---|---|
| `teaches` | video instructs this trick (dedicated) | direct coverage | yes — pedagogy only |
| `demonstrates` | video shows this trick (no teaching breakdown) | direct (demo-tier) | yes |
| `embedded` | trick taught *inside* another's lesson | embedded only (separate) | yes (already firewalled) |
| `covers_component` | video teaches a *component* of this compound | a future "component reach" line, NOT direct | yes — never implies the compound's structure |
| `exemplar_of` | curator-chosen reference clip for a trick/family | exemplar selection | yes — editorial, not structural |
| `progression_for` | video is a step in a learning path | progression surfaces only | yes (see `PROGRESSION_MODELING_MEMO.md`) |
| `historical_reference` | archival/legacy footage of a trick/era | archives, NOT direct tutorial coverage | yes — provenance, not currency |

**Honesty rule #3:** `covers_component` and `embedded` are *reach*, never *direct* — they must never
let a compound claim a dedicated tutorial it doesn't have. **Honesty rule #4:** no edge implies
ontology — `covers_component` does not assert the compound's decomposition (that's the dictionary's
job); it only says "this video happens to teach a piece."

## Separation of dimensions (the core principle)

**Educational usefulness and ontological certainty are orthogonal.** A trick can have rich, curator-
exemplar tutorial coverage while its decomposition is still Red-Wave-2-pending (e.g. the atomic-Q3
tricks). Coverage metrics describe teaching reach; they say nothing about whether doctrine is settled.
A media surface must never present "well-covered" as "ontologically resolved," and vice-versa.

## What stays out
No new edges/tables now. No change to the direct/embedded split. The vocabulary above is the agreed
*language* so that when edges are built, they're honest by construction.
