# SCALE-1d Prose Cadence QC

Post-load QC pass across the 10 newly enriched SCALE-1 rows. Focus: does the
dictionary read as *authored*, or as templated output? The five-axis cadence
audit (repeated sentence openings, repeated explanatory rhythm, repeated
coaching phrases, paragraph cadence, family-description redundancy) finds two
high-value issues worth fixing and a handful of acceptable repetitions that
should be left alone.

## Verdict

**Acceptable with one targeted fix wave.** The drafts pass the forbidden-term audit, render correctly through the universal shell, and read as informed coaching at the row level. Cross-row cadence has one clear templated tell (eight of ten execution paragraphs open with the identical four words) and one mild templated tell (eight of ten short-descriptions follow the formula `A N-ADD <family> compound...`). Fixing the first is high-value; fixing the second is medium-value and tractable in the same pass. Everything else is family-vocabulary or coaching-idiom repetition that earns its place.

## Load + render confirmation (SCALE-1c)

| slug | h1 | hero summary | exec section | learning section | prereq section | decomp strip |
|---|---|---|---|---|---|---|
| tap | Tap | yes | yes | yes | yes | yes |
| legeater | Legeater | yes | yes | yes | yes | yes |
| paste | Paste | yes | yes | yes | yes | yes |
| scrambled-eggbeater | Scrambled Eggbeater | yes | yes | yes | yes | yes |
| hatchet | Hatchet | yes | yes | yes | yes | yes |
| tripwalk | Tripwalk | yes | yes | yes | yes | yes |
| pigbeater | Pigbeater | yes | yes | yes | yes | yes |
| spinal-tap | Spinal Tap | yes | yes | yes | yes | yes |
| phoenix | Phoenix | yes | yes | yes | yes | yes |
| spender | Spender | yes | yes | yes | yes | yes |

Forbidden-term audit clean across all 10 rendered pages. Section ordering uniform
with the rest of the shell. Hero decomposition strip activates on every row
(every batch member has at least one modifier link).

## Cadence findings — high-value issues

### Issue 1 — `From a toe set` opens 8/10 execution_summary fields

This is the single strongest templated tell. Eight execution_summary fields open
with `From a toe set`; one opens with `From a clipper set`. The four-word opener
is identical in 8/10 cases.

| slug | current opening |
|---|---|
| tap | *From a toe set, drive an opposite-side outside dex* |
| legeater | *From a toe set, the first kick comes opposite-inside* |
| paste | *From a toe set, the first kick strikes same-side inside* |
| scrambled-eggbeater | *From a toe set, the first kick reaches opposite-side outside* |
| tripwalk | *From a toe set, the first kick strikes opposite-side inside* |
| pigbeater | *From a toe set, the first kick strikes same-side inside* |
| spinal-tap | *From a toe set, the first kick drives opposite-outside* |
| phoenix | *From a toe set, the first kick strikes same-side inside (pixie)* |

The underlying mechanic genuinely is toe-set-first on these eight rows — but the
draftsman's choice of word order is what reads as templated, not the mechanic.

**Recommended fix.** Vary the opener on 5–6 of the 8, preserving the toe-set
mechanic anchor on at most 2–3 (the simplest cases). Keep the changes inside
execution_summary; do not propagate to short_description or prerequisite_notes.

**Proposed re-openings** (before → after, execution_summary first sentence only):

