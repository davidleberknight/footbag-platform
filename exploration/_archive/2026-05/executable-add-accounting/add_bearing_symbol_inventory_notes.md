# ADD-Bearing Symbol Inventory — Notes & Final Report

**Status:** Planning artifact. Companion to `add_bearing_symbol_inventory.csv`. Provides grouping summaries, cluster analysis, and the deliverable-#2 final report metrics. Treat all token attributions as curator-confirmation-pending until D3 (`compressed_atom_expansion_map.md`) ratifies them.

**Date:** 2026-05-18

---

## Token grouping summaries

### Group A — Atoms (12)

The 12 curator-authoritative core atoms. Each atom's `add_value` represents the *external* ADD it contributes when it appears as a trick terminator; internal-component breakdown is hidden inside the atom and surfaces only on the derivation panel.

```
toe-stall(1)     clipper-stall(1)   around-the-world(2)   orbit(?)
legover(2)       pickup(1)          mirage(2)             illusion(3)
butterfly(3)     osis(3)            whirl(3)              swirl(3)
```

Orbit is the only unresolved atom — curator must confirm baseline components before D3 can ratify it.

### Group B — Compound atoms (2 resolved + 4 unresolved)

Compounds that behave atom-like in compositions but decompose to multi-component derivations.

```
Resolved:    torque(4)        mobius(5)
Unresolved:  baroque(?)       paradox(?)        symposium(?)        atomsmasher(?)
```

Resolved compounds participate in the derivation panel. Unresolved compounds suppress the panel entirely per Decision 2.

### Group C — Components (6)

The hidden building blocks. Rarely written in canonical trick names; almost always inherited from atoms. These are the *render units* of the derivation panel.

```
stall(+1)      dex(+1)       xbody(+1)      spin(+1)      set(+0/+1)      mirage-dex(+1)
```

The `set` component is the only one with conditional ADD: baseline +0, +1 when modified by stepping/pixie/atomic/fairy/nuclear.

### Group D — Operators (11 core + 1 gerundive + 3 aliases)

Modifier prefixes. Each operator carries a +N value AND a manifestation rule — i.e. *which component* it modifies in the derivation breakdown.

| Operator | ADD | Manifests as | Status |
|---|---|---|---|
| stepping | +1 | set(+1) | resolved |
| pixie | +1 | set(+1) | resolved |
| atomic | +1 | set(+1) | resolved |
| nuclear | +1 | set(+1) | resolved |
| gyro | +1 | spin(+1) | resolved |
| miraging | +1 | mirage-dex(+1) | resolved |
| drifter | +1 | set(+1) or xbody(+1) | resolved (manifestation context-dependent) |
| whirling | +1 | whirl-as-base | resolved (rare) |
| fairy | +1 | set(+1) baseline | Wave-2 (compound weighting) |
| ducking | +1 | TBD | Wave-2 (internal mechanism) |
| blurry | +1 | TBD | Wave-2 (Red ruling pending integration) |
| blender | ? | TBD | Wave-2 (family-dual + ADD weighting) |
| sailing | (alias) | via pixie + illusion | resolved alias |
| terraging | (alias) | via 2× pixie | resolved alias |
| barraging | (alias) | via high-stepping; compounds Wave-2 | Wave-2 |

The manifestation column is critical for D3. The derivation panel will render the *component* form (`set(+1)`), not the *operator* form (`stepping`).

### Group E — Surfaces (9)

Contact surfaces. All +0; the stall reading is inherited from the atom they terminate. "Kick" disambiguates the kick verb.

```
toe   sole   inside   outside   cloud   jester   knee   head   ankle
```

### Group F — Directional / Positional (9)

Pure +0 markers. Educationally relevant but not ADD-bearing. The derivation panel may render these as a separate "context" row or omit them entirely.

```
reverse   far   near   same-side   opposite-side   under   over   in-dex   out-dex
```

### Group G — Structural / Timing (6)

Multipliers and descriptive qualifiers. Multipliers (DATW/TATW) need curator guidance on whether to render expanded; timing tokens are +0 throughout.

```
DATW   TATW   uptime   downtime   early   late
```

---

