# Glossary §10 Relocation Recommendations

Coherence Cleanup Slice — Phase 1e (part 1) (2026-05-17). Read-only audit.

## Current §10 contents

Glossary §10 ("Traditional Reference") at `src/views/freestyle/glossary.hbs:1000-1046` is a mixed bag:

| Sub-section | Content kind |
|---|---|
| ADD system & run quality intro paragraph | movement-language definition (ADD itself) |
| Run-quality tier table (Tiltless / Guiltless / Tripless / Fearless / Beastly / Godly / Genuine / BOP) | **combo / run-quality culture** — describes *runs*, not tricks |
| Link to ADD Analysis page | cross-link |
| Competitive & format terms (Routine / Shred Contest / Big Trick / Circle Contest / Most Rippin' Run) | **event-format vocabulary** — describes *competitive structures*, not movement |

## The classification problem

The glossary's identity per its own §1–§9 sectional spine is **movement language at the trick level**. The §10 contents drift into two adjacent domains:
- Run-quality tiers describe properties of *runs* (sequences of tricks), not individual tricks
- Event formats describe properties of *competition*, not movement

A reader looking up "what is paradox" reads §3; a reader looking up "what is guiltless" reads §10. The two questions live at incompatible levels of analysis.

## Where else this content could live

| Term | Candidate home | Rationale |
|---|---|---|
| ADD itself (system) | **Stays in glossary** | Movement-level scoring concept |
| Tiltless / Guiltless / Tripless / Fearless / Beastly / Godly | **Future Combo/Run Analysis page** OR **ADD Analysis page** | Properties of a run, not a trick |
| BOP (Butterfly, Osis, Paradox Mirage) | **ADD Analysis page** | Acronym for a specific exception set; mechanically defined by ADD |
| Genuine | **Future Combo/Run Analysis page** | Derivation rule (Guiltless minus BOP) |
| Freestyle Routine | **Existing competition page** (`/freestyle/competition`) OR rules | Event format |
| Shred Contest (Shred:30) | **Existing rules pages** (`/rules/freestyle/`) | Event format |
| Big Trick / Sick, Big, Best | **Existing rules pages** | Event format |
| Circle Contest | **Existing rules pages** | Event format |
| Most Rippin' Run | **Existing rules pages** | Event format |

## Recommendation

**Two-stage relocation:**

**Stage 1 (this slice's recommendation, no immediate move):**
- Add a header note at the top of §10 acknowledging the mixed level of analysis:
  > "This section covers vocabulary that operates at the *run* and *competition* level rather than the *trick* level. Trick-level definitions live in §1–§9 of this glossary."
- Add cross-links from each entry to its natural future home (when those homes exist)
- Defer actual move until a Combo/Run Analysis page is built — that page does not yet exist

**Stage 2 (future slice, after Combo/Run Analysis page exists):**
- Move the run-quality tier table to the Combo/Run Analysis page
- Move event-format terms to `/rules/freestyle/` if they're not already in the rule docs
- Reduce glossary §10 to a thin section that defines ADD itself and points to the natural homes
- Or: retire §10 entirely once everything moves

The history page (`src/views/freestyle/history.hbs`) currently references the run-quality vocabulary; those links remain valid pointing at wherever the vocabulary lands.

## Cross-references to the run-quality vocabulary

| Surface | Reference |
|---|---|
| `src/views/freestyle/history.hbs:84` | Cross-link from "How Combos Grew" to glossary run-quality |
| `src/views/freestyle/history.hbs:100` | Cross-link from "Routines to Guiltless" to glossary run-quality |
| `src/services/freestyleService.ts` history content prose | Uses run-quality terms in narrative |

Any relocation must update these inbound links.

## What's safe to do NOW (Phase 3 candidate)

The "Stage 1" header note is safe — adds 1 short paragraph, no removal, no link breakage. It honestly acknowledges the mixed-level-of-analysis problem without disrupting existing inbound links. Phase 3 candidate.

## Cross-references

- `feedback_audit_scope_legacy_and_exploration` — glossary docs are docs/-territory but the glossary template is application code; this is application code
- `project_glossary_v5_synthesis` — original §10 design plan
- `feedback_public_facing_prose` — prose hygiene rule applies to any new §10 header
