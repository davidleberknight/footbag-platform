# PassBack Conflict Recommendations (PASSBACK-GRAMMAR-2 / Part B)

Companion analysis for `PASSBACK_CONFLICT_MATRIX.csv`. Sorts the 14 catalogued
conflicts into action lanes and identifies which ones block promotions vs which
can stay open.

## Conflict triage

### Lane 1 — Low-risk; resolvable immediately

These conflicts have settled rulings or trivial data-curation fixes; no Red
needed.

| id | conflict | proposed action |
|---|---|---|
| C1 | Hurl / Barfry / Godzilla Nuclear-ss math | **Resolved** under SS ruling (Red 2026-05-11). Documented in `FM_MATH_DIVERGENCES.csv`. No further action. |
| C4 | Fury — FM=6 vs IFPA=5 | **Documented** under pt6 ruling (fury=furious+paradox+mirage=5). FM-data noise; preserve as folk-alias. No further action. |
| C5 | Curated extract vs authoritative inventory on Barfry's operator string | **Single curation patch** — align `fm_alias_terminology_extract.csv` to authoritative inventory ("Nuclear ss Butterfly", not "Nuclear far Butterfly"). One-line edit. |
| C6 | Slicing — two Sets-tab definitions | **FM-side issue**, not IFPA's. Document the polysemy; do not adopt either reading until FM clarifies. |
| C13 | Temporal qualifiers (uptime/downtime/midtime) scraper gap | **Workable as-is**. Temporal flags are descriptive; scraper coverage is lossy but acceptable until an educational surface decision. F2-C improvement deferred. |
| C14 | Blender's `trick_family=osis` vs page chip "blender family" | **Resolved** during SCALE-3 by prose framing on the blender page. No further action. |

### Lane 2 — Defer to Red (atomic questions; see `RED_PACKET_PRIORITY_QUEUE.md`)

| id | conflict | Red question candidate |
|---|---|---|
| C2 | Omelette — FM=4 vs IFPA=3 | Q-CANDIDATE-1: atomic+illusion math (is illusion's ADD 3 or 4? is FM's "Atomic Illusion = 4" a recursive-decomposition case?) |
| C3 | Terrage — FM=3 vs IFPA=4 | Q-CANDIDATE-2: double-pixie semantics (does FM's "Double Pixie" decomposition reach 3, and what does IFPA reach via its current decomposition?) |
| C7 | Blurry-Whirl / Blurry-Torque pt12 math conflict | Already pt12 item 1+2; not new. Folded into Red Q-PT12-1 (Blurry on rotational bases). |
| C8 | Food Processor — blurry+blender ADD gap | Already pt12 item 5b. Same class as C7. |
| C9 | Q4 FM-vocab modifiers (fairy/gyro/blazing/etc.) | Already drafted as Q4 in earlier packet (`RED_PT12_PACKET_Q1_Q4.md`). Atomic; remains separate. |

### Lane 3 — Ontology-expansion-needed (Phase 2 question; not Red yet)

| id | conflict | scope |
|---|---|---|
| C10 | Operator inheritance — Sets-tab recursive definitions (Slaying = Symp Sailing = ...) | If IFPA wants to expose recursive modifier compositions in the educational glossary, this is the design question. Phase 2 of FM grammar work. |
| C11 | near / far / op / os ADD weight | Pattern is consistent (0 ADD); formal ruling deferrable. Could batch with C12 into a single "positional operators have 0 ADD" packet. |
| C12 | Reverse direction operator ADD weight | Same class as C11. Reverse Whirl = 3 ADD, Reverse Blender = 4 ADD (Dyno), Reverse Torque = 4 ADD (Flux) — pattern is 0 ADD across the corpus. |

### Lane 4 — Observational-only (never become canonical)

| id | conflict | rationale |
|---|---|---|
| (broader) | Temporal qualifiers (uptime/downtime/midtime) | Descriptive only; describe body's vertical state at entry; no ADD weight inferable; should not enter IFPA modifier table. |
| (broader) | Positional operators (far/near/op/os, set as positional shorthand) | Purely geometric; consistent 0 ADD across corpus; should not enter modifier table. |
| (broader) | FM display-name "(same side)" suffix | Per SS ruling, this suffix is descriptive only. |

## Promotion-blocker analysis

Which conflicts block which SCALE-N+ promotions?

| conflict | blocks | unblocks via |
|---|---|---|
| C2 (Omelette delta) | atomic-illusion promotion to pilot | Red Q-CANDIDATE-1 |
| C3 (Terrage delta) | terrage promotion | Red Q-CANDIDATE-2 |
| C7 (Blurry-Whirl pt12) | blurry-whirl promotion (SCALE-3 deferral) | Red pt12 |
| C8 (Food Processor) | food-processor promotion (SCALE-3 deferral) | Red pt12 |
| C9 (Q4 FM-vocab) | Casket / Flaming Homer / Glaucoma / Park Avenue / Leaning Jowler / Phase / etc. (fairy + other FM-vocab compounds) | Red Q4 packet |

All other conflicts (C1, C4, C5, C6, C10, C11, C12, C13, C14) do NOT block
any current promotion track.

## Net promotion impact

After applying the recommendations above:
- **Lane 1 (resolve now)**: clears 6 conflicts from active tracking; one
  curation-patch needed (C5).
- **Lane 2 (defer to Red)**: 5 conflicts wait on existing or new Red questions;
  2 of those are *new* questions (Q-CANDIDATE-1 + Q-CANDIDATE-2).
- **Lane 3 (Phase 2)**: 3 conflicts are deferrable indefinitely without
  blocking promotion work.
- **Lane 4 (observational-only)**: no further action needed; these are
  permanent descriptive surface.

**No active blocker prevents SCALE-5 from proceeding.** SCALE-5 candidates
(see `FLAGSHIP_PROMOTION_SHORTLIST.csv`) span LOW-risk rows where conflicts
do not apply.

## Recommended next actions

1. **(Optional, low-priority)** Curation patch on
   `legacy_data/inputs/curated/tricks/fm_alias_terminology_extract.csv` to align Barfry's
   operator string with the authoritative inventory.
2. **(Phase B output)** Approve the 6 safe-alias inserts from `PASSBACK_ALIAS_CANDIDATES.csv`
   (separate human-approval gate; minimal SQL patch).
3. **(Phase C output)** Review `RED_PACKET_TOP3.md` for the 3 highest-leverage
   new Red questions (Omelette, Terrage, + one operator-class question).
4. **(Phase D output)** Choose SCALE-5 batch from `FLAGSHIP_PROMOTION_SHORTLIST.csv`.

## What this analysis does NOT do

- Does not execute any curation patch.
- Does not approve alias inserts.
- Does not dispatch Red questions.
- Does not commit to a Phase 2 ontology expansion.
- Does not classify the 472 observational-only FM rows (sampled, not enumerated).
