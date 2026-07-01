# Pogo modifier decision packet — 2026-06-30

**Question posed:** should `pogo` be treated as **+1** for this corpus, despite the registry
carrying +0? And which rows become mechanically promotable if approved?

**Analysis only. No canonical data, registry, or `red_additions` writes.**

---

## Headline: the decision is already ratified

The premise ("registry currently +0") is **stale.** `pogo` was adjudicated to **+1** and committed:

- **`freestyle/inputs/noise/trick_modifiers.csv`** now carries `pogo,1,1,set` with the note:
  *"Pogo modifier contributes +1: every active pogo compound scores its base +1, corroborated by
  footbag.org, FootbagMoves, and an extra scored dex in the operational notation. Curator
  adjudication overriding the earlier Red pt6 0-ADD modifier reading; the standalone pogo set trick
  stays 0 ADD."*
- Ratifying commit: **`3c94b098 data(freestyle): adjudicate pogo modifier to +1 (override Red pt6)`**.

So **no new curator/Red decision is required for `pogo = +1` itself** — it is settled and committed.
This packet therefore (a) documents the evidence confirming it, and (b) identifies the set that
becomes mechanically promotable now that the gate is satisfied.

---

## 1. Evidence — pogo as +1 vs the old +0

| line of evidence | reading |
|---|---|
| **Registry** (`trick_modifiers.csv`) | **+1** (committed; type `set`; `add_bonus=1`, `add_bonus_rotational=1`) |
| **Old Red pt6** | "pogo is a set and does not add ADD" (+0) — explicitly **overridden** by the curator adjudication |
| **Corpus (canonical compounds)** | all 10 `pogo_paradox_*` rows score **exactly base + 1** (see §2) |
| **Operational notation** | every canonical pogo row prepends `(no plant while) OP IN [DEX]` — **one extra scored `[DEX]`** = +1 by bracket-count |
| **External sources** | footbag.org + FootbagMoves corroborate +1 (per the adjudication note) |
| **Standalone `pogo` set trick** | stays **0 ADD** — only the *modifier* form is +1 (parallels `rooted,0,0,set`) |

The notation is the clean structural proof: the pogo-hop is a real scored dexterity, so a pogo
compound is genuinely one dex heavier than its base.

## 2. Already-canonical pogo rows and their ADD treatment

All 12 active `pogo_*` rows already treat pogo as +1 and carry op_notation (the chassis to mirror):

| slug | ADD | base | base ADD | delta | op_notation |
|---|---:|---|---:|---:|---|
| pogo_paradox_mirage | 4 | paradox_mirage | 3 | **+1** | yes |
| pogo_paradox_barrage | 5 | paradox_barrage | 4 | **+1** | yes |
| pogo_paradox_drifter | 5 | paradox_drifter | 4 | **+1** | yes |
| pogo_paradox_eggbeater | 5 | paradox_eggbeater | 4 | **+1** | yes |
| pogo_paradox_whirl | 5 | paradox_whirl | 4 | **+1** | yes |
| pogo_paradox_blender | 6 | paradox_blender | 5 | **+1** | yes |
| pogo_paradox_da_da_curve | 6 | paradox_da_da_curve | 5 | **+1** | yes |
| pogo_paradox_torque | 6 | paradox_torque | 5 | **+1** | yes |
| pogo_paradox_whirling_swirl | 6 | paradox_whirling_swirl | 5 | **+1** | yes |
| pogo_barfly | 5 | (folk base) | — | — | yes |
| pogo_pickup | 3 | (folk base) | — | — | yes |
| pogo_voodoo | 6 | (folk base) | — | — | yes |

Delta is **+1 in every case where the base is canonical (10/10).** Shared chassis:
`CLIP > (no plant while) OP IN [DEX] > …`.

## 3. Frontier candidates — clean vs positional vs alias

21 pogo candidates in the de-staled promotion queue, split three ways:

### 3a. Clean mechanical promotions — 11 (recommended set)
Single `pogo` modifier on an **already-canonical base**, no folk parenthetical, no flags. With
`pogo = +1`, **ADD = base + 1**, and op_notation mirrors the canonical pogo chassis (`(no plant
while) OP IN [DEX]` prefix on the base body). Bracket-count == ADD by construction.

| slug | = pogo + base | base ADD | **ADD (base+1)** |
|---|---|---:|---:|
| pogo-illusion | illusion | 2 | **3** |
| pogo-legover | legover | 2 | **3** |
| pogo-mirage | mirage | 2 | **3** |
| pogo-barrage | barrage | 3 | **4** |
| pogo-butterfly | butterfly | 3 | **4** |
| pogo-drifter | drifter | 3 | **4** |
| pogo-eggbeater | eggbeater | 3 | **4** |
| pogo-whirl | whirl | 3 | **4** |
| pogo-blender | blender | 4 | **5** |
| pogo-torque | torque | 4 | **5** |
| pogo-whirling-swirl | whirling_swirl | 4 | **5** |

All 11 are source-attested (present in the observational corpus), not on the DO-NOT-RE-PROMOTE list,
and not folk-aliased to an existing canonical.

### 3b. Positional variants — 7 (HOLD, separate positional-doctrine call)
`pogo-ss-flail`, `pogo-ss-illusion`, `pogo-ss-legover`, `pogo-ss-mirage`, `pogo-ss-pickup`,
`pogo-ss-symposium-mirage`, `pogo-far-mirage`. These carry a `ss`/`far` side qualifier — the
positional-identity doctrine deliberately does **not** auto-collapse same-side configuration, so each
needs the alias-vs-distinct-variant curator call. Not part of the clean slice.

### 3c. Alias / already-canonical duplicates — 3 (EXCLUDE)
`pogo-paradox-blender-pogo-op-blender`, `pogo-paradox-torque-pogo-op-torque`,
`pogo-paradox-whirling-swirl-pogo-op-whirling-swirl` — these are folk "(pogo op X)" restatements of
the **already-canonical** `pogo_paradox_blender` / `_torque` / `_whirling_swirl`. Alias candidates,
not new promotions. (They slipped the queue's overlap filter only because the parenthetical folk name
is baked into the slug.)

## 4. Recommendation

Because `pogo = +1` is **already ratified and committed**, the gate is satisfied and the **11 clean
rows in §3a are mechanically promotable now** as a single self-contained Class-A slice:
- ADD = base + 1 (all bases canonical, deltas proven on 10 existing compounds).
- op_notation = mirror the canonical pogo chassis (`(no plant while) OP IN [DEX]` prefix), bracket-count == ADD.
- No curator decision, parser work, or open doctrine remains for these 11.

The 7 positional variants stay held for the positional-doctrine call; the 3 aliases are excluded.

**This packet writes nothing.** If the 11-row slice is approved for authoring, it is the clean
`pogo` family promotion that last turn's cascade analysis was looking for — the one family whose
"single decision" turned out to be already made.
