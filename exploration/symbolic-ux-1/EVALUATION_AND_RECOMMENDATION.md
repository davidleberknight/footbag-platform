# SUX-1 Tasks F + G — Public-Surface Evaluation + Final Recommendation

Surface-by-surface educational usefulness assessment of every prototype in SUX-1 panels + navigation + glossary + decomposition + progression mockups. Final recommendation on path forward (Path A / B / C).

**Date:** 2026-05-12

---

## Part 1 — Surface usefulness evaluation (Task F)

### Evaluation criteria

Each prototype is scored on six axes:

| Axis | Question | Score: 1-5 |
|---|---|---|
| Educational value | Does it help learners build mental models? | 1=marginal, 5=transformative |
| Navigation value | Does it enable discovery players couldn't do before? | 1=marginal, 5=transformative |
| Cohort coverage | How much of the dictionary does it surface? | 1=narrow, 5=broad |
| Abstraction risk | Is the concept too abstract for casual readers? | 1=high risk, 5=clear |
| Ontology-conflict risk | Could it confuse IFPA canonical ontology? | 1=high risk, 5=safe |
| Implementation effort | How quickly can it ship from staging? | 1=heavy, 5=trivial |

Total possible: 30. **Score thresholds:** ≥25 ship-ready / 20-24 promising / 15-19 needs-work / <15 defer.

### Panel-mockup evaluations (Task A — 8 panels)

| # | Panel | Edu | Nav | Cohort | Clear | Safe | Ship | Total | Verdict |
|--:|---|--:|--:|--:|--:|--:|--:|--:|---|
| 1 | Related topology tricks | 5 | 5 | 5 | 5 | 5 | 4 | **29** | SHIP-READY |
| 2 | Modifier bridges | 5 | 4 | 5 | 4 | 5 | 4 | **27** | SHIP-READY |
| 3 | Symbolic decomposition | 5 | 3 | 5 | 3 | 4 | 3 | **23** | promising; complexity risk |
| 4 | Movement archetype | 4 | 4 | 4 | 4 | 5 | 4 | **25** | SHIP-READY |
| 5 | Symbolic families | 3 | 4 | 5 | 2 | 4 | 4 | **22** | promising; abstraction risk |
| 6 | Related operators | 3 | 3 | 3 | 4 | 5 | 4 | **22** | promising; narrower audience |
| 7 | Mechanical progression | 5 | 5 | 5 | 4 | 5 | 3 | **27** | SHIP-READY |
| 8 | Cross-family bridges | 5 | 4 | 5 | 3 | 4 | 3 | **24** | promising; explanation needed |

**Top 4 ship-ready panels** (≥25): Related topology tricks (29) / Modifier bridges (27) / Mechanical progression (27) / Movement archetype (25).

**Common strengths:** all panels score high on cohort coverage (most ≥4) and safety (most ≥4). Educational value is consistently strong.

**Common weaknesses:** abstraction risk (Panel 5 = 2; Panel 3 = 3 — concepts that risk confusing casual readers). Mitigation: clear layer-attribution headers + progressive disclosure (start with simple panel; offer deeper detail on click).

### Navigation-mockup evaluations (Task B — 5 navs)

| # | Navigation | Edu | Nav | Cohort | Clear | Safe | Ship | Total | Verdict |
|--:|---|--:|--:|--:|--:|--:|--:|--:|---|
| 1 | /freestyle/modifier/spinning | 5 | 5 | 5 | 4 | 5 | 4 | **28** | SHIP-READY |
| 2 | /freestyle/topology/butterfly-wing | 5 | 5 | 4 | 4 | 5 | 4 | **27** | SHIP-READY |
| 3 | /freestyle/modifier/paradox | 5 | 5 | 5 | 4 | 5 | 4 | **28** | SHIP-READY |
| 4 | /freestyle/topology/unusual-surface | 2 | 3 | 2 | 4 | 4 | 4 | **19** | needs-work; small cohort |
| 5 | /freestyle/archetype/uptime-dex-clipper-end | 4 | 4 | 4 | 3 | 4 | 3 | **22** | promising; complex query |

**Top 3 ship-ready navs:** modifier-family pages (spinning + paradox + butterfly-wing).

**Common pattern:** modifier-family + topology-family pages score high; compositional-query pages (Nav 5) need tighter UX. Small-cohort pages (Nav 4) are reasonable to defer until UNS-cohort grows.

### Glossary integration evaluations (Task C — 5 patterns)

| # | Pattern | Edu | Nav | Cohort | Clear | Safe | Ship | Total | Verdict |
|--:|---|--:|--:|--:|--:|--:|--:|--:|---|
| 1 | Multi-layer entry view | 5 | 4 | 5 | 4 | 5 | 3 | **26** | SHIP-READY |
| 2 | Related-tricks panel | 5 | 5 | 5 | 5 | 5 | 4 | **29** | SHIP-READY |
| 3 | Common-confusions section | 4 | 3 | 3 | 5 | 4 | 4 | **23** | promising |
| 4 | Notation example block | 3 | 3 | 3 | 4 | 5 | 4 | **22** | promising; narrower audience |
| 5 | Related modifiers panel | 4 | 4 | 4 | 4 | 5 | 4 | **25** | SHIP-READY |

