# Classification Drift Report — spyro / spinning / gyro / inspin

Coherence Cleanup Slice — Phase 1d (part 2) (2026-05-17). Read-only audit.

## TL;DR

Of the four terms surveyed:
- **gyro** is correctly classified as a modifier (category=modifier, no ADD)
- **spinning** is correctly classified as a modifier (category=modifier, no ADD)
- **spyro** has a **classification conflict**: stored as `category=body` with `adds=1` (a +1 body operator) AND surfaced in glossary §11 as a historical name for "inspin"
- **inspin** has no DB row at all — exists only as a glossary §11 historical-vocabulary entry

## DB state

```sql
slug      canonical_name  adds  category  base_trick  trick_family
gyro      gyro            (—)   modifier  gyro        (—)
spinning  spinning        (—)   modifier  spinning    (—)
spyro     spyro             1   body      spyro       spyro
inspin    — NOT IN DB —
```

## Surface treatment

| Term | DB | Glossary §1 | Glossary §3/§6 modifier reference | Glossary §11 (historical) | Movement-system view | Operator reference |
|---|---|---|---|---|---|---|
| gyro | modifier row | implicit via spinning | not registered as a §6 surface-A modifier | not listed | NOT on a movement axis | not in OPERATOR_REFERENCE_ENTRIES |
| spinning | modifier row | §3 mentions | registered as paradox-class sibling | not listed | YES — set axis | registered |
| spyro | body atom (ADD 1) | not mentioned | not registered | listed as Older name for "Inspin" | NOT on a movement axis | not registered |
| inspin | NONE | not mentioned | not registered | listed as Canonical equivalent for "Spyro" | NOT on a movement axis | not registered |

## The drift

1. **Spyro is classified as a body atom (+1) but presented in §11 as an older folk name for `inspin`.** The glossary §11 row `Spyro → Inspin` implies spyro should not be a standalone trick. The DB disagrees: spyro IS an active trick with ADD 1 and trick_family=spyro. The two surfaces tell incompatible stories.

2. **Inspin is the supposed canonical equivalent but has no DB row.** A reader following the §11 mapping `Spyro → Inspin` finds the canonical side has no presence in any browse view (no trick page, no family card, no operator entry). The mapping is one-directional and lands on a dead-end.

3. **Gyro and spinning overlap.** Per Red 2026-05-15: "Blistering = Gyro Whirling Set" and "Mobius ≈ Gyro Torque" — Red treats gyro as legit operator vocab. Per `freestyleSymbolicEquivalences.ts`, `mantis = gyro eggbeater` and `big-apple = gyro symposium torque`. But movement-system view registers `spinning` as the modifier on the set axis, not gyro. The relationship "gyro = spinning?" is implicit and not surfaced anywhere.

## What's safe to fix

**Immediate (low-risk):** Glossary §11 row `Spyro → Inspin` could be flipped or annotated to acknowledge the DB conflict. Three options:
- (A) Remove the §11 row (spyro is the canonical name; inspin is not in the dictionary)
- (B) Reverse the row to read `Inspin → Spyro` (matching DB authority)
- (C) Add a footnote noting that `spyro` is the active dictionary slug; `inspin` is a folk synonym that has not been added as a canonical trick

**Deferred to Wave 2 (curator-paced):**
- spyro's body-atom classification (+1 ADD) vs its presumed status as a folk synonym for a rotation
- gyro vs spinning operator-vs-trick boundary (one of the six Wave 2 grammar questions per `project_red_consultation_state`)

## Recommendation

Phase 2 should propose option (C) — additive annotation that resolves the contradiction without deleting either surface. Implementation can land in Phase 3 if the maintainer approves.

For the gyro vs spinning relationship: defer entirely. The Wave 2 packet specifically asks Red about the operator-vs-trick boundary for fairy and similar tokens; gyro/spinning resolution likely lands in the same response.

## Cross-references

- `project_red_consultation_state` — Wave 2 grammar questions include operator-vs-trick boundary
- `project_freestyle_state` — Red 2026-05-15 ruled "Fairy=legit operator vocab; Mobius≈Gyro Torque"
- `freestyleSymbolicEquivalences.ts` — current chain readings using gyro
- `feedback_op_notation_kick_vs_stall` — sibling op-notation classification convention
