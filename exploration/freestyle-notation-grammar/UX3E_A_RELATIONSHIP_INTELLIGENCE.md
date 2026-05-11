# UX3e-a -- Relationship Intelligence Surfaces

Date: 2026-05-11. Status: design exploration only. No DB writes, no ontology mutation, no schema work, no implementation.

Reference: `UX3_FLAGSHIP_SYNTHESIS.md` (§8 relationship rendering), `UX3D_E_SEMANTIC_CLUSTER.md`, current Montage / Mind Bender / Matador pages.

Primary principle: **help the user understand structural position inside the freestyle ecosystem.** Not "more widgets" -- "more navigable structure".

Out of scope per user direction: DB writes, ontology mutation, graph library, client JS, schema work.

---

## 1. Existing relationship surfaces (audit)

Before proposing new surfaces, an inventory of what already renders today:

| Surface | Source | Activation | Coverage |
|---------|--------|------------|----------|
| Family ladder (UX3c-b tier-grouped) | service `familyTiers`; data: `freestyle_tricks` family + adds | family.length > 1 | universal |
| Related Tricks (R1/R2/R3 derivation) | service `relatedTricks`; data: name-derived modifier/family heuristics | derived list non-empty | universal |
| Previous Tricks (lower-ADD same-family) | service `previousTricks` | derived list non-empty | universal |
| Next Tricks (higher-ADD same-family) | service `nextTricks` | derived list non-empty | universal |
| Pathways block (Learn / Watch / Family) | service `pathways` | always | universal |

What's missing:

- **Modifier substitutions** -- "same blender frame with different body modifier"
- **Parallel compounds** -- "different decomposition reaches same family+ADD"
- **Modifier ecosystems** -- "where else does this modifier appear?"
- **Cross-family difficulty neighbours** -- "what other 7-ADD tricks exist across families?"
- **Compact constellation graph** -- visual centre-and-spokes layout

The existing surfaces cover **same-family vertical navigation**. The gap is **cross-family horizontal navigation** and **modifier-aware comparisons**. UX3e-a fills that gap.

---

## 2. Relationship taxonomy

Six relationship types. Each is a different lens onto the dictionary.

### 2.1 Same-base transformations (existing)

Definition: tricks sharing the same `base_trick`.
Current surface: Family ladder (tier-grouped per UX3c-b).
Coverage: universal.
Gap: none -- already comprehensive.

### 2.2 Modifier substitutions (NEW)

Definition: tricks with the **same base + same modifier count + sharing N-1 modifiers** (one modifier swapped).
Pedagogical value: highest. The pair makes the differentiating modifier visible by isolation.

Examples from current data:

| Current trick | Substitutions | Swap |
|---------------|---------------|------|
| Mind Bender (ducking + paradox + blender) | Spender (spinning + paradox + blender) | ducking ↔ spinning |
| Matador (nuclear + butterfly, 1 mod) | atomic-butterfly, dimwalk, ducking-butterfly, ripwalk, sidewalk, spinning-butterfly, tripwalk | nuclear ↔ each |
| Spender (spinning + paradox + blender) | Mind Bender (ducking + paradox + blender) | spinning ↔ ducking |
| Tripwalk (quantum + butterfly) | atomic-butterfly, dimwalk, ducking-butterfly, ripwalk, sidewalk, spinning-butterfly | quantum ↔ each |
| Phoenix (pixie + ducking + butterfly) | (none -- no other 2-mod butterfly shares pixie or ducking with phoenix today) | -- |
| Montage (4 mods + whirl) | (none -- no other 4-mod whirl exists today) | -- |

Activation rule: `>= 1 substitution candidate exists`. Phoenix and Montage simply don't render the section.

### 2.3 Difficulty-neighbor ladders (existing)

Definition: tricks of adjacent ADD value in the same family.
Current surface: Previous Tricks + Next Tricks lists.
Coverage: universal.
Gap: cross-family difficulty bucket ("other 7-ADD tricks anywhere") is missing. But that's better as a separate index route (`/freestyle/tricks?adds=7`), not per-trick.

### 2.4 Modifier ecosystems (NEW)

Definition: for each modifier on the current trick, surface 2-3 cross-family examples of that modifier.
Pedagogical value: high. Reveals how a modifier reads across the dictionary.

Live data: cross-family modifier coverage:

| Modifier | Tricks | Families | Cross-family rich? |
|----------|-------:|---------:|:------------------:|
| paradox | 17 | 7 | YES |
| spinning | 14 | 10 | YES |
| stepping | 13 | 9 | YES |
| symposium | 10 | 5 | YES |
| ducking | 10 | 6 | YES |
| pixie | 9 | 7 | YES |
| blurry | 6 | 6 | YES |
| tapping | 3 | 3 | thin |
| quantum | 3 | 3 | thin |
| nuclear | 2 | 2 | sparse |

