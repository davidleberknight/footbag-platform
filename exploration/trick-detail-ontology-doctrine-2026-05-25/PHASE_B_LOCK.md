# Phase B Lock — Trick-Detail Ontology Doctrine Editorial Template

**Status: LOCKED 2026-05-25.**

This document codifies the editorial template established by Phase B's three exemplars (`mirage`, `paradox-mirage`, `whirl`) and frozen as the contract Phase C pages are measured against. The lock derives from the actual prose shipped in the six L1-L6 content modules, not from re-interpretation of the proposal.

Deviations require explicit curator approval; implementer judgment alone is not sufficient (per PROPOSAL.md §13.4).

When the lock and PROPOSAL.md differ on a specific point, the lock wins for Phase C measurement.

## 0. Reference exemplars

| Slug | Editorial dimension | Why it locks the shape |
|---|---|---|
| `mirage` | Primitive atom | Forces the doctrine to handle a 2-ADD core atom with no compositional depth. |
| `paradox-mirage` | Contested compound | Anchors paradox topology; carries the interpretive-traditions discipline. |
| `whirl` | Family anchor | Cross-body rotational dex; widest family branching in the dictionary. |

Phase B authored entries for all three slugs across all six L1-L6 modules.

## 1. Per-layer shape spec

### L1 — Movement intuition

Source: `src/content/freestyleTrickIntuition.ts`.

| Field | Rule |
|---|---|
| `prose` | Single paragraph. 3-6 sentences. ~80-150 words. |
| Tone | Coach tone. Second-person where action verbs appear ("set the bag", "hop off"). |
| Content | Body mechanics, timing, felt rhythm, surface positions. |
| Forbidden | Notation tokens (TOE, [DEX], etc.) · ADD math · taxonomy labels (paradox, x-dex, hidden topology). |
| `attribution` | Required. Forms in use: (a) `Per fb.org /newmoves description (N-ADD canonical reference).` for verbatim citation; (b) `Curator description -- <one-line role>.` for original prose; (c) `Adapted from <source>.` for rewritten prose. |

Reference exemplar (paradox-mirage, Phase B): "Paradox-mirage feels mechanically heavier than ordinary mirage. The setting foot stays planted longer; the hip pivots cross-body during the dex; the bag tracks across more of the body width before recatching. The rhythm is one beat longer than plain mirage — the body must complete a directional shift before the catching foot arrives."

### L2 — Mechanical delta (deepest ontology layer)

Source: `src/content/freestyleTrickMechanicalDelta.ts`.

| Field | Rule |
|---|---|
| `parentSlugs` | Empty array for atoms; named parent slug(s) for compounds. |
| `prose` (atom) | Single paragraph ~60-100 words. Opens: "<Slug> is the atom — there is no parent trick to differ from. Its defining mechanical pattern is..." |
| `prose` (compound) | Up to 3 paragraphs separated by `\n\n`. Total ~150-300 words. Opens: "Relative to <parent>, <slug>..." |
| `topologyKind` | One of: `atom` · `paradox` · `x-dex` · `rotational` · `no-plant` · `cross-body` · `compound` · `hidden-topology`. Extension of the enumeration requires curator approval. |
| `interpretiveTraditions[]` | Optional. Present only when competing shorthand traditions read the same topology differently. When present, BOTH traditions render; neither is canonical. |
| Citation discipline | Tradition-names only. No individuals. Patterns in use: "Older shorthand tradition" · "Newer pedagogical reading". |

L2 is the heart of the system (PROPOSAL.md §2.3). Atom entries describe the defining mechanical pattern; compound entries explain the mechanical / topological delta from the parent. Where a topology distinction exists (paradox, x-dex, rotational), the L2 prose names it explicitly.

### L3 — Ontology role

Source: `src/content/freestyleTrickOntologyRole.ts`.

