# Entry-Topology Audit — Reproducible Methodology

Read-only mirror of the terminal-topology audit, run on how a trick is **set** rather than how it ends. It discovers the empirical structure of freestyle *entry* topology and compares it to the set/modifier ecosystem. It proposes, promotes, and changes nothing.

## Scope (fixed)
Entry topology only: **how a trick is initiated, the kind of set it is.** The dex chain, the terminal mechanic, and what the body does during flight are out of scope.

## Key finding that defines the method
**Operator position within the formula does not determine topological role. Entry topology is defined by set-role, not token location.**

The position test (where each modifier's token actually appears in the chain) is decisive on this point:

| modifier (leaves a token) | tricks | share just after the set | median position in chain |
|---|---|---|---|
| spinning/gyro | 177 | 63% | 33% (early) |
| jumping | 10 | 80% | 33% (early) |
| ducking | 89 | 33% | 50% (mid) |
| diving | 10 | 20% | 50% (mid) |
| paradox | 76 | 36% | 60% (late) |
| symposium | 84 | 26% | 67% (late) |

The operators classed as **entry** (symposium, paradox) fire *latest*; **spinning**, a body action, fires *earliest*. Token position therefore cannot separate entry from body: these operators attach to whatever dex they modify, anywhere in the trick. Entry identity is the **set-role** (what kind of set the trick is), which is also why the set ecosystems leave no token at all, they *are* the set pattern, not an inserted operator.

## Source of truth
Two grounded sources, never the trick's `modifier_type` column (which mixes roles, see `ENTRY_DATA_FIX_CANDIDATES.md`):
1. **Entry surface** from the opening token of `operational_notation`.
2. **Set-role membership** from the curated `freestyle_trick_modifier_links`.

Corpus: `freestyle_tricks` where `is_active = 1` (651 tricks; 473 carry a formula).

## The three entry buckets (set-role)
- **A. Entry Surfaces** — the set surface, the first formula token: `toe-set`, `clip-set`, generic `set`. The grandparent entry roots; distribution is bimodal (toe/clip dominate).
- **B. No-Plant / Timing Systems** — set-timing operators that change *how* the set/dex is taken: symposium (no-plant), paradox, blurry, furious.
- **C. Set Ecosystems** — named set patterns the trick belongs to: pixie, fairy, stepping, atomic, quantum, nuclear. Carried by membership; no opening token expected.

Count for each identity = distinct active tricks carrying it.

## Held out (a separate body-topology audit, NOT entry)
Body actions (spinning, ducking, gyro, diving) and operator overlays (whirling, swirling, miraging, barraging, tapping) describe what happens during flight, at varying formula positions. They are real, large ecosystems and deserve their own audit, but they are not entry identities. The position test above is the recorded reason they are excluded here.

## Known limitations
- **178 / 651 tricks carry no formula**, so their entry surface is unknown and absent from the surface counts.
- **Generic `set` (60)** hides the real surface for tricks whose notation does not name it.
- **Membership completeness**: B and C depend on the curated modifier links being complete; an unlinked trick is undercounted for that ecosystem.
- A handful of openings are non-canonical (`flying`, `[uns]`, `double` as a first token); flagged as artifacts, not surfaces.

## Reproducibility
Inputs: `freestyle_tricks(slug, operational_notation, is_active)` and `freestyle_trick_modifier_links(trick_slug, modifier_slug)`. Constants: the set-surface vocabulary (A), and the bucket assignments for B and C. The audit regenerates the surface counts, the entry-identity ranking, and the data-fix list deterministically.