| slug | after |
|---|---|
| tap | *(keep)* From a toe set, drive an opposite-side outside dex, then bring the body across for a same-side inside dex; finish on an opposite-side toe delay. |
| legeater | **After the toe set,** the first kick comes opposite-inside and crosses through the supporting leg; the second kick continues opposite-inside before the body shifts back for a same-side toe delay. |
| paste | **The opening kick lands same-side inside, sending the bag behind the supporting leg.** The body opens for an opposite-side inside dex on the second kick, then closes with a same-side toe delay. |
| scrambled-eggbeater | **The atomic set reaches opposite-side outside on the first kick** — the widest opener of the pickup-family compounds. The body settles back across for an opposite-side inside dex, then closes with a same-side toe delay. |
| tripwalk | **The opening dex strikes opposite-side inside** — a tight kick that crosses the body line before the wing opens. The second kick reaches opposite-side outside in the canonical butterfly wing motion, landing in an opposite-side clipper cross-body delay. |
| pigbeater | **Toe set, then same-inside: the pixie opener sends the bag behind the supporting leg.** The next two kicks both reach opposite-outside in eggbeater's characteristic double-out pattern, then the body resets for a same-side toe delay. |
| spinal-tap | **The first kick drives opposite-outside as the body initiates rotation.** The same-inside second kick lands as the body completes a front-facing spin, then the supporting leg crosses for an opposite-clipper delay. |
| phoenix | **The first kick strikes same-side inside (pixie); the body then drops into a ducking compression,** holding low as the second kick reaches opposite-outside in the canonical butterfly wing. Recovery is an opposite-clipper cross-body delay. |

Result: 1 of 10 retains "From a toe set" (tap), 2 retain "From a clipper set"
(hatchet, spender, unchanged), 7 open with the mechanic itself.

### Issue 2 — `A N-ADD <family> compound` opens 9/10 short_description fields

Lower urgency, but a clear formulaic signature.

| slug | current opening |
|---|---|
| tap | *A 3-ADD mirage compound where...* |
| legeater | *A 3-ADD pickup compound where...* |
| paste | *A 3-ADD pickup compound opening with...* |
| scrambled-eggbeater | *A 3-ADD pickup compound that opens with...* |
| hatchet | *A 4-ADD whirl compound where...* |
| tripwalk | *A 4-ADD butterfly compound where...* |
| pigbeater | *A 4-ADD legover compound — eggbeater's three-kick pattern...* |
| spinal-tap | *A 5-ADD torque compound — the tap rhythm...* |
| phoenix | *A 5-ADD butterfly compound — pixie's same-inside opening...* |
| spender | *A 6-ADD blender compound — two body-spins...* |

The pickup-family triad (legeater / paste / scrambled-eggbeater) intentionally
clusters; that's pedagogical and should stay. The remaining seven all use the
same `A N-ADD <family> compound` formula. The hero ribbon already shows ADD +
family chips, so the short_description does not need to repeat both.

**Recommended fix.** Re-write 3–4 of the seven to lead with the mechanic or the
family-pair relationship instead. Keep the pickup triad intact.

**Proposed re-openings** (short_description rewrite only):

| slug | after |
|---|---|
| tap | *(keep)* A 3-ADD mirage compound where the tapping body action adds an extra accent between the two dex kicks of the mirage frame. |
| legeater | *(keep, pickup triad)* |
| paste | *(keep, pickup triad)* |
| scrambled-eggbeater | *(keep, pickup triad)* |
| hatchet | **The diving body modifier drops the head low through the whirl rotation before recovery into a cross-body clipper.** |
| tripwalk | *(keep)* A 4-ADD butterfly compound where the quantum set opens with an opposite-side inside dex before the standard butterfly outside-wing closes the trick. |
| pigbeater | **Eggbeater's three-kick pattern fronted by a pixie set that lifts the bag behind the planted leg — the only addition over its eggbeater parent.** |
| spinal-tap | **The tap rhythm from the mirage family extended through torque's body-spin frame and a cross-body clipper landing.** |
| phoenix | *(keep, descriptive opening is already strong)* |
| spender | **Two body-spins flank a paradox-direction whirl kick before the supporting leg crosses for a same-side clipper delay.** |

Result: short_descriptions now open with five distinct rhetorical patterns —
family-relationship (tap), formulaic (the three-row pickup cluster), mechanic-led
(hatchet, pigbeater, spender), set-modifier-led (tripwalk), sequence-led (phoenix),
cross-family-rhythm-led (spinal-tap).

## Cadence findings — acceptable repetition (no edit)

These appear in the audit but earn their place and should be left alone.

