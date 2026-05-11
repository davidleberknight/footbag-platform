# SCALE-1 Candidate Batch

First scalable enrichment wave. Lifts existing dictionary rows from "op-notation only" to "UX2 pilot prose" tier using the universal UX3 trick shell. **No ontology mutation. No new tricks. No new media ingestion.** Pilot prose only: `short_description`, `execution_summary`, `learning_notes`, `prerequisite_notes` on existing rows.

## Method

The candidate pool is the 16 rows with `operational_notation` already populated (the Wave-1/Wave-2 op-notation seed). Three of those (matador, mind-bender, montage) are already at UX2 pilot tier from W2c-D and are out of scope. That leaves **13 enrichment candidates** scored against the five priority criteria.

The shell now renders every UX2-pilot section data-driven (no per-slug allowlists), so any row receiving short_description plus the three prose columns immediately surfaces the full pilot experience: hero summary, featured-media empty state, three pilot prose sections, plus the existing semantic cluster (notation + operational + modifier-layering ≥ 3 only).

## Scoring criteria

| Criterion | What it measures | How read from DB |
|---|---|---|
| modifier_links clean | base + modifier rows resolve cleanly, no broken upstream | `COUNT(*)` on `freestyle_trick_modifier_links` joined back to dict |
| ADD formula clean | row's `adds` matches the modifier-stack composition | `adds` numeric; modifier_links resolve; no contested base |
| operational notation | already seeded; surfaces O1a/O1c warm-palette panel | `operational_notation IS NOT NULL` |
| family/navigation value | size of the row's family — larger family = more pages linking in | `COUNT(*)` over `trick_family` |
| no Red dependency | no Red curator-track provenance, no pt## attribution leakage | grep `operational_notation_source` + `description` for forbidden terms |
| no federation conflict | no FootbagMoves ↔ IFPA canonical-name divergence pending adjudication | `operational_notation_source` mentions of "FM canonical name: X" |

## Candidate table

13 non-pilot op-notation rows, sorted by ADD ascending. Family-size column is the in-DB size of the named `trick_family` (the user-navigation proxy). All 13 carry `Source: FootbagMoves.com.` in `operational_notation_source`; only two carry an ontology/federation note in addition.

| slug | ADD | family | fam-size | mod-links | op-notation | prose | media | risk | action |
|---|---|---|---|---|---|---|---|---|---|
| tap | 3 | mirage | 11 | 1 | Y | – | – | LOW | enrich (batch 1) |
| legeater | 3 | pickup | 5 | 1 | Y | – | – | LOW | enrich (batch 1) |
| paste | 3 | pickup | 5 | 1 | Y | – | – | LOW | enrich (batch 1) |
| scrambled-eggbeater | 3 | pickup | 5 | 1 | Y | – | – | LOW | enrich (batch 1) |
| hatchet | 4 | whirl | 17 | 1 | Y | – | – | LOW | enrich (batch 1) |
| tripwalk | 4 | butterfly | 12 | 1 | Y | – | – | LOW | enrich (batch 1) |
| pigbeater | 4 | legover | 7 | 1 | Y | – | – | LOW | enrich (batch 1) |
| spinal-tap | 5 | torque | 8 | 1 | Y | – | – | LOW | enrich (batch 1) |
| phoenix | 5 | butterfly | 12 | 2 | Y | – | – | LOW | enrich (batch 1) |
| spender | 6 | blender | 4 | 2 | Y | – | – | LOW | enrich (batch 1) |
| mullet | 6 | whirl | 17 | 3 | Y | – | – | LOW | defer → SCALE-2 |
| barfly | 4 | infinity | 1 | 0 | Y | – | 2 | HIGH | defer (federation) |
| blur | 4 | mirage | 11 | 1 | Y | – | 1 | HIGH | defer (ontology) |

### Risk notes for the three deferrals

- **barfly** — `operational_notation_source` reads `FM canonical name: 'Far Double Over Down'`. FM↔IFPA naming divergence is unresolved, and memory's `project_freestyle_federation` flags Barfry SS for pt12 with the Red SS_SEMANTICS packet still drafted. Enriching now would freeze prose against a contested label. Wait for federation resolution.
- **blur** — provenance line transcribes an explicit ontology conflict (FM `Blurry Mirage` single-modifier reading vs. IFPA `Stepping Paradox Mirage` two-modifier reading; both reach ADD = 4 by different decompositions). pt10 just shifted blur's canonical naming. Pilot prose written now risks immediate stale-out.
- **mullet** — three modifier links; activates the modifier-layering panel like Montage. Not a risk per se, just outside SCALE-1's "single-modifier-or-pair" comfort zone. Promote in SCALE-2 once SCALE-1's prose patterns are validated.

## Recommended first batch of 10

Selected for coverage across ADD tiers (3/4/5/6), spread across families (no one family dominates), and pedagogical pairing opportunities with already-pilot rows.

