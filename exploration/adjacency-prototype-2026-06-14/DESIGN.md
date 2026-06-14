# Adjacency layer — design + prototype

The novel value in the neighborhood investigation is **operator adjacency**, not the
neighborhood grouping (which is ~78% redundant with `trick_family`). This document
specifies the adjacency layer and is backed by a runnable, read-only prototype:
`prototype.py` (computes everything below from the live DB, no writes).

Everything is derived from two already-populated inputs only:
- `freestyle_tricks.base_trick`
- `freestyle_trick_modifier_links (trick_slug, modifier_slug, apply_order)`

No dependence on `structural_parse_json` / `computed_adds` (NULL in the live DB).

---

## 1. The ±1-operator relation (rules)

For a trick `T`: `base = base_trick(T)`, `S = set(modifier_links(T))`,
`root = lineage_root(T)` (walk `base_trick` to a self-terminal).

| Bucket | Rule | Meaning |
|---|---|---|
| **base_of** (−1) | same-base tricks whose opset is a **non-empty** proper subset of `S` with `|S|−|opset| = 1`; **and** if `|S| = 1`, the single named anchor (`slug == base`). | "remove one operator" |
| **siblings** | same base, same rung (`|opset| = |S|`), opsets differ by a single swap (`|S △ opset| = 2`); for `S = ∅`, the other 0-op named members of the base (excluding the anchor). | "swap one operator" |
| **extensions** (+1) | same-base tricks whose opset is an exact +1 superset of `S`; **plus** named children whose `base == slug(T)` and which carry ≥1 operator. | "add one operator" |
| **operator_kin** | same **non-empty** opset `S`, different base, same `root`. | "same operator(s), other base" |
| **twins** | same base **and** same opset, **opset non-empty only**. | safe structural equivalence |

### Operator sets are MULTISETS
A repeated operator is repeated structure, not a duplicate to collapse:
`double-spinning = spinning ×2`, stored as two `modifier_links` rows differing only
in `apply_order` (the link PK `(trick_slug, modifier_slug, apply_order)` allows
this; no `double-spinning` modifier is created). The opset is therefore a multiset
(`Counter`): **rung = total operator count *with* multiplicity**, and base_of /
siblings / extensions / twins compare multisets. `double-spinning-whirl`
(`{spinning:2}`, rung 2) is the +1 **extension** of `spinning-whirl` (`{spinning:1}`,
rung 1), never its twin — a set model would wrongly collapse them.

### The one rule that prevents fabricated structure
**Twins require a non-empty opset.** With `S = ∅` the *name* is load-bearing:
`torque` and `blender` both reduce to `osis + {}` yet are different moves, so an
empty-opset match must **never** be asserted as equivalent. With `S ≠ ∅` the
operators fully specify the structure on top of the base, so `big apple` and
`gyro-symposium-torque` (both `torque + {gyro, symposium}`) are genuinely the same
move — surfaced as `big apple ≡ gyro-symposium-torque`. Cross-*base* equivalence
(e.g. a folk name whose base differs) is **not** derived here; it stays in the
curated equivalence layer.

### Verified prototype output
```
mobius(5)
  Built on (-1)      : torque(4)
  Siblings (swap)    : atomic torque · blazing-torque · grave digger · paradox torque · pixie-torque …
  Extensions (+1)    : big apple(6) ≡ gyro-symposium-torque(6) · symposium-mobius · fairy-mobius · pixie-mobius …
  Same operator      : gyro-osis(4) · gyro-blender(5)

hatchet(4)
  Built on (-1)      : whirl(3)
  Twins (same base+ops): clipper diving whirl ≡ diving-whirl    ← folk name resolved
```

---

## 2. Structural-neighbors block (trick detail page)

Render order and caps (Mobius shown):

```
STRUCTURAL NEIGHBORS
  Built on            torque(4)
  Swap the operator   spinning torque · paradox torque · atomic torque ·
                      grave digger(=stepping) · spinal tap(=tapping) · …(+8)
  Extend (+1)         big apple ≡ gyro-symposium-torque · symposium-mobius · …
  gyro elsewhere      gyro-osis · gyro-blender · gyro-butterfly · gyro-mirage
```