Activation rule: `modifier appears in >= 3 other tricks AND >= 2 families` (excludes the current trick from the count). Renders 2-3 representative samples per modifier, prefering cross-family.

Per-trick activation:

| Trick | Modifiers | Modifiers passing the threshold |
|-------|-----------|----------------------------------|
| Montage | ducking, paradox, spinning, symposium | all 4 |
| Mind Bender | ducking, paradox | both |
| Phoenix | pixie, ducking | both |
| Matador | nuclear | 0 (nuclear is sparse) |

So Montage gets 4 ecosystem panels, Mind Bender + Phoenix get 2 each, Matador gets 0.

### 2.5 Parallel compounds (NEW)

Definition: tricks with the **same family + same ADD value** but different `modifier_links` set.
Pedagogical value: medium-high. Shows "alternative paths to the same difficulty in the same family".

Examples:

| Current trick | Parallels | Differentiator |
|---------------|-----------|----------------|
| Matador (5 ADD butterfly) | Phoenix, bigwalk | 1-mod vs 2-mod paths |
| Phoenix (5 ADD butterfly) | Matador, bigwalk | 2-mod vs 1-mod vs 2-mod different sets |
| Mind Bender (6 ADD blender) | Spender, food-processor | different modifier sets |
| Spender (6 ADD blender) | Mind Bender, food-processor | same |
| Montage (7 ADD whirl) | (none -- no other 7-ADD whirl in dict) | -- |
| Mullet (6 ADD whirl) | surreal (6 ADD whirl) | different decomp |

Activation rule: `>= 1 parallel exists (same family + same adds + different slug)`.

### 2.6 Compact constellation graph (FLAGSHIP / DEFERRED)

Per `UX3_FLAGSHIP_SYNTHESIS.md` §8.1: a small SVG (≤7 nodes) centred on the current trick with edges to (a) constituents, (b) ADD neighbours, (c) cross-family parallels.

Server-side computation needed: pick the 5-7 most relevant relations per trick. Fixed radial layout (no JS physics).

For Montage:
```
                    [spinning-whirl]
                          |
[ducking-whirl]──[Montage]──[paradox-whirl]
                          |
                  [symposium-whirl]──[mullet]
```

5-6 nodes. Doable as a static SVG.

For Matador:
```
[atomic-butterfly]──[Matador]──[Phoenix]
                       |
                  [butterfly]
```

3-4 nodes. Even simpler.

**Risk:** SVG generation requires service-layer geometry math, role-colour palette consistency, mobile fallback (hide below 600px per UX3a). Higher complexity than list-based panels for similar information density. **Defer.**

---

## 3. Recommended NEW surfaces

Three new surfaces, ordered by ROI:

### 3.1 Parallel compounds panel (safe-now)

**Data query:** same family + same adds + different slug, excluding self. Service-side derivation; no schema work.

**Render shape:**
```html
<section class="content-section trick-parallels">
  <div class="section-heading">
    <h2>Parallel tricks</h2>
    <p class="section-intro">Other {family}-family compounds reaching {adds} ADD via different decompositions.</p>
  </div>
  <ul class="parallels-list">
    <li>
      <a href="/freestyle/tricks/{slug}">{canonical_name}</a>
      <span class="parallel-decomp">{base}({base_adds}) + {modifier(s)}({weight(s)}) = {adds}</span>
    </li>
    ...
  </ul>
</section>
```

The decomposition snippet beside each parallel is the key value-add: a learner sees BOTH paths at a glance.

**Activation:** `>= 1 parallel exists`. Cap at 4 results.

**Cluster placement:** AFTER Related Tricks, BEFORE Previous/Next Tricks. Adjacent to family lineage so it reads as "another lens on the family".

### 3.2 Modifier substitutions panel (safe-now)

**Data query:** same base + same modifier_count + share N-1 modifiers + different swap candidate.

**Render shape:**
```html
<section class="content-section trick-substitutions">
  <div class="section-heading">
    <h2>Modifier substitutions</h2>
    <p class="section-intro">Same base, same modifier count -- one modifier swapped.</p>
  </div>
  <ul class="substitutions-list">
    <li>
      <a href="/freestyle/tricks/{slug}">{canonical_name}</a>
      <span class="swap-arrow">{ours} ↔ {theirs}</span>
    </li>
  </ul>
</section>
```