**Top 3 ship-ready glossary patterns:** Related-tricks panel (29) / Multi-layer entry view (26) / Related modifiers panel (25).

### Decomposition example evaluations (Task D — 4 examples)

All four worked examples score similarly because they share a rendering grammar. Aggregate:

| Example | Edu | Nav | Cohort | Clear | Safe | Ship | Total | Notes |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| ripwalk decomposition | 5 | 4 | 4 | 4 | 5 | 4 | **26** | Single-modifier; clean teaching case |
| matador decomposition | 5 | 4 | 4 | 4 | 5 | 4 | **26** | Nuclear-structure teaching |
| montage decomposition | 5 | 4 | 5 | 3 | 5 | 3 | **25** | 5-modifier; complexity but flagship |
| torque decomposition | 5 | 4 | 5 | 3 | 4 | 3 | **24** | Multi-description equivalence; risk of conflating layers |

**Top 2 decomposition exemplars:** ripwalk + matador. Single-modifier compounds are the cleanest teaching cases. The multi-description equivalence pattern (torque, mobius) is educationally valuable but harder to render cleanly.

### Progression evaluations (Task E — 3 chains)

| Progression | Edu | Nav | Cohort | Clear | Safe | Ship | Total | Notes |
|---|--:|--:|--:|--:|--:|--:|--:|---|
| Hippy-in dex (mirage → smear → blur → paradox-mirage) | 5 | 4 | 4 | 4 | 5 | 3 | **25** | SHIP-READY; pt12-blocked blur a complication |
| Walking-family (butterfly → ... → matador → phoenix) | 5 | 5 | 5 | 5 | 5 | 4 | **29** | SHIP-READY; strongest progression |
| Whirl-rotational climb (whirl → ... → mullet → montage) | 5 | 5 | 5 | 4 | 5 | 3 | **27** | SHIP-READY; longest progression |

**All 3 progressions score ship-ready (≥25).** Walking-family is the standout (29) — clear pedagogy, broad cohort, low confusion risk.

---

## Part 2 — Summary findings

### Q: Which symbolic surfaces are immediately valuable?

Highest-value surfaces (score ≥27 + low complexity):

1. **Walking-family progression** (29) — clearest educational arc; broad cohort
2. **Related-tricks panel on glossary entries** (29) — every term page benefits
3. **Related topology tricks panel on trick pages** (29) — every trick page benefits
4. **Modifier-family pages** (spinning 28 / paradox 28 / butterfly-wing 27) — discovery surfaces
5. **Modifier-bridge panel** (27) — teaches modifier composition
6. **Mechanical progression panel** (27) — same content as full progression but compact
7. **Whirl-rotational climb progression** (27) — flagship-density teaching
8. **Multi-layer glossary entry view** (26) — foundational glossary upgrade

### Q: Which are too abstract?

Surfaces with abstraction risk (clear ≤3 OR total <22):

- **Symbolic families panel** (5; clear=2) — multi-axis simultaneous display can overwhelm
- **Cross-family bridges panel** (8; clear=3) — concept of "cross-cutting" requires explanation
- **Symbolic decomposition panel** (3; clear=3) — 4-layer display is information-dense
- **Unusual-surface navigation** (Nav 4; total=19) — small cohort limits usefulness

Mitigation: progressive disclosure (show simple by default; "show more" reveals advanced).

### Q: Which confuse IFPA ontology?

Surfaces with ontology-conflict risk (safe ≤3):

- **Torque decomposition example** (safe=4) — multi-description equivalence might suggest IFPA changes
- **Cross-family bridges panel** (safe=4) — explicit "cross-IFPA-family" framing needs care

Mitigation: explicit "observational / non-canonical" footer on every symbolic panel.

### Q: Which improve learning pathways?

Strongest learning-pathway contributions (edu=5):

- All 3 progressions (Walking / Hippy-in / Whirl-rotational)
- Related topology + Mechanical progression panels
- Modifier-bridge panel
- Symbolic decomposition (for advanced learners)
- All 4 decomposition examples
- Multi-layer glossary entry view
- Related-tricks panel on glossary

### Q: Which improve navigation?

Strongest navigation-value contributions (nav=5):

- All modifier-family navigations (spinning / paradox / butterfly-wing)
- Walking-family progression
- Whirl-rotational climb progression
- Related-tricks glossary panel
- Mechanical progression panel
- Related topology tricks panel

### Q: Which deserve eventual DB support?

Surfaces that benefit from query-driven dynamism (vs static CSV):

- **Modifier-family pages** — frequent filtering; benefits from query speed
- **Topology pages** — group-membership joins; benefits from indexed lookup
- **Related-tricks glossary panel** — bidirectional resolution; benefits from indexed lookup
- **Mechanical progression panel** — ADD-tier sorting; benefits from query

Surfaces that work fine from CSV staging (no DB needed yet):

- **Decomposition examples** — pre-rendered; minimal queries
- **Common-confusions sections** — static prose
- **Progression chains** — fixed authored content
- **Symbolic-families panel** (when shown) — simple group lookup

