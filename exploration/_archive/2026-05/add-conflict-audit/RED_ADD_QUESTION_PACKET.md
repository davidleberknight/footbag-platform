# Red ADD-Conflict Packet

Irreducible ADD questions surfaced by the audit. Each is structurally distinct, not arithmetic noise. No question here is auto-resolvable by existing operator policy.

Scope discipline: items resolvable by SS=+0 (pt12 Red), pt11 Blur ruling, pt10 atomic/nuclear, pt6 Fury, or pt8 Rooted are NOT included. Items blocked on the Q4 batch packet (Fairy / Gyro / Blazing / Surging / Railing / Flailing / Splicing / Surfing / Neutron / Bubba / etc.) are NOT included -- they belong in the Q4 packet, not here.

## Question 1 -- Blurry on rotational bases (pt12 OPEN)

**Three IFPA-internal rows where stated and formula disagree:**

| trick | stated | flat formula | gap |
|---|---:|---|---:|
| blurry-whirl | 5 | blurry(+1) + whirl(3) = 4 | +1 |
| blurry-torque | 6 | blurry(+1) + torque(4) = 5 | +1 |
| barraging-osis | 5 | barraging(+1) + osis(3) = 4 | +1 |

pt11 ruled `blurry = +1 flat`. pt12 deferred the question of whether rotational bases (whirl, torque) trigger a rotational bonus.

**Red question:** does `blurry` (and by extension `barraging`) carry +2 on rotational bases (whirl, torque, swirl, drifter, blender), parallel to `atomic`'s pt10 ruling? If yes:

- blurry-whirl: blurry(+2 rot) + whirl(3) = 5 ✓
- blurry-torque: blurry(+2 rot) + torque(4) = 6 ✓
- barraging-osis: barraging(+2 rot)? but osis is non-rotational per IFPA convention; this case doesn't fit

The barraging-osis case is a related but separate question: barraging may carry +2 on certain bases (rotational? compound?) -- the +1 gap pattern matches but the rotational-base rule doesn't.

**Three options for the Red ruling:**

A. **Rotational +2 universal**: blurry, barraging, miraging, whirling all gain +1 on rotational bases (parallel to atomic pt10). Closes all three rows.

B. **Per-modifier-per-base**: each modifier-base pair gets its own ruling. blurry-whirl and blurry-torque close as +2 (rotational); barraging-osis needs a separate adjudication on whether osis counts as compound-rotational.

C. **Stated values are correct; formula is incomplete**: the three rows are NOT formula failures -- they hide an implicit operator (e.g., an unmarked paradox or rotational seasoning). Investigation needed before formal closure.

The pt12 queue file mentions Food Processor's blurry+blender math gap (DB shows food-processor=6 stated, base=blender=4, so blurry(+1)+blender(4)=5 but stated 6; same +1 pattern). Resolution applies to Food Processor too.

## Question 2 -- Witchdoctor decomposition (pt12 noted, not yet closed)

**Witchdoctor**: stated=4, base=mirage(2), DB formula self-atoms.

Reported decomposition (per recon): Atomic Symposium Mirage.

| Reading | Formula | Result |
|---|---|---:|
| atomic(+1 non-rot) + symposium(+1) + mirage(2) | flat-additive on non-rotational | 4 ✓ |
| atomic(+2 rot) + symposium(+1) + mirage(2) | atomic-as-rotational on what's normally non-rot | 5 |

**Red question:** in Witchdoctor's reading, is atomic taken as +1 non-rotational (matching stated 4) or +2 rotational (giving 5)? If +2, stated value is off by one. If +1, the case closes immediately as `agree-after-formula-decomposition`.

This is the cleanest single-question Red item in the packet. It doesn't depend on any other ruling. Resolution unblocks the Witchdoctor row from "DB self-atom shortcut" to "formally decomposed".

## Question 3 -- Atomsmasher and the atomic-set polysemy

PB cross-evidence: 11 rows including Atomsmasher, Blur, Drifter, Sumo show a structural disagreement where PB's `Atomic far X` (or `Stepping far X`, or `Nuclear far X`) produces formula = N-1 vs IFPA stated = N.

The +1 gap pattern across these 11 rows is too consistent to be coincidental.

| Trick | IFPA stated | Formula on PB notation | Gap |
|---|---:|---|---:|
| atom-smasher | 4 | atomic(+1)+mirage(2)=3 | +1 |
| blur | 4 | stepping(+1)+mirage(2)=3 | +1 |
| drifter | 3 | miraging(+1)+clipper(1)=2 | +1 |
| fury | 5 | barraging(+1)+mirage(2)=3 | +2 |
| sumo | 5 | nuclear(+2)+mirage(2)=4 | +1 |

**Reading A**: PB's `far` positional carries +1 ADD (not +0 as currently assumed by analogy to ss).

**Reading B**: There's an implicit operator in each IFPA reading that PB's decomposition omits. For Atomsmasher: atomic-set = paradox + atomic-modifier per pt10's nuclear-ish reading, so atomic-set actually gives +2 when treated as the compound it is (rather than the modifier weight).

**Reading C**: IFPA stated values include a 1-ADD "set" or "named-trick" baseline that the literal modifier formula doesn't capture.

**Red question:** which of A/B/C is the canonical interpretation? If A, OPERATOR_INVENTORY's "far ADD weight not adjudicated" gets a Red ruling and the 11 PB rows resolve. If B or C, the formula table needs structural revision and ADD_FORMULA_ASSUMPTIONS.md is revised, not just the operator table.

Note: the FM_MATH_DIVERGENCES row for Hurl/Barfry/Godzilla uses `far` with +0 weight successfully (FM-side IFPA-additive math). PB rows use `far` and produce the +1 gap. The contexts differ -- FM uses far with locked-rotational modifiers + rotational base; PB uses far with various modifiers on non-rotational bases. Reading B (implicit operator in IFPA reading) is most consistent.

