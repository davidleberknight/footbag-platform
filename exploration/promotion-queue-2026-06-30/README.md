# Promotion queue — 2026-06-30 (corrected after canonical-overlap verification)

> **SUPERSEDED IN PART (2026-07-02 doctrine-state reconciliation).** This queue predates the
> atomic/X-Dex ADD migration and the pogo=+1 adjudication, so several holds are stale:
> `atomic-ducking-mirage`, `atomic-swirl`, `atomic-symposium-whirl`, `atomic-whirl` are already
> canonical (promoted with that migration); `atomic-reverse-swirl` and `reverse-guay` are now
> promoted; the PB rows `atomic-gyro-torque` (= folk **Irish Cream**, now canonical with that
> alias), `toe-barrage` (PB tech name for Terrage; the pre-existing `toe near barrage -> barrage`
> alias was rebound to terrage by curator ruling same day), and `pogo-far-mirage` (PB's decomposition of
> the standalone folk trick Pogo) are PassBack technical names, not new tricks. The two
> double-miraging stacks remain doctrine-blocked (same-operator-twice zero-precedent). See the
> 2026-07-02 session's four-bucket verification table and
> `../dragon-refraction-evidence-2026-07-02/NOTE.md`.

> **CORRECTION (verification pass).** The first cut of this queue (255 "Ready" rows, a 73-row
> "first batch") was **invalidated by canonical-overlap verification.** Applying the freestyle
> skill's mandatory pre-promotion gates (alias-collapse, folk-overlap registry, DO-NOT-RE-PROMOTE
> list) showed **68 of the 73 first-batch rows were already canonical or excluded** — the source
> `freestyleObservationalUniverse.ts` was stale. After de-staling (below), the queue holds **130**
> genuinely-new candidates and the true clean first-batch is **5 rows, all doctrine/complexity-held
> → effectively 0 clean Class-A promotions.** **Nothing was written to `red_additions`.**

## Root cause and fix

The universe generator (`legacy_data/scripts/build_observational_universe_content.py`) has a
canonical dual-gate meant to drop any observational row whose slug is now a published canonical.
Its docstring promises "a promoted slug leaves this surface on the next regen." But the gate did an
**exact** string match while observational slugs are hyphenated (`reverse-swirling-osis`) and DB
slugs are underscored (`reverse_swirling_osis`), so it **never matched and removed nothing** — the
`.ts` accumulated already-canonical rows across intervening promotion waves.

Fix (one line, reusing the generator's existing `_norm_slug`): normalize both sides of the gate to
alphanumeric-compact before comparing. Regenerated:

| | rows | ready | frontier | doctrine | folk | parser |
|---|---:|---:|---:|---:|---:|---:|
| before | 1272 | 72 | 188 | 86 | 596 | 330 |
| after  | 1074 | **2** | 144 | 72 | 526 | 330 |

The old "ready" (ex-"Awaiting Ruling") section was **97% stale** (72 → 2). `ready+frontier` now has
**zero** overlap with active canonical / alias. Build + freestyle tests stay green.

## The queue now

`PROMOTION_QUEUE.csv` — **Ready-for-Authoring, not-yet-canonical only.** A belt-and-suspenders
overlap filter excludes any row whose slug is already an active `freestyle_tricks` slug or a
registered alias. That removed **18 rows** — all from the unknown-notation bucket, which are *active
canonicals needing op_notation backfill* (tracked in the unknown artifact), **not promotions**.

| recommended_wave | count |
|---|---:|
| `wave_1_no_dependency_no_verification` | 118 |
| `wave_2_no_dependency_verification_flag` | 4 |
| `wave_3_parent_dependency` | 3 |
| `hold_curator_review` | 5 |

Within wave_1, only **8** carry a derived ADD/decomposition already; **110** are settled-operator
rows whose ADD is **not yet authored** (heavier work — author ADD + notation, not just promote).

## Promotion opportunity — the true remaining runway

- **Genuinely-new promotable rows:** 130 (was an inflated 255).
- **Clean first-batch** (`wave_1` + `decomposition_present` + non-positional): **5** — and every one
  is doctrine- or complexity-held:
  - `atomic-swirl`, `atomic-reverse-swirl`, `atomic-gyro-torque` — atomic on rotational / X-Dex-receiver
    bases; the **atomic-migration / X-Dex-receiver cluster** the doctrine audit flagged as *held*.
  - `pixie-miraging-symposium-miraging-legover` — 5-operator deep stack, double-miraging; Class B/C.
  - `spyro-gyro` — the only plausibly-clean one, but "gyro of a spyro" is semantically questionable
    and needs source-attestation + a sibling op_notation check first.
- **Net: 0 clean Class-A rows.** This confirms the skill's recorded state — *"clean no-cascade Tier-1
  runway EXHAUSTED."* The 130 real candidates need per-family **cascade** (author one base layer at a
  time) or ADD authoring; they are not a bulk batch.
- **depends_on_parent:** 3 edge rows (`nuclear`, `blurry (stepping paradox)`, `rooted`).
- **verification_needed:** 5.

### Top family / operator groups (the 130-row runway)
blurry/furious 41 · symposium/paradox 16 · ducking 15 · whirl/osis-other 15 · pogo 13 · atomic 10 ·
shooting 6 · stepping 4 · spinning/gyro 3.

## What did NOT happen

No `red_additions` write. No `spyro-gyro` promotion. No canonical `freestyle_tricks` change. The only
source edits are the generator bug-fix and the regenerated `freestyleObservationalUniverse.ts`
(a generated content module); build + freestyle tests verified green.

## Reproduction

`python3 exploration/promotion-queue-2026-06-30/build_promotion_pipeline.py` (from repo root) reads
the de-staled universe + the frontier artifact + live `freestyle_tricks`, applies the overlap filter,
and regenerates `PROMOTION_QUEUE.csv` (+ the unknown reclassification). Regenerate the universe first
with `python3 legacy_data/scripts/build_observational_universe_content.py` if the DB has changed.

Columns: `slug, source_bucket, ADD, family_operator_group, flags, missing_parent_slug,
recommended_wave, rationale, next_action`.
