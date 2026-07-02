# Doctrine frontier — minimum decision set, 2026-07-02

Read-only audit of every held trick after the Day-2 promotions, **excluding** parser
limitations and missing-notation backfills (authoring work, not doctrine). Derived fresh from
the regenerated `freestyleObservationalUniverse.ts` (1049 rows: ready 2 / frontier 120 /
doctrine 72 / folk 526 / parser 329), the live DB, and the open decision packets.

## Scope facts

- Held rows in the doctrine-relevant sections (ready + frontier + doctrine): **194**.
- Of those, roughly 20 are authoring-only once existing rulings are applied (furious = barraging
  settled: 6; nuclear rows that are neither positional nor identity-gated: ~7; misc settled
  compounds: ~7). They need no decision and are excluded below.
- The folk section (526) is mostly alias/dedup process work (443 alias-bucket rows), not
  doctrine; only its undefined-operator subset (~54 name-hits) appears below.

## The decision tree

Each leaf is ONE decision. Yields are promotable-or-reconcilable rows unlocked. Decisions are
ordered so that no decision depends on one below it.

```
Is the held row blocked by (A) an ADD-determination rule, (B) an identity/equivalence,
or (C) a missing operator definition?

A. ADD-DETERMINATION RULES
├── D1. Blurry expansion predicate ................................ yield ~60  [RED/CURATOR]
│     When a blurry-named trick expands to stepping(+1) vs stepping+paradox(+2),
│     what property of the base decides it? (Packet:
│     exploration/blurry-decision-packet-2026-06-30/PACKET.md — 5 data points fit
│     several predicates; ripwalk is the only negative case; NOT derivable from corpus.
│     Zero blurry frontier rows carry a source ADD, so no partial unlock exists.)
│     Unlocks: 56 blurry frontier rows + 4 blurry-zulu stacks (those also need D4).
│
├── D2. Down/barfly 2x2 grid ratification + embedded-base rule .... yield ~32  [RED, packet ready]
│     Two sub-questions, one packet (RED_PACKET_A1_REVISED, adversarially audited):
│     Q1 ratify the four-cell grid (all four bases already platform rows);
│     Q2 one-line rule: which frame names the base of an operator compound.
│     Drains the 46-row dod-ddd cluster: ~12 mechanical promotions, ~17 dedups/aliases,
│     3 shipped base-label corrections (incl. Shooting Star); 7 rows stay unsourced
│     (ordinary backlog), 1 osis-gated (→ D6a). Also settles POD (with D8c video check).
│     ► The ~17 dedups map to already-active canonicals: actionable on precedent NOW,
│       before ratification, as alias/equivalence wiring.
│
└── D7. Same-operator-twice scoring ............................... yield 3    [RED, novel]
      Repeated operator in one compound (miraging twice). Only 3 rows exist corpus-wide,
      and 2 are the same trick (PB folk "Anonymous"). Doctrinally interesting,
      LOW priority by measured yield — do not spend a Red question on this early.

B. IDENTITY / EQUIVALENCE
├── D3. Positional-token mapping ratification ..................... yield ~30 + 13 record links
│     ONE meta-question: ratify FM "ss/os" == PB "near/far" == platform SAME/OP,   [CURATOR]
│     then run the existing positional-identity resolver process per row (doctrine
│     already exists; multi-component rows need curated equivalence rows, which is
│     curator-batch work, not new doctrine).
│     Unlocks: 29 positional frontier rows (nuclear 16, pogo 8, shooting 5) +
│     the 13 held "(ss)" record-linkage cases on the positional curator worklist.
│
├── D5. Set + bare-terminal vocabulary confirmation ............... yield ~7   [PRECEDENT]
│     "Pogo Clipper"-shaped rows (set operator + bare stall terminal). Existing rule
│     already states bare modifier names WITH a terminator are complete tricks
│     (kick-vocabulary scope). Needs one worked exemplar to fix the terminal
│     mechanic reading; then pogo/shooting ss-clipper-style rows author mechanically.
│
├── D8. Identification micro-queue ................................ yield ~6   [CURATOR/HISTORICAL]
│     a. Nuclear Osis vs Aeon Flux (unblocks 1 held promotion + 1 frontier row)
│     b. Clipper Symposium Whirl — what is it structurally
│     c. POD vs Dimmier — one video check (pairs with D2)
│     d. Torch-R-Rack near/far anchor (parked with evidence; blocks nothing else)
│     e. Standalone "Pogo" folk identity (bare set vs PB "Pogo far Mirage")
│
└── D9. Governance micro-calls (five one-liners) .................. yield ~7   [CURATOR]
      atomic-pickup vs scrambled-eggbeater · pixie-double-leg-over decomposition ·
      whirling on a [BOD]/[PDX]-leading base (parity: releases 2 DO-NOT-RE-PROMOTE
      holds) · sailing-gyro pairing · paradox-miraging pairing · rooting-vs-rooted
      naming (1 doctrine row).

C. OPERATOR DEFINITIONS (each is irreducibly its own question)
├── D4. Weaving/zulu multi-operator stacks ........................ yield 13 now  [PRECEDENT — no
│     NOT actually an open question: the shipped mirror rule (weaving/zulu compound   decision needed]
│     = matching ducking compound + non-scoring annotation) extends mechanically.
│     13 of the 19 held stacks have an active ducking mirror today; the other 6
│     wait on their ducking parent (cascade authoring, not doctrine).
│
├── D6a. "-osis" suffix operator rule ............................. yield ~24  [RED preferred;
│     One rule for what trailing "osis" does (20 folk hits + 3 frontier + 1        per-row precedent
│     dod-ddd-gated row). Per-row equivalence precedent exists (illusioning-osis    available]
│     = flux; reverse-swirling-osis = twirl), so individual rows can be resolved
│     case-by-case without the general rule — the rule just makes it mechanical.
│
├── D6b. blazing .......... yield 2 folk rows now (+9 canonical notation backfills)  [RED]
├── D6c. flailing ......... yield ~10 folk rows                                      [RED]
├── D6d. motion/locomotion  yield ~9 (5 folk + 3 frontier + 2 record links)          [RED]
├── D6e. slapping ......... yield ~8 (incl. Quantanamera weaving stack)              [RED]
├── D6f. blistering ....... yield ~7 (2 folk + 5 Wave-Alpha deferrals)               [RED]
├── D6g. alpine ........... yield ~5 (4 folk + Alpine Blurry Whirl, also D1-gated)   [RED]
├── D6h. arctic ........... yield 2                                                  [RED]
├── D6i. solestice ........ yield 1 record link                                      [RED]
└── D6j. eagle ............ yield 0 immediate (theory undefined; no intake schema)   [RED, defer]

Cross-cutting curator lever (mostly outside the held sections audited here):
D10. crossbody/XBD register + xbd-rake base — the skill's standing estimate is ~47 slugs,
     but most sit in the excluded parser long-tail; treat as a Red Wave item whose yield
     lands in a later parser-section drain, not in this frontier.
```

