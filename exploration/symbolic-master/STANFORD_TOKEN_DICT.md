# Part C — Stanford Shorthand: Token Dictionary, Grammar, Equivalence Map

**Source:** Ben Lynn (blynn@cs.stanford.edu), Stanford. Adapted from Job's notation; one-character compressions.
**Archive:** `exploration/stanford/stanford-1.txt` (notation spec) + `stanford-2.txt` (994-row move list).

This is a research dictionary — **not** a parser or production renderer. The platform's canonical-bracket convention (`[BRACKETS]`) remains the structural-accounting authority; the FM-parens convention (`(parens)`) remains the dex-count community layer; Stanford shorthand is a **third, parallel** symbolic representation.

## Token taxonomy

### Set / entry-surface tokens (single uppercase letter)

| Token | Stanford meaning | Canonical (project) equivalent |
|:---:|---|---|
| `Z` | toe set (visual: leg silhouette in toe-stall) | toe-set / `TOE` |
| `L` | inside set (visual: cranked leg) | inside-set / `LSIDE` |
| `X` | clipper set (visual: cross-body) | clipper-set / `CLIP` |
| `D` | dragon set | dragon entry (no direct canonical) |
| `U` | pendulum | `pendulum` |
| `R` | rake | `rake` |
| `S` | sole | `sole-stall` |
| `F` | frigid osis | `frigid-osis` (folk variant; not canonical yet) |
| `H` | heel | `heel-stall` |
| `V` | pinch | (no direct canonical; pinch family folk-named) |
| `K` | knee | `knee-stall` |
| `*` | any set | wildcard |
| `xZ` | crossbody toe | cross-body-toe (composite) |
| `xR` | crossbody rake | |
| `xS` | flapper | |
| `xU` | crossbody pendulum | |

### Dex tokens (single digit)

| Token | Stanford meaning | Canonical equivalent |
|:---:|---|---|
| `1` | in-out dex (visual: `1` resembles `I`) | `[DEX]` with `IN` direction |
| `0` | out-in dex (visual: `0` resembles `O`) | `[DEX]` with `OUT` direction |
| `6` | back dex (swirl); foot traces a `6` | swirl-form `[DEX]` |
| `9` | front dex (reverse swirl); inverted `6` | reverse-swirl `[DEX]` |

### Side operators (signed)

| Token | Stanford meaning | Canonical equivalent |
|:---:|---|---|
| `+` | same side as plant leg | `SAME` |
| `-` | opposite side from plant leg | `OP` |

### Spin operators (slash-shaped)

| Token | Stanford meaning | Canonical equivalent |
|:---:|---|---|
| `/` | forward spin | `(forward) SPIN [BOD]` |
| `\` | backward spin | `(back) SPIN [BOD]` |
| `\\` | double backward spin (`X\\.` = Sonic) | implicit two-spin compound |

### Phase / state operators

| Token | Stanford meaning | Canonical equivalent |
|:---:|---|---|
| `.` | footbag at peak | (implicit in canonical-bracket) |
| `_` | plant (when used as terminal) | (implicit; no canonical operator) |
| `!` | "no plant while" / jump | `(no plant while)` / `[BOD]` set-modifier |
| `^` | duck | `DUCK [BOD]` |
| `&` | dive | `DIVE [BOD]` |

### Composition operators

| Token | Stanford meaning | Canonical equivalent |
|:---:|---|---|
| `|` | "or" (alternative) | (no direct canonical) |
| `k` | kick (vs. delay): `Lk` = inside kick | `[BOD]` body-kick |
| `w` | (experimental) whirl vs reverse-whirl: `w1` / `w0` | canonical whirl |

### Special / proposed (unstable)

The Stanford spec explicitly flags these as "still being worked out":
- Distinguishing kick from delay (proposed `k` suffix).
- Hopover marker (no symbol yet).
- Rooted sets (no symbol yet).
- Whirling vs. stepping (proposed `w1` / `w0`).

These rows pass through the master CSV but get flagged in `unsupported_tokens` once the curator decides whether to lock or revise.

## Compositional grammar

A Stanford line reads as a sequence of **events**, separated implicitly. Each event is either:

1. A **set entry**: optional cross-body prefix (`x`) + set letter + optional `+` or `-` side signing + optional dex digit.
2. A **dex event**: `+` or `-` side + dex digit (`0` / `1` / `6` / `9`).
3. A **body event**: `^` (duck), `&` (dive), `/` or `\` (spin), `!` (no-plant).
4. A **peak marker**: `.` separates major phases (set / catch).
5. A **terminal**: trailing set letter (or `_` plant).

Example trace, line-by-line:

```
Z . + 1 + Z
  │   │   │
  │   │   └─ catch surface (toe)
  │   └───── in-out dex with same-side signing
  └───────── peak between set and main movement
