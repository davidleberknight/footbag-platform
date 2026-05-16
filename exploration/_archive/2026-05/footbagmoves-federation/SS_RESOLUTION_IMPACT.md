# SS Resolution Impact

Reconciliation report for Red's same-side (ss) ruling, dispatched 2026-05-11.

## Red's ruling (verbatim)

> "same-side (ss) does NOT contribute ADD weight in canonical IFPA decomposition math."

Selected branch: **(a)** in `RED_PT12_SS_SEMANTICS.md` §5. Hypothesis selected: **H1** in `RED_PT12_SS_SEMANTICS.md` §4.

## Pre-ruling hypotheses

The packet `RED_PT12_SS_SEMANTICS.md` posed three rival hypotheses against four FM cases (Hurl, Barfry, Nuclear Mirage same side, Maverick):

| Hypothesis | Claim | Status |
|---|---|---|
| **H1** | ss = +0 universally; FM math is non-canonical on cases A (Hurl) and B (Barfry); -1 deltas are FM data noise | **SELECTED** |
| **H2** | ss carries a conditional ADD impact specific to nuclear (e.g. `nuclear-ss = +1`, behaving like atomic) | rejected |
| **H3** | ss = +0 cosmetic flag, but FM uses an unrelated `nuclear=+1` convention that explains the -1 deltas | rejected (H3 collapses into H1 since the IFPA-side math behavior is identical) |

## Final disposition

- **IFPA additive decomposition remains authoritative.** `Compound ADD = sum(modifier add_bonuses) + base_trick adds`. Same-side does not appear in the additive sum.
- **ss is always +0** in any IFPA-side computation.
- **No new `ss` modifier row** is added to `freestyle_trick_modifiers`.
- **No `nuclear-ss` ontology branch** is created. Nuclear remains `+2` per pt10 in all contexts.
- **No parser or modifier-table changes** required.
- **FM rows where FM-ADD diverges from IFPA-additive on ss grounds remain federation_math_divergences** — preserved as folk-alias evidence, never as IFPA canonical re-mapping.

## Implementation consequences

| Surface | Action |
|---|---|
| `freestyle_trick_modifiers` table | No change. `ss` does not enter the table. |
| `freestyle_tricks.adds` for any existing row | No change. Hurl/Barfry/Godzilla are not in the IFPA dictionary; their FM-side names map to no canonical IFPA row whose ADD would shift. |
| Parser (`scripts/parse_freestyle_notation.py`) | No change. Parser reads `canonical_name` only; no ss-handling code path. |
| Editorial-decomposition surface | No change. Modifier-link rows continue to drive structural decomposition. |
| Federation reconciliation pipeline | New convention: FM rows with `X ss Y` technical_name format keep their FM-ADD if it equals IFPA-additive (canonical_equivalent class); if it diverges, the row enters the **federation_math_divergence** class and is documented but not adopted. |
| pt12 queue | Item 4 (Barfry "Nuclear ss" ADD-math) **closed** as resolved federation divergence. |
| Wave-2 ready-after-Red rows | Hurl + Casket Tier-3 inserts: Hurl can now be slotted as an alias-only entry (no Wave-2 row creation); Casket remains blocked on Q4 (fairy vocabulary), independent of SS ruling. |

## Permanently out of scope