The `swap-arrow` shows exactly which modifier is being substituted. For Mind Bender vs Spender: "ducking ↔ spinning".

**Activation:** `>= 1 substitution candidate exists`. Cap at 4 results.

**Cluster placement:** Right after Parallel tricks, both inside the lateral-navigation zone.

### 3.3 Modifier ecosystem panels (medium risk)

**Data query:** per modifier on the current trick, find 2-3 other tricks using that modifier across different families.

**Render shape:**
```html
<section class="content-section trick-modifier-ecosystems">
  <div class="section-heading">
    <h2>Modifier ecosystems</h2>
    <p class="section-intro">Each modifier on this trick, with cross-family examples.</p>
  </div>
  {{#each modifierEcosystems}}
  <div class="ecosystem-card ecosystem-{cssRole}">
    <span class="ecosystem-modifier-label">{modifierName}</span>
    <ul class="ecosystem-samples">
      {{#each samples}}
      <li><a href="/freestyle/tricks/{slug}">{canonical_name}</a> ({family}, {adds} ADD)</li>
      {{/each}}
    </ul>
  </div>
  {{/each}}
</section>
```

Each modifier becomes a small card with 2-3 sample siblings.

**Activation per modifier:** `modifier appears in >= 3 other tricks AND >= 2 families`.

**Cluster placement:** below Parallel + Substitution panels; closes the "lateral navigation" zone.

**Selection rule (which 2-3 samples to surface per modifier):** prefer cross-family first; pick one same-family + 2 cross-family; randomise within ADD-tier for variety; or pick by ADD-tier diversity (one lower, one same, one higher). Recommendation: **diversify by ADD-tier**.

---

## 4. Per-page worked examples

### 4.1 Montage (4 modifiers, dense family)

Already activated surfaces: Family ladder, Related Tricks, Previous Tricks, Pathways.

New surfaces:
- Parallel tricks: **0** rendered (no other 7-ADD whirl in dict)
- Modifier substitutions: **0** rendered (no other 4-modifier whirl)
- Modifier ecosystems: **4** panels (ducking, paradox, spinning, symposium all rich enough)

Montage's value-add from UX3e-a is the **modifier ecosystem** view: a learner studying montage can see how each of its 4 modifiers reads across the dictionary, which builds intuition about modifier semantics.

### 4.2 Mind Bender (2 modifiers, sparse blender family)

New surfaces:
- Parallel tricks: **2** (Spender, food-processor — same 6-ADD blender, different decomp)
- Modifier substitutions: **1** (Spender — ducking ↔ spinning, paradox+blender unchanged)
- Modifier ecosystems: **2** panels (ducking, paradox)

Mind Bender's value-add is the **modifier substitution** pair with Spender -- the strongest pedagogical lens.

### 4.3 Phoenix (2 modifiers, dense butterfly family)

New surfaces:
- Parallel tricks: **2** (Matador 1-mod, bigwalk 2-mod) at 5-ADD butterfly tier
- Modifier substitutions: **0** (no 2-mod butterfly shares a modifier with phoenix today)
- Modifier ecosystems: **2** panels (pixie, ducking)

Phoenix's value-add is the **parallel tricks** view paired with Matador -- two paths to 5 ADD on butterfly.

### 4.4 Matador (1 modifier, dense butterfly family)

New surfaces:
- Parallel tricks: **2** (Phoenix 2-mod, bigwalk 2-mod)
- Modifier substitutions: **7** (every 1-mod butterfly compound) -- cap at 4
- Modifier ecosystems: **0** panels (nuclear is too sparse; appears in only 1 other trick)

Matador's value-add is the **modifier substitution** view -- a learner sees the full 1-mod butterfly tier at a glance, with nuclear isolated as the differentiator.

### 4.5 Atoms (Toe Stall, Mirage, base butterfly)

New surfaces:
- Parallel tricks: 0 (atoms have unique adds within family)
- Modifier substitutions: 0 (no modifiers)
- Modifier ecosystems: 0 (no modifiers)

Atoms add no clutter. UX3e-a is invisible on sparse pages.

---

## 5. Activation thresholds (data-driven, per surface)

| Surface | Activation |
|---------|------------|
| Parallel tricks | `>= 1 same-family-same-ADD-different-slug exists` |
| Modifier substitutions | `>= 1 same-base-same-count-share-N-1 exists` |
| Modifier ecosystems (per modifier) | `modifier appears in >= 3 other tricks AND >= 2 families` |

All three surfaces gate independently. A given trick may activate 0, 1, 2, or 3 of them based on data.

---

## 6. Anti-clutter constraints

Per the user direction "the goal is NOT more widgets":

