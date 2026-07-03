# Spec — durable "decomposition pending" flag (visible, not hidden)

> **SUPERSEDED — do not implement as written.** Implementation revealed the live
> codebase already provides this pill via a **curator-only** module:
> `src/content/freestyleUnresolvedCompounds.ts` → card field `pendingDecomposition`
> → the `dict-trick-row-pending` pill ("decomposition under review"). That module's
> authoring rule is explicit: *"Curator-only … tied to a specific structural
> ambiguity … entries should NOT proliferate,"* and it even documents rows it
> deliberately does **not** flag (`witchdoctor`, `tomahawk`) because their structure
> later resolved.
>
> The auto-derived predicate below is **orthogonal** to that signal: of the curator's
> 6 hand-picked entries (`rev-up`, `reaper`, `surreal`, `montage`, `fury`, `surgery`)
> the predicate catches **0**. They measure different things — the pill marks
> *structurally contested* tricks; the predicate marks *not-yet-decomposed* folk gaps
> (a folk name with a known base is incomplete, not ambiguous). Per the project rule
> that **live editorial truth overrides draft design**, the curator module governs.
>
> **Resolution:** the auto-derived flag is rejected (bulk-adding 60 entries would
> violate "must-not-proliferate" and conflate two concepts). The rung-0 / Core
> completeness gap is instead addressed by **completing `modifier_links`** (the
> Tier-4 folk-decomposition worklist) — each decomposed trick moves to its true rung
> with no pill. The predicate below is retained only as a potential **curator triage
> aid**, never a bulk auto-insert. The text below is preserved as the rejected
> proposal for the record.

---

Slice B of the dictionary-contract tightening. **Visible honest-incompleteness badge**,
not a hide/move gate. Satisfies Canonical Trick Publication Contract Req 5
("pending states must render honestly") without amending the contract, changing
family membership, or depending on ephemeral parser columns.

## Why a flag, not a hide
- Genuine contract violations are ~0: every active trick has base-lineage (Req 1).
- The parser completeness columns (`structural_parse_json`, `computed_adds`,
  `add_formula_status`) are **NULL after every DB rebuild** (reset-local-db omits
  parser-populate), so they cannot gate a public surface.
- A hard hide on "has modifier_links" would remove **canonical named anchors**
  (`torque`, `blender`, `eggbeater`) whose structure is name+notation-encoded.

So: keep every trick visible in its family; **badge the folk gaps** so readers
see what is not yet decomposed. Decomposing them (Tier-4 worklist) clears the badge.

## Durable flag rule (CSV-sourced signals only)

A family-view trick is **decomposition-pending** iff ALL hold:
1. `modifier_links` is empty (rung 0) — not yet decomposed into operators.
2. `base_trick != slug` and `base_trick` non-empty — it is a derived trick, not a
   self-anchor.
3. `slug` is **not a core atom** (the 12: toe-stall, clipper-stall, around-the-world,
   orbit, legover, pickup, mirage, illusion, butterfly, osis, whirl, swirl).
4. `slug` **founds no sub-lineage** — it is not the `base_trick` of any other active
   trick. *(This is the critical anchor-exclusion: `torque`/`blender`/`eggbeater`/
   `flurry`/`reactor` found sub-lineages, so they are NOT flagged even though they
   carry no links.)*

No parser columns. No `add_formula_status`. All four signals are durable
(`base_trick`, `modifier_links`, the atom set, the derived founds-set).

## Scope (live data, post-Slice-A)
**60 tricks flagged**, spread: whirl 12, legover 11, mirage 8, butterfly 7, osis 6,
swirl 4, eggbeater 3, blender 3, double-leg-over 2, double-over-down 2, drifter 1,
illusion 1. Examples: `yoda`, `atom-smasher`, `blue-widow`, `parkwalk`, `guillotine`,
`quagmire`, `sole-survivor`, `feral`, `forque`, `overlord`.

**Correctly NOT flagged** (named anchors founding sub-lineages): `torque`, `blender`,
`eggbeater`, `flurry`, `reactor`, `twirl`, `flux`, `rev-whirl`, `double-pickup`,
`butterfly-swirl`, `double-switch-over`, `blizzard`, `bubba`, `barfly-swirl`.

Slice A (registering `sailing`) clears the 6 `sailing-*` tricks from this set
(their declared links resolve → rung 1), so they are excluded above.

## Implementation

**Service (`freestyleService.ts`)** — in the family build (`buildFamilyGroup` /
where cards are shaped):
- Build once per request: `foundsSubLineage = new Set(base_trick of every active
  trick where base_trick != slug)` and reuse the existing `rungBySlug` map.
- Compute `decompositionPending(row)` per the 4-rule predicate above.
- Add `decompositionPending: boolean` to the family card shape (family-view only;
  default false elsewhere). Do NOT add to the shared `DictionaryTrickCard` globally
  if avoidable — keep it a family-scoped overlay to limit blast radius.

**Template (`tricks.hbs`)** — in the family rung-band card loop, render a small badge
when `decompositionPending`:
`<span class="trick-pending-badge" title="Operator decomposition not yet authored">decomposition pending</span>`
Logic-light: branch only on the pre-shaped boolean.

**CSS (`style.css`)** — one muted pill class `.trick-pending-badge` (subdued,
non-alarming; this is informational, not an error).

**Tests (`freestyle.tricks-landing.routes.test.ts`)**:
- a folk gap (rung 0, founds nothing, derived) renders the badge;
- a named anchor (`torque`/`eggbeater` — founds a sub-lineage) does NOT;
- a decomposed trick (has links, e.g. `spinning-whirl`) does NOT;
- a core/self-anchor (`whirl`) does NOT.

## Out of scope / governance
- Does **not** hide, move to Emerging, or change family membership.
- Does **not** require amending the publication contract (it implements Req 5).
- A future hard hide/move-to-Emerging would be a separate governance change
  needing: a durable curator-set `publication_state` column, contract amendment
  (David-owned doc), and wiring hidden rows into `/freestyle/observational` so they
  do not vanish. Not this slice.
- The badge shrinks as the Tier-4 folk-decomposition worklist lands (each decomposed
  trick gains links → rung ≥ 1 → no longer flagged).
