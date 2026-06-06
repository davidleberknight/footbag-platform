# EV2 — Emerging Vocabulary Redesign Proposal

Information-architecture + presentation redesign of `/freestyle/observational`. **No ontology, no promotions, no doctrine changes, no implementation.** Goal: turn the page into a frontier map that answers, at a glance: what can be promoted next, what is blocked, why, what is unknown, and how much of the frontier is structurally understood.

Grounded in the live data (post-EV1, overlap = 0).

## 1. Audit of the current page

The current page is **not** a flat source list — it is already a competent governance surface (`observational.hbs` header calls it "v2"). Current order:

1. **Stats banner** (`content.stats`: value / label / hint).
2. **Sources strip** + a layer note.
3. **Section A — Ready for Promotion**, grouped by **ecosystem**.
4. **Section B — Ecosystem Frontiers**: a matrix (Ecosystem × Ready / Frontier / Doctrine / Unresolved / Total) + "curator-confirm" cards by ecosystem.
5. **Section C — Doctrine Bottlenecks**: clusters with a blocking question + sample names.
6. **Section D — Folk / historical unresolved** and **Section E — Parser uncertainty**, summarized behind disclosure.

What it does well: doctrine bottlenecks (C) are genuinely excellent (a ruling-per-cluster framing), and the stats-first instinct is right.

**Weaknesses (per audience):**
- **Curator:** the primary axis is *ecosystem*, not *status* or *ADD*. To find "the next promotion batch" a curator must scan the ecosystem groups inside Section A; there is no single ADD-ordered "promote these next" list. The matrix mixes five state columns, which is dense to read.
- **Beginner:** the stats banner + sources strip + layer note stack three abstractions before any content; "ecosystem" and "frontier" are unexplained.
- **Expert:** frontier *health* (how much is structurally understood vs unknown) is implied by the matrix but not stated as a headline.
- **Information density:** the long folk/parser tails (693 low-confidence + 387 parser) sit behind disclosure — good — but the alias/duplicate material (415 + 21) is not surfaced as its own archive at all.
- **Hidden information:** the data carries `intakeBucket` (promotion_ready / doctrine / folk / alias / duplicate / unresolved), per-trick proposed ADD (obs-tricks `proposedAddTotal`), and operational notation — but the page surfaces almost none of this as a *status-first* or *ADD-first* organization.

**Verdict:** keep the governance-surface DNA; re-pivot the primary axis from **ecosystem → status**, sub-order Promotion-Ready/Needs-Authoring by **derived ADD**, surface the alias/duplicate archive, and lead with Promotion Ready.

## 2. The data is sufficient (real counts)

`freestyleObservationalUniverse.ts` `intakeBucket` distribution (post-EV1):

| Bucket | Count | Maps to section |
|---|---:|---|
| `promotion_ready` | 101 | **A. Promotion Ready** |
| `doctrine_unresolved` + `doctrine_pending` | 162 + 97 = **259** | **C. Doctrine Blocked** |
| `low_confidence` + `unresolved_candidate` | 693 + 12 = **705** | **D. Folk / Unresolved** |
| `alias` + `duplicate_variant` | 415 + 21 = **436** | **E. Alias / Duplicate Archive** |

Plus `freestyleObservationalTricks.ts`: **46** hand-authored entries (all `pending-review`), **39** with a `proposedAddTotal` (derivable ADD), 0 with open blockers. And `freestyleTrackedNames.ts`: **1,664** names, **329** carrying an `operationalNotation` (ADD-derivable), the rest notation-less.

**The one genuine data gap:** there is no dedicated `needs_authoring` bucket. Section **B (Needs Authoring)** must be *derived* — the cleanest definition from existing fields is "structure is understood (has notation or a proposed ADD) but the entry is not yet `promotion_ready`" (i.e. the current "frontier/curator-confirm" set + obs-tricks with a `proposedAddTotal`). This is a derivation, not new ontology.

## 5. Curator workflow (the page's primary user)

The redesign optimizes four curator jobs:

1. **Find the next promotion batch** → open the page; **Promotion Ready is the first thing visible**, ordered by derived ADD. Scan the lowest-ADD group first (cheapest, highest-confidence promotions), confirm, done. No ecosystem hunting.
2. **Identify high-leverage blockers** → **Doctrine Bottlenecks** shows clusters sized by how many names a single ruling would unblock. The biggest cluster is the highest-leverage ruling to pursue.
3. **See doctrine bottlenecks** → each cluster states its one blocking question; resolving it unblocks the whole count.
4. **Understand frontier health** → the headline metric "X% structurally understood" (promotion-ready + needs-authoring ÷ total non-alias frontier) tells the curator how much of the frontier is grammar-legible vs still folk/unknown.

## 6/7. Recommended final layout

A **status-first, ADD-ordered hybrid**, top to bottom:

1. **Promotion Ready** (FIRST — per your steer), grouped by **derived ADD** (1-ADD, 2-ADD, …, ADD Unknown last). The headline "ready to promote" list.
2. A compact **frontier-health metric strip** immediately under it (5 numbers, see IA §metrics) — not a banner above the fold; the *ready list* is above the fold.
3. **Needs Authoring**, grouped by derived ADD — structure understood, awaiting notation/decomposition.
4. **Doctrine Blocked** — the existing cluster treatment (keep as-is; it is the page's best feature).
5. **Folk Names / Unresolved Structures** — summarized, full list behind disclosure.
6. **Alias / Duplicate Archive** — collapsed by default; "names that resolve to existing tricks."

**Rationale:** status answers the curator's actual questions ("what can I promote / what's blocked / why"); ADD-within-status answers "in what order" (cheapest first). Ecosystem becomes a *filter/secondary lens* (the matrix moves into a collapsible "frontier by ecosystem" health panel), not the primary axis. Leading with the ready list makes the page feel like a work queue, not a report.

**Implementation order (when EV3 builds it):**
1. Service: add a `deriveAdd(notation)` helper (count ATAM bracket-flags) + a `frontierStatus` classifier (ready / needs-authoring / doctrine / folk / alias) over the existing buckets. No data changes.
2. Re-shape `getObservationalLayerPage` to return status-grouped, ADD-ordered cards + the 5 metrics. Keep the ecosystem matrix as a secondary panel.
3. Rework `observational.hbs` to the layout above; reuse `observed-card-fields` + `observed-summary-section` partials.
4. CSS: status badges + ADD-group headings; reuse existing `.observed-*` classes.

**Risks:**
- **Needs-Authoring is derived, not stored** — if the derivation is wrong, A and B blur. Mitigation: define it explicitly (has structure ∧ ¬promotion_ready) and show the rule in the section intro.
- **ADD derivation from notation** must use the same bracket-flag counting as canonical ADD, or the page contradicts the dictionary. Mitigation: reuse one shared derive function; items without notation → ADD Unknown, never a guessed number.
- **Scope creep into promotion** — the page must stay read-only governance; a "promote" affordance is explicitly out of scope.
- **The alias archive (436)** could read as "more frontier"; label it clearly as *resolved/archive*, excluded from frontier-health math.

**Expected user impact:**
- Curator: the "next batch" goes from a multi-section scan to the first screen; doctrine leverage is explicit.
- Expert: frontier health is a single headline number.
- Beginner: a status ladder (ready → blocked → unknown) reads as a story, not a spreadsheet.

Companion docs: `EV2_INFORMATION_ARCHITECTURE.md` (sections, field→section mapping, ADD derivation, metrics), `EV2_WIREFRAMES.md` (By-ADD / By-status / Hybrid mockups + the recommended layout).
