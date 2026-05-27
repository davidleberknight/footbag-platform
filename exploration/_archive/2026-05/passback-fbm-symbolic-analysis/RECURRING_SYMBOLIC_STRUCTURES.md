# Recurring Symbolic Structures -- worked examples

One representative example per major motif class. Each example shows the technical_name string, its tokenization shape, and what the structure reveals about the grammar.

## Example 1 -- Pure single-modifier (motif: `locked → base_or_unknown`)

**Atomsmasher**: `Atomic Mirage`

```
[Atomic]    [Mirage]
 locked     base
 set-mod    canonical base
 pt10 ruled
```

Most common structure in the corpus (191 rows). Single locked modifier applied to a canonical base. Pedagogical wins: the folk name compresses an already-short technical name into one memorable token. The decomposition is immediate; the reader can verify the ADD math by inspection.

## Example 2 -- Multi-modifier stack (motif: `locked → quantifier → base_or_unknown`)

**Cascade**: `Ducking Double Legover`

```
[Ducking]   [Double]      [Legover]
 locked     quantifier    base
 +1 ADD     +1 ADD        canonical base
```

24 rows fit this motif. Two-modifier stack with quantifier in second slot. ADD math is additive: Legover (base) + Double (+1) + Ducking (+1) = canonical 3-ADD. Readable left-to-right.

## Example 3 -- Recursive set (motif: `pending_red → quantifier → base_or_unknown` with recursion through Sets-tab)

**Fracture**: `Sailing ss Double Legover`

Surface tokenization: `[Sailing] [ss] [Double] [Legover]`

Recursive expansion via FM Sets-tab:
```
Sailing = Pixie Atomic
→ Pixie Atomic ss Double Legover
→ Pixie Atomic same-side Double Legover (per SS=+0)
```

Reveals two-level recursion. Pedagogically, the recursive form is harder to read than the original. The compression `Sailing` for `Pixie Atomic` is the question: does the community use the compressed form because it is shorter or because it is meaningfully different from the expanded form? See PEDAGOGICAL_COMPRESSION_PATTERNS.

## Example 4 -- Three-deep recursion (motif: rare but representative)

**Slaying** (FM Sets-tab definition, not a trick in the corpus): `Symp Sailing`

Recursive expansion:
```
Slaying = Symp Sailing
        = Symp Pixie Atomic
        = Symposium + Pixie + Atomic
```

Depth 3. Every intermediate operator is decomposed by another Sets-tab entry. The end state is three locked operators. Demonstrates that recursive chains DO terminate cleanly when every link is well-defined; the legitimacy question is whether the intermediate folk-names (Sailing, Slaying) are pedagogically useful or are dead-letter aliases.

## Example 5 -- Temporal-flagged composition (motif: `temporal → ...`)

**Dada Curve**: `(downtime) Miraging far Symp. Butterfly`

```
[(downtime)]  [Miraging]  [far]        [Symp.]    [Butterfly]
 temporal     locked      pending_red  locked     base
 ADD-neutral  +1 ADD      +0           +1         canonical base
```

Temporal flag at front sets the timing window (when the bag is in downward arc). The remaining stack is two-modifier with positional infix. Total: Butterfly (base) + Symposium (+1) + Miraging (+1) + far (+0) + downtime (+0) = 5-ADD canonical. The temporal flag is structural framing, not an operator carrying weight.

## Example 6 -- FM-vocab-leading compression (motif: `q4_blocked → base_or_unknown`)

**Blaze**: `Blazing Mirage`

```
[Blazing]   [Mirage]
 q4_blocked base
 FM-vocab   canonical base
 no IFPA    (additive math unknown)
 add_bonus
```

62 rows fit this motif. Structurally identical to Example 1 but the leading modifier carries no IFPA ruling. The composition LOOKS like a clean operator-on-base shape; the legitimacy question is whether `Blazing` is a meaningful operator or a community-attached folk label. Frequency alone (29 rows for Fairy, 28 for Gyro) does not answer this.

## Example 7 -- Polysemy (motif: any path involving `slicing`)

**Slicing** (FM Sets-tab): TWO definitions

```
Slicing = Gyro Rev. Swirling          (reading A)
Slicing = Blurry Quasi                 (reading B)
```

Same surface form, two distinct decompositions. Not a recursion problem; a polysemy problem. IFPA cannot adopt Slicing as an alias to either reading without inheriting FM's internal data conflict. Documented as ONTOLOGY_CONFLICTS P1.

## Example 8 -- Layer leak (motif: `surface → operational → ...`)

**ATW**: `toe>ss leggy in dex>ss toe`

```
[toe]    [>]     [ss]         [leggy]      [in]         [dex]        [>]     [ss]         [toe]
surface  op-arrow positional  operational  operational  operational  op-arrow positional  surface
```

This is operational notation, not semantic decomposition. The technical_name field carries the wrong layer. Parser-coverage artifact, not grammar evidence. 10 rows in the corpus exhibit this; treat as data-quality fix needed in PassBack source files.

## Example 9 -- Direction-variant pair (motif: `locked → pending_red → base_or_unknown`)

**Drifter** (forward) vs **Grifter** (reverse-direction):

```
Drifter:   Miraging Clipper       → IFPA canonical row
Grifter:   Reverse Drifter        → reverse-drifter (IFPA canonical row)
```

Two folk names that index opposite-direction variants of the same composition. IFPA already represents these as separate canonical rows. The reverse-drifter row + the `Reverse` directional operator allow the folk-name `Grifter` to be promoted as an alias without changing canonical structure.

This is the cleanest alias-promotion shape in the entire corpus: surface conflict zero, decomposition known, Red dependency none. (Per memory `project_freestyle_state`: drifter/reverse-drifter is one of two canonical direction-variant pairs.)

## Example 10 -- Recursive-on-recursive (motif: deepest observation)

**Riffing** (FM Sets-tab): `Symp Blurriest`

```
Riffing = Symp Blurriest
        = Symp + Blurry + (Blurry?)    (Blurriest = "extreme Blurry"; unclear shape)
        = Symp + Stepping + Paradox + (??)
```

Decomposition cascades into pt12-open territory. Cannot promote. Documented as EC2 in EQUIVALENCE_CHAIN_CANDIDATES. The interesting structural observation: recursive chains can hit unresolved roots, and the chain is then defined only up to the unresolved point.

## What these examples illustrate

- Most common patterns (Examples 1, 2, 5) are pedagogically transparent: token sequence reads left-to-right and ADD math is additive.
- Recursive patterns (Examples 3, 4) terminate cleanly when every link is canonical, but the question of whether the compressed form is pedagogically useful is separate from whether it is structurally definable.
- FM-vocab compressions (Example 6) look identical to canonical patterns but rest on unresolved operators. Structural cleanliness is not the same as semantic legitimacy.
- Layer leaks (Example 8) and polysemy (Example 7) are data-quality / curation issues that this pass surfaces but does not resolve.
- Direction-variant pairs (Example 9) are the only motif class where alias promotion is unambiguously safe.