| Constraint | Discipline |
|-----------|-----------|
| Max 4 rows per panel | Hard cap on parallel + substitution lists |
| Max 3 samples per modifier ecosystem | Hard cap per ecosystem card |
| All surfaces gate on data presence | No empty panels render |
| Atom pages render zero new surfaces | Sparse-friendly preserved |
| Panels live in the lateral-navigation zone | NOT inside the semantic cluster; preserves cluster purity |
| Single h2 per panel (no nested h2s, no sub-h3 cards within) | Heading outline stays clean |
| No new colour categories | Reuse existing cool-palette role classes |
| No client JS | Pure HBS + CSS |
| Mobile flex-wrap | Standard responsive |
| No constellation graph | Lists conveyance only; defer SVG geometry to a future phase |

---

## 7. Mobile constraints

At 375 px:
- Parallel + substitutions panels: list with each row wrapping; decomposition snippet drops to a second line per row
- Modifier ecosystem panels: ecosystem cards stack vertically; each card's sample list wraps per row
- Section h2 + intro shrink per UX3d-d existing media-query rules
- No horizontal scroll
- Each list cap (4 / 3) keeps the panels predictably small even on narrow viewports

Worst case is Montage with 4 ecosystem panels: 4 × 3 samples = 12 sample links + 4 modifier labels. Vertically that's ~12-16 lines at mobile. Still scannable; under one viewport-and-a-half.

---

## 8. Categorised proposals

### 8.1 Safe now

| # | Surface | Why safe | ROI |
|---|---------|---------|-----|
| EA1 | Parallel tricks panel | Simple query (same family + same adds); cap at 4; data-driven gate | high (3 of 4 reference flagships activate) |
| EA2 | Modifier substitutions panel | Query is set-diff between modifier_links; cap at 4; data-driven gate | high (Matador + Mind Bender activate strongly) |

Both are list-based, no SVG, no graph layout, no client JS. Server-side derivation + a partial each.

### 8.2 Medium risk

| # | Surface | Why medium | Notes |
|---|---------|-----------|-------|
| EA3 | Modifier ecosystem panels | Selection rule (which 3 samples per modifier) needs spec; per-modifier card structure adds visual surface | Montage gets 4 panels; need anti-clutter careful CSS |
| EA4 | Cross-family ADD-tier index page | `/freestyle/tricks?adds=7` browse view | Better as separate route than per-trick surface |
| EA5 | Anchor a "Related" cluster header at the top of the lateral-navigation zone | Single h2 introducing parallels + substitutions + ecosystems | Strong unification but affects existing heading outline |

### 8.3 Avoid

| # | Anti-pattern | Why avoid |
|---|-------------|-----------|
| EA6 | SVG constellation graph in UX3e-a | High complexity; mobile concerns; same info conveyed by list-based panels. Defer to a future phase if list panels prove insufficient |
| EA7 | Client JS graph library | Out of scope per user direction |
| EA8 | Force-directed layouts | Same as EA7 |
| EA9 | Cross-family ADD-tier surface inside each trick page | Better as a separate index route; per-trick surface would add clutter on every page |
| EA10 | A "see all related tricks" expanded view inline | Adds clutter; existing Related Tricks list already serves this |
| EA11 | New colour categories beyond cool palette | Stays inside the existing role-colour vocabulary |
| EA12 | Modifier substitution panel showing >= 5 substitutions | Cap at 4 is anti-clutter discipline |

---

## 9. Implementation sketches (safe-now -- EA1 + EA2)

Service layer (would land in a future implementation phase, not this exploration):

