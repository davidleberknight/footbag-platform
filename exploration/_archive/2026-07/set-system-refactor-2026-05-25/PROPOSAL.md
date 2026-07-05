# Set-System Refactor — Taxonomy + Surface Architecture Proposal (2026-05-25)

**Status: APPROVED for Phase A** by curator on 2026-05-25. Phase B (set detail pages) endorsed as the breakthrough layer; awaiting Phase A completion before kickoff. Three curator refinements applied to the original draft (see §0 Refinement log). Phase C (Movement Systems intro) approved with one future-direction note.

## 0. Refinement log (curator review 2026-05-25)

1. **Miraging moved out of True core sets** → into Composite / derived sets. Curator reading: miraging is not a pure set primitive in the same sense as pixie/fairy/atomic/quantum/stepping; it behaves as a derived entry topology / compositional entry mechanic. The other true-core entries are recognizable entry primitives, reusable uptime structures, mechanically generative; miraging is structurally a downstream reading. Aligns with the formula `SET > OP IN [DEX] >` literally being "uptime mirage structure" — a derived shape, not a primitive.
2. **Long-term tracking: "literal set" vs "set system" distinction** within the broader taxonomy. Pixie / fairy / atomic feel like literal sets; blurry / frantic / furious / surging feel like named compositional systems. Not urgent for Phase A; tracked for future refinement.
3. **Q6 — Alternative surfaces long-term direction**: should eventually become a true fifth Movement Systems axis (not just an elevated subsection). Mechanically it absolutely IS one. Short-term (Phase C): elevated framing inside the existing subsection. Long-term: promote to a first-class axis on `MOVEMENT_SYSTEM_AXES`.

## 1. Existing artifacts (audit baseline)

| Artifact | Path | Role | Relevance to refactor |
|---|---|---|---|
| Chris Holden source compilation | `exploration/fborg/chrisHoldenSets.txt` | Verbatim community compilation (~40 named sets + 6 family groupings + component notes) | Conceptual backbone |
| Compositional Sets content module | `src/content/freestyleCompositionalSets.ts` | 6 structural families · 5 uptime-reinterpretation ladders · 30-row audit (11 aligned / 2 partial / 1 conflict / 16 holden-only) | **Already encodes Holden's framework as data; reusable directly** |
| Compositional Sets hub view | `src/views/freestyle/compositional-sets.hbs` | Family-grouped reference hub at `/freestyle/compositional-sets` | Existing surface — reuse, not duplicate |
| Flat sets reference | `src/views/freestyle/sets.hbs` (route `/freestyle/sets`) | Flat Holden-list reference table | Existing surface — unchanged |
| Movement Systems content | `src/content/freestyleMovementSystems.ts` | 4 axes: set-uptime / entry-topology / midtime-body / no-plant-suspension | Already aligns with user's layer split (minus alt-surfaces) |
| Alt-surfaces content | `src/content/freestyleAlternativeSurfaces.ts` | 5 groups: sole-heel / inside-outside / head-neck-shoulder / cloud-knee / flying-airborne | Currently rendered on `?view=movement-system` AND (post-prior-slice) on `?view=sets` cohort 3 |
| Sets view intros (just-shipped) | `src/content/freestyleSetsViewIntros.ts` | Curator intros for the just-built `?view=sets` cohorts | **To be replaced** in Phase A |
| Current `?view=sets` shaping | `src/services/freestyleService.ts` `setsBrowseView` | 3-cohort tricks-grouped-by-entry-set | **Being refactored — this is the surface under change** |

Important: `freestyleCompositionalSets.ts` already contains most of what we need. The refactor is more about **elevating that data to a first-class ontology surface** than about creating new content.

## 2. Canonical set subtyping taxonomy (refined per Refinement #1)