## Question 4 -- Royale decomposition

**Royale**: stated=4, base=reverse-drifter (4), DB self-atoms.

The base reverse-drifter already has ADD 4. So Royale's decomposition must either:
- Be `Royale = reverse-drifter` (identity; same ADD), OR
- Add a modifier that contributes 0, OR
- Stated 4 IS the unmodified reverse-drifter value and `Royale` is a folk alias for reverse-drifter at the same ADD

**Red question:** does Royale have a distinguishing decomposition that contributes +1 (in which case stated should be 5), or is it a pure alias for reverse-drifter at 4?

If alias: Royale needs to be in `freestyle_trick_aliases` pointing to reverse-drifter. If distinct trick: needs a decomposition + the formula needs to match 4.

Low-urgency but unresolved. PassBack does not have a Royale entry to cross-check.

## Question 5 -- Quantum vs Toe Blur polysemy

**Quantum** in NF-2A reference: decomposition = `compressed atomic (toe blur)`. Carries notes about quantum-set vs quantum-modifier polysemy.

**Quantum-as-trick** in DB: adds=2 (self-atom in BASE table), is_core not set but treated as base in DB via base_trick='quantum'.

**Quantum-as-modifier** in formula table: +1 (per ADD_FORMULA_ASSUMPTIONS.md).

**Red question:** is `Quantum X` (e.g., Quantum Butterfly = Tripwalk) decomposable as quantum-modifier(+1) + X, or is Quantum itself a compound (toe + miraging) that should be expanded? The NF-2A entry's "compressed atomic (toe blur)" framing suggests a recursive structure that isn't reflected in the current formula table.

Cross-reference: `Toe Blur` would decompose as a compound itself (toe-stall + blurry on what?). Not in DB. This question is interlocked with quantum's ontological status.

## Question 6 -- Furious on non-rotational bases

Per pt6: `furious + paradox + mirage = 5`. Derives `furious = +2` on rotational mirage (because paradox makes mirage rotational? or because furious is always +2?).

FM_MATH_DIVERGENCES `Genesis` (Furious Whirl) is computed as `furious(+2 rotational) + whirl(3) = 5`. So furious is treated as +2 ON rotational bases.

**Red question:** does furious carry +1 on non-rotational bases (parallel to atomic pt10), or is furious +2 always? If always +2, the analyzer should encode it as such. If +1 on non-rotational, formula table needs the rotational-class input.

Currently no IFPA trick in DB has `furious` in its decomposition (Fury self-atoms; Genesis isn't in IFPA). So this is a forward-looking ruling: closing it unblocks future FM-vocab triage where furious appears on non-rotational bases.

## Question 7 -- Double-X policy (specific instances)

The NF-2A `double` entry carries `curatorConfirmPending=true` with the note "per-compound Red rulings supersede the generalization." The audit surfaces specific instances that need per-compound rulings:

- **Double-Fairy** (per user focus list): Q4-blocked (fairy unresolved). Defer to Q4 packet.
- **Double-Blender** (per user focus list): Whirling Blender? or Double-decomposition of blender (= 2 × whirling-osis = 2 × 4 = 8)? Current DB does not contain a Double Blender row. Forward-looking.
- **Double-Spinning-Osis** (per user focus list): Two Spins to Osis. Forward-looking; not in DB.

**Red question (deferred until tricks are added to DB):** for each Double-X compound, what does Double contribute? Options: +1 generic / per-compound ruling / 0 wrapper with the compound carrying its own canonical ADD. The current per-compound policy is functional but produces many small Red asks.

Bundle: ask Red for a default Double policy (probably 0-wrapper with per-compound override) AND for the specific Double-Blender / Double-Spinning-Osis rulings as they become relevant.

## Out of scope (NOT in this packet)

- All FM-vocab modifiers (fairy, gyro, blazing, surging, etc.): belong in **Q4 batch packet**, not here.
- All Nuclear-ss cohort: closed by SS=+0 pt12. Documented in FM_MATH_DIVERGENCES as `federation_math_divergence`.
- All PassBack `dex_count != ADD` mismatches: metric-conversion artifact, not ontology conflict. See `AUTO_RESOLVABLE_CANDIDATES.md`.
- All `notation`-empty IFPA self-atom rows: parser-coverage gap. See `ADD_POLICY_REFINEMENT.md`.
- Spyro-gyro: Q4-blocked (both Spyro and Gyro are Q4 cohort).
- Dragon: polysemous; structural resolution required (modifier vs surface vs suffix) before ADD ruling is meaningful.
- Slicing: FM polysemy (two distinct Sets-tab definitions); not IFPA's concern until FM resolves.

## Priority ordering

1. **Q1 (pt12 blurry/barraging cohort)** -- highest. Three rows currently disagree internally. Already in pt12 queue.
2. **Q2 (Witchdoctor)** -- high. Single-question; resolution closes one focus target cleanly.
3. **Q3 (atomic-set polysemy / `far` weight)** -- medium-high. 11+ rows depend on resolution; potentially restructures `ADD_FORMULA_ASSUMPTIONS.md`.
4. **Q4 (Royale)** -- low-medium. Single-row clarification.
5. **Q5 (Quantum)** -- low-medium. NF-2A entry already pending.
6. **Q6 (Furious non-rotational)** -- low. Forward-looking.
7. **Q7 (Double policy)** -- low. Bundle into a later packet.

Recommended packet shape: send Q1 + Q2 + Q3 as a focused Red ask (3 questions). Q4-Q7 are lower priority and can wait for a follow-up packet.