```typescript
// EA1 -- parallel tricks
function buildParallelTricks(
  trick: FreestyleTrickRow,
  allDictRows: FreestyleTrickRow[],
): ParallelTrick[] {
  if (!trick.adds || !/^\d+$/.test(trick.adds)) return [];
  if (!trick.trick_family) return [];
  return allDictRows
    .filter(r =>
      r.slug !== trick.slug &&
      r.trick_family === trick.trick_family &&
      r.adds === trick.adds &&
      r.is_active === 1,
    )
    .slice(0, 4)
    .map(r => ({
      slug: r.slug,
      canonicalName: r.canonical_name,
      detailHref: `/freestyle/tricks/${r.slug}`,
      decompSummary: /* short formula text via existing addComposition or modifier_links join */,
    }));
}

// EA2 -- modifier substitutions
function buildSubstitutions(
  trick: FreestyleTrickRow,
  modifierLinks: FreestyleTrickModifierLinkDetailRow[],
  allDictRows: FreestyleTrickRow[],
  allModifierLinks: Map<string, string[]>,
): Substitution[] {
  if (!trick.base_trick || modifierLinks.length === 0) return [];
  const ourMods = new Set(modifierLinks.map(l => l.modifier_slug));
  return allDictRows
    .filter(r => r.slug !== trick.slug && r.base_trick === trick.base_trick && r.is_active === 1)
    .map(r => {
      const theirMods = new Set(allModifierLinks.get(r.slug) ?? []);
      if (theirMods.size !== ourMods.size) return null;
      const shared = [...ourMods].filter(m => theirMods.has(m)).length;
      if (shared !== ourMods.size - 1) return null;
      const oursOnly = [...ourMods].find(m => !theirMods.has(m));
      const theirsOnly = [...theirMods].find(m => !ourMods.has(m));
      return {
        slug: r.slug,
        canonicalName: r.canonical_name,
        detailHref: `/freestyle/tricks/${r.slug}`,
        swapFrom: oursOnly,
        swapTo: theirsOnly,
      };
    })
    .filter((x): x is Substitution => x !== null)
    .slice(0, 4);
}
```

Template (would be a new partial):

```hbs
{{#if content.parallelTricks.length}}
<section class="content-section trick-parallels">
  <div class="section-heading">
    <h2>Parallel tricks</h2>
    <p class="section-intro">Same family, same ADD -- different decomposition.</p>
  </div>
  <ul class="parallels-list">
    {{#each content.parallelTricks}}
    <li>
      <a href="{{detailHref}}">{{canonicalName}}</a>
      {{#if decompSummary}}<span class="parallel-decomp">{{decompSummary}}</span>{{/if}}
    </li>
    {{/each}}
  </ul>
</section>
{{/if}}
```

CSS (~30 lines for both surfaces). Reuses existing typography conventions.

---

## 10. Recommendation order

1. **Implement EA1 (Parallel tricks)** as the first new relationship surface. Activates on 3 of 4 reference flagships (Matador, Phoenix, Mind Bender); skips Montage; skips atoms. Single partial; clean data query; clear pedagogical value.
2. **Then EA2 (Modifier substitutions)** if EA1 lands without friction. Activates strongly on Matador (cap at 4 from 7 candidates) and Mind Bender (1 candidate); skips Phoenix and Montage. Same risk profile as EA1.
3. **Defer EA3 (Modifier ecosystems)** until after EA1+EA2 review. Adds 4 cards on Montage; visual surface significant; selection rule needs spec.
4. **Defer EA6 (constellation graph)** indefinitely; revisit only if list-based panels prove insufficient for "structural position" comprehension.
5. **Never EA4/EA10/EA11** in UX3e-a scope.

---

## 11. What this gives the user

Per the principle "help the user understand structural position":

- **Matador's page**, post-EA1+EA2: shows 2 parallels (Phoenix, bigwalk) + 4 substitutions (nuclear ↔ each of: pixie / atomic / ducking / spinning / etc.). The user now sees: "Matador is the nuclear-modifier path to 5-ADD butterfly; here are the alternatives".
- **Phoenix's page**, post-EA1: shows 2 parallels (Matador, bigwalk). The user sees: "Phoenix is the pixie+ducking path; there's also the nuclear path (Matador) and the spinning+stepping path (bigwalk)".
- **Mind Bender's page**, post-EA1+EA2: 2 parallels (Spender, food-processor) + 1 substitution (Spender, ducking↔spinning). The user sees the cleanest A/B teaching pair on the site.
- **Montage's page**, post-EA1+EA2: 0 parallels, 0 substitutions. Value comes from EA3 (modifier ecosystems) when shipped, or stays content-driven via the existing Related Tricks list.
- **Atoms** stay sparse-friendly: 0 new surfaces render.

---

## 12. Decision points

1. **Approve safe-now EA1 + EA2 for implementation in a follow-up phase?** Pure design exploration in UX3e-a; nothing shipped.
2. **Confirm activation thresholds?**
   - Parallels: `>= 1 same-family-same-ADD-different-slug`
   - Substitutions: `>= 1 same-base-same-count-share-N-1`
   - Ecosystems: `modifier appears in >= 3 other tricks AND >= 2 families`
3. **Confirm caps?** 4 rows per list, 3 samples per modifier ecosystem.
4. **Confirm placement?** Below Related Tricks, above Previous/Next Tricks, inside the lateral-navigation zone (NOT inside the semantic cluster).
5. **Skip the constellation graph (EA6) for UX3e-a?** Defer indefinitely; only revisit if list panels prove insufficient.
6. **Cross-family difficulty bucket (EA4) as a separate route**, not per-trick?
