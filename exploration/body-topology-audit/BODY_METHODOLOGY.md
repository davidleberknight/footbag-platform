# Body-Topology Audit — Reproducible Methodology

Read-only, the third topology study, complementing `terminal-topology-audit/` (how tricks end) and `entry-topology-audit/` (how tricks begin). It discovers the empirical structure of freestyle *body* topology: what body actions occur during tricks, and which body-action ecosystems dominate the documented vocabulary. It proposes, promotes, and changes nothing.

## Scope (fixed)
Body topology only: **what the body does during flight.** The set, the dex chain, and the catch are out of scope.

## Two methodological commitments (both inherited and confirmed)
1. **Classify by semantic role, not token position.** The entry audit established that operator position within the formula does not determine topological role, so body identity is assigned by what an action *is* (a rotation, a passage, a dex operator, an elevation), not by where its token sits.
2. **Count by curated membership, not by formula token.** The `SPIN` token appears in ~177 tricks, but most of those are rotational *bases* (osis, torque, blender, …) that carry a spin in their own base formula and are not "spinning" applications. The spinning *ecosystem* proper is ~78 tricks. So body-action counts are read from `freestyle_trick_modifier_links`, with `operational_notation` used only as a cross-check.

## Source of truth
- **Primary:** curated modifier membership (`freestyle_trick_modifier_links`), filtered to active tricks.
- **Secondary cross-check:** `operational_notation` body tokens (`SPIN`, `DUCK`, `DIVE`, `JUMP [BOD]`).
- **Never** the registry's `modifier_type` column, which mixes roles (see `BODY_DATA_FIX_CANDIDATES.md`).

Corpus: `freestyle_tricks` where `is_active = 1`. Out of scope here: the entry identities (set surfaces; set ecosystems pixie/fairy/stepping/atomic/quantum/nuclear; no-plant/timing symposium/paradox/blurry/furious).

## Body-topology categories (semantic role)
1. **Body Rotation** — spinning, gyro, inspinning, reverse-spinning. Rotation of the body axis.
2. **Body-Passage** — ducking, diving, weaving, threading. The body passing under or through the bag's path.
3. **Dexterity-Operator** — whirling, swirling, miraging, barraging, tapping, illusioning, railing. Operators that insert or transform a dex during flight.
4. **Airborne / Elevation** — flying, jumping, stomping, pogo. Elevation-based actions. (Currently uncurated, see limitations.)

Count for each ecosystem = distinct active tricks carrying that modifier.

## Known limitations
- **Airborne / Elevation is uncurated.** flying/jumping/stomping/pogo carry 0 modifier links, though the `JUMP` token appears in ~10 formulas. The axis exists in the vocabulary but cannot be ranked by membership; it is reported as a gap, not a zero.
- **Five uncategorized modifiers** (surfing, floating, splicing, shooting, warping; 1 trick each) have no settled semantic bucket; listed for a curator call.
- **Membership completeness**: an action present in a trick's notation but not linked is undercounted.
- **`modifier_type` is unreliable** for this taxonomy (e.g. barraging/railing typed `set`); not used.

## Reproducibility
Inputs: `freestyle_trick_modifier_links(trick_slug, modifier_slug)` filtered to active tricks, plus `freestyle_tricks(operational_notation)` for the token cross-check. Constants: the four-category role map. The audit regenerates the axis totals, the per-ecosystem ranking, and the data-fix list deterministically.