### `the body` — 10/10 fields

Body-mechanics vocabulary. The user's writing constraints explicitly call for
body-mechanics emphasis. Mentioning "the body" once or more in every
execution_summary is correct, not templated.

### `is the foundation` — 3x; `is the limiter` — 2x; `is the load-bearing` — 2x

Coaching idioms. Used once per row at most, with distinct referents:
- "is the foundation" → paste (pixie set), hatchet (whirl), tripwalk (butterfly)
- "is the limiter" → scrambled-eggbeater (first-kick reach), hatchet (dive timing)
- "is the load-bearing" → paste (pixie set is the differentiator), spinal-tap (torque's body-spin is the trick's frame)

Three or fewer hits across ten rows is within coaching-idiom budget.

### `most misses come from` — 2x (paste, phoenix)

Coaching idiom for diagnosing the failure mode. Two uses across ten rows. Fine.

### `Pickup (2 ADD)` opens all three pickup prereqs

Intentional pedagogical clustering — the pickup-family triad is a deliberate
batch grouping. Each variation uses a different completion ("establishes the
set + dex + stall frame", "is the foundation", "is the entry"). No edit.

### `before the wing` — 2x (tripwalk, phoenix)

Both are butterfly-family compounds and "wing" is the butterfly's mechanical
vocabulary. The repetition reinforces family coherence rather than feeling
templated.

### Family-description redundancy

Each row's family is named 2–4 times across the four sections, but in distinct
rhetorical roles each time (introducing the row, describing the mechanic,
comparing to peers, naming a prereq). No row reads as repeating itself; the
family vocabulary serves different jobs at each callout.

## Cadence findings — paragraph cadence

All ten execution_summary fields are single-paragraph (50–64 words). All ten
learning_notes and prerequisite_notes fields are single-paragraph (27–55 words).
No row has paragraph-bloat; no row uses a two-paragraph rhythm that another row
also uses. Cadence at the paragraph level is varied because the prose is short
enough that one paragraph carries the whole section.

## Recommended apply (single targeted re-write wave)

If approved, do all the Issue-1 + Issue-2 re-writes in one DB-write pass:

1. Read-only diagnostic: confirm pre-state matches what we expect (the prose
   loaded in SCALE-1c is intact).
2. Generate audit CSV (pre-edit values for the 10 short_description + 10
   execution_summary fields).
3. Generate rollback SQL (restores SCALE-1c values).
4. Apply 8 updates in a transaction:
   - 7 execution_summary re-writes (keeps tap; updates legeater, paste, scrambled-eggbeater, tripwalk, pigbeater, spinal-tap, phoenix)
   - 4 short_description re-writes (hatchet, pigbeater, spinal-tap, spender)
5. Re-capture HTML for the 10 pages.
6. Run the cadence audit again; confirm no opener appears more than 3 times.

**Scope discipline.** Do not touch learning_notes or prerequisite_notes in this
pass — those have already passed the audit. Do not extend the batch. Do not
broaden to other tricks.

## Files produced

- `exploration/freestyle-notation-grammar/SCALE1_PROSE_CADENCE_QC.md` (this report)

Apply-pass artifacts produced in SCALE-1c:
- `legacy_data/reports/scale1/scale1_load_audit_pre.csv` — pre-load state (all empty)
- `legacy_data/reports/scale1/scale1_load_rollback.sql` — rollback to pre-load state
- `legacy_data/reports/html_qc/scale1/{slug}.html` — post-load HTML snapshots for the 10 rows

## Outstanding (post-cadence-fix, deferred)

- **SCALE-1e** — IP entry + memory update. Pending approval of the cadence re-writes.
- **SCALE-2 candidate selection** — once SCALE-1 is closed and validated, choose
  the next 10–20. The deferred-from-SCALE-1 list (mullet, barfly, blur) and the
  144 non-op-notation dictionary rows are the next candidate pools.

No DB writes in this turn. No code or template changes. The proposed re-write
wave is queued and waiting on approval before SCALE-1d closes.
