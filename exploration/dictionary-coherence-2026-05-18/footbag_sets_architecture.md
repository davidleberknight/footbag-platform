# Footbag Sets Architecture

Covers brief Part 2 (missing Footbag Sets organizational surface).

Supports `FINAL_RECOMMENDATION.md` cross-cutting recommendation CR-3.

This doc audits the current placement of set primitives (pixie,
stepping, atomic, fairy, quantum, nuclear, symposium, gyro, ducking,
spinning), evaluates the three architectural options the brief raises,
recommends the landing-guided path (already specified in doc 3), and
specifies the stall-anchor discovery path that the retired Category
view's `set` bucket previously served (per doc 2).

---

## 1. Where Sets sit in the ontology

Per the ontology disambiguation in `FINAL_RECOMMENDATION.md`:

| Surface | Meaning | Layer |
|---|---|---|
| **Family** | Canonical derivative lineage | Canonical |
| **Movement System** | Operator / mechanical grammar | Canonical |
| **Neighborhoods** | Embodied movement similarity | Observational |
| **Observed** | Externally seen, not yet canonized | Observational |

**Sets are Movement System content, not their own surface.** A set is
an operator -- a launching mechanic that precedes a trick. Pixie launches
the bag; stepping launches the bag with a particular step. The
mechanical grammar lives in Movement System; the embodied feel of a
"pixie trick" might also support a Neighborhoods grouping, but the
primary home is Movement System.

This is the load-bearing call this doc makes: do NOT create a parallel
"Sets" classification surface. Promote the existing Set/Uptime axis
within Movement System.

---

## 2. Current state

### 2.1. How sets are modeled in the DB

Set primitives are NOT standalone trick rows. They are MODIFIERS that
attach to base tricks via `freestyle_trick_modifier_links`:

| Set primitive | `freestyle_trick_modifiers` row | `modifier_type` |
|---|---|---|
| pixie | yes | `set` |
| stepping | yes | `body` |
| atomic | yes | `set` |
| fairy | yes | `set` |
| quantum | yes | `set` |
| nuclear | yes | `set` |
| symposium | yes | `body` |
| gyro | yes | `body` |
| ducking | yes | `body` |
| spinning | yes | `body` |

(Recon confirmed two types: `set` (pixie / atomic / quantum / nuclear /
fairy / furious) and `body` (paradox / symposium / spinning / ducking /
diving / weaving / gyro / stepping). A third type
`rotational-qualifier` is referenced in code; membership not surfaced.)

A trick like "pixie illusion" is modeled as: base = `illusion`,
modifier = `pixie`. The composition lives in the modifier-link table.

### 2.2. Where set primitives surface today

| Surface | Treatment |
|---|---|
| `?view=movement-system` Set/Uptime axis | PRIMARY -- canonical grouping by operator/mechanic |
| `?view=movement-system` Midtime Body axis | Body modifiers (spinning, ducking, etc.) |
| Family-filtered sidebar nav (`/freestyle/tricks?family=X`) | Lists modifiers used by tricks in that family; deep-links to `?view=component#set-{slug}` |
| Trick-detail page (each modifier compound) | Renders the modifier as a component of the trick |
| Glossary §6 (modifier feel cards) | 13 modifier feel cards (Slice L1/L2 + Slice N pilot) |
| `?view=component` (soft-retired) | Old modifier-grouped browse; redirects to Movement System |
| `?view=category` `set` bucket (proposed for retirement -- doc 2) | Confusingly contains STALLS (toe-stall, heel-stall) -- NOT set primitives. The label "Set" is overloaded. |

### 2.3. The label-overload problem

`?view=category`'s `set` bucket contains STALLS (toe-stall, heel-stall,
outside-stall, clipper-stall) per the `19_load_red_additions.py`
loader. These are anchor positions, NOT bag-launch primitives.

The naming collision is real:

- "Set" in the trick-dictionary `category` column = stall anchors.
- "Set" in the modifier system (`modifier_type='set'`) = bag-launch
  primitives.

A user looking for "Footbag Sets" using Category view finds stalls. A
user looking for stalls using Movement System's Set/Uptime axis finds
bag-launchers. Both are wrong, and the overlap is invisible to the
user.