| Field | Rule |
|---|---|
| `role` | Short noun phrase, 3-5 words. Rendered as section eyebrow. Patterns in use: "Movement-language entry point" · "Paradox topology root" · "Cross-body rotational dex anchor". |
| `prose` | 1-2 short paragraphs (exemplars are single paragraphs, ~80-100 words). |
| Content | Frames WHAT broader ontology concept this trick exemplifies + WHY. |

L3 / L4 overlap is editorial, not structural (PROPOSAL.md §2.4). When the two slots blur for a given slug, curator picks the better-fitting slot; the other stays null and suppresses.

### L4 — Productivity

Source: `src/content/freestyleTrickProductivity.ts`.

| Field | Rule |
|---|---|
| `prose` | Opens with a "this anchors / became generative" framing; lists axes of composition; closes with a "Why it became generative" sentence. ~80-150 words. |
| `productiveDescendants[]` | Structured array of `{ slug, label, note }`. Curator-authored slugs (per PROPOSAL.md Q6); not NLP-extracted from prose. 3-6 entries typical. |
| `note` per descendant | One short sentence on what the descendant adds compositionally. |

The L4 prose answers "why did this trick become productive"; the descendants array answers "what specifically came out of it." Both required.

### L5 — Family evolution

Source: `src/content/freestyleTrickFamilyEvolution.ts`.

| Field | Rule |
|---|---|
| `narrativeSteps[]` | Ordered sequence of branching axes. 3-5 steps typical. |
| `branchAxis` per step | Short label (3-5 words). Patterns in use: "Topology intensification" · "Multi-dex extension" · "Three-dex extension" · "X-dex escalation" · "Terminal surface shift" · "Rotational layering" · "Suspension variant" · "Gyro layering" · "Terminal compound". |
| `prose` per step | 1-2 sentences. Names what the step adds; names the exemplar descendant by slug. |
| `exemplarSlugs[]` per step | 1-2 slugs. Anchors the branch in concrete tricks. |

L5 is the where-the-language-goes-from-here layer. NOT a list. The narrative steps tell HOW the language expands through this trick.

### L6 — Progressive readings

Source: `src/content/freestyleTrickProgressiveReadings.ts`.

| Field | Rule |
|---|---|
| `stages[]` | Ordered staircase. 4-6 stages typical. |
| `stage` per stage | Short label. Patterns in use: "Simple atom" · "Simple anchor" · "Topology transformation" · "Compositional extension" · "Further extension" · "Compressed shorthand" · "ADD accounting" · "Productive descendants" · "Family-language summary" · "Terminal compound" · "Paradox layer — older reading" · "Paradox layer — interpretive reading". |
| `reading` per stage | 1-2 sentences. May reference JOB notation (e.g. `TOE > OP IN [DEX] > OP TOE [DEL]`). L6 is the ONLY layer where notation tokens appear in prose. |
| `citation` per stage | Optional. Used when a stage is attributed to a specific shorthand tradition. |

L6 mirrors L2's interpretive-traditions discipline: when two traditions read the same notation differently, surface BOTH as adjacent stages (e.g. paradox-mirage's "Paradox layer — older reading" + "Paradox layer — interpretive reading").

## 2. Cross-cutting rules (forever)

