# Compressed Atom Expansion Map

**Status:** Planning artifact. Companion to `executable_add_accounting_concept.md` and `add_bearing_symbol_inventory.csv`. Every expansion below is curator-confirmation-pending until ratified by a separate curator-review pass.

**Date:** 2026-05-18

---

## Purpose

Provide the canonical educational expansion map for atoms and compound atoms, distinguishing **educational accounting expansion** from **structural decomposition chains**. The expansion map is the bridge between the symbol inventory (D2) and the worked render examples (D5).

This is a reference for the curator-maintained `freestyleAddAccounting.ts` content module envisioned in the concept doc. It is not a parser specification. It does not authorize public ontology mutation.

---

## Core distinction — accounting vs structural chains

The freestyle subsystem already maintains two related-but-distinct decompositions:

### A. Structural decomposition chains

The symbolic-chain layer documents *what compounds reduce to* in operator-board / equivalence terms. Example for mobius:

```
mobius  ≡  gyro torque  ≡  miraging osis  ≡  ...
```

These chains are pedagogical compression-shorthands. The operator board renders them; the equivalence registry tracks them.

### B. Educational accounting expansion

The accounting layer documents *which ADD-bearing components* a trick decomposes into. Example for mobius:

```
mobius  →  spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1)  =  5 ADD
```

These expansions answer "why does this trick total this many ADDs?"

### Why both exist

| Layer | Reads as | Audience |
|---|---|---|
| Structural chain | "this is shorthand for that simpler form" | Mid/advanced learners building compositional intuition |
| Accounting expansion | "this is where each ADD comes from" | Anyone asking why a trick's score is what it is |

**The two layers can disagree on intermediate forms and both still be correct.** The structural chain `mobius ≡ gyro torque` is correct shorthand; the accounting expansion `spin + mirage-dex + xbody + stall + spin` is correct component breakdown. The chain compresses; the expansion enumerates.

The accounting expansion is what the derivation panel renders. The structural chain belongs to the operator board and the equivalence registry — separate surface.

---

## Expansion-type taxonomy

Every row in the expansion map is classified as exactly one of:

| Type | Meaning | Renderable? |
|---|---|---|
| **atomic** | Components are directly visible / immediately readable from the atom name | Yes |
| **inherited** | Components are inherited through a named atom and not surfaced in the shorthand | Yes |
| **compressed** | Shorthand hides multiple layers of accounting; expansion may add 2+ components beyond what the name suggests | Yes |
| **contextual** | Component manifestation depends on which compound the token sits inside | No in Phase 1; revisit Phase 2 |
| **unresolved** | Doctrine pending; expansion would propagate an unconfirmed reading | Suppress |

---

## Renderability classification (Phase 1)

| Class | Meaning |
|---|---|
| **A — renderable** | Derivation panel renders fully on trick-detail page |
| **B — renderable_with_compact_mode_only** | Derivation accessible via hover/tooltip but not as a primary expander; reserved for trivial / atom-only cases |
| **C — renderable_with_context_note** | Derivation renders with a small explanatory caption (e.g. "reverse is +0") |
| **D — suppress_in_phase1** | Derivation panel does not render; trick page falls back to normal layout + editorial ADD chip only |

---

## Component reference (from D2)

The accounting layer uses exactly six ADD-bearing components. All derivation expansions terminate in this vocabulary:

| Component | Baseline ADD | Notes |
|---|---|---|
| `stall(+1)` | +1 | Universal trick terminator |
| `dex(+1)` | +1 | Ankle dexterity unit |
| `xbody(+1)` | +1 | Body-crossing unit |
| `spin(+1)` | +1 | Body-rotation unit |
| `set(+1)` | +0 baseline, +1 when modified | Move-initiation primitive |
| `mirage-dex(+1)` | +1 | Compound dex unit; ONE unit, not two |

---

## Section 1 — The 12 atoms