This doc resolves the collision by separating the two cohorts:
- Set PRIMITIVES (bag-launchers) → Movement System Set/Uptime axis
  → landing-card discoverability path.
- STALLS (anchor positions) → separate discoverability path; not
  resolved in this slice but flagged.

### 2.4. Recon-confirmed Set/Uptime axis contents

The Movement System view's "Set/Uptime" axis is curator-authored in
`src/content/freestyleMovementSystems.ts`. Per recon it carries the
set-primitive modifier memberships. Each modifier has:

- A name (display)
- A slug
- A composition gloss (curator-authored pedagogical explanation)
- A list of canonical tricks that use it (computed from modifier_links)

This is the canonical home. The brief's Part 2 question is how to make
it discoverable.

---

## 3. Options considered (from the brief)

The brief explicitly lists three options:

### Option A: Standalone Sets view (new `?view=sets` browse mode)

REJECTED. Three reasons:

1. **Data duplication.** Standalone view would either share the
   Movement System Set/Uptime axis content (then it's just an alias --
   why have two URLs?) or duplicate it (then curator maintains two
   sources of truth -- ontology drift risk).
2. **Browse-mode proliferation.** The current toggle row is already
   loaded; adding a 7th view (now that Category is retiring per doc 2)
   would re-clutter just as we cleaned up.
3. **Layer collapse risk.** A standalone "Sets" view implicitly
   claims sets are their own surface, distinct from Movement System.
   They are not; they are operators within the mechanical grammar
   (per the disambiguation table). The standalone view would
   subtly re-introduce ontology fuzz.

Note: the `?view=sets` URL parameter currently resolves to the
soft-retired `?view=component` per `freestyleService.ts:4104`
(documented in recon). That alias remains for backward
compatibility but should not be elevated to a first-class view.

### Option B: Dedicated section within Movement System view

PARTIAL ACCEPT, BUT NOT THE ANSWER. Movement System already HAS a
Set/Uptime axis. A "dedicated section" within Movement System is
basically the current state -- the brief's option as stated doesn't
distinguish from the status quo. So Option B as the answer to "where
do sets live" is correctly answered by the existing structure.

The problem the brief identifies is NOT "sets have no home" -- it's
"sets are not discoverable from outside Movement System." Option B
doesn't solve discoverability; it describes where the home already
is.

### Option C: Landing-page guided section

RECOMMENDED. Locked CR-3. Specific implementation per
`dictionary_landing_page_plan.md` §2.3:

- Landing surface (CR-1) carries Card 3 ("By Movement System").
- Card 3 has a sub-link: "See Footbag Sets axis" → deep-links to
  `?view=movement-system#axis-set-uptime`.
- Landing surface's Card 6 (Operators & Components) also covers sets
  in its broader vocabulary scope.
- No new view. No new data model. No ontology drift.

This is the landing-guided path: discoverability happens at the
landing layer, where the user is choosing how to browse; the data
home is unchanged.

### Synthesis

Options A and B answer the wrong question (where do sets live?).
Option C answers the right question (how do users find them?). The
answer is one sub-link on the landing card for Movement System, plus
the implicit coverage in the Operators & Components card.

---

## 4. Recommended approach

### 4.1. Landing-guided discoverability (per CR-3)

Already specified in `dictionary_landing_page_plan.md` §2.3 Card 3:

> **Sub-link** (small, just under the body): "See **Footbag Sets**
> axis" -> `/freestyle/tricks?view=movement-system#axis-set-uptime`.

Implementation: a single anchor in the landing's content module
(`freestyleDictionaryLanding.ts`). No data model change.

### 4.2. Set/Uptime axis content (curator-paced confirmation)

The axis already groups set-primitive modifiers (pixie, atomic,
fairy, quantum, nuclear, furious; body-type sub-grouping for
stepping/spinning/ducking/symposium per their `body` modifier_type).
Recommendation: curator review the existing axis to ensure all
canonical set primitives are present + correctly grouped:

- pixie -- set type, foundational
- fairy -- set type
- atomic -- set type
- quantum -- set type (modern naming; per Red, replaces older "toe"
  naming)
- nuclear -- set type
- furious -- set type
- stepping -- body type (but commonly called a "set" in community
  vernacular; curator decides whether it sub-groups under Set/Uptime
  or stays in Midtime Body)