| # | slug | ADD | family | pairs with already-pilot row | reason |
|---|---|---|---|---|---|
| 1 | tap | 3 | mirage | – | mirage family has 11 rows; tap is the entry-level compound — high navigation lift |
| 2 | legeater | 3 | pickup | – | pickup-family cluster (3-of-5 candidates share pickup); enriching all three turns a thin family into a complete tier |
| 3 | paste | 3 | pickup | – | pickup cluster — same justification |
| 4 | scrambled-eggbeater | 3 | pickup | – | pickup cluster — same justification |
| 5 | hatchet | 4 | whirl | montage (same family) | whirl is the largest family at 17 rows; hatchet at 4 ADD anchors the mid-tier |
| 6 | tripwalk | 4 | butterfly | matador, phoenix (same family) | butterfly already has matador (pilot) + phoenix (this batch); tripwalk completes the 4-ADD slot |
| 7 | pigbeater | 4 | legover | – | the Wave-1 loader-19 incident row per memory `feedback_loader_19_family_default` — well-understood data; safe enrichment |
| 8 | spinal-tap | 5 | torque | – | only torque candidate; fills the family gap |
| 9 | phoenix | 5 | butterfly | matador (same family) | 2 modifier links exercises the new decomp-strip threshold (now ≥ 1); pairs with matador on butterfly base |
| 10 | spender | 6 | blender | mind-bender (same family) | per memory `project_freestyle_state`, Spender↔Mind-Bender is an active pedagogical pair — enriching spender completes the cluster |

## What "enrichment" means in SCALE-1

For each of the 10 rows, author and load four prose fields onto the existing dictionary row:

1. **short_description** — one-sentence elevator pitch, renders in hero `summary` slot.
2. **execution_summary** — plain-English mechanics, multi-paragraph (service splits on `\n\n`).
3. **learning_notes** — gotchas + progression tips, multi-paragraph.
4. **prerequisite_notes** — prereq prose, falls back to "Previous Tricks" anchor when absent.

These four columns already exist (UX3b1 schema migration). Loader-19 already supports them. The trick-shell already renders them when populated. No code change required for SCALE-1.

**Out of scope for SCALE-1:**
- No edits to `canonical_name`, `adds`, `base_trick`, `trick_family`, `modifier_links`, `operational_notation`, `aliases_json`. The ontology is frozen for this wave.
- No new rows in `freestyle_tricks`.
- No new media linking; the featured-media empty-state remains visible until a separate curated-media pass runs.
- No re-enabling of the Modifier Reference panel (still hidden per `feedback_modifier_public_visibility.md`).
- No editorial passes on already-pilot rows (matador, mind-bender, montage) — they are stable.

## Sequencing (proposed, not yet approved)

1. SCALE-1a — author prose drafts for the 10 rows (offline). Surface as a single review packet.
2. SCALE-1b — human review of all 10 drafts together; apply per-row corrections.
3. SCALE-1c — load via loader-19 in a single DELETE+INSERT pass scoped to the 10 slugs.
4. SCALE-1d — HTML QC pass on the 10 enriched pages (forbidden-term audit + section-order + density tier classification).
5. SCALE-1e — IP entry + memory update.

Loader-19's existing `SOURCE_ASSERTABLE_FIELDS` already cover the four prose columns; no schema or loader change needed.

## Deferred (post-SCALE-1)

| slug | reason | unblock condition |
|---|---|---|
| mullet | 3-modifier complexity outside SCALE-1 comfort zone | SCALE-1 lands cleanly; promote to SCALE-2 |
| barfly | FM↔IFPA naming divergence + pt12 Barfry SS pending | federation resolution; Red SS_SEMANTICS packet adjudicated |
| blur | pt10 ontology shift; FM↔IFPA two-reading conflict transcribed in op-source | ontology stabilizes; one canonical reading wins or the page learns to render both |

## Out-of-pool (additional candidates beyond the 16 op-notation rows)

Per the user's "do NOT broaden media ingestion" and "operational notation available" criteria, SCALE-1 stays scoped to the existing op-notation seed. Once SCALE-1 lands, the next questions become:
- Should op-notation seeding be the next bottleneck to scale? Currently 16 of 160 rows (10%) carry op-notation.
- Should pilot prose precede op-notation, or wait for it? Today the shell renders sparse rows cleanly without either; prose enrichment alone is valuable.
- Are there top-family rows (e.g. blur, swirl, hyper-blur, atomic-blur) that should be added to the op-notation pool before SCALE-2?

These are SCALE-2 design questions, not SCALE-1 selection questions. Out of scope here.

## Files produced

- `exploration/freestyle-notation-grammar/SCALE1_CANDIDATE_BATCH.md` (this report)
- `exploration/freestyle-notation-grammar/SCALE1_ACTION_MATRIX.csv` (machine-readable matrix)

No DB writes. No code changes. No new rows. No new media.