| Atom | Shorthand | Educational accounting | Type | Wave-2 | Renderable | Notes |
|---|---|---|---|---|---|---|
| toe-stall | `toe` (= toe stall) | `stall(+1) = 1` | inherited | no | **B** — atom-only ADD ≤ 1 | Single-line derivation; surface name above panel provides context |
| clipper-stall | `clipper` | `stall(+1) = 1` | inherited | no | **B** | Bare "clipper" = atom; surface contextualizes |
| around-the-world | `atw` | `xbody(+1) + stall(+1) = 2` | inherited | no | **A** | High educational ROI — xbody component otherwise hidden |
| orbit | `orbit` | `? = ?` | unresolved | yes | **D** — suppress | Concept doc Open Q1: orbit baseline TBD by curator |
| legover | `legover` | `xbody(+1) + stall(+1) = 2` | inherited | no | **A** | Twin to atw; xbody surfacing teaches body-crossing concept |
| pickup | `pickup` | `stall(+1) = 1` | inherited | no | **B** — atom-only ADD ≤ 1 | Surface variant |
| mirage | `mirage` | `dex(+1) + stall(+1) = 2` | inherited | no | **A** | Foundational for dex visibility |
| illusion | `illusion` | `dex(+1) + spin(+1) + stall(+1) = 3` | inherited | no | **A** | Surfaces spin component for the first time in atom vocabulary |
| butterfly | `butterfly` | `dex(+1) + xbody(+1) + stall(+1) = 3` | inherited | no | **A** | Order distinct from whirl per mechanical difference |
| osis | `osis` | `mirage-dex(+1) + xbody(+1) + stall(+1) = 3` | inherited | no | **A** | First appearance of mirage-dex compound component |
| whirl | `whirl` | `xbody(+1) + dex(+1) + stall(+1) = 3` | inherited | no | **A** | Order distinct from butterfly per mechanical difference |
| swirl | `swirl` | `xbody(+1) + dex(+1) + stall(+1) = 3` | inherited | no | **A** | Same components as whirl, component-order semantics distinct |

**Hidden-accounting density rule observed:** atoms with ADD ≥ 2 surface 2-3 hidden components when expanded. Atoms with ADD = 1 surface zero. This justifies the Class-B "compact mode only" treatment for single-component atoms — there is no hidden accounting to reveal.

---

## Section 2 — Compound atoms (resolved + unresolved)

| Compound | Shorthand | Educational accounting | Type | Wave-2 | Renderable | Notes |
|---|---|---|---|---|---|---|
| torque | `torque` | `mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 4` | compressed | no | **A** | The compound-atom with the densest hidden accounting; xbody + spin both hidden behind name |
| mobius | `mobius` (≡ gyro torque) | `spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 5` | compressed | no | **A** | Two-spin marquee teaching moment; structural chain (mobius ≡ gyro torque) belongs to operator board, not panel |
| baroque | `baroque` (≡ barraging osis) | `? + osis(+3) = 5` (editorial) | unresolved | yes | **D** — suppress | Barraging internals doctrine-unresolved per Wave-2 cluster |
| paradox | `paradox` | `? = varies` | unresolved | yes | **D** — suppress | Paradox internals doctrine-unresolved |
| symposium | `symposium` | `? = varies` | unresolved | yes | **D** — suppress | Symposium internals doctrine-unresolved |
| atomsmasher | `atomsmasher` | `? carries x-dex like paradox from toe` | unresolved | yes | **D** — suppress | Pre-Red hint exists; formal decomposition pending |

---

## Section 3 — The 15 required cases

Detailed treatment per the brief. Cross-references to Section 1 / 2 where the case is already covered.

### Case 1 — whirl

- **Shorthand:** `whirl`
- **Educational accounting:** `xbody(+1) + dex(+1) + stall(+1) = 3`
- **Hidden-accounting notes:** all three components hidden inside the atom name; no token in `whirl` reveals body-crossing visually. The derivation panel surfaces this.
- **Expansion type:** inherited
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **A — renderable**
- **Provenance:** 12-atom registry; confirmed component order distinct from butterfly
- **Parser-risk notes:** parser likely produces correct total; per-component attribution may differ (parser may name the component "whirl-dex" or similar internal token). Total-only check.

### Case 2 — torque

- **Shorthand:** `torque`
- **Educational accounting:** `mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 4`
- **Hidden-accounting notes:** densest atom; four hidden components. Torque is the proving ground for whether learners can read 4-line expansions cleanly.
- **Expansion type:** compressed
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **A**
- **Provenance:** compound-atom; pre-Red structural chain `torque ≡ miraging osis + spin` not surfaced on accounting panel (belongs to operator board)
- **Parser-risk notes:** parser may decompose torque as `mirage + dex + xbody + stall + spin` (five components, splitting mirage-dex into two units). Total-only check tolerates this divergence; per-component attribution stays curator-authoritative

### Case 3 — mobius

