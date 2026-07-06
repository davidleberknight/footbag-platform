# Lesser-Lineage Histogram — Read-Only Review

A read-only investigation of what a *second* histogram — the lesser lineages sitting below
the first-class family layer — would show, and whether it is worth surfacing. No UI, no
routes, no promotions, no family pages, no production-data change. Inclusion in the lesser
histogram is **not** promotion and does **not** imply family-page eligibility.

## Method and sources

Two metrics, and they measure different things — both are reported so the picture is honest:

- **Live direct membership** — active rows (`is_active = 1`, 922 rows) grouped by
  `freestyle_tricks.trick_family`. This is the live topology the task asked to derive.
- **Curated documented-descendant count** — the stable per-family metric in
  `freestyleFamilyTiers.ts` (`FAMILY_DESCENDANT_COUNTS`) that actually drives the production
  tier classification. It is a broader lineage-closure figure, deliberately frozen so a
  family's tier does not flip with day-to-day churn. It runs higher than live direct
  membership for the deep roots (it counts the transitive lineage, not just direct
  `trick_family` assignment).

The production cut: a family with **more than 10** documented descendants is a **Family
Parent**; ten or fewer is a **Minor Lineage**; the two universal catch surfaces (toe,
clipper) are **Foundational Terminal Surfaces**, excluded from family status regardless of
count and shown as anchor pages by curator override.

## Data-quality finding (fix before any count view ships)

The live `trick_family` column carries **hyphenated variants that violate the no-hyphens
token rule** and split single lineages across two buckets:

- `inside_stall` (1) + `inside-stall` (29) — one lineage, counted as two.
- `clipper_stall` (21) + `clipper-stall` (9) — plus a bare `clipper` (15) that needs
  classifying (drift of the clipper-stall anchor, or a distinct clipper-atom lineage?).
- `around_the_world` (2) + `around-the-world` (2) — one primitive, split in half.

All counts below fold hyphen variants into their canonical underscore form. **No count-based
lineage view is trustworthy until this drift is normalized in the data** — a read-only
finding here, not fixed (no production-data change in scope).

## Histogram 1 — the first-class / anchor top layer (19 members)

The count-qualified Family Parents (curated count > 10), plus the two anchor overrides.
Nineteen members, not twenty: seventeen count-qualified parents plus the two anchors. The
"conceptually 20" is a round number; the derived figure is 19 (the threshold falls cleanly
between inside stall at 11 and the next candidate at 9).

| # | Family | Curated desc. | Live direct | Note |
|---|---|---:|---:|---|
| 1 | osis | 84 | 55 | |
| 2 | whirl | 74 | 100 | |
| 3 | legover | 71 | 62 | |
| 4 | mirage | 69 | 97 | |
| 5 | butterfly | 48 | 64 | |
| 6 | down | 45 | 45 | umbrella = barfly + double_over_down + dod + paradon + down_double_down |
| 7 | illusion | 34 | 41 | |
| 8 | swirl | 29 | 40 | |
| 9 | pickup | 27 | 34 | |
| 10 | blender | 22 | 28 | |
| 11 | torque | 22 | 32 | |
| 12 | double_leg_over | 16 | 23 | |
| 13 | drifter | 14 | 20 | |
| 14 | barfly | 13 | 15 | also a Down branch |
| 15 | eggbeater | 13 | 17 | |
| 16 | double_over_down | 12 | 13 | also a Down branch |
| 17 | inside_stall | 11 | 30 | live/curated gap is the hyphen split above |
| A1 | **toe_stall** | anchor | 8 direct | Foundational Terminal Surface; true reach ~ whole dictionary |
| A2 | **clipper_stall** | anchor | 30 direct | Foundational Terminal Surface; anchor override |

The anchors' *direct* `trick_family` counts (8, 30) are small and beside the point — they
are anchors precisely because almost every trick eventually resolves onto them, which is why
they get the anchor-page variant, not an ordinary roster.

## Histogram 2 — the next 20 lesser lineages (below the tier)

Ranked by live direct membership (hyphen-folded). The load-bearing column is the last one:
**many of these are not terminal-identity lineages at all** — they are compounds, operators,
entry-side primitives, or normalization noise. A naive second histogram would present them
as if they were families.

