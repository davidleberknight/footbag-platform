# Notation Display Consistency + Dictionary Browse Taxonomy Audit (2026-05-24)

Research-only audit. **No UI implementation, no doctrine changes, no source-corpus collapse.** Output is a planning artifact covering presentation contracts, label normalization, browse taxonomy review, future architecture recommendation, and a prioritized implementation roadmap.

## Current-state summary

The dictionary surface spans **6 distinct presentation contexts** with overlapping but inconsistent label vocabulary:

| Surface | Where the user sees it |
|---|---|
| Browse cards (registry density) | `/freestyle/tricks?view=add` and other browse views |
| Browse cards (browse density) | same routes, vertical stacked layout |
| First-class comparative-row | `/freestyle/tricks/:slug` (first-class tricks; compact 3-field summary) |
| Main notation block | `/freestyle/tricks/:slug` (all tricks; tokenized semantic notation) |
| Transform overlay | `/freestyle/tricks/:slug` (the 5 rev(0)-locked entries) |
| Observational cards | `/freestyle/observational` (tracked-tag style; source-attributed) |
| Glossary | `/freestyle/glossary` (pedagogical primer; no inline labels) |

ALT lines do NOT currently render on browse cards — that part of the contract is already correct. The audit focuses on what IS inconsistent and what taxonomy revisits make sense.

---

## Part A — Surface rules

The user-stated contract is essentially correct and already mostly implemented. Codifying it as a presentation contract:

### Browse pages (cards on `?view=…` and `/freestyle/observational`)

**Show:**
- Name (display name + canonical hashtag chip)
- Primary notation only — Tier 1 `tokenizedEquivalences` (≡ chain reading) preferred; Tier 2 `operationalNotation` as fallback
- ADD chip
- Status badge (pending decomposition, review-pending, etc.) ONLY when actionable

**Do NOT show:**
- ALT lines (already absent — keep absent)
- FM-parens or Stanford shorthand notation
- Doctrine notes / provenance citations
- Source-claim divergence prose
- Curator-internal review notes

**Special case — first-class browse row:** The `dictionary-trick-card-first-class-row.hbs` partial currently shows `JOB:` + `ADD:` lines for first-class tricks. This is the one place browse cards carry an inline label. Decision needed: keep (signals foundational status visually) OR move to detail only (purer browse). See Part E recommendation.

### Trick-detail pages (`/freestyle/tricks/:slug`)

**Show, in this layered order:**
1. Primary notation display (curator-authored semantic form)
2. ADD breakdown (full derivation)
3. Operational notation (set-arc / FM form) — when populated and not redundant with #1
4. Alternate reading (ALT) — only for the 5 rev(0)-locked entries
5. Equivalent readings (semantic ≡ chain progressively unfolded)
6. Source provenance citation (muted italic when present)
7. Scoring notes (PassBack-vs-IFPA divergence, etc.) — collapsible advanced section

**Do NOT show:**
- Curator-internal review status labels in rendered prose
- Wave/slice tags or implementation-state language

### Emerging Vocabulary (`/freestyle/observational`)

**Show:**
- Display name (NOT linked — observational tricks have no canonical detail page)
- Tracked tag `#{folkSlug}` (visually distinct from canonical hashtag)
- Source badge (FB.org / FootbagMoves / PassBack / etc.)
- Short reading (`≡` line)
- External-claim label (`PB claim: 4`, `FM dex-count: 5`, etc.) — NOT a canonical ADD chip
- Status chip (pending-review / pending-canonicalization)
- Expandable details: additional readings, formula, curator note, blockers, source citation

**Do NOT show:**
- Canonical hashtag (the trick is not yet canonical)
- Canonical ADD chip (the ADD claim is observational, not authoritative)
- ALT lines
- JOB notation label (the trick has no JOB form yet)

### Glossary (`/freestyle/glossary`)

Pedagogical surface. Already exempts itself from the JOB/ADD/ALT label scheme — uses prose + worked examples instead. **No change needed.**

---

## Part B — Label normalization

Current labels are inconsistent across surfaces:

