# Slice #1 — Structured Relationship Model (implementation plan)

Build-ready spec for the detail-page relationship-presentation slice. **Presentation + explanatory text
only. No doctrine, no promotions, no DB/schema changes, no content migrations.** All new explanatory text
lands as reversible TypeScript overlays in `src/content/`.

The five relationship categories already map to existing or new surfaces — the slice's job is to (a) make
them **distinct labeled groups**, and (b) attach a **WHY line** to each.

| category | existing surface | what this slice adds |
|---|---|---|
| Family | `trick-family.hbs` (ladder) + `additionalFamilies` chips | per-membership WHY (incl. dual-family) |
| Modifier | `trick-modifiers.hbs` (`modifierMemberships`) | one-sentence gloss for every modifier shown |
| Movement System | axis chip in `trick-modifiers.hbs` | the axis definition as the WHY |
| **Quantity Ladder** | **none** | new `QUANTITY_LADDERS` overlay + section |
| Movement Neighbors | flat `trick-related.hbs` (`rule='neighborhood'`) | dedicated group + rationale + Swing-Elements concept |

---

## 1. Implementation plan

**Order (each step builds + tests independently):**
1. **Overlay data** (new/extended `src/content/` modules; pure data, no render impact yet):
   `MODIFIER_COMPOSITION_GLOSSES` (extend to the 12 priority + others), `FAMILY_WHY`, `QUANTITY_LADDERS`,
   `NEIGHBOR_RATIONALE` (incl. Swing-Elements).
2. **View-model** (`getTrickDetailPage`): add `quantityLadder`, `familyWhy` onto family rows, `gloss`/`axisWhy`
   onto `modifierMemberships`, `rationale` onto neighbor rows; partition `relatedTricks` into `relatedGroups`.
3. **Templates**: render the five labeled relationship groups with WHY; add `trick-quantity-ladder.hbs`;
   enrich `trick-family.hbs` / `trick-modifiers.hbs` with the WHY lines.
4. **Tests**: route/view-model assertions per group + WHY presence.

**Out of scope this slice** (recommendations only): the Osis/Whirl/Barfly *DB description* corrections (§6),
the broad intuition backfill, and any `trick_family`/schema change (Quantity Ladder does NOT re-home tricks).

---

## 2. Required view-model changes (`freestyleService.ts`)

Additive fields on the trick-detail content object (all null-safe / empty-array-hides):

```ts
// Family: attach a WHY per family membership (primary + each additional).
familyMemberships: { label: string; slug: string; isPrimary: boolean; why: string | null }[];

// Modifier: extend the existing FreestyleTrickModifierMembership with a one-sentence gloss.
//   (modifierMemberships already carries name / clusterLabel / axisName / axisKey)
interface FreestyleTrickModifierMembership { …; gloss: string | null; axisWhy: string | null; }

// Quantity ladder (null when the trick is not a ladder member).
quantityLadder: {
  ladderLabel: string;                       // e.g. "Spin ladder"
  rationale: string;                         // why the rungs progress
  steps: { label: string; slug: string | null; adds: string; isCurrent: boolean; present: boolean }[];
} | null;

// Related, partitioned into the five categories (replaces the flat relatedTricks render).
relatedGroups: {
  key: 'movement-neighbors' | 'same-modifier' | 'built-on' | 'similar';
  label: string;                             // "Movement neighbours", "Shares a modifier", ...
  tricks: (FreestyleRelatedTrick & { rationale: string | null })[];
}[];
```

- `familyMemberships` is built from `effectiveFamilySlug` + `familyWithAncestors` + `resolveFamilyDualMemberships`
  (the same sources `additionalFamilies` already uses), each looked up in `FAMILY_WHY`.
- `quantityLadder` from `resolveQuantityLadder(slug)` (§4). `present:false` marks a **missing** ladder member.
- `relatedGroups` partitions the existing `relatedTricks` by its `rule` field (no new relation discovery):
  `neighborhood → movement-neighbors`, `modifier-prefix → same-modifier`, `parent`+`grandparent → built-on`,
  `family → similar`. `nextTricks`/`previousTricks` stay their own "Progression by difficulty" block (distinct
  from the Quantity Ladder, which is repetition not difficulty).
- Movement-neighbor `rationale` from `NEIGHBOR_RATIONALE[slug-pair]`; Swing-Elements is a `NEIGHBOR_RATIONALE`
  entry, not a family.

Template-conventions compliance: the service emits labeled groups + WHY strings; the template branches on
nothing and constructs no multi-variable URLs.

---

## 3. Required template changes

- **New `src/views/partials/trick-quantity-ladder.hbs`** — renders `content.quantityLadder` as an ordered
  rung list (current rung marked, missing rungs shown greyed), with the `rationale` line. Wired into
  `trick-shell.hbs` in the relationship band.
