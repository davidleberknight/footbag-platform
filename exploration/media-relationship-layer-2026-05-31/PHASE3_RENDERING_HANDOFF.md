# Phase 3 rendering handoff — public direct-vs-embedded coverage

**For the maintainer who owns public media UI placement.** This is a recommendation/spec, not
an implementation. James-track (data + governance) is complete; the public *rendering* is your
track. Nothing here touches galleries, the seeder, or the gallery-edit tool.

Builds on `MEDIA_RELATIONSHIP_LAYER_PLAN.md` (this dir) Part D, and the shipped Phase 1/2 work.

---

## 1. What is already ready (James-track, shipped)

| Piece | Where | State |
|---|---|---|
| Relation vocabulary | `src/content/freestyleMediaTaxonomy.ts` | 5 relations (`teaches`, `components-covered`, `demonstrates`, `exemplar-of`, `progression-step`), media kinds, linkage namespaces, review states. Declarative; no consumers yet. |
| Direct coverage data | `media_items` + `media_tags` (unified graph) | A curated clip = a `media_item` carrying `#curated` + `#<slug>`. Already read by the trick-detail Reference Media block. |
| Embedded coverage data | `legacy_data/tools/trick_video_discovery/embedded_coverage.csv` | Curator manifest: `orbit ← around-the-world (TT)`, `illusion ← mirage (TT)`. **Python-read only — see §4 prerequisite.** |
| Honest coverage metrics | `legacy_data/event_results/scripts/24_qc_freestyle_media_coverage.py` | Migrated to the unified graph: 71 strong direct (13.8%), embedded reported separately; `EMBEDDED_ONLY` bucket. Internal dashboard. |

Direct coverage is fully renderable today. Embedded coverage needs one bridge (§4).

## 2. What to build (your track)

MVP surface = **trick-detail page** (`/freestyle/tricks/:slug`), where the Reference Media block
already exists. Add the **direct-vs-embedded distinction**; then fan out to family/operator/glossary.

| Surface | Render | Priority |
|---|---|---|
| Trick detail | "▶ Tutorial / Demo" (direct) + a lighter "Also taught inside …" line (embedded) | **MVP** |
| Media card | coverage chips: "Teaches: pixie, fairy" | MVP-adjacent |
| Family page | one `exemplar-of` hero + per-member coverage chips | next |
| Operator page | "See the paradox operator in action" | next |
| Glossary / set encyclopedia | inline demo on a feel/concept card (collapsed) | later |

## 3. UX contract (from plan Part D — non-negotiable framing)

Users see the **human consequence**, never the taxonomy. Target feeling: *"oh, this video also
teaches pixie and fairy"* — never *"this creates an `exemplar-of` edge."*

- **Direct** (dedicated clip): "Tutorial available" / "Demo only — no tutorial yet."
- **Embedded** (taught inside another lesson): "Also taught inside the **Around The World** tutorial"
  — names the host, makes the indirect nature obvious; **never a bare 'covered' checkmark**.
- **Separation:** direct media renders first; embedded renders under a lighter "Where else it's
  taught" line. They are visually distinct.
- **Restraint** (carry the symbolic-restraint doctrine): no relationship-graph visualizations, no
  interactive edge explorers, no "ontology" language anywhere public. A coverage chip is a
  navigation aid, not a claim.

## 4. The one prerequisite — embedded edges must reach the TS service

Direct coverage is already in `media_items` (service-readable). **Embedded coverage is not** — it
lives only in the Python-read `embedded_coverage.csv`, which `freestyleService.ts` cannot read. To
render "also taught inside X", the embedded edges need a service-readable source. Options:

1. **Reversible TS content module** (recommended): `src/content/freestyleEmbeddedCoverage.ts`
   mirroring the manifest, read by `freestyleService`. Consistent with `freestyleMediaTaxonomy.ts`
   and the other `src/content/freestyle*` modules; no schema, no seeder, fully reversible. The CSV
   stays the curator-edit surface; keep the two in sync (a tiny generator or a sync test).
2. Represent embedded edges as `media_tags` (needs validator whitelisting + seeder change — your
   territory; heavier).

**Recommendation:** I (James-track) can produce option 1 as a small follow-up slice — that is the
clean bridge and keeps the data on the reversible-content-module path. Say the word and it's the
next slice; it unblocks your embedded rendering with zero schema/seeder work.

## 5. Data contract (how to read coverage)

- **Direct:** `media_items` joined to `media_tags`; a clip covers trick `S` if it carries `#curated`
  and `#<S>`. Strength/tier: use `freestyleService.ts` **`SOURCE_TIER`** (the TS authority) — do NOT
  re-derive from the dashboard's Python source sets.
- **Embedded:** from the §4 bridge — `{embedded_slug: [host_slug, …]}`; render the host trick name +
  a deep-link to the host's detail page.
- **Relation labels/targets:** `MEDIA_RELATION_TYPES` in `freestyleMediaTaxonomy.ts`.
- **Pending/active:** only render coverage for `is_active=1` tricks (existing public filter).

## 6. Governance — the firewall (must hold in rendering)

From `[[feedback_glossary_detail_page_alignment]]` and the plan's firewall:

- **Pedagogical, never ontological.** A coverage chip says "this video helps you learn X" — never
  asserts equivalence, ADD, decomposition, or family. No media edge mutates canonical trick data.
- **Embedded ≠ direct.** Embedded coverage is rendered separately and never inflates a "has a
  tutorial" claim. (The dashboard already keeps the metrics separate; the UI must too.)
- **Doctrine-gated targets stay observational.** Any embedded edge whose host/target sits in a
  Red-Wave-2 cluster (atomic-rotational, blurry, eclipse decomposition, illusioning) renders as an
  open/observational reading, never a settled structural claim. Today's two edges (orbit, illusion)
  are doctrine-clean and SAFE to surface.
- **Lockstep:** if a target trick's canonical op_notation / ADD / family changes, the coverage
  wording updates in lockstep (same rule as the glossary case-study alignment).

## 7. Scope boundaries

- **Yours (this handoff):** the §2 surfaces — service shaping for rendering + templates + CSS +
  route-level tests. UI placement decisions.
- **James-track (done / offered):** the relation vocabulary, the embedded manifest, the honest
  internal metrics, and (offered, §4) the TS embedded-coverage bridge module.
- **Not in scope for anyone yet:** Phase 4 progression graphs; doctrine-gated embedded edges.

---

### Provenance
`MEDIA_RELATIONSHIP_LAYER_PLAN.md` (Part D UX, E firewall); shipped Phase 1 registry
(`freestyleMediaTaxonomy.ts`), Phase 2 manifest + dashboard migration (script 24, unified graph);
governance per `freestyle-topology-governance` (observational ≠ canonical) and memory
`feedback_glossary_detail_page_alignment` / `feedback_gallery_dave_track`. Design only; no code,
schema, seeder, gallery, or ontology change.
