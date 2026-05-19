# Footbag.org Mapping Report -- 2026-05-19

Phase 1 deliverable for the workbook governance gate (curator direction 2026-05-19). Synthesizes the 9-audit fborg reconciliation corpus into a single mapping view against the 197-row workbook scope.

---

## 1. Source corpus reviewed

Ten footbag.org source documents reviewed across 9 audit packages (some audits review multiple sources):

| # | Source | Audit package | Coverage |
|---|---|---|---|
| 1 | (internal) multiplier doctrine | exploration/add-multiplier-doctrine-2026-05-19.md | 31 operators classified; 5-class taxonomy |
| 2 | JobsNotation.txt | exploration/job-notation-reconciliation-2026-05-19/ | 15 example tricks |
| 3 | fundamentalmoves.txt | exploration/fundamental-moves-reconciliation-2026-05-19/ | 18 fundamental moves |
| 4 | paradoxMoves.txt | exploration/paradox-moves-reconciliation-2026-05-19/ | 57 paradox compounds |
| 5 | paradox-tutorial.txt | (within paradoxMoves audit) | 1999 doctrinal source |
| 6 | gyroMoves.txt | exploration/gyro-moves-reconciliation-2026-05-19/ | 9 gyro compounds |
| 7 | blurryMoves.txt | exploration/blurry-moves-reconciliation-2026-05-19/ | 18 blurry compounds |
| 8 | pixieMoves.txt | exploration/pixie-moves-reconciliation-2026-05-19/ | 21 pixie compounds |
| 9 | footbag-sets-fborg.txt | exploration/footbag-sets-reconciliation-2026-05-19/ | ~50 set/operator definitions |
| 10 | Add-Categories-move-elements.txt | exploration/add-categories-reconciliation-2026-05-19/ | 5 ADD categories + 7 move elements |

Remaining unreviewed: `moves-on-video.txt` (low-priority pedagogical media cross-reference).

**Total distinct fborg trick/concept entries inventoried: ~200**

---

## 2. Workbook coverage from fborg sources

Per the regenerated workbook (197 rows; 166 active DB + 31 placeholder):

| Field | Source | Coverage | Rate |
|---|---|---|---|
| Operational notation (fborg_formula) | fundamentalmoves.txt + paradoxMoves.txt + gyroMoves.txt + blurryMoves.txt + pixieMoves.txt | 19 / 197 | 10% |
| External ADD value (fborg_add) | same | 19 / 197 | 10% |

The 10% fborg coverage rate is LOW relative to the audit-corpus richness. Investigation:

- The fborg parser (`parse_fborg_all()` in workbook generator) reads the 7 sources but matches against canonical slugs via `NAME_ALIASES` (a curator-curated alias map).
- Most fborg-source-named tricks (e.g., "Paradox Mirage", "Pogo Paradox Mirage", "Magellan", "Blurry Drifter") may not be matched if their name forms don't match an entry in `NAME_ALIASES`.
- Newly-confirmed canonical rows from recent sprints (rake, orbit) and folk-named compounds from audits (yoda, blurrage, lotus, voodoo, etc.) need NAME_ALIASES entries to be matched.

**Gap-fill opportunity:** extend `NAME_ALIASES` from the 9-audit corpus inventory CSVs. Each per-audit `*_examples.csv` provides `example_name` and `normalized_name` pairs that map exactly to NAME_ALIASES entries.

---

## 3. Quick-win NAME_ALIASES extensions (curator-paced)

From the 9-audit corpus, ~120+ name/slug pairs could be added to NAME_ALIASES to dramatically improve fborg/PB/FM matching:

### 3.1 From fundamentalmoves.txt (18 entries)

All 18 already in DB; check NAME_ALIASES coverage:
- Most already covered (toe-stall, clipper-stall, mirage, legover, butterfly, osis, paradox-mirage, symposium-mirage, paradon, spinning-osis, torque, ripwalk, blur, mobius, paradox-torque, flying-clipper)
- Verify: "Inside Delay" → inside-stall; "Outside Delay" → outside-stall; "Toe Delay" → toe-stall

### 3.2 From paradoxMoves.txt (57 entries)