- **`trick-related.hbs`** — iterate `content.relatedGroups` (labeled subgroups) instead of the flat list;
  render each trick's `rationale` line when present.
- **`trick-family.hbs`** — under each family chip / "Also a member of" chip, render its `why` line.
- **`trick-modifiers.hbs`** — render the `gloss` for every modifier (not just the 6 currently glossed), and
  the `axisWhy` definition under the axis chip.
- **CSS**: reuse existing chip/list primitives; new classes `.trick-quantity-ladder`, `.ladder-step`,
  `.ladder-step-current`, `.ladder-step-missing`, `.relationship-why` (one rule each, token-based; added to
  `style.css` + documented in VC §4.3).

Relationship band order in `trick-shell.hbs` (the "why it relates" cluster): Family → Modifiers → Movement
System → Quantity Ladder → Movement Neighbors → Progression by difficulty.

---

## 4. Quantity-Ladder data model

New reversible overlay `src/content/freestyleQuantityLadders.ts`. **Cross-`trick_family` by design** — it links
members that legitimately sit in different families (spin/double-spin/triple-spin span 3 families) without
re-homing any `trick_family`.

```ts
export interface QuantityLadder { ladder: string; label: string; members: readonly string[]; rationale: string; }

export const QUANTITY_LADDERS: readonly QuantityLadder[] = [
  { ladder: 'spin',  label: 'Spin ladder',
    members: ['spin','double-spin','triple-spin'],
    rationale: 'Each rung adds one more full 360-degree body rotation between contacts.' },
  { ladder: 'around-the-world', label: 'Around-the-world ladder',
    members: ['around-the-world','double-around-the-world','triple-around-the-world'],
    rationale: 'Each rung adds one more full circle of the foot around the bag between toe delays.' },
  { ladder: 'orbit', label: 'Orbit ladder',
    members: ['orbit','double-orbit','triple-orbit'],
    rationale: 'Each rung adds one more orbit of the leg around the bag.' },
];
// resolveQuantityLadder(slug) -> { ladderLabel, rationale, steps[] } | null
// steps mark isCurrent and present (a member slug absent from freestyle_tricks renders present:false = "missing").
```

**Ladder audit (drives `present`):** Spin and orbit ladders are complete (all 3 members active). Around-the-world:
atw + double-atw + triple-atw all active = complete. **Incomplete ladders to flag** (members exist as doubles
without triples, or vice-versa — candidates for a future ladder, NOT added now): `double-fairy/-pixie/-illusion/
-whirl/-pickup` (no triple), `triple-mirage`/`triple-swirl` (no double). These are listed for curator review,
not modeled, since adding the missing rung is a promotion (out of scope).

**Broken-progression fix:** the Spin ladder currently surfaces only `triple-spin` as "next" because `double-spin`
is in its own `trick_family`. The `QUANTITY_LADDERS` overlay surfaces the full ladder independently of
`trick_family`, fixing the break **without** moving `double-spin` into the spin family.

---

## 5. Modifier-gloss inventory

One-sentence, plain-language, no individual names. **Priority 12** (authored here, ready to drop into
`MODIFIER_COMPOSITION_GLOSSES`):

| modifier | type / +ADD | gloss |
|---|---|---|
| pixie | set +1 | A compressed uptime set in which the foot circles the bag inside-to-outside before the base trick begins. |
| fairy | set +1 | An uptime set that circles the foot outside-to-inside around the bag, the directional mirror of the pixie. |
| atomic | set +1 (+2 rot) | A set that fits two dexterities into one set, adding a motion before the base (with a hidden carry on rotational bases). |
| quantum | set +1 | A compressed atomic set: an extra dex packed into the set before the base. |
| nuclear | set +2 | A compound set combining a paradox and a downtime illusion, adding two motions before the base. |
| symposium | body +1 | A no-plant discipline: the support leg stays off the ground through the dex moment. |
| gyro | body +1 | A half (180-degree) body turn during the dex, spinning and dexing with the same foot that set the bag. |
| spinning | body +1 | A full (360-degree) body rotation carried through the dex moment. |
| ducking | body +1 | A head dip that lets the bag pass around the neck, the head moving toward the bag as it falls opposite. |
| diving | body +1 | A forward dive of the upper body over the bag during the dex. |
| miraging | body +1 | Adds a mirage-style inside dex at the front of the base trick. |
| whirling | body +1 | Performs the whirl dex during uptime before the bag peaks, flipping the base's leading dex direction. |

