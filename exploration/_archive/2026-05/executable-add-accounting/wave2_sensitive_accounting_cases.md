# Wave-2 Sensitive Accounting Cases — Register

**Status:** Planning artifact. Companion to `compressed_atom_expansion_map.md`. Formal register of doctrine-unresolved tokens, tricks, and compounds whose derivation panel must suppress in Phase 1.

**Date:** 2026-05-18

---

## Purpose

The Wave-2 register is the authoritative D-suppress list. The curator-map implementation (future `freestyleAddAccounting.ts`) must read this document and ensure no entry herein renders a derivation panel until its `future_resolution_dependency` is satisfied.

Per Decision 2 (concept doc), suppression is **silent** — the trick page renders normal layout + editorial ADD chip; no "Pending Red ruling" copy on the page itself. Provenance prose lives on `/freestyle/add-analysis`, not on trick-detail pages.

---

## Per-entry schema

Each register entry carries the fields the brief specified for D3, plus the user-requested `future_resolution_dependency` field:

| Field | Description |
|---|---|
| `entry_id` | Stable ID (`U#` for clusters, `T#` for tricks, `M#` for modifiers, `A#` for atoms) |
| `name` | Token / trick / cluster name |
| `type` | cluster / atom / compound / modifier / alias |
| `shorthand` | Canonical short form |
| `editorial_total` | Authoritative ADD value when known; `?` when unknown |
| `expansion_type` | always `unresolved` for register entries |
| `wave2_sensitive` | always `true` |
| `renderable_in_phase1` | always `D — suppress` |
| `suppression_reason` | Why the panel cannot render this case |
| `future_resolution_dependency` | What unblocks rendering. Values: `red-ruling-internals`, `red-ruling-integration`, `curator-baseline`, `curator-manifestation`, `curator-multiplier-convention`, `curator-data`, `cluster-resolution` |
| `impacted_compounds` | Other tricks/compounds blocked downstream of this entry |
| `provenance` | Source of the case (Red, legacy move sets, audit, etc.) |
| `curator_decision_readiness` | `ready-for-curator` / `needs-red` / `needs-corpus` / `needs-judgment` |
| `unblocking_complexity` | `low` / `medium` / `high` |

---

## Section 1 — Wave-2 clusters

Eight clusters organize the register. Most leaf-level entries inherit suppression from one of these clusters.

### U1 — Paradox internals

| Field | Value |
|---|---|
| `entry_id` | U1 |
| `name` | Paradox internals cluster |
| `type` | cluster |
| `shorthand` | `paradox` (as a token in compounds) |
| `editorial_total` | varies per compound (3-6 typical) |
| `suppression_reason` | Internal component decomposition of paradox is not formally established. Pre-Red hint exists (Atom Smasher carries X-dex like paradox from a toe) but does not establish the component vocabulary. |
| `future_resolution_dependency` | `red-ruling-internals` |
| `impacted_compounds` | paradox-bearing tricks (paradox whirl, paradox butterfly, stepping paradox whirl, miraging paradox, etc.); atomsmasher; blurry-whirl (via blurry = stepping paradox identity) |
| `provenance` | Pre-Red ruling fragments; full doctrine unestablished |
| `curator_decision_readiness` | `needs-red` |
| `unblocking_complexity` | high — requires Red to rule on how paradox decomposes into the 6 components |

### U2 — Symposium internals

| Field | Value |
|---|---|
| `entry_id` | U2 |
| `name` | Symposium internals cluster |
| `type` | cluster |
| `shorthand` | `symposium` |
| `editorial_total` | varies per compound |
| `suppression_reason` | Symposium component decomposition not formally established. The symposium concept is widely used but its internal ADD attribution is opaque. |
| `future_resolution_dependency` | `red-ruling-internals` |
| `impacted_compounds` | symposium butterfly, symposium whirl, miraging symposium butterfly, far symposium butterfly, stepping symposium compounds |
| `provenance` | Glossary §10 / dictionary §3 |
| `curator_decision_readiness` | `needs-red` |
| `unblocking_complexity` | high |

