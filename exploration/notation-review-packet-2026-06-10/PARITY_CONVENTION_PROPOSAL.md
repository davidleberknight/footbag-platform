# Multi-operator [PDX]-on-[BOD][DEX] parity convention + 7 held op_notation strings

Review artifact. **No backfill applied.** Ratify (or amend) the convention and the
7 strings below; backfill via `red_corrections` + loader 19 is a separate step.

Scope: the 7 packet rows that were held on "parity convention needed" / "multi-operator
parity ordering review" / "base-less entry convention needed":
`paradox-symposium-illusion`, `stepping-ducking-paradox-illusion`, `surging`,
`big-apple-sauce`, `swirlwind`, `margaritaville`, `surging-ducking-paradox-torque`.

## Key finding

The convention is **already settled by exemplar** in the live DB — there is a substantial
corpus of `paradox-symposium-*`, `ducking-paradox-symposium-*`, and
`spinning-paradox-symposium-*` rows carrying populated `operational_notation`. The 7 rows
were not genuinely undefined; they were held because two *drift points* in that corpus made
the pattern look unsettled. This proposal reads the convention off the majority of the
corpus, pins the two drift points, and applies the result. Per the skill's forever-rule,
direction parity (SAME/OP) is **mirrored from the nearest exemplar, not derived**;
bracket-count == ADD is the hard gate and all 7 pass it (machine-verified).

## Proposed convention

**C1 — paradox+symposium merge.** When `paradox` and `symposium` modify the same base, they
collapse onto **one** no-plant scored event carrying three ADD tokens:
`(no plant while) <DIR> [PDX] [BOD] [DEX]` (paradox-carry + symposium-body + the base's dex,
in one motion). Matches `paradox-symposium-mirage/eggbeater`, all `ducking-paradox-symposium-*`,
`spinning-paradox-symposium-whirl`.

