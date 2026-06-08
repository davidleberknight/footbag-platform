# Multi-Modifier Composition Grammar - Proposal for Curator Review

Read-only. A safe composition grammar for tricks with 2-4 stacked modifiers, derived from notation-bearing 2+-modifier corpus examples. Nothing written to red_corrections or tests.

## Proposed composition order
A stacked-modifier notation is built left-to-right in this fixed order. Each layer is optional except the core and terminal.

```
1. ENTRY        one set-replacing modifier: pixie / stepping / tapping / fairy
2. BODY         zero or more body modifiers, in apply order: spinning / gyro / ducking / diving / jumping
3. CORE         the base family structure (its own dexes + spin)
4. TIMING       symposium transforms the TARGET dex into (no plant while) ... [BOD]
5. PARADOX      tags the TARGET dex with [PDX]
6. TERMINAL     the family catch, inherited unchanged
```

Worked corpus confirmations:
- `fairy-ducking-whirl`: `TOE > SAME OUT [DEX] >> DUCK [BOD] >> OP IN [DEX] > OP CLIP [XBD] [DEL]` = entry(fairy) > body(ducking) > core(whirl) > terminal.
- `pixie-ducking-symposium-mirage`: `TOE > SAME IN [DEX] >> DUCK [BOD] >> (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]` = entry > body > timing-on-core-dex > terminal.
- `ducking-paradox-torque`: `CLIP > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` = body > paradox-tagged core dex.
- `gyro-ducking-symposium-torque`: `CLIP > (back) SPIN [BOD] > DUCK [BOD] > (no plant while) SAME IN [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` = body(gyro) > body(ducking) > timing-on-core > terminal.

## Set-replacement rules (Q2, Q3)
- **Entry modifiers replace the set** with their own surface and add a +1 entry dex: pixie/fairy/tapping -> `TOE`, stepping -> `CLIP`. Exactly one entry per trick; two entry modifiers is a conflict (unsafe).
- **Body modifiers do not replace the set**; they prepend after it (after the entry, if any), each adding `[BOD]`, in apply order.

## Separator rules (Q6)
- Entry dex separator: `>>` for pixie/stepping/tapping (ratified); fairy is `>`/`>>` and is **held** pending the separate fairy-separator ruling.
- Body modifier separator: `>` default; `>>` where it opens a body attack and the base permits.
- **Single-`>>` base** (eggbeater / barfly / superfly): the set `>>` collapses to single `>` around the inserted modifier (ratified).
- **Multi-`>>` base** (tomahawk / mobius): the `>>` are structural and internal, not a set boundary. The collapse rule does NOT apply. Unsafe.

## Timing / paradox attachment (Q4, Q5)
- The **target dex** is the last add-bearing dex before the terminal catch (the catching dex).
- Symposium turns the target dex into `(no plant while) <dex> [BOD]` (+1).
- Paradox tags the target dex with `[PDX]` (+1), inserted before the `[DEX]` token.
- **Single core dex -> target is unambiguous (safe).** Multiple core dexes -> the target is ambiguous and needs the target-selection ruling below.

## Unsafe patterns (the safety rule in force: ADD equality is necessary, not sufficient)
1. **Multi-`>>` structural bases** (tomahawk, mobius): internal `>>` placement is not mechanical. Corpus siblings (gangsta-party, mullet) keep the `>>`.
2. **Depth-4 stacks**: each added layer compounds ordering uncertainty; no single precedent fixes all four positions at once.
3. **Two entry modifiers**: set-replacement conflict.
4. **Multi-core-dex + timing/paradox**: ambiguous target dex.
5. **Un-ratified operators** (railing, atomic, furious, blurry): the inserted token itself is unproven.
6. **spinning + stepping**: the spin prepends before the stepping dex AND the stepping dex flips to `SAME IN` (corpus: venom, surge). Mechanical only once the order ruling is explicit.

## Derivable-from-precedent vs curator-only (Q7, Q8)
Classification of all 25 notation-less 2+-modifier tricks lives in `UNLOCK_TABLE.md`; the structure-risk cases in `RISK_REGISTER.md`.

| class | count | meaning |
|---|---|---|
| **A. Safe now** | 8 | depth-2, all-ratified, single-target, no order risk; mechanically composable with a direct precedent |
| **B. Safe after one ruling** | 13 | blocked by exactly one explicit ruling (below) |
| **C. Unsafe / source-dependent** | 4 | depth-4 stacks + a multi-target+order combination; needs 2+ rulings or is structural |

B breaks down by the single ruling each needs:

| ruling | unlocks (B) | also helps |
|---|---|---|
| **composition-order** (the fixed order above + the spin+stepping side rule) | bigwalk, margaritaville, stepping-ducking-paradox-illusion | the 4 depth-4 C cases become verifiable when paired with target-selection |
| **target-selection** (timing/paradox -> last core dex) | pixie-symposium-whirling-swirl, spinning-symposium-whirling-swirl | stepping-ducking-symposium-eggbeater (C -> derivable) |
| **fairy-separator** (already deferred to its own cleanup) | fairy-gyro-torque, fairy-swirling-swirl, genuphobia | every held fairy case across the 8 family batches (fairy-merkon, fairy-ripstein, fairy-illusion, fairy-rev-whirl, ...) |
| **railing operator grammar** | dorshanatrix, flying-fish, rail-warrior | other railing tricks |
| **furious operator grammar** | fury | other furious tricks |
| **atomic operator grammar** | witchdoctor | other atomic tricks |

## Final recommendation - smallest set of rulings, lowest risk
Two new rulings clear the most notation at the least structural risk:

1. **Composition-order ruling** - ratify the fixed order (entry > body > core[timing/paradox on the target dex] > terminal) and the spin+stepping side rule. Mechanical, fully precedent-backed.
2. **Target-selection ruling** - timing/paradox always attach to the last core dex.

Together they move **8 A (already safe) + ~6 (B + the eggbeater C)** to derivable, and make the depth-4 C cases verifiable rather than blind. The **fairy-separator** ruling (already queued separately) is the highest-reach third, because it unblocks fairy across every family, not just these three. The un-ratified operator grammars (railing 3, atomic 1, furious 1) are independent, lower-priority follow-ons.

What stays curator-only regardless: the multi-`>>` structural bases (tomahawk, mobius) and the deepest 4-modifier stacks, which need per-trick adjudication, not a general rule.

## Read-only coverage projection
- Deriving the 8 A cases (verify-then-confirm): ~113 -> ~105 notation-less (~83.9% projected).
- A + composition-order + target-selection: ~105 -> ~99 (~84.6%).
- A + all B (all five rulings): ~99 -> ~92 (~85.9%).
- Floor below that: the depth-4 stacks, multi-`>>` structurals, and ~39 named tricks with no decomposition (source-dependent).