### U3 — Barraging / Baroque

| Field | Value |
|---|---|
| `entry_id` | U3 |
| `name` | Barraging cluster |
| `type` | cluster |
| `shorthand` | `barraging`; in compound form `baroque` (≡ barraging osis) |
| `editorial_total` | 5 (for baroque); varies for other barraging compounds |
| `suppression_reason` | Barraging is identified as "High Stepping" per legacy move sets, but the internal ADD decomposition of barraging is not curator-confirmed. Baroque's editorial total of 5 is known; the breakdown into components is not. |
| `future_resolution_dependency` | `red-ruling-internals` OR `cluster-resolution` (if "barraging = high stepping" leads to a `set(+1) + stall(+1)` derivation pattern, this cluster may resolve via alias chain rather than fresh Red ruling) |
| `impacted_compounds` | baroque; barraging mirage whirl; barraging mirage butterfly; barraging osis (= baroque) |
| `provenance` | Legacy move sets identify barraging = high stepping; pre-Red baroque = barraging osis = 5 |
| `curator_decision_readiness` | `needs-red` or `needs-judgment` — depends on whether curator accepts barraging = high stepping as a sufficient alias chain |
| `unblocking_complexity` | medium — alias-chain interpretation may unblock without a fresh Red ruling |

### U4 — Blurry / Blender

| Field | Value |
|---|---|
| `entry_id` | U4 |
| `name` | Blurry / Blender cluster |
| `type` | cluster |
| `shorthand` | `blurry`, `blender` |
| `editorial_total` | 5 (Blurry Whirl per Red); varies for blender compounds |
| `suppression_reason` | Blurry has a Red ruling (Blurry Whirl = Stepping Paradox Whirl = 5) but integration via RED_RESOLVED_CANON is pending; even after integration the decomposition routes through paradox internals (U1). Blender has dual family-membership (torque/blender per Slice M) and unconfirmed ADD weighting. |
| `future_resolution_dependency` | `red-ruling-integration` for the blurry total + `red-ruling-internals` (U1) for the decomposition; `curator-baseline` for blender weighting |
| `impacted_compounds` | blurry whirl, blurry butterfly, blurry torque (per Red rulings 2026-05-15); blender compounds (food processor = stepping paradox blender, etc.) |
| `provenance` | Red rulings 2026-05-15 wave; Slice M family-dual-membership entry |
| `curator_decision_readiness` | `ready-for-curator` (integration step) + `needs-red` (decomposition) |
| `unblocking_complexity` | high — even integrated blurry routes through paradox |

### U5 — Fairy weighting in compounds

| Field | Value |
|---|---|
| `entry_id` | U5 |
| `name` | Fairy compound-context weighting |
| `type` | cluster |
| `shorthand` | `fairy` (in compound contexts) |
| `editorial_total` | +1 baseline; +N in compounds varies |
| `suppression_reason` | Fairy is +1 as a baseline modifier (Red: "Fairy = legit operator vocab"). Its weighting *inside compound contexts* — particularly FAIRY DRIFTER, FAIRY ATOMIC — is curator-judgment territory. Concept doc explicitly forbids hardcoding fairy weighting. |
| `future_resolution_dependency` | `curator-judgment` (per-compound) |
| `impacted_compounds` | fairy drifter, fairy atomic, fairy compounds with multiple modifiers |
| `provenance` | Red ruling on fairy = operator vocab |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | low-to-medium — single fairy compounds may render once curator locks per-compound weighting |

### U6 — Ducking internals

| Field | Value |
|---|---|
| `entry_id` | U6 |
| `name` | Ducking internal mechanism |
| `type` | cluster |
| `shorthand` | `ducking` |
| `editorial_total` | +1 (external value confirmed) |
| `suppression_reason` | Ducking is +1 externally but its internal mechanism (does it modify dex? spin? set?) is unresolved. Without knowing the manifestation, the derivation panel would invent component attribution. |
| `future_resolution_dependency` | `curator-manifestation` |
| `impacted_compounds` | ducking butterfly, pixie ducking butterfly (per glossary §8 walking-family formula test), ducking osis, ducking whirl |
| `provenance` | Glossary §8 walking-family compounds include pixie ducking butterfly |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | low — single curator decision on manifestation unblocks the whole cluster |

