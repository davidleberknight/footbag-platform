# Pre-Red / Pre-Adrian Cleanup Audit (2026-05-25)

Conservative low-hanging-fruit pass on the foundational vocabulary before external review. Per the curator directive — focus only on ≤4 ADD, mechanically derivable, obvious topology relationships; do NOT open new doctrine.

## 0. Posture

After Bucket A backfill (committed 2026-05-25, 19 sibling-derived JOB rows), most of the mechanical low-hanging surface is already resolved. The remaining "low-hanging" targets the curator listed split into three groups:

| Group | Count | Status |
|---|---|---|
| Already resolved in DB before this audit | 4 | dada-curve, quantum-whirl, paradox-high-plains-drifter, paradox-ripwalk — all have populated `operational_notation` |
| Resolved via this session's Bucket A backfill | 19 | See prior commit; covers ripwalk, paradox-drifter, paradox-blender, etc. |
| Not in DB — canonical promotion required | most of the rest | Out of scope per "no new doctrine complexity" |

The actionable surface remaining for this audit is narrower than the spec suggests. The deliverable is therefore primarily a structured report with explicit Red questions, plus the topology-family note (§C).

## A. Kick vs Stall normalization

### A.1 Curator-proposed rule

> Kick variants inherit the same operational topology as their stall/delay counterparts, but: remove terminal `[DEL]`, remove stall(1), preserve all other structural events.

Examples cited by curator: around-the-world = 2 → kick = 1 · butterfly = 3 → kick = 2 · clipper-stall = 2 → kick = 1 · sole-stall = 2 → kick = 1.

### A.2 Existing kick rows in DB

| slug | ADD (DB) | op_notation (DB) | fb.org reading |
|---|---|---|---|
| around-the-world-kick | NOT IN DB | — | 1 ADD `[bod]` in fborg-1add.txt |
| butterfly-kick | 3 | `SET > JUMP [BOD] > SAME or OP OUT [DEX] > OP CLIP [XBD]` | 2 ADD `[dex] [bod]` in fborg-2add.txt |
| clipper-kick | NOT IN DB (clipper itself is 1 ADD body kick) | — | 1 ADD `[bod]` in fborg-1add.txt |
| cloud-kick | 1 | `[set] > cloud kick` | 1 ADD `[bod]` in fborg-1add.txt — aligned ✓ |
| dragonfly-kick | 2 | `flying > dragonfly` | flying primitive with dex |
| sole-kick | 1 | `[set] > sole kick` | 1 ADD `[bod]` in fborg-1add.txt — aligned ✓ |

### A.3 Findings

- **fb.org confirms the curator's rule for 1-ADD primitives.** Around-the-world-kick, clipper-kick, sole-kick, cloud-kick all read as `[bod]` only (one body event, no dex, no stall) in fborg-1add.txt. ADD = 1.
- **fb.org confirms the curator's rule for butterfly-kick at 2 ADD.** fborg-2add.txt has butterfly-kick at `[dex] [bod]` = 2 ADD.
- **DB butterfly-kick is at 3 ADD** with `[XBD]` added. This is a doctrine disagreement between fb.org and the IFPA DB row — not a missing-data problem.
- **around-the-world-kick and clipper-kick are NOT canonical rows** in the IFPA dictionary. Adding them is canonical promotion work, outside this slice's scope.

### A.4 Concrete actions

None applied in this slice. Existing kick rows already have `operational_notation` populated (cloud-kick, sole-kick, butterfly-kick, dragonfly-kick).

### A.5 Red questions surfaced

| # | Question | Source of doctrine gap |
|---|---|---|
| K-1 | Should butterfly-kick read at 2 ADD (`[dex] [bod]`, fb.org reading) OR 3 ADD (current DB reading with `[XBD]`)? | fb.org / IFPA DB disagreement |
| K-2 | Should around-the-world-kick and clipper-kick be promoted to canonical IFPA dictionary rows (1 ADD each)? | They exist in fb.org corpus but not the IFPA canonical set |
| K-3 | If K-2 is yes, do they share `[bod]`-only operational notation across the kick family? | Follows from a uniform application of the curator-proposed rule |