- **Shorthand:** `mobius`
- **Educational accounting:** `spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 5`
- **Hidden-accounting notes:** the **double spin** is the marquee educational moment. Compositional intuition says "gyro adds one spin"; the panel reveals the inherited spin from torque was already there, producing two distinct spin contributions.
- **Expansion type:** compressed
- **Wave-2 sensitive:** no — but pre-Red ruling `Mobius ≈ Gyro Torque` is "approximately equal", not strict equality. Curator should confirm whether `mobius` carries any additional component beyond gyro+torque before this row lands in the production curator-map.
- **Renderable in Phase 1:** **A**
- **Provenance:** pre-Red ruling; integration via `RED_RESOLVED_CANON` flow pending
- **Parser-risk notes:** parser likely splits mirage-dex; total stays 5

### Case 4 — osis

- **Shorthand:** `osis`
- **Educational accounting:** `mirage-dex(+1) + xbody(+1) + stall(+1) = 3`
- **Hidden-accounting notes:** first appearance of mirage-dex in the atom vocabulary; teaches that some dex contributions are "compound dex" (the dex carries a built-in mirage flavor) rather than vanilla dex.
- **Expansion type:** inherited
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **A**
- **Provenance:** 12-atom registry; canonical
- **Parser-risk notes:** parser may attribute `mirage(+1) + dex(+1) + xbody(+1) + stall(+1) = 4` if it splits mirage-dex. Total would be wrong by +1. **Important diagnostic boundary** — curator-map total (3) is authoritative; parser drift here is the cleanest test of the parser-as-check pattern.

### Case 5 — butterfly

- **Shorthand:** `butterfly`
- **Educational accounting:** `dex(+1) + xbody(+1) + stall(+1) = 3`
- **Hidden-accounting notes:** order distinct from whirl per mechanical difference (prior session lock). Dex precedes xbody because butterfly's dexterity initiates the body crossing; in whirl, the body crossing initiates and dex follows.
- **Expansion type:** inherited
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **A**
- **Provenance:** 12-atom registry; foundational
- **Parser-risk notes:** parser likely correct on total; component order may be re-sorted alphabetically (curator-map must override)

### Case 6 — mirage

- **Shorthand:** `mirage`
- **Educational accounting:** `dex(+1) + stall(+1) = 2`
- **Hidden-accounting notes:** simplest dex-bearing atom; teaches that the mirage word *is* the dex component plus a stall, not a third thing.
- **Expansion type:** inherited
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **A**
- **Provenance:** 12-atom registry
- **Parser-risk notes:** clean

### Case 7 — drifter

- **Shorthand:** `drifter` (modifier, not a standalone trick — appears in compounds: FAIRY DRIFTER, REVERSE DRIFTER, etc.)
- **Educational accounting:** **CONTEXTUAL — manifestation depends on compound context**
- **Hidden-accounting notes:** drifter is +1 (confirmed), but *which component* the +1 manifests as varies:
  - In `FAIRY DRIFTER` — drifter may manifest as `set(+1)` (set-modifier reading) or `xbody(+1)` (drift = body-displacement reading)
  - In `REVERSE DRIFTER` — paired with whirl base; drifter manifests likely as `xbody(+1)` (the drifter motion crosses the body)
  - In other compounds — TBD
- **Expansion type:** contextual
- **Wave-2 sensitive:** no — drifter itself is resolved at the +1 level; only the manifestation is contextual
- **Renderable in Phase 1:** **D — suppress for drifter-bearing compounds** until per-compound manifestation rules are curator-locked
- **Why the ambiguity matters:** if the panel renders one manifestation for FAIRY DRIFTER and a different manifestation for REVERSE DRIFTER, learners may infer drifter "shape-shifts." It does not — it's the same modifier; the manifestation is a curator-judgment about which component the modifier emphasizes in each compound. Better to suppress than to teach an inconsistent rule.
- **Provenance:** [[project_freestyle_state]] notes drifter pair with reverse-drifter as canonical direction-variant pair
- **Curator decision needed:** lock per-compound manifestation table before drifter compounds can render

### Case 8 — eggbeater

- **Shorthand:** `eggbeater`
- **Educational accounting:** **PROVISIONAL** — likely `legover(+2) × n` where n = revolution count; OR `legover(+2) + xbody(+1) per extra revolution`
- **Hidden-accounting notes:** family = legover per Wave-1 corrective (loader-19 family default); revolution-multiplier semantics unconfirmed
- **Expansion type:** compressed (if multiplier-rule established) or contextual (if revolution count varies)
- **Wave-2 sensitive:** no (legover base is resolved)
- **Renderable in Phase 1:** **D — suppress** until multiplier convention curator-locked
- **Why suppress:** revolution-multipliers are an unestablished accounting convention. Rendering `legover(+2) × 2 = 4` invents a notation. Better to wait.
- **Provenance:** loader-19 family default; pt12-era legover-family enforcement
- **Curator decision needed:** establish multiplier-component rule for revolution-counting tricks before rendering

