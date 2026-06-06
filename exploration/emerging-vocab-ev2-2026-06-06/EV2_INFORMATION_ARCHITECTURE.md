# EV2 — Information Architecture

The status-first IA for `/freestyle/observational`. Every section and metric maps to an existing data field (no new ontology). Design-only.

## The five status sections (Task 2)

Status replaces source/ecosystem as the primary organizing axis.

| # | Section | Definition | Source field (existing) | Count today |
|---|---|---|---|---:|
| **A** | **Promotion Ready** | Structurally understood, clean derivable ADD, no doctrine blocker. Publication-ready pending curator sign-off. | `intakeBucket = promotion_ready` (+ obs-tricks with `proposedAddTotal` and no blocker) | 101 (+ up to 39 obs-tricks) |
| **B** | **Needs Authoring** | Structure understood, but notation / decomposition / documentation not yet authored. | **Derived:** has `operationalNotation` or `proposedAddTotal` AND not `promotion_ready` AND not doctrine-blocked (the current "frontier / curator-confirm" set) | ~the frontier set (matrix "Frontier" column) |
| **C** | **Doctrine Blocked** | Awaiting a Red / curator ruling. Concentrated in clusters; one ruling unblocks many. | `intakeBucket ∈ {doctrine_unresolved, doctrine_pending}` | 259 |
| **D** | **Folk Names / Unresolved Structures** | Documented names whose structure is not yet understood. | `intakeBucket ∈ {low_confidence, unresolved_candidate}` (+ the parser-uncertainty tail) | 705 |
| **E** | **Alias / Duplicate Archive** | Names that resolve to an existing trick. Archive, not frontier. | `intakeBucket ∈ {alias, duplicate_variant}` | 436 |

Notes:
- **A vs B is the only derived split.** There is no stored `needs_authoring` flag. Define B explicitly as *"structure understood, authoring not done"* and state the rule in the section intro so it's auditable. Everything else maps 1:1 to a stored bucket.
- **E is excluded from frontier-health math** — these names are already resolved; they're kept for search/lookup, collapsed by default.
- The 1,664 tracked names (source-grouped today) fold into A/B/D by the same rule: those with notation and a clean derivation → A or B; those without → D. Source becomes an attribution chip, not a section.

## ADD-first organization for A and B (Task 3)

Within Promotion Ready and Needs Authoring, the **primary grouping is derived ADD**:

- **Derive ADD from ontology** by counting ATAM bracket-flags (`[BOD]/[DEX]/[XBD]/[DEL]/[UNS]`) in the entry's `operationalNotation` — the same accounting the canonical dictionary uses. For obs-tricks, use `proposedAddTotal` directly.
- **Source-stated ADD is provenance only** — shown as a small "source: N" chip on the card, never used for grouping or ordering. (The page already forbids grouping by external ADD claim.)
- **Unknown structure → "ADD Unknown" bucket**, placed last in each section. Never invent a number.
- Group order: `1 ADD → 2 ADD → 3 ADD → … → ADD Unknown`. Lowest ADD first = cheapest, highest-confidence promotions surface first.

**Derivability today:** 329 tracked names carry notation (ADD-derivable); 39 of 46 obs-tricks carry a proposed ADD. The `promotion_ready` (101) set should be near-fully derivable (mechanical readings are why they're "ready"); any without notation fall to ADD Unknown and are a small authoring gap, not a guess.

## Frontier metrics (Task 4)

Exactly five numbers, each answering one of the page's questions. No vanity metrics (no "total names documented" headline, no per-source tallies up top).

| Metric | Definition | Value today |
|---|---|---:|
| **Frontier size** | non-alias emerging names (A+B+C+D) | ~1,065 |
| **Promotion-ready** | section A | 101 |
| **Doctrine-blocked** | section C | 259 |
| **Unresolved** | section D | 705 |
| **Alias / duplicate** | section E (shown but excluded from frontier) | 436 |

Plus one **derived headline**: **% structurally understood** = (A + B) ÷ (frontier size). This is the single "frontier health" number the expert wants. (Today, roughly promotion-ready + needs-authoring over ~1,065 — a low percentage, which is the honest state and exactly what the page should make visible.)

Avoid: raw "2,000+ names" vanity counts, per-source leaderboards, and any metric that grows just by ingesting more folk names (that would reward noise, not progress).

## Field → section decision table (for the future service)

```
for each emerging entry:
  if intakeBucket in {alias, duplicate_variant}      -> E (archive, exclude from frontier)
  elif intakeBucket in {doctrine_unresolved, doctrine_pending} -> C
  elif intakeBucket == promotion_ready               -> A   (group by derived ADD)
  elif hasStructure(entry)  # notation or proposedAddTotal, not doctrine-blocked -> B (group by derived ADD)
  else  # low_confidence / unresolved_candidate / no structure -> D
```

`hasStructure` and `deriveAdd` are the only two new helpers; both read existing fields. No schema change, no new bucket, no doctrine.
