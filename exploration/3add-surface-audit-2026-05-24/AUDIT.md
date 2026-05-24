# 3-ADD Surface / Dex Audit (2026-05-24)

Audit of the queued ATW / orbit / heel variants the user flagged as "3-ADD promotion-ready". **Surfaces a doctrine block: the data shows these are 4-ADD, not 3-ADD, and the productive-multiplicity rule explicitly excludes most of them from canonical promotion.** No DB writes, no UI changes, no doctrine invention.

## Headline finding

The brief framed `triple-around-the-world` and `double-around-the-world-heel` as 3-ADD. **All available source data says 4 ADD** for both. The "3" in the brief likely refers to dex count, not ADD. The distinction matters: ADD counts every structural token (`[DEX]` + `[BOD]` + `[XBD]` + `[PDX]` + `[DEL]` + `[UNS]`), not just dex events.

Additionally, the project skill explicitly states:

> **Productive multiplicity (Double/Triple X) rejected as canonical per pt8 + CANONICALIZATION_POLICY §10 unless community-stabilized (existing: double-leg-over, double-around-the-world).**

`triple-around-the-world` is NOT on the exception list. Promoting it would extend the productive-multiplicity exception, which is a doctrine decision the curator owns explicitly.

## Audit table

| Slug | Status | Cross-source ADD claims | Best notation candidate | Doctrine block |
|---|---|---|---|---|
| `triple-around-the-world` | NOT canonical · tracked_names + fborg-4add + fm + Stanford | fborg=4 · fm=4 · Stanford=4 · PB=3 (dex-count outlier, non-authoritative) | `TOE > SAME IN/OUT [DEX] > SAME IN/OUT [DEX] > SAME IN/OUT [DEX] > SAME TOE [DEL]` (4 brackets = 4 ADD ✓) | Productive-multiplicity rule (skill §1). Curator override required to promote. |
| `triple-atw-in-out` | NOT canonical · tracked_names + fm-inventory | fm=4 | (none authored) | Same as triple-ATW |
| `triple-atw-out-in` | NOT canonical · tracked_names + fm-inventory | fm=4 | (none authored) | Same |
| `triple-atw` (alias) | NOT canonical · passback_intake + Stanford | PB=3 (dex-count) · Stanford=4 | Stanford `Z.+1+1+1+Z` | Same; also a slug aliased to triple-around-the-world |
| `double-around-the-world-heel` (aka DATW-heel) | NOT canonical · fm + fborg-4add | fm=4 · fborg=4 | `TOE > SAME IN/OUT [DEX] > SAME IN/OUT [DEX] > SAME HEEL [UNS] [DEL]` (4 brackets = 4 ADD ✓) | Hedged: "Whether DATW-heel is a canonical trick or a heel-stall variant of DATW" |
| `double-around-the-world` (DATW) | **Already canonical** at 3 ADD | `TOE > SAME IN [DEX] > SAME IN [DEX] > SAME TOE [DEL]` (3 brackets) | (no work) | — |
| `around-the-world` (ATW) | **Already canonical** at 2 ADD | `TOE > SAME IN/OUT [DEX] > SAME TOE [DEL]` (2 brackets) | (no work) | — |
| `heel-stall` | **Already canonical** at 1 ADD | `[set] > heel` (informal — no brackets per stall-not-kick convention) | (no work; 1-ADD foundational stall already covered in alt-surfaces subsection) | — |
| `orbit` | Already canonical at 2 ADD but **op_notation EMPTY** | — | (none cross-source identifiable) | Backfill candidate; needs curator notation. |

## Formula / notation review (Part C)

### triple-around-the-world (cross-source: 4 ADD)

Modifier arithmetic + bracket-count:
- 3 dex events + 1 terminal stall = 4 ADD per the canonical-bracket convention
- Stanford shorthand `Z.+1+1+1+Z` parses to 4 events (3 in-out dexes + toe-set terminal)
- fm-symbolic-grammar derivation: `dex(1) + dex(1) + dex(1) + stall(1) --> 4 ADDs`
- PassBack dex-count = 3 (does NOT count the terminal stall; treated as non-authoritative per the PassBack-outlier rule)

**Recommendation:** Triple-ATW is structurally a 4-ADD canonical row WHERE the productive-multiplicity exception applies. The curator's existing precedent has been to ALLOW `double-X` for `double-leg-over` and `double-around-the-world` as community-stabilized; the same logic could extend to `triple-around-the-world` if the curator judges it community-stabilized. The skill's exception list would need an explicit update.

### double-around-the-world-heel (cross-source: 4 ADD)

Modifier arithmetic + bracket-count:
- 2 dex events + heel terminal + `[UNS]` (unusual surface flag) + `[DEL]` = 4 ADD
- fm-symbolic-grammar derivation: `dex(1) + dex(1) + unusual surface(1) + stall(1) --> 4 ADDs`
- The `[UNS]` (Unusual Surface) flag is the +1 contribution from heel being a non-toe non-clipper landing