### U7 — Drifter contextual manifestation

| Field | Value |
|---|---|
| `entry_id` | U7 |
| `name` | Drifter contextual manifestation |
| `type` | cluster |
| `shorthand` | `drifter` |
| `editorial_total` | +1 (external value confirmed) |
| `suppression_reason` | Drifter's manifestation varies per compound (set vs xbody). Rendering inconsistent manifestations across drifter-bearing tricks would teach an inconsistent rule. Detailed in D3 Section 4. |
| `future_resolution_dependency` | `curator-manifestation` (per-compound table) |
| `impacted_compounds` | fairy drifter, reverse drifter, drifter whirl, drifter compounds generally |
| `provenance` | [[project_freestyle_state]] notes drifter / reverse-drifter direction-variant pair |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | medium — requires either per-compound lookup or per-axis rule |

### U8 — Multiplier conventions (revolution-counting)

| Field | Value |
|---|---|
| `entry_id` | U8 |
| `name` | Multiplier conventions for revolution-counting tricks |
| `type` | cluster |
| `shorthand` | `eggbeater`, `DATW`, `TATW` |
| `editorial_total` | varies; for eggbeater commonly 4-5 depending on revolutions |
| `suppression_reason` | No established notation for "N revolutions = +N components." Rendering `legover(+2) × 2 = 4` invents a multiplier convention. |
| `future_resolution_dependency` | `curator-multiplier-convention` |
| `impacted_compounds` | eggbeater, double around-the-world (DATW), triple around-the-world (TATW), multi-revolution compounds generally |
| `provenance` | Loader-19 family default sets eggbeater → legover; pt12 enforcement |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | medium — requires establishing a multiplier notation in the curator-map vocabulary |

---

## Section 2 — Atom-level entries

### A1 — orbit

| Field | Value |
|---|---|
| `entry_id` | A1 |
| `name` | orbit |
| `type` | atom |
| `shorthand` | `orbit` |
| `editorial_total` | known per-compound; baseline component decomposition pending |
| `suppression_reason` | Orbit is a 12-atom-registry member but its baseline component decomposition is not confirmed. Concept doc Open Q1 flagged this. |
| `future_resolution_dependency` | `curator-baseline` |
| `impacted_compounds` | reverse orbit, gyro orbit, orbit-family compounds, and any reverse-orbit variants |
| `provenance` | 12-atom registry; baseline TBD |
| `curator_decision_readiness` | `ready-for-curator` |
| `unblocking_complexity` | low — single curator decision: does orbit baseline = `spin(+1) + stall(+1)` (= 2) or something else? |

---

## Section 3 — Trick-level entries

The following are individual tricks blocked by one or more clusters above.

### T1 — blurry whirl

| Field | Value |
|---|---|
| `entry_id` | T1 |
| `name` | blurry whirl |
| `type` | compound |
| `shorthand` | `blurry whirl` (≡ `stepping paradox whirl` per Red) |
| `editorial_total` | 5 |
| `suppression_reason` | Total known but decomposition routes through paradox internals (U1). |
| `future_resolution_dependency` | U1 (paradox internals) + U4 (Red ruling integration) |
| `impacted_compounds` | none downstream (T1 is the leaf entry) |
| `provenance` | Red ruling 2026-05-15 |
| `curator_decision_readiness` | `needs-red` (U1 dependency) |
| `unblocking_complexity` | high |

### T2 — blurry torque

| Field | Value |
|---|---|
| `entry_id` | T2 |
| `name` | blurry torque |
| `type` | compound |
| `shorthand` | `blurry torque` (≡ `stepping paradox torque` per Red) |
| `editorial_total` | 6 |
| `suppression_reason` | Total known; decomposition routes through paradox internals (U1). |
| `future_resolution_dependency` | U1 + U4 |
| `impacted_compounds` | none |
| `provenance` | Red ruling 2026-05-15 |
| `curator_decision_readiness` | `needs-red` |
| `unblocking_complexity` | high |