- symposium -- body type (similar question; curator decides)
- gyro -- body type
- ducking -- body type
- spinning -- body type
- diving -- body type
- weaving -- body type

The Set/Uptime axis's exact membership is curator-authoritative in
`freestyleMovementSystems.ts`. Recommendation: no automated rebucketing
this slice; flag for curator review.

### 4.3. Composition glosses

The Movement System view renders composition glosses per modifier
(curator-authored pedagogical explanation). For set primitives, the
gloss should make explicit:

- What the launch mechanic does (e.g., pixie = "bag launched off the
  toe with a specific contact / spin profile").
- That it precedes the trick (operator, not stall).
- What ADD bonus it carries (per `freestyle_trick_modifiers.add_bonus`).

This is content work -- no schema, no template change. Curator-paced.

### 4.4. Stall-anchor discovery path (separate from sets)

Stalls (toe-stall, heel-stall, outside-stall, clipper-stall, osis as
the "double-anchor" form) are anchor positions, not set primitives.
The retired Category view's `set` bucket served stall discovery
implicitly.

Recommendation for the post-retirement discovery path:

- **Trick-detail page** -- each stall already has its own page (loaded
  via `19_load_red_additions.py`). The detail page is the canonical
  home. No change needed.
- **Family view** -- stalls do not have a coherent "stall family"
  (skill doctrine C: clipper-surface ≠ clipper-family). Do not invent
  one.
- **Movement System view** -- the Midtime Body axis or a new "Anchors"
  sub-axis could surface stalls. Curator decision. NOT in scope this
  slice.
- **Glossary** -- §6 modifier feel cards or a new "anchors" section.
  Curator decision. NOT in scope.
- **Landing Card 6 (Operators & Components)** -- the card body
  ("sets, dexes, spins, surfaces, body modifiers, and the
  movement-language vocabulary that composes tricks") covers stalls
  under "surfaces" implicitly. The glossary primer callout adjacent
  is the primary entry point.

Net: stall discovery degrades gracefully when Category retires.
Direct URL access + trick-detail pages + glossary continue to serve
users seeking stall vocabulary. The curator may choose to elevate
stalls to a dedicated surface in a future slice; not for now.

### 4.5. NOT recommended

- A `?view=stalls` browse mode (parallel to the rejected `?view=sets`
  proposal; same reasoning).
- Adding stalls to the Set/Uptime axis (different conceptual cohort;
  would re-create the Category view's overload).
- A "by surface" browse view (premature; skill doctrine C explicitly
  cautions against treating surface as family).

---

## 5. Implementation sketch

Most of the work lands in the landing-page slice (doc 3); this doc's
incremental footprint is minimal.

### 5.1. Within the landing-page slice (per doc 3)

- Card 3 sub-link to `?view=movement-system#axis-set-uptime` in
  `freestyleDictionaryLanding.ts`.
- CSS for `.landing-card-sub-link` (small text, neutral color, single
  link).
- Integration test asserting Card 3 sub-link renders + hrefs
  correctly.

### 5.2. Within Movement System view

- Verify the Set/Uptime axis has an anchor id of `axis-set-uptime` (or
  similar predictable slug). Recon shows the axis-jump nav is
  curator-authored in the view (`tricks.hbs:4313-4320`). Anchor id
  needs to match the deep-link target.
- If the anchor id differs, the landing sub-link href adjusts. Confirm
  during implementation.

### 5.3. Curator content (no slice deliverable)

- Optional: curator confirms axis membership + composition glosses
  for set primitives. Curator-paced; not gating.

### 5.4. Optional: glossary anchor for stalls

Out of scope this slice. Recommended for a future slice:

- Add a "Stalls and anchors" subsection to `/freestyle/glossary`
  collecting the stall vocabulary.
- Each stall (toe-stall, heel-stall, outside-stall, clipper-stall,
  osis) renders with a one-line definition.
- Cross-link from Card 6 of the landing.

---

## 6. Curator decision points

- **(DECIDED at session-level via CR-3 lock)** Landing-guided path;
  no standalone Sets view.
- **(DEFER)** Whether stepping / symposium / spinning / ducking
  sub-group under Set/Uptime or stay in Midtime Body. Curator's call;
  the axis composition is content-module work.
- **(DEFER)** Whether `furious` is a true set primitive or an alias
  for atomic. Curator's call.
- **(DEFER)** Stall-anchor discovery elevation -- new view? glossary
  section? movement-system sub-axis? Defer to post-Wave-2 + curator
  triage.
- **(DEFER)** Final Card 3 sub-link copy ("See **Footbag Sets**
  axis"). Curator may revise wording in `freestyleDictionaryLanding.ts`.

---

## 7. Risks and mitigations

### 7.1. Risk: User clicks Card 3 sub-link, lands on Movement System,
expects ONLY sets

Mitigation: deep-link anchor scrolls to the Set/Uptime axis. User
sees that axis first; the other three axes are below. The visual
context is intentional -- sets are part of Movement System, not their
own world.

### 7.2. Risk: Curator wants to elevate sets later

Not blocked. Elevation is reversible: spawn a new browse view or a
new section in the future when curator triage + Wave-2 doctrine
mature. The current slice's structural decision (one sub-link, no new
view) doesn't preclude later elevation.

### 7.3. Risk: Stall users lose discovery path when Category retires

Bounded mitigation:

- Direct URL access continues.
- Trick-detail pages continue.
- Glossary continues.
- The retirement notice on `?view=category` (per doc 2) points to
  Family + Movement System as replacements; stall users redirect to
  trick-detail or glossary via either.

Stall discovery degrades from "browse a bucket" to "search or
glossary navigate." Acceptable trade-off for the ontology cleanup;
flagged as a future enhancement opportunity.

### 7.4. Risk: The naming collision between Category `set` bucket and
modifier `set` type continues to confuse anyone reading code

Mitigation: this slice doesn't fix the code-level collision; both
labels stay. The user-facing impact is mitigated because Category
view retires and the modifier `set` type only surfaces via Movement
System axis labelling, which is curator-authored. Internal naming
cleanup is out of scope; flag for future engineering hygiene pass.

### 7.5. Risk: Adding the sub-link makes Card 3 visually dense

Mitigation: sub-link is small (matches `.fs-sm` text size, neutral
color, no decoration). Card 3 body is still the primary CTA. The
sub-link is a secondary affordance for the user who knows what
"Footbag Sets" means.

### 7.6. Risk: User confused by the "sets are operators, not their
own thing" framing

Mitigation: the user doesn't need to internalize the ontology
distinction. The discoverability path works regardless: click → land
on the Set/Uptime axis → see the set primitives. The disambiguation
table in `FINAL_RECOMMENDATION.md` exists for curator + dev
reference, not user-facing.

---

## 8. Out of scope

- Schema change for sets (modifier_type column stays).
- New browse view for sets.
- New browse view for stalls.
- Stall-anchor elevation to a dedicated surface.
- Curator-paced axis membership review.
- Composition gloss authoring for set primitives.
- Internal code-level naming cleanup of the Category `set` / modifier
  `set` collision.
- FootbagMoves ingestion that might introduce new set names.
- Set-primitive aliases (e.g. "toe set" / "quantum") -- already
  handled via the alias table.
- Promotion of stepping/symposium as sets (curator decision).

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- CR-3 cross-cutting recommendation;
  ontology disambiguation table.
- `dictionary_landing_page_plan.md` -- Card 3 + sub-link
  specification; primary implementation site.
- `category_view_retirement_review.md` -- the `set` bucket label
  overload that this doc separates; stall-discovery degradation path.
- `family_and_neighborhood_governance.md` -- doctrine C ("family ≠
  catch surface"); why surfaces don't get their own family-like
  surface.
- Skill `freestyle-topology-governance` -- multi-axis caution; Sets
  fit Movement System axis, not Neighborhoods or own surface.

---

## 10. Summary

Set primitives (pixie / atomic / fairy / quantum / nuclear / etc.) live
in Movement System's Set/Uptime axis. They are operators, not their
own ontology layer. The brief's question is discoverability, not
home. Answer: one sub-link on the landing's Movement System card,
deep-linking to the axis anchor. No new view; no new schema; no
duplication. The Category view's `set` bucket (which actually contains
stalls, not set primitives) retires per doc 2; stall discovery
degrades to direct URL + trick-detail + glossary, acceptable in this
slice. Brief Part 2 satisfied without ontology hardening or browse
mode proliferation.
