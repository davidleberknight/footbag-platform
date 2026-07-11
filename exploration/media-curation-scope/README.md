# Freestyle media-curation scope: canonical demonstration gaps

> **Status: CLOSED, historical research only (audit complete).** The foundational zero-media audit is closed with no further sourcing or cross-reference pass planned. This folder is retained as a record of the method and the result; it is not a live worklist and generates no open tasks. Any future footage for the tricks listed here is an opportunistic addition during normal curation, not a backlog obligation. The closure is recorded in `IMPLEMENTATION_PLAN.md` under the freestyle closed decisions.

Exploratory research under `exploration/`. Not production data, not doctrine, not a change to the live dictionary. A read-only scoping pass that produced a worklist; it staged no media and changed nothing.

## What a "gap" means here

Not "a trick row with no directly attached clip." A foundational trick is **covered if the platform already contains a high-quality instructional demonstration of that movement on any intentionally-shared educational surface** (its own trick page, a set page, or another shared teaching surface). The target is the canonical tricks that are *not* covered under that definition.

Coverage signals the data can compute:

- **Curated-tag coverage.** A curated `media_items` row is tagged `#<slug>` (the production trick-page coverage lane).
- **Alias-shared coverage.** A curated clip is tagged with one of the trick's alias slugs (a retired structural name folded onto its canonical).
- **Record-video coverage.** The trick's world-record row carries its own `video_url` (the service's third coverage lane). This is what makes `2_bag_juggling`, `gyro_toe`, and others *not* gaps, even with no curated tag.
- **Set-page presence.** The trick has a Set Encyclopedia teaching page (the `has_set_page` column). Note these pages are prose teaching; media reaches them only through a representative-clip link, so a set page is a coverage *candidate*, not a guarantee.
- **Family representative coverage.** The trick's family has at least one covered member, so the family page surfaces a representative clip (the `family_has_covered_member` column). This is a weak/generous signal: one covered member does not mean every member's movement is instructionally demonstrated.
- **Intentional inheritance.** A variant is adequately demonstrated by a sibling canonical's clip. Applied here only for the two named cases: `inside_around_the_world` inherits the Around-the-World demo, `outside_around_the_world` inherits the Orbit demo.

The last three signals are candidates, not conclusions: whether a set page or a family's representative clip is *a high-quality instructional demonstration of the specific movement* is a per-trick curator judgment the data cannot make. The worklist therefore marks each remaining gap `clean-gap` (no set page, no covered family: high-confidence true gap) or `candidate-covered` (reachable via a set page or a covered family: needs a curator look before sourcing).

## Result

Starting from every active, non-modifier canonical trick at ADD 2-3 (the foundational, plausibly-filmable band): **191 rows, of which 134 are true demonstration gaps** after removing curated-tag, alias, record-video, and the named-inheritance coverage. The three-lane coverage removal is the important correction; a bare-untagged count badly overstates the gap.

`zero_media_foundational_targets.csv` holds the 134, tiered:

- **ADD2-demo (14): the priority.** `guay`, `pixie`, `fairy`, `reverse_guay`, `inspinning_reverse_guay`, `walk_over`, `wrap`, `dragon`, `probe`, `double_spin`, `toe_clipper`, `knee_clipper`, `butterfly_kick`, `bubba`. Recognized, commonly-performed, single-trick-demo-friendly.
- **ADD2-stall (7): low priority.** The set-entry toe stalls (`spinning`/`ducking`/`diving`/`inspinning`/`weaving`/`zulu` toe stall) and `cloud_stall`. These likely inherit from the covered `toe_stall` demo plus their operator's own media; a bare stall is a weak "watch this" clip. Hold pending a curator inheritance ruling.
- **ADD3 (113): the next band.** Single-operator compounds and named 3-ADD tricks; work after the ADD-2 demo tier.

## Two caveats, deliberately not over-reached

- **Inheritance is only partially applied.** Only the two named Around-the-World / Orbit cases are removed. Other variants in the 134 may also be "demonstrated by a sibling," but that is a curatorial map the platform does not encode, so the list should get a curator inheritance-review pass before sourcing, rather than a guessed auto-exclusion here.
- **This is a coverage gap, not a sourcing list.** A gap does not mean footage exists. The next step is to cross-reference the cleaned ADD2-demo tier against the known tutorial/demo source inventories (Tricks of the Trade, AnzTrikz, Shred Global, Footbag Finland) and stage only the ones with a high-confidence single-trick demonstration.

## Outcome (no next step)

The audit is closed. After every coverage lane above, the real educational gap is about sixteen foundational tricks (seven in the priority two-point demo tier), too small and too unlikely to yield valuable footage to justify a dedicated sourcing or cross-reference pass. No such pass is planned. The clean-gap and candidate-covered tricks are not tasks; footage for any of them is added opportunistically during normal curation if it surfaces, never as a backlog obligation. Player-performance montages are never staged as single-trick demonstrations (per the closed BAP-shred decision).
