# Component-Ecology Audit — Reproducible Methodology

Read-only, the fourth structural audit, complementing `terminal-topology-audit/` (how tricks end), `entry-topology-audit/` (how tricks begin), and `body-topology-audit/` (what happens in flight). Where those count tricks, this counts **components**: which movement building blocks appear most frequently across the documented vocabulary. It proposes, promotes, and changes nothing.

## Scope (fixed)
Component frequency, not family membership. The question is "what movement components recur, and how often," counted at the atom level.

## Counting rule
**Occurrence-based.** A trick contributes one occurrence per component it contains; a trick with two op-in dexes contributes two op-in-dex occurrences. (Contrast the prior audits, which counted at most one trick per identity.)

## Source of truth
- **Formula atoms** from `operational_notation` (473 of 651 active tricks carry one): catches, dexes, dex-features, body tokens, entry sets, timing.
- **Ecosystem components** from curated `freestyle_trick_modifier_links` for set ecosystems and operator overlays that leave no atomic token; these are counted **per-trick** (membership), since they are not occurrence-bearing atoms.
- **Never `trick_family`.**

The two bases are not directly comparable; every row in the ranking is tagged `formula` (occurrence) or `membership` (per-trick).

## Extraction rules (per formula, split on `>`)
- **Terminal-Catch** — a surface token (`CLIP/TOE/INSIDE/SOLE/HEEL/KNEE/...`) at any position after the set.
- **Entry-Set** — the surface token at position 0.
- **Dexterity** — each `[DEX]` segment, keyed by side+direction (`op-in`, `op-out`, `same-in`, `same-out`) or `swirl-dex` for cross-body swirl dexes.
- **Dex-Feature** — the `XBD` (cross-body), `PDX` (paradox-dex), and `XDEX` tags carried on dexes/catches.
- **Body** — `SPIN`, `DUCK`, `DIVE`, `JUMP` `[BOD]` tokens.
- **Timing** — `(no plant while)`.
- **Set-Ecosystem / Operator-Overlay** — membership for pixie/fairy/stepping/atomic/quantum/nuclear and tapping/miraging/barraging/whirling/swirling.

## Classification (category badges)
Terminal-Catch · Dexterity · Dex-Feature · Body · Entry-Set · Timing · Set-Ecosystem · Operator-Overlay.

## Limitations
- **Named family components are not atoms.** mirage-dex, legover-dex, osis, whirl, butterfly are *compositions* (a dex pattern landing in a catch). They cannot be counted atomically without `trick_family` or an invariant map, so they are reported as compositions in the comparison section, not as rows.
- **Counting-basis split** between occurrence (formula) and per-trick (membership), marked per row.
- **Spin over-counts rotation:** the `SPIN` token (206) far exceeds the spinning ecosystem (78) because rotational bases carry a base spin; this is the body audit's conflation, surfaced again.
- **178 no-formula tricks** contribute no formula atoms.
- **Incomplete dex notation** (a `[DEX]` missing a side or direction) is flagged in `COMPONENT_DATA_FIX_CANDIDATES.md`.

## Reproducibility
Inputs: `freestyle_tricks(operational_notation, is_active)` and `freestyle_trick_modifier_links`. Constants: the surface vocabulary, the dex side/direction parse, the tag set, and the ecosystem list. The audit regenerates the occurrence ranking, the per-trick percentages, and the data-fix list deterministically.
