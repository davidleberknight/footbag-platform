# Revised Frontier Taxonomy — execution categories (2026-06-20)

Measures the remaining freestyle frontier by **execution blocker**, not by doctrine alone. The
project has transitioned from a doctrine bottleneck to an execution bottleneck; these six categories
are the resolution that bottleneck actually needs.

Two scopes: the **held band** (`is_active = 0`, 64 rows — the immediate promotion surface, **measured**)
and the **broader tracked frontier** (~1,375 tracked-name slugs — **estimated** from prior audits).

## Categories

| Category | Definition | Resolver |
|---|---|---|
| **Doctrine-blocked** | Needs a Red ruling on ADD/operator-class. | Red |
| **Identification-blocked** | Structure/identity unconfirmed (is it a stall? a dex? a mislabel?). | Verification |
| **Governance-blocked** | Convention undecided — where an operator *inserts* in a set. | Curator policy |
| **Precedent-blocked** | Held on a single (or zero) prior precedent; needs the precedent set/extended. | Curator precedent |
| **Notation-blocked** | No canonical notation **and no source** for the token. | Source audit → curator |
| **Truly mechanical** | Notation exists (or mirrors cleanly); bracket-count == ADD; just needs authoring. | Pipeline |

## Held band — MEASURED (64 rows, `is_active = 0`)

| Category | Count | Members |
|---|---:|---|
| Truly mechanical | **28** | 12 Pogo · Blurry (Drifter/Blurrier/Symposium-Whirl/Whirling-Swirl) · Terraging (Same/Opposite Clipper) · Blistering Whirl · Toe Whirr · Toe Double Drifter · Voodoo · Flog · Flog · Miraging Pincher · Fairy Spyro Mirage · Leg-Over Flapper Stall · Backside Symposium Toe Blizzard · Stepping P.S. Whirling x-body Rake |
| Mechanical pending minor reconcile | ~10 | has fb.org notation but bracket-count ≠ ADD (needs a 1-bracket reconcile, not a ruling) |
| Notation-blocked | **1** | `rev up` (no notation; `pogo`/`rooted` are **set-primitives**, correctly notation-free, not tricks) |
| Doctrine / Identification / Governance / Precedent | **~0** | none of the held 64 are Weaving/Dragon/insertion/precedent cases |

**The held band is ~98% execution-ready.** Not one row awaits Red. This is the cleanest possible
confirmation of the "execution, not doctrine" thesis.

## Broader tracked frontier — ESTIMATED (~1,375 slugs)

| Category | Size | Content |
|---|---:|---|
| **Doctrine-blocked** | ~30–35 | Weaving (~30, the one true Red blocker) · SS-as-dex-identity (few) · Clipper=2 anomaly (re-confirm flag) |
| **Identification-blocked** | ~12–15 | Dragon (miraging/swirling-dragon) · Refraction · clipper-symposium-whirl base · nuclear-osis (possible Aeon-Flux mislabel) |
| **Governance-blocked** | ~21 | set-then-gyro insertion (~14) · June set-operators railing/surfing insertion-convention (~7) |
| **Precedent-blocked** | ~12–17 | whirling-on-[BOD] (~3, held on one precedent) · paradox-miraging placement (~4) · same-operator-twice (~5–10) |
| **Notation-blocked** | **~20–50** (revised **down**) | genuine no-source folk tokens only — blazing, zulu, slapping, motion. **Pending per-token source audits** (see lesson). |
| **Truly mechanical** | **~1,200+** | ~900 cascade runway + held-band 28 + the frontier-wide existing-notation false-negatives |

Blocked subset ≈ **~100–140 of ~1,375 (≈ 7–10%)**. The remaining **~90%+ is mechanical.**

## Methodological lesson (load-bearing)

**Always source-audit the `notation` column before assigning "Notation-blocked."** Pogo *looked*
notation-blocked (`operational_notation` NULL) but carried complete footbag.org Jobs notation in
`notation`, using the established `(no plant while)` token (132 active tricks already use it). Same
for Terraging and Blurry. The empty field was a **backfill gap, not a missing notation.**

So "Notation-blocked" is the **most over-counted** category in any doctrine-era estimate. A frontier-wide
`notation`-column audit (held band found 28 false-negatives in 64) will likely move **hundreds** of
slugs from "blocked/held" into "Truly mechanical." Inverse rule: only the rows where **no source
anywhere** (fb.org `notation`, Red correspondence, FM/PassBack) carries a bracket form are genuinely
notation-blocked — and per the curator directive, never invent a token to satisfy the pipeline.

## Pogo disposition

**Classification (1): existing notation found → author mechanically.** All 12 compounds have
footbag.org Jobs notation in `notation`, bracket-count == ADD 12/12, no normalization, no invented
token. Reclassified from "needs notation definition" → **Truly mechanical**. Authoring next.