## Ranked by yield per decision

| # | Decision | Questions | Yield | Who |
|---|---|---:|---:|---|
| 1 | D1 blurry expansion predicate | 1 | ~60 | Red/curator (packet ready) |
| 2 | D2 down/barfly grid + base rule | 2 (one packet) | ~32 (+17 actionable now) | Red (packet ready) |
| 3 | D3 positional token mapping | 1 + batch process | ~30 + 13 records | Curator |
| 4 | D6a osis suffix rule | 1 | ~24 | Red (per-row precedent exists) |
| 5 | D4 weaving/zulu stacks | 0 | 13 | Nobody — precedent |
| 6 | D6c/d/e/f flailing·motion·slapping·blistering | 4 | ~34 combined | Red |
| 7 | D5 set+bare-terminal | 0–1 | ~7 | Precedent + 1 exemplar |
| 8 | D9 governance micro-calls | 5 | ~7 | Curator |
| 9 | D8 identification queue | 5 | ~6 | Curator/historical |
| 10 | D6b/g/h/i blazing·alpine·arctic·solestice | 4 | ~10 | Red |
| 11 | D7 same-operator-twice | 1 | 3 | Red (defer) |

## Resolvable WITHOUT Red (start immediately)

- **D4** weaving/zulu stack extension: 13 promotions, zero new assumptions (mirror rule).
- **D2 dedup half**: ~17 dod-ddd alias/dedup reconciliations onto already-active canonicals.
- **D3**: the ss/os↔near/far ratification is a curator call; the per-row process is defined.
- **D5**: covered by the existing bare-modifier-with-terminator vocabulary rule + one exemplar.
- **D6a per-row path**: individual osis rows via the flux/twirl equivalence precedent.
- **D9 + D8a/c/e**: curator judgment, no historical input needed beyond one video check.

Ceiling without Red: **~75-80 promotions/reconciliations.**

## Genuinely require Red or historical input

- **D1** (the single blurry predicate — highest-yield open question on the board).
- **D2 Q1/Q2 ratification** (evidence overwhelming, audit failed to falsify; cheap ask).
- **D6 operator definitions** (blazing, flailing, motion/locomotion, slapping, blistering,
  alpine, arctic, solestice, eagle, and the general osis rule) — community/historical
  knowledge, not derivable from the corpus.
- **D7** repeated-operator scoring (novel doctrine, low yield — bundle, don't lead).
- **D8b/d** identifications needing historical memory (Clipper Symposium Whirl, Torch-R-Rack).

Recommended Red Wave packet order: **D1 → D2 → D6a → D6c/d/e/f (batched) → D7 (rider)**.
