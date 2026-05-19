# Notation Normalization Wave -- Plan

Wave-level plan document. Synthesizes the six cross-cutting
recommendations (NCR-1 through NCR-6) into a single sequenced
implementation roadmap with ROI framing, slice-level scoping, and
explicit dependency ordering.

Complements `FINAL_RECOMMENDATION.md`: the spine is the curator-facing
executive summary; this plan is the implementation-facing roadmap.

---

## 1. Wave context

### 1.1. Prior wave

The dictionary-coherence stabilization wave (2026-05-18) shipped six
CRs in sequence:

| CR | Effect | Status |
|---|---|---|
| CR-5 | 4-tier notation hierarchy on dictionary cards; `coreAtomLabel` rendering removed | Shipped |
| CR-4 | Category view soft-retirement | Shipped |
| CR-1 | New dictionary landing surface at `/freestyle/tricks` | Shipped |
| CR-2 | Observational layer discoverability (folded into landing card 5) | Shipped (folded) |
| CR-3 | Sets discoverability (folded into landing card 3 sub-link) | Shipped (folded) |
| CR-6 | Movement Neighborhoods rename | Shipped |

The subsystem reached architectural coherence on browse surfaces.

### 1.2. Notation Normalization Wave (this slice)

The dictionary-coherence wave addressed STRUCTURE (which surface
renders what content). This wave addresses CONTENT QUALITY (the
notation rendered on those surfaces).

Three notation systems coexist by design:

- Symbolic compositional shorthand ("torque = miraging osis")
- Full operational notation ("[set] > hippy in dex > op toe")
- Executable accounting ("xbody(1) + stall(1) = 2 ADD")

The systems are complementary; they serve different audiences. The
problem identified by the brief: all three currently render at equal
visual hierarchy on the `/freestyle` landing, weakening readability.
The brief mandates re-precedence so the most teachable form leads,
with disclosure pathways for the others.

---

## 2. Sequenced implementation roadmap

Six NCRs map to five implementation slices (NCR-1 + NCR-2 land
atomically). Sequenced per curator-locked priority (decision in
`FINAL_RECOMMENDATION.md`):

### Slice N1 — Core Tricks notation re-precedence (NCR-1 + NCR-2 atomic)

**Goal**: Replace the accounting prose line on each landing core
trick card with the curator-authored operational notation; preserve
the descriptive prose `equivalences[0]`.

**Touched files** (preliminary):

- `src/content/freestyleLandingContent.ts` (interface field add + 12
  verbatim strings per NCR-1)
- `src/services/freestyleService.ts` (`shapeCoreTrickCard()` two
  changes: source `symbolicNotation` from
  `spec.operationalNotation`; takeFirst on `semanticEquivalences`)
- `tests/integration/freestyle.portal.routes.test.ts` (update
  accounting assertions; add op-notation assertions for 12 atoms)
- `tests/integration/freestyle.routes.test.ts` (update tests
  asserting on accounting prose for atom cards)

**Estimated effort**: 1-2 hours coding + tests; 1 hour curator-paced
review.

**ROI**: Highest. Brief E1 is the wave's stated highest priority.
Single slice; smallest blast radius for largest content improvement.

**Risk**: Low. Content-module + shaping helper; reversible.

**Dependencies**: None. First slice of the wave.

---

### Slice N2 — Dictionary portal-card copy expansion (NCR-5)

