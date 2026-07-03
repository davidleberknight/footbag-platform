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
- **Positional variants are NOT doctrine-blocked** (superseded by the Relative-Side
  reconciliation, 2026-06-22). They are no longer auto-aliased or auto-collapsed, but
  `SAME`/`OP` already encode the same-side/far distinction in the notation layer, so the
  distinction is not a Red question. Of the 131 once held in E: **128 → G NEEDS-AUTHORING**
  (missing operational notation; mechanical once authored) and **3 → E review** (name vs
  notation conflict). See `exploration/relative-side-reconciliation-2026-06-22/`.

## 1. Updated category counts

| Bucket | Meaning | Count | Δ vs prior |
|---|---|---:|---:|
| A | REMOVE (not a trick) | 12 | 0 |
| B | ALIAS | 199 | +7 (positional aliases) |
| C | PROMOTED ALREADY | 614 | 0 |
| D | RESOLVABLE NOW | 165 | +54 (targeting rule) |
| E | DOCTRINE BLOCKED / review | 59 | 0 |
| F | UNKNOWN | 564 | 0 |
| G | NEEDS-AUTHORING (positional, no resolvable notation) | 67 | −61 (targeting rule) |

## 2. Updated summary statistics

- Unique frontier slugs: **1,680**
- Already promoted (C): **614** — never truly frontier; corpus-mislabeled
- Removed / aliased / resolvable (A+B+D): **376**
- **Doctrine-blocked / unknown (E + F): 623**
- **Needs-authoring (G — positional, no resolvable notation): 67** = 56 base-not-active + 11 multi-off-side ambiguous

Applying the **Relative-Side Targeting Rule** (`RELATIVE_SIDE_TARGETING_RULE.md`: the
qualifier modifies the unique off-side element — the off-side dex, else the catch) moved
**54** positional entries from needs-authoring to RESOLVABLE NOW (39 by Rule A, 15 by Rule
B; this includes the 34 multi-dex the rule was derived on, plus single-dex/catch-only
positional entries the same rule resolves). 7 all-at-target positional entries resolve to
aliases. G falls 128 → 67: the residue is 56 entries whose base is not yet active (author
the base first) and the 11 multi-off-side cases the rule explicitly does not resolve.

The Relative-Side reconciliation (2026-06-22) corrected the prior over-block: `SAME`/`OP`
already encode the same-side/far distinction in the notation layer, so positional variants
are not doctrine-blocked. Of the 131 previously held in E, **3** are genuine name/notation
conflicts (kept in E for review) and **128** simply lack authored operational notation
(moved to **G NEEDS-AUTHORING** — mechanical once notation is written, not a Red question).
E falls 187 → 59.

## 4. Entries moved between buckets (vs prior run) — 127 total

| Count | From → To | Examples |
|---:|---|---|
| 75 | RESOLVABLE NOW → DOCTRINE BLOCKED | `atomic-ss-osis`, `far-dyno`, `far-reverse-whirl`, `stepping-far-clipper` (positional variants now held) |
| 37 | UNKNOWN → DOCTRINE BLOCKED | `grifter-same-side`, `symp-illusion-same-side`, `symple-butterfly-same-side` (positional variants now held) |
| 11 | DOCTRINE BLOCKED → RESOLVABLE NOW | `pogo-butterfly`, `pogo-clipper`, `pogo-legover`, `pogo-illusion`, `pogo-mirage`, `pogo-barrage` |
| 4 | DOCTRINE BLOCKED → UNKNOWN | `pogo` (standalone), `pogo-dlo`, `pogo-da-da-curve`, `pogo-motion` (base not resolvable) |

## 6. What remains genuinely blocked by Red (E = 59)

| Question | Count | The doctrine question |
|---|---:|---|
| A1 DOD / DDD | 14 | Is Double-Over-Down the same structure as Down-Double-Down, or two distinct bases? |
| A2 Weaving | 28 | Is `weaving` a productive operator (+N), a movement family (+0), or a naming layer? No weaving notation authored. |
| A5 atomic-rotational X-Dex | 14 | Does atomic/quantum/nuclear/sailing on a rotational receiver carry a hidden X-Dex, and does it survive an inserted operator? (HELD) |
| positional name/notation conflict | 3 | `inspinning-same-side-{illusion,mirage}`, `whirl-same-side` — name asserts same-side but operational notation shows `OP` only. |

The former "A5 positional-variant (131)" row is retired: per the Relative-Side reconciliation, `SAME`/`OP` already encode the distinction, so positional variants are **not** a Red question — 128 are NEEDS-AUTHORING (bucket G) and 3 are the conflicts above.

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
> yet be inferred from current sources. Side and direction variants (same-side, near, far,
> opposite) are kept distinct rather than merged — the notation already records which side
> each move uses — and most are simply waiting on their movement notation to be written,
> not on any unresolved ruling.

(Public-prose hygiene applied: no reviewer names, no pt## tags, outside sources generalized.
Draft only — not yet wired into a template; confirm the target surface to apply.)

## Methodology & confidence

- **C (614) and B (192) are exact joins** against the live dictionary and alias tables.
- **A / D / E are grounded proposals**: A from noise patterns; D from token-decomposition
  against the modifier registry + active bases (pogo scored at +1 per evidence); E from the
  DECISION_PACKET questions plus the positional-variant hold.
- **No silent merges / no auto-collapse of positional variants** (per instruction).
- **Reproducible**: `classify.py` is read-only; the per-slug CSV is the audit trail.