- **Order of buckets:** base_of → siblings → extensions → operator_kin. (twins fold
  into whichever bucket the alias lands in, joined by `≡`.)
- **Cap:** ≤6 groups per bucket, with `(+N more) → opens the neighborhood`. A *group*
  (one or more `≡` aliases) counts as one slot.
- **Within a bucket:** ADD ascending, then name.
- **Never show:** ADD-only matches, anything ≥2 operators away, the whole lineage,
  or cross-base equivalences not in the curated layer.

---

## 3. Ladder ordering (within a sub-lineage)

A ladder is keyed on a **sub-lineage** (`base_trick`), not a family — the anchor is
`slug == base` even if its own `trick_family` differs (`torque`'s family is `osis`,
but it anchors the torque ladder). Members are bucketed into **rungs** by operator
count *with multiplicity* (so `double-spinning-*` is rung 2); within a rung:
operator priority → ADD → name; structurally identical entries merge with `≡`.

### Verified prototype output (whirl ladder — folk names land in place)
```
rung 0  whirl · rev whirl · feral · double-whirl · genesis · reactor …
rung 1  paradox whirl · spinning whirl(≡spinning reverse whirl) · ducking whirl(≡clipper ducking whirl) ·
        diving-whirl ≡ hatchet · gyro-whirl · symposium whirl …
rung 2  ducking-paradox-whirl ≡ tomahawk · spinning-ducking-whirl · paradox symposium whirl …
rung 3  ducking-paradox-symposium-whirl ≡ mullet · paratoxic · surreal …
rung 4  montage ≡ spinning-ducking-paradox-symposium-whirl · stepping-ducking-paradox-symposium-whirl
```

This replaces alphabetical-within-family. **Multiple ladders coexist** because the
rungs form an operator-set lattice (e.g. `ducking whirl` and `spinning whirl` both
feed `spinning-ducking-whirl`); present the longest most-attested path as the
headline and let branches expand.

---

## 4. Folk-name display rules

A name is **folk** if a name token is not explained by its base name, its operators,
or generic tokens (reverse, toe, clipper, same, side, …). `spinning whirl` is
compositional (no gloss); `mobius`, `hatchet`, `food processor`, `tomahawk` are folk.

- **In ladders and neighbor lists:** folk names render with a structural gloss —
  `mobius [= torque + gyro]`, `hatchet [= whirl + diving]` — so the structure the
  name hides is visible at the point of use.
- **When a folk name is a structural twin of a compositional name:** join with `≡`
  and keep both (`diving-whirl ≡ hatchet`, `big apple ≡ gyro-symposium-torque`). The
  folk name is the community label; the compositional name is the explanation.
- **Compositional names get no gloss** (it would be redundant).

---

## 5. Data-quality preconditions (must precede shipping)

The prototype surfaces exactly where `base_trick` / `modifier_links` are incomplete;
these produce visibly wrong adjacency until fixed:

- **Missing operator links.** `spinning-ducking-symposium-whirl` stores only
  `ducking,spinning` (no `symposium` link), so it appears as "same operator, other
  base" instead of a +1 extension. 0-op high-ADD whirls (`Sailing Whirl`,
  `double-spinning-whirl`, `genesis`, `reactor`, `sole-survivor`) are under-linked —
  they sit at rung 0 despite clearly carrying operators.
- **Landing-prefix merges.** `clipper ducking whirl ≡ ducking whirl` assumes the
  `clipper` prefix is the default whirl landing (likely correct, but confirm a few).
- **Surface mis-roots** (from the prior investigation): `drifter → clipper-stall`,
  `inside-stall → guay` — only relevant if `lineage_root` is shown; the adjacency
  block/ladders do not depend on it.

A `base_trick` + `modifier_links` QC pass is the explicit precondition. The relation
itself is correct; its inputs need cleaning.

---

## 6. Reference implementation

`prototype.py` — run `python exploration/adjacency-prototype-2026-06-14/prototype.py`.
Read-only; demonstrates neighbors for mobius/blur/torque/spinning-ducking-whirl/hatchet
and ladders for the torque and whirl sub-lineages. The functions `neighbors()`,
`ladder()`, `is_folk()`, `structural_label()`, `dedupe_struct()` are the spec made
executable; port their logic into a service shaping method when implementing.
