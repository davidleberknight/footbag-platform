# Curator-convention packet — P2c ADD-line unresolved flags (2026-06-01)

## Rulings (2026-06-01, curator James)

- **Flag 1 — BOD(1)/bod(1):** RULED **preserve dual + document.** Casing is semantic, not cosmetic:
  uppercase `BOD(n)` = an operator mapping into the body-modifier ADD bucket (locked `flying-clipper`);
  lowercase `bod(n)` = a primitive body component summed alongside `dex`/`del` inside an irreducible
  atom's decomposition (`hop-over`, `butterfly-kick`, `eclipse`). No data change; convention now
  documented in-code in `freestyleResolvedFormulas.ts`. The locked `flying-clipper` row stands.
- **Flag 2 — atomic rotational notation:** HELD. Gated on Red Wave-2 Q3; normalize to whatever the
  ruling implies, not before.
- **Flag 3 — bigwalk governance citation:** RULED **clean math only.** Public ADD-lines are
  `operator(+n) + base(n) = total ADD` and nothing else. `bigwalk` now reads
  `surging(+2) + butterfly(3) = 5 ADD`; the `= spinning + stepping per Red pt2` expansion + attribution
  are retained verbatim in the `provenance` field (zero information lost). `bigwalk` was the sole
  derivation violating clean-math.

## Framing

The P2c audit pass began from an apparent finding of broad ADD-line inconsistency across the
`derivation` field (`freestyleResolvedFormulas.ts`). On inspection, of 129 derivations ~100 are the
clean dominant style and most apparent "drift" turned out to be one of:

- **intentional notation layering** (atoms decompose into `component(1)+…`; compounds into
  `modifier(+N) + base(N)` — different by trick *type*, not by accident),
- **curator-locked doctrine** (e.g. the `BOD(1)` bucket convention is explicitly locked),
- **unresolved ontology** (atomic-on-rotational is gated on Red Wave-2 Q3),
- **historically meaningful semantic distinction** (e.g. `swing` element order: `toe+swing` vs
  `swing+toe` encodes execution order — curator-locked).

Only one genuine formatting outlier was normalized in P2c (`reverse-drifter`'s `[directional: rev]`
→ `reverse(+0)`). The three items below are the **residual unresolved flags**. None is a clean
formatting fix; each carries doctrine, ontology, or governance weight. This packet separates the
true-formatting layer from the doctrine-sensitive layer and asks for rulings — it does **not**
propose mechanical normalization where ontology is unresolved.

---

## Flag 1 — `BOD(1)` (uppercase) vs `bod(1)` (lowercase)

### Current state
Two casings of the body-event token coexist in the ADD-lines:

| Casing | Rows | Reading |
|---|---|---|
| **`BOD(1)`** (uppercase) | `flying-clipper` — `BOD(1) + clipper(1) = 2 ADD` | the body-modifier **bucket / operator** — "flying" is classified into the BOD bucket contributing +1 |
| **`bod(1)`** (lowercase) | `hop-over` (`inside-delay(1) + bod(1)`), `butterfly-kick` (`bod(1) + dex(1)`), `eclipse` (`bod(1) + del(1) + dex(1)`) | an **additive component** in an irreducible atom's component-sum, alongside lowercase `dex`/`del`/`inside-delay` |

The uppercase form is **curator-locked**: `flying-clipper`'s provenance (flying-modifier doctrine,
2026-05-19) states "ADD accounting renders as BOD(1) per the body-modifier bucket convention."

### Why it's unresolved
The casing difference may be (a) **inconsistent casing of one concept** that should unify, or
(b) **two intentional semantic layers**:
- `BOD(1)` = a modifier's **bucket classification** (which ADD bucket the operator belongs to),
- `bod(1)` = a **component token** inside a base atom's decomposition.

If (b), the casing carries meaning (operator-bucket vs component) and unifying would erase a
distinction. If (a), it is drift. The current data can't decide this — only the curator's intent
for the notation's role can.

### Curator options
- **Unify** to one case (all `bod`, or all `BOD`). Pro: visually uniform; one token vocabulary.
  Con: if the bucket-vs-component distinction is real, this collapses it; overrides a locked row.
- **Preserve dual vocabulary** + document the rule (uppercase = modifier-bucket/operator role;
  lowercase = additive component in an atom sum). Pro: keeps the operator-vs-component layer
  legible; honors the locked `flying-clipper` convention. Con: readers must learn that case is
  semantic, not cosmetic.

*No recommendation offered — this turns on whether case is intended to be semantic.*

