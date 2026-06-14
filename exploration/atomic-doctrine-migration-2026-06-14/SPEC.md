# Atomic / X-Dex doctrine migration — spec (no data changes)

Spec only. Recommends the **skeptical** path: make `atomic` a clean +1 set
modifier, count X-Dex **only when explicitly notated**, and treat `atomic` as
policy-dependent until Red resolves the X-Dex receiver question. Auto-firing
X-Dex is **not** recommended — the receiver set is internally contradictory
(see §6).

---

## 1. Current state

**Documented doctrine** (`RED_RESOLVED_CANON.md §A.3`): atomic = **+1**, with a
**separate X-Dex** on the "far" dex for some bases. Worked rulings:
- Atom Smasher = atomic**X** mirage = 4 (atomic +1 + X-Dex; mirage non-rotational *in this reading*).
- Atomic Torque (**Silo**) = atomic + torque, **atomic +1, NO X-Dex = 5**.
- Legbeater = atomic butterfly = 4; Flux = atomic osis = 4; Omelette = atomic illusion = 3; Eggbeater = atomic legover = 3.
The held memo restates this as "atomic & quantum always +1; X-Dex on the
following far dex (receivers: mirage/illusion/whirl/torque/drifter; non-receivers:
swirl/barfly/down)" — **HELD pending greenlight.**

**Registry** (`freestyle_trick_modifiers`): `atomic = +1 non-rotational / +2
rotational`. This is the **old proxy model** — it folds "X-Dex on rotational"
into a flat +2 on `ROTATIONAL_BASES = {whirl, mirage, torque, swirl}`.

**Parser** (`parse_freestyle_notation.py`): applies `add_bonus_rotational` (= +2)
for atomic on a rotational base; `atomic` is **not** in `POLICY_TOKENS` (unlike
`quantum`/`nuclear`/`down`), so it is silently computed. `xdex` is a registered
modifier (+1) and `[XDEX]` is a bracket token, but X-Dex is **never auto-fired** —
the parser only counts it if it is already a link/bracket.

**Promotion impact:** the +2-rotational proxy **over-computes** the rotational
atomic compounds relative to their curator-asserted ADD:

| trick | asserted | parser today (+2 rot) | mismatch |
|---|---:|---:|:--:|
| atomic-torque (Silo) | 5 | torque 4 + 2 = **6** | ✗ +1 |
| atomic-symposium-mirage | 4 | mirage 2 + 2 + symp 1 = **5** | ✗ +1 |
| atomic-ducking-torque | 6 | torque 4 + 2 + duck 1 = **7** | ✗ +1 |

So the proxy is the *source* of the silo divergence, and it blocks the tracked
atomic promotions (their source ADDs use the +1 model).

---

## 2. Target doctrine

1. **atomic = +1, set modifier, universal.** No rotational escalation.
2. **X-Dex = a separate +1**, counted **only when the X-Dex condition is actually
   present** on the trick — never inferred from "atomic + rotational base."
3. Consequently atomic on a rotational base is **not** automatically +2; it is +1
   unless that specific trick independently carries an X-Dex.

Net for the corpus (computed vs the unchanged curator-asserted ADDs): the proxy's
over-count disappears, so the three rows above **reconcile** (parser → asserted),
and no displayed ADD changes (display is driven by asserted `adds`, not computed).

---

## 3. Implementation plan

### 3a. Registry
- `atomic`: set `add_bonus_rotational` **2 → 1** (so atomic = +1 everywhere).
  `add_bonus` stays 1. `modifier_type` stays `set`. Update the note.
- `xdex`: unchanged (+1). It remains the explicit X-Dex carrier.

### 3b. Parser
- With atomic's rotational column now equal to its flat value, the
  rotational-escalation path no longer diverges for atomic (the
  `add_bonus_rotational != add_bonus` branch stops firing for it).
- **Add `atomic` to `POLICY_TOKENS`** (alongside `quantum`/`nuclear`/`down`)
  **until** Red rules the X-Dex receiver question. Effect: atomic tricks parse to
  `policy_dependent` and are surfaced for review rather than silently summed —
  honest about the open X-Dex question, and consistent with how the other
  doctrine-sensitive set modifiers are already treated.

### 3c. X-Dex firing rules — **explicit only (recommended)**
X-Dex contributes its +1 **iff both** are present on the trick:
- a `[XDEX]` bracket in `operational_notation`, **and**
- an `xdex` entry in `modifier_links`.
**No inference.** A trick is never given X-Dex because its base is "rotational,"
"far," or in any receiver set. Bracket-count == ADD still holds because the
`[XDEX]` bracket is exactly the +1.

### 3d. `[XDEX]` explicit vs inferred
**Explicit `[XDEX]` only.** Inference is rejected (see §6): the proposed receiver
set contradicts the canon on torque, and source "far" tags are unreliable. X-Dex
must be authored, not derived.

