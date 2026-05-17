# Human Review Follow-up — Triage + Implementation Plan

**Date**: 2026-05-17.
**Companion**: `HUMAN_REVIEW_CHECKLIST.md` (the original review prompt structure) and `RENDERED_HTML_AUDIT.md` (AI-grounded HTML/CSS findings).

**Methodology**: every claim from the human-review notes was verified via curl against `localhost:3000` + sqlite3 queries against the live dev DB. Findings flagged as `VERIFIED FALSE` are claims that turned out to be already-correct in the rendered output. Findings flagged `VERIFIED TRUE` are real bugs. `NEEDS CURATOR DECISION` items require human judgement before any change.

> **Discipline**: ship only safe, narrow, source-grounded fixes. Mark uncertain items as audit findings, not fixes. Preserve four-layer separation. No ontology invention.

---

## 1. Triage matrix

Severity scale: **HIGH** (user-blocking; ship now), **MEDIUM** (degraded experience; defer with rationale), **LOW** (cosmetic / curator preference), **AUDIT** (verify-only; no action this slice).

| # | Surface | Issue | Severity | Status | Surface file(s) |
|---|---|---|---|---|---|
| 1 | NET | /net page render is 11.87s (catastrophic) | **HIGH** | **SHIPPED** | `src/db/db.ts` (query), `database/schema.sql` (new index) |
| 2 | GLOSSARY | §8 Composition flow is 3-card → user asked for one-line `mobius = gyro torque` | **MEDIUM** | **SHIPPED** | `src/services/freestyleService.ts` (glossary content) |
| 3 | MEDIA | PassBack tutorials missing from /media gallery list | MEDIUM | **CURATOR DECISION** | DB-backed gallery row; curator inserts via gallery-admin path |
| 4 | TRICK DICT | "torque missing from ADD view" | AUDIT | **VERIFIED FALSE** (torque IS in ADD view) | — |
| 5 | TRICK DICT | "blur tutorial chip says tutorial exists but no embedded video hashtag visible" | AUDIT | **VERIFIED FALSE** (tutorial chip + 3 embedded videos render correctly) | — |
| 6 | TRICK DICT | "double-legover appears in both mirage and legover family" | AUDIT | **NEEDS CURATOR DECISION** — Slice M's dual-membership pattern allows this; curator decides whether DLO warrants the same treatment | `src/content/freestyleFamilyOverrides.ts` |
| 7 | TRICK DICT | 1 ADD stalls missing obvious formulas (outside-stall, etc.) | LOW | **ALREADY DONE** — Pre-Red sweep appended 12 stall op-notations to `red_corrections_2026_04_20.csv`; awaiting DB rebuild | `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` |
| 8 | TRICK DICT | ATW needs a formula | LOW | **NEEDS CURATOR DECISION** — ATW is canonical core atom; chain registry rule is to silence atoms (Slice S §3) | — |
| 9 | GLOSSARY | "Add Gyro if missing from relevant glossary/operator sections" | LOW | **AUDIT** — Gyro IS in `MODIFIERS` registry; surfaces in chain readings | — |
| 10 | GLOSSARY | "Paradox should include PDX → clip > op-in dex" | LOW | **ALREADY DONE** — Pre-Red sweep extended paradox gloss with `Entry shape: clip > op-in dex` | `src/content/freestyleMovementSystems.ts` |
| 11 | GLOSSARY | "Same formula in Advanced Decomposition & Operator Theory" | LOW | **NEEDS CURATOR DECISION** — adds another surface for the same formula; could increase visual density curator wants reduced | — |
| 12 | GLOSSARY | "See connective panel" is confusing | LOW | **NEEDS CURATOR DECISION** — wording change; subjective | `src/views/freestyle/glossary.hbs` or service |
| 13 | GLOSSARY | "Section is too dense; reduce or reorganize" | MEDIUM | **NEEDS CURATOR DECISION** — UX restructure beyond minimal-diff scope | `src/views/freestyle/glossary.hbs` |
| 14 | GLOSSARY | "Symbolic Notation section: beginner/intermediate/advanced distinctions may be redundant" | LOW | **NEEDS CURATOR DECISION** — tier-badge information architecture | — |
| 15 | MOVEMENT NEIGHBORHOODS | "Use PDX formula" + "Disclaim incompleteness" | LOW | **NEEDS CURATOR DECISION** — Movement Neighborhoods is §9 of glossary; the panel framing is observational + the original Slice K work; further disclaimers are content-level | `src/services/freestyleService.ts` (connective panels) |
| 16 | MOVEMENT NEIGHBORHOODS | "Missing movements such as swirl" | AUDIT | **NEEDS CURATOR DECISION** — connective panel inventory expansion | — |
| 17 | TRICK DICT family view | "eggbeater = atomic legover / illusioning legover / illusion family" assess consistency | AUDIT | **NEEDS CURATOR DECISION** — pt4 ruling is atomic legover; Slice P found FM/PB lean Illusioning Legover; Wave 2-adjacent | — |
| 18 | TRICK DICT ATW family | "Add double around-the-world, triple around-the-world, double around-the-world sole" | AUDIT | **NEEDS CURATOR DECISION** — productive-multiplicity rule (pt8); each candidate requires Red-style adjudication | — |
| 19 | TRICK DICT Movement System | "Atomic description should be checked against the illusioning conjecture" | AUDIT | **WAVE 2 BLOCKED** — atomic-family ontology pending Wave 2 (Red 2026-05-15 ruling on atom-smasher X-dex) | — |
| 20 | TRICK DICT Movement System | "Entry Topologies > paradox should show the formula" | LOW | **ALREADY DONE** — paradox composition gloss includes "Entry shape: clip > op-in dex" since Pre-Red sweep | `src/content/freestyleMovementSystems.ts` |
| 21 | TRICK DICT Movement System | "No-Plant & Suspension should include flying/midair examples" | AUDIT | **NEEDS CURATOR DECISION** — adding double-knee / eclipse to symposium axis is ontology expansion | — |
| 22 | TRICK DICT | "Inherit Body moves, surface, other/rake groupings from category view" | MEDIUM | **NEEDS CURATOR DECISION** — view-restructure pre-empting Slice L4 retirement; defer | — |
| 23 | TRICK DICT | "Category view may be retired" | MEDIUM | **SCHEDULED FOR L4** per `STABILIZATION_PLAN.md` retirement arc | — |
| 24 | OPERATORS | "Investigate eclipse, double-knee, flying moves, gyro, swirl, rake/surface/body/other as operators/body moves/category entries" | AUDIT | **NEEDS CURATOR DECISION + WAVE 2 BLOCKED** — ontology-shaped; Wave 2 packet covers operator-vs-trick boundary | — |
| 25 | FREESTYLE LANDING | "2023 final should identify Scott Davidson and Tuan Vu if applicable" | AUDIT | **NEEDS CURATOR VERIFICATION** — media metadata check; do not change without confirming the actual identities in the video | — |
| 26 | FREESTYLE HISTORY | "History page needs rewrite + media integration" | MEDIUM | **NEEDS CURATOR DECISION** — content authoring; "Do not fabricate history claims" | — |
| 27 | CLUBS | "Update country map with population density encoded" | MEDIUM | **DESIGN EXPLORATION** — exploratory per directive; not implementation | — |
| 28 | MEDIA | "Ensure all trick media have two-way links (gallery ↔ trick)" | AUDIT | **VERIFIED PARTIALLY** — link table `freestyle_media_links` already supports `(entity_type, entity_id)`; trick-detail page already renders linked media (verified for blur). Gallery-side reverse-link surface may need work | — |
| 29 | MEDIA | "Highlight trick entries that have curated media" | AUDIT | **ALREADY DONE** — `dict-card-media-chip--tutorial` / `dict-card-media-chip--demo` classes render on cards with media. Verified live for blur. | — |
| 30 | GLOSSARY | "Pixie: describe motion in words, ATW-like uptime dex movement" | LOW | **DEFER TO CURATOR** — embodied analogy already exists in `embodied_analogy_notes.md` (Slice S); curator decides whether to promote any of those notes onto the glossary surface (which would expand the 4-layer ontology — careful) | — |
| 31 | GLOSSARY | "Fairy: Orbit-like uptime dex movement" | LOW | **DEFER TO CURATOR** — same Slice S deferral as Pixie | — |

