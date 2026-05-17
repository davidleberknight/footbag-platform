# Post-L-polish Stabilization Plan (2026-05-16)

## Status

Planning + audit + minimal mechanical implementation. The full Slice L1-L6 movement-system browse roll-out is NOT in scope. This slice does the smallest reversible piece of the post-L-polish stabilization pass.

## What this slice implements (now)

| Task | Change | Scope |
|---|---|---|
| **1 — Demote legacy views** | Toggle bar visual: primary tier (`By ADD · By Family`) + separator (`— more views:`) + muted secondary tier (`By category · By component · Movement Neighborhoods`) | CSS + template edits |
| **2 — Rename topology → neighborhoods** | Dictionary toggle entry "By topology" → "Movement Neighborhoods"; glossary §9 heading "Movement Topologies" → "Movement Neighborhoods"; intro prose adjusted for reframing | Template + content; no service-shape change |

Two small mechanical changes. No service-layer work. No new browse view. No database/schema change.

## What this slice plans (deferred to follow-up slices)

| Task | Status | Notes |
|---|---|---|
| **3 — Lightweight Movement System prototype** | Deferred to Slice L1-L2 (per existing BROWSE_ARCHITECTURE_AUDIT) | Smallest viable shape proposed below |
| **4 — Symbolic rendering consistency audit** | Audit in §4 below; no implementation | Documents remaining mixed-dialect surfaces |
| **5 — Movement Neighborhoods groundwork** | Reframing label done in Task 2; full neighborhood reorganization deferred | Connective panels unchanged in this slice |

## 1. Smallest implementation slice (proposed for Slice L1)

When the curator approves Slice L1, the smallest viable Movement System prototype is:

### Files

| File | Role | Effort |
|---|---|---|
| `src/content/freestyleMovementSystems.ts` (NEW) | Curator-authored axis classification — 4 axes, ~10 modifier slugs per axis | ~50 lines |
| `src/services/freestyleService.ts` | Add `movementSystemView` to `FreestyleTricksIndexContent`; reuse modifier-link bucketing (already loaded for Component view) | ~40 lines added |
| `src/views/freestyle/tricks.hbs` | Add `?view=movement-system` branch; reuses dictionary-trick-card partial | ~30 lines added |
| `src/public/css/style.css` | Small additions for axis section headings | ~20 lines |
| `tests/integration/freestyle.movement-system-view.routes.test.ts` (NEW) | Invariant tests: 4 axes appear; pilot modifiers present; cards render | ~80 lines |

Total: ~220 lines code + tests.

### Content vs service split

**Pure content-module work:**
- Axis definitions (key, name, short description)
- Per-axis modifier-slug lists
- No new fields on existing data shapes

**Service-layer work:**
- Read modifier-link data (already loaded by Component view)
- Group by axis using the content module
- Reuse `shapeDictionaryTrickCard` per Slice H2 contract
- Filter to `kind === 'trick'` rows per Slice A contract

**Template work:**
- New `?view=movement-system` branch in `tricks.hbs`
- Renders 4 axis sections, each section has subsections for each modifier in the axis, each subsection iterates trick cards
- All cards via the existing dictionary-trick-card partial in registry density (per Slice H2 unification)

### Pilot lists (curator-confirmed in user prompt)

| Axis | Pilot modifiers |
|---|---|
| Set / Uptime Systems | pixie, fairy, atomic, stepping, surging |
| Entry Topologies | paradox |
| Midtime Body Modifiers | spinning, ducking, diving, weaving |
| No-Plant & Suspension | symposium |

11 modifiers across 4 axes. Each axis has at least 1; the curated set is small enough to validate visual rhythm before expanding.

## 2. What can remain purely content-module driven

The entire Movement System ontology can stay reversible per [[feedback_reversible_content_governance]]:

- **Axis definitions** — TypeScript map / array; curator-authored
- **Modifier-to-axis classification** — TypeScript content; same file
- **Display names** — TypeScript content
- **Pilot member lists** — derived from existing modifier-link data; never auto-derived from parser
- **Future axis additions** — add an entry to the content module; no schema/database change

NOTHING in Slice L1 requires a database column, table, or migration.

## 3. What requires service-layer work

- A new view-builder function `buildMovementSystemView(activeRows, axes, ...)` that groups by axis
- Wire-up in `getFreestyleTricksIndexPage` to pass the result to the template view-model
- Reuses `shapeDictionaryTrickCard` — no new card shape
- Reuses `isTrickRow` (Slice A) — no new filter

Service work is ~40 lines of additive code. No existing surface is touched.

## 4. Symbolic rendering consistency audit (Task 4 deliverable)

Surfaces where notation dialects still coexist after Slice K + L-polish:

### Surfaces that already render educational notation cleanly

| Surface | Dialect |
|---|---|
| Dictionary trick cards (all views) | tokenized compositional reading + ADD chip + media chip (post Slice H2 + K) |
| Glossary §7 Notation in practice block | tokenized compositional (Slice K) |
| Glossary §7 operator → compound mappings | tokenized compositional + named compound shorthand (Slice L-polish) |
| Glossary §8 walking-family progression | tokenized formulas (Slice L-polish) |
| Glossary §8 compression flow | role-tokenized via `notationExamples` (Slice C+K) |

