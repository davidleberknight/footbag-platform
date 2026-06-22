# Emerging Vocabulary Corpus Audit — 2026-06-22 (post-correction refresh)

Read-only audit of the entire Emerging Vocabulary corpus (the comprehensive symbolic
trick corpus), refreshed to reflect current project understanding. This is a page
refresh, not a doctrine rewrite.

**Audit unit:** unique `canonical_slug`. Raw corpus 4,178 rows → projections collapsed →
**1,680 unique slugs**.

Reproduce: `python3 exploration/emerging-vocab-audit-2026-06-22/classify.py`
Per-slug detail: `per_slug_classification.csv` · prior snapshot: `per_slug_prev.csv`

## What changed in this refresh

- **Pogo is no longer doctrine-blocked.** Evidence is one-directional: all active pogo
  compounds carry ADD exactly +1 over their pogo-less base; footbag.org, FootbagMoves,
  the canonical dictionary, and the operational notation (an extra scored `[DEX]`) all
  encode +1. Only `freestyle_trick_modifiers.pogo.add_bonus = 0` disagrees. Pogo
  compounds are now **RESOLVABLE NOW**; the registry value is a curator-review item, not
  a public doctrine question. **See "Registry conflict" below.**
- **Positional variants are held, not collapsed.** same-side / far / near / opposite /
  ss / op variants are no longer auto-aliased or auto-resolved. They move to the held
  (doctrine-blocked) set "under review" pending Red, because the structural distinction
  (Atomic Mirage vs Atomic Far Mirage; Pixie Mirage vs Pixie Same-Side Mirage) is open.

## 1. Updated category counts

| Bucket | Meaning | Count | Δ vs prior |
|---|---|---:|---:|
| A | REMOVE (not a trick) | 12 | 0 |
| B | ALIAS | 192 | 0 |
| C | PROMOTED ALREADY | 614 | 0 |
| D | RESOLVABLE NOW | 111 | −64 |
| E | DOCTRINE BLOCKED / under review | 187 | +97 |
| F | UNKNOWN | 564 | −33 |

## 2. Updated summary statistics

- Unique frontier slugs: **1,680**
- Already promoted (C): **614** — never truly frontier; corpus-mislabeled
- Removed / aliased / resolvable (A+B+D): **315**
- **Genuine remaining frontier (E + F): 751**

This refresh trades raw shrinkage for accuracy: pogo correctly leaves the blocked set
(→ resolvable), but the explicit instruction to stop collapsing positional variants moves
~112 of them into the held set, so E+F rises from 687 to 751. The frontier is now an
honest picture — nothing is collapsed that Red has not yet ruled on.

## 4. Entries moved between buckets (vs prior run) — 127 total

| Count | From → To | Examples |
|---:|---|---|
| 75 | RESOLVABLE NOW → DOCTRINE BLOCKED | `atomic-ss-osis`, `far-dyno`, `far-reverse-whirl`, `stepping-far-clipper` (positional variants now held) |
| 37 | UNKNOWN → DOCTRINE BLOCKED | `grifter-same-side`, `symp-illusion-same-side`, `symple-butterfly-same-side` (positional variants now held) |
| 11 | DOCTRINE BLOCKED → RESOLVABLE NOW | `pogo-butterfly`, `pogo-clipper`, `pogo-legover`, `pogo-illusion`, `pogo-mirage`, `pogo-barrage` |
| 4 | DOCTRINE BLOCKED → UNKNOWN | `pogo` (standalone), `pogo-dlo`, `pogo-da-da-curve`, `pogo-motion` (base not resolvable) |

## 6. What remains genuinely blocked by Red (E = 187)

| Question | Count | The doctrine question |
|---|---:|---|
| A1 DOD / DDD | 14 | Is Double-Over-Down the same structure as Down-Double-Down, or two distinct bases? |
| A2 Weaving | 28 | Is `weaving` a productive operator (+N), a movement family (+0), or a naming layer? No weaving notation authored. |
| A5 atomic-rotational X-Dex | 14 | Does atomic/quantum/nuclear/sailing on a rotational receiver carry a hidden X-Dex, and does it survive an inserted operator? (HELD) |
| A5 positional-variant | 131 | Is a same-side / far / near / opposite variant a distinct trick or a notational qualifier? Held out of auto-alias until clarified. |

**Pogo is deliberately absent from this list** — it is resolvable, pending a registry cleanup, not a Red ruling.

## Registry conflict note (curator review, not a public doctrine question)

`freestyle_trick_modifiers.pogo.add_bonus = 0` (and `add_bonus_rotational = 0`) conflicts
with every other source of truth:

- official ADDs on all 12 active pogo compounds = pogo-less base **+1**
- footbag.org lists all pogo compounds at +1 (zero counter-examples)
- FootbagMoves corroborates +1
- operational notation adds a scored `(no plant while) … [DEX]` (one extra bracket = +1)

The +0 value alone produces an 11-row `approximate` parser-mismatch band. The clean fix
is `pogo.add_bonus 0 → 1` (+ rotational 1), which collapses those mismatches to `exact`.
This reverses Red's *standing* +0 position, so it is staged for curator/Red sign-off, not
applied. Until then the audit treats pogo as +1 (evidence-led) and flags the registry
value as stale.

## 3. Updated page copy (draft for the Emerging Vocabulary surface)

> **Emerging Vocabulary** collects trick names that appear in the community and in outside
> sources but are not yet part of the canonical dictionary. Each name is triaged: many
> resolve to an existing trick under a different name, many can be authored directly from
> known movement operators and bases, and a smaller set depend on open classification
> questions still under expert review. Names already adopted into the dictionary, duplicate
> spellings, and non-trick terms (run-quality words, dexterity terms, source labels) are
> not listed here.
>
> The remaining frontier is the genuinely unsettled vocabulary: a few operator-weight and
> movement-distinction questions awaiting expert review, plus names whose structure cannot
> yet be inferred from current sources. Side and direction variants (same-side, far, near,
> opposite) are kept distinct rather than merged until the underlying distinction is
> settled.

(Public-prose hygiene applied: no reviewer names, no pt## tags, outside sources generalized.
Draft only — not yet wired into a template; confirm the target surface to apply.)

## Methodology & confidence

- **C (614) and B (192) are exact joins** against the live dictionary and alias tables.
- **A / D / E are grounded proposals**: A from noise patterns; D from token-decomposition
  against the modifier registry + active bases (pogo scored at +1 per evidence); E from the
  DECISION_PACKET questions plus the positional-variant hold.
- **No silent merges / no auto-collapse of positional variants** (per instruction).
- **Reproducible**: `classify.py` is read-only; the per-slug CSV is the audit trail.