```

→ "Toe set, peak, same in-out dex, toe catch" → **Around the World (ATW)**.

A second example (compound):
```
X . - 1 \ . - X
  │   │  │ │   │
  │   │  │ │   └─ clipper catch
  │   │  │ └───── peak (mid-trick)
  │   │  └─────── backward spin
  │   └────────── opp-side in-out dex
  └────────────── peak after set
```

→ "Clipper set, peak, op-side in-out dex with back-spin, peak, op-side clipper catch" — a representative gyro-clipper compound.

## Family-generation patterns (excerpts from `stanford-1.txt`)

Ben Lynn's spec exposes a powerful pattern: each `<set> + <dex>` combination names a community-recognized trick. Many community-named tricks cluster around 1-2 dex events:

| Stanford pattern | Stanford name | Notes |
|---|---|---|
| `Z+0.` | Fairy | toe + same-out dex |
| `Z+1.` | Pixie | toe + same-in dex |
| `Z-0.` | Atomic / Tapping | toe + op-out dex |
| `Z-1.` | Quantum / Slapping | toe + op-in dex |
| `X+0.` | Nuclear / Slamming | clipper + same-out dex |
| `X-0.` | Bubba / Hopping / Scattered / Shattered | (cluster of names → same shape) |
| `X+1.` | Quasi | clipper + same-in dex |
| `X-1.` | Stepping / Blurry / Whirling / Blazing | (cluster of names → same shape) |
| `Z+0-0.` | Fusing / Falling | toe + same-out + op-out — double-dex on toe set |
| `X-1+1.` | High Stepping / Barraging / Furious | clipper + op-in dex + same-in dex (cluster of names) |

These multi-name clusters are the **structural-symmetry** insights: many community-named tricks are the same shape under different folk-name traditions. See `FAMILY_GENERATION_INSIGHTS.md` for the implications.

## Equivalence map: Stanford ↔ canonical-bracket (selected)

Cross-walk samples for the 12 core atoms + a few iconic compounds.

| Stanford | Canonical-bracket | Trick |
|---|---|---|
| `Z.+1+Z` | `TOE > SAME IN [DEX] > SAME TOE [DEL]` | around-the-world |
| `Z.+0+Z` | `TOE > SAME OUT [DEX] > SAME TOE [DEL]` | reverse ATW |
| `*.-1+L` | `[set] > OP IN [DEX] > SAME LSIDE [DEL]` | guay (pickup inside delay) |
| `*.-0-Z` | `[set] > OP OUT [DEX] > OP TOE [DEL]` | illusion |
| `*.-1-Z` | `[set] > OP IN [DEX] > OP TOE [DEL]` | mirage |
| `*.+0+Z` | `[set] > SAME OUT [DEX] > SAME TOE [DEL]` | legover |
| `*.+1+Z` | `[set] > SAME IN [DEX] > SAME TOE [DEL]` | pickup |
| `Z+0.-Z` | `TOE > SAME OUT [DEX] > OP TOE [DEL]` | fairy |
| `Z+1.-Z` (approx) | `TOE > SAME IN [DEX] > OP TOE [DEL]` | pixie |
| `Z.+0+0+X` | `TOE > SAME OUT [DEX] > SAME OUT [DEX] > SAME CLIP [DEL]` | ripwalk (Stanford: `Z.+0-0+X` ≈ `X-1.-0-X` per `stanford-1.txt` examples) |
| `U` | `SET > TOE SWING [DEL]` | pendulum |
| `R` | `SET > SWING TOE [DEL]` | rake |
| `*.+0+Z+0+Z` | `TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]` | DATW |
| `*.+0+Z-0+Z` (approx) | `SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]` | DLO |

**Important:** the equivalence map is approximate. Stanford uses positional + sign operators; canonical-bracket uses surface + sign + flag tokens. A precise round-trip parser would need:

1. Set-letter → entry-surface mapping (Z → TOE).
2. Sign + dex-digit → `SAME/OP` + `IN/OUT/SWIRL/REV-SWIRL` + `[DEX]`.
3. Spin / duck / dive → `[BOD]` flag attached to nearest event.
4. Cross-body prefix `x` → `[XBD]` flag on the catch.
5. Terminal-set token → final surface in canonical form.

Encoding the round-trip is a separate slice (NOT in this one).

## Notes & open issues (Ben Lynn's own)

Per `stanford-1.txt` §"Notes":

- Kick-vs-delay distinction tentative (`Lk` proposed).
- Hopover has no symbol.
- `_` plant marker not always required.
- `!` (no-plant) ambiguity in some contexts.
- Rooted sets not yet covered.
- Whirling vs stepping ambiguity (proposed `w1` / `w0`).

The platform's master CSV preserves the shorthand verbatim — these open issues become per-row `unsupported_tokens` annotations once the curator audits.
