# "Notation blocked" bucket — source audit (2026-06-20)

The Emerging Vocabulary "Notation blocked" metric counts the observational-universe rows whose
`failureClass = 'unknown-modifier-token'` (non-alias). Like the Pogo / Terraging / Blurry rows, the
flag turns out to be **stale and overbroad**: it was assigned when the universe was generated, before
much of the operator vocabulary settled. Audited against the **current** known-token vocabulary
(registered modifiers + every word in an active canonical trick name + the settled operators/sets).

## Result (246 rows)

| bucket | rows | meaning |
|---|---:|---|
| **Authorable — all tokens now known** | **66** | the unknown-token flag is stale; structure is fully resolvable |
| **Authorable — only notation-leakage abbreviations** | **38** | the only "unknown" tokens are `dex`/`xbd`/`bs`/`dod`/`inward` — known notation, leaked into the name, not unknown operators |
| **Genuinely blocked — undefined folk operator** | **142** | a real undefined operator token remains |

**→ 104 of 246 (42%) are authorable, not blocked.** They should leave the notation-blocked count
(into Structurally-ready / Needs-authoring), exactly as Pogo/Terraging did.

## The genuine 142 reduce to a small, enumerable operator backlog

The 142 are not 142 independent blocks — they collapse to **56 distinct undefined operator tokens**,
and the head is heavily concentrated:

```
26 zulu      11 symple    9 slapping   6 fusing    6 neutron   6 phasing
 5 slaying    5 sonic     4 twinspinning  3 frootie  3 fyro    3 leaning
 3 twisted    3 twisting  ... then a long one-occurrence tail
```

- **~13 tokens cover ~75 rows.** Defining those folk operators (curator) unblocks the bulk; `zulu`
  alone is 26 rows.
- The remaining ~43 tokens are single-occurrence folk names, and several are **data-quality typos in
  the source, not real operators**: `butterfy`→butterfly, `baragging`→barraging, `royall`→royale,
  `eggbeating`→eggbeater, `downing`→down. Those are spelling fixes, not doctrine work.

## Recommendation

1. **Reclassify the 104 authorable rows** out of "Notation blocked" (drop the stale flag). The honest
   notation-blocked count is **~142, not 236**, and even that overstates it (typos + one-offs).
2. **The genuine blocker is a curator operator-definition list, not 142 blocks** — prioritize the ~13
   high-frequency tokens (zulu first).
3. **Fix the source typos** so misspelled-operator rows stop inflating the bucket.

## Implementation options (for the reclassification)

- **Generator re-run** (cleanest, durable): refresh `failureClass` in
  `build_observational_universe_content.py` against the current vocabulary, so a now-known token no
  longer reads as unknown. Regenerates `freestyleObservationalUniverse.ts`.
- **Service-side re-derivation** (reversible, no regen): give the classifier the current known-token
  set and split `notation` into "authorable (stale flag)" vs "genuinely blocked" at render time.

Either way the metric stops counting 236 names as notation-blocked when 104 are authorable now.
