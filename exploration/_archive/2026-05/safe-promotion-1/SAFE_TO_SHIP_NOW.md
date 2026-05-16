# Safe-to-Ship-Now Recommendations

SAFE-PROMOTION-1 output. Generated 2026-05-14, mid-Wave-1-pending state.

Premise: maintain forward momentum without expanding ontology while Red Wave 1 is in flight. The four-tier disposition below names each candidate's status; the only "ship now" items are pure documentation of already-resolved canon and rendering verification on already-locked chains. Everything ontology-adjacent waits.

Restraint principle (per [[feedback_frequency_not_authority]]): recurrence in PB / FM corpora is evidence, not authority. Where one ruling could close many rows, leverage favors batching the question into Wave 1/2; not pre-resolving it locally.

## Tier S -- Ship now (no Red dependency; no ontology expansion)

These items document canon that is ALREADY resolved per `RED_RESOLVED_CANON.md`. Shipping them does not introduce new ADD weights, operator classes, or decomposition claims.

### S1 -- Add Inspinning to the NF-2A operator-reference

`freestyleOperatorReference.ts` currently holds 9 entries (atomic, blurry, quantum, nuclear, barraging, furious, whirling, double, high). Inspinning is missing. Per `RED_RESOLVED_CANON.md` B.4, Inspinning is locked at +0 directional via pt3 + pt7 (Spinning-direction-variant; pt7 confirmed Spinning variants stack as modifiers).

The `NF2A_CANDIDATE_QUEUE.csv` analyzer comment "ADD weight by analogy to Spinning (+1)" is INCORRECT against resolved canon. Reconcile both: ship the NF-2A entry at +0 citing pt3 + pt7, and correct the queue annotation.

- Ontology risk: low
- Pedagogical value: high (surfaces the Spinning-defaults-to-Backspin invariant)
- Blocked-by: nothing
- Source citation: RED_RESOLVED_CANON.md B.4

### S2 -- Verify NF-2B equivalence-chain rendering on 12 already-locked tricks

The equivalence chains below are pt-canonical. Each should render on its trick page as a labeled equivalence-chain block. This is a rendering-coverage check, not a canon change.

| Slug | Chain | Source |
|---|---|---|
| atom-smasher | Atomic Mirage | pt1+pt2+pt10 |
| blender | Whirling Osis | pt11 |
| blur | Stepping Paradox Mirage | pt11 |
| drifter | Miraging Clipper | pt11 |
| eggbeater | Atomic Legover | pt4 |
| fury | Furious Paradox Mirage | pt6 |
| mobius | Spinning Torque | pt11 |
| omelette | Atomic Illusion | pt2+followup-2026-04 |
| ripwalk | Stepping Butterfly | pt11 |
| royale | Paradox Reverse Drifter (= Paradox Grifter) | pt5 |
| sumo | Nuclear Mirage | pt4+pt9 |
| torque | Miraging Osis | pt11 |
| vortex | Gyro Drifter | pt1+pt2 |

Per-row action: open the trick page, confirm the NF-2B chain renders with the expected components and source citation. If a chain is missing or renders the wrong shape, the fix is rendering-layer (template / shaping helper); the canonical row in `freestyle_tricks` should NOT be edited.

- Ontology risk: low (pure rendering)
- Pedagogical value: high (NF-2B is the user-facing surface for the structural-legibility principle in `project_canonical_trick_publication_contract`)

### S3 -- Verify existing alias rows for already-canonical equivalences

Per `RED_RESOLVED_CANON.md` C.2, the following alias relationships are settled:

- Inspin → Spyro (pt2; not Inspinning)
- Symp / Symp. / Symple → Symposium (pt7)
- ATW → Around-the-World
- DLO → Double Legover (pt4)
- Whirling Osis → Blender (pt11) -- may or may not exist as a `freestyle_trick_aliases` row
- Miraging Clipper → Drifter (pt11) -- same
- Miraging Osis → Torque (pt11) -- same
- Spinning Torque → Mobius (pt11) -- same
- Stepping Butterfly → Ripwalk (pt11) -- same
- Paradox Reverse Drifter → Royale (pt5)
- Paradox Grifter → Royale (pt5)

