# Freestyle View-Organization Audit — Pass B (2026-05-24)

Research-only audit covering items 7-11 of the QC cleanup slice. **No UI implementation, no DB writes, no doctrine changes.** Output: per-view findings + concrete recommendations.

## Headline finding

5 of 6 dictionary browse views ALREADY render per-section counts. Most of the user's brief was directed at problems that already have solutions in place. The genuine gaps are:

1. **Family ordering is hard-coded with `whirl` first** — intentional curator-chosen anchor order, but the rationale is not surfaced on the page.
2. **`/freestyle/compositional-sets` already exists** and is the dictionary-hub the user described — but lacks the pixie/fairy/atomic/quantum movement-analogy framing the user requested.
3. **Observational / Emerging Vocabulary page is the one view without section counts** — flat card grid; trivial template-only fix if the curator wants buckets.
4. **10 active canonical rows have `trick_family=''`** (empty string) — data debt that surfaces as an unlabeled family-view bucket.
5. **The non-standard surface moves** (head, knee, sole, etc.) are NOT currently in Movement System view — they fit the (deferred) `/freestyle/alternative-surfaces` reference page from the topology audit.

## Item 7 — Family view

### Current state

| Aspect | Finding |
|---|---|
| Ordering | Hard-coded `FAMILY_ORDER` in `freestyleService.ts:5712` |
| Order | `whirl, rev-whirl, butterfly, osis, torque, blender, mirage, clipper, drifter, legover` (positions 1-10), then remaining families by insertion order |
| Counts shown? | Yes — `<span class="section-count">{{cards.length}}</span>` per family group at `tricks.hbs:134` |
| Family-anchor sublabel | Yes — `tricks.hbs:113` renders "Family-anchor: [name]" line |

### Top 20 families by trick count (active canonical rows)

| Family | Count | Family | Count |
|---|---:|---|---:|
| whirl | 33 | swirl | 6 |
| mirage | 25 | drifter | 5 |
| legover | 25 | double-leg-over | 5 |
| butterfly | 21 | eclipse | 4 |
| osis | 15 | barfly | 4 |
| illusion | 13 | paradon | 3 |
| pickup | 11 | barrage | 3 |
| clipper-stall | 10 | reverse-drifter | 2 |
| (empty `trick_family`) | 10 | pixie | 2 |
| torque | 9 | infinity | 2 |
| blender | 8 | (others) | ... |

### Why does `whirl` come first?

It's the deliberate first entry in the `FAMILY_ORDER` curator array. Three plausible justifications: highest population (33 tricks), pedagogically central (whirl is the "stall + spin" archetype many compounds descend from), or alphabetic-late-but-conceptually-prior. None of these is surfaced to the reader.

### Recommendations

| # | Recommendation | Cost | Rationale |
|---:|---|---|---|
| R7.1 | **Keep the hard-coded order.** Curator-chosen pedagogical ordering is more useful than count-descending or alphabetical for a freestyle audience. | nil | Whirl-first is reasonable; reverting to count-descending would put `whirl` first anyway (33 rows). |
| R7.2 | **Surface the ordering principle on the page.** One-sentence note above the family list: "Families are ordered by structural anchor weight, not alphabetically." | trivial template text | Answers the "why whirl first?" question without changing data. |
| R7.3 | **~~Fix the empty-`trick_family` data debt~~ — CLOSED 2026-05-24 as not-a-bug.** Investigation revealed all 10 rows are modifier-table parallel rows (`barraging`, `blazing`, `ducking`, `gyro`, `paradox`, `spinning`, `stepping`, `symposium`, `tapping`, `terraging`) with `category='modifier'`. Empty `trick_family` is the intentional project convention for modifier rows; the family-view UI filters them out via `isTrickRow()` at `freestyleService.ts:5722`. The audit's SQL `GROUP BY trick_family` surfaced what's actually a deliberate non-family bucket; the rendered output was already correct. See `feedback_modifier_public_visibility.md`. | nil (closed) | n/a |
| R7.4 | **Optional: add a small per-family-count summary strip** at the top of the family view, e.g. "20 families · 250 tricks active." Single line, no submenu. | trivial template | The user's TOC/submenu request risks visual bloat; a count strip is simpler. |