### Case 9 — blur (= blurry whirl)

- **Shorthand:** `blurry whirl` (also written `blur`)
- **Editorial total:** 5 (per Red ruling: Blurry Whirl = Stepping Paradox Whirl = 5)
- **Educational accounting:** **UNRESOLVED** — Red ruling pins the total at 5 but the decomposition routes through paradox internals
- **Hidden-accounting notes:** if `blurry ≡ stepping paradox`, then the expansion would be `set(+1) [from stepping] + ??? [paradox internals] + whirl(+3) = 5`. The paradox internals are Wave-2.
- **Expansion type:** unresolved
- **Wave-2 sensitive:** yes (paradox involvement)
- **Renderable in Phase 1:** **D — suppress**
- **Suppression reason:** Red ruling integration via RED_RESOLVED_CANON pending; paradox internals doctrine-unresolved regardless of integration timing
- **Provenance:** Red ruling 2026-05-15 wave
- **Parser-risk notes:** parser may compute 4 (treating blurry as alone +1, no paradox involvement) — disagreement with editorial 5 is *expected* and is the right diagnostic signal

### Case 10 — ripwalk

- **Shorthand:** `ripwalk` (≡ `stepping butterfly`)
- **Editorial total:** 4
- **Educational accounting:** `set(+1) + dex(+1) + xbody(+1) + stall(+1) = 4`
- **Hidden-accounting notes:** ripwalk is the canonical walking-family base — stepping modifier manifests as `set(+1)`, butterfly atom expands as usual
- **Expansion type:** inherited (the set component carries the modifier; butterfly carries the atom)
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **A**
- **Provenance:** DB notation corrected 2026-05-18 (BLURRY BUTTERFLY → STEPPING BUTTERFLY); curator-confirmed via operator-board lede + glossary §3/§8
- **Parser-risk notes:** parser likely computes the right total; per-component naming may differ (parser may call set-component "stepping" instead of "set")

### Case 11 — smear

- **Shorthand:** `smear`
- **Educational accounting:** **CURATOR CONFIRMATION REQUIRED** — smear is a recognized trick name but its family-base and component decomposition are not in the resolved cohort
- **Hidden-accounting notes:** without curator confirmation, this row cannot be authored. Smear may be a clipper-stall variant, an osis-family compound, or a surface-kick compound — the inventory cannot disambiguate.
- **Expansion type:** contextual (pending classification) or unresolved (if doctrine pending)
- **Wave-2 sensitive:** unknown
- **Renderable in Phase 1:** **D — suppress**
- **Suppression reason:** insufficient curator-confirmed metadata to author expansion
- **Curator decision needed:** confirm smear's family-base and modifier composition before this row can be filled

### Case 12 — dimwalk

- **Shorthand:** `dimwalk` (≡ `pixie butterfly`)
- **Editorial total:** 4
- **Educational accounting:** `set(+1) + dex(+1) + xbody(+1) + stall(+1) = 4`
- **Hidden-accounting notes:** twin to ripwalk — pixie modifier manifests as `set(+1)`, butterfly atom expands as usual. The accounting expansion is *identical* to ripwalk; the structural chain differs (stepping vs pixie).
- **Expansion type:** inherited
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **A**
- **Provenance:** walking-family progression in glossary §8; pixie-butterfly formula in slice-C tests
- **Parser-risk notes:** clean
- **Educational note:** ripwalk + dimwalk side-by-side is a high-value teaching pair — *same accounting, different structural chain*. Worth flagging in D5 worked examples.

### Case 13 — rev-whirl (= reverse whirl)

- **Shorthand:** `reverse whirl` (also `rev whirl`)
- **Editorial total:** 3 (reverse = +0 per Red)
- **Educational accounting:** `xbody(+1) + dex(+1) + stall(+1) = 3` — same as whirl
- **Hidden-accounting notes:** reverse is +0; the directional context is descriptive only. The panel may render with a small "Context: reverse" caption above the derivation, or omit the directional marker entirely (D6 decides).
- **Expansion type:** inherited (same as whirl; reverse adds no accounting weight)
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **C — renderable_with_context_note**
- **Provenance:** Red ruling `far/reverse = +0`; whirl/rev-whirl canonical direction-variant pair per [[project_freestyle_state]]
- **Parser-risk notes:** clean