### T3 — food processor (stepping paradox blender)

| Field | Value |
|---|---|
| `entry_id` | T3 |
| `name` | food processor |
| `type` | compound |
| `shorthand` | `food processor` (≡ `stepping paradox blender` per Red) |
| `editorial_total` | 6 |
| `suppression_reason` | Decomposition routes through paradox internals (U1) AND blender weighting (U4). |
| `future_resolution_dependency` | U1 + U4 |
| `impacted_compounds` | none |
| `provenance` | Red ruling 2026-05-15 |
| `curator_decision_readiness` | `needs-red` |
| `unblocking_complexity` | high |

### T4 — baroque

| Field | Value |
|---|---|
| `entry_id` | T4 |
| `name` | baroque |
| `type` | compound |
| `shorthand` | `baroque` (≡ `barraging osis` per pre-Red) |
| `editorial_total` | 5 |
| `suppression_reason` | Total known; barraging internals (U3) unresolved. |
| `future_resolution_dependency` | U3 |
| `impacted_compounds` | none |
| `provenance` | Pre-Red ruling |
| `curator_decision_readiness` | `needs-red` or `needs-judgment` |
| `unblocking_complexity` | medium |

### T5 — atomsmasher

| Field | Value |
|---|---|
| `entry_id` | T5 |
| `name` | atom smasher |
| `type` | compound |
| `shorthand` | `atom smasher` |
| `editorial_total` | varies; pre-Red hint suggests X-dex-bearing decomposition |
| `suppression_reason` | Pre-Red hint ("carries X-dex like paradox from a toe") is not a formal decomposition; relates to paradox internals (U1). |
| `future_resolution_dependency` | U1 |
| `impacted_compounds` | atomsmasher compounds |
| `provenance` | Pre-Red ruling |
| `curator_decision_readiness` | `needs-red` |
| `unblocking_complexity` | high |

### T6 — smear

| Field | Value |
|---|---|
| `entry_id` | T6 |
| `name` | smear |
| `type` | compound |
| `shorthand` | `smear` |
| `editorial_total` | unknown |
| `suppression_reason` | Insufficient curator-confirmed metadata. Family-base unknown; component decomposition cannot be authored. |
| `future_resolution_dependency` | `curator-data` |
| `impacted_compounds` | none |
| `provenance` | Listed in D3 required cases; family-base unconfirmed |
| `curator_decision_readiness` | `needs-corpus` (may resolve via curator review of existing dictionary sources) |
| `unblocking_complexity` | low — single curator confirmation |

### T7 — eggbeater

| Field | Value |
|---|---|
| `entry_id` | T7 |
| `name` | eggbeater |
| `type` | compound |
| `shorthand` | `eggbeater` |
| `editorial_total` | known per-instance (commonly 4) |
| `suppression_reason` | Multiplier convention for revolution-counting (U8) unresolved. |
| `future_resolution_dependency` | U8 |
| `impacted_compounds` | pigbeater (= eggbeater + legover per Wave-1 corrective); other revolution-counting compounds |
| `provenance` | Loader-19 family default; pt12 |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | medium |

### T8 — reverse orbit

| Field | Value |
|---|---|
| `entry_id` | T8 |
| `name` | reverse orbit |
| `type` | compound |
| `shorthand` | `reverse orbit` |
| `editorial_total` | depends on orbit baseline |
| `suppression_reason` | Inherits orbit's unresolved baseline (A1). |
| `future_resolution_dependency` | A1 |
| `impacted_compounds` | none |
| `provenance` | Orbit baseline TBD |
| `curator_decision_readiness` | `ready-for-curator` (single decision unblocks A1 + all orbit-family) |
| `unblocking_complexity` | low |

---

## Section 4 — Modifier-level entries

### M1 — fairy (compound context)

