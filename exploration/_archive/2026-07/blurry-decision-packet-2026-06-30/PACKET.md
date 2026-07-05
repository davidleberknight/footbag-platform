# Blurry family — curator / Red decision packet (2026-06-30)

**Analysis only. No canonical writes. No blurry rows authored or promoted.** This packet exists to
put a small set of decisions to the curator that unblock the whole blurry family at once, the way the
pogo packet did.

Until these are answered, **no "blurry X" candidate has a determinable ADD**, so none can be authored.

---

## Established facts

These are corpus/registry observations, independent of any interpretation.

1. **The registry defines a flat `blurry` set-modifier of +1.** `freestyle_trick_modifiers`:
   `blurry = +1`, `add_bonus_rotational = +1` — "the same on rotational and non-rotational bases."
   Registry worked examples: `blurry clipper = 3`, `blurry butterfly = 4`, `blurry mirage = 3`.

2. **Every canonical `blurry`-named row expands into `stepping` or `stepping + paradox`, not a flat
   `blurry + base`.** The registry note states this directly: *"Blur = Stepping Paradox Mirage,
   Ripwalk = Stepping Butterfly … the named compound's ADD value derives from the expanded
   decomposition rather than from a flat blurry + base addition."*

   | canonical row | adds | decomposition | stepping | paradox? |
   |---|---|---|---|---|
   | `ripwalk` (= "blurry butterfly") | 4 | stepping + butterfly = 1 + 3 | +1 | **no** |
   | `blur` (= "blurry mirage") | 4 | stepping + paradox + mirage = 1 + 1 + 2 | +1 | **yes** |
   | `blurry_whirl` | 5 | stepping + paradox + whirl = 1 + 1 + 3 | +1 | **yes** |
   | `blurry_torque` | 6 | stepping + paradox + torque = 1 + 1 + 4 | +1 | **yes** |
   | `blurry_symposium_whirl` | 6 | stepping + paradox + symposium_whirl = 1 + 1 + 4 (notation carries `[PDX]`) | +1 | **yes** |

3. **`blur` contradicts the registry's own worked example.** The registry says `blurry mirage = 3`
   (flat +1). The canonical `blur` — which the skill's structural-alias table equates with "Blurry
   Mirage" — is **4**. No canonical `blurry`-named row implements the registry's flat +1.

4. **`ripwalk` differs from `blur`.** Both are `blurry`-named stepping compounds, but `ripwalk` carries
   **no** paradox (stepping-only, +1) while `blur` carries a paradox (stepping + paradox, +2). So the
   folk label "blurry" alone does not determine whether a paradox is present.

---

## Open question

Fact 2 and fact 4 leave one thing undetermined: **when a `blurry`-named trick expands, what decides
whether the paradox term is included (giving +2) versus stepping-only (giving +1)?** `blur` includes
it; `ripwalk` does not; the three whirl/torque rows include it. Nothing in the data or registry states
the rule.

---

## Working hypothesis (unverified — offered only as one possible answer)

The paradox term appears on **one structural class of bases** (mirage, whirl, torque, symposium whirl)
but not on **another** (butterfly). **What that structural property actually is, is exactly what is
under review** — it could be paradox-carrying bases, opposite-side dexes, cross-body entries, dex
orientation, or something else. This packet deliberately does **not** name the predicate (e.g. as
"rotational"); the five data points fit several candidate predicates, and one of them (`ripwalk`) is
the only negative case. The predicate is a decision to be made, not a fact to be read off the corpus.

---

## Candidate inventory (11 single-modifier "blurry X", none yet canonical)

Every row's ADD is undetermined by ±1 until the decisions below are made: `base + 1` if "blurry" is
the flat modifier or a stepping-only expansion; `base + 2` if the expansion also carries a paradox.
Structural class is left blank on purpose — assigning it is the curator's call, not mine.

| candidate | base | base adds | ADD if flat +1 / stepping-only | ADD if stepping + paradox |
|---|---|---|---|---|
| `blurry_mirage` | mirage | 2 | 3 | 4 — **already canonical as `blur` (4)**; see Decision 3 |
| `blurry_illusion` | illusion | 2 | 3 | 4 |
| `blurry_legover` | legover | 2 | 3 | 4 |
| `blurry_clipper` | clipper | 1 | 2 | 3 |
| `blurry_guay` | guay | 2 | 3 | 4 |
| `blurry_pickup` | pickup | 2 | 3 | 4 |
| `blurry_reaper` | reaper | 3 | 4 | 5 |
| `blurry_barrage` | barrage | 3 | 4 | 5 |
| `blurry_eggbeater` | eggbeater | 3 | 4 | 5 |
| `blurry_flurry` | flurry | 4 | 5 | 6 |
| `blurry_voodoo` | voodoo | 5 | 6 | 7 |

---

## Curator decisions requested

1. **Is "blurry X" fundamentally an expanded decomposition (stepping, or stepping + paradox), rather
   than a flat +1 modifier?** (The corpus uses the expansion; the registry states a flat +1 that no
   canonical row implements. If yes, the registry note should be corrected.)

2. **If yes, what structural property determines when the paradox term is included?** (`blur` and the
   whirl/torque rows include it; `ripwalk` does not. The predicate is undecided — see working
   hypothesis.)

3. **Is "Blurry Mirage" simply an alias of "Blur"?** (If yes, `blurry_mirage` is an alias registration
   on the existing `blur` row, not a new promotion.)

---

## Disposition

- Blurry Class-B authoring is **blocked** pending these decisions.
- The clean atomic Class-B set remains complete; the atomic far/X-Dex extension is parked on its own
  separate curator question (see `exploration/atomic-far-xdex-finding-2026-06-30/NOTE.md`).