### Case 14 — rev-up

- **Shorthand:** `rev up` (reading: reverse pickup, or "reverse up" — curator confirmation needed)
- **Editorial total:** likely 1 if = reverse pickup (pickup +1, reverse +0)
- **Educational accounting:** if = reverse pickup → `stall(+1) = 1`
- **Hidden-accounting notes:** single-component (stall only); atom-only ADD ≤ 1 → suppress derivation per the single-component rule even if renderable
- **Expansion type:** inherited (if pickup base confirmed) or contextual (if alternate reading)
- **Wave-2 sensitive:** no
- **Renderable in Phase 1:** **B — renderable_with_compact_mode_only** OR **D — suppress** depending on curator confirmation of the canonical reading
- **Curator decision needed:** confirm whether `rev up` canonically reads as reverse-pickup or has a distinct decomposition

### Case 15 — reverse-atw / reverse-orbit

- **Shorthand:** `reverse atw` / `reverse orbit`
- **Educational accounting (reverse-atw):** `xbody(+1) + stall(+1) = 2` — same as atw; reverse is +0
- **Educational accounting (reverse-orbit):** **UNRESOLVED** — orbit baseline pending per Section 1
- **Hidden-accounting notes:** reverse-atw is the cleanest illustration of the reverse-marker convention: same accounting as base, directional context only. Reverse-orbit cannot render until orbit's baseline is curator-resolved.
- **Expansion type:** inherited (atw); unresolved (orbit)
- **Wave-2 sensitive:** no (atw) / yes (orbit)
- **Renderable in Phase 1:**
  - `reverse atw` → **C — renderable_with_context_note** ("Context: reverse")
  - `reverse orbit` → **D — suppress**
- **Provenance:** Red `far/reverse = +0`; orbit baseline TBD
- **Parser-risk notes:** clean for atw; orbit's parser output is whatever the parser guesses (irrelevant since panel suppresses)

---

## Section 4 — Drifter ambiguity register

Drifter is the most prominent contextual case in the inventory. The brief explicitly asks for it not to be force-resolved. Documenting the ambiguity dimensions:

### Possible drifter manifestations

| Compound | Possible reading | Manifestation candidate |
|---|---|---|
| FAIRY DRIFTER | drifter modifies the fairy set | `set(+1)` — drifter joins fairy's set-modifier role |
| FAIRY DRIFTER | drifter contributes its own xbody to the set | `xbody(+1)` — drifter as body-displacement |
| REVERSE DRIFTER | drifter pairs with whirl-base | `xbody(+1)` — drifter motion crosses body |
| DRIFTER WHIRL | drifter as prefix-modifier | `set(+1)` — modifier-pattern |
| (other drifter compounds) | TBD | TBD |

### Why the ambiguity matters

The accounting layer's pedagogical credibility depends on **rule consistency**. If learners see:

```
FAIRY DRIFTER:      set(+1) + ... [drifter manifests as set]
REVERSE DRIFTER:    xbody(+1) + ... [drifter manifests as xbody]
```

...they will reasonably ask "why does drifter mean different things in different compounds?" If the answer is "because curator says so", the panel undermines its own teaching value.

### Suppression recommendation

For Phase 1, **suppress derivation rendering for every drifter-bearing compound**. The trick still renders its editorial ADD chip via the normal layout.

In Phase 2 (glossary integration), the manifestation question can be raised as a *teaching topic* — i.e., "drifter is a contextual modifier; its accounting contribution depends on whether the drifter motion emphasizes set-displacement or body-crossing" — which is the honest answer.

### Curator decision needed

Before Phase 2 can address drifter, the curator must establish:

1. **Is drifter manifestation per-compound (lookup table) or per-axis (rule)?** A rule would be cleaner ("drifter manifests as set when modifying a set-modifier, otherwise xbody") but only works if the rule actually holds across all compounds.
2. **Does the manifestation table go in `freestyleAddAccounting.ts`** (as a separate `drifterManifestations` map) **or in the per-trick entry** (manual specification per trick)?
3. **Is the manifestation taught explicitly** in the glossary, or does the derivation panel render quietly without explanation?

These decisions belong in D6 (UI brainstorm) and the eventual implementation slice — out of scope for D3.

---

## Section 5 — Positional / directional handling

