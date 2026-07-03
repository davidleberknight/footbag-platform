# Packet 3 — Detail Page Completeness Charter

Review packet. **Read-only. No edits.** Charter for closing the gap between what the browse surfaces
claim and what a trick's detail page (`/freestyle/tricks/:slug`) explains. Principle: *if a trick
appears in a browse surface, its detail page should explain that relationship.*

All fixes below are **additive view-model + template changes** — the underlying content maps already
exist and are consumed by the browse side. **No schema, no canonical-data, no doctrine changes.**

## Surface inventory (grounded in live DB)

| surface | count |
|---|---:|
| active non-modifier detail pages | 708 |
| …all carry a `trick_family` | 708 |
| …modifier-bearing (have `modifier_links`) | 519 |
| …with `operational_notation` | 676 |
| rich-content coverage today (intuition + atom cards) | ~35 |
| …detail pages falling back to a terse one-liner | ~673 |

---

## The five workstreams

### 1. Family
**Today:** single-family only — `effectiveFamilySlug` (`freestyleService.ts:5859/5871`); the hero chip
+ ADD-tiered ladder render for one family.
**Gap:** branch→root containment is dropped. Browse renders branch members under their parent root via
`familyWithAncestors`; detail never calls it. **`mobius` shows only the torque ladder, never osis**,
and `FAMILY_DUAL_MEMBERSHIPS` is never read by detail.
**Fix:** resolve the family through `familyWithAncestors` + `resolveFamilyDualMemberships` to a *list*;
render one chip/ladder per family with an "also a {root} (every {branch} is a {root})" line, reusing
`branchParentName` already shaped at `freestyleService.ts:6958`.
**Surface count:** all branch-family members + the dual-membership set (mobius-class). **~30–60 pages**
materially change; the shaping change touches the family block on all 708.

### 2. Modifier
**Today:** modifier-layering panel renders **only at ≥3 modifier links** (`freestyleService.ts:5323`);
below that the modifier effect lives in a collapsed `<details>`. Cluster membership
(`freestyleModifierClusters.ts`) and `MODIFIER_COMPOSITION_GLOSSES` are browse-only.
**Gap:** the common 1–2 modifier trick (paradox/gyro/atomic/symposium compounds) never states which
modifiers it carries or what they do.
**Fix:** add a "Modifiers on this trick" block — each linked modifier with its cluster label
(`clusterForModifier`) and one-line `MODIFIER_COMPOSITION_GLOSSES` effect, deep-linked to
`?view=movement-system` — independent of the ≥3 gate.
**Surface count:** **519** modifier-bearing detail pages.

### 3. Movement System  ← largest gap
**Today:** **nothing.** `resolveAxisForModifier` (`freestyleMovementSystems.ts:94`) is never called in
detail shaping; the four-axis Movement System (the curator-declared *ontologically load-bearing* browse
path) has zero detail-page echo.
**Fix:** per modifier link, render an axis chip ("Movement system: Midtime Body Modifiers") deep-linked
to `?view=movement-system#{anchor}`; surface alt-surface group membership the same way.
**Surface count:** **519** modifier-bearing pages (+ the alternative-surfaces subset, ~11).

### 4. Neighborhood
**Today:** Related / Next / Previous / Topology all render. But every related trick carries a `rule`
discriminator (`freestyleRelatedTricks.ts:10`) that the template **discards** — relationships are
asserted with no reason.
**Fix:** surface the existing `rule` field as a per-row reason label in `trick-related.hbs`
("same family" / "shares {modifier}" / "structural parent"). **No new shaping** — data is already in
the view-model.
**Surface count:** all **708** detail pages (every page renders related tricks). Lowest effort.

### 5. fb.org Coverage
**Today:** ~35 tricks have rich content (23 `intuition` + 12 atom cards) and are clearly stronger than
fb.org on every dimension. The other **~673** fall back to a terse DB `description` that fb.org's
single worked technique paragraph beats.
**Fix (our own content; never copy fb.org):** (a) backfill `movement-intuition` for the highest-traffic
uncovered foundational tricks — **eggbeater, barfly, toe-blur, swirl, clipper** first; (b) rewrite
derivation-shorthand DB descriptions ("Double infinity.", "Rake trick.") into reader-facing technique
sentences; (c) add three greenfield slots fb.org also lacks: **member/coaching tips**, **learning
progression** (prereq → drill → common failure), **worked concrete examples**.
**Surface count:** ~673 thin pages; prioritize a **foundational ~30–50** first. Largest effort
(content authoring, not template).

---

## Implementation order (leverage ÷ effort)

| # | workstream | effort | leverage | pages |
|---|---|---|---|---|
| 1 | **Neighborhood reason labels** | trivial (template only, data present) | high | 708 |
| 2 | **Movement System axis chip** | low (one resolver call + chip) | **highest** (entire absent axis) | 519 |
| 3 | **Modifier block** (cluster + gloss, no ≥3 gate) | low | high | 519 |
| 4 | **Family branch→root + dual-membership** | medium (multi-family shaping) | medium (fixes mobius-class) | ~30–60 |
| 5 | **fb.org content backfill** | high (authoring) | high but slow | ~30–50 first, ~673 total |

Rationale: 1–3 are cheap template/shaping changes that close the two *absent* axes (movement system,
modifier membership) and the "why is this related?" gap across the whole surface; 4 is a contained
shaping change fixing the multi-family correctness bug; 5 is the long content tail, prioritized to the
foundational set where fb.org currently wins.

**Net:** workstreams 1–4 are a single additive view-model/template slice (no schema, no data, no
doctrine) touching ~700 pages; workstream 5 is an ongoing curator-authoring backlog.
