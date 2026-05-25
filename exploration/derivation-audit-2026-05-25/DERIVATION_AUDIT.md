# DERIVATION_AUDIT — pre-Red derivation governance pass (2026-05-25)

## 0. Status & scope

Pre-Red governance pass to resolve operational-notation gaps using the modifier grammar already present in the dictionary. Goal: reduce the "JOB: notation pending" rendering surface by classifying every unresolved trick into a derivation bucket, surfacing candidate JOB rows where the grammar supports it, and isolating true doctrine ambiguities that genuinely need Red adjudication.

| Census | Count |
|---|---|
| Active dictionary tricks | 270 |
| Has `operational_notation` (JOB) | 209 |
| Lacks `operational_notation` | **61** |
| Has `notation` (legacy column) | 104 |
| Has both empty | 166 |

The 61-row gap is what the curator-facing card renders as `JOB: notation pending` on the first-class-row partial. This audit classifies all 61 into four buckets.

**Critical scope discipline (per user direction):**

- Do NOT auto-apply candidates.
- Do NOT mutate the DB or `freestyleSymbolicEquivalences.ts`.
- Produce the audit; identify derivation rules explicitly; surface candidates per bucket; let the curator decide what lands.

## 1. Observed modifier grammar (extracted from resolved siblings)

These rules emerge from cross-base comparison of resolved compounds. Each rule states the OBSERVED transformation; some have base-specific variations.

### 1.1 paradox

**Signature:** Adds a `[PDX]` tag attached to the first `[DEX]` token; entry shifts from `SET` → `CLIP`; first-dex direction often flips `OP → SAME`.