Action: read `freestyle_trick_aliases` and check coverage. Where alias rows are missing, surface to the curator as a "pt-canonical alias missing from DB" list. Do NOT mass-import; this is a coverage report, not a write pass.

- Ontology risk: low
- Pedagogical value: medium

### S4 -- Reconcile pendingNote on the Furious NF-2A entry

The Furious entry in `freestyleOperatorReference.ts` should clearly cite that:
1. Non-rotational reading is Wave 1 Q1c (pending Red).
2. The pt6 derivation (Fury = Furious Paradox Mirage = 5) requires Furious = +2 on the rotational base (paradox-mirage).
3. The non-rotational case has no IFPA-side test trick yet.

If the existing pendingNote already covers this, no action. If not, update.

- Ontology risk: low (documentation of a known unresolved)
- Pedagogical value: medium

---

## Tier W -- Wait for Red (Wave 1 or Wave 2)

Everything below is blocked by a current Wave 1 question, a Wave 2 theme, or a cascading dependency on a Wave 1 outcome. Do not pre-resolve locally.

### W1 -- Wave 1 blockers

| Candidate | Blocked by | Closes when |
|---|---|---|
| witchdoctor ADD reconciliation | Wave 1 Q1 (rotational-bonus generalization) | Q1 ruling lands |
| barraging-osis (Baroque) stated vs computed | Wave 1 Q1 | same |
| blurry-whirl / blurry-torque / food-processor stated vs computed | Wave 1 Q1 | same |
| furious non-rotational | Wave 1 Q1c | Q1c ruling lands |
| fairy as modifier | Wave 1 Q2 + Q2a | Q2 ruling lands |
| gyro / barraging-FM / surging-FM / railing / flailing / splicing / surfing / neutron / blazing / smiling / twinspinning / spyro-as-mod | Wave 1 Q2 (Q4 batch) | Q2 ruling lands |
| reverse operator promotion | Wave 1 Q3.b | Q3.b ruling lands |
| far operator promotion | Wave 1 Q3.a | Q3.a ruling lands |
| 11-row systemic +1 gap (Atomsmasher, Blur, Drifter, Sumo, Fury, etc. PB literal decomp) | Wave 1 Q4 | Q4 ruling lands |
| flailing-as-Symposium-Atomic alias | Wave 1 Q2 (Q4 batch policy) | Q2 ruling |
| gyro-as-Spinning-ss alias | Wave 1 Q2 | Q2 ruling |

### W2 -- Wave 2 themes (deferred per `project_red_consultation_state`)

| Candidate | Wave 2 theme |
|---|---|
| frigidosis decomposition | Theme 2 (focus-trick) |
| witchdoctor decomposition | Theme 2 |
| scrambled-eggbeater status | Theme 2 |
| down-family canonicalization | Theme 6 |
| double-quantifier default policy | Theme 7 |
| frantic / leaning / hyper / sailing equivalence-chain educational promotion | Theme 8 |

### W3 -- Cascade-dependent

| Candidate | Cascade root |
|---|---|
| slaying-equivalence | Sailing resolution |
| riffing-equivalence | Blurry pt12 / Wave 1 Q1 |
| phasing-equivalence | Fairy Q4 / Wave 1 Q2a |
| smiling-equivalence | Swirling full decomposition (not currently a Wave question) |
| bling-blang equivalence | Reverse ADD weight / Wave 1 Q3.b |
| quasi-equivalence | far weight / Wave 1 Q3.a + Q4 |
| inspin vs spyro alias verification | trivially-resolvable; folded into S3 |

### W4 -- Cross-source-conflicted

| Candidate | Conflict | Surface to |
|---|---|---|
| sailing | legacy Move Sets says `Pixie Illusion`; FM Sets-tab says `Pixie Atomic` | curator triage before Wave 2 |
| pogo equivalence | pt2+pt6 settled Pogo as sui-generis set; FM Sets-tab reads it as `Uptime ATW`; surfacing FM reading risks contradicting settled canon | curator decision: keep pt2 reading or document FM reading as alternative |

---

## Tier N -- Never promote

These items have structural reasons -- not corpus reasons -- to remain out of canon. Even high-frequency observation does not change the disposition.