Positional markers (+0) require a render-policy decision in the curator-map. They affect *which* trick the panel describes but not *how many ADDs* it produces.

### Render options

| Option | Behavior | Pros | Cons |
|---|---|---|---|
| **Omit** | Positional tokens never appear in the derivation | Cleanest panel; minimizes visual clutter | Panel doesn't acknowledge they exist; learner may wonder why "far whirl" shows the same accounting as "whirl" |
| **Context caption** | Positional tokens render as a single "Context: ..." line above the derivation | Acknowledges presence without claiming ADD weight | Adds a line per compound; format ambiguity for multi-positional cases ("near reverse whirl") |
| **Inline +0** | Positional tokens render as `reverse(+0)` lines alongside ADD-bearing components | Most complete representation | Visually noisy; may confuse "+0" vs "+1" reading |

**Recommendation:** **Context caption** option. Honors the positional information without adding +0 lines that risk reading as ADD-bearing.

D6 finalizes the rendering choice.

### Multi-positional compounds

Compounds like `near reverse whirl` carry two positional markers. The caption form handles this cleanly:

```
Context: near, reverse
xbody(+1) + dex(+1) + stall(+1) = 3 ADD
```

### Same-side / opposite-side handling

Body-side markers (`same-side`, `opposite-side`) are mechanically informative but ADD-neutral. Same treatment as reverse/far/near — context caption.

---

## Section 6 — Hidden-accounting inheritance diagrams

The clearest pedagogical wins come from making the **inheritance chains** visible. Three diagrams illustrate the highest-density cases.

### Diagram 1 — The walking family

```
butterfly
  └─ dex(+1)
  └─ xbody(+1)
  └─ stall(+1)
  = 3 ADD

ripwalk = stepping + butterfly
  └─ set(+1)            ← from stepping
  └─ dex(+1)            ← from butterfly
  └─ xbody(+1)          ← from butterfly
  └─ stall(+1)          ← from butterfly
  = 4 ADD

dimwalk = pixie + butterfly
  └─ set(+1)            ← from pixie
  └─ dex(+1)            ← from butterfly
  └─ xbody(+1)          ← from butterfly
  └─ stall(+1)          ← from butterfly
  = 4 ADD
```

**Educational density:** ripwalk and dimwalk are accounting-identical. Their structural chains differ (stepping vs pixie). This pairing teaches the **modifier-set-collapse** rule cleanly.

### Diagram 2 — The osis → torque → mobius compression cascade

```
osis
  └─ mirage-dex(+1)
  └─ xbody(+1)
  └─ stall(+1)
  = 3 ADD

torque = osis + spin
  └─ mirage-dex(+1)     ← from osis
  └─ xbody(+1)          ← from osis
  └─ stall(+1)          ← from osis
  └─ spin(+1)           ← added by torque-as-compound
  = 4 ADD

mobius ≡ gyro torque
  └─ spin(+1)           ← from gyro (this is the visible spin)
  └─ mirage-dex(+1)     ← inherited from torque (via osis)
  └─ xbody(+1)          ← inherited from torque (via osis)
  └─ stall(+1)          ← inherited from torque (via osis)
  └─ spin(+1)           ← inherited from torque (the hidden spin)
  = 5 ADD
```

**Educational density:** the double-spin in mobius becomes provable rather than memorized. This diagram is the marquee teaching moment of the entire accounting layer.

### Diagram 3 — The whirl / mirage / illusion / butterfly atom cluster

```
whirl       = xbody + dex + stall              = 3 ADD
butterfly   = dex + xbody + stall              = 3 ADD   [order distinct]
osis        = mirage-dex + xbody + stall       = 3 ADD
illusion    = dex + spin + stall               = 3 ADD

Shared structure:
  • all four atoms have 3 ADD
  • all four involve dex-family + one body-tier component + stall
  • the body-tier component varies:
      whirl     → xbody
      butterfly → xbody (with dex-first ordering)
      osis      → xbody (with mirage-flavored dex)
      illusion  → spin (no body-crossing)
```

**Educational density:** the cluster diagram reveals that the four 3-ADD atoms share a structural pattern. Once learners see this, they can predict the ADD of unfamiliar 3-ADD atoms by spotting "dex + one-body-component + stall" structures.

---

## Section 7 — Compressed-vs-expanded examples

Three pairings to illustrate the compact-stays-primary contract:

### Pairing A — atom-only

```
Compact:    butterfly
Expanded:   dex(+1) + xbody(+1) + stall(+1) = 3 ADD
```