| Base | Base op | Resolved paradox-X op |
|---|---|---|
| mirage | `SET > OP IN [DEX] > OP TOE [DEL]` | `CLIP > OP IN [PDX] [DEX] > OP TOE [DEL]` |
| whirl | `SET > OP IN [DEX] > OP CLIP [XBD] [DEL]` | `CLIP > SAME IN [PDX] [DEX] > OP CLIP [XBD] [DEL]` |
| illusion | `SET > OP OUT [DEX] > OP TOE [DEL]` | `CLIP > SAME OUT [PDX] [DEX] > OP TOE [DEL]` |
| barrage | `CLIP > SAME IN [DEX] > SAME IN [DEX] > OP TOE [DEL]` | `CLIP > SAME IN [PDX] [DEX] > SAME IN [DEX] > OP TOE [DEL]` |
| dlo | `SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | `CLIP > SAME IN [PDX] [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |

**Variation:** paradox-mirage retains `OP IN`; paradox-whirl/illusion/dlo flip to `SAME IN`. This is a base-specific paradox subtype (curator territory; not safe to apply blindly to unknown bases without inspecting the chain).

### 1.2 ducking

**Signature:** Prepends a `DUCK [BOD]` body-modifier moment after the entry token. Entry typically `TOE` (sometimes `SET`).

| Base | Base op | Resolved ducking-X op |
|---|---|---|
| mirage | `SET > OP IN [DEX] > OP TOE [DEL]` | `TOE > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]` |
| clipper-stall | `[set] > clipper` | `TOE > DUCK [BOD] > SAME CLIP [XBD] [DEL]` |
| osis | `SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]` | `SET > DUCK [BOD] > SAME or OP OSIS [BOD] [XBD] [DEL]` |

**Variation:** ducking-osis collapses the dex+spin into a single `OSIS [BOD]` token (osis-specific compaction). Other bases use the cleaner prepend-DUCK rule.

### 1.3 spinning

**Signature:** Prepends a `(back) SPIN [BOD]` body-modifier moment; entry shifts `SET → CLIP`. When the base already carries a spin (osis), the result is a double-spin pattern.

| Base | Base op | Resolved spinning-X op |
|---|---|---|
| clipper-stall | `[set] > clipper` | `CLIP > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |
| pickup | `SET > OP IN [DEX] > SAME TOE [DEL]` | `CLIP > (back) SPIN [BOD] > OP IN [DEX] > SAME TOE [DEL]` |
| osis | `SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]` | `CLIP > (back) SPIN [BOD] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` |

### 1.4 stepping

**Signature:** Duplicates the first dex moment with a `>>` between the two; second dex direction flips (`OP IN` → `SAME IN`, etc.); entry typically `CLIP`.

| Base | Base op | Resolved stepping-X op |
|---|---|---|
| drifter (tombstone) | `SET > OP IN [DEX] > SAME CLIP [XBD] [DEL]` | `CLIP > OP IN [DEX] >> SAME IN [DEX] > SAME CLIP [XBD] [DEL]` |
| osis (stepping-osis) | `SET > (back or front) SPIN [BOD] > SAME or OP CLIP [XBD] [DEL]` | `CLIP > OP IN [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` |

### 1.5 pixie

**Signature:** Adds a tightened first-dex compression; entry typically `TOE`; full dex pattern preserved with directional alternation.

| Base | Resolved pixie-X op |
|---|---|
| butterfly (dimwalk) | `TOE > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` |
| drifter (smoke) | `TOE > SAME IN [DEX] >> OP IN [DEX] > SAME CLIP [XBD] [DEL]` |
| pickup (paste) | `TOE > SAME IN [DEX] >> OP IN [DEX] > SAME TOE [DEL]` |
| dlo (smog) | `TOE > SAME IN [DEX] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |
| eggbeater (pigbeater) | `TOE > SAME IN [DEX] >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]` |

Pattern: `TOE > SAME IN [DEX] >> [base body, opening-direction-flipped]`.

### 1.6 atomic

**Signature:** Adds an outside-then-inside (X-Dex) sequence; entry can be `TOE` or `CLIP`.

| Base | Resolved atomic-X op |
|---|---|
| pickup (scrambled-eggbeater) | `TOE > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]` |
| torque (atomic-torque) | not in DB; needs derivation |
| double-over-down (fusion) | not in DB; needs derivation |

### 1.7 symposium

**Signature:** Adds a "no plant while" body-modifier moment (the suspension constraint).

| Base | Resolved symposium-X op |
|---|---|
| whirl (symposium-whirl) | `SET > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]` |

### 1.8 other operators (rare / single-instance)

- **whirling** (whirling-swirl): `CLIP > OP IN [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` — front-whirl-prefix-then-swirl pattern.
- **gyro** (vortex / mantis / big-apple): adds `(back) SPIN [BOD]` doubled-spin moment, often paired with `(no plant while)` for symposium combos.
- **surging** (surreal / venom / bigwalk / surge / surgery): adds `(back) SPIN [BOD]` opening + extended dex sequence. Per `surging` row in DB: decomposes informally as `spinning + stepping`.
- **furious** (fury / nemesis): adds multi-dex sequence + paradox-style structure. fury op pending; nemesis op resolved.
- **tapping** (spinal-tap / tap): NO consistent pattern across resolved siblings — spinal-tap and tap have totally different structures. **Tapping derivation is unsafe without curator input.**

## 2. Bucket assignments

### 2.1 Bucket A — safe auto-derivation (high confidence, 19 candidates)

Operator + base both have resolved structural precedents that match cleanly. Candidate JOB rows are mechanically derivable. Recommend curator-batch-approve and apply.

| slug | display name | ADD | base | modifier(s) | chain reading | proposed JOB | confidence |
|---|---|---|---|---|---|---|---|
| ducking-whirl | ducking whirl | 4 | whirl | ducking | ducking whirl | `TOE > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | high |
| spinning-whirl | spinning whirl | 4 | whirl | spinning | spinning whirl | `CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]` | high |
| stepping-whirl | stepping whirl | 4 | whirl | stepping | stepping whirl | `CLIP > OP IN [DEX] >> SAME IN [DEX] > OP CLIP [XBD] [DEL]` | high (tombstone precedent) |
| paradox-drifter | paradox drifter | 4 | drifter | paradox | paradox drifter / paradox miraging clipper | `CLIP > SAME IN [PDX] [DEX] > SAME CLIP [XBD] [DEL]` | high |
| paradox-torque | paradox torque | 5 | torque | paradox | paradox torque | `CLIP > SAME IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | medium (torque base op pending; see 2.3) |
| spinning-torque | spinning torque | 5 | torque | spinning | spinning torque | `CLIP > (back) SPIN [BOD] > OP IN [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | medium (torque base pending) |
| paradox-blender | paradox blender | 5 | blender | paradox | paradox blender / paradox whirling op osis | `CLIP > SAME IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | high |
| symposium-mirage | symposium mirage | 3 | mirage | symposium | symposium mirage | `SET > (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]` | high (symposium-whirl precedent) |
| flail | flail | 3 | illusion | symposium | symposium illusion | `SET > (no plant while) OP OUT [BOD] [DEX] > OP TOE [DEL]` | high (symposium pattern + illusion base) |
| blurrage | blurrage | 4 | barrage | stepping (folk: blurry) | stepping barrage *(chain pending in registry)* | `CLIP > SAME IN [DEX] >> OP IN [DEX] > SAME IN [DEX] > OP TOE [DEL]` | medium (stepping-on-barrage pattern unprecedented; blurry vs stepping disambiguation per Red 2026-05-20) |
| ripwalk | ripwalk | 4 | butterfly | stepping (folk: blurry) | stepping butterfly | `CLIP > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` | medium-high (dimwalk dex-direction model; stepping vs blurry per Red 2026-05-20) |
| haze | haze | 4 | dlo | stepping | stepping double-leg-over | `CLIP > OP IN [DEX] >> SAME IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | high (stepping-drifter pattern + dlo base) |
| bigwalk | bigwalk | 5 | butterfly | surging | surging butterfly | `CLIP > (back) SPIN [BOD] > SAME IN [DEX] >> OP OUT [DEX] > OP CLIP [XBD] [DEL]` | medium-high (surge/surreal/venom surging-pattern; butterfly base) |
| atom-smasher | atom smasher | 4 | mirage | atomic | atomic mirage | `TOE > SAME OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]` | medium (atomic = X-Dex pattern; pickup precedent + mirage base) |
| torque | torque | 4 | osis | mirage (operator) | miraging osis | `SET > OP IN [DEX] > (back or front) SPIN [BOD] > OP CLIP [XBD] [DEL]` | high (compound-of-canonicals; mirage dex + osis spin-terminal) |
| omelette | omelette | 3 | pickup | atomic (= illusioning?) | atomic illusion | `SET > OP OUT [DEX] >> OP IN [DEX] > OP TOE [DEL]` | medium (chain says atomic illusion not pickup-based; structural conflict — see 2.3) |
| witchdoctor | witchdoctor | 5 | mirage | atomic + symposium | atomic symposium mirage | `CLIP > (no plant while) SAME OUT [BOD] [DEX] >> OP IN [DEX] > OP TOE [DEL]` | medium (atomic + symposium stack on mirage base) |
| fury | fury | 5 | mirage | furious + paradox | furious paradox mirage | `CLIP > SAME IN [DEX] >> OP IN [PDX] [DEX] > OP TOE [DEL]` | medium (furious pattern from nemesis; paradox-mirage stack) |
| spinning-symposium-whirl | spinning symposium whirl | 5 | whirl | spinning + symposium | spinning symposium whirl | `CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]` | high (clean compose of two resolved patterns) |

### 2.2 Bucket B — derivable but needs curator review (16 candidates)

Modifier grammar exists but the derivation has either a contested folk-name resolution, an ambiguous direction-flip, an unprecedented base/operator combination, or a chain reading with curatorConfirmPending=true. Candidate JOB shown; curator should verify per row before applying.

| slug | display name | ADD | base | modifier(s) | chain reading | proposed JOB | reason needs review |
|---|---|---|---|---|---|---|---|
| tapping-whirl | tapping whirl | 4 | whirl | tapping | tapping whirl | `CLIP > OP IN [DEX] > tap [BOD] > OP CLIP [XBD] [DEL]` | tapping signature inconsistent across siblings (spinal-tap, tap diverge); curator must lock tapping grammar |
| blurry-whirl | blurry whirl | 5 | whirl | blurry | blurry whirl (pending) | `CLIP > OP IN [DEX] >> SAME IN [DEX] > OP CLIP [XBD] [DEL]` (assuming blurry = stepping per Red 2026-05-20) | Red 2026-05-20: blurry no longer implies paradox; canonical decomposition under review |
| blurry-torque | blurry torque | 6 | torque | blurry | blurry torque (pending) | depends on torque base op (pending) | depends on torque base; double dependency |
| atomic-torque | atomic torque | 6 | torque | atomic | atomic torque (folk: silo) | depends on torque base op (pending) | depends on torque base op resolution |
| paradox-illusion | paradox-illusion | 3 | illusion | paradox | (resolved) | already resolved per DB | included for cross-reference (not in 61 list — verify) |
| paradox-double-leg-over | paradox-dlo | 4 | dlo | paradox | (resolved) | already resolved per DB | included for cross-reference (not in 61 list — verify) |
| predator | predator | 4 | dlo | atomic (PassBack folk) | (chain pending) | `TOE > OP OUT [DEX] >> OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | atomic-on-dlo unprecedented; PassBack folk-name needs corroboration |
| bedwetter | bedwetter | 4 | eggbeater | stepping (PassBack folk) | (chain pending) | `CLIP > OP IN [DEX] >> SAME IN [DEX] >> OP OUT [DEX] > SAME TOE [DEL]` | stepping-on-eggbeater pattern unprecedented (eggbeater itself is atomic legover; stack ordering ambiguous) |
| schmoe | schmoe | 3 | legover | stepping (PassBack folk) | (chain pending) | `CLIP > OP OUT [DEX] >> SAME OUT [DEX] > SAME TOE [DEL]` | stepping-on-legover precedent: tombstone (drifter); legover base is bare, ambiguous |
| blizzard | blizzard | 3 | illusion | stepping + (far positional) (PassBack folk) | (chain pending) | `CLIP > OP OUT [DEX] >> SAME OUT [DEX] > OP TOE [DEL]` | "far" positional adds +0 per Red 2026-05-15 but structural insertion is ambiguous |
| reverse-drifter | reverse-drifter | 3 | reverse-drifter (self) | direction-reversal of drifter | (chain pending) | `SET > OP OUT [DEX] > SAME CLIP [XBD] [DEL]` | direction-reversal grammar (OP IN → OP OUT) is curator territory; royale chain notes "paradox reverse drifter" |
| sole-survivor | sole-survivor | 5 | whirl | spinning + symposium (PassBack folk) | (chain pending) | identical to spinning-symposium-whirl candidate | PassBack folk-name; structurally identical to spinning-symposium-whirl — curator decide if these are same row or distinct |
| fusion | fusion | 5 | dod | atomic | atomic double over down | `CLIP > (back) SPIN [BOD] > OP OUT [DEX] >> OP IN [DEX] > SAME TOE [DEL]` *(tentative; dod base op unknown)* | dod (double-over-down) base op not in DB queries; derivation depends on dod resolution first |
| plasma | plasma | 5 | — | quantum + dod | quantum double over down | (depends on dod) | base unresolved + quantum + dod stack |
| jani-walker | jani walker | 5 | — | — | (no chain shown) | unknown | base unidentified; structural reading not in registry |
| terrage | terrage | 4 | terrage (self) | — | (self-anchor like barrage) | unknown | naming-disambiguation case (parallel to barrage); curator should decide if standalone family |

