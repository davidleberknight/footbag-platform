# Atomic / Quantum / Nuclear — Readiness Table (2026-06-20)

**Classification only. No value-changing migration started** (per curator instruction: see the
whole band first). Live band = **60 rows (54 active / 6 held)**. Grounded in the two existing audits
— `atomic-xdex-migration-2026-06-06/XDEX_MIGRATION_AUDIT.md` (aggressive) and
`atomic-doctrine-migration-2026-06-14/SPEC.md` (skeptical, **newer, authoritative**).

## The governing finding

The two audits recommend **different things**, and the newer one supersedes:

- The **2026-06-06 audit** computes "exactly 13 totals move" by **auto-firing X-Dex** on a receiver
  set {mirage, illusion, whirl, torque, drifter}.
- The **2026-06-14 SPEC** shows that receiver set is **self-contradictory**: it lists **torque** as a
  receiver (→ Atomic Torque = 6), but `RED_RESOLVED_CANON §A.3` rules **Silo (Atomic Torque) = 5, no
  X-Dex**. Source "far" tags are also inconsistent (`atomic far whirl` is tracked at 4 = atomic+1, no
  X-Dex, though whirl is a purported receiver). **"Auto-firing X-Dex cannot be made safe while its
  trigger is self-contradictory."** Recommended: atomic = flat **+1**, **X-Dex explicit-only**.

So the **value-changing** migration (the 13 moves) is **not mechanical** — it is **unresolved**,
gated on Red resolving the receiver contradiction. Live values confirm it is **unapplied**
(`quantum-mirage`=3, `atomic-illusion`=3 — both still old-model).

## The four buckets

### 1. Purely mechanical migration (0 displayed ADD changes — implementable now)
The **parser/registry hygiene** only:
- Registry: `atomic.add_bonus_rotational` **2 → 1** (atomic = +1 everywhere; kills the +2-rotational proxy).
- Parser: the rotational-escalation branch stops firing for atomic; add `atomic` to `POLICY_TOKENS`.
- Effect: the proxy's **over-count** vanishes, so 3 rows' *computed* ADD reconciles to their already-correct *asserted* ADD — **no displayed value moves**:
  `atomic-torque` (Silo, 6→5=asserted), `atomic-symposium-mirage` (5→4), `atomic-ducking-torque` (7→6).
- The **19 atomic-on-non-rotational rows** (`atomic-osis/butterfly/illusion/eggbeater/drifter/blender/barrage/clipper/pickup/eclipse/flail/guay/legover` …) are already +1 — untouched.
- Reversible TS/parser change. The Red yes/no only gates *removing* atomic from `POLICY_TOKENS` afterward; the reconciliation itself is safe.

### 2. Governance required (curator/notation decision, not Red doctrine)
- **6 tracked atomic candidates** become promotable **once their X-Dex is explicitly authored** as `[XDEX]`+link: `atomic-whirl`, `atomic-swirl`, `atomic-reverse-swirl`, `atomic-symposium-whirl`, `atomic-gyro-torque`, `atomic-ducking-mirage`. *Where* to author `[XDEX]` is the governance call. They do **not** auto-promote.
- **`witchdoctor`** (asserted 5, linked only to `atomic`): needs a link fix to atomic-mirage + explicit X-Dex + symposium. Curator edit.
- **`atomic-gyro-torque`** *also* lands in the **set-then-gyro insertion** bucket of `GOVERNANCE_PRECEDENT_FRONTIER.md` — cross-listed there.

### 3. Identification required (structure/identity unconfirmed)
- **Sailing band (C1):** every `sailing-*` is `low_confidence`/`alias` except `sailing-clipper`, whose decomposition `"sailing(2)=2"` is **malformed** (missing the clipper base; should be ~4). Identify + score as a batch, not in this migration.
- **Frantic band (C2):** `frantic` has **no `freestyle_tricks` row** (Holden-only; reads as pixie-quantum); all `frantic-*` low_confidence/alias. No total to move until identified.
- Folk-named atomic/nuclear rows whose decomposition is unverified (e.g. nuclear-osis "Aeon-Flux" naming).

### 4. Still unresolved (genuinely open — Red)
- **X-Dex receiver-set contradiction (the core blocker).** Receiver set vs canon contradict on **torque**; the 13-value-move migration cannot proceed until Red rules the yes/no in SPEC §6 (atomic = flat +1, X-Dex explicit-only, Silo = 5). **This single question gates all value changes.**
- **Near/far distinction (C3):** a *near* receive-base must NOT take X-Dex; all `*-ss-*` / `*-near-*` variants unscored, flag at scoring time.
- **Down-move compounds (C5):** `atomic/quantum/sailing` double-over-down doctrine separately open (X-Dex correctly excludes down moves, but their own DOD doctrine is parked).
- **`atomic-miraging-butterfly` (C4):** does the inserted `miraging` introduce a far-mirage dex that qualifies for X-Dex (→ +1) or is it a pure modifier (stays 5)? Red.

## Bottom line for sequencing

| Bucket | Size (band) | Action |
|---|---|---|
| Purely mechanical | parser/registry + 3 reconciles + 19 no-change | **safe now** (reversible; 0 displayed moves) |
| Governance | ~6 atomic candidates + witchdoctor + atomic-gyro-torque | author explicit `[XDEX]` / links (curator) |
| Identification | sailing band + frantic band + folk names | identify before scoring |
| Unresolved (Red) | **the 13-value-move** (9 quantum +1, atomic-illusion/drifter +1, atomic-swirl/rev-swirl −1) + near/far + DOD + miraging-butterfly | **do not start** — gated on the receiver contradiction |

**Do not start value-changing migrations.** The only safe move today is the parser/registry hygiene
(bucket 1), which changes no displayed ADD. Everything that moves a total is in bucket 4, blocked on
one Red yes/no (the receiver-set contradiction).
