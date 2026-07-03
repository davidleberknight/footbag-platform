# Encyclopedia inbound-link census (blueprint phase 0, 2026-07-02)

Read-only sweep companion to `PROPOSAL.md`. Method: every static `/freestyle/*` route
declared in `src/routes/publicRoutes.ts`, counting inbound references across all templates,
service shapers, and content modules, excluding each page's own template. Dynamic detail
routes (`:slug` pages) are excluded by design; they are reached through their hubs.

| Route | Inbound refs | Distinct source files |
|---|---:|---:|
| /freestyle/tricks | 220 | 41 |
| /freestyle/sets | 74 | 16 |
| /freestyle/glossary | 49 | 28 |
| /freestyle/add-analysis | 26 | 15 |
| /freestyle/operators | 19 | 9 |
| /freestyle/sets/reference | 18 | 6 |
| /freestyle/compositional-sets | 14 | 5 |
| /freestyle/combo-analysis | 10 | 6 |
| /freestyle/history | 9 | 7 |
| /freestyle/learn | 9 | 7 |
| /freestyle/records | 9 | 7 |
| /freestyle/insights | 8 | 6 |
| /freestyle/observational | 8 | 5 |
| /freestyle/media | 7 | 4 |
| /freestyle/progression/walking-family | 7 | 5 |
| /freestyle/competition | 4 | 4 |
| /freestyle/notation-article | 4 | 4 |
| /freestyle/about | 3 | 3 |
| /freestyle/leaders | 3 | 3 (was 0 before the landing tile shipped this session) |
| /freestyle/partnerships | 3 | 3 |
| /freestyle/search | 2 | 2 |
| /freestyle/search/suggest | 1 | 1 — an autocomplete endpoint, not a page; single consumer is correct |

## Reading

- **Zero true page orphans remain.** The one orphan found this session (leaders) was fixed
  before this census; the sole near-orphan is the search-suggest endpoint, whose single
  consumer is by design.
- **The thin tail** (2-4 distinct sources): search, partnerships, leaders, about,
  notation-article, competition. None is broken; these are the candidates to pick up
  incidental links as the de-dup phases (PROPOSAL.md) convert restated content into
  cross-links — e.g. fix 3 naturally adds notation-article links wherever tokens are
  currently re-explained.
- A stale note for the record: the tt-series gallery route remembered from earlier work no
  longer exists anywhere in src; its content presumably reached the /media named-gallery
  system. Not an orphan — a retired route.