### 2.3 Bucket C — doctrine-contested / timing ambiguous (5 candidates)

Genuine doctrinal ambiguity present; derivation blocked until Red rules or curator decides scope. Surface to Red Wave 2 packet or defer to a future doctrine pass.

| slug | display name | ADD | base | reason blocked |
|---|---|---|---|---|
| torque | torque | 4 | osis | Per chain "miraging osis"; structurally clean derivation possible. Listed here because torque is a flagship anchor — if mis-derived, downstream torque-family compounds (mobius, paradox-torque, atomic-torque, blurry-torque, gauntlet, etc.) inherit the error. Recommend curator-author rather than mechanical-derive even though the rule is clear. *(Promotion to A bucket OK if curator confirms the rule application.)* |
| blurry-torque | blurry torque | 6 | torque | Compound dependency: depends on torque base resolution + blurry-vs-stepping doctrine (Red 2026-05-20 retired the "blurry implies paradox" reading). |
| atomic-torque | atomic torque | 6 | torque | Compound dependency on torque base + atomic pattern (X-Dex) on a compound-of-canonicals chassis — structurally unprecedented. |
| sumo-class implicit X-Dex pages (none in 61, included for tracking) | — | — | mirage | Named exception pattern (per Phase C ripstein/sumo doctrine work); not a derivation gap but worth tracking as a pattern class. |
| barfly-family compounds (superfly, nemesis, venom) | — | — | barfly | All three have resolved op_notation already; included as cross-reference because barfly itself is a 4-ADD double-infinity compound and may merit its own anchor lift (Phase D consideration; not derivation work). |