| # | Subtype | Defining property | Example canonical sets | Add semantics |
|---|---|---|---|---|
| 1 | **True core sets** | Single [DEX] over a single set surface (TOE / CLIP); no second dex; no body modifier inside the chain; reusable uptime structure that other systems compose from | Pixie · Fairy · Stepping · Quantum · Atomic | +1 |
| 2 | **Composite / derived sets** | Two or more [DEX] over the same set surface, OR a derived entry topology readable as a compositional reduction of a base structure; structurally readable as a chain or compression of primitives | Miraging · Terraging (Double Pixie) · Barraging (High Stepping) · Sailing (Pixie Illusion) · Blurry (Stepping Paradox) · Furious · Frantic · Fairy Atomic · Shooting · Flailing | +N (sum of primitives) |
| 3 | **Rotational set systems** | SPIN [BOD] token appearing INSIDE the set chain (the set itself carries a rotation); named compositional system with its own movement identity, not merely `spin + set` | Surging · Sonic · Peeking · Leaning · Go-Go · Twinspinning · Neutron · Fairy Spinning · Pixie Inspinning | Set-base +1 · spin token does not double-count |
| 4 | **Whirl / swirl-derived systems** | CLIP-anchored cross-body rotational dex pattern (SWIRL token or whirl-family terminal); often pair with symposium/gyro variants | Swirling · Whirling · Blazing · Scattered · Shattered · Pogo (Symposium Whirling) · Blistering (Whirling Gyro) · Broken | +1 (whirl/swirl primitive) |
| 5 | **UNS-derived systems** (Unusual Non-Standard entry surface) | Entry surface is something OTHER than TOE / CLIP — PINCH / DRAGON / FRIGIDOSIS / etc. | Finchy (PINCH) · Pixie Pinching (PINCH) · Snapping (DRAGON) · Twisted (DRAGON) · Arctic (FRIGIDOSIS) | +N inherited from the base shape; UNS entry surface = ontology marker, not extra add |
| 6 | **Rooted / antisymposium systems** | Setting foot stays on the ground (antisymposium discipline modifier applied to the set) | Rooting · Rooted · Zoid | Discipline-level, not a literal grammar string; tracks no add-bonus |