| Field | Value |
|---|---|
| `entry_id` | M1 |
| `name` | fairy compound weighting |
| `type` | modifier |
| `shorthand` | `fairy` (in compound contexts) |
| `editorial_total` | +1 baseline; compound varies |
| `suppression_reason` | Per U5 — fairy compound-context weighting Wave-2 sensitive. |
| `future_resolution_dependency` | U5 |
| `impacted_compounds` | fairy drifter, fairy atomic, multi-modifier fairy compounds |
| `provenance` | Red ruling on fairy = operator vocab |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | low-to-medium |

### M2 — ducking

| Field | Value |
|---|---|
| `entry_id` | M2 |
| `name` | ducking manifestation |
| `type` | modifier |
| `shorthand` | `ducking` |
| `editorial_total` | +1 |
| `suppression_reason` | Per U6 — ducking internal mechanism unresolved. |
| `future_resolution_dependency` | U6 |
| `impacted_compounds` | ducking butterfly, pixie ducking butterfly, ducking osis, ducking whirl |
| `provenance` | Glossary §8 walking-family compounds |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | low |

### M3 — drifter

| Field | Value |
|---|---|
| `entry_id` | M3 |
| `name` | drifter manifestation |
| `type` | modifier |
| `shorthand` | `drifter` |
| `editorial_total` | +1 |
| `suppression_reason` | Per U7 — contextual manifestation. |
| `future_resolution_dependency` | U7 |
| `impacted_compounds` | fairy drifter, reverse drifter, drifter whirl, drifter compounds |
| `provenance` | [[project_freestyle_state]] direction-variant pair |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | medium |

### M4 — barraging (alias)

| Field | Value |
|---|---|
| `entry_id` | M4 |
| `name` | barraging |
| `type` | alias |
| `shorthand` | `barraging` (≡ high stepping per legacy move sets) |
| `editorial_total` | varies in compounds |
| `suppression_reason` | Per U3 — barraging compound internals unresolved. |
| `future_resolution_dependency` | U3 |
| `impacted_compounds` | baroque (T4), barraging mirage whirl, barraging mirage butterfly |
| `provenance` | Legacy move sets (alias); pre-Red baroque ruling |
| `curator_decision_readiness` | `needs-judgment` or `needs-red` |
| `unblocking_complexity` | medium |

### M5 — blurry

| Field | Value |
|---|---|
| `entry_id` | M5 |
| `name` | blurry |
| `type` | modifier |
| `shorthand` | `blurry` (≡ stepping paradox per Red) |
| `editorial_total` | +1 baseline; compound totals route via paradox |
| `suppression_reason` | Per U4 — Red ruling integration pending; decomposition still routes via paradox internals. |
| `future_resolution_dependency` | U4 + U1 |
| `impacted_compounds` | blurry whirl (T1), blurry torque (T2), blurry butterfly, blurry osis |
| `provenance` | Red ruling 2026-05-15 |
| `curator_decision_readiness` | `needs-red` |
| `unblocking_complexity` | high |

### M6 — blender

| Field | Value |
|---|---|
| `entry_id` | M6 |
| `name` | blender |
| `type` | modifier |
| `shorthand` | `blender` |
| `editorial_total` | unknown weighting |
| `suppression_reason` | Per U4 — dual family-membership (torque/blender per Slice M) and unconfirmed ADD weighting. |
| `future_resolution_dependency` | `curator-baseline` |
| `impacted_compounds` | food processor (T3), blender compounds generally |
| `provenance` | Slice M family-dual-membership |
| `curator_decision_readiness` | `needs-judgment` |
| `unblocking_complexity` | medium |

---

## Section 5 — Dependency-type taxonomy

The `future_resolution_dependency` field uses one of seven values. Defined here for reference:

| Value | Definition | Example cases |
|---|---|---|
| `red-ruling-internals` | Requires a fresh Red ruling on internal decomposition | U1 (paradox), U2 (symposium) |
| `red-ruling-integration` | A Red ruling exists but has not been integrated via RED_RESOLVED_CANON; integration alone may not unblock if the ruling routes through unresolved internals | U4 (blurry total ruling) |
| `curator-baseline` | Requires curator to confirm the component decomposition of an atom or compound | A1 (orbit), M6 (blender weighting) |
| `curator-manifestation` | Requires curator to lock a per-compound or per-axis manifestation table for a contextual modifier | U6 (ducking), U7 (drifter) |
| `curator-multiplier-convention` | Requires curator to establish notation for revolution-multiplier compounds | U8 (eggbeater family) |
| `curator-data` | Requires curator review of existing dictionary sources to confirm metadata | T6 (smear) |
| `cluster-resolution` | Resolves when an upstream cluster resolves; no fresh decision needed | A trick that depends on U1 via alias chain |
| `curator-judgment` | Single curator decision required (does not need Red); typically per-compound | U5 (fairy compound weighting) |

---

## Section 6 — Cluster impact analysis

For each cluster, how many register entries depend on its resolution:

| Cluster | Direct entries blocked | Estimated compound count blocked | Unblocking complexity |
|---|---|---|---|
| U1 — Paradox internals | T1, T2, T3 (via U4 chain), T5, M5 | 20+ paradox-bearing compounds | high |
| U2 — Symposium internals | (no current trick-level entries) | 10+ symposium-bearing compounds | high |
| U3 — Barraging | T4, M4 | 5+ barraging compounds | medium |
| U4 — Blurry / Blender | T1, T2, T3, M5, M6 | 10+ blurry+blender compounds | high (chains to U1) |
| U5 — Fairy weighting | M1 | 5+ fairy compound contexts | low-medium |
| U6 — Ducking | M2 | 5+ ducking compounds | low |
| U7 — Drifter | M3 | 5+ drifter compounds | medium |
| U8 — Multipliers | T7 | 10+ revolution-counting compounds | medium |
| A1 — Orbit | T8 | 3+ orbit-family compounds | low |

**Headline observation:** U1 (paradox internals) is the most expensive single resolution and unblocks the largest impact area. U6 (ducking), U5 (fairy), and A1 (orbit) are low-complexity unblockings that each free 3-5 compounds.

---

## Section 7 — Unblocking sequence recommendations

Recommended order in which curator should pursue resolution, ordered by ROI (impact ÷ complexity):

### Tier 1 — Quick wins (low complexity, meaningful impact)

1. **A1 — orbit baseline** — single curator decision on orbit's component decomposition. Unblocks orbit + reverse-orbit + gyro-orbit + orbit-family compounds.
2. **U6 — ducking manifestation** — single curator decision on which component ducking modifies. Unblocks pixie-ducking-butterfly + ducking-osis + ducking-whirl + ducking-butterfly.
3. **T6 — smear data** — curator review of existing dictionary sources to confirm smear's family-base. May resolve via legacy move sets or PassBack glossary.
4. **U5 — fairy compound weighting** — per-compound curator decisions on FAIRY DRIFTER, FAIRY ATOMIC. Could be tabled or done case-by-case as they appear.

**Tier 1 estimated unblock: 15-20 compounds.**

### Tier 2 — Medium-complexity (curator-judgment territory)

5. **U7 — drifter manifestation table** — establish per-compound or per-axis manifestation rule. Higher complexity than ducking because drifter genuinely behaves contextually.
6. **U8 — multiplier convention** — establish notation for revolution-counting. Unblocks eggbeater + DATW + TATW + pigbeater + multi-revolution compounds.
7. **M6 — blender weighting** (without U1/U4 internals) — curator may be able to assign a baseline weight to blender that lets simple blender compounds render even while food processor (which routes via paradox) stays blocked.

**Tier 2 estimated unblock: 15-20 additional compounds.**

### Tier 3 — Red-ruling territory (high complexity, deferred)

8. **U3 — barraging internals** — depends on whether curator accepts barraging = high stepping as a sufficient alias chain. If yes, alias-chain resolution unblocks; if no, needs fresh Red ruling.
9. **U4 — blurry integration** — Red ruling exists; integration alone produces totals but not breakdowns. Decomposition still routes through U1.
10. **U2 — symposium internals** — fresh Red ruling needed.
11. **U1 — paradox internals** — fresh Red ruling needed; highest-impact single resolution.
12. **T5 — atomsmasher** — depends on U1.