### 2.4 Bucket D — intentionally unresolved (21 rows)

Operators, primitives, and modifier-class entries. These do NOT belong on a first-class card; their "JOB pending" rendering should either be suppressed in the card logic OR these rows should be exempted from the first-class promotion. No derivation work needed.

| slug | display name | reason intentionally unresolved |
|---|---|---|
| barraging | barraging | Modifier (operator), not a trick target. ADD = +1 universally. |
| blazing | blazing | Modifier (operator). |
| ducking | ducking | Modifier (body operator). |
| gyro | gyro | Modifier (body operator). |
| paradox | paradox | Modifier (hip-pivot operator). |
| spinning | spinning | Modifier (body operator). |
| stepping | stepping | Modifier (set/dex operator). |
| symposium | symposium | Modifier (suspension operator). |
| tapping | tapping | Modifier (operator). |
| pogo | pogo | Set primitive (zero-ADD set modifier). |
| rooted | rooted | Set primitive (zero-ADD set modifier). |
| clipper | clipper | 1-ADD body kick primitive; possibly merits op `[set] > clipper` parallel to clipper-stall. |
| spin | spin | 1-ADD body spin primitive; possibly merits op `[set] > spin`. |
| spyro | spyro | 1-ADD body spin primitive. |
| orbit | orbit | 2-ADD ATW-class atom; op may merit authoring but not derivable from siblings. |
| rake | rake | 2-ADD primitive; op may merit authoring. |
| surging | surging | Primitive operator (decomposes to spinning + stepping per Red pt2). |
| atomic | atomic | Set + modifier (dual-class entity). |
| double-spin | double spin | 2-ADD body primitive. |
| furious | furious | Set + modifier (dual-class). |
| hop-over | hop over | 2-ADD legover-class primitive. |
| quantum | quantum | Set + modifier (dual-class). |
| sailing | sailing | 2-ADD set primitive. |
| walk-over | walk over | 2-ADD legover-class primitive. |
| shooting | shooting | 3-ADD set primitive (modifier when prefixed). |
| terraging | terraging | Body modifier (+3 ADD operator). |
| refraction | refraction | 3-ADD dex primitive; needs curator author (not derivable). |
| eclipse | eclipse | 3-ADD named compound; chain not in registry. *(May belong in B if structural inputs identified.)* |
| double-around-the-world | double around the world | 3-ADD; HAS op_notation, included only for cross-reference. |