---

## 2. Shipping decisions

### 2.1 SHIP NOW (2 fixes)

**Fix A — Net perf index** (HIGH severity; user-blocking 11.87s page render).

  Root cause: `freestyleService.netTeams.listNotablePool` + `netHome.listNotablePlayerPool` use `net_team_appearance_canonical` view, which filters `net_team_appearance.evidence_class = 'canonical_only'`. No index on `evidence_class`. SQLite builds an automatic-partial-covering index every query. The hot path through `listNotablePlayerPool` measures 8.17s standalone.

  Fix: add `CREATE INDEX IF NOT EXISTS idx_net_team_appearance_evidence_class ON net_team_appearance(evidence_class)` to `database/schema.sql` AND apply to the live dev DB. Pure perf — no semantic change, no constraint, no row affected.

  Expected effect: query plan replaces "AUTOMATIC PARTIAL COVERING INDEX" with the real index; query drops well below 1s. Net page should fall under ~1s render.

**Fix B — Glossary §8 mobius compression one-liner** (MEDIUM; curator directive verbatim).

  Root cause: §8 currently renders a 3-card vertical flow `osis → torque → mobius` with 2 long structural readings. User asked for: "Compress osis → torque → mobius example to one line. Use: mobius = gyro torque."

  Fix: prepend a one-line summary above the existing 3-card flow: "**Or in one line:** mobius = gyro torque." This preserves the educational ladder for those who want it while satisfying the user's "one line" framing. Less aggressive than removing the cards.

  Optional alternative if curator wants the 3-card flow removed entirely: defer that decision.