| Candidate | Reason |
|---|---|
| dragon as modifier | Polysemy across modifier / surface / suffix roles; dragon-as-surface is a separate question worth a glossary entry, but dragon-as-modifier is not promotable |
| bubba as modifier | Patronymic (community-member-named); 4 obs; not generalizable as canon |
| jolimont as modifier | Toponym; singleton; not generalizable |
| spyro as modifier | Heavy author-attachment (Alex Zerbe canon-handle); pt1 settled Spyro as standalone body element at 1 ADD; modifier reading risks community drift away from the body-element reading |

These four are the load-bearing "frequency-is-not-authority" cases. Document them in the curator's no-promote list so they don't resurface under future corpus-recurrence pressure.

---

## Tier E -- Educational-only (cross-reference; never promote to canon)

Items that have FM-side compositional readings useful for educational decomposition but would not benefit from canonization. These live in the educational glossary layer (per [[project_glossary_v5_synthesis]] and the four-layer separation forever-rule) and never raise to operator-reference or canonical trick rows.

Currently EMPTY pending Wave 1 Q2 outcome. If Wave 1 Q2 picks option A (reject all 14 FM-vocab modifiers), the following become Tier E candidates:

- Fairy as FM compositional convention (cross-reference: FM uses `Fairy ss <base>` pattern; IFPA does not adopt; folk-evidence only)
- Frantic as FM compositional convention (= `Pixie Quantum` stack; expand on access; no operator entry)
- Sailing as FM compositional convention (DEFERRED -- needs source-conflict resolution first)
- Hyper as FM compositional convention (= `Rooted Pixie`; pt8 Rooted=0 makes the expansion meaningful even without operator-table promotion)
- Leaning as FM compositional convention (= `Stepping Inspinning`; Inspinning already canon after S1)

If Wave 1 Q2 picks B or C (per-operator or accept-all), redistribute these accordingly. Until then, Tier E remains an empty bucket -- do not pre-populate it.

---

## Cross-references

- [[feedback_frequency_not_authority]] -- governance principle this list operationalizes
- [[project_red_consultation_state]] -- Wave 1 packet + pause condition
- [[project_canonical_trick_publication_contract]] -- six requirements gating canonical promotion; the Tier S items satisfy all six because they document already-canonical rows; Tier W items would fail principle 6 (no fabricated structure)
- `exploration/red-consolidation/RED_RESOLVED_CANON.md` -- source for every Tier S citation
- `exploration/passback-fbm-symbolic-analysis/NF2A_CANDIDATE_QUEUE.csv` -- evidence base for Tier W deferrals
- `exploration/passback-fbm-symbolic-analysis/SEMANTIC_MACRO_PROPOSALS.md` -- semantic-macro analysis (deferrals on M2 / M3 / M4 / M7 align with this list)
- `exploration/add-conflict-audit/DO_NOT_TOUCH_LIST.md` -- preservation rules for the ADD audit

---

## Estimated forward motion if Tier S ships

- S1 closes one pt3+pt7 canon-coverage gap; downstream effect: any trick involving `Inspinning` (Leaning future Wave 2; existing pt2 spinning-direction-variant tricks) has a documented operator to point to.
- S2 verifies rendering on ~12 already-locked rows; expected outcome is "all 12 already render" or a small list of fixes; either way no new canon.
- S3 verifies alias-row coverage on ~11 settled pt-canonical aliases; expected outcome is mostly coverage with a few missing rows for curator review.
- S4 cosmetically improves the pending-Red documentation on the Furious entry.

None of these are individually large. Collectively they remove a small amount of structural-legibility friction without expanding ontology while Wave 1 is in flight. That is the intended shape of forward motion during a Red-pending window.

---

## What this list does NOT recommend

- No DB writes.
- No canonical-CSV mutation.
- No new operator add_bonus rows.
- No mass alias import.
- No parser behavior change.
- No formula-table extension.
- No decomposition-depth auto-expansion.
- No promotion of any Q4 FM-vocab term.
- No pre-resolution of any Wave 1 question.

Restraint is the deliverable. The next material expansion happens after Red replies to Wave 1.