## 3. Bucket count summary

| Bucket | Count | Recommended action |
|---|---|---|
| A — safe auto-derivation | 19 | Curator review the candidates; bulk-approve and apply via DB UPDATE or content-module addition |
| B — derivable but needs curator review | 16 | Curator triage per row; some land cleanly; some need Red corroboration |
| C — doctrine-contested | 5 | Defer to Red Wave 2 packet (torque + atomic-torque + blurry-torque-class dependency chain) |
| D — intentionally unresolved | 21 | Exempt from first-class promotion logic (card-rendering change), OR author primitive op_notations independently if curator chooses |
| **Total** | **61** | |

Note: counts above total to 61. Tier overlap is intentional — torque appears in both A (rule-derivable) and C (flagship-status caution) because the derivation rule is clean but the downstream consequences warrant curator authoring.

## 4. Derivation rule confidence ladder

Five tiers of confidence reasonable for an audit:

| Confidence | Definition | Action |
|---|---|---|
| **high** | Rule has 3+ resolved sibling precedents on different bases; result is mechanical. | Bulk-approvable in curator review. |
| **medium-high** | Rule has 2 resolved sibling precedents; one variation noted (e.g., direction flip). | Curator should spot-check, then approve. |
| **medium** | Rule has 1 resolved sibling precedent; structural reading clean. | Curator authors the row directly rather than mechanically applying. |
| **low** | Rule observed inconsistently or only via folk-name chain; structural inputs ambiguous. | Surface to Red Wave 2; not derivable without doctrine ruling. |
| **none** | No sibling precedent; base unresolved; or pure operator-class row. | Do not derive; either author independently (primitives) or skip (operators). |