1. **Layer separation.** L1 ≠ L2 ≠ L3 ≠ L4 ≠ L5 ≠ L6. Mixing produces "X-modified Y" placeholder prose — the failure mode the doctrine displaces.
2. **No individual names in any layer.** Traditions, readings, ideas — not people. Curator acknowledgements live in the glossary acknowledgements paragraph. (Per `[[feedback_no_individual_names_freestyle_views]]`.)
3. **No internal governance tokens in prose or attributions.** No `pt##`, `Phase B`, `Wave 2`, `Red Wave-1`, slice labels, adjudication tokens. (Per `[[feedback_public_facing_prose]]` and CLAUDE.md rule 6.) *Pre-doctrine entries inconsistent with this rule — e.g. mobius L1 attribution references `pt11` — are out of scope; the rule binds new Phase C entries.*
4. **Notation tokens are L6-only.** No JOB symbols in L1-L5 prose. ADD arithmetic appears in L2 (only when ADD is the point being made) and in L6's "ADD accounting" stage.
5. **Cross-references by slug.** When prose names a related trick, use the slug form (blur, fury, sumo, surreal). Cross-references resolve to `/freestyle/tricks/<slug>` at render time.
6. **Interpretive-tradition honesty.** When shorthand traditions disagree, BOTH go in L2's `interpretiveTraditions[]` AND in L6's staircase as adjacent stages. Neither is promoted to canonical doctrine.
7. **Suppression > filler.** When a layer has no curator-authored content for a slug, the section suppresses. Filler prose to keep sections rendering is forbidden.
8. **Atom vs compound openings.** Atom entries open with "X is the atom..." or equivalent defining-pattern framing. Compound entries open with "Relative to <parent>..." or equivalent delta framing.
9. **DB descriptions never mutated.** Placeholder rows (`X-modified Y`, `Popular freestyle trick.`) stay in `freestyle_tricks.description` as decomposition labels; render-time suppression replaces them with a service-shaped decomposition pill. (PROPOSAL.md §3.3, §6.5, §6.7.)
10. **Tier promotion is a single-line edit.** Phase C scales `TIER_A_SLUGS` by adding the slug to the registry + authoring entries in the six L1-L6 content modules. No service / template / shell change required per slug.

## 3. Length budgets (observed)

Budgets observed from the three exemplars, not enforced by code. Curator review measures against these.

| Layer | Atom case | Compound case |
|---|---|---|
| L1 | ~80-150 words, 1 paragraph | ~80-150 words, 1 paragraph |
| L2 | ~60-100 words, 1 paragraph | ~150-300 words, 1-3 paragraphs |
| L3 | ~80-100 words, 1 paragraph + role descriptor | ~80-100 words, 1 paragraph + role descriptor |
| L4 | ~80-150 words prose + 3-6 descendants | ~80-150 words prose + 3-6 descendants |
| L5 | 3-5 narrative steps × 1-2 sentences | 3-5 narrative steps × 1-2 sentences |
| L6 | 4-6 stages × 1-2 sentences | 4-6 stages × 1-2 sentences |

Overruns require curator approval.

## 4. Deviation policy

Phase C pages are measured against this lock. Implementer authority covers:

- Authoring prose within the patterns and budgets above.
- Choosing branch-axis labels (L5) and stage labels (L6) that fit the specific trick, drawing from the example registries in §1.
- Selecting `topologyKind` values from the existing enumeration.
- Deciding which L3 / L4 slot carries a given idea when the two genuinely overlap (per PROPOSAL.md §2.4).

Curator approval is REQUIRED for:

- Length overruns beyond §3 budgets.
- New `topologyKind` values (extending the enumeration).
- New layer slots beyond L1-L6 (L7 / L8 are future-tracked per PROPOSAL.md §12).
- Promoting any interpretive tradition to canonical doctrine.
- Naming individuals in any layer.
- Adding cross-references to off-platform sources beyond the established set (fb.org /newmoves, Holden compilation, PassBack).
- Edits to the three Phase B exemplars themselves — they are frozen for measurement.

## 5. Phase B exemplar artifacts (frozen state, 2026-05-25)

