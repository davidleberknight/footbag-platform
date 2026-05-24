# Non-Standard Topology Browse Audit (2026-05-24)

Research-only audit. **No UI implementation, no DB writes, no doctrine changes.** Builds 4 review CSVs + design recommendations for browse views that surface meaningful structural exceptions rather than dominant defaults.

The audit was prompted by an insight from the dex-count prototype: browse axes should expose *signal*, not statistically dominant noise. Toe-start / clipper-end dominate freestyle naturally; an "Alternative surfaces" view that buckets the same 200 toe/clipper tricks into the same 200 toe/clipper rows under a new label adds no information. The educational signal lives in deviations.

## Headline data (Part A)

270 active canonical rows analyzed (operational_notation parsed for entry/terminal surface; body-token + flying-marker scanned).

### Entry surface distribution

| Entry surface | Rows | Share |
|---|---:|---:|
| CLIPPER | 88 | 33% |
| TOE | 76 | 28% |
| SET (generic) | 39 | 14% |
| Unparseable (no op_notation OR non-standard form) | 67 | 25% |
| Unusual entry (CLOUD/HEAD/KNEE/etc) | 0 | 0% |

### Terminal surface distribution

| Terminal surface | Rows | Share |
|---|---:|---:|
| CLIPPER | 106 | 39% |
| TOE | 83 | 31% |
| Unparseable | 64 | 24% |
| SOLE | 3 | 1.1% |
| INSIDE | 3 | 1.1% |
| CLOUD | 2 | 0.7% |
| OUTSIDE | 2 | 0.7% |
| OSIS / FOREHEAD / HEAD / HEEL / KNEE / NECK / SHOULDER | 1 each | 0.4% each |

**Total unusual terminal surfaces: 16 / 270 ≈ 6%.** This is the *entire* population of canonical rows that land on a body-part or surface-variant other than toe-stall / clipper-stall / inside-stall. The remaining 94% are toe-and-clipper-dominant.

### Movement-pathway markers

| Marker | Rows |
|---|---:|
| Has any body-token ([BOD] / DUCK / SPIN / DIVE / JUMP / WALK / etc.) | 87 |
| Has flying / JUMP marker (airborne mid-trick) | 8 |
| Has unusual surface (entry or terminal) | 11 |
| No operational_notation populated yet | 62 |

## What "non-standard topology" means (Part B)

Six categories of structural deviation, ordered roughly by curator-decision novelty:

| Category | Definition | Example rows |
|---|---|---|
| **Body-surface stalls** | Trick terminates on a non-foot body part | head-stall, neck-stall, shoulder-stall, forehead-stall, knee-stall, cloud-stall |
| **Foot-edge surfaces** | Stall or kick on sole / heel (bottom or back of foot) | sole-stall, sole-kick, heel-stall, cross-body-sole-stall |
| **Airborne entry** | Trick begins from airborne position (no surface contact) | flying-clipper, flying-inside, flying-outside, dragonfly-kick |
| **Airborne mid-trick** | Body becomes airborne during the trick via JUMP | butterfly-kick, atomic-eclipse, miraging-eclipse, pixie-eclipse |
| **Non-stall terminal** (kicks) | Trick ends in a kick or pass-through, not a stall | cloud-kick, sole-kick, dragonfly-kick, butterfly-kick |
| **Atypical base terminals** | Trick terminates on a base trick rather than a surface (rare) | ducking-osis (terminal = OSIS) |

The categories are NOT mutually exclusive — `butterfly-kick` is both "airborne mid-trick" and "non-stall terminal"; `cloud-kick` is both "body-surface" and "non-stall terminal". Curator-paced cross-tagging is needed if these become primary browse axes.

### What is NOT a useful "exception" category

- **"Has any body-token"** (87 rows) — too broad. Every duck-mirage, spinning-paradox-X, and symposium-* row matches; the dominant DUCK/SPIN compounds saturate the bucket. This is "compound trick", not "exceptional topology".
- **"3+ dex events"** (already in the dex-count view) — high-density, not topology-exceptional.
- **"By family"** (already a view) — orthogonal axis; not a topology lens.

## High-value browse views (Part C)

Recommended NEW views (in priority order):

| # | Proposed view | Concept | Rows it would surface | Curator effort |
|---:|---|---|---:|---|
| 1 | **Alternative surfaces** | Stalls + kicks on non-toe-non-clipper body/foot surfaces | ~11 | Low (data already in DB) |
| 2 | **Flying / airborne** | Tricks where the body becomes airborne (entry OR mid-trick) | ~8 | Low (clear marker pattern) |
| 3 | **Non-stall terminals** | Tricks ending in a kick or pass-through, not a delay | ~8 | Low (category=='body' or notation lacks [DEL]) |
| 4 | **Movement neighborhoods → exception sub-views** | Add filters on existing topology view | varies | Medium (filter UI work) |

Explicitly NOT recommended as new browse views:

- "Alternative entries" — empty set; every canonical entry is toe / clipper / set / inside.
- "Body-modifier tricks" — duplicates the existing Operators & Modifiers reference.
- "All exceptions" / "topology grab-bag" — defeats the audit's principle (mixing categories with different educational signals is noise).

## Review tables (Part D)

Four CSVs landed in this directory:

| File | Rows | Curator review surface |
|---|---:|---|
| `unusual_surface_inventory.csv` | 11 | The full body-surface + foot-edge population. Foundational atoms (1-2 ADD); zero compound rows currently use these as terminals. |
| `flying_and_body_tricks.csv` | 87 | Broad pool. Includes the 8 flying / airborne rows plus all duck/spin/jump compounds. Use as a filter source, not a browse view. |
| `nonstandard_terminal_inventory.csv` | 17 | Rows whose terminal surface is NOT toe / clipper. Tightly scoped; usable as a browse view. |
| `topology_exception_clusters.csv` | 20 | Union of: unusual surface ∪ flying marker ∪ non-default entry ∪ atypical terminal. Audit superset. |

All four CSVs share columns: `slug, canonical_name, adds, dex_count, trick_family, entry_surface, terminal_surface, unusual_surface_flag, has_body_token, has_flying_marker, review_status, opn`.

Parser notes (limitations):
- Entry / terminal surface is regex-extracted from `operational_notation`. Rows with no op_notation (62) appear as `(unparseable)` in both columns.
- The parser strips directional prefixes (OP / SAME / NEAR / FAR) and parenthetical state qualifiers; it does not understand nested SET-arc structures.
- 4 to 6 rows have notation in non-canonical-bracket form (e.g. `flying > clipper`) and their entry surface lands as empty — they still surface correctly under the flying / unusual flags via the keyword scan.
- Observational corpus (`freestyleObservationalTricks.ts`) NOT parsed in this pass. Most observational rows are deep-compound names that surface toe/clipper terminals anyway; including them would mostly add noise.

## Educational framing (Part E)

Plain-language framing for any of these views, if implemented:

### Alternative surfaces

> Most freestyle tricks land on toe or clipper. These tricks land somewhere else — your sole, heel, knee, shoulder, neck, head, forehead, or even your cloud (back of calf). These are surface-primitive tricks: foundational entries to body-surface stall mechanics that the toe-and-clipper tradition often skips past.

### Flying / airborne

> Tricks where the body leaves the ground. Either you enter the trick from the air (jumping into the move) or you become airborne mid-trick (jumping over the bag). The flying-clipper, butterfly-kick, and eclipse family are the named examples.

### Non-stall terminals

> Tricks that end in a kick or pass-through rather than a delay (stall). The body's contact with the bag is the move, not the rest after. Examples: cloud-kick, sole-kick, butterfly-kick, dragonfly-kick.

### Forbidden framings

- ❌ "Weird tricks" / "Miscellaneous" / "Other" — flattens distinct educational categories into one undifferentiated novelty bucket.
- ❌ "Advanced" / "Power-user" — the actual ADD values for these rows are mostly 1-2 (foundational); the categorization is structural, not difficulty-based.
- ❌ "Exception" or "exceptional" in public UI prose — internal-only audit framing; public-facing framing is "movement exploration" / "alternative surfaces" / "body-oriented movement".

## Future UI recommendations (Part F)

### Tier 1 — implement when curator wants

**Alternative surfaces** as a **dedicated reference page** at `/freestyle/alternative-surfaces` (NOT a `?view=` on the main tricks route).

Rationale: only 11 rows; treating them as a browse-mode-on-the-dictionary suggests they're a comparable pool to the 270-row ADD view. A standalone reference page is honest about scope and gives space for educational prose framing the surface primitives.

### Tier 2 — consider as glossary cross-link

**Flying / airborne tricks** — small focused cluster (8 rows). Best home: a glossary section explaining airborne entry vs airborne-mid-trick, linking to each member. Same rationale as Tier 1 — too small for a full browse view.

### Tier 3 — defer

**Non-stall terminals** — overlaps significantly with the existing `category` column (body / kick). The current "By Family" view + Movement Neighborhoods already surfaces these via the `category=body` rows. A dedicated view is redundant.

**Atypical base terminals** — only 1 row (ducking-osis). Not a view.

### Tier 4 — explicitly reject

- A `?view=alternative-surfaces` browse mode that buckets 11 tricks. Wastes the toggle-bar slot.
- An "Exceptions" or "Movement exploration" sub-section on the landing that just lists these rows. The landing already has the Movement Neighborhoods card; adding another grab-bag card dilutes both.

### Recommended discovery paths instead

1. **Landing-page Operators & Modifiers card** could mention "Alternative surfaces (sole, heel, knee, shoulder, head)" as a one-line teaser linking to the reference page.
2. **Glossary** could add a short section "Beyond toe and clipper" linking to the alternative-surface atoms.
3. **Movement Neighborhoods** view already surfaces some of these clusters via topology grouping; verify each is appropriately tagged.

## Guardrails honored (Part G)

- ❌ No UI implementation
- ❌ No DB writes
- ❌ No doctrine changes
- ❌ No giant toe/clipper browse pages — the recommended views are 8-17 rows each
- ✅ Browse simplicity preserved (recommends ONE reference page + glossary cross-links, not 4 new views)
- ✅ Exceptions framed as educational signals (movement exploration), not gimmicks

## Strategic observation

The dex-count view (Phase 4.1) works because dex count is **continuous** and the distribution is **broad** (28 / 65 / 94 / 19 / 2 across buckets). Every bucket holds enough rows to be educationally interesting.

The unusual-surface pool is **categorical** and the distribution is **sparse** (1-3 rows per body-surface category). The right surface for sparse-categorical data is a **reference page**, not a browse view. The dictionary's browse axes should expose continuous structural signal (dex count, ADD, family, movement-system); reference pages and glossary cross-links carry the categorical exception data.

This is the design principle the user's brief surfaced: not every interesting axis deserves a `?view=`. Browse axes earn their slot by having distributional density.