The expanded form adds clarity for the curious; the compact form remains the canonical reference.

### Pairing B — single-modifier compound

```
Compact:    gyro torque
Expanded:   spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1) = 5 ADD
            (≡ mobius)
```

The expanded form reveals the double-spin that the compact form hides. The structural equivalence to mobius is mentioned in passing but not re-rendered.

### Pairing C — Wave-2 suppression

```
Compact:    miraging far symposium butterfly
Expanded:   ⊘ SUPPRESSED — symposium internals doctrine-unresolved
```

The trick page renders compact notation + editorial ADD chip + normal layout. No derivation panel. No "pending" copy on the page (per Decision 2).

---

## Section 8 — Educational value density observations

### Density rule observed

Educational value of a derivation rises with **hidden-component count**:

| Hidden components | Educational value |
|---|---|
| 0 (atom-only ADD = 1) | None — render in compact-mode-only |
| 1 (atom-only ADD = 2, e.g. atw) | Low — single hidden component revealed |
| 2 (atom-only ADD = 3, e.g. whirl) | Mid — pattern starts to emerge |
| 3+ (atom-only ADD ≥ 3 OR compound, e.g. torque, mobius) | **High** — multiple hidden components surfaced |
| 4+ with inheritance chain visible (mobius) | **Highest** — full compositional explanation |

### Implication for prototype scoping

The Phase-1 prototype should prioritize tricks with **3+ hidden components**. This maximizes ROI per implementation hour. Approximate candidate list:

- whirl, swirl, butterfly, osis, illusion, torque, mobius, atw, legover, mirage
- walking-family compounds: ripwalk, dimwalk, sidewalk, dada-curve, matador, phoenix, nuclear-butterfly
- gyro-family: gyro-whirl, gyro-osis, gyro-torque (= mobius), gyro-illusion
- mirage-family: miraging-butterfly, miraging-osis (= torque)

Total resolved-cohort estimate: **20-30 tricks** — well within the Phase-1 success-criterion (≥ 20 tricks per concept doc).

---

## Section 9 — Decomposition-depth recommendations

### Phase 1 — surface one inheritance layer

The Phase-1 panel should show **components, not nested decompositions**. Example for mobius:

```
mobius = 5 ADD
  spin(+1) + mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1)
```

NOT:

```
mobius = gyro torque
  gyro(+1) [= spin(+1)]
  torque(+4) [= mirage-dex(+1) + xbody(+1) + stall(+1) + spin(+1)]
```

The nested form leaks structural-chain detail (`mobius = gyro torque`) into the accounting layer. That's the operator board's job, not the derivation panel's.

### Phase 2 — optionally surface one structural-chain hint

In Phase 2 (glossary integration), the panel may add **one line** of structural-chain context:

```
mobius = 5 ADD                                 ← compact
  spin(+1) + mirage-dex(+1) + xbody(+1)        ← components
  + stall(+1) + spin(+1)
  ≡ gyro torque                                ← structural-chain hint (one line)
```

This is a Phase-2 enhancement, not a Phase-1 requirement.

### Forbidden depths

Do not nest beyond one structural-chain hint. Do not render parser AST trees. Do not surface the full equivalence chain (`mobius ≡ gyro torque ≡ miraging osis + spin ≡ ...`) on the trick page — that lives on the operator board / equivalence registry.

---

## Final report — deliverable #3

### Counts

| Metric | Count |
|---|---|
| Total expansion rows authored | **30** |
| Section 1 — Atoms | 12 |
| Section 2 — Compound atoms | 6 (2 resolved + 4 unresolved) |
| Section 3 — Required cases | 15 (some overlap with Sections 1-2) |
| Hidden-accounting inheritance diagrams | 3 |
| Compressed-vs-expanded pairings | 3 |

### Renderable vs suppressed (Phase 1)

| Class | Count | Examples |
|---|---|---|
| A — renderable | **15** | whirl, butterfly, osis, illusion, mirage, atw, legover, swirl, torque, mobius, ripwalk, dimwalk, (plus walking-family/gyro-family extensions) |
| B — compact-mode-only | **3** | toe-stall, clipper-stall, pickup |
| C — renderable_with_context_note | **2** | reverse-whirl, reverse-atw |
| D — suppress_in_phase1 | **10** | orbit, baroque, paradox, symposium, atomsmasher, blurry-whirl, eggbeater, smear, drifter-compounds (all), reverse-orbit |