## Hidden-accounting clusters

The accounting layer's pedagogical value is highest where ADD is currently *hidden* inside an atom or compound. These are the clusters worth surfacing first:

### Cluster H1 — Body-crossing hidden in walking-family bases

```
butterfly → dex + xbody + stall
whirl     → xbody + dex + stall
swirl     → xbody + dex + stall
```

The walking family is the highest-volume cluster on the live site (per glossary §8). Surfacing the xbody+dex+stall hidden contribution turns "butterfly = 3 ADD" from a memorized fact into a derivable result. **High educational ROI.**

### Cluster H2 — Mirage-dex hidden in osis/torque/mobius

```
osis   → mirage-dex + xbody + stall
torque → mirage-dex + xbody + stall + spin
mobius → spin + (mirage-dex + xbody + stall + spin)   [≈ gyro torque]
```

The mirage-dex unit is the most-hidden component in the inventory. Its surfacing teaches users why osis and torque "feel" related at the ADD level. **High educational ROI for advanced compositions.**

### Cluster H3 — Spin hidden in illusion + gyro family

```
illusion         → dex + spin + stall
gyro-anything    → (base) + spin
```

The spin component is the second-most-hidden after mirage-dex. Surfacing it explains why gyro modifications consistently add exactly +1 across atoms. **Mid educational ROI; teaches a clean +1 rule.**

### Cluster H4 — Stall as the universal terminator

```
every atom → ... + stall(+1)
```

Trivial cluster — every atom inherits stall(+1). This is more "pattern recognition" than discovery. **Low educational ROI for advanced users; foundational for new users.**

---

## Unresolved accounting clusters

These are the clusters where the derivation panel **must suppress** per Decision 2.

### Cluster U1 — Paradox / Atom Smasher internals

`paradox` and `atomsmasher` both carry doctrine that has not been formalized. The pre-Red note ("Atom Smasher carries X-dex like paradox from a toe") hints at a shared internal pattern but does not establish it.

**Suppress** all paradox-containing and atomsmasher-containing compounds.

### Cluster U2 — Symposium internals

`symposium` ADD weighting per editorial is known, but the internal "what counts as +1 inside symposium" is unresolved.

**Suppress** all symposium-containing compounds.

### Cluster U3 — Barraging / Baroque

Per legacy move sets: Barraging = High Stepping. Per pre-Red: Baroque = Barraging Osis = 5 ADD. The Baroque editorial total is known but the barraging internal contribution is not.

**Suppress** all barraging-containing compounds (Baroque, Barraging Mirage Whirl, etc.).

### Cluster U4 — Blurry / Blender

Blurry has a Red ruling integration pending (Blurry Whirl = Stepping Paradox Whirl = 5). Blender has dual family-membership (torque/blender) and unconfirmed weighting.

**Suppress** for now. Re-evaluate Blurry once RED_RESOLVED_CANON integration lands.

### Cluster U5 — Fairy weighting

`fairy` is established as a +1 modifier (Red: "Fairy = legit operator vocab"). However, fairy's weighting *inside compound contexts* — particularly FAIRY DRIFTER, FAIRY ATOMIC — is curator-judgment territory.

**Render fairy-bearing tricks** when the editorial total agrees with curator-map; **suppress** if disagreement, with diagnostic.

### Cluster U6 — Ducking internals

Ducking is +1 externally but its internal mechanism (does it modify dex? spin? set?) is unresolved.

**Suppress derivation for ducking-bearing tricks** until curator confirms manifestation.

---

## Shorthand-vs-expanded transition examples

These pairings illustrate the contract the inventory enables — compact notation stays primary; derivation is opt-in expansion.

```
Compact:    butterfly
Expanded:   dex(+1) + xbody(+1) + stall(+1) = 3 ADD

Compact:    stepping whirl
Expanded:   set(+1) + xbody(+1) + dex(+1) + stall(+1) = 4 ADD

Compact:    pixie butterfly
Expanded:   set(+1) + dex(+1) + xbody(+1) + stall(+1) = 4 ADD

Compact:    gyro torque
Expanded:   spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 5 ADD
            (= mobius per pre-Red ruling)

Compact:    miraging far symposium butterfly
Expanded:   ⊘ SUPPRESSED — symposium internals doctrine-unresolved
            (editorial asserted_adds rendered in normal chip; derivation panel absent)

Compact:    nuclear butterfly
Expanded:   set(+1) + dex(+1) + xbody(+1) + stall(+1) = 4 ADD
```