Folk-named compounds NOT yet in NAME_ALIASES:
- voodoo, blizzard, blurrage, bedwetter, lotus, whirlwind, marius, paratoxic, blurry-drifter, symposium-tomahawk, paradox-high-plains-drifter (12 folk names per paradoxMoves audit)
- Structural-form names: paradox-illusion, paradox-barrage, paradox-blur, paradox-double-leg-over, paradox-symposium-mirage, pogo-paradox-mirage, spinning-paradox-illusion, spinning-paradox-mirage, etc. (28+ structural forms)

### 3.3 From gyroMoves.txt (9 entries)

Missing from NAME_ALIASES:
- vortex (already in DB but no alias entry), spyro-gyro, flurricane, gyro-butterfly, inspinning-same-side-illusion, inspinning-same-side-mirage, inspinning-same-side-butterfly

### 3.4 From blurryMoves.txt (18 entries, 4 unique)

NEW from blurryMoves (not in paradoxMoves):
- symposium-blizzard, symposium-blur, stepping-ps-whirling-x-body-rake

### 3.5 From pixieMoves.txt (21 entries)

Most NOT in NAME_ALIASES:
- yoda, terrage, smudge, magellan, smog, smoke, parkwalk, dimwalk
- Pixie structural forms: pixie-opposite-clipper, pixie-same-clipper, pixie-same-side-illusion, pixie-leg-over, symposium-pixie, pixie-eclipse, pixie-swirl, backside-symposium-smear, pixie-whirl, pixie-double-over-down, pixie-paradon

### 3.6 From footbag-sets-fborg.txt (~50 entries)

Set primitives mostly already in NAME_ALIASES or DB. Source-only sets (would need new NAME_ALIASES entries):
- terraging, slapping, bubba, frantic, flailing, fairy-atomic, infracting
- Spinning compounds: fairy-spinning, pixie-inspinning, sonic, peeking, leaning, go-go, twinspinning, neutron
- Whirling/swirling: scattered, shattered, blistering, broken
- UNS sets: finchy, pixie-pinching, twisted, snapping, arctic, zoid

### 3.7 From Add-Categories-move-elements.txt

Only 1 named trick (down-diver-down). All move elements (paradox / symposium / pixie / fairy / etc.) already mapped.

---

## 4. Source-coverage matrix (top 30 active canonical rows)

Per workbook output, top-priority canonical rows with fborg coverage gaps:

| Slug | fborg_status | pb_status | fm_status | Notes |
|---|---|---|---|---|
| pixie | present (TOE > SAME IN [DEX] > OP TOE [DEL]) | source_absent | source_absent | Dual identity confirmed; PB lookup needs alias |
| smear | source_absent | ? | source_absent | Folk name; alias lookup needed |
| smudge | source_absent | ? | source_absent | Folk name |
| smoke | source_absent | ? | source_absent | Folk name |
| smog | source_absent | ? | source_absent | Folk name |
| magellan | source_absent | ? | source_absent | Folk name |
| dimwalk | source_absent | ? | source_absent | Folk name (pixie butterfly) |
| parkwalk | source_absent | ? | source_absent | Folk name (pixie butterfly same side) |
| atom-smasher | source_absent | ? | source_absent | Wave 2-blocked |
| sailing | source_absent | ? | source_absent | Set-primitive trick |
| food-processor | source_absent | ? | source_absent | Folk name (blurry blender) |
| vortex | source_absent | ? | source_absent | Source matched to fborg=present after alias fix |
| big-apple | source_absent | ? | source_absent | Gyro symposium torque |
| blurry-whirl | source_absent | ? | source_absent | Stepping paradox whirl |
| blurry-torque | source_absent | ? | source_absent | Stepping paradox torque |
| gauntlet | source_absent | ? | source_absent | Has notation in DB; fborg alias gap |

(Full row inventory in `legacy_data/reports/trick_reconciliation.csv`)

---

## 5. Missing IFPA formula queue (77 rows; reduced from prior count)

77 rows have status=`missing_ifpa_formula`. Most fall into 3 categories:

| Category | Count | Pattern |
|---|---|---|
| Modifier-as-trick rows (operator-layer storage) | ~10 (barraging blazing ducking gyro miraging spinning stepping tapping terraging weaving) | These are pedagogical-layer rows without canonical operational notation; expected |
| Body primitives | ~7 (per BODY_PRIMITIVE_SLUGS) | Not-applicable for notation; should be `not_applicable` status |
| Compounds with blank operational_notation in DB | ~60 | Curator-paced authoring queue (cross-references the 48-row HELD quick-wins from 9-audit corpus) |

---

## 6. ADD disagreement queue (2 rows)

Currently 2 ADD-disagreement rows. Cross-references:

| Slug | IFPA ADD | External ADD | Source | Notes |
|---|---|---|---|---|
| atom-smasher | 4 | 3 | FM | Red 2026-05-15 ruling: atomic-specific x-dex contribution; cross-references multiplier doctrine audit Sprint 4 |
| rake | 2 | 3 | FM | Red review pending; cross-references Sprint 6 rake doctrine |

Both are Wave 2-flagged and curator-locked at their IFPA values.

---

## 7. Alias / name disagreement queue (0 rows by current workbook status)

No rows currently flagged as `name_alias_disagreement`. However, the 9-audit corpus surfaced several naming-doctrine questions:

| Source name | Modern name/chain | Disagreement |
|---|---|---|
| Paradox Double Legover (Job 1995) | double-leg-over (chain: miraging legover) | Naming framing — Job RP-1 |
| Pdx Blur (Job 1995) | blur (chain: stepping paradox mirage) | Naming framing — Job RP-2 |
| Tomahawk = Ducking Paradox Whirl (paradoxMoves) | tomahawk = blurry ducking torque (modern) | Chain reading divergence — paradoxMoves W2-16 |
| Stepping Opposite Osis (FM source for torque) | torque = miraging osis (modern Red pt4) | Chain reading divergence — FM FRP-1 |
| Stepping Opposite Side Butterfly (FM source for ripwalk) | ripwalk = stepping butterfly (modern, compressed) | Compression-doctrine — FM FRP-2 |

These should likely be flagged as `name_alias_disagreement` in a future workbook iteration; for now they live in the per-audit Wave 2 candidate files.

---

## 8. Family / notation gaps

Family coverage: 79% (156/197 rows). Missing family classification:
- All 31 placeholder slugs (no DB row → no trick_family)
- ~10 modifier-as-trick rows have trick_family but it equals the slug (self-bucketed)
- A handful of compound rows have null trick_family (curator-paced)

Notation coverage (combined compact + full):
- compact_status present: 78/197 (40%)
- full_status present: 42/197 (21%)
- job_status present: 0/197 (0%)

The notation gap is the LARGEST coverage opportunity. The 9-audit corpus has surfaced operational notations for 48+ canonical rows (HELD pending Red Wave 2 token-grammar decisions). Once Red answers settle (FRP-3 flag order; FRP-4 step marker; FRP-6 surface-stall opener), these notations can ship.

---

## 9. Recommended Phase 1 mechanical action

ONE mechanical extension warranted now (low risk, high impact):

**Action: extend NAME_ALIASES with ~120 entries from the 9-audit corpus.**

- Source: each per-audit `*_examples.csv` provides `example_name` + `normalized_name` pairs.
- Impact: fborg_status / pb_status / fm_status coverage rates likely jump from 10% / 44% / 0% to 50% / 60% / 30%+ after the alias map is enriched.
- Risk: low; NAME_ALIASES is a workbook-generator-internal map; no DB or doctrine impact.

Deferred to a separate slice (not bundled into the workbook code change of Phase 1) to keep the governance-gate commit focused.

---

## 10. Summary

The workbook now exposes the full active canonical surface (166 active rows + 31 placeholders = 197 total) with per-field status enums. The fborg source-coverage rate is 10% — mostly limited by NAME_ALIASES not being extended to capture the audit-corpus naming variants. The footbag.org source material is RICH (200+ trick/concept entries across 10 sources) but the workbook's matching layer needs extension.

**Phase 1 coverage gate established. Ready for Phase 2 status-completion review.**
