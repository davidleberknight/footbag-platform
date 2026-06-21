# Atomic / Quantum / Nuclear — Readiness Table (2026-06-20)

**Classification only. No value-changing migration started** (per curator instruction: see the
whole band first). Live band = **60 rows (54 active / 6 held)**. Grounded in the two existing audits
— `atomic-xdex-migration-2026-06-06/XDEX_MIGRATION_AUDIT.md` (aggressive) and
`atomic-doctrine-migration-2026-06-14/SPEC.md` (skeptical, **newer, authoritative**).

## ⟶ X-Dex ruling APPLIED (Red 2026-06-20) — supersedes the gating below

Red issued the X-Dex eligibility rule as **doctrine** (now recorded in `RED_RESOLVED_CANON §D.5`). It dissolves the receiver-set contradiction that gated this entire audit. Confirmed reading (curator-confirmed Reading B):

- **Eligibility ≠ trigger.** The receiver set `{mirage, illusion, whirl, torque, drifter}` says which bases *may* carry X-Dex. The +1 fires **only when the compound also performs a far move after a non-paradox dexterity.** The **near / default form of a receiver does NOT fire.**
- **Non-receivers never fire:** `{swirl, butterfly, barfly, down / DOD family}`.
- Paradox does not qualify as the triggering dex; ducking / gyro / all other modifiers do **not** alter eligibility (it is a property of the dex base).

**Consequence: the aggressive 2026-06-06 "13 auto-fire moves" model is REJECTED.** It fired X-Dex on every receiver's *near* form; Red's near ≠ far rule (`Silo = 5`, not 6) forbids that. The skeptical 2026-06-14 SPEC was correct that X-Dex is far-explicit; Red has now supplied the exact structural test. So the receiver auto-fires do not happen — the only value movements are the **non-receiver corrections** (the retired +2-rotational over-count) and the **explicit far-form** validations.

### Held-row re-evaluation (every row previously gated on the receiver contradiction)

| Row | Eligible base? | Far form? | X-Dex | Disposition under the ruling |
|---|---|---|---|---|
| `atomic-swirl` | swirl — **no** | — | none | **−1, UNLOCKED.** Non-receiver: drop the retired +2-rotational proxy → atomic(+1)+swirl. This is the IP-flagged "scores one too high" bug, now fixable. |
| `atomic-reverse-swirl` | swirl — **no** | — | none | **−1, UNLOCKED.** Same as `atomic-swirl`. |
| `atomic-illusion` (Omelette) | illusion — yes | near | none | **No move; stays 3.** Old "+1" auto-fire REJECTED; confirms `§A.3` canon. |
| `atomic-drifter` | drifter — yes | near | none | **No move.** Near form; old "+1" rejected. An explicit far-drifter form would fire. |
| `atomic-torque` (Silo) | torque — yes | near | none | **Stays 5.** Mechanical reconcile only (computed 6 → asserted 5); 0 displayed move. |
| `atomic-far-torque` | torque — yes | **far** | **+1** | **= 6, VALIDATED** (Red explicit). Distinct far-form reading; authorable as a new row. |
| `atomic-symposium-mirage` | mirage — yes (symposium n/a) | near | none | **Stays 4.** Reconcile only (5 → 4). |
| `atomic-ducking-torque` | torque — yes (ducking n/a) | near | none | **Stays 6.** Reconcile only (7 → 6). |
| `atomic-butterfly` (Legbeater) | butterfly — **no** | — | none | **Stays 4.** Confirmed non-receiver. |
| `atomic-miraging-butterfly` (C4) | butterfly — **no** (miraging n/a) | — | none | **Stays 5. C4 RESOLVED** — an inserted modifier does not grant eligibility. |
| `atomic-whirl` (Reactor) | whirl — yes | near (asserted) | none | **Stays 4** unless authored as an explicit far-whirl (→ 5). No longer Red-blocked; now a near/far authoring call. |
| `atomic-symposium-whirl` | whirl — yes | near | none | Same as `atomic-whirl`: near no-fire; a far form would be +1. |
| `atomic-gyro-torque` | torque — yes (gyro n/a) | near | none | No X-Dex (near). Still gated on the **gyro-into-set insertion** precedent (separate), NOT on X-Dex. |
| `atomic-ducking-mirage` | mirage — yes (ducking n/a) | near | none | No X-Dex (near). A far form would fire; authoring call. |
| `witchdoctor` | atom-smasher (= atomic **far** mirage = 4) + symposium | far (inside the atom-smasher base) | already counted | **Stays 5.** The X-Dex lives in the atom-smasher far-mirage, already in the 4. Classifier `red-doctrine` flag now resolvable; needs only the curator link fix. |
| 9× `quantum-*` near (mirage/illusion/…) | base — yes | near | none | **No move.** The "9 quantum +1" auto-fires REJECTED; near quantum forms stay old-model. Far-quantum forms would fire. |
| atomic/quantum DOD (double-over-down) | down — **no** | — | none | No X-Dex from the operator. DOD's own DOD-vs-DDD doctrine remains separately open. |

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

## Bottom line for sequencing (post-ruling, 2026-06-20)

The receiver-contradiction gate is **LIFTED**. Re-sequenced against the far-form test:

| Track | Action under the ruling |
|---|---|
| Purely mechanical | **Safe now** (reversible; 0 displayed moves): `atomic.add_bonus_rotational` 2 → 1; the Silo / `atomic-symposium-mirage` / `atomic-ducking-torque` computed→asserted reconciles. |
| Non-receiver corrections | **UNLOCKED now:** `atomic-swirl` −1, `atomic-reverse-swirl` −1 — drop the retired +2-rotational over-count (swirl is a confirmed non-receiver). The IP-flagged "scores one too high" bug. |
| Far-form validations | `atomic-far-torque` = 6 authorable (Red explicit); `atom-smasher` (4) already correct; `witchdoctor` (5) needs only the curator link fix. |
| Near-form receivers | **No move** — auto-fire rejected. `atomic-illusion` = 3, `atomic-drifter`, the 9 near `quantum-*` forms all stay old-model. |
| Identification | Sailing band + frantic band + folk names — unchanged (identify before scoring). |
| Still separately open (NOT receiver-blocked) | gyro-into-set insertion (`atomic-gyro-torque`); DOD-vs-DDD doctrine; per-row near/far reads + `[XDEX]` authoring for any far receiver forms. |

The single Red yes/no that "gates all value changes" is answered. **No remaining value movement is
blocked on X-Dex doctrine.** The net displayed-ADD change this ruling authorises is small: two −1
corrections (`atomic-swirl`, `atomic-reverse-swirl`) plus validating `atomic-far-torque` = 6; the
mechanical reconciles move nothing displayed; every near-form receiver holds.