The double-spin in `gyro torque → mobius` is the marquee teaching moment of the inventory: it makes visible why a compositionally-identical-looking compound has a "surprising" extra ADD.

---

## Final report — deliverable #2

### Counts

| Metric | Count |
|---|---|
| Total tokens inventoried | **63** |
| Atoms | 12 |
| Compound atoms (resolved) | 2 |
| Compound atoms (unresolved) | 4 |
| Components (hidden building blocks) | 6 |
| Operators (resolved) | 8 |
| Operators (Wave-2 sensitive) | 4 |
| Operator aliases | 3 |
| Surfaces | 9 |
| Directional / Positional | 9 |
| Structural multipliers | 2 |
| Timing tokens | 4 |

### Visible vs hidden accounting ratio

| Visibility | Token count | % |
|---|---|---|
| Always visible in canonical shorthand | 51 | 81% |
| Partially visible (visible in some compounds) | 4 | 6% |
| Rarely visible | 2 | 3% |
| Hidden inside atoms / compounds | 6 + 6 compound-internals | — |

The 6 *components* (stall/dex/xbody/spin/set/mirage-dex) plus the 6 *compound-atom internals* (torque/mobius/baroque/paradox/symposium/atomsmasher) are the units the derivation panel will **expose**. Everything else is either already visible in canonical shorthand or is a context marker (+0).

### Positional-only token count

**9 tokens** — `reverse`, `far`, `near`, `same-side`, `opposite-side`, `under`, `over`, `in-dex`, `out-dex`. These render as a separate "context" row in the derivation panel (or are omitted; D6 will choose).

### Wave-2-sensitive token count

**9 tokens / clusters** —

- 1 atom: `orbit`
- 4 compound-unresolved: `baroque`, `paradox`, `symposium`, `atomsmasher`
- 4 operators: `fairy`, `ducking`, `blurry`, `blender`
- 1 operator-alias: `barraging`

Every trick containing one of these tokens is a derivation-panel-suppress candidate until curator resolves the cluster.

### Recommended future rendering constraints

1. **Render components, not operators.** The derivation panel displays component-level units (`set(+1)`, `spin(+1)`, `dex(+1)`), never modifier names (`stepping`, `gyro`, `pixie`). The compact notation already carries the modifier; the panel teaches *what the modifier produces*.

2. **Hidden inside atoms = always render.** When the panel renders, it expands ALL hidden components. There is no "partial expansion" mode in Phase 1. If butterfly renders, it shows `dex + xbody + stall`, not just `butterfly(+3)`.

3. **Suppress at the compound boundary, not the token boundary.** If a trick contains *any* Wave-2-sensitive token, suppress the panel for the whole trick. Do not render "stepping(+1) + ??? + osis(+3)" with a question-mark for the unresolved middle.

4. **Mirage-dex stays a single component.** Do not split into `mirage + dex` rows. Curator-map row granularity is `mirage-dex` as one unit (per concept doc Open Q3 default).

5. **Single-component atoms may suppress derivation.** Toe-stall, clipper-stall, and pickup all expand to `stall(+1) = 1 ADD`. A single-line derivation teaches nothing. **Recommendation:** in Phase 1, suppress derivation for atom-only tricks with ADD ≤ 1; render derivation for atom-only tricks with ADD ≥ 2 (atw, legover, mirage) and all compounds.

6. **Surfaces never appear as a derivation row.** `toe` in "toe stall" doesn't get a `toe(+0)` row. The panel shows `stall(+1)` and the trick name (e.g. "toe stall") provides the surface context above.

7. **Positional markers either get a single context row or are omitted.** D6 will choose between: (a) `Context: reverse, far` collapsed line above the derivation, or (b) full omission. Both honor the +0 nature.