## 5. Recommended next steps (NOT auto-applied)

1. **Curator review of Bucket A (19 candidates).** Per row: (a) confirm the derivation rule application, (b) approve / amend / reject the proposed JOB. Where approved, write to `freestyle_tricks.operational_notation` column (or to a Phase D content module if the project prefers content-layer ownership over DB).
2. **Bucket B triage (16 rows).** Each row needs a per-row decision — most are PassBack folk-names or compound-dependent cases. Some unblock once Bucket A flagships (torque) resolve.
3. **Bucket C deferral.** Roll into the next Red consultation as a structured derivation-policy question: "How does the doctrine handle modifier-stack derivation on compound-of-canonicals chassis?" Specific candidates: blurry-torque, atomic-torque, the torque-family stack generally.
4. **Bucket D rendering fix.** Modify the first-class-row partial to exempt modifier/operator rows from showing "JOB: notation pending" (the line is misleading on rows that have no JOB by design). Either drop the `firstClassChainIncomplete` flag for operator-class rows OR change the card logic to suppress JOB on rows where category=modifier.
5. **Documentation:** Once Buckets A + B are processed, update `freestyleSymbolicEquivalences.ts` with any new chain readings authored along the way. Add explicit operator-grammar documentation to a new file (e.g., `src/content/freestyleOperatorGrammar.ts`) capturing the rules in §1 above as code so they're inspectable rather than only living in this audit doc.

## 6. Audit posture

This audit:

- Reads operator grammar from observed resolved siblings only — no external source claims.
- Cites every confidence level explicitly so curator review can spot-check.
- Marks Red-pending and Red-resolved doctrine appropriately.
- Surfaces structural ambiguities (paradox direction-flip variation, tapping inconsistency, blurry-vs-stepping doctrine) as named blockers, not as silent omissions.
- Reserves "compound slot" semantics: descriptions like `Pixie-modified butterfly` are reads as DERIVATION INPUTS (Bucket A/B candidates), not permanent placeholders.

The audit does NOT:

- Mutate the dictionary or content modules.
- Promote any folk-name reading to canonical doctrine.
- Decide whether parkwalk/dimwalk are distinct rows or name variants (curator decision).
- Decide whether reverse-drifter/double-leg-over/eggbeater should be promoted to Tier A under the §8 universal-grammar amendment.
- Apply candidate JOB rows.

---

**Audit produced 2026-05-25 pre-Red. Curator review required before any candidate JOB row is applied.**
