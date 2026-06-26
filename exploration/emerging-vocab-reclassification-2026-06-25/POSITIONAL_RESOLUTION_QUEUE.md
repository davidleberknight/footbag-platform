# Positional-resolution queue — 19 candidates (NOT promotions)

These 19 of the 24 "authoring candidates" are **positional variants of tricks that
already exist**: dropping the `far`/`near`/`ss` qualifier lands on an active
canonical (or an existing folk-canonical alias). None is a new canonical row.

## Doctrine

The deciding question for each is **not** "does the qualifier agree with the
existing SAME/OP marker?" — that is only *evidence*. The doctrine is:

> **Does the qualifier change the execution of the qualified component, or merely
> restate a side-relationship the canonical trick already implies?**

- **Execution changes → distinct-variant candidate** (a genuinely different move;
  curator equivalence-or-distinct ruling per §3a).
- **Execution does not change → alias** (the qualifier only makes an implicit
  relationship explicit).

Axes are orthogonal: **IN/OUT** is the dex's own rotational direction (not at issue);
**NEAR/FAR/ss** is the **SAME/OP** relationship of a component to its neighbour — the
only axis the qualifier touches. Evidence convention (confirm): `far` = OP, `near`/
`ss` = SAME. Agreement is strong evidence of "no execution change," disagreement of
"yes," but the execution read governs.

| # | Candidate | Qualified component | Existing marker | Qualifier | Execution changes? | Recommendation |
|---|---|---|---|---|---|---|
| 1 | Clipper Ducking far Whirl | whirl dex | OP | far (OP) | **No** — whirl already executes OP; "far" restates it | **Alias** of `clipper_ducking_whirl` |
| 2 | Clipper Ducking far Drifter | drifter dex | OP | far (OP) | **No** — already OP | **Alias** of `clipper_ducking_drifter` |
| 3 | Clipper Diving **near** Whirl | whirl dex | OP | near (SAME) | **Yes (plausible)** — SAME-side whirl is a different leg path than the OP whirl | **Distinct-variant candidate** (manual) |
| 4 | Clipper Ducking far Blender | blender dex | OP | far (OP) | **No** — already OP | **Alias** of `clipper_ducking_blender` |
| 5 | Clipper far Symposium Whirl | whirl dex | OP | far (OP) | **No** — already OP | **Alias** of `clipper_symposium_whirl` |
| 6 | Clipper Ducking far Symposium Whirl | whirl dex | OP | far (OP) | **No** — already OP | **Alias** of `clipper_ducking_symposium_whirl` |
| 7 | Spinning far Symposium Whirl | whirl dex | OP | far (OP) | **No** — already OP | **Alias** of `spinning_symposium_whirl` |
| 8 | Toe **ss** Symposium Swirl | swirl dex | SAME | ss (SAME) | **No** — every component already SAME-side | **Alias** of `toe_symposium_swirl` |
| 9 | Toe Spinning **near** Torque | torque dex | OP | near (SAME) | **Yes (plausible)** — SAME-side torque dex changes the move | **Distinct-variant candidate** (manual) |
| 10 | Far Reverse Whirl | whirl dex | OP | far (OP) | **No** — rev-whirl already OP | **Alias** of `rev_whirl` |
| 11 | Far Reverse Swirl | swirl dex | OP | far (OP) | **No** — rev-swirl already OP | **Alias** of `rev_swirl` |
| 12 | Surging **far** Mirage | mirage dex | SAME | far (OP) | **Yes (plausible)** — OP-side mirage dex is a different execution than the SAME bare form | **Distinct-variant candidate** (manual) |
| 13 | Surging **far** Whirl | whirl dex | SAME | far (OP) | **Yes (plausible)** — OP-side whirl dex changes the move | **Distinct-variant candidate** (manual) |
| 14 | Surging Ducking far Blender | blender dex | OP | far (OP) | **No** — already OP | **Alias** of `surging_ducking_blender` |
| 15 | Miraging far Legover | legover dex | OP | far (OP) | **No** — already OP | **Alias** of `double_leg_over` (≡`miraging_legover`) |
| 16 | Pixie far Butterfly | butterfly dex | OP | far (OP) | **No** — already OP | **Alias** of `dimwalk` (≡`pixie_butterfly`) |
| 17 | Pixie far Drifter | drifter dex | OP | far (OP) | **No** — already OP | **Alias** of `smoke` (≡`pixie_drifter`) |
| 18 | Stepping **near** Drifter | drifter dex | SAME | near (SAME) | **No** — already SAME | **Alias** of `tombstone` (≡`stepping_drifter`) |
| 19 | Stepping **near** Torque | torque dex | SAME | near (SAME) | **No** — already SAME | **Alias** of `grave_digger` (≡`stepping_torque`) |

## Result

- **Alias (15):** execution unchanged — the qualifier only makes the existing
  side-relationship explicit. Wire as a `freestyle_trick_aliases` row on the
  canonical (qualifier preserved in the alias slug), pending the far/near convention
  confirmation.
- **Distinct-variant candidate (4) — rows 3, 9, 12, 13:** the qualifier flips the
  qualified component SAME↔OP, which plausibly changes the move rather than just
  labelling an implicit relationship. These are the four to scrutinise manually
  (read the move): confirm whether the flipped side-config is a real, distinct
  execution before deciding alias vs new distinct canonical. Curator owns this.

The `Execution changes?` field decides; the SAME/OP agreement is the evidence behind
it. Component-identification for rows 12–13 (the base dex sits after a set/spin
prefix) is the specific thing to verify when reading those two moves.

None enters `red_additions`.