**C2 — canonical token order (pins drift #1).** Inside a merged no-plant event, order flags
`[PDX] [BOD] [DEX]`; a symposium-only event is `[BOD] [DEX]`. This matches the majority
(`miraging-symposium-*` = `[BOD][DEX]`; `ducking-/spinning-paradox-symposium-*` = `[PDX][BOD][DEX]`).
Token order does not affect ADD (same bracket count), so this is a presentation/parity pin only.

**C3 — direction parity (SAME vs OP), mirrored not derived.**
- **Leading paradox** (no body modifier before it): direction = the base's bare `paradox-<base>`
  direction (illusion → `SAME OUT`; mirage → `OP IN`). Entry carries `(plant)`.
- **A body modifier (ducking) precedes paradox**: ducking does **not** consume the flip; direction
  = the `ducking-paradox-<base>` exemplar (illusion → `SAME OUT`; mirage/torque → `OP IN`).
- **A spin (spinning/gyro) precedes paradox**: the spin **consumes** the flip → direction `OP`,
  plain entry (matches every `spinning-paradox-*`).

**C4 — operator chain order + [PDX] placement (pins drift #2).** Chain is
entry → name-order prefixes (spin / stepping-dex / duck) → the paradox-modified base event → base
terminal. **`[PDX]` rides the paradox-modified base's characteristic dex, never a stepping entry
dex.** (`stepping-ducking-paradox-blender` violates this — see Drift below.)

**C5 — standalone set/modifier-pair trick terminates in toe stall (RULED).** When a set or
modifier-pair name is used as a *standalone trick* it is notated as the set terminating in a toe
stall, exactly like `pixie` / `fairy` / `pendulum` / `double-fairy` (each `… > OP TOE [DEL]`, with
the terminal `[DEL]` counted in ADD: `fairy` = DEX+DEL = 2). So standalone `surging` =
`CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]` = **3 ADD**. Red's `surging = spinning +
stepping` (2-ADD movement contribution) is preserved; the terminal stall adds the third. The
2-ADD value remains correct for `surging` *as a modifier prefix* on a base (e.g. `margaritaville`),
which terminates via its own base — only the standalone trick row gains the terminal `[DEL]`.

**General principle (RULED, applies beyond this packet):** public trick-dictionary rows must
terminate in a core atom. Do not force an ADD to stay low by leaving notation unterminated;
update ADD to match the terminated form. Open-tail / non-terminating forms belong in the
set/operator encyclopedia, not the trick dictionary.

## The 7 strings (all bracket-count == ADD verified)

| slug | ADD | proposed op_notation | mirrored from |
|---|---|---|---|
| paradox-symposium-illusion | 4 | `CLIP (plant) > (no plant while) SAME OUT [PDX] [BOD] [DEX] > OP TOE [DEL]` | paradox-symposium-mirage (dir from paradox-illusion) |
| stepping-ducking-paradox-illusion | 5 | `CLIP > OP IN [DEX] > DUCK [BOD] > SAME OUT [PDX] [DEX] > OP TOE [DEL]` | ducking-paradox-illusion + stepping prefix |
| surging | 3 (was 2) | `CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP TOE [DEL]` | pixie/fairy set-standalone terminal-stall convention (C5) |
| big-apple-sauce | 8 | `SET > (back) SPIN [BOD] > OP IN [DEX] > (no plant while) OP IN [PDX] [BOD] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | spinning-miraging-symposium-torque + [PDX] |
| swirlwind | 7 | `CLIP > (back) SPIN [BOD] > (no plant while) OP IN [PDX] [BOD] [DEX] > OP BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]` | spinning-symposium-whirling-swirl + [PDX] |
| margaritaville | 7 | `CLIP > (back) SPIN [BOD] > OP IN [DEX] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > SAME CLIP [XBD] [DEL]` | spinning-paradox-blender + stepping prefix |
| surging-ducking-paradox-torque | 8 | `CLIP > (back) SPIN [BOD] > OP IN [DEX] > DUCK [BOD] > OP IN [PDX] [DEX] > (back) SPIN [BOD] > OP CLIP [XBD] [DEL]` | ducking-paradox-torque + surging prefix |

### Per-row notes / judgment calls for sign-off

- **paradox-symposium-illusion** — corrects the packet's draft on three counts: entry
  `CLIP (plant)` not `SET`; direction `SAME OUT` not `OP OUT` (leading paradox on illusion flips to
  SAME, matching bare `paradox-illusion`); token order `[PDX][BOD][DEX]` not `[BOD][PDX][DEX]`.
- **stepping-ducking-paradox-illusion** — corrects the packet's `OP OUT` → `SAME OUT` (mirrors
  `ducking-paradox-illusion`; neither ducking nor stepping consumes the flip). `[PDX]` sits on the
  illusion dex, not the stepping entry dex (C4).
- **surging** — RULED (C5): terminates in toe stall like `pixie`/`fairy`; **ADD 2 → 3**. This is
  the only row whose `adds` changes, so backfill pairs the `operational_notation` correction with an
  `adds` correction (and the public ADD chip / any ADD-derived surface updates accordingly). Verify
  no other surface hard-codes `surging = 2` as a standalone-trick ADD before flipping.
- **big-apple-sauce / swirlwind / margaritaville / surging-ducking-paradox-torque** — deep
  (4–5 operator) stacks; ADD is hard-verified, but two best-effort judgment calls remain, both
  curator-refinable without affecting ADD:
  - **prefix adjacency for `surging`** (spinning+stepping): I kept the pair adjacent and spin-first
    (`(back) SPIN [BOD] > OP IN [DEX]`) so the chain reads as the named unit. Alternative is
    stepping-first.
  - **canonical token order applied** (`[PDX][BOD][DEX]` / `[BOD][DEX]`) even where the mirrored
    exemplar used a drifted order (e.g. `spinning-miraging-symposium-torque` ships `[DEX][BOD]`).

## Pre-existing drift discovered (OUT OF SCOPE here — optional reconciliation follow-ups)

Not touched by this artifact; recording for a future cleanup pass if you want corpus-wide consistency:

- **Token-order drift** vs C2: `paradox-symposium-whirl` (`[BOD][PDX][DEX]`), `symposium-torque` /
  `spinning-symposium-torque` / `spinning-miraging-symposium-torque` (`[DEX][BOD]`).
- **[PDX]-placement drift** vs C4: `stepping-ducking-paradox-blender` puts `[PDX]` on the stepping
  entry dex (`OP IN [PDX] [DEX] > DUCK [BOD] > ...`) instead of the paradox-blender base dex, unlike
  its `ducking-`/`spinning-ducking-paradox-blender` siblings.

All drift rows are ADD-correct; only their parity/ordering differs from the proposed canonical form.