- **No `nuclear-ss` modifier or any ss-derived modifier** ever enters `freestyle_trick_modifiers`.
- **No editorial re-mapping** of `Nuclear ss X` rows to `Atomic X` form (H2 branch b2 was a candidate disposition; rejected by Red's selection of branch (a)).
- **No parser logic** for ss handling.
- **No FM-math adoption** for any divergent row.
- **No retro-edit** of pt10 nuclear=+2 ruling.
- **No retro-edit** of pt11 blurry=+1, mobius=Spinning Torque, blender=Whirling Osis rulings.

## Affected rows

### "Nuclear ss X" rows (federation_math_divergence — all -1 delta)

Three rows total. Hurl + Barfry were in the original packet; **Godzilla** is newly surfaced by this pass.

| FM term | FM technical_name | FM ADD | IFPA additive | Delta | Notes |
|---|---|---|---|---|---|
| Hurl | Nuclear ss Whirl | 4 | nuclear(+2) + whirl(3) + ss(+0) = **5** | **-1** | Confirms Case A from packet |
| Barfry | Nuclear ss Butterfly | 4 | nuclear(+2) + butterfly(3) + ss(+0) = **5** | **-1** | Confirms Case B from packet; pt12 item 4 |
| Godzilla | Nuclear ss Dyno | 5 | nuclear(+2) + dyno(4) + ss(+0) = **6** | **-1** | Newly surfaced — matches the pattern; same disposition as Hurl/Barfry |

The curated `legacy_data/inputs/curated/tricks/fm_alias_terminology_extract.csv` lists
Barfry as "Nuclear far Butterfly" rather than "Nuclear ss Butterfly". The
authoritative FM inventory (`legacy_data/out/footbagmoves_inventory.csv`)
records "Nuclear ss Butterfly" — the curated extract diverges from the
authoritative inventory on the operator string. Worth a curation-extract
review pass separately; does not affect the SS ruling's disposition for Barfry.

### "Pixie ss X" rows (canonical_equivalent — delta 0 under SS=+0)

Three rows in the inventory. All match IFPA additive cleanly once SS=+0 is applied.

| FM term | FM technical_name | FM ADD | IFPA additive | Delta | Notes |
|---|---|---|---|---|---|
| Maverick | Pixie ss Osis | 4 | pixie(+1) + osis(3) + ss(+0) = **4** | **0** | Case D from packet; confirms H1 |
| Catacomb | Pixie ss Drifter | 4 | pixie(+1) + drifter(3) + ss(+0) = **4** | **0** | Newly surfaced |
| Tap Dance | Pixie ss Original Tap | 4 | pixie(+1) + tap(3) + ss(+0) = **4** | **0** | Newly surfaced; "Original Tap" presumably maps to canonical tap (mirage + tapping) |

### "X ss Y" rows blocked on independent vocabulary issues (unresolved_other_reason)

These rows contain `ss` but their classification depends on resolution of a SEPARATE FM-vocabulary modifier (fairy / leaning / phasing / barraging / flailing / railing / clipper-set) that is not in IFPA's modifier table. The SS ruling does NOT unblock them; they remain pending Q4 (FM modifier-vocabulary adjudication) or further ontology decisions.

| FM term | FM technical_name | FM ADD | Blocking modifier |
|---|---|---|---|
| Casket | Fairy ss Drifter | 4 | fairy (Q4) |
| Flaming Homer | Fairy ss Eggbeater | 4 | fairy (Q4) |
| Glaucoma | Fairy ss Double Legover | 4 | fairy (Q4) |
| Park Avenue | Fairy ss Butterfly | 4 | fairy (Q4) |
| Leaning Jowler | Leaning ss Mirage | 4 | leaning (FM-vocab, not in IFPA) |
| Phase | Phasing ss Mirage | 4 | phasing (FM-vocab) |
| Down Double Down | Clipper set ss Double Over Down | 4 | clipper-set modifier convention |
| Arch Nemesis | Barraging ss Double Double Down | 6 | barraging (FM-vocab) |
| Bill & Ted's Bogus Journey | Flailing ss Symposium Double Legover | 6 | flailing (FM-vocab) |
| Compound Fracture | Railing ss Double Legover | 6 | railing (FM-vocab) |

For all of these, the SS=+0 rule applies — but until the blocking modifier resolves, IFPA additive cannot be computed.

### 54-row "(same side)" display-suffix cohort

Distinct from the technical-name `X ss Y` pattern: the same-side cohort uses
"(same side)" as a display-name suffix. Per `legacy_data/out/footbagmoves_inventory_same_side.csv`. Examples: "Butterfly (same side)", "Nuclear Mirage (same side)", "Pixie Drifter (same side)".

The SS=+0 ruling makes this suffix a purely descriptive/positional marker
with no ADD impact. Per-row IFPA additive computation depends on each row's
remaining decomposition (the part before the suffix). Most rows in this
cohort are expected to resolve as **canonical_equivalent** when their
non-ss decomposition matches a known IFPA modifier+base combination.

Notable exception:
- **Nuclear Mirage (same side)** (FM=4) → maps to IFPA sumo. Sumo's IFPA-additive is 5 per pt9 X-Dex (nuclear + mirage + X-Dex). The FM=4 vs IFPA=5 delta here is a **pt9 X-Dex issue, NOT a SS issue**. Classified as `unresolved_other_reason` (pt9 X-Dex). The SS ruling does not unblock this row.

Per-row classification of the remaining 54 cohort entries is downstream
federation-review work; not enumerated here. The class disposition under SS=+0
is documented and machine-readable in `FM_MATH_DIVERGENCES.csv` as a roll-up
entry.

## Newly cataloged: "X ss Y" pattern in FM inventory

The packet's four cases (Hurl, Barfry, Nuclear Mirage same side, Maverick)
captured the canonical examples but did not enumerate the FM inventory's
broader `X ss Y` use. This pass surfaces **15 distinct rows** with the
`<modifier> ss <base>` technical-name format:

- 3 Nuclear-ss (federation_math_divergence)
- 3 Pixie-ss (canonical_equivalent)
- 4 Fairy-ss (unresolved_other_reason — fairy Q4)
- 5 other-modifier-ss (unresolved_other_reason — FM-vocab modifier)

Combined with the 54-row "(same side)" display cohort, the SS ruling
governs a broader scope than the four cases in the original packet.

## Implications for future federation work

1. **Federation reconciliation pipeline** can now classify any new `X ss Y` FM row deterministically: compute IFPA additive with ss=+0; if it matches FM-ADD, mark canonical_equivalent; if not, mark federation_math_divergence.
2. **No need to dispatch Red on future ss questions**. The rule is settled.
3. **FM-vocabulary modifiers (fairy / leaning / phasing / barraging / flailing / railing / etc.) remain the next blocker**. Q4 in the existing packet would resolve most of them. Until then, the unresolved_other_reason class collects rows that *would* be classifiable if the modifier were known.

## Files produced

- `exploration/footbagmoves-federation/SS_RESOLUTION_IMPACT.md` (this report)
- `exploration/footbagmoves-federation/FM_MATH_DIVERGENCES.csv` (machine-readable registry)

## What this report does NOT do

- No DB writes. No modifier-table additions. No new dictionary rows.
- No parser changes. No editorial-decomposition shifts.
- No adoption of FM ADD values. No "fix" of FM data.
- No prejudgment of fairy / leaning / phasing / barraging / flailing / railing / clipper-set vocabulary (Q4-class questions remain pending separate Red review).
- No re-litigation of pt9 X-Dex (sumo case) or pt10 nuclear=+2 baseline.
