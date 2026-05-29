# Phase 1 — 7-ADD Catalog Audit (read-only)

Frontier Initiative phase 1. **Read-only / analysis only. Nothing promoted, no canonical data edited.**
All promotion remains curator + Red-gated. Source: read-only `database/footbag.db`, the PassBack
intake corpus, and `exploration/symbolic-master/comprehensive_symbolic_trick_corpus_2026-05-23.csv`.

## Headline

The 7-ADD base is **mathematically solid**: all 12 active 7-ADD rows pass the bracket-count ADD-math
check (`[DEX]/[BOD]/[XBD]/[PDX]/[DEL]/[UNS]/[XDEX]` count == 7) AND `computed_adds == 7`, and all have
aligned family/base. 11 of 12 parse `exact` (modifier-derived / self-atom); 1 is `policy_dependent`.
This is a strong foundation for 8/9-ADD work. The genuine frontier issues are narrow and named below.

## Part A — the 12 active 7-ADD rows

| Slug | Family | Base | ADD-math | Parser | Flag |
|---|---|---|---|---|---|
| blue-widow | whirl | paradox-symposium-whirl | OK | exact_self_atom | clean |
| chainsaw-massacre | legover | symposium-eggbeater | OK | exact_self_atom | clean |
| gangsta-party | blender | paradox-blender | OK | exact_self_atom | **equivalence Q** |
| gauntlet | torque | torque | OK | exact_modifier_derived | clean |
| gyro-ducking-symposium-torque | torque | torque | OK | exact_modifier_derived | clean (triple-BOD) |
| montage | whirl | whirl | OK | exact_modifier_derived | **notation casing** |
| overlord | blender | spinning-paradox-blender | OK | exact_modifier_derived | clean |
| spinning-ducking-paradox-blender | blender | blender | OK | exact_modifier_derived | **equivalence Q** |
| spinning-ducking-paradox-symposium-whirl | whirl | whirl | OK | exact_modifier_derived | clean |
| spinning-ducking-symposium-double-over-down | double-over-down | double-over-down | OK | **policy_dependent** | **DOD parser frontier** |
| stepping-ducking-paradox-blender | blender | blender | OK | exact_modifier_derived | clean |
| stepping-ducking-paradox-symposium-whirl | whirl | whirl | OK | exact_modifier_derived | clean (alias `stepping-ducking-ps-whirl`) |

**Per-check results:**
- **Notation consistency:** 11/12 use lowercase prose tokens (`(back) spin`, `(no plant while)`).
  `montage` alone uses UPPERCASE (`(BACK) SPIN`, `(NO PLANT WHILE)`). Cosmetic, but a real
  inconsistency; matches the known T6 casing deferral (no casing normalization without a curator call).
- **ADD-math:** 12/12 clean. No mismatches.
- **Family/base alignment:** 12/12 aligned; loader-19 family overrides correct (compound bases roll up
  to the right family root, e.g. `chainsaw-massacre` base `symposium-eggbeater` → family `legover`).
- **Modifier/operator interpretation:** standard chains (spinning/ducking/paradox/symposium/stepping/
  gyro on whirl/blender/torque/dod/eggbeater). No unregistered operators in the catalog.
- **Equivalence/compression:** `gangsta-party` (folk, base `paradox-blender`) and
  `spinning-ducking-paradox-blender` (structural, base `blender`) — the FM technical name for
  `gangsta-party` is literally "Spinning Ducking Paradox Blender", i.e. the other slug's name. Their
  op_notations differ slightly (gangsta-party: `OP FRONT WHIRL [DEX] [PDX]`; the structural row:
  `OP IN [PDX] [DEX]`). **Needs curator equivalence adjudication: same physical trick (folk-vs-structural
  pair → one canonical + S9 equivalence) or genuinely distinct?**
- **Policy-dependent flags:** 1 in-catalog — `spinning-ducking-symposium-double-over-down`. Pairs with
  the 6-ADD `miraging-symposium-double-over-down` (also `policy_dependent`): the **double-over-down
  family carries a recurring policy-dependent ADD interpretation** (the no-plant / double-OUT reading).
  This is the catalog's one true Tier-C / parser-frontier item.

## Part B — extension-candidate scan

Sources checked (read-only):

- **`policy_dependent` parser cases resolving 7+:** 1, and it is already in the catalog
  (`spinning-ducking-symposium-double-over-down`). No new parser-frontier 7+ rows.
