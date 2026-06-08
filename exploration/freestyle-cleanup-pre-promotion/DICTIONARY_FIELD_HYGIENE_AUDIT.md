# Dictionary Field Hygiene Audit (Part 1)

Read-only. Scans every active trick's ADD/JOB/notation fields for editorial prose that belongs in detail-card prose or provenance, not in the structural list fields.

## Where the prose lives
The dictionary's "ADD:" line renders the `derivation` field of `src/content/freestyleResolvedFormulas.ts`. The DB columns (`adds`, `operational_notation`, `jobs_notation_normalized`) are clean; the commentary is appended into `derivation`, mixing ADD math with prose. The resolved-formula entry already has clean homes for prose: `operator`, `provenance`, and the DB `description`.

- 261 entries carry a `derivation`.
- **JOB fields: 0 prose hits** (every `jobs_notation_normalized` is pure notation). No JOB cleanup needed.
- 11 `derivation` fields flagged, in three classes below.

## Class A - clear editorial commentary (STRIP; 3)
The math is structural; the trailing clause is editorial and already stated in another field, so the fix is to remove it, not relocate it.

| slug | current `derivation` | proposed clean | where the prose already lives |
|---|---|---|---|
| around-the-world-kick | `dex(1) = 1 ADD; around-the-world without its terminal stall` | `dex(1) = 1 ADD` | `operator: 'kick (terminal stall removed)'` |
| double-around-the-world-heel | `dex(2) + heel-stall(1) = 3 ADD; terminal-surface variant of double-around-the-world` | `dex(2) + heel-stall(1) = 3 ADD` | `base: 'double-around-the-world'` + the heel-stall(1) term |
| butterfly-kick | `bod(1) + dex(1) = 2 ADD - jump + outward dex; kick with no terminal clipper-delay (historical name only, not butterfly-family structure)` | `bod(1) + dex(1) = 2 ADD` | `operationalNotation` (jump + out dex) + the `red_corrections` trick_family note ("lacks butterfly's terminal clipper-delay ... not a butterfly-family member") |

No information is lost: each stripped clause is redundant with an existing structural field. If a curator wants the gloss visible, the destination is the DB `description` (already populated: "Jumping outward-dex kick; no terminal stall."), never the ADD field.

## Class B - structural glosses (REVIEW; 4)
A parenthetical that expands the formula terms into words. Structural, not editorial, so arguably acceptable in place; the curator decides whether the gloss stays or moves to a structural note. Not recommended for the minimal commit.

| slug | current `derivation` |
|---|---|
| eclipse | `bod(1) + del(1) + dex(1) = 3 ADD (jump + mid-flight inside delay + outward dex)` |
| double-over-down | `[DEX] + [DEX] + [XBD] + [DEL] = 4 ADD (two same-side OUT dexes from toe set ending opposite-leg clipper)` |
| down-double-down | `[DEX] + [DEX] + [XBD] + [DEL] = 4 ADD (clipper-set entry: OP/SAME dex alternation between two same-side clippers)` |
| ricochet | `[DEX] + [DEX] + [XBD] + [UNS] + [DEL] = 5 ADD (two same-direction OUT dexes from toe set ending opposite-side sole/flapper)` |

## Class C - math qualifiers (KEEP; 4, false positives)
The parenthetical is part of the ADD accounting (the rotational / non-rotational bonus), fully structural. Leave unchanged.

| slug | `derivation` |
|---|---|
| fury | `furious(+2 rotational) + paradox(+1) + mirage(2) = 5 ADD` |
| atomic-torque | `atomic(+2 rotational) + torque(4) = 6 ADD` |
| predator | `atomic(+1 non-rotational) + dlo(3) = 4 ADD` |
| omelette | `atomic(+1 non-rotational) + illusion(2) = 3 ADD` |

## Minimal fix plan
1. Keep ADD math structural only: strip the Class A trailing clauses (3 `derivation` edits in `freestyleResolvedFormulas.ts`). Pure content edits, reversible.
2. Keep JOB notation structural only: no change needed (already clean).
3. Move commentary: no relocation required, the prose is already in `operator` / `provenance` / `description` / red_corrections. Do not delete the existing prose fields.
4. Class B and Class C are out of the minimal commit; B is curator-review, C stays.

### Side observation (out of scope, noted not actioned)
Several `provenance` strings in the same file carry sprint/Red/doc-path prose (e.g. "Surfaces Red Q K-1..K-3 in CLEANUP_AUDIT.md", dated promotion notes). That is the `provenance` field, not a structural list field, so it is outside this audit's ADD/JOB scope; flagged only because it would also fail the comment-hygiene rule if it were code prose.