**Recommendation:** If promoted, this is a 4-ADD canonical row with `base_trick=double-around-the-world` (canonical) AND a heel-terminal modifier-style accounting. The `[UNS]` token convention is consistent with the dual-convention rule. Curator decision needed:

- Promote as standalone (`double-around-the-world-heel` slug, 4 ADD)?
- Treat as a heel-stall-variant alias on DATW (no new canonical row)?
- Defer entirely?

If promoted, the canonical-bracket form is `TOE > SAME IN/OUT [DEX] > SAME IN/OUT [DEX] > SAME HEEL [UNS] [DEL]`.

### Does heel terminal contribute +1?

Per Wave Alpha precedent (Phase 6 backfill of `heel-stall` itself at 1 ADD with notation `[set] > heel`) AND per the dual-convention rule (every `[BRACKET]` = +1), the heel terminal IS counted via the `[UNS]` + `[DEL]` token pair. Net contribution: +2 relative to a no-terminal trick, +1 relative to a normal toe/clipper stall.

**This is consistent with the project's existing handling of unusual-surface terminals.** No new doctrine.

### Should orbit-family language be preferable?

The brief asked. `orbit` is canonical at 2 ADD but with empty op_notation. It's listed in `[[project_freestyle_core_atoms]]` as one of the 12 core atoms but the operational form has never been authored. Recommendation: backfill orbit's op_notation in a follow-on slice — it should look something like `TOE > SAME OUT/IN [DEX] > SAME TOE [DEL]` per the standard 2-dex pattern, but the entry/exit direction convention is curator territory. NOT auto-derived.

If orbit gets op_notation, then "orbit-family" framing becomes a more legible alternative to "ATW-family" framing for some pedagogical surfaces. This isn't a multiplicity doctrine question — orbit and ATW are distinct atoms.

## Surfaced doctrine questions (unresolved)

| # | Question | Owner | Stakes |
|---:|---|---|---|
| 1 | Does the productive-multiplicity exception extend to `triple-around-the-world`? | Curator | Adding 1 row + opening the door to other "triple" variants |
| 2 | If yes to (1), what about `triple-atw-in-out` / `triple-atw-out-in` as separate canonical rows? Or aliases? | Curator | Naming-density vs alias-density tradeoff |
| 3 | `double-around-the-world-heel` — promote as standalone or defer? | Curator | If promoted, sets precedent for heel-variants of other dex compounds (e.g. double-leg-over-heel?) |
| 4 | `orbit` op_notation backfill — what's the canonical-bracket form? | Curator | Foundational atom with notation gap; small backfill but needs entry/exit direction call |
| 5 | If heel-variant rows are NOT promoted as canonical, where do they surface? Per Wave Beta logic they'd appear in `freestyleTrackedNames.ts` only. | Curator (data-routing) | Reach for end users |

## Pedagogical / educational framing (Part D)

The brief said Movement System view should increasingly explain "how freestyle departs from standard topology". The new alternative-surfaces subsection (this slice, Part A) is a direct response. Concrete framing now in production:

- **Sole and heel** — foot-edge surfaces. The bag rests on bottom or back of the foot instead of the top.
- **Inside and outside** — side-of-foot stall surfaces. Foundational beyond toe and clipper; most compound tricks visit these in transit but rarely terminate on them.
- **Head, neck, and shoulder** — upper-body stalls. Balance shifts from leg control to torso and head control.
- **Cloud and knee** — leg-surface stalls beyond the foot. Demand precise leg-angle control.
- **Flying and airborne variants** — the body becomes airborne, either entering from a jump or leaving the ground during the trick.

Each grouping is framed as a *different balance/control regime*, not a novelty bucket. The introduction explicitly disavows novelty framing: "Each group below is a different balance/control regime, not a novelty bucket."

## What this audit explicitly does NOT do

- ❌ Promote any new canonical row (all promotions surfaced are blocked on curator doctrine)
- ❌ Backfill `orbit` op_notation (needs curator decision on entry/exit direction)
- ❌ Auto-resolve productive-multiplicity for triple-X
- ❌ Invent a "heel terminal counts as ADD" or "[UNS] = +1" doctrine (both are already established conventions; this audit just confirms they apply consistently here)
- ❌ Add UI for the queued tricks (none promoted means none need UI yet)

## What this audit DOES do

- ✅ Surfaces the brief's "3-ADD" framing as actually 4-ADD per cross-source consensus
- ✅ Identifies the productive-multiplicity rule as the active doctrine block for triple-X
- ✅ Identifies the canonical-vs-variant question as the active doctrine block for DATW-heel
- ✅ Identifies `orbit` op_notation backfill as a small future cleanup opportunity
- ✅ Pairs with Part A's implementation (alternative-surfaces subsection now live on /freestyle/tricks?view=movement-system) to give the curator a concrete educational home for the surface-variant story