---

## Part 3 — Final recommendation (Task G)

**Recommended Path: C — Hybrid Experimental Rollout**

### Why Path C

**Path A (CSV staging longer)** delays public validation indefinitely. Without public exposure, we can't measure educational impact or surface UX issues that mockups can't catch. The 4-month curator-triage backlog (per GS-1 §recommended-next-phase) plus future-DB-migration delay risks the symbolic-grammar work becoming shelf-ware.

**Path B (full DB schema support)** front-loads engineering cost for surfaces whose UX isn't validated yet. Three new tables (`symbolic_groups` + `symbolic_group_memberships` + `glossary_relationships`) plus loader plus service layer = ~5-7 dev-days before any user-visible benefit. Pre-mature.

**Path C (hybrid)** ships the highest-value surfaces FROM STAGING CSVs while reserving DB migration for later, after public UX validation surfaces real signal.

### Path C phasing

**Phase 1 (immediate; ~3-4 dev-days) — Ship from CSV staging:**

1. **Modifier-family pages** (`/freestyle/modifier/:slug`) — top 3 ship-ready (spinning, paradox, butterfly-wing). Service reads `symbolic_modifier_groups.csv` + `symbolic_group_membership.csv` at startup; caches in memory.
2. **Walking-family progression page** (`/freestyle/progression/walking-family`) — hand-authored content; pre-renders from staging CSVs.
3. **Related topology tricks panel** on trick-detail pages — embeds via service join on staging CSV.
4. **Related-tricks panel on glossary entries** — same service pattern.

Total: 4 surfaces, all top-scoring.

**Phase 2 (after public validation; ~2-3 dev-days) — Add 4 more surfaces:**

5. Modifier-bridge panel on trick pages
6. Whirl-rotational climb progression page
7. Multi-layer glossary entry view (v4 architecture Phase A)
8. Mechanical progression panel

**Phase 3 (after 4-8 weeks of public data; ~4-5 dev-days) — DB schema migration:**

After observing usage patterns + curator-triage results + UX feedback:
1. Build `symbolic_groups` + `symbolic_group_memberships` + `glossary_relationships` tables
2. Loader script (transaction-wrapped per `db-write-safety.md`)
3. Service layer migrates from CSV-load to DB-load (zero user-visible change; performance improvement)

**Phase 4 (after schema migration; ~3-4 dev-days) — Curator workflow:**

1. Admin UI for adding/editing glossary entries + symbolic-group memberships
2. Curator-approval gate before any new entry surfaces publicly
3. Audit log of all edits

**Phase 5 (when stable; ~2-3 dev-days) — Advanced features:**

1. Symbolic decomposition panel (advanced disclosure)
2. Cross-family bridges panel
3. Symbolic-families panel
4. Compositional-query navigation (Nav 5)

### Why this phasing works

- **Phase 1 surfaces are independent.** Each can ship without the others. Walking-family progression ships even if modifier pages aren't ready.
- **CSV-staging-driven** keeps DB migration risk out of the critical path.
- **Public exposure happens BEFORE DB lock-in.** Schema design benefits from observed usage patterns.
- **Reversibility preserved.** Any Phase 1 surface can be hidden via a config flag if validation surfaces problems.
- **Constraint check.** Every phase preserves the four-layer separation, the read-only canonical guarantee, and the observational/educational layer attribution.

### What Path C does NOT do

- Does NOT propose DB schema changes in Phase 1-2.
- Does NOT auto-promote symbolic groups to canonical ontology.
- Does NOT modify `freestyle_tricks` / `freestyle_trick_modifiers` / `freestyle_trick_aliases` in any phase.
- Does NOT ship Symbolic Families panel + Symbolic Decomposition panel until Phase 5 (after UX validation reduces abstraction risk).

### Constraint check (Path C)

| Constraint | Status |
|---|---|
| Zero DB writes | ✓ Phase 1-2 (CSV-only); Phase 3+ uses additive tables, no canonical mutation |
| Zero schema migration | ✓ Phase 1-2; Phase 3 = additive tables only |
| Zero canonical family rewrites | ✓ all phases |
| Zero parser changes | ✓ all phases |
| Zero ADD changes | ✓ all phases |
| Zero alias insertion | ✓ all phases |
| Symbolic layer remains observational | ✓ explicit layer attribution on every surface |
| Educational validation before schema lock-in | ✓ Phase 3 follows Phase 1-2 public exposure |

---

## Cross-references

- `DESIGN_OVERVIEW.md` — frame + constraints + cross-refs
- `01_PANEL_MOCKUPS.md` — 8 panel mockups
- `02_NAVIGATION_MOCKUPS.md` — 5 navigation mockups
- `03_GLOSSARY_INTEGRATION.md` — 5 glossary integration patterns
- `04_DECOMPOSITION_EXAMPLES.md` — 4 worked decompositions
- `05_PROGRESSION_CONCEPTS.md` — 3 progression chains
- SG-2 nav-prototype specs (implementation patterns)
- GLOSSARY-SYNTHESIS-1 outputs (v4 architecture)