**Future refinement track (Refinement #2):** within subtype 1+2, a finer distinction may eventually surface — "literal set" (foundational primitive, e.g. pixie/fairy/atomic) vs "set system" (named compositional system, e.g. blurry/frantic/furious/surging). Not implemented in Phase A; tracked as a structural extensibility hook.

**Out-of-scope as set subtypes** (deliberately): "Component mechanics" (Ducking / Diving / bare Spinning / bare Inspinning / Gyro). Per Holden's own framework ("Components of sets, but not necessarily sets") and the contract Part 2 (body modifiers are a distinct ontology layer), these surface as **cross-links from the Set Hub** but are NOT a set subtype cohort. They live on the body-modifier axis. *Curator confirmed.*

**Out-of-scope as set subtypes** (deliberately): Alternative surfaces. Per goal #3, they are a distinct ontology layer (surface mechanics) and belong on Movement Systems, not on the Set Hub. *Curator confirmed.*

## 3. Canonical set ontology object — proposed shape

Every named set in the canonical hub renders as a first-class ontology object:

```typescript
export interface CanonicalSet {
  slug:                 string;   // e.g. "pixie", "blurry", "surging"
  hashtag:              string;   // e.g. "#pixie-set" — distinguishes set ontology from trick ontology
  displayName:          string;   // "Pixie", "Stepping Paradox"
  subtype:              SetSubtype;  // one of the 6 above
  // Future hook (Refinement #2): tier?: 'literal-primitive' | 'compositional-system'

  // Core ontology fields
  formula:              string;   // operational notation (verbatim Holden where present)
  movementExplanation:  string;   // 2-3 sentence prose; uptime/downtime, body mechanics, no jargon dump
  equivalenceNotes:     readonly EquivalenceNote[];  // Holden parentheticals, folk names, alternate decompositions
  derivedSystems:       readonly SlugReference[];    // sets that compose FROM this one (e.g. pixie → terraging, sailing)
  relatedSystems:       readonly SlugReference[];    // parallel/sibling sets (e.g. pixie ↔ fairy directional mirrors)

  // Trick relationships
  exampleTricks:        readonly TrickReference[];   // canonical trick rows where this set anchors the entry

  // Cross-links
  crossLinks: {
    operatorReference?: string;       // /freestyle/operators#<anchor>
    movementSystemAxis?: string;      // /freestyle/tricks?view=movement-system#movement-axis-<axis>
    family?:            string;       // /freestyle/tricks?family=<family-slug> when the set has a terminal family
    compositionalHub?:  string;       // /freestyle/compositional-sets#<family-key>
  };

  // Variants (where relevant)
  rotationalVariant?:   SlugReference;  // e.g. atomic → neutron (atomic + spin)
  bodyVariant?:         SlugReference;  // e.g. stepping → stepping-paradox (= blurry)

  // Provenance
  source:               'canonical' | 'platform-tracked' | 'holden-only';
  sourceCitation:       string;   // e.g. "Holden compilation (2003), aligned with platform"
  auditStatus?:         CompositionalAuditStatus;  // when in audit table — aligned / partial / conflict / holden-only
}
```

`SlugReference`, `EquivalenceNote`, `TrickReference` are small typed records — see §6 of `freestyleCanonicalSets.ts` once authored.

Most of these fields can be derived directly from `COMPOSITIONAL_SET_FAMILIES` and `COMPOSITIONAL_AUDIT_ENTRIES`. The new fields needed are: `subtype`, `hashtag`, `movementExplanation`, `derivedSystems`, `relatedSystems`, `crossLinks`, `rotationalVariant`, `bodyVariant`.

## 4. Surface architecture

| Surface | Path | Role | Status |
|---|---|---|---|
| **Set Hub** | `/freestyle/tricks?view=sets` | Landing of canonical set cards grouped by the 6 subtypes; each card has `#hashtag` + formula + movement-explanation + "View set details" CTA | **REFACTOR** from current cohort-of-tricks-grouped-by-entry (Phase A) |
| **Set detail page** | `/freestyle/sets/<set-slug>` | One page per canonical set; trick-detail-like structure (hashtag · formula · movement explanation · equivalence notes · derived systems · related systems · example tricks · cross-links · provenance) | **NEW** route (Phase B) |
| Flat sets reference | `/freestyle/sets` | Existing Holden-flat-table reference | KEEP unchanged (or move to `/freestyle/sets/reference` if Q3 resolution requires the path) |
| Compositional Sets hub | `/freestyle/compositional-sets` | Existing family-grouped hub with audit | KEEP; cross-link from Set Hub |
| Movement Systems view | `/freestyle/tricks?view=movement-system` | 5 distinct ontology layers acknowledged in intro; alt-surfaces re-acquired as subsection (elevated framing) | UPDATE intro (Phase C). Long-term: promote alt-surfaces to true fifth axis per Refinement #3. |
| Operators & Modifiers | `/freestyle/operators` | Body-modifier reference | KEEP; surfaces component-mechanic cross-links from Set Hub |

**Design discipline:** Set Hub is a HUB (preview + invite per [[feedback_landing_vs_reference_boundary]]). Detail pages are REFERENCE (decompose; full ontology object). No reference encyclopedia content on the Hub itself.

## 5. Movement Systems intro (Phase C) — 5-layer framing

> Freestyle's movement language operates on five distinct ontology layers, each carrying different meaning and different composition rules. This view groups modifiers by axis to help readers learn the structure; canonical classification per modifier lives on the trick rows themselves.
>
> 1. **Set systems** — uptime entry primitives that initiate a trick (pixie, fairy, atomic, quantum, stepping, etc.). See the dedicated [Set Hub](/freestyle/tricks?view=sets).
> 2. **Entry topologies** — where the body enters the trick; hip-pivot side changes that don't move the set foot (paradox).
> 3. **Body modifiers** — what the body does during the dex moment; rotation (spinning, gyro, whirling) and head dip / body arc (ducking, diving, weaving).
> 4. **Suspension / no-plant systems** — discipline modifiers around plant and landing (symposium, pogo, rooting, antisymposium).
> 5. **Alternative surfaces** — surface mechanics beyond toe and clipper; balance and control regimes (sole, heel, cloud, knee, head, neck, shoulder, forehead, flying entries).
>
> *Exploratory / pedagogical — not canonical taxonomy. Each axis is a different way of cutting the same data; a trick may live in multiple axes simultaneously.*

Short-term Phase C: 5-layer enumeration becomes the intro; alt-surfaces stays a subsection but gets the elevated first-class framing.

**Long-term direction (Refinement #3):** alt-surfaces eventually graduates from subsection to a first-class fifth axis on `MOVEMENT_SYSTEM_AXES`. Triggered when (a) curator has time for a dedicated content/axis-definition pass, (b) trick-row tagging for alt-surface membership is in place. Not Phase C scope.

## 6. Canonical set hashtag scheme

Hashtags distinguish set ontology from trick ontology:

| Trick hashtag (existing) | Set hashtag (NEW) | Distinction |
|---|---|---|
| `#pixie-mirage` | `#pixie-set` | trick-instance vs set-primitive |
| `#blurry-legover` | `#blurry-set` | trick using blurry vs blurry the named set |
| `#atomic-butterfly` | `#atomic-set` | atomic trick vs atomic set system |
| `#nuclear-mirage` | `#nuclear-set` | nuclear trick vs nuclear set system |

Pattern: `#<set-slug>-set`. Rendered next to the displayName on Set Hub cards and Set detail pages. **NOT** a search trigger or filter — purely a visual ontology disambiguator.

## 7. Subtype assignment for the ~39 named sets (post-refinement)

| Subtype | Count | Set names |
|---|---|---|
| True core sets | 5 | Pixie · Fairy · Stepping · Quantum · Atomic |
| Composite / derived sets | 10 | **Miraging** · Terraging · Barraging · Sailing · Blurry · Furious · Frantic · Fairy Atomic · Shooting · Flailing |
| Rotational set systems | 9 | Surging · Sonic · Peeking · Leaning · Go-Go · Twinspinning · Neutron · Fairy Spinning · Pixie Inspinning |
| Whirl / swirl-derived systems | 8 | Swirling · Whirling · Blazing · Scattered · Shattered · Pogo · Blistering · Broken |
| UNS-derived systems | 5 | Finchy · Pixie Pinching · Twisted · Snapping · Arctic |
| Rooted / antisymposium systems | 2 | Rooting / Rooted · Zoid |
| **Total** | **39** | (Component mechanics surfaced as cross-links, not as a cohort) |

Three Holden-listed entries that don't fit cleanly:
- **Nuclear** — Holden classifies as basic single-dex; platform tracks as `paradox+atomic` compound. Proposed subtype: **Composite / derived** (more honest to the platform's compound reading). Audit row already records this as `partial`. (Resolves Q4.)
- **Infracting** — "opposite of a Refraction, done as a set"; inverse pattern, no literal notation. Proposed subtype: **Composite / derived** with a discipline-level note. *Curator decision needed before Phase B (drop or include).*
- **Bubba · Slapping · Tapping** — Holden-only single-dex primitives with no platform canonical. Proposed subtype: **True core sets** with `source: 'holden-only'`.

## 8. Open questions for curator review — resolutions

| # | Question | Resolution |
|---|---|---|
| Q1 | Subtype taxonomy: are the 6 subtypes correct? | **Approved with Miraging moved to Composite/derived** (Refinement #1) |
| Q2 | Set hashtag pattern: `#<set-slug>-set` correct? | **Approved as proposed** |
| Q3 | Set detail page URL: `/freestyle/sets/<slug>` conflicts with existing flat-table `/freestyle/sets` | Resolved at Phase B kickoff — preliminary plan: move flat table to `/freestyle/sets/reference`, detail pages at `/freestyle/sets/<slug>` |
| Q4 | Nuclear subtype: Composite (platform) or True core (Holden) | **Composite with note** |
| Q5 | Holden-only entries get detail pages? | **Canonical + platform-tracked only** get full detail pages; Holden-only entries render as hub cards but link to the Compositional Sets audit row |
| Q6 | Alt-surfaces 5th first-class axis on `MOVEMENT_SYSTEM_AXES`? | **Short-term: subsection with elevated framing.** Long-term: promote to fifth axis (Refinement #3) |
| Q7 | Compositional-sets hub vs Set-Hub: identical groupings or complementary? | **Two complementary views; cross-link between them** |
| Q8 | `exampleTricks` on set detail: all canonical tricks or curated 3-5? | **Curated 3-5 with "View all tricks using this set" link** to filtered view |
| Q9 | Component mechanics presence on Set Hub | **"See also" footer with cross-link only** |
| Q10 | Alt-surfaces ejection from `?view=sets` | **Replaced with cross-link card** pointing to Movement Systems alt-surfaces subsection |

## 9. ROI / scope estimate

| Component | Effort | Phase |
|---|---|---|
| New canonical-set content module (39 entries, 6 subtypes, all ontology fields) | ~2-3h | A |
| Subtype assignment + hashtag + movement explanation + cross-links per set | Curator-time, ~30min if pre-drafted | A |
| `getCanonicalSetHub()` shaping helper + types in freestyleService.ts | ~1-2h | A |
| `?view=sets` template rebuild (cards-not-buckets) | ~1h | A |
| Alt-surfaces ejection from ?view=sets (replaced with cross-link card) | ~30min | A |
| Tests for Phase A (set-hub structure, hashtag rendering, alt-surfaces absent from sets view, 6 subtype sections render) | ~2h | A |
| **Phase A total** | **~7-9h** | A |
| Set detail page route + controller + template + CSS | ~3-4h | B |
| Tests for Phase B (route 200, 404 unknown slug, hashtag, all sections, cross-link resolution) | ~2-3h | B |
| **Phase B total** | **~5-7h** | B |
| Movement Systems intro 5-layer update + alt-surfaces elevated framing | ~30min | C |
| Tests for Phase C (5-axis enumeration in MS view intro) | ~30min | C |
| Contract Part 2 + VC §6 doc-sync | ~30min | C |
| **Phase C total** | **~1.5h** | C |
| | | |
| **All phases** | **~14-18h focused work** | A → B → C |

All reversible — TypeScript content + templates only; no SQL / no schema.

## 10. What this proposal does NOT do

- ❌ Touch SQL schema or the `freestyle_trick_modifiers` table — sets stay in modifier registry as today
- ❌ Reclassify any existing modifier row's `modifier_type`
- ❌ Promote any Holden-only entry to canonical without curator review
- ❌ Resolve the existing Surging conflict (Holden = spinning-miraging vs platform = spinning-stepping) — preserved as documented disagreement on the surging detail page
- ❌ Change the existing `/freestyle/compositional-sets` hub or `/freestyle/sets` flat-table surfaces (Phase A scope)
- ❌ Change the operator vocabulary at `/freestyle/operators`
- ❌ Add the 16 Holden-only sets to the canonical `freestyle_tricks` table

## 11. Implementation phasing

**Phase A — Canonical-set ontology data layer + Set Hub refactor. APPROVED 2026-05-25. Proceeding next.**
- New `freestyleCanonicalSets.ts` content module (39 entries, 6 subtypes per §7)
- Service: `getCanonicalSetHub()` shaping helper; `setsBrowseView` interface gains subtype-grouped cards instead of trick-buckets
- Template: `?view=sets` rebuild with cards-by-subtype
- Alt-surfaces ejected from `?view=sets` (replaced with cross-link card per Q10)
- Tests: hub structure, 6 subtypes render, hashtags present, alt-surfaces NOT on this view, alt-surfaces cross-link present
- Build clean, all existing tests still green

**Phase B — Set detail pages. APPROVED in principle ("the breakthrough layer"); kickoff after Phase A merge.**
- New route `/freestyle/sets/<slug>` (URL resolution per Q3 at kickoff)
- Controller + service helper `getCanonicalSetDetailPage(slug)`
- Template: `set-detail.hbs` (mirrors trick-detail.hbs structure)
- Cross-links wired to operators / Movement Systems / Compositional Sets / family pages
- Tests: 200 status, 404 on unknown slug, hashtag rendering, all sections render, cross-links resolve

**Phase C — Movement Systems intro 5-layer + alt-surfaces elevation. APPROVED with future-direction note (Refinement #3).**
- Update axis-intro prose on Movement Systems view to the 5-layer framing (§5)
- Elevate alt-surfaces subsection visual treatment (short-term: subsection; long-term: promote to fifth axis)
- Tests: 5-axis enumeration present in MS view intro
- Contract Part 2 doc-sync update (ontology layer table)

---

**Proceeding with Phase A.**