A full TOC submenu (jump links to each family heading) would be visually heavy for a one-page browse view. Skip unless the curator specifically wants it.

## Item 8 — Movement System view

### Current state

| Aspect | Finding |
|---|---|
| Submenu axes | 4 (verbatim labels): Set / Uptime Systems · Entry Topologies · Midtime Body Modifiers · No-Plant & Suspension |
| Per-axis count | Yes — `<span class="section-count">{{groups.length}}</span>` at `tricks.hbs:325` |
| Per-modifier count | Yes — `<span class="section-count">{{memberCount}}</span>` at `tricks.hbs:332` |
| Intro paragraph | "Four axes for navigating the freestyle movement language: how the set initiates (Set / Uptime), how the body enters (Entry Topologies), what the body does during the dex (Midtime Body), and discipline around plant and landing (No-Plant & Suspension). Each axis groups tricks by the modifiers they carry. Compounds may appear under multiple modifier headings within an axis; this is intentional." |

### Should non-standard surface moves (cloud, head, knee, sole, etc.) live here?

**No.** The audit at `exploration/nonstandard-topology-audit-2026-05-24/AUDIT.md` already concluded these belong on a dedicated `/freestyle/alternative-surfaces` reference page (11 rows scattered across 6 sub-categories; sparse-categorical). Movement System view is for **modifier-driven** axes (set/body modifiers applied to bases); alternative surfaces are **terminal-surface** structural exceptions. Different axis, different home. Don't conflate.

### Recommendations

| # | Recommendation | Cost |
|---:|---|---|
| R8.1 | **Keep the existing 4-axis structure.** It's working — counts in place, observational-not-canonical framing intact. | nil |
| R8.2 | **Enrich the intro paragraph with one concrete example per axis.** Example: "Set / Uptime Systems (pixie, fairy, atomic, quantum...) describes the launching motion. A pixie set is a same-side-in dex; a fairy set is a same-side-out dex. Entry Topologies (paradox) describes how the body enters the dex sequence: a paradox bodily-orients the dex to a side-positional inverse." Three examples (one per axis) keep the intro short while making it actionable. | small content edit |
| R8.3 | **Do NOT integrate non-standard surfaces here.** Defer to the alternative-surfaces reference page. | nil |

## Item 9 — Dedicated SETS page

### Current state

| Route | What it currently is |
|---|---|
| `/freestyle/sets` | Flat reference table of set notation; renders `src/views/freestyle/moves.hbs`. Formerly `/freestyle/moves`, renamed. |
| `/freestyle/compositional-sets` | **The dictionary-hub the user described.** 4 sections (§1 compositional premise · §2 family branching · §3 uptime reinterpretation ladders · §4 consistency audit). |
| Chris Holden's content | NOT directly committed. Referenced via "Holden parenthetical = platform doctrine" + "Holden's compilation" framing in `compositional-sets.hbs` §3 and audit context in `freestyleService.ts:6811-6819`. The actual `exploration/fborg/chrisHoldenSets.txt` file is uncommitted curator notes. |
| Pixie/fairy/atomic/quantum analogies | **Not present.** Searched for "ATW-like" / "orbit-like" / "pickup-like" / similar phrasing across `src/content/` and `src/views/freestyle/`; no matches. The `freestyleMovementSystems.ts:56` does name the structural family ("atomic family, pt10 relationships") but as taxonomy, not metaphor. |

### Distinction the user asked for

- **Movement System view** = tricks USING common modifier systems. Indexed by modifier.
- **`/freestyle/compositional-sets`** = SETS themselves as uptime tricks. Indexed by set primitive.

This distinction is **already implicitly in place** because the two surfaces exist with different intents. What's missing is:

1. **Explicit cross-link** between the two so readers understand they're complementary, not redundant.
2. **The movement-analogy framing** the user asked for (pixie = ATW-like uptime motion, fairy = orbit-like, atomic = pickup-like crossing, quantum = compressed-atomic-like).

### Recommendations

| # | Recommendation | Cost |
|---:|---|---|
| R9.1 | **Add movement analogies to `/freestyle/compositional-sets` §1 or §2** as a small content module. Curator-authored prose; suggested form: "Each set has an uptime motion analogous to a downtime trick. Pixie's same-side-in launch echoes the ATW motion (toe → same-side-in dex → toe). Fairy's same-side-out launch echoes the orbit motion. Atomic's opp-side-out launch echoes the pickup crossing. Quantum compresses the atomic motion into a shorter pre-base interval." | content module (curator-authored prose; 6-10 lines) |
| R9.2 | **Add a cross-link header to Movement System view** pointing at compositional-sets and vice versa: "For sets as tricks themselves, see Compositional Sets." | trivial template text |
| R9.3 | **Do NOT create a third sets page.** Two already exist; a third would dilute both. | nil |
| R9.4 | **Chris Holden's sets file**: keep as exploration-only curator notes. Use specific passages (with attribution) as content sources for §1 analogies if the curator wants. Don't link the raw file from the public glossary (internal repo path). | curator decision per use |

## Item 10 — Movement Neighborhoods view

### Current state

| Aspect | Finding |
|---|---|
| Categories | Hard-coded at `freestyleService.ts:4463-4502` |
| Labels (verbatim) | Hippy downtime dex · Leggy dex · Whirl / swirl structures · Pixie uptime dex · Symposium clipper structures · Ducking clipper structures |
| Ordering | Declaration order (static array; no re-sort) |
| Per-category count | Yes — `<span class="section-count">{{memberCount}}</span>` at `tricks.hbs:283` |
| Observational framing | "Movement Neighborhoods group tricks that share a movement feel, timing pattern, or structural relationship across families: hippy vs leggy, whirl vs swirl, uptime vs midtime patterns. They are a way to explore similarity, not an official family classification. The family view remains the structural reference." |
| Individual-names rule | RESPECTED (per `feedback_no_individual_names_freestyle_views`) |

### Recommendations