## B. Low-hanging ≤4 ADD fb.org reconciliation

### B.1 Curator-listed targets — DB status

| Target | In DB? | adds | op_notation | Status |
|---|---|---|---|---|
| triple-around-the-world (triple-atw) | NO | — | — | Canonical promotion required |
| double-around-the-world-heel | NO | — | — | Canonical promotion required |
| dada-curve | YES | 4 | populated | Already resolved |
| toe-whirr | NO | — | — | Canonical promotion required |
| quantum-whirl | YES | 4 | populated | Already resolved |
| paradox-ripwalk | YES | 5 | populated | Already resolved (5 ADD — outside ≤4 budget but counted as resolved) |
| fairy-drifter | NO | — | — | Canonical promotion required |
| fairy-butterfly | NO | — | — | In fborg-4add.txt; canonical promotion required |
| fairy-whirl | NO | — | — | In fborg-4add.txt; canonical promotion required |
| pixie-opposite-clipper | NO | — | — | Canonical promotion required |
| toe-ripwalk | NO | — | — | In fborg-4add.txt; canonical promotion required |
| stepping-opposite-side-reverse-whirl | NO | — | — | Canonical promotion required |
| paradox-high-plains-drifter | YES | 5 | populated | Already resolved |

### B.2 Findings

- **9 of 13 targets are NOT canonical IFPA rows.** Promotion involves Red-additions CSV + loader 19 + curator approval — out of scope per "do not open new doctrine."
- **4 of 13 are already resolved in DB.** No action required.
- **fborg-4add.txt confirms** 4 of the missing canonicals (fairy-butterfly, fairy-whirl, toe-ripwalk, triple-around-the-world). They are documented but not promoted.

### B.3 Concrete actions

None applied in this slice. Canonical promotion is deferred to a separate slice with explicit curator approval.

### B.4 Red questions surfaced

| # | Question |
|---|---|
| B-1 | Should the four fb.org 4-ADD compounds (fairy-butterfly, fairy-whirl, toe-ripwalk, triple-around-the-world) be promoted to canonical IFPA rows? |
| B-2 | If promoted, are their operational notations the fb.org strings verbatim, or should they re-derive through IFPA operator grammar (paradox direction-flip variations, etc.)? |

## C. Wrap / hop-over / walk-over topology family note

### C.1 Per-trick state

| slug | adds | base | description | op_notation (DB) | fb.org ATAM |
|---|---|---|---|---|---|
| hop-over | 2 | hop-over (self) | "Jumping leg-over motion." | empty | `[bod] [del]` (fborg-2add) |
| walk-over | 2 | walk-over (self) | "Stepping leg-over motion." | empty | matches fborg-2add "step over" entry `[del] [dex]` |
| wrap | NOT IN DB | — | — | — | `[del] [dex]` (fborg-2add) — "Inside delay the footbag and pull the footbag around your support leg into a cross body position." |

### C.2 Shared chassis

All three are **2-ADD body+delay variants** on an inside-delay base. The bag is HELD on an inside delay; the body or leg does something while the delay is active.

### C.3 Classification — what distinguishes the three

| trick | body event | timing | plant / no-plant | direction |
|---|---|---|---|---|
| hop-over | jump (jump-with-body) | over a HELD inside delay | no-plant (body hops; support stays) | over-the-bag |
| walk-over | step (step-over with opposite leg) | over a HELD inside delay | plant (foot lands on opposite side of bag) | over-the-bag |
| wrap | pull the bag around the support leg | bag held throughout the pull | plant (support stays planted; pulling foot moves) | around-the-leg cross-body |

### C.4 Shared structure

- All three: held inside-delay anchor + one body or leg event = 2 ADD
- All three resolve into a cross-body or opposite-side position
- All three preserve the delay throughout the move (the bag is never released into the air)

### C.5 Distinct structure

- **hop-over** is the only one with a body-jump (`[bod]`)
- **walk-over** and **wrap** both read as `[del] [dex]` in fb.org but differ in the dex's intent: walk-over's dex passes the leg OVER the bag; wrap's dex pulls the BAG AROUND the leg
- **wrap** is the only one with cross-body terminal positioning as a structural goal

### C.6 Naming drift

