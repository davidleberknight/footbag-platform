# Curator review packet — spyro notation + 9 modifier beginner-notes

Two small things need a curator decision before they go from "derived, provisional"
to "confirmed". Both came out of the beginner-UX pass on the trick-detail pages.

How to use: for each item, either tick CONFIRM or write the corrected text in the
EDIT line. Nothing here changes scoring math; the bracket-count == ADD invariant
is already satisfied where notation is involved.

---

## Part A — `spyro` standalone notation

`spyro` is the only "missing notation only" trick left that I could not author
with confidence, so it still renders an INCOMPLETE badge.

**What we know (settled):**
- `spyro` = 1 ADD, its own base (`base_trick = spyro`, family `spyro`).
- Description (curator-set): "Gyro move where the dexing foot plants before the dex."
- It is a body primitive: `genuphobia` (fairy spyro symposium torque) notates the
  spyro component as `(front) SPIN [BOD]` / `(back) SPIN [BOD]`, with the row note
  "spyro = 1-ADD body". So spyro contributes a single `SPIN [BOD]`.

**The blocker:** as a STANDALONE trick, a single `SPIN [BOD]` would be the only
scored bracket (1 bracket = 1 ADD, which is correct), but the trick would then
**terminate in `[BOD]`**. Every other canonical trick ends in a scored contact or
delay (`[DEL]` / `[KICK]` / `[XBD]`). There is no precedent for a `[BOD]`-terminal
1-ADD trick, so I did not want to ship a possibly-malformed form.

**Proposed form (for confirmation or correction):**

```
TOE > (back) SPIN [BOD]
```
(entry = the dexing foot planted on the toe; the gyro `SPIN [BOD]` is the single
1-ADD scored event; 1 bracket = 1 ADD.)

**Decisions needed:**

1. Is `spyro` correctly a single gyro body spin (`SPIN [BOD]`), 1 ADD? `CONFIRM / EDIT: ____`
2. Standalone entry + terminal: is `TOE > (back) SPIN [BOD]` right, or should it
   terminate in a contact (which would push it to 2 ADD and contradict the official
   1)? If it should stay 1 ADD, please confirm the `[BOD]`-terminal form, or supply
   the correct standalone notation. `CONFIRM / EDIT: ____`
3. Spin parity: `(back)` vs `(front)` for the standalone? `CONFIRM / EDIT: ____`
4. Alternative: should `spyro` carry NO standalone op-notation at all (i.e. it only
   ever appears as a component, like in genuphobia), and instead stay an
   intentional INCOMPLETE? `YES / NO: ____`

Once confirmed I will add the operational notation via the DB correction path
(`red_corrections`) so it resolves and drops the INCOMPLETE badge.

---

## Part B — 9 modifier beginner-notes

These one-line, plain-English notes render under the **Modifier** row of the new
structural-fact block on trick-detail pages (tooltip brevity, one sentence, no
notation tokens). The 13 modifiers with a curator feel card were paraphrased from
that copy. The 9 below had no curator feel card, so I derived a note from the
established mechanic. Each states only the uncontested motion; please confirm or
correct the wording. (The 8 frontier operators — blazing, terraging, surfing,
floating, splicing, warping, backside, shooting — intentionally have NO note,
since their mechanics are not settled.)

| modifier | proposed beginner note | basis (curator-internal) | confirm / edit |
|---|---|---|---|
| gyro | A half body turn carried into the dexterity moment. | +1 body; gyro torque = mobius = 5. | `____` |
| diving | A forward body dive over the bag during the trick. | +1 body; diving butterfly = 4. | `____` |
| swirling | A body turn run through the trick, following the swirl direction. | +1 body-spin, parallel to spinning. | `____` |
| inspinning | An inward body turn carried into the dexterity moment. | +1; inward spin (per pt14). | `____` |
| miraging | Adds a mirage-style downtime dexterity move onto the base. | +1; underlies drifter (miraging clipper). | `____` |
| whirling | Adds a front-whirl dexterity move onto the base. | +1; whirling osis = blender = 4. | `____` |
| tapping | Adds a quick extra dexterity tap before the base. | +1; **structural signature noted as inconsistent across siblings** — wording is deliberately vague. | `____` |
| sailing | A compound uptime set that runs two set treatments before the base. | +2 set; sailing = pixie + quantum. | `____` |
| railing | A compound uptime set combining a held position with a sailing set. | +2 set; railing = rooted + sailing. | `____` |

**Flag:** `tapping` is the least certain — its structural signature is recorded as
inconsistent across resolved siblings, so the note is intentionally generic.
Please confirm it is acceptable or supply a precise one-liner.

The confirmed text lands in `src/content/freestyleStructuralFactNotes.ts` (the
NEEDS-CURATOR marker is removed once a row is confirmed).
