# Mobius Recursive Showcase Mini-Batch (SCALE-7a)

One-row pilot promotion designed as the dictionary's first explicit
demonstration of the **multi-description equivalence pattern** the user
flagged after SCALE-6. Mobius's 4-name decomposition chain
(mobius / gyro torque / spinning ss torque / spinning ss miraging op osis)
is the cleanest worked example available.

## Row data

| field | value |
|---|---|
| slug | `mobius` |
| canonical_name | mobius |
| adds | 5 |
| trick_family | torque |
| base_trick | torque |
| modifier_links | gyro |
| aliases_json | `["gyro torque", "möbius", "moebius"]` |
| parser_status | exact_modifier_derived |
| computed_adds | 5 (math: torque 4 + gyro +1 = 5) |
| pilot state (pre-apply) | not pilot |

## Structural context

Five names that all resolve to the same row:

| layer | name | how derived |
|---|---|---|
| 0 (this row) | `mobius` | the IFPA dictionary slug |
| 0 (twin row) | `spinning-torque` | a separate IFPA dictionary row (SCALE-5 pilot) — same body mechanics via Gyro = Spinning ss equivalence |
| 1 (folk) | `gyro torque` | the FM/PassBack folk name; the modifier link in DB |
| 2 (Sets-tab unwound) | `spinning ss torque` | per Sets-tab `Gyro = Spinning ss` alternate-name + Red's `ss = +0` ruling |
| 3 (deep structural) | `spinning ss miraging op osis` | per the canonical `torque = Miraging Osis` decomposition; positional `op` disambiguates direction |

Math is consistent at every layer:
- gyro(+1) + torque(4) = 5
- spinning(+1) + ss(+0) + torque(4) = 5
- spinning(+1) + ss(+0) + miraging(+1) + op(+0) + osis(3) = 5

The pt11 ruling "mobius = Spinning Torque" formalized the equivalence at the
ontology level. The dictionary preserves both rows (mobius and spinning-torque)
for naming-tradition continuity.

## Cadence design

Foundation rows describe their own mechanic. Compound rows describe modifier-on-base. **Showcase rows describe the dictionary's structure itself.** Mobius's prose is necessarily more pedagogical than a typical pilot — the value here is the chain, not just the mechanics.

| section | rhetorical role |
|---|---|
| short_description | sets up the multi-name framing; positions mobius as one of multiple equivalent names |
| execution_summary | physical mechanics (same as spinning-torque pilot); explicit cross-reference to spinning-torque twin row + Sets-tab Gyro = Spinning ss + ss=+0 rule |
| learning_notes | the pedagogical centerpiece — explains the 4-layer chain explicitly + names the twin row |
| prerequisite_notes | torque base + spinning-torque twin + spinning-whirl cross-bridge |

Templated tells (all 0x):
- `Practitioners with clean` / `Practitioners coming from` — 0
- `tend to` — 0
- `is the foundation` — 0
- `From a toe set` opener — 0

Forbidden-term audit upfront:
- `Red`, `pt##`, `adjudication`, `federation-not-adoption`, `curator-reviewed-YYYY-MM-DD` — 0 (replaced "Red's ruling" with "the rule"; replaced "pt11's torque = Miraging Osis" with "the canonical torque = Miraging Osis decomposition")

## Draft

**short_description**
A 5-ADD torque compound — gyro layered on torque's rotational frame. Mobius is one of multiple equivalent names this trick carries in the dictionary; the others demonstrate progressively deeper decomposition through the Sets-tab and structural rulings.

**execution_summary**
Torque's miraging-osis rotational frame begins through the kick sequence; the gyro modifier adds an independent body-spin axis on top, orthogonal to torque's own rotation. The two axes turn together; the kick lands as both rotations resolve. Recovery unwinds both axes back to the supporting-leg anchor. Body mechanics are identical to spinning-torque (SCALE-5 pilot row) — per the Gyro = Spinning ss Sets-tab equivalence and the same-side = +0 ADD rule, gyro torque and spinning torque describe the same trick.

**learning_notes**
Mobius demonstrates the dictionary's multi-description equivalence pattern. Four names trace progressively deeper structural decomposition: `mobius` (the canonical row name); `gyro torque` (folk/PassBack); `spinning ss torque` (Sets-tab Gyro = Spinning ss alternate, with same-side carrying no ADD weight); `spinning ss miraging op osis` (deepest form, via the canonical torque = Miraging Osis decomposition). Each name describes the same trick at a different recursion depth. Spinning-torque (SCALE-5 pilot) is the structurally-equivalent twin row — same body mechanics under a different naming convention.

**prerequisite_notes**
Torque (4 ADD; SCALE-6 pilot) is the rotational base. Spinning-torque (5 ADD; SCALE-5 pilot) is the structurally-equivalent twin row — same body mechanics. Spinning-whirl (4 ADD; SCALE-2 pilot) demonstrates the dual-axis pattern on a different rotational base.

## Word counts

| section | count |
|---|---|
| short_description | 39 |
| execution_summary | 94 |
| learning_notes | 87 |
| prerequisite_notes | 44 |
| **total** | **264** |

Above the typical 150-180 range. Acceptable for a showcase row whose
pedagogical content (the chain) is the load-bearing value.

## Apply pipeline

Standard transaction-wrapped UPDATE pattern with audit + rollback under
`legacy_data/reports/scale7/`. Render verification on `/freestyle/tricks/mobius`
+ forbidden-term audit + spot-check that the prose surfaces the chain correctly
in the trick-detail layout.

## Files produced

- `exploration/freestyle-notation-grammar/SCALE7_MOBIUS_PROSE_DRAFTS.md` (this file)
- `exploration/freestyle-notation-grammar/SCALE7_MOBIUS_PROSE_APPLY.csv` (loader-ready)

No DB writes yet. Say "apply" to load.