The fb.org corpus uses "step over" for what the IFPA DB names walk-over. The curator may want to add `step-over` as an alias on the `walk-over` canonical row (one-line aliases entry) to make the fb.org → IFPA reading explicit. This is a small alias addition, not a doctrine change.

### C.7 Recommendation

**Do not canonicalize a merge.** The three are sibling 2-ADD variants on a shared inside-delay chassis, but they have structurally distinct events. They belong in a `[topology: held-delay-leg-over-family]` observational group — surface this on Compositional Sets or Movement Systems rather than collapsing them.

Possible curator action (deferred):
- Add `step-over` alias to walk-over canonical row
- Author operational_notation for hop-over (`SET > INSIDE [DEL] > (hop over) [BOD]`) and walk-over (`SET > INSIDE [DEL] > OP (step over) [DEX]`) — but these are curator-judgment derivations from fb.org descriptions, not pure sibling-grammar
- Consider promoting wrap to a canonical IFPA row (currently fb.org-only)

## D. Notation-pending status

### D.1 Bucket A — applied 2026-05-25

19 operational_notation rows applied via `RESOLVED_FORMULAS_SPRINT_1.operationalNotation` overlay. See prior commit `feat(freestyle): Bucket A derivation backfill`. Covers: ducking-whirl, spinning-whirl, stepping-whirl, paradox-drifter, paradox-torque, spinning-torque, paradox-blender, symposium-mirage, flail, blurrage, ripwalk, haze, bigwalk, atom-smasher, torque, omelette, witchdoctor, fury, spinning-symposium-whirl.

### D.2 Remaining notation-pending — analysis

Querying the active dictionary post-Bucket-A: tricks with empty `freestyle_tricks.operational_notation` AND no RESOLVED_FORMULAS overlay split into three groups (per `DERIVATION_AUDIT.md` Bucket classifications):

**Bucket B (curator review needed):** tapping-whirl, blurry-whirl, blurry-torque, predator, bedwetter, schmoe, blizzard, reverse-drifter, sole-survivor, fusion, plasma, jani-walker, terrage. Each has a structural ambiguity or PassBack folk-name dependency.

**Bucket C (Red Wave 2):** atomic-torque, blurry-torque, deeper torque-family compounds.

**Bucket D (intentionally unresolved):** barraging, blazing, ducking, gyro, paradox, spinning, stepping, symposium, tapping (modifier operators); pogo, rooted (zero-ADD set primitives); orbit, rake, surging, atomic, double-spin, furious, hop-over, quantum, sailing, walk-over, shooting, refraction, terraging, eclipse (set primitives and atom-class entries).

### D.3 Concrete actions for this slice

None — Bucket A already absorbed the safe mechanical derivations. The remaining buckets need curator review (B) or Red consultation (C) or are correctly classified as unresolved (D).

## E. Provenance distinction recommendation

### E.1 Current state

Operational notation provenance is captured as inline comments on each `operationalNotation` line. Examples from `freestyleResolvedFormulas.ts`:

```
operationalNotation: 'TOE > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]',  // Bucket A sibling-derivation per DERIVATION_AUDIT.md (2026-05-25); ducking-mirage precedent + whirl base; not Red-confirmed.
```

The provenance is human-readable but not structurally queryable.

### E.2 Recommended structure (deferred)

Add a `provenanceKind` field to the `ResolvedFormula` interface:

```typescript
type OperationalProvenance =
  | 'curator-authored'      // hand-written by the curator
  | 'sibling-derived'       // mechanical derivation from sibling precedent
  | 'fborg-derived'         // copied verbatim from fb.org corpus
  | 'red-confirmed'         // Red explicitly ratified
  | 'observational';        // appears in observational layer only

interface ResolvedFormula {
  // ...
  operationalNotation?: string | null;
  operationalProvenance?: OperationalProvenance;
}
```

This unlocks visible provenance badges on first-class cards (e.g. a small "sibling-derived" badge next to the JOB row vs a "Red-confirmed" badge for ratified rows). Deferred to a separate slice — out of "conservative cleanup" scope.

### E.3 Action for this slice

None. Inline-comment provenance is acceptable for now.