| # | Root | Live | Curated | What it actually is |
|---|---|---:|---:|---|
| 1 | clipper | 15 | — | **flag** — drift of the clipper-stall anchor, or a distinct clipper lineage? classify first |
| 2 | eclipse | 11 | 9 | genuine minor lineage |
| 3 | flail | 11 | 9 | genuine minor lineage |
| 4 | butterfly_swirl | 10 | 5 | genuine minor lineage |
| 5 | barrage | 9 | 8 | genuine, but dual: also the operator "furious" |
| 6 | paradon | 8 | 6 | Down branch (already inside the Down umbrella) |
| 7 | dada_curve | 6 | 4 | genuine minor lineage |
| 8 | dyno | 6 | 5 | genuine minor lineage |
| 9 | **rake** | 6 | — | genuine minor root |
| 10 | down_double_down | 5 | 5 | Down branch (already inside the umbrella) |
| 11 | dod | 4 | — | Down branch (folds into Down) |
| 12 | motion | 4 | — | **flag** — vague folk-operator token, not a lineage |
| 13 | **orbit** | 4 | — | entry-side primitive (ATW's direction mirror), not a promotable lineage |
| 14 | pixie | 4 | — | set-modifier / operator, not a terminal lineage |
| 15 | **around_the_world** | 4 | — | entry-side primitive / core atom, reclassified out of the family layer |
| 16 | double_pickup | 3 | — | minor pickup variant |
| 17 | mobius | 3 | — | compound (gyro torque), not a root |
| 18 | twirl | 3 | — | needs classification |
| 19 | whirling_swirl | 3 | — | compound (whirling + swirl), not a root |
| 20 | fairy | 2 | — | set-modifier / operator, not a root |

Tail below the 20 (all live 2 or 1): blizzard, cross_body_sole_stall, double_switch_over,
flurry (compound = barraging legover), magellan, and **pendulum (1 — only its own row, no
descendants)**.

**The signal:** of the next 20, only about eight are genuine minor terminal-identity roots
(eclipse, flail, butterfly_swirl, dada_curve, dyno, rake, double_pickup, and one or two
maybes). The rest are Down branches already represented by the umbrella, entry primitives
(ATW, orbit), operators/set-modifiers (pixie, fairy, motion), compounds (mobius,
whirling_swirl, flurry), or drift (clipper). A count-ranked second histogram, taken raw,
mostly lists things that are not lineages.

## Where the named roots land

- **Around the World** — live 4 (split 2 + 2 across spellings). It appears in the lesser
  histogram by count, but doctrine treats it as an **entry-side primitive / core atom,
  reclassified out of the family layer**. It is closer in spirit to the anchor surfaces than
  to a promotable family; showing it in a "lineages" list would misrepresent it.
- **Rake** — live 6. A **genuine minor root**, upper-middle of the lesser tier. Per the
  anchor ruling it **stays minor**: no family page, no promotion on this count.
- **Pendulum** — live **1** (its own row only, no descendants). Effectively a leaf/primitive
  with no lineage; it sits below the histogram floor. Worth stating plainly: pendulum has no
  family to show.
- **Orbit** — live 4. Same status as ATW — an entry primitive (ATW's reverse), not a
  promotable lineage.
- **Pickup / Legover variants** — the **roots are first-class**, not lesser: legover (62
  live) and pickup (34 live) are both in the top layer, and double_leg_over (23) qualifies
  too. Only the smaller variant **double_pickup (3)** falls into the lesser tier.

## Is a second histogram useful?

**Yes as an internal explanatory instrument; risky as a public parallel to the family
layer.** As a topology view it genuinely shows the shape of the vocabulary — a short head of
deep roots and a long tail of small ones — which is a real teaching point. But as a public,
count-ranked list beside the family layer it misleads, because (per Histogram 2) more than
half its rows are not lineages, and the counts are currently untrustworthy from the hyphen
drift.

## Safest public label

**Not "families"** (implies pages) and **not "lineages"** for the raw list (half the rows
are not lineages). If anything public is shown, the safest framing is a single explanatory
**topology / distribution view** — "how the vocabulary's roots are distributed, from a few
deep families to many small ones" — using the tier words the system already carries (Family
Parent / Minor Lineage / Foundational Terminal Surface), **not** a ranked "next 20" that
reads as a waiting list for promotion. Any such view must carry an explicit "these do not
have their own pages" line.

## Risks of confusing visitors

1. **Implies pages.** A second ranked list next to the family layer reads as "these are
   families too," inviting "why can't I click rake?"
2. **Implies a promotion queue.** A "next 20 by count" looks like a leaderboard one good
   season from promotion; the cut is editorial, not earned by count.
3. **Lists non-lineages as lineages.** mobius, whirling_swirl, flurry (compounds), pixie,
   fairy, motion (operators/set-modifiers), ATW, orbit (entry primitives) would be shown as
   roots they are not.
4. **Untrustworthy counts.** The hyphen drift splits and inflates numbers; any count shown
   today is wrong for at least inside stall, clipper, and ATW.
5. **Blurs the anchor distinction.** ATW and orbit look like small families but are
   primitives, muddying the clean "anchor surface vs family vs primitive" story the anchor
   ruling just established.

## Recommendation: DEFER (public), keep internal, gate on two cleanups

- **Defer** shipping any public lesser-lineage histogram.
- **Keep it internal** as a topology instrument (like the dependency graph — a private design
  tool, not a public surface), where its long-tail shape is genuinely useful.
- **Gate a future public view on two cleanups:** (1) normalize the hyphen drift in
  `trick_family` so counts are trustworthy, and (2) curate the list down to genuine minor
  terminal-identity roots — excluding compounds, operators, entry primitives, and Down
  branches — probably ~8–12 real minor lineages rather than a raw "next 20."
- If James later wants something public sooner, **collapse** it to a one-line topology
  explainer plus the existing tier labels, defaulting collapsed, never a ranked roster and
  never with descendant lists.

None of the above promotes any family, creates any page, or implies eligibility; the lesser
tier stays page-less by rule.
