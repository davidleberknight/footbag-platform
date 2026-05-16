# SCALE-5d Prose Cadence QC

Post-load 6-axis cadence audit on the 10 SCALE-5 operator-bridge rows.
Pre-write cadence-design discipline caught the short_description and
execution_summary patterns cleanly (both clean at the strict 2-word /
3-word opener test) but the learning_notes section has a templated tell
worth fixing.

## Verdict

**ACCEPTABLE with one targeted rewrite wave.** SCALE-5 lands cleaner than
SCALE-1 (which had 8/10 templated openers and 9/10 formulaic
short_descriptions) but doesn't quite match SCALE-2's zero-rewrite outcome.
Two patterns warrant attention:

1. **`Practitioners with clean X tend to…` (4/10 learning_notes)** — HIGH-value rewrite
2. **`is the foundation` (3x prereqs strict + 1x variant)** — MEDIUM-value; right at SCALE-1's 3x budget

Other findings (within budget):
- `the body` 3x exec opener (acceptable; SCALE-2 ran 5x)
- `tend to` verb 7x across all rows (consequence of #1 + general coaching idiom; rewriting #1 drops it to 3-4x)
- `Butterfly (3 ADD)` 3x in prereqs (structural prereq citation, acceptable)
- `Mirage (2 ADD)` 2x in prereqs (structural; acceptable)
- `Clipper-stall (2 ADD)` 2x in prereqs (structural; acceptable)
- `Spinning-whirl (4 ADD, pilot from SCALE-2)` 2x in prereqs (structural; acceptable)

## Load + render confirmation (SCALE-5c)

| slug | h1 | hero sum | exec | learn | prereq | decomp |
|---|---|---|---|---|---|---|
| drifter | Drifter | ✓ | ✓ | ✓ | ✓ | – (0 mod, base) |
| ducking-clipper | Ducking Clipper | ✓ | ✓ | ✓ | ✓ | ✓ |
| paradox-mirage | Paradox Mirage | ✓ | ✓ | ✓ | ✓ | ✓ |
| smear | Smear | ✓ | ✓ | ✓ | ✓ | ✓ |
| ducking-butterfly | Ducking Butterfly | ✓ | ✓ | ✓ | ✓ | ✓ |
| ducking-osis | Ducking Osis | ✓ | ✓ | ✓ | ✓ | ✓ |
| ripwalk | Ripwalk | ✓ | ✓ | ✓ | ✓ | ✓ |
| spinning-butterfly | Spinning Butterfly | ✓ | ✓ | ✓ | ✓ | ✓ |
| paradox-drifter | Paradox Drifter | ✓ | ✓ | ✓ | ✓ | ✓ |
| spinning-torque | Spinning Torque | ✓ | ✓ | ✓ | ✓ | ✓ |

Forbidden-term audit: 0 hits. Pilot tier 25 → **37 / 160**.

## Issue 1 — `Practitioners with clean X tend to…` 4x

Templated opening of the failure-mode framing in 4 learning_notes:

| row | current opening |
|---|---|
| ducking-osis | *Practitioners with clean osis tend to keep the body upright through the rotation…* |
| paradox-drifter | *Practitioners with clean drifter tend to let the rotation carry through…* |
| paradox-mirage | *Practitioners with clean mirage tend to let the body settle naturally…* |
| smear | *Practitioners with clean mirage tend to over-rotate the first kick…* |

The construction "Practitioners with clean X tend to..." is a coaching
template that compresses information well but reads formulaic at 4x.

### Proposed rewrites

| row | proposed learning_notes (full) |
|---|---|
| **ducking-osis** | Osis's stall posture wants a tall body; ducking-osis flips that. A common miss is keeping the body upright through the rotation and adding the duck at one endpoint — the compression must hold across both kicks, as a frame rather than a beat. |
| **paradox-drifter** | Drifter's rotation drifts the body opposite-side at landing; paradox asks for the opposite. The wrong-timing miss is letting the rotation carry through and adding a same-side body adjustment at recovery — by then it's late. The paradox commits during the rotation, not after. |
| **paradox-mirage** | Clean mirage finishes with the body drifted opposite-side; paradox-mirage asks the opposite. The body wants to settle naturally; the paradox direction must be a deliberate body choice before the kick lands. |
| **smear** | The pixie opener is closer to the body than mirage instinct expects. The natural outside-reach habit from clean mirage over-rotates the first kick; keep the same-inside compact. The wing belongs to the second kick, not the first. |

Result: 4 distinct learning-note opening patterns (Osis's…, Drifter's…, Clean mirage…, The pixie…). `tend to` count drops from 7 to ~3.

## Issue 2 — `is the foundation` 3x (right at budget)

Three prereqs use this exact phrase. SCALE-1's audit accepted 3x for `is the foundation`; this batch is at the same level. Marginal — could leave alone, but a one-pattern-per-batch budget is tighter.

| row | current prereq opening |
|---|---|
| ducking-butterfly | *Butterfly (3 ADD) is the foundation.* |
| ducking-clipper | *Clipper-stall (2 ADD) is the foundation.* |
| ripwalk | *Butterfly (3 ADD) is the foundation.* |

### Optional rewrites (defer if user prefers minimal-churn)

| row | proposed prereq opening |
|---|---|
| **ducking-butterfly** | Butterfly (3 ADD) carries the wing pattern. The ducking bridge — … |
| **ducking-clipper** | Clipper-stall (2 ADD) is the entry surface. Ducking-clipper is the simplest ducking compound; … |
| **ripwalk** | Butterfly (3 ADD) carries the wing pattern. Stepping-whirl (4 ADD, pilot from SCALE-2) gives the foot-relocation feel … |

Same factual content; different verb structure each time.

## Comparison across waves

| metric | SCALE-1 pre-rewrite | SCALE-2 (no rewrites) | SCALE-5 (this batch) |
|---|---|---|---|
| Strongest opener tell | `From a toe set` 8/10 | clean | `Practitioners with clean` 4/10 |
| Formulaic short_description | 9/10 | 0/10 | 0/10 |
| `the body` exec opener | 10/10 | 5/10 | 3/10 |
| Coaching idiom (`is the foundation`) | 3x | 1x | 3x (+1 variant) |
| `tend to` verb | 4x | 1x | 7x |

SCALE-5 didn't quite match SCALE-2's bar but is materially cleaner than
SCALE-1. The pre-write discipline did most of the work; one tighter
rewrite pass clears the remaining tell.

## Recommended rewrite scope

**Option A — minimal (4 rewrites)**: fix Issue 1 only.

- 4 learning_notes rewrites (ducking-osis, paradox-drifter, paradox-mirage, smear)
- Drops `Practitioners with clean` from 4x to 0; `tend to` from 7x to ~3x
- Leaves `is the foundation` 3x as within SCALE-1 precedent

**Option B — thorough (7 rewrites)**: fix Issue 1 + Issue 2.

- The 4 from Option A plus 3 prereq rewrites (ducking-butterfly, ducking-clipper, ripwalk)
- Drops `is the foundation` from 3x to 0x
- Closer to SCALE-2's zero-tell outcome

**Recommendation: Option A.** Issue 2 is borderline and SCALE-1 set the precedent that 3x for a coaching idiom is acceptable.

## Apply pipeline (queued)

If you approve a rewrite wave:

1. Read-only diagnostic — confirm pre-state matches SCALE-5c values.
2. Audit CSV — capture pre-rewrite values for the affected fields.
3. Rollback SQL — restores SCALE-5c values.
4. Transactional UPDATE — N rows, M fields each (depending on option).
5. Re-capture HTML for affected pages.
6. Re-run cadence audit; confirm no pattern exceeds budget.

## Files produced

- `exploration/freestyle-notation-grammar/SCALE5_PROSE_CADENCE_QC.md` (this report)

Apply-pass artifacts from SCALE-5c (in place):
- `legacy_data/reports/scale5/scale5_load_audit_pre.csv` — pre-load state (all NULL)
- `legacy_data/reports/scale5/scale5_load_rollback.sql` — restore-NULL rollback
- `legacy_data/reports/html_qc/scale5/{slug}.html` — 10 post-load snapshots

No second-pass DB writes yet. Awaiting user direction on Option A vs B vs no-rewrite.