- **PassBack corpus, dex ≥ 7:** **0.** PassBack does not document 7+ structures; not a 7-ADD source.
- **Symbolic corpus, footbag.org / official-attested ≥ 7, not in DB:** 4 total, **all ADD=7, zero ADD≥8.**
  - `stepping-ducking-paradox-torque` (fborg=7) — clean torque chain; siblings exist (`stepping-ducking-torque` 6, `ducking-paradox-torque` 6). **Strongest clean 7-ADD extension candidate.**
  - `shooting-double-over-down` (fborg=7) — DOD family; inherits the DOD policy-dependent question.
  - `stepping-ducking-ps-whirl` (fborg, staging-defer) — NOT new: already canonical as
    `stepping-ducking-paradox-symposium-whirl` via its `ps-whirl` alias (PS→paradox-symposium normalization).
  - one blank-named fborg corpus row — data-quality artifact, ignore.
- **Symbolic corpus, FM / source-claim ≥ 7 (lower confidence):** ~92 fm / ~206 source claims — folk-named
  high-complexity tricks (apocalypse, genesis, cold-fusion, atomotion, clown-face, dorshanatrix,
  blurry-chainsaw-massacre, …). FM/source-only, subject to the PassBack-outlier / FM-divergence rules;
  these are the Tier-B/C/D adjudication backlog, **not clean promotions.**
- **6-ADD tier (42 rows):** the structural extension base. Notable: `blurry-torque` parses `approximate`;
  `atomic-torque` is 6-ADD (Red-Q3-held op_notation); the DOD policy-dependent pattern recurs here.

**Key above-7 finding:** there are **no footbag.org/official-attested 8/9-ADD tricks absent from the DB.**
The above-7 space is FM/folk-attested only. This confirms 8/9-ADD readiness is *architecture/preparatory*
(charter phase 3), and the FM/folk ≥7 cohort is an adjudication backlog, not a promotion queue.

## Part C — findings by bucket (per request)

**Clean confirmed 7-ADD (11):** blue-widow, chainsaw-massacre, gauntlet, gyro-ducking-symposium-torque,
montage (modulo casing), overlord, spinning-ducking-paradox-symposium-whirl, stepping-ducking-paradox-
blender, stepping-ducking-paradox-symposium-whirl, plus the gangsta-party / spinning-ducking-paradox-
blender pair pending only the equivalence question (both are math-clean).

**Likely 7-ADD, needs curator/Red review:**
- `stepping-ducking-paradox-torque` — fborg-attested 7, clean sibling-derivable chain. Tier-A fast-track
  *candidate* (not promoted here).
- gangsta-party vs spinning-ducking-paradox-blender — equivalence/compression adjudication.

**Possible above-7 candidate:** none high-confidence (zero official/fborg ≥8). The FM/source folk cohort
(apocalypse / genesis / cold-fusion / clown-face / atomotion / …) is the lower-confidence pool for later
Tier-B/C/D adjudication.

**Blocked / unclear formula:**
- `spinning-ducking-symposium-double-over-down` (in-catalog, policy_dependent) + `shooting-double-over-down`
  (candidate) + 6-ADD `miraging-symposium-double-over-down` → the **double-over-down family ADD-interpretation
  doctrine** is the one real Tier-C blocker. Likely a Red question (no-plant / double-OUT reading).

## Recommendations + proposed next actions

1. **Treat the 7-ADD base as verified** (12/12 ADD-math clean). It is a sound foundation for phases 2–3.
2. **Resolve the DOD-family policy-dependent ADD interpretation** before extending DOD into 7-ADD — route
   as a Tier-C / Red question. Blocks `shooting-double-over-down` and clean DOD growth.
3. **Curator equivalence ruling:** gangsta-party vs spinning-ducking-paradox-blender (one trick or two?).
4. **`stepping-ducking-paradox-torque`:** strongest clean 7-ADD extension; queue for curator promotion
   review (would follow the existing red_additions + loader-19 path — NOT in this read-only pass).
5. **`montage` casing:** normalize to lowercase tokens, or formalize the T6 casing deferral.
6. **Above-7 / 8-9 readiness:** no clean attested candidates exist; phase-3 work is genuinely architectural
   (status taxonomy + parser-proof + adjudication pathways), and the FM/folk ≥7 cohort is the Tier-B/C/D
   intake backlog to triage — both reinforce the charter's 7-ADD-first sequencing.

Nothing in this audit promotes or edits canonical data. All actions above are proposals for curator
decision.