| Concept | Current labels in production |
|---|---|
| Movement / Jobs notation | "JOB:" (first-class row), "JOB notation" (heading), "Notation" (heading on main block), bare tokenized rendering (no label) |
| ADD breakdown | "ADD" (chip + label + heading) |
| Alternate reading | "ALT:" (rev(0) only) |
| Operational (FM-style) notation | "JOB notation" heading, sometimes "Set notation (operational)" in older partials |
| Source notation / community claim | "Source claim ({source}):", "external claim", "PB claim:" |
| Stanford shorthand | NOT rendered on canonical surfaces (only via comparative-row's tokenized form) |
| Scoring note / provenance | "Scoring notes" (heading) |

### Proposed normalized labels

| Concept | Recommended public-facing label | Recommended advanced-context label |
|---|---|---|
| Primary movement notation (Job's grammar) | **Movement notation** | "JOB notation" / "Job's notation" |
| ADD derivation breakdown | **ADD breakdown** | "ADD" (already concise) |
| Alternate reading (rev(0) and similar) | **Alternate reading** | "ALT" (compact label OK) |
| Operational (set-arc / FM-style) notation | **Set notation** | "Operational notation" / "FM notation" |
| Stanford shorthand (when ever surfaced) | **Stanford shorthand** | "Stanford" (compact OK) |
| Community-source ADD claim | **Community notation** (when paired with a notation string) OR **Community ADD claim** (when paired with a number) | "Source claim ({source})" |
| Scoring/provenance note | **Scoring note** | "Scoring notes" (heading already) |

### Rationale

The user's framing is good: public-facing surfaces favor accessible terms ("Movement notation"), while advanced/reference contexts can keep "JOB" / "Job's notation" as the historical name. Two clean conventions:

- **Public-facing surfaces (browse cards + trick-detail body)**: use the "Movement notation" / "ADD breakdown" / "Alternate reading" / "Set notation" / "Community notation" set
- **Advanced/reference contexts (glossary, scoring-notes details collapsible, comparative-row compact form)**: use "JOB" / "ADD" / "ALT" / "Stanford" abbreviated set

The compact comparative-row on first-class trick pages can keep `JOB:` / `ADD:` / `ALT:` because it's a notational table, not body prose.

**Do not rename `ADD` itself.** ADD is the community's canonical scoring term and pervasively understood; renaming it ("difficulty score" etc.) would break community discourse and contradict the project's existing terminology.

---

## Part C — Dictionary browse taxonomy audit

### Current views (inventory)

| View | URL | Purpose | Status |
|---|---|---|---|
| Landing (no params) | `/freestyle/tricks` | Portal cards + featured + core-atoms grid | active |
| By ADD | `/freestyle/tricks?view=add` | Numeric difficulty buckets | active |
| By Family | `/freestyle/tricks?view=family` | trick_family clusters | active |
| Movement System | `/freestyle/tricks?view=movement-system` | Movement axes (set / dex / body / spin) | active |
| Movement Neighborhoods | `/freestyle/tricks?view=topology` | Topology groupings (URL stays `topology`, public label "Movement Neighborhoods") | active |
| Operators & Components | landing card sub-link | Token glossary entry point | active |
| Emerging Vocabulary | `/freestyle/observational` | Pre-canonical tracked names | active |
| Category | `?view=category` | Soft-retired (redirects with notice) | retired |
| Component | `?view=component` | Soft-retired | retired |
| Compositional Sets | `/freestyle/compositional-sets` | Holden compilation + folk-name equivalence | active |
| Combo Analysis | `/freestyle/combo-analysis` | Sequence-level surface | active |

### Alternative axes worth considering (per user's list)

| Axis | Could it power a useful view? | Risk / cost |
|---|---|---|
| **Foundational atoms** | Yes — the 12 core atoms are pedagogically central. Currently shown on landing core-atoms grid; could surface as a focused browse view. | Low risk; small implementation |
| **Modifier systems** | Maybe — but operators & components already covers this. Risk of redundancy. | Medium overlap |
| **Set systems** (entry-set primitives like pixie/fairy/atomic) | Yes — these are a distinct pedagogical axis from "modifiers" generally. | Medium-low risk |
| **Terminal surface** (where the trick lands) | Yes — toe-stall vs clipper-stall vs back-spin terminal etc. Pedagogically rich for learners thinking about "what does this end in?". | Medium risk (curator-paced classification needed) |
| **Entry surface** (toe-set / clipper-set / dragon / inside / pendulum) | Yes — the Stanford lattice cleanly exposes this axis. | Low risk if backed by shorthand data |
| **Dex count** (single-dex / double-dex / triple-dex / 4+ dex) | Yes — Stanford lattice exposes this directly. Pedagogically valuable. | Low risk |
| **Source corpus** | Maybe — diagnostic / curator-internal value but mostly noise for end users. Better as a filter, not a view. | High UI complexity for low end-user value |
| **Notation convention** (canonical-bracket / fm-parens / stanford) | No — internal concern; users care about the trick, not the notation lineage. Better as detail-page tab. | Doesn't help end users |
| **Beginner / classic / advanced** | Yes — but requires curator-authored classification per trick. High curator cost. | High curator cost; medium UI value |
| **Family lattice** (entry-surface × dex-count grid) | Yes — exposes Stanford's structural symmetries. Powerful but visually dense. | Medium UI complexity; learner-curiosity value |
| **Stanford symbolic clusters** | Yes — Ben Lynn's clustering surfaces lattice gaps + folk-name overlap. Power-user feature. | Medium-high implementation; learner-friendly framing needed |
| **Promotion / readiness status** | No — curator-internal concern; not a learner axis | Internal only |
| **Trick role** (atom / compound / folk-name / flagship) | Yes — clean four-way classification with learner appeal. | Low risk if classification data exists; currently derived from is_core + is-first-class flags |

### Views currently underutilized or worth re-thinking

1. **Operators & Components** is a landing sub-link, not a top-level browse view. Its name ("Operators & Components") may be too jargon-heavy; "Token reference" or "Notation primer" would be more accessible.

2. **Compositional Sets** (`/freestyle/compositional-sets`) is a sibling to `/freestyle/tricks`, not a view within it. The naming suggests it's a separate concept; should the landing surface link to it more prominently?

3. **Movement Neighborhoods** uses URL param `topology` but public label "Movement Neighborhoods" — already a public-label rename. The underlying topology grouping is observational, not canonical; keep distinct from family view.

---

## Part D — Recommended future browse architecture (do not implement yet)

### Tier 1: Stay as-is

These views work and have learner value. **No changes required.**

- Landing (portal cards + core atoms)
- By ADD
- By Family
- Movement System
- Movement Neighborhoods (current implementation)
- Emerging Vocabulary
- Compositional Sets (sibling page)

### Tier 2: Rename or re-position

- **Operators & Components** → rename to **Notation primer** for public surfaces; keep "operators & components" terminology in advanced/reference glossary entries.
- The landing core-atoms grid is fine as a teaser; consider adding a small `/freestyle/atoms` link to a dedicated foundational-atoms reference view.

### Tier 3: New views worth prototyping (in priority order)

1. **By Dex Count** — `?view=dex-count`. Buckets: 1-dex / 2-dex / 3-dex / 4+ dex / non-dex (body / set-only). Stanford lattice already provides this data per trick. Beginner-friendly: "How many dex moves does this trick involve?" High learner value, low implementation cost.

2. **By Entry Surface** — `?view=entry-surface`. Buckets: toe-set / clipper-set / inside-set / dragon-set / other. Stanford `<X|Z|L|D|...>` prefix tokens drive this. Cleanly maps to learner mental model: "I want toe-entry tricks today."

3. **By Terminal Surface** — `?view=terminal-surface`. Symmetric to entry-surface. "I want tricks that end in toe-stall / clipper-stall / spin / kick / no-stall." Requires curator classification of each canonical row's terminal — moderate curator cost.

4. **Trick role view** — `?view=role`. Buckets: foundational atoms / canonical compounds / folk-named tricks / flagship-tier. Uses existing `is_core`, `category`, and first-class-tier metadata. Power-user navigation.

5. **Family lattice (advanced)** — `/freestyle/lattice` (separate page, not a browse view). 2D grid: entry surface × dex count, cells filled with named tricks. Exposes Stanford's structural symmetries + unnamed combinations. Power-user / curator-curiosity surface.

### Tier 4: Avoid

- **Source corpus view**: high noise, low learner value. Source attribution belongs on detail page only.
- **Notation convention view**: internal-only concern.
- **Promotion / readiness status view**: curator-internal.
- **Beginner / classic / advanced**: high curator cost (requires per-trick classification) for medium UI value. Defer to a curator-paced classification pass first.

### Beginner default

Recommend: **landing page stays default** (portal cards + core atoms grid). Already implemented.

If we add `?view=dex-count` and/or `?view=entry-surface`, those become natural "next click" paths from the landing for beginners ("learn the simplest tricks first" → 1-dex view).

### Power-user views

Recommend:
- **Family lattice** as a dedicated page (not a `?view=`).
- Add a small **Advanced** chip on the landing pointing to lattice + glossary's Stanford section + operators & components reference.
- Trick role view (atom / compound / folk-name / flagship) as an advanced organizational lens.

---

## Part E — Implementation roadmap (prioritized)

### Phase 1 — Consistency fixes (LOW risk, IMMEDIATE)

1. **Audit: ensure ALT does NOT leak to browse surfaces.** The inventory found ALT is currently only on `trick-comparative-row.hbs` (gated to `content.isFirstClass`) and `trick-transform.hbs` (gated to `content.transform`). Both are detail-only partials. Add a test pin that confirms `dictionary-trick-card.hbs` + observational cards never render ALT text, so regressions surface.

2. **Audit: ensure source-claim divergence prose does NOT leak to browse cards.** Scoring notes are detail-only currently; pin this with an integration test.

3. **Audit: ensure tracked-tag `#folkSlug` is visually distinct from canonical hashtag.** Inventory shows they share styling. Trivial CSS fix (aria-label is already distinct).

### Phase 2 — Notation label cleanup (LOW–MEDIUM risk)

1. **Trick-detail body labels: switch to public-facing terms.**
   - Main notation block heading: "Notation" → **"Movement notation"**
   - Operational section heading: "JOB notation" → **"Set notation"**
   - ADD analysis heading: keep "ADD" (already concise)
   - Add a one-line muted descriptor under each heading clarifying what the layer means

2. **Comparative-row (first-class detail pages): keep JOB / ADD / ALT compact labels.** This is a notational table, not body prose; compact labels are appropriate.

3. **Glossary section anchor naming: keep `#jobs-notation` URL for stable external links.** The page can refer to "Movement notation (Job's grammar)" in body text.

### Phase 3 — Remove ALT from browse surfaces (already correct, just pin)

Per inventory, this is **already the current state**. The only work needed is a regression-pinning test in `tests/integration/` so a future shaping helper can't accidentally surface ALT on browse output. Trivial.

### Phase 4 — Improved dictionary categories (MEDIUM cost)

1. Add `?view=dex-count` (Tier 3 priority #1).
2. Add `?view=entry-surface` (Tier 3 priority #2).
3. Rename "Operators & Components" landing card to "Notation primer".
4. Optionally promote the core-atoms grid to its own `/freestyle/atoms` reference page.

Each is curator-paced; can ship one at a time.

### Phase 5 — Future symbolic search / lattice (DEFERRED)

1. **Family lattice page** (`/freestyle/lattice`) — entry-surface × dex-count grid backed by Stanford shorthand data. Highest novelty, medium implementation cost. Defer until Phases 1–3 are done and Stanford-data lifecycle is settled.

2. **Symbolic search** — accept canonical-bracket / fm-parens / Stanford strings as search input. Power-user feature; requires the family lattice data layer first.

3. **Trick role view** (`?view=role`) — uses existing classification metadata, low implementation cost. Add after dex-count / entry-surface views.

---

## Guardrails honored

- ❌ No broad redesign (recommendations are layered + opt-in)
- ❌ No UI implementation in this slice
- ❌ No doctrine changes (PassBack-as-observational, layer separation, etc. preserved)
- ❌ No source-corpus collapse (each source retains its identity per the Phase 6+7 doctrine)
- ✅ Browse stays simple (proposed views preserve the name / hashtag / ADD / primary-notation contract)
- ✅ Detail stays rich (recommended layering: primary → ADD → operational → ALT → equivalence → provenance → scoring)

## Next slice recommendation

If the curator approves the audit, the natural sequencing is:

1. **Phase 1 + Phase 3 pinning tests** (single small implementation slice; regression protection)
2. **Phase 2 label renames** (one slice; touches headings only)
3. **Phase 4.1 — `?view=dex-count`** (one slice; backed by Stanford data already in DB after Wave Alpha)
4. **Phase 4.2 — `?view=entry-surface`** (one slice; same data layer)
5. **Phase 5 — lattice** (curator-paced; cross-link from Phase 4 views once they exist)

Each is incremental and reversible.
