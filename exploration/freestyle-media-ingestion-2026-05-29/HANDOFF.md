# Freestyle Media Ingestion sprint — resume handoff (2026-05-29)

Single load-bearing reference for resuming this sprint. Read this first.

## What this sprint is

Expand curated freestyle media coverage + media/ontology connectivity. Curator-ruled direction:
**extend the surviving unified `media_items` model** (NOT the deprecating `freestyle_media_*`, NOT new
parallel tables). This sprint is **architecture + staging only** — no DB writes, no gallery surfaces,
no service/tooling changes. The write (creating `media_items`, galleries, placement) is **Dave's
gallery-edit-tool track**; this track produces the data candidates + editorial selection.

## Artifacts (all in `exploration/freestyle-media-ingestion-2026-05-29/`)

- `ARCHITECTURE.md` — target model (media_items + media_tags + sidecars + SOURCE_TIER); entity
  mapping; §3 linkage-semantics gap; **§3a direct-vs-indirect coverage + the teaches/implies/
  components-covered relationship layer (proposed, deferred)**; §4 taxonomy; §5 trust/firewall;
  §6 the one reversible extension (`src/content/freestyleMediaTaxonomy.ts`, proposed not built);
  §7 future UI (Dave-track); §8 source sequencing.
- `PASSBACK_INGESTION_PLAN.md` — staging-only workflow; Red Wave 2 promotion gate.
- `ONTOLOGY_GAP_REPORT.md` — DB-verified gap buckets; op_notation backfill outcome (Bucket 2).
- `build_passback_candidates.py` + `candidates/01..07*.csv` + `candidates/README.md` — read-only
  candidate extraction from the 282-row intake; recovered 42 under-matched rows; 146 genuinely
  unresolved (Red-gated).
- `candidates/OPERATOR_TRIAGE.md` — curator ruling on 9 unregistered operators.
- `candidates/EXEMPLAR_CORPUS.md` — coverage audit (16% any video / 9% tutorial, direct `#slug`
  only) + 18-exemplar corpus + 4 action packets (orbit deferred, embedded-covered).

## Done this sprint (committed)

- Architecture + plan + gap report + candidate extraction + operator triage + exemplar corpus.
- **op_notation backfill:** `paradox-blender` + `fusion` (curator-ruled; via red_corrections +
  loader 19 + parser-populate; ADD-math verified). Canonical CSV path, never direct DB UPDATE.

## Standing threads (all await curator ruling; none blocking)

1. **`illusioning`** — ACCEPTED as a genuine modifier-form operator (~+1, parallel to miraging,
   distinct directional semantics); registry write **routed through Red Wave 2** (not written).
   Curator signalled a forthcoming ruling — apply it when given. Recorded in OPERATOR_TRIAGE.md.
2. **`walk-over`** op_notation — PARKED for curator-authored canonical-bracket form (2-ADD body
   primitive; no clean sibling).
3. **`atomic` / `atomic-torque`** op_notation — Red Wave 2 Q3 blocked (atomic-on-rotational scope).
4. **Red Wave 2 packet additions:** illusioning registration + the "gerund-of-a-base = operator?"
   general question (covers flailing).
5. **146-row unresolved promotion queue** (`candidates/02_*`) + `twisting`/`whipping` alias calls.
6. **4 exemplar action items** (flurry gap; barrage/blender/mobius tutorial upgrades) → Dave's tool
   + HTTP-verified URLs (no URL extrapolation — forever-rule).
7. **`teaches/components-covered` relationship layer** (ARCHITECTURE §3a) — next design direction
   after the §6 direct-tag conventions land; not built.

## Hard governance (do not violate on resume)

- Extend unified `media_items`; do not revive `freestyle_media_*`; do not add parallel tables.
- No promotion while Red Wave 2 open. Frequency is evidence, not authority.
- Dave owns gallery/media writes + UI placement; this track stops at the candidate manifest.
- Reversible TS/CSV/sidecar over SQL; verify external URLs before any media write.

## Load on resume

Memory `project_freestyle_media_ingestion`; skills `footbag-freestyle-dictionary` +
`freestyle-topology-governance`; this dir's docs above.