8. **Component order encodes mechanical sequence, not symbolic preference.** Butterfly's `dex + xbody + stall` and whirl's `xbody + dex + stall` are NOT interchangeable. The curator-map locks order per atom.

### Educational-risk observations

**Risk E1 — Manifestation ambiguity.** The operator-to-component mapping (`stepping → set(+1)`, `gyro → spin(+1)`) is curator judgment. If a learner asks "why does stepping become 'set' in the breakdown?" the glossary §3 + §6 must answer cleanly. **Mitigation:** D6 includes hover/link from each component back to glossary surface.

**Risk E2 — Atom-internal nesting depth.** Mobius decomposes as `spin + (mirage-dex + xbody + stall + spin)` — five terms with two spins. Learners may parse this as a parsing trick rather than a teaching moment. **Mitigation:** D5 worked examples use deliberate spacing/typography to make the "two distinct spins" mechanically obvious.

**Risk E3 — Suppression as silent confusion.** A learner viewing two adjacent tricks where one shows derivation and the other doesn't may infer "the second is simpler" when actually it's "the second is unresolved." **Mitigation:** D6 considers whether the panel-absent state needs a subtle marker (e.g. an info-icon explaining suppression with a glossary link, but NOT a "pending Red ruling" on-page).

**Risk E4 — Component vocabulary divergence from glossary §3.** If the curator-map uses `mirage-dex` as one unit but glossary §3 keeps `mirage` and `dex` separate, the cross-link from the panel to the glossary may land on a term that doesn't match the panel's component. **Mitigation:** D3 reconciles vocabulary; if §3 needs an additional entry for `mirage-dex`, flag in D3.

### Parser-risk observations

**Risk P1 — Parser computed_adds may agree with curator-map by accident.** The parser uses its own decomposition heuristics. For simple atoms (butterfly, whirl) it likely produces correct totals. For compounds (gyro torque, miraging dada-curve) it may produce *the same number* via a different decomposition path. **Mitigation:** the parser-as-check signal is *total-agreement*, not *component-agreement*. We do NOT compare the parser's per-token attribution to the curator-map's per-token attribution. Only the totals.

**Risk P2 — Parser silence on Wave-2 cases.** The parser will happily compute ADDs for paradox + symposium + ducking compounds. The accounting layer must ignore parser output for any token flagged Wave-2-sensitive — `wave2_sensitive=true` in the inventory is the gate. **Mitigation:** D5 + D6 specify the gate in render-pseudocode.

**Risk P3 — Parser does not know about manifestation rules.** The parser sees `stepping whirl` and (probably) attributes +1 to "stepping" and +3 to "whirl". The curator-map attributes +1 to "set" (via stepping manifestation) and +3 to whirl's internal components. **The parser cannot validate the curator-map's manifestation choices.** The only check is the *total*. This is acceptable per Decision 3.

**Risk P4 — Future parser changes could destabilize the diagnostic signal.** If the parser is changed to alter how it computes ADDs (e.g. revised allow-list), the curator-map disagreement set could shift overnight. **Mitigation:** the diagnostic destination (per concept doc Open Q4) must be curator-facing only, never user-facing — so parser drift becomes a curator-workbench signal, not a user-visible regression.

### Recommendations for D3 (compressed atom expansion map)

D3 should ratify:

1. The 12-atom internal decomposition (orbit pending).
2. The 2 resolved compound-atom internal decompositions (torque, mobius).
3. The 11 resolved operators' manifestation mappings.
4. Component-order conventions per atom (butterfly vs whirl ordering preserved).
5. The "single-component atom suppression" rule for atom-only tricks ADD ≤ 1.
6. The mirage-dex granularity decision (one unit, not two).

D3 should *not* attempt:

- Internal decomposition of any Wave-2-sensitive token.
- Schema changes.
- Parser changes.
- New operator vocabulary.

---

## Cross-references

- `executable_add_accounting_concept.md` — framing, three locked decisions
- `add_bearing_symbol_inventory.csv` — the inventory itself
- `compressed_atom_expansion_map.md` (next deliverable) — atom internal decompositions
- [[project_freestyle_core_atoms]] — 12-atom registry
- [[feedback_parser_editorial_separation]] — precedence rule
