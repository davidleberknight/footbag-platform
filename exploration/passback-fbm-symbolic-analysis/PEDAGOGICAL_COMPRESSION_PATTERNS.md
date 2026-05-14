# Pedagogical Compression Patterns

The user-facing counterweight to frequency analysis: NOT what compositions recur, but WHEN the community prefers compressed forms over expanded ones, when expansion remains useful, and when deeper decomposition becomes cognitively noisy.

Frequency is evidence, not pedagogy. A composition that recurs frequently might be pedagogically counterproductive in compressed form. This document is the use-case axis the recurrence inventory cannot supply.

## Three regimes

### Regime A -- compression wins

Cases where the folk-name is more useful than the technical decomposition:

| Folk name | Technical decomposition | Why compression wins |
|---|---|---|
| ATW | toe>ss leggy in dex>ss toe | The operational form is a parser artifact; ATW is the meaningful pedagogical unit. Compression IS the canonical form. |
| Blender | Whirling Osis | Both forms are short. Blender names a recognizable execution shape; Whirling Osis names its components. Both have a role; Blender wins for naming. |
| Drifter | Miraging Clipper | Drifter names the trick; Miraging Clipper names the composition. Use Drifter when teaching the trick, Miraging Clipper when teaching the operator grammar. |
| Ripwalk | Stepping Far Butterfly | Three-token decomposition for a single recognizable trick. The folk name carries more meaning than the parts. |
| Barfly | Clipper far Double Down | Same: the operational stack is mechanically derivable but the folk name is the pedagogical handle. |
| Atomsmasher | Atomic far Mirage | Two-token decomposition where Atomsmasher is the canonical alias and the constituent stack is the educational reading. |

Common thread: when the folk name is a recognized canonical trick or has standalone identity in the community, compression is the preferred pedagogical surface. The expanded form is reference material, not vocabulary.

### Regime B -- expansion remains useful

Cases where the decomposition is the better surface, and the folk name (if any) is auxiliary:

| Folk name | Technical decomposition | Why expansion wins |
|---|---|---|
| Sailing | Pixie Atomic | The compressed form `Sailing` adds nothing the constituent stack does not. Pixie + Atomic is two well-known operators; the compression is orthographic shortcut at best. |
| Frantic | Pixie Quantum | Same shape as Sailing. Naming this stack `Frantic` does not teach anything new. |
| Bling Blang | Whirling Reverse Whirl | The expanded form teaches the recursive whirling-on-reverse-direction concept. The folk name is opaque. |
| Cascade | Ducking Double Legover | Three operators stacked left-to-right. Reading is mechanical. The folk name is mnemonic only. |

Common thread: when the decomposition is short (2-3 operators) and every operator is locked-canonical, the expanded form teaches more than the compression. The folk name belongs in the alias layer, NOT as the primary surface.

### Regime C -- deeper decomposition becomes cognitively noisy

Cases where the technical decomposition is so deep that neither the expanded nor the compressed form is pedagogically friendly without scaffolding:

| Trick | Technical decomposition | Cognitive load |
|---|---|---|
| Anonymous | Spinning far Miraging Symp. Miraging Refraction | 5 modifier tokens. Reader must parse positional, two miragings, symp, and resolve Refraction as a base. |
| Big Applesauce | Spinning far Miraging Symp. Torque | 4-modifier stack. Same problem at slightly lower depth. |
| Blurry Chainsaw Massacre | Blurry Illusioning Paradox Symposium Eggbeater | 4 modifiers + base. The compression doesn't help (the folk name is itself a sentence). |
| Bill & Ted's | Flailing ss Symposium Double Legover | Five tokens including Q4-blocked Flailing. Composition is technically clean but pedagogically requires understanding all five. |
| Cyborg | Stepping Ducking Far Butterfly Swirl | 5 modifiers on a Swirl base. |

Common thread: depth >= 4 modifiers is the cliff. Above this, neither form is good without UI scaffolding (token highlighting, related-trick links, modifier definitions on hover). The PassBack glossary's Symposium-modifier and Backside-modifier definitions are the kind of scaffolding that makes Regime C tricks readable; without that scaffolding, the reader must hold 4+ operator definitions in working memory.

## Where the community defers to compression

Cross-referencing the corpus against PassBack glossary entries reveals which folk names the community has standardized on (high-recurrence + clear definition):

- **Canonical compressions that work**: Blender, Drifter, ATW, Atomsmasher, Ripwalk, Barfly, Bullwhip, Pogo, Eggbeater, Legover, Pickup. These are tricks whose folk names are MORE memorable than the components.
- **Canonical compressions where the expanded form is preferred**: Whirling and Miraging are operators (compression-promoted to first-class), but their use is grammatical. Same for Blurry per pt11.
- **FM-side compressions that may not survive evaluation**: Sailing, Frantic, Slaying, Phasing. Recurrent in FM, but the constituent-stack is already self-explanatory. Community drift candidates.

## Where the community resists compression

- **Bare-base canonical names**: Butterfly, Mirage, Whirl, Osis, Torque, Eggbeater. These are atoms in the curator's 12-atom registry ([[project_freestyle_core_atoms]]); they ARE the primitive level. Compression below this would be over-decomposition.
- **Operator-grammar terms**: Stepping, Pixie, Atomic, Symposium. Used as operators, not as compressed trick names. Compressing these into folk names would lose the grammatical role.

## Pedagogical implications for UI

The Phase A frequency data alone would suggest surfacing the top operators (Pixie 66, Symposium 57, Ducking 56). The pedagogical analysis suggests a different surface:

1. **Primary level (always surfaced)**: the 12 core atoms, the locked-status operators, the canonical compressions that name recognizable tricks (Blender, Drifter, etc.).
2. **Secondary level (revealed on request)**: the operator decomposition for any canonical compression. Teaches the grammar while preserving the readable surface.
3. **Tertiary level (operator-grammar deep dive)**: recursive compositions, FM Sets-tab definitions, intermediate operators. For learners explicitly building operator fluency.

The frequency-driven surface and the pedagogically-driven surface DO NOT coincide. FM-vocab operators (Fairy, Gyro, Barraging) recur frequently in raw counts but should NOT appear at the primary level because their canonical status is unresolved. Canonical compressions (Blender, Drifter, Atomsmasher) recur less frequently as operators (they ARE the names) but belong at the primary level.

## Where this connects to ongoing work

- The Glossary V5 architecture's `Modifiers-as-Operators` framework (per [[project_glossary_v5_synthesis]]) treats this exact axis: modifiers teach by being applied to bases. The pedagogically-preferred surface IS the operator-as-function framing.
- The 11 perfectly-coherent IFPA families (per SG-2 analysis) are precisely the families where canonical compressions cluster cleanly. The Whirl family, Butterfly family, Drifter family all have well-named canonical entries that subsume their compositional structure.
- The current UX3 surface treats canonical compressions as the primary readable form; the operator decomposition is rendered as scaffolding ("composed of:" tokens). This is the right shape per this analysis.

## What this document is NOT

- It is NOT a list of compressions to promote or demote. The 6-criterion NF-2A scoring in `NF2A_CANDIDATE_QUEUE.csv` is the authoritative gate.
- It is NOT a re-derivation of the V5 glossary's modifier framework. It is a corpus-grounded check that the framework matches observed pedagogical preference.
- It is NOT a UX spec. Existing UX3 phases (per FRESTYLE-NOTATION-GRAMMAR exploration) own the surface decisions; this provides the corpus signal those decisions should be tested against.