## F. UI / rendering cleanup recommendations

Survey-level findings; deferred to a separate UI-polish slice.

### F.1 Confirmed clean

- Tautological-chain suppression for `paradox-mirage`, `symposium-mirage`, `atomic-butterfly` is active (verified by `freestyle.first-class-rendering-parity.routes.test.ts`).
- Placeholder-description suppressor handles `X-modified Y` / `Popular freestyle trick.` / `Common freestyle trick.` consistently.

### F.2 Pending UI cleanup opportunities (not applied in this slice)

| Cleanup | Surface | Recommendation |
|---|---|---|
| BOD vs bod casing inconsistency | `freestyleResolvedFormulas.ts` operationalNotation values | Spot-check shows mixed: `(back) SPIN [BOD]` vs `(BACK) SPIN [BOD]` etc. Normalize to `[BOD]` lowercase parens — separate slice |
| UNS terminology | DB notation strings | Some use `[UNS]`, some use `[uns]`. Inconsistent. Defer to normalization slice |
| SAME / OP language uniformity | operationalNotation strings | Most consistent; spot-check confirmed |
| Duplicate operational text on first-class cards | dictionary-trick-card-first-class-row.hbs | None observed in the cohort I checked; if present, surface on Adrian review |

## G. Final deliverable summary

### G.1 Exact tricks newly resolved in this slice

**None.** The mechanical low-hanging fruit was absorbed by Bucket A backfill in this session's prior commit. This audit slice produces the report only.

### G.2 Exact tricks intentionally left unresolved

| Trick | Reason |
|---|---|
| around-the-world-kick, clipper-kick | Not in DB; canonical promotion required (Red questions K-2, K-3) |
| triple-around-the-world, fairy-butterfly, fairy-whirl, toe-ripwalk, toe-whirr, fairy-drifter, pixie-opposite-clipper, double-around-the-world-heel, stepping-opposite-side-reverse-whirl | Not in DB; canonical promotion required (Red question B-1) |
| wrap | Not in DB; canonical promotion required (deferred per §C) |
| hop-over, walk-over | Empty operational_notation; deferred per §C (curator-judgment derivations from fb.org) |
| butterfly-kick | Doctrine disagreement between fb.org (2 ADD) and IFPA DB (3 ADD); Red question K-1 |
| Bucket B/C tricks (tapping-whirl, blurry-whirl, blurry-torque, etc.) | Audit Bucket B/C — needs curator review or Red consultation |

### G.3 Before / after rendered examples

**No render changes in this slice.** Bucket A's render-before-after coverage (in the prior commit) handles all 19 resolved cards. This slice ships no new content.

### G.4 Remaining low-ADD inconsistencies noticed during audit

1. **butterfly-kick ADD disagreement** between fb.org (2) and DB (3) — Red question K-1
2. **step-over vs walk-over naming** — fb.org uses "step over"; IFPA uses "walk over" — possible alias addition (curator)
3. **wrap not canonical** but appears in fb.org corpus — canonical promotion candidate
4. **BOD casing inconsistency** in resolved-formula operationalNotation strings — UI normalization slice candidate

### G.5 Doctrine questions for Red Wave 2

| # | Question |
|---|---|
| K-1 | butterfly-kick: 2 ADD (fb.org `[dex] [bod]`) or 3 ADD (IFPA DB with `[XBD]`)? |
| K-2 | Should around-the-world-kick and clipper-kick be promoted to canonical IFPA rows (1 ADD each)? |
| K-3 | If K-2 yes: uniform `[bod]`-only operational notation across the 1-ADD kick family? |
| B-1 | Promote the four fb.org 4-ADD compounds (fairy-butterfly, fairy-whirl, toe-ripwalk, triple-around-the-world) to canonical rows? |
| B-2 | If B-1 yes: fb.org operational notation verbatim or re-derive via IFPA operator grammar? |
| W-1 | Should wrap be promoted to a canonical IFPA row at 2 ADD, joining hop-over and walk-over in the held-delay-leg-over family? |

---

**Audit produced 2026-05-25 pre-Adrian review. No DB writes; no content-module changes; no doctrine changes. Curator review required before any deferred item is applied.**