**Goal**: Expand the Dictionary portal card body to preview five
browse perspectives plus Operators & Components as supporting
vocabulary (per decision #2).

**Touched files** (preliminary):

- `src/content/freestyleLandingContent.ts` or equivalent (portal
  cards content array; audit during implementation)
- `tests/integration/freestyle.portal.routes.test.ts` (assertion on
  new body string)

**Estimated effort**: ~30 minutes coding + test.

**ROI**: Medium. Trivial slice; lands the curator-decided framing
for the Dictionary portal card.

**Risk**: Trivial.

**Dependencies**: None.

---

### Slice N3 — Landing density cleanup + section reorder (NCR-4)

**Goal**: Move Basic Components + Operator Board UP between Featured
and Core Tricks per Reading A (decision #1); tighten vertical
spacing on the three teaching sections.

**Touched files** (preliminary):

- `src/views/freestyle/landing.hbs` (template-only cut-and-paste of
  sections 6+7 to slot 5+6)
- `src/public/css/style.css` (margin/padding tightening on
  `.freestyle-core-tricks`, `.freestyle-basic-components`,
  `.operator-board` containers)
- `tests/integration/freestyle.portal.routes.test.ts` (add section-
  order assertion: Featured → Basic Components → Operator Board →
  Core Tricks via `indexOf`)

**Estimated effort**: 1 hour coding + tests + layout review at three
breakpoints.

**ROI**: Medium. Re-orients the landing per curator intent; lighter
than N1 but visible.

**Risk**: Low. Template move is mechanical; CSS tightening is
incremental; easy to revert.

**Dependencies**: None functionally. May want to land after N1 so the
new op-notation paragraph on each core trick card is visible BEFORE
the surrounding section reorganization (helps curator visual review).

---

### Slice N4 — Notation tier-contract test pinning (NCR-3)

**Goal**: Pin the 4-tier rendering hierarchy via additional integration
tests so future slices don't drift.

**Touched files** (preliminary):

- `tests/integration/freestyle.portal.routes.test.ts` (Tier-4-prose-
  absence test for Core Tricks grid; Tier-2 op-notation contract
  per atom)
- `tests/integration/freestyle.dictionary-trick-card.routes.test.ts`
  (per-view Tier-4-prose-absence test extending the existing
  "Notation pending" absence test)
- `src/views/partials/core-tricks-grid.hbs` docstring (extend to
  reference the 4-tier contract)
- `src/views/partials/dictionary-trick-card.hbs` docstring (extend
  if needed)

**Estimated effort**: 1 hour test authoring.

**ROI**: Medium-low (load-bearing for future slices; not user-
visible). Insurance against regression as the wave evolves.

**Risk**: Trivial.

**Dependencies**: Must land AFTER N1 (Tier 2 assertions for landing
require the op-notation content to be present).

---

### Slice N5 — Family-ordering audit (NCR-6) PLANNING ONLY

**Goal**: Curator-facing audit document covering rev-up evidence,
family-ordering rationale, intra-family ordering options. No code
changes in this wave.

**Touched files**: ZERO source files. `family_ordering_audit.md`
in this directory is the deliverable.

**Estimated effort**: Already written (this turn).

**ROI**: Low immediate; medium long-term (informs curator decisions
that unlock follow-on slices).

**Risk**: Trivial.

**Dependencies**: None.

**Follow-on slices** (NOT in this wave; curator-paced):

- N5-followon-A: rev-up resolution (F-A / F-B / F-C choice)
- N5-followon-B: family-ordering rule change (O-A / O-B / O-C /
  O-D choice)
- N5-followon-C: intra-family ordering rule change (I-A / I-B /
  I-C choice)
- N5-followon-D: singleton-family policy (S-A / S-B / S-C choice)

Each follow-on is a small slice; curator triages cadence.

---

## 3. Slice sequence at a glance

Recommended implementation order, locked per curator priority:

```
1. Slice N1 (NCR-1 + NCR-2 atomic)  ──> Highest user-facing improvement; first
2. Slice N2 (NCR-5)                 ──> Trivial; can interleave
3. Slice N3 (NCR-4)                 ──> Landing reorg; visible
4. Slice N4 (NCR-3 test contract)   ──> After N1 lands; insurance
5. Slice N5 (NCR-6 audit only)      ──> Already written; planning artifact
```

Slices N1, N2 do not depend on each other and could land in either
order. N3 has a soft dependency on N1 for visual review. N4 has a
hard dependency on N1.

---

## 4. Wave ROI summary

| Concern | Pre-wave state | Post-wave state | Slice |
|---|---|---|---|
| Three notation systems compete on landing | Yes | No (re-precedence applied) | N1 |
| Core tricks have no operational notation | Yes | No (12 atoms have canonical op-notation) | N1 |
| Accounting prose leaks to public landing | Yes (Core Tricks grid) | No (pruned at shaping helper) | N1 |
| Dictionary portal card lists perspectives | Partial | Yes (six perspectives incl. Operators as vocabulary) | N2 |
| Teaching block precedes Core Tricks | No (post-CT today) | Yes (pre-CT after reorder) | N3 |
| Landing vertical spacing | Generous | Tightened (~25-35%) | N3 |
| 4-tier hierarchy contract | Documented inline (post-CR-5) | Tested explicitly | N4 |
| Family ordering / rev-up audit | Unclear / un-surfaced | Audit doc with curator decision queue | N5 |

---

## 5. Constraints honored (wave-wide)

Restated from `FINAL_RECOMMENDATION.md` § "What this wave explicitly
does NOT do":

- No parser maximalism.
- No accounting maximalism (accounting stays on `/freestyle/add-analysis`
  + future detail-page disclosures).
- No ontology hardening.
- No schema mutation.
- No observational/canonical collapse.
- No core-trick set expansion (12 atoms locked).
- No FM ingestion (curator-paced separate work).
- No Wave-2 doctrine assumptions.
- No D1-D8 resolution (dictionary-coherence wave queue stays).
- No `coreAtomLabel` rendering reintroduction.
- No symbolic-similarity / distance metric.

All five locked decisions baked across the slices:

1. E5 reading A (Components + Operators above Core Tricks).
2. Operators & Components included as supporting vocabulary.
3. NCR-2 path B (shaping-helper prune).
4. NCR-1 TS content module source-of-truth.
5. NCR-6 separate follow-on slices.

---

## 6. Implementation cadence recommendation

The curator can sequence the five slices flexibly. Two natural cadences:

### Cadence A: Single PR per slice

Each slice as its own PR (N1 → N2 → N3 → N4 → N5). Five PRs.
Smallest cognitive load per review; longest wall-clock.

### Cadence B: Bundle low-risk slices

- PR 1: N1 (the high-value slice, alone)
- PR 2: N2 + N3 (interleaved trivial copy edit + landing reorg)
- PR 3: N4 (test contract pinning)
- PR 4: N5 already shipped as planning doc (no PR needed)

Three PRs. Faster wall-clock; slightly larger PR-3 scope.

Recommendation: **Cadence B**. N2 + N3 are independent and both
landing-touching; bundling them lets the curator see the
post-reorg, post-copy-update landing in one pass.

---

## 7. After the wave: what's next

When all five slices land, the public freestyle surfaces will be:

- **Landing**: orient-first portal pathway; vocabulary primer before
  Core Tricks; Core Tricks with op-notation primary; Operators
  framed as vocabulary on Dictionary card.
- **Dictionary browse views**: 2-tier hierarchy (CR-5 + N4 contract
  enforces).
- **Trick-detail pages**: existing structure; tier-4 disclosure
  remains a future surface for executable accounting.
- **`/freestyle/add-analysis`**: educational accounting home,
  unchanged.

Open follow-on slices (each curator-paced; non-blocking):

- Rev-up resolution (N5-followon-A).
- Family-ordering policy change (N5-followon-B).
- Intra-family ordering policy change (N5-followon-C).
- Singleton-family policy (N5-followon-D).
- D1-D8 from prior wave (governance audit decisions still queued).
- Executable-accounting rollout on trick-detail pages (tier-4
  disclosure design + implementation).
- Broader FM ingestion (curator + Wave-2 dependent).
- Major canonical expansion (Wave-2 dependent).

The wave is sized to ship in 1-2 working days at unhurried pace. Each
slice is independently reversible; no slice depends on a downstream
slice landing.

---

## 8. Wave kickoff checklist (curator)

Before starting Slice N1:

- [ ] Curator has approved the five locked decisions (already done
      per session-level lock).
- [ ] Curator has approved the implementation sequence (N1 first).
- [ ] Curator has reviewed `core_trick_notation_completion_audit.md`
      for the 12 verbatim strings (the audit reads them from the
      brief; curator confirms they are still authoritative).
- [ ] Curator confirms `equivalences[1]` accounting prose stays
      preserved in the content module (not deleted, just demoted).
- [ ] Implementation slice spawn: invoke `extend-service-contract`
      skill (NCR-2 changes service shaping); invoke `write-tests`
      skill for the integration test updates.

---

## 9. Cross-references

- `FINAL_RECOMMENDATION.md` -- spine; cross-cutting recommendations
  NCR-1 through NCR-6; five locked decisions.
- `core_trick_notation_completion_audit.md` -- NCR-1; 12 verbatim
  op-notation strings; TS content module path.
- `compound_notation_strategy.md` -- NCR-2; shaping-helper prune
  Path B; compound-trick layering.
- `landing_density_cleanup.md` -- NCR-4 + NCR-5; section reorder +
  card copy expansion.
- `public_notation_render_hierarchy.md` -- NCR-3; 4-tier contract
  enforcement.
- `family_ordering_audit.md` -- NCR-6; audit-only deliverable;
  follow-on slices queued.
- Prior wave's `FINAL_RECOMMENDATION.md` -- CR-1 through CR-6
  context.
- Skill `footbag-freestyle-dictionary` doctrines A-D.
- Skill `freestyle-topology-governance` -- multi-axis caution.

---

## 10. Summary

Wave normalizes the public notation layer in 4 implementation slices
+ 1 planning artifact. NCR-1 + NCR-2 (atomic): operational notation
on landing core tricks; accounting demoted. NCR-5: dictionary portal
card copy expansion. NCR-4: landing density + section reorder per
Reading A. NCR-3: 4-tier contract test pinning. NCR-6: family-
ordering audit (planning only; follow-on slices curator-paced). All
locked decisions baked in. Wave preserves restraint doctrine, no
ontology hardening, no schema mutation, no observational collapse.