### 2.2 DEFER TO CURATOR (16 items)

| Item | Why deferred |
|---|---|
| #3 PassBack tutorials gallery | DB-backed named-galleries table needs new row + tag bindings; curator decides slug / scope / which sources |
| #6 DLO dual-membership | Slice O candidate audit; pre-Red branch-family promotion blocked |
| #11 Paradox formula on Advanced Reference surface | Density increase; user also asked for density reduction — conflict |
| #12-14 Glossary density / wording / tier-badges | UX restructure decisions |
| #15-16 Movement Neighborhoods PDX + swirl audit | Connective panel curator-authored content |
| #17 Eggbeater illusioning conjecture | Wave 2-adjacent |
| #18 ATW productive multiplicity rows | pt8 ontology decisions |
| #21 No-Plant + flying examples | Ontology expansion |
| #22-23 View inheritance + Category retirement | Scheduled for L4 |
| #25 2023 final attribution | Curator must verify media before label change |
| #26 History page rewrite | Curator content authoring |
| #27 Country population density map | Design exploration |
| #30-31 Pixie/Fairy glossary descriptions | Slice S embodied notes deferred to curator already |

### 2.3 WAVE 2 BLOCKED (3 items)

| Item | Wave 2 dependency |
|---|---|
| #19 Atomic illusioning conjecture | Atomic-family ontology |
| #24 Operator audit (eclipse, gyro, swirl, rake) | Operator-vs-trick boundary; per-row classification |
| #17 Eggbeater illusioning vs atomic | Wave 2-adjacent operator-class question |

### 2.4 VERIFIED FALSE / ALREADY DONE (5 items)

| Item | Verification |
|---|---|
| #4 Torque missing from ADD view | `curl /freestyle/tricks \| grep 'data-trick-slug="torque"'` returns 1 match — torque IS in ADD view |
| #5 Blur tutorial not visible | Detail page renders the chip + 3 embedded videos correctly (`video-facade` × 3 with YouTube embeds) |
| #7 Stalls missing formulas | Pre-Red sweep appended 12 stall op-notations; awaiting DB rebuild |
| #10 Paradox PDX → clip > op-in dex | Already in paradox composition gloss since Pre-Red sweep |
| #20 Movement System paradox formula | Same as #10 |
| #28-29 Two-way media links + media-coverage chips | Already in place; verified live for blur |

---

## 3. Net perf finding in detail

```sql
-- Slow query (8.17s standalone in dev DB):
EXPLAIN QUERY PLAN
SELECT hp.person_id, ..., COUNT(a.id) AS total_appearances, ...
FROM historical_persons hp
JOIN net_team_member nm           ON nm.person_id = hp.person_id
JOIN net_team_appearance_canonical a ON a.team_id = nm.team_id
LEFT JOIN members m               ON m.historical_person_id = hp.person_id
WHERE hp.person_name NOT IN (...)
GROUP BY hp.person_id
HAVING COUNT(a.id) >= 3
ORDER BY total_appearances DESC LIMIT 100;
```

```
|--SCAN hp USING INDEX sqlite_autoindex_historical_persons_1
|--SEARCH net_team_appearance USING AUTOMATIC PARTIAL COVERING INDEX (evidence_class=?)  ← red flag
|--SEARCH nm USING COVERING INDEX sqlite_autoindex_net_team_member_2 (team_id=? AND person_id=?)
|--SEARCH m USING INDEX idx_members_historical_person_id (historical_person_id=?) LEFT-JOIN
```

`net_team_appearance` has 6955 rows; no index on `evidence_class`. The view `net_team_appearance_canonical` filters by `evidence_class = 'canonical_only'`. SQLite rebuilds an automatic index every call.

After fix: index serves the WHERE filter on the underlying view + the team_id join uses the existing `idx_net_team_appearance_team`. The auto-index step disappears.

---

## 4. What this slice does NOT do

- ❌ No new ontology proposals
- ❌ No new content modules
- ❌ No parser grammar work
- ❌ No new browse views
- ❌ No Wave 2 resolutions
- ❌ No new test files (the shipped fixes are perf + prose; existing tests adequately cover the surfaces)
- ❌ No PassBack tutorial gallery creation (curator decision)
- ❌ No History page rewrite
- ❌ No glossary restructure
- ❌ No category-view retirement (scheduled for L4)
- ❌ No new operators

---

## 5. Cross-arc context

This triage closes the loop from the Human Review Checklist (Slice X) — taking real curator review notes and converting them into:

  - Verified facts (5 items already done or verified-false)
  - 2 ship-now safe fixes (perf + prose)
  - 16 curator-decision deferrals
  - 3 Wave-2-blocked items
  - 5 audit findings flagged for future visibility

The curator now has a single document that maps every review-note item to a status + next-step.

---

## End