| Layer | Module | Phase B entries | Notes |
|---|---|---|---|
| Tier registry | `src/content/freestyleTrickTier.ts` | 20 TIER_A_SLUGS | 3 Phase B authored (mirage, paradox-mirage, whirl); 17 Phase C pending |
| L1 | `src/content/freestyleTrickIntuition.ts` | 8 entries | 7 pre-doctrine + paradox-mirage added Phase B |
| L2 | `src/content/freestyleTrickMechanicalDelta.ts` | 3 entries | mirage, paradox-mirage, whirl |
| L3 | `src/content/freestyleTrickOntologyRole.ts` | 3 entries | mirage, paradox-mirage, whirl |
| L4 | `src/content/freestyleTrickProductivity.ts` | 3 entries | paradox-mirage + whirl prose elevated 2026-05-25 (gateway-chains framing + transition-anchor sentence) |
| L5 | `src/content/freestyleTrickFamilyEvolution.ts` | 3 entries | mirage, paradox-mirage, whirl |
| L6 | `src/content/freestyleTrickProgressiveReadings.ts` | 3 entries | mirage, paradox-mirage, whirl |

Frozen for measurement: subsequent edits to the three exemplars require explicit curator approval. Phase C does not modify the exemplars.

## 6. Phase C ordering recommendation (non-binding)

Phase C authors L1-L6 entries for the remaining 17 Tier A slugs. Recommended sub-batches:

| Batch | Slugs | Rationale |
|---|---|---|
| C1 — Mirage descendants | blur · fury · sumo · drifter · atom-smasher · barrage · blurriest | Cluster around mirage chassis; cross-references to mirage's L4 / L5 already drafted. |
| C2 — Whirl descendants | blender · surreal · phoenix | Cluster around whirl chassis + paradox-whirl branch; cross-references to whirl's L4 / L5 already drafted. |
| C3 — Independent anchors | osis · butterfly · torque · mobius · ripwalk · food-processor | Stand-alone anchors with their own family branches. |
| C4 — Folk-name rescue | ripstein | The doctrine's flagship demonstration case (`"Popular freestyle trick."` → formal ontology). Last so the editorial template is well-practiced when it's tackled. |

Curator approval for the batch ordering is non-binding; batches are conveniences, not contracts.

## 7. Post-lock refinements (2026-05-25 curator review)

Five comments from a post-lock curator pass on the mirage card. Concrete edits applied where the comment was concrete; forward-looking observations captured below for Phase C.

### 7.1 Concrete edits applied

| Comment | Surface | Change |
|---|---|---|
| "rotational base" wording on mirage is legacy phrasing | `freestyleService.ts` FAMILY_NOTES (mirage) | "foundational 2-ADD rotational base" → "foundational 2-ADD dex base". Mirage is dex-based and rotationally influential, not primarily rotational; "rotational base" properly belongs to whirl / osis / gyro families. |
| "Hippy downtime dex" topology label reads as ontology leakage | `TrickTopologyMembership` shape + `trick-semantic-memberships.hbs` | Topology definition (`def.definition`) is now surfaced on the membership link as a `title=` hover. Converts cryptic taxonomy labels into linked terms with inline-discoverable explanations. |
| L6 progressive readings feel visually dense | `style.css` `.trick-progressive-stage-*` | Stage reading is now block-level under the stage label (instead of inline), with subtle indent (16px) and larger inter-stage spacing (8px → 14px). Restores the staircase feel without changing content. |

### 7.2 Terminology guidance for Phase C

**"Core movement atom"** is locked-in doctrine terminology for atom-class tricks. It already surfaces in `trick-primitive-note` partials for the twelve core atoms. Prefer it over "primitive token", "foundational unit", or parser-grammar phrasings when authoring L3 role descriptors for atom-class Tier A slugs. The phrase avoids parser jargon while preserving ontology hierarchy.

**Avoid "rotational" as a base-classification adjective except where the rotation IS the primary mechanic.** Whirl / osis / swirl / gyro-family compounds are explicitly rotational; mirage / butterfly / leg-over compounds are dex-based even if rotationally influential. Conflating the two ("foundational rotational base" on mirage) is the legacy wording the doctrine displaces.

### 7.3 Embodied-vs-analytical balance for L1 prose (Phase C)