| # | Recommendation | Cost |
|---:|---|---|
| R10.1 | **Keep the 6 categories.** They're observational not canonical; the framing is already correct. | nil |
| R10.2 | **Re-order to pair related neighborhoods.** Current order is somewhat scattered. Proposed pairing-aware order: Hippy downtime dex · Leggy dex (paired) — Pixie uptime dex (paired with uptime motion via the future compositional-sets cross-link) — Whirl / swirl structures (rotational pair) — Symposium clipper structures · Ducking clipper structures (clipper-anchored pair). | one-line code change in `TOPOLOGY_GROUPS` array |
| R10.3 | **Make "hippy downtime dex" anchor explicit.** Add a one-line sub-label under each category heading explaining what the neighborhood IS (the implicit category name doesn't tell a beginner what "hippy downtime" means). | small content module + template addition |
| R10.4 | **Don't add a submenu.** Six categories is small enough to scroll; a TOC submenu would feel heavyweight. | nil |

## Item 11 — Counts on all dictionary views

### Current state

| View | Count shown? | Field |
|---|---|---|
| ADD (`?view=add`) | YES | `{{cards.length}}` per ADD group |
| Family (`?view=family`) | YES | `{{cards.length}}` per family |
| Movement System (`?view=movement-system`) | YES (per axis AND per modifier) | `{{groups.length}}` axis; `{{memberCount}}` modifier |
| Movement Neighborhoods (`?view=topology`) | YES | `{{memberCount}}` per neighborhood |
| Dex Count (`?view=dex-count`) | YES | `{{cards.length}}` per dex bucket |
| **Emerging Vocabulary (`/freestyle/observational`)** | **NO** | Flat card grid, no bucketing |

### Recommendations

| # | Recommendation | Cost |
|---:|---|---|
| R11.1 | **Add a single top-of-page count strip on Emerging Vocabulary.** Format: "{N} observational tricks pending canonical review." Reuses the existing observational template; no buckets needed. | trivial template-only |
| R11.2 | **Keep the other 5 views as-is.** They already have appropriate counts. | nil |
| R11.3 | **Explain the "Unknown / no notation" bucket on dex-count.** Currently the dex-count view's "Unknown" bucket (62 active rows) reads as mysterious. Add a one-line note: "Rows in 'Unknown' have not yet had their operational notation populated; the trick is canonical but the dex count cannot be derived without notation." | trivial template addition |

## Summary of recommendations

| ID | Recommendation | Cost | Priority |
|---|---|---|---|
| R7.1 | Keep family hard-coded order | nil | ✓ already correct |
| R7.2 | One-line note explaining family ordering | trivial | medium |
| R7.3 | ~~Fix 10 empty `trick_family` rows~~ — CLOSED as not-a-bug | nil | closed |
| R7.4 | Optional family-count summary strip | trivial | low |
| R8.1 | Keep Movement System 4-axis structure | nil | ✓ already correct |
| R8.2 | Enrich intro paragraph with one example per axis | small content | medium |
| R8.3 | Don't add unusual surfaces here | nil | ✓ already correct |
| R9.1 | Add movement analogies to compositional-sets | content (6-10 lines) | high (user explicitly asked) |
| R9.2 | Cross-link Movement System ↔ Compositional Sets | trivial | medium |
| R9.3 | Don't create a third sets page | nil | ✓ already correct |
| R9.4 | Keep Holden's sets file as curator notes | nil | ✓ already correct |
| R10.1 | Keep 6 Movement Neighborhoods | nil | ✓ already correct |
| R10.2 | Re-order categories by pairing | one-line code | low |
| R10.3 | Add sub-label explaining each category | small content | medium |
| R10.4 | Don't add submenu | nil | ✓ already correct |
| R11.1 | Add count to Emerging Vocabulary page | trivial template | medium |
| R11.2 | Keep other 5 views as-is | nil | ✓ already correct |
| R11.3 | Explain "Unknown" bucket on dex-count | trivial template | low |

## Sequencing if curator approves

**Single small follow-up implementation slice** could land:
- R11.1 (Emerging Vocabulary count)
- R11.3 (Unknown bucket explainer on dex-count)
- R7.2 (family ordering note)
- R9.2 (Movement-System ↔ Compositional-Sets cross-links)

Total: 4 trivial template / content edits. No service changes, no doctrine changes, no test churn.

**A second slice** could land:
- R9.1 (pixie/fairy/atomic/quantum movement-analogy content) — requires curator-authored prose
- R8.2 (Movement System intro examples) — requires curator-authored prose
- R10.3 (Movement Neighborhoods sub-labels) — requires curator-authored prose
- R10.2 (Movement Neighborhoods re-order) — single-line code change

Total: 3 content edits + 1 ordering edit.

**A third (curator-driven) cleanup**:
- ~~R7.3 (empty `trick_family` 10 rows)~~ — CLOSED 2026-05-24 as not-a-bug. The 10 rows are modifier-table parallel rows; empty `trick_family` is intentional convention; family view already filters them via `isTrickRow()`.

## What this audit explicitly does NOT recommend

- ❌ A TOC / submenu on the family view (visual bloat for 20+ families)
- ❌ A third sets page
- ❌ Moving unusual surfaces (cloud, head, etc.) into Movement System view
- ❌ Naming individuals on browse pages (current rule respected)
- ❌ Reordering family view by count (would still put `whirl` first; no functional change)
- ❌ Removing or restructuring any existing view

## Guardrails honored (Pass B)

- ✅ No broad visual redesign
- ✅ No UI implementation in this slice
- ✅ No doctrine invention
- ✅ No browse simplicity violation (all proposed changes either trivial or curator-paced content)
- ✅ Browse stays simple, detail gets depth (no proposed shift in this contract)