**Still un-glossed after the 12** (the remaining linked modifiers — second wave, listed for completeness):
barraging, furious, illusioning, blurry, tapping, swirling, inspinning, backside, floating, railing, shooting,
splicing, surfing, warping. (6 already glossed: paradox, spinning, pixie, ducking, symposium, stepping —
spinning/pixie/ducking/symposium overlap the priority-12 and get upgraded wording above.)

---

## 6. Osis / Whirl / Barfly — correction recommendations (NOT applied)

DB `description` lives in `tricks.csv`/`red_corrections`; **no change made**. Proposed wording, dictionary-style:

| slug | current (likely WRONG) | proposed correction | basis |
|---|---|---|---|
| **osis** | "Inside-to-outside delay combination." | "A body-spin that finishes in a cross-body clipper delay: the bag is set in front, a turn carries it behind the back, and it is recaught on the inside of the foot. Anchors the osis family." | fb.org: osis is a *spin into a clipper*, not an in-to-out combination |
| **whirl** | "Rotational body-spin dex; anchor of the whirl family." | "A dexterity in which the support leg circles the bag from the front, up and over the top, before a cross-body clipper recatch. Anchors the whirl family." | fb.org: it is a *support-leg circle*, not a body spin |
| **barfly** | "Double infinity." | "A double-dexterity off a clipper set: the setting leg circles the bag outside-to-inside twice before the support leg takes the final clipper delay." | fb.org: concrete double out-to-in clipper circle; "double infinity" is opaque |

To apply later: a paired `red_corrections` `description` override per slug (curator-gated), out of scope here.

---

## 7. Example renderings (proposed page output)

### Mobius (5 ADD)
```
FAMILIES
  Torque family        Why: Mobius extends the torque structure with an added gyro dexterity.
  Osis family (root)   Why: Torque resolves through an osis-style cross-body clipper catch, which Mobius inherits.
MODIFIERS
  Gyro — Midtime Body  "A half (180°) turn during the dex, spinning and dexing with the same foot that set the bag."
MOVEMENT SYSTEM
  Midtime Body Modifiers — Why: the gyro rotation happens during the dex moment, not at the trick's boundaries.
QUANTITY LADDER   (none)
MOVEMENT NEIGHBOURS / RELATED
  Same family: torque, paradox-torque …      Built on: torque → osis
```

### Torque (4 ADD)
```
FAMILIES
  Osis family   Why: Torque is a mirage motion that resolves into an osis (it is itself the torque-family anchor).
MODIFIERS   (none linked)
MOVEMENT SYSTEM   (none — derive from base)
QUANTITY LADDER   (none)
RELATED   Same family: mobius, atomic-torque, paradox-torque …
```

### Spin (1 ADD)
```
QUANTITY LADDER — Spin ladder
  ▸ Spin (1)  ← you are here     Double Spin (2)     Triple Spin (3)
  Why: each rung adds one more full 360° body rotation between contacts.
MODIFIER CROSS-LINK: see the Spinning modifier → /freestyle/modifier/spinning
RELATED   Movement neighbours: (none curated yet)
```

### Double Spin (2 ADD)
```
QUANTITY LADDER — Spin ladder
  Spin (1)     ▸ Double Spin (2)  ← you are here     Triple Spin (3)
  Why: each rung adds one more full 360° body rotation.
NOTE: own trick_family ('double-spin') is preserved — the ladder is a cross-family relationship, not a family.
```

### Triple Spin (3 ADD)
```
QUANTITY LADDER — Spin ladder
  Spin (1)     Double Spin (2)     ▸ Triple Spin (3)  ← you are here
```

### Pendulum (2 ADD)
```
SWING ELEMENTS   (a movement-neighbour group, NOT a family)
  Rake     Why: Pendulum and Rake are the swing-element pair — completed by the swing action itself,
                 terminating open in a stall, kick, hand catch, or follow-on trick.
ABOUT (proposed): "A swinging set element completed by the swing itself; its terminal is open (stall, kick,
  catch, or another trick), which distinguishes it from launch sets like pixie/fairy/surging."
```

### Rake (2 ADD)
```
SWING ELEMENTS
  Pendulum   Why: Rake is the directional reverse of Pendulum (scoop-to-stall vs swing-to-stall); both belong
                  to the swing-element group, completed by the swing action.
```

---

## Deliverables produced
1. Implementation plan (§1) · 2. View-model changes (§2) · 3. Template changes (§3) · 4. Quantity-ladder
data model (§4) · 5. Modifier-gloss inventory (§5) · 6. Osis/Whirl/Barfly corrections (§6, recommendations
only) · 7. Example renderings (§7).

Ready to build on approval. Recommended build order: §4 overlay + §5 glosses (pure data) → §2 view-model →
§3 templates → tests. Zero schema/DB/doctrine; every text artifact is a reversible `src/content/` overlay.