The doctrine's L1 layer asks for what the movement FEELS like. The three Phase B exemplars lean slightly analytical — mirage / whirl / butterfly verbatim citations from fb.org /newmoves are mechanically precise but light on rhythm / flow / balance / directional feel / timing feel.

For Phase C L1 entries — especially **whirl, osis, torque, drifter, ripwalk** — favor felt-experience prose over mechanical-precision prose when the two compete. Rhythm, balance, directional flow, and timing feel are the L1 register. Mechanical precision belongs in L2.

This is NOT a directive to rewrite the three Phase B exemplars; they remain frozen for measurement. It is Phase C authoring guidance.

### 7.4 Pre-existing pre-doctrine surfaces not in scope

Per §2.3 of this lock ("No internal governance tokens in prose or attributions"), the rule binds new Phase C entries. The mobius L1 attribution at `freestyleTrickIntuition.ts:105` references `pt11` — a pre-doctrine surface not touched in Phase B. Cleanup of pre-doctrine attribution lines is curator-paced and not blocking.

## 8. Doctrine refinement — universal grammar, variable depth (curator directive, post-Phase-C, 2026-05-25)

A doctrine correction landed after the Phase B lock + Phase C ship. The original Phase B lock's tier model — where Tier C pages render none of L2-L6 — implicitly creates **two species** of detail page (Tier A ontology pages vs Tier C metadata-lite pages). This is the wrong implementation model. The corrected doctrine:

### 8.1 Universal detail-page grammar (forever-rule)

Every trick detail page shares the same conceptual shell: movement intuition · mechanical structure/delta · ontology role · productivity/compositional role · family/system evolution · progressive readings · notation/formula · related structures.

| Tier controls | Tier does NOT control |
|---|---|
| Richness | Whether the conceptual slots exist |
| Length | Whether L1-L6 are accessible to the page |
| Ontology sophistication | Whether the page is a different *species* |
| Authorial emphasis | The conceptual grammar itself |

### 8.2 Editorial minimum floor

Every trick detail page should eventually be at least as informative / descriptive as the corresponding fb.org description for that trick. This does NOT require long ontology essays, six-paragraph analyses, or flagship-depth treatment everywhere — but every page should still:

- explain the movement meaningfully
- preserve recognizability
- teach at least the core movement idea

Compact pages are acceptable. **Metadata-only pages are NOT the long-term target.**

### 8.3 Implication for future phases

Future phases (Phase D Tier B activation; later Tier C lift) should evolve the broader population toward **compact ontology pages**, not permanent metadata remnants:

- Author compact L1-L6 entries for the broader Tier C population — short, embodied, structurally legible.
- Loosen tier-gates in the service shaping (currently `if (resolveTrickTier(slug) !== 'A') return null;` for L2/L3/L4/L6) so the universal grammar surfaces wherever any layer has curated content.
- Treat `TIER_A_SLUGS` / `TIER_B_SLUGS` as an authoring priority signal, NOT a structural gate.

### 8.4 Implication for set-detail pages

The same principle applies to set-detail surfaces: universal structure, variable depth. The set-system refactor (Phase A+B) should be reviewed under this lens before any next-phase set-detail work — confirm slot-universality and editorial floor compliance there too.

### 8.5 Phase C ships as-is

Phase C ships at the tier-gated current state per the original Phase B lock. This amendment is forward-looking; Phase C is NOT retro-refactored. The amendment binds Phase D and beyond.

### 8.6 Lock-section relationship to §1-§7

Sections §1-§7 describe the editorial template Phase B exemplars set and Phase C followed — they remain authoritative for **how** L1-L6 entries are authored when authored. §8 reframes **when** the slots are reachable: universally, with depth varying by authoring priority, rather than tier-gated structurally. The two are complementary, not contradictory.

---

**Lock effective 2026-05-25. Phase C may begin.**

**Amendment §8 effective 2026-05-25 post-Phase-C. Binds Phase D and beyond.**