### Surfaces that still mix dialects

| Surface | Issue | Severity | Suggested fix |
|---|---|---|---|
| **Trick detail page** | Carries the verbatim operational notation (`CLIP >> DIVE [BOD] > SAME FRONT WHIRL [DEX] > OP CLIP [XBD] [DEL]`) in a dedicated block. This is correct for detail-page mechanical reference, but if the user expects "Notation" everywhere to be educational compositional form, the detail page can surprise. | LOW — intentional layer separation per the four-layer rule | Add a small "Operational mechanics" label clarifying this layer; possibly demote visual weight |
| **Glossary §7 operational-notation reference (advanced subsection)** | Component flags, sides, directions, sequence operators are all `[DEX]` / `[BOD]` style — different dialect from the §7 educational tokens above | LOW — explicitly labeled "Advanced Reference" | Already labeled; no change |
| **Connective panels (glossary §9)** | `notationHint` field on each panel may use either dialect or mixed; curator-authored per panel | MEDIUM — could mislead | Curator pass; not a code change |
| **`/freestyle/sets` (set-notation reference)** | Listings of set primitives (pixie, atomic, etc.) with descriptive prose. Mostly educational but may carry some operational-notation references in worked examples | LOW | Targeted prose review; not in this slice |

### Pattern

After Slice H2 / K / L-polish, the dictionary's BROWSE surfaces speak the educational dialect uniformly. Surfaces that intentionally surface operational mechanics (trick detail page, §7 advanced reference) are clearly labeled. The remaining inconsistency lives in CURATOR-AUTHORED prose fields where a fix is curator-decision, not code.

**Conclusion:** the dictionary rendering kernel is now consistent. Remaining symbolic-rendering inconsistencies are content-level, not kernel-level. No code fix needed in this slice.

## 5. Risks of premature ontology hardening

| Risk | Mitigation |
|---|---|
| **Movement System axes set in stone before testing pedagogical readability** | Slice L1 is a prototype; small pilot list; reversible content module; curator validation pass between L2 and L3 per the original BROWSE_ARCHITECTURE_AUDIT sequence |
| **"Movement Neighborhoods" rename implies a polished neighborhoods system already exists** | Glossary §9 framing already says "intentionally incomplete" (Slice K); reinforce in the renamed view's section intro |
| **Demoting legacy views may signal they're being retired** | They are being retired per L4-L6. Demotion is honest signaling. Acceptable. |
| **Modifier-to-axis classification might shift** | Slice L1 content module is a TypeScript map; rebucketing is a 1-line edit; no DB consequence |
| **Cross-body, op/ss, near/far positional vocabulary tempted to grow into axis 2** | Slice L0 Q5: positional tokens stay glossary-only. Re-affirmed. |

## 6. Recommended implementation sequence

| Slice | Status |
|---|---|
| **Current slice (this one)** | Tasks 1 + 2 implemented now: legacy view demotion, topology→neighborhoods rename. Audit recorded. |
| **Manual QC pause** | Curator visually validates the demotion + rename + symbolic-rendering audit findings |
| **Slice L1** | `freestyleMovementSystems.ts` content module + service shaping. NO UI change. |
| **Slice L2** | New `?view=movement-system` view branch in tricks.hbs. Pilot lists rendered. Additive — old surfaces still present (now visually demoted from this slice). |
| **Manual visual QC pass** | Curator confirms ontology reads pedagogically |
| **Slice L4** | Retire `By Category` |
| **Slice L5** | Retire `By Component` |
| **Slice L6** | Reduce/refocus `Movement Neighborhoods` to genuinely cross-axis cohorts |

Per the original BROWSE_ARCHITECTURE_AUDIT Q7 decision: manual QC between every UI-affecting slice.

## 7. Mockups

### Toggle bar (current)

```
[By ADD] · By family · By category · By component · By topology
```

5 equal-weight entries.

### Toggle bar (after this slice)

```
[By ADD] · By family    — more views:    By category · By component · Movement Neighborhoods
```

Primary tier (left): full weight + size. Secondary tier (right): muted color, smaller font, "more views:" italic separator label.

### §9 heading (after this slice)

Before:
```
9. Movement Topologies                          [Advanced Reference] [observational]
```

After:
```
9. Movement Neighborhoods                        [Advanced Reference] [observational]
```

## 8. Restraint check

- ✅ No service-layer changes in this slice (service work deferred to Slice L1)
- ✅ No database changes
- ✅ No new browse views in this slice (additive new view deferred to Slice L2)
- ✅ Slice H2 / I / J / K / L-polish all intact
- ✅ Curator-confirmed pilot lists from user prompt
- ✅ Reversible: each change is a CSS rule + template edit; trivially rolled back
- ✅ No parser visualizations
- ✅ No interaction-heavy UI

End.