**Tier 3 estimated unblock: 30+ additional compounds, but requires Red availability.**

### Sequencing note

The Phase-1 prototype does **not** wait for any of these tiers. Phase-1's 17-trick renderable cohort (per D3) is comfortably substantial without Wave-2 resolution. Tier 1 quick wins can land incrementally as Phase-1 ships; Tiers 2 and 3 can wait for Phase 2 / Phase 3 surface work.

---

## Section 8 — Suppression mechanics

How the curator-map enforces suppression at render time:

### Phase 1 (per-trick expander on `/freestyle/tricks/:slug`)

```
1. Read trick's canonical notation tokens
2. For each token:
     a. Look up in inventory CSV
     b. If wave2_sensitive=true → suppress flag = true
3. If suppress flag = true → do not render derivation panel
   Trick page renders normal layout + editorial ADD chip only
4. No "Pending" copy on trick page (Decision 2)
```

### Phase 2 (glossary + add-analysis integration)

Glossary §3 / §7 may discuss Wave-2 cases as a *teaching topic* — i.e., "these compounds carry ADD weights set by editorial review; the per-component breakdown awaits curator resolution." This is acceptable because it appears in a teaching context, not on the trick page itself.

`/freestyle/add-analysis` may surface Wave-2 cases in its provenance prose. This is already its established role (the page documents formula resolution history).

### What suppression does NOT do

- Does not hide the trick from search / listings / nav
- Does not remove the trick's editorial ADD chip
- Does not edit the trick's notation, name, family, alias chain, or any canonical metadata
- Does not affect the operator board, equivalence registry, or any other surface
- Does not log a user-visible warning

Suppression is invisible to non-curator users. Only the derivation panel is gated.

---

## Section 9 — Curator decision-readiness summary

Counting by readiness:

| Readiness | Cluster IDs | Count |
|---|---|---|
| `ready-for-curator` | A1, T8 (depends on A1), partial U4 (integration step) | 2 entries unblockable by single decisions |
| `needs-red` | U1, U2, T1, T2, T3, T5, M5 | 7 entries gated on Red |
| `needs-red or needs-judgment` | U3, T4, M4 | 3 entries gated on Red-or-alias-chain interpretation |
| `needs-judgment` | U5, U6, U7, U8, T7, T6, M1, M2, M3, M6 | 10 entries unblockable by curator judgment |
| `needs-corpus` | T6 | 1 entry resolvable via existing-source review |

**Headline:** 13 of 26 entries can be resolved by curator judgment alone (no Red ruling needed). That's half the register unblockable on curator timeline.

---

## Final report — deliverable #4

### Counts

| Metric | Count |
|---|---|
| Total register entries | **26** |
| Wave-2 clusters | 8 (U1-U8) |
| Atom-level entries | 1 (A1) |
| Trick-level entries | 8 (T1-T8) |
| Modifier-level entries | 6 (M1-M6) |
| Phase-1 suppress decisions | 26 (all entries) |
| Curator-judgment unblockable | 13 |
| Red-ruling gated | 7 |
| Hybrid (Red-or-judgment) | 3 |
| Insufficient-data gated | 1 |
| Multiplier-convention gated | 1 (cluster) impacting many tricks |

### Dependency-type distribution

| Dependency | Entry count |
|---|---|
| `red-ruling-internals` | 5 |
| `red-ruling-integration` | 1 |
| `curator-baseline` | 2 |
| `curator-manifestation` | 2 |
| `curator-multiplier-convention` | 1 |
| `curator-data` | 1 |
| `curator-judgment` | 4 |
| `cluster-resolution` (downstream-only) | 10 |

### Estimated total compound suppression

Adding cluster-impact estimates:

| Cluster + leaf entries | Estimated compounds suppressed |
|---|---|
| U1 + downstream | 20+ |
| U2 + downstream | 10+ |
| U3 + downstream | 5+ |
| U4 + downstream | 10+ (overlaps U1) |
| U5 + downstream | 5+ |
| U6 + downstream | 5+ |
| U7 + downstream | 5+ |
| U8 + downstream | 10+ |
| A1 + downstream | 3+ |
| **Net unique** (de-duplicating overlap) | **60-80 compounds suppressed in Phase 1** |