### Do NOT normalize mechanically yet
A blind lowercase sweep would override the locked `flying-clipper` bucket convention. Hold.

---

## Flag 2 — atomic rotational-value notation

### Current state
`atomic` is notated three ways depending on the base:

| Form | Rows | Base type |
|---|---|---|
| `atomic(+1)` (bare) | `atomic-butterfly`, `eggbeater`, `scrambled-eggbeater`, `flux` | treated as +1 |
| `atomic(+1 non-rotational)` (explicit) | `omelette`, `predator` | explicitly non-rotational +1 |
| `atomic(+2 rotational)` (explicit) | `atomic-torque` | rotational +2 |
| `atomic(+1) + x-dex/paradox-like contribution(+1)` (split) | `atom-smasher` | rotational base, +2 expressed as two separate +1 contributions |

So a rotational atomic that totals +2 is expressed **two different ways** — `atomic(+2 rotational)`
(atomic-torque) vs the split `atomic(+1) + x-dex contribution(+1)` (atom-smasher).

### Why it's unresolved
This is **not formatting** — it is tied to the deferred **Red Wave-2 Q3 doctrine** on how atomic
interacts with rotation (whether atomic on a rotational base is +2 via a hidden X-dex carry, and how
that carry is counted). The split form on `atom-smasher` deliberately *exposes* the hidden-x-dex
mechanism that Q3 is meant to rule on. Collapsing it to `atomic(+2 rotational)` would bury the exact
nuance under adjudication.

### Curator options
- **Explicit rotational atomic notation** everywhere — `atomic(+2 rotational)` as the single form
  for rotational bases. Pro: one form, matches `atomic-torque`. Con: pre-commits to the "+2 via
  rotation" reading and hides the x-dex carry that Q3 is deciding.
- **Hybrid explanatory notation** — keep the split `atomic(+1) + x-dex(+1)` where the x-dex
  mechanism is the point, and bare `atomic(+1)` / `atomic(+1 non-rotational)` elsewhere. Pro:
  preserves the mechanism for adjudication. Con: same total (+2) shown two ways until Q3 lands.

### Do NOT normalize mechanically yet
Unifying atomic's rotational notation before Q3 risks collapsing the very semantic the ruling will
settle. Hold for the Q3 ruling, then normalize to whatever the ruling implies.

---

## Flag 3 — governance provenance inside the ADD-line

### Current state
One derivation embeds governance provenance in the public symbolic notation:

- `bigwalk` — `surging(+2 = spinning + stepping per Red pt2) + butterfly(3) = 5 ADD`

The parenthetical carries two distinct things: a **structural note** (`surging = spinning + stepping`
— which *is* the settled surging-modeling rule) and a **governance citation** (`per Red pt2`).

### Why it's unresolved (lighter than 1–2)
The surging decomposition itself is settled doctrine, so this is closer to a **surface-hygiene**
question than unresolved ontology: should governance attribution (`per Red pt2`) and structural
expansion live *inside* a public ADD-line, or in the `provenance` / symbolic-decomposition layers?
The tradeoff is transparency (showing why surging = +2, with attribution) vs a clean symbolic
surface (just the math).

### Curator options
- **Clean symbolic** — `surging(+2) + butterfly(3) = 5 ADD`; move `= spinning + stepping` to the
  symbolic-decomposition layer and `per Red pt2` to `provenance`. Pro: public ADD-line is pure
  notation; attribution preserved off-surface. Con: the "why +2" is one click away.
- **Keep structural, drop governance** — `surging(+2 = spinning + stepping) + butterfly(3)`; strip
  only `per Red pt2`. Pro: keeps the helpful expansion inline, removes the governance leak. Con:
  still mixes expansion into the ADD-line.
- **Leave as-is** — full inline transparency. Pro: nothing hidden. Con: governance citation on a
  public symbolic surface; inconsistent with every other derivation (none cites a reviewer).

*Leaning note (not a ruling): this is the most normalizable of the three, since the underlying
doctrine is settled — but the strip-governance choice is still the curator's.*

### Do NOT normalize mechanically yet
Even here, an automated strip would have to decide between the three options above; the structural-
expansion vs provenance split is a judgment, not a regex.

---

## Key audit lesson

**Normalize formatting drift aggressively. Do not normalize unresolved ontology.**

P2c's broad-inconsistency appearance was largely intentional layering, locked doctrine, unresolved
Q3 ontology, or historically meaningful distinction. The safe formatting outliers were fixed; these
three need a ruling — and a mechanical pass over them would have erased exactly the distinctions the
rulings are meant to make.