### 3e. atomic as POLICY_TOKEN
**Yes, until safe.** Keep atomic policy-dependent in the parser until Red confirms
(a) atomic = +1 flat and (b) X-Dex is explicit-only. Once confirmed and the
explicit-X-Dex rows are notated, atomic can be removed from `POLICY_TOKENS` and
computed normally.

---

## 4. Impact list (live data — 24 canonical atomic-linked tricks)

**Reconciled by the migration (computed over-count removed; asserted ADD unchanged):**
- `atomic-torque` (Silo) 6→5-computed = asserted 5 ✓
- `atomic-symposium-mirage` 5→4 = asserted 4 ✓
- `atomic-ducking-torque` 7→6 = asserted 6 ✓

**Becomes promotion-ready** (tracked candidates; source ADDs already use atomic +1):
`atomic-whirl`, `atomic-swirl`, `atomic-reverse-swirl`, `atomic-symposium-whirl`,
`atomic-gyro-torque`, `atomic-ducking-mirage` — each promotable **once its X-Dex is
explicitly decided** (atomic +1, plus `[XDEX]` + `xdex` link where the source
"far" denotes an X-Dex). They do **not** auto-promote.

**Requires notation/link edits (under-linked; surfaced by the migration):**
- `witchdoctor` (asserted 5; linked only to atomic) — real structure is
  atom-smasher (atomic mirage + X-Dex) + symposium. Under explicit-only it computes
  mirage 2 + atomic 1 = 3 unless it gains `[XDEX]` + a `symposium` link. Curator edit.
- `atomic-miraging-butterfly` (asserted 6, already carries `[XDEX]`) — verify the
  bracket count reconciles to 6 after the change.

**No change (19 rows):** every atomic-on-non-rotational trick (`atomic-butterfly`,
`atomic-osis`, `atomic-illusion`, `atomic-eggbeater`, `atomic-drifter`,
`atomic-blender`, `atomic-barrage`, `atomic-pickup`, `omelette`, …) — already +1.

---

## 5. Safety checks
- **bracket-count == ADD:** preserved — X-Dex's +1 is exactly its `[XDEX]` bracket;
  atomic contributes one set bracket (+1).
- **No silent auto-X-Dex:** the explicit-only rule guarantees no ambiguous row
  gains an X-Dex without a curator authoring `[XDEX]` + the link.
- **No change to non-atomic tricks:** only the `atomic` registry row and the
  parser's atomic handling change; all other modifiers untouched. (Verify the
  19 no-change rows compute identically before/after.)
- **Tests needed:**
  - registry: `atomic` add_bonus == add_bonus_rotational == 1.
  - parser: atomic on a rotational base computes +1 (not +2); the 3 silo-class rows
    compute == their asserted ADD; a row with `[XDEX]` + `xdex` link gains +1; a
    rotational atomic row *without* `[XDEX]` does **not**.
  - regression: the 19 non-rotational atomic rows' computed ADD is unchanged.
  - invariant: no non-atomic trick's computed ADD moves.

---

## 6. Red decision packet

**The question (yes/no):**
> Is `atomic` a flat **+1** set modifier, with **X-Dex a separate +1 that counts
> only when explicitly present** on a trick — i.e. atomic on a rotational base is
> **not** automatically +2? And specifically: is **Atomic Torque (Silo) = 5**
> (atomic +1, no X-Dex), as `RED_RESOLVED_CANON §A.3` records?

**Why this is the real question (be skeptical):** the held memo says X-Dex fires
on a *receiver set* including **torque**, which would make Atomic Torque **6** — but
the canon explicitly rules the Silo **5 with no X-Dex**. The receiver set and the
canon **contradict each other on torque**, and source "far" tags are inconsistent
(the tracked `atomic far whirl` is listed at ADD 4 = atomic +1 with *no* X-Dex,
even though whirl is a purported receiver). **Auto-firing X-Dex cannot be made safe
while its trigger is self-contradictory.** Hence: explicit `[XDEX]` only.

**Examples to show Red:**
- atomic osis = 4, atomic butterfly = 4 (non-rotational, +1) — unaffected.
- atomic torque (Silo) = 5 (+1, no X-Dex) vs the proxy's 6 — the fix.
- atom smasher = 4 = mirage 2 + atomic 1 + **explicit** X-Dex 1.
- atomic swirl: +1 → 4 (swirl is a non-receiver), vs proxy 5.

**Consequences of YES (recommended):** registry `atomic` → +1; parser stops
over-counting; the 3 silo-class divergences reconcile; 6 tracked atomic tricks
become promotable once their X-Dex is authored; `witchdoctor` flagged for a link
fix; atomic leaves `POLICY_TOKENS` after the explicit-X-Dex rows are notated. No
displayed ADD changes.

**Consequences of NO (keep proxy):** the +2-rotational model stays; the Silo and
two other rows keep diverging (computed ≠ asserted); the tracked atomic
promotions stay blocked; atomic remains a silent special case inconsistent with
how quantum/nuclear are handled.

**Out of scope of this spec:** quantum (already +1 in the registry; only
`POLICY_TOKEN`-flagged) and the broader X-Dex receiver theory — both deferred to
the same Red conversation but not changed here.
