# Sets / Components / Movement Primitives surface recommendation

Phase B planning doc. Audits whether a dedicated surface for modifier /
set / operator learning is needed beyond the existing browse views.

## What exists today

Modifier/set/operator vocabulary surfaces today across at least 5 places:

| Surface | What it carries |
|---|---|
| `/freestyle` operator board | Tier I/II/III primer (Set / Body / Structure). High-density compact reference. |
| `/freestyle/glossary` §3 (Dex / Window / Quality / Motion) | Axis definitions + per-modifier prose. |
| `/freestyle/glossary` §6 Surface A | Modifier feel cards (13 modifiers — beginner-oriented embodied analogies). |
| `/freestyle/glossary` §6 Surface B | Advanced reference (per-modifier deep entries). |
| `/freestyle/tricks?view=movement-system` | 4-axis browse of tricks grouped by modifier. |
| `/freestyle/tricks?view=component` | Bipartite body/set modifier browse (proposed for retirement — see retirement audit). |
| `/freestyle/tricks?view=sets` | Browse tricks by set modifier (pixie / atomic / quantum / etc.). |
| Landing Core Tricks grid | Atom-level cards; modifiers appear only via compound names. |

## Discoverability gap

A user wanting to **learn what a modifier IS** (not just browse tricks
that use it) has these paths:

1. Glossary §3 axis definitions — terminology-first
2. Glossary §6 Surface A feel cards — embodied analogy
3. Glossary §6 Surface B advanced reference — deep dive
4. Operator board — tier primer

All four live on either `/freestyle` (operator board) or
`/freestyle/glossary`. There is NO surface called "Modifiers" or
"Operators" or "Movement Primitives" as a standalone destination. A
beginner navigating from the landing portal cards sees:

- Glossary (terms + modifier feel cards inside)
- Trick Dictionary (browse views)
- Records / Competition / History / Insights / ADD Analysis /
  Combo Analysis

The modifier surface is **embedded inside glossary**, not exposed as
its own destination. New users who want to "learn the operators"
might miss it.

## Three options

### Option A: Modifier surface lives inside Movement System

Move modifier-learning content INTO the Movement System view header.
Each axis carries:
- Axis definition (already present)
- Per-modifier mini-card (name, formula chip, "see tricks using this"
  link, link to glossary §6 deep entry)
- Trick browse grid (current shape)

Pros:
- Single destination per axis
- Movement System becomes the canonical "learn + browse modifiers"
  surface
- No new top-level surface added

Cons:
- Movement System page grows long (4-5 axes × ~6 modifiers × card
  height + browse grid)
- Beginners who don't want the browse list still scroll past it
- Conflicts with "consolidate over proliferate" if Movement System is
  asked to carry both learn + browse

### Option B: Dedicated `/freestyle/operators` surface

Create a new top-level surface specifically for modifier/operator
learning. Each entry: name + formula + embodied analogy + 1-2 example
compounds. NO trick browse; no compound listings beyond illustrative
examples.

Pros:
- Clear learn-first destination ("I want to understand operators")
- Operator board (compact tier primer on landing) becomes the entry
  point linking here
- Movement System stays focused on browse
- Mirrors the `/freestyle/add-analysis` and `/freestyle/combo-analysis`
  pattern (dedicated educational surfaces)

Cons:
- Duplicates content with glossary §6 (which is already an operator
  reference)
- Adds a top-level surface (proliferation concern)

### Option C: Promote glossary §6 to its own URL

Keep all the existing content but expose glossary §6 (modifier
reference) at a dedicated URL like `/freestyle/operators` or
`/freestyle/modifiers` — same content, different addressable surface.
The glossary §6 in-page anchor remains as a fallback.

Pros:
- Zero new content
- Beginners see "Operators" in nav/portal cards
- Glossary §6 still exists for users scrolling the glossary linearly
- Reversible (rename or remove the route without content change)

Cons:
- Two URLs for the same content (DRY-ish concern; might cause
  link-rot or search-confusion)
- Requires careful canonical-URL handling

## Recommendation: Option C — promote glossary §6 to its own URL

Rationale:

1. **No new content**. Glossary §6 already carries the modifier
   reference (Surface A feel cards + Surface B advanced reference).
   The educational content is in place; what's missing is a
   discoverability path that doesn't require a user to know
   "modifier learning lives inside glossary §6."
2. **Operator board stays compact**. The landing's tier-I/II/III
   operator board is a primer; it doesn't try to be a full modifier
   reference. Linking from the operator board to a dedicated
   `/freestyle/operators` route gives beginners a "drill-down here for
   more" path.
3. **Movement System stays focused on browse**. Adding learn-first
   content to Movement System would dilute its role as the
   modifier-grouped browse surface.
4. **Promotion is reversible**. If the dedicated route doesn't gain
   traction (e.g., glossary §6 in-page anchor handles the discovery
   anyway), the route can be removed without losing content.

### Implementation sketch

- Add a controller for `/freestyle/operators` that renders the glossary
  §6 content as a standalone page with hero + Surface A + Surface B.
- Add a portal card on landing (or revise the existing operator board
  footer link) pointing at `/freestyle/operators`.
- Update the existing operator board footer link from "Full set
  notation reference →" to "Operator reference →" (or carry both).
- Cross-link from `/freestyle/operators` back to the glossary §3 axis
  definitions (the deeper axis vocabulary) and to `?view=movement-system`
  for browse.
- Canonical URL handling: glossary §6 anchor (`/freestyle/glossary#section-6-modifier-reference` or current anchor) emits a `<link rel="canonical">` pointing at `/freestyle/operators` so search engines deduplicate.

### Replaces Component View?

No. Component View retirement (per component_view_retirement_audit.md)
is independent. Movement System replaces Component View for browse;
`/freestyle/operators` is a parallel learn-first surface.

### Does it belong INSIDE Movement System?

No. Movement System's role is browse-tricks-by-modifier-axis.
`/freestyle/operators` is learn-this-modifier. Different
intent → different surface. They cross-link.

## What this surface should NOT do

- **Not a parser-grammar reference**. Glossary §7 + the operator board
  carry notation; `/freestyle/operators` is embodied + structural,
  not symbolic.
- **Not a tricks browse**. Cross-link to Movement System for that.
- **Not a Wave 2 doctrine page**. Stay safely on settled modifiers;
  Wave 2 entries (barraging, blurry transitivity) get observational
  badges if surfaced at all.
- **Not an alias dictionary**. Glossary §3 + §6 already carry
  alias-style "X is also called Y" entries; no new alias surface.

## Doctrinal safety

- **Safe**: Pure surface promotion of existing content. No new content;
  no Wave 2 commitments; no parser changes.
- **Care**: Canonical-URL handling between `/freestyle/operators` and
  the glossary §6 anchor. Use `<link rel="canonical">` consistently.

## Review approval

Approve **Option C** (promote glossary §6 to `/freestyle/operators`)
or pick A/B. If approved, implementation slice will produce a
controller + template + portal-card link + canonical-URL config diff
for re-review.