This is a meaningful surface area. It is also the honest signal — the field has genuine doctrine gaps that the accounting layer respects rather than papering over.

### Future prototype recommendations

1. **Implement the curator-map with the register as a gating manifest.** The `freestyleAddAccounting.ts` content module should explicitly read this document's register as a deny-list during render-time evaluation. Suppression must be the default for any token / trick whose `wave2_sensitive=true` in the inventory.

2. **Provide a curator workbench page (internal-only) that lists the register.** This gives curator a single surface to track unblocking progress. Mirrors the spirit of `/freestyle/add-analysis` but is curator-only (per `/internal/` route convention from [[feedback_internal_only_constraint]]).

3. **Don't auto-unsuppress.** When a Red ruling lands or a curator-decision is made, the inventory CSV must be explicitly edited to flip `wave2_sensitive=true` → `false` and the register entry updated to `resolved` status. No silent promotion.

4. **Tier 1 quick wins should be the first follow-up after Phase-1 ship.** Orbit baseline + ducking manifestation + smear data each free 3-5 compounds at low cost. Highest ROI per unblock.

5. **U1 paradox internals is the single most valuable Red ruling.** When curator next has Red time, this is the cluster to bring. It unblocks 20+ compounds and a chain of downstream U4 entries.

### Educational-risk observations

**Risk W1 — Curator burnout from register length.** 26 entries + cluster impacts is a lot to track. Mitigation: the register lives in `exploration/` as a planning artifact; the production curator-map only needs the `wave2_sensitive=true` rows from the inventory CSV (which the inventory already has). The register is the *why*, the CSV is the *what*.

**Risk W2 — "Suppress" inferred as "broken."** If learners notice that some tricks have derivation panels and others don't, and the difference correlates with their advanced-trick interest, they may conclude "the advanced tricks are not yet supported." This is partially true (doctrine genuinely is unresolved) but framing matters. Mitigation: D6 considers whether a subtle visual marker on Wave-2 tricks helps, without resorting to per-trick "pending" copy.

**Risk W3 — Stale register entries.** As Red rulings land, the register can drift if not maintained. Mitigation: any future curator-map edit should require updating this document AND the inventory CSV in the same change set. The doc-sync skill would catch divergence between the two.

### Parser-risk observations

**Risk P1 — Parser will compute totals for Wave-2 tricks.** The parser does not know about doctrine. It will produce a `computed_adds` for paradox compounds. The accounting layer must NEVER pass these to the user-facing render path. Gate on `wave2_sensitive=true` from the inventory, not on parser silence.

**Risk P2 — Diagnostic noise from Wave-2 parser computations.** If the diagnostic emitter compares parser totals to editorial totals for all tricks, Wave-2 tricks will produce many "disagreement" diagnostics that are not actionable (because the curator-map doesn't have a breakdown). Mitigation: the diagnostic gate is `curator-map present AND wave2_sensitive=false AND parser-total ≠ curator-map total`. Wave-2 tricks emit no diagnostic — they emit nothing.

---

## Cross-references

- `executable_add_accounting_concept.md` — framing, three locked decisions (Decision 2 = suppress)
- `add_bearing_symbol_inventory.csv` — `wave2_sensitive` column gates panel rendering
- `add_bearing_symbol_inventory_notes.md` — D2 final report
- `compressed_atom_expansion_map.md` — D3 expansion map; Section 4 (drifter), Section 9 (positional handling)
- [[project_freestyle_state]] — current Red rulings + family-dual-membership entries
- [[feedback_reversible_content_governance]] — TS content modules > SQL during ontology refinement
- [[feedback_parser_editorial_separation]] — precedence rule

## Next deliverable

`prototype_accounting_render_examples.md` — worked render examples for the 17-trick Phase-1 cohort + Wave-2 suppression examples.