Phase-1 surface: **A + C = 17 tricks render the derivation panel**. With walking-family + gyro-family extensions (not enumerated here), this grows to the 20-30 trick prototype cohort.

### Contextual rows

**1 token cluster** — drifter (multiple compounds). Suppressed in Phase 1; manifestation table needed before Phase 2.

### Unresolved rows

**9 tokens / clusters** — orbit, baroque, paradox, symposium, atomsmasher, blurry-whirl, eggbeater (multiplier convention), smear (insufficient data), reverse-orbit (orbit-dependent).

### Parser-risk clusters

| Cluster | Risk |
|---|---|
| mirage-dex splitting | Parser may decompose `mirage-dex` as `mirage + dex` (two units, total +2 instead of +1). For osis, this means parser total 4 vs curator-map total 3. **This is the cleanest parser-as-check diagnostic** — disagreement-by-design. |
| Component-order normalization | Parser may sort components alphabetically; curator-map locks per-atom order. Diagnostic only on total-comparison, so order divergence is harmless. |
| Operator-as-component naming | Parser may name the set-component as "stepping" or "pixie" instead of "set". Total-only check tolerates. |
| Wave-2 silent computation | Parser will compute totals for paradox/symposium/ducking compounds. The accounting layer must ignore parser output for any token flagged `wave2_sensitive=true`. Gate enforced by inventory CSV. |

### Educational-density observations

1. **Hidden-component count predicts educational value.** Atoms with 3+ hidden components (whirl, butterfly, osis, illusion, torque, mobius) deliver the strongest "aha" moments. Single-component atoms deliver nothing.

2. **Inheritance chains teach more than atom expansions.** Ripwalk/dimwalk side-by-side teaches the modifier-set-collapse rule. Mobius teaches the inherited-spin compounding rule. These cross-trick comparisons are higher-value than any single trick's expansion.

3. **Wave-2 suppression footprint is bounded.** Despite 9 unresolved clusters, the renderable cohort is comfortably ≥ 17 in Phase 1 and grows with walking/gyro family extensions. The accounting layer is not gated on Wave-2 resolution.

4. **The double-spin in mobius is the marquee moment.** This single diagram justifies the entire feature. Recommend D5 worked examples lead with mobius and D6 UI mockups treat the double-spin as a styling priority (e.g., subtle row emphasis on the two spin lines).

### Future prototype recommendations

1. **Start with 4-5 high-density tricks** for the curator-map content module — butterfly, whirl, osis, torque, mobius. These cover the foundational atom + compound vocabulary.
2. **Add walking-family next** — ripwalk, dimwalk, sidewalk, dada-curve, matador, phoenix, nuclear-butterfly. Single modifier; clean accounting.
3. **Add gyro-family third** — gyro-whirl, gyro-osis, gyro-illusion. Same +1-spin pattern; tests pattern consistency.
4. **Add reverse-variants fourth** — reverse-whirl, reverse-atw. Validates the context-caption render policy.
5. **Hold drifter and Wave-2 tricks until curator clears the doctrine queue.** Suppress cleanly; revisit per cluster.

### Recommended expansion-depth limits

| Surface | Max depth | Rationale |
|---|---|---|
| Derivation panel (Phase 1) | 1 layer (components only) | Compact stays primary |
| Derivation panel (Phase 2) | 1 layer + 1 structural-chain hint | Optional Phase-2 enhancement |
| Glossary §3/§7 integration (Phase 2) | 2 layers (components + inheritance diagram) | Teaching context warrants nested rendering |
| Operator board | Unchanged | Already its own surface; do not encroach |
| Equivalence registry | Unchanged | Already its own surface; do not encroach |
| `/freestyle/add-analysis` | 1 layer + provenance prose | Existing surface; extend without restructuring |

---

## Cross-references

- `executable_add_accounting_concept.md` — framing, three locked decisions
- `add_bearing_symbol_inventory.csv` — token inventory
- `add_bearing_symbol_inventory_notes.md` — D2 final report
- `wave2_sensitive_accounting_cases.md` (next deliverable) — formal register of unresolved cases
- [[project_freestyle_core_atoms]] — 12-atom registry
- [[feedback_parser_editorial_separation]] — precedence rule
- [[feedback_trick_termination_rule]] — termination convention
- [[project_freestyle_state]] — current freestyle subsystem state

## Next deliverable

`wave2_sensitive_accounting_cases.md` — formal register of doctrine-unresolved tricks/compounds, with suppression rationale per case and curator decision-readiness assessment.
