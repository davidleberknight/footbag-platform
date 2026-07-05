# Zulu and Weaving — Doctrine Integration Decision Document

Audit only. No code, no implementation. Every claim is grounded in current code/data and Red's
definitions. Line numbers are point-in-time; re-verify before any edit.

Red's definitions (the authority for this work):

- **Zulu**: a ducking set where the bag travels across the body, under the chin, before the duck.
- **Weaving**: a ducking set where the bag is caught on the same foot that performed the set.

---

## 0. The one fact that reframes everything

Zulu and Weaving are **not** at the same integration stage, and neither is a blank slate:

- **Weaving is already a registered first-class modifier in the data layer.** `freestyle_trick_modifiers`
  has `weaving` (add_bonus 1, rotational 1, type `body`); `trick_modifiers.csv:12` records
  "+1 universally. Confirmed: weaving clipper=3, weaving butterfly=4." It is in the movement-system
  axis (`freestyleMovementSystems.ts:78`), the operator index (`freestyleOperatorIndex.ts:53`), the
  notation token map (`notationRendering.ts:135` "Weaving, body modifier (+1 ADD)"), and the glossary
  modifier-weights table (`glossary.hbs:1460`, +1 body). The ONLY thing still calling it unresolved is
  the **classification / educational layer**.
- **Zulu is genuinely unregistered.** No row in `freestyle_trick_modifiers` (DB) or `trick_modifiers.csv`.
  Excluded from the movement-system axis (`movementSystems.ts:78` lists weaving, not zulu). Sits in
  `NB_UNDEFINED_OPERATORS` (`freestyleService.ts:554`). Yet it is still listed in the operator index
  (`operatorIndex.ts:53`) and the glossary weights table (`glossary.hbs:1462`, +1 body).
- **Neither carries active scoring weight today.** Zero active `freestyle_tricks` rows and zero
  `freestyle_trick_modifier_links` reference weaving or zulu. So first-classing them re-scores nothing
  currently active — the impact is the observational frontier (archived tracked names) and future
  trick promotions, not the live dictionary.
- **Ducking is `modifier_type='body'`, not a set.** Red's phrase "ducking set" therefore reads as
  "a variety of ducking," not the platform's launch-set category (atomic / pixie / miraging).

So this is not "define two unknown operators." It is: **finish integrating weaving, register zulu the
same way, and retire the placeholder/blocked classification on both.**

---

## 1. Current state — every classification and surface

### Treated as unresolved / placeholder / blocked (the inconsistency to remove)

| Site | What it says | Applies to |
|---|---|---|
| `freestyleService.ts:565-570` | `classifyNotationBlocker` returns `'red-doctrine'`; comment "weaving is an undefined folk operator still awaiting a doctrine ruling" | weaving |
| `freestyleService.ts:554` | `NB_UNDEFINED_OPERATORS` set contains `'zulu'` → `'undefined-operator'` bucket | zulu |
| `freestyleService.ts:8325` | dex-count blocker label `'Awaiting expert review: weaving operator'` | weaving |
| `freestyleService.ts:9638` | `'Genuinely open: awaiting an expert ruling on the weaving operator (status and ADD).'` | weaving |
| `freestyleService.ts:9640` | `'Definition pending: undefined folk operators ... (zulu, alpine, rooting, pixie weight)'` | zulu |
| `freestyleService.ts:9703` (+ `9823`) | "Only Weaving genuinely awaits Red on this frontier"; "Doctrine unresolved ... (weaving)" | weaving |
| `freestyleObservationalUniverse.ts:1420` | `DOCTRINE_BLOCKING_QUESTIONS.weaving = "Weaving is an undefined folk operator; movement structure unruled."` (rendered via `freestyleService.ts:9651`) | weaving |
| `views/freestyle/observational.hbs:111` | "Only the Weaving cluster genuinely awaits an expert ruling" (rendered page) | weaving |

### Excluded from a surface (where first-class membership is missing)

| Site | Exclusion | Applies to |
|---|---|---|
| `freestyleMovementSystems.ts:78` | midtime-body axis `modifierSlugs` omits `zulu` (includes weaving) | zulu |
| `freestyleMovementSystems.ts` MODIFIER_COMPOSITION_GLOSSES (ducking@143, diving@189) | no gloss for weaving or zulu; `resolveModifierCompositionGloss('weaving')` returns null (pinned by `freestyleMovementSystems.test.ts:166`) | weaving, zulu |
| `freestyleMovementSystems.ts:74` | prose "head dip / body arc (ducking / diving / weaving)" omits zulu | zulu |
| `notationRendering.ts` | `WEAVING` token exists (135); no `ZULU` token | zulu |
| component / dex browse views | weaving group hidden when 0 members (`component-view.test.ts:236`); zulu not in axis at all | both |

### Carrying STALE definitions (Phase-1 residual — contradict Red and the updated ducking page)

| Site | Current (old) text |
|---|---|
| `glossary.hbs:518` | Weaving — "Head moves toward the bag; the bag falls to the same side the head moved." |
| `glossary.hbs:524` | Zulu — "Head moves over the bag and back under ... bag falls to the opposite side." |
| `freestyleLandingContent.ts:80` | "Head dip or arc; duck/dive/weave/zulu family." |
| `symbolicGlossaryPanels.ts:100` | "Part of a four-variant head-motion family: ducking, diving, weaving, zulu." |
| `symbolicLearnIndex.ts:76` | "...a 2×2 of head direction × bag-fall side..." |
| `freestyle-modifier-advanced-reference.hbs:46` | "...four-way family ... defined by head direction and the side the bag falls." |
| `freestyleService.ts:10796` | `op('DUCK', ... 'Head dip or arc; duck/dive/weave/zulu family.', ...)` |

### Already correct / consistent

- The ducking modifier-family teaching page (`symbolicModifierEducation.ts` DUCKING_CONTENT) — updated
  in Phase 1 to Red's definitions (2×2 confusion @413, related-modifier prose @493/501).
- `freestyleService.ts` COMPONENT_DEFINITIONS weaving gloss (@8518) and ducking feel-card (@3512) —
  updated in Phase 1.
- Glossary modifier-weights table: weaving +1 body (`1460`), zulu +1 body (`1462`).
- `freestyle-modifier-reference.hbs:67` and `operatorIndex.ts:53` already list both in the
  head-movement family.

---

## 2. Recommended ontology

**Both are body modifiers in the ducking family (+1), each a named variant of ducking. Not sets, not
operator-reference entries, not "both," not "neither."**

Reasoning, grounded in the platform:

- The platform's **set** category is the uptime launch primitive (atomic / pixie / quantum / miraging),
  modeled in `freestyleCanonicalSets.ts` and `modifier_type='set'`. Zulu and Weaving do not launch the
  bag; the duck is a midtime head movement. Ducking itself is `modifier_type='body'`. Red's "ducking
  set" describes a **variety of ducking**, not a launch.
- The platform already models the head-motion variants as **separate body modifiers**, each +1:
  ducking, diving, and weaving each have their own `freestyle_trick_modifiers` row. Zulu is the only
  one of the four missing a row. The established pattern is "one modifier per named variant," so zulu
  should get its own row exactly as diving and weaving have.
- **Operator-reference** entries are not warranted: ducking and diving are absent from
  `operatorReference.ts` (elementary body modifiers are intentionally kept out, the same way gyro is).
  Adding zulu/weaving there would break that symmetry. Keep them in the modifier table + movement
  systems + glossary, like their siblings.

Net: the existing ontology is correct; it just hasn't been applied to zulu, and the placeholder layer
hasn't been cleared from weaving. Red's definitions slot in as the distinguishing feature of each
variant (weaving = same-foot catch; zulu = across-body/under-chin bag path before the duck).

The one terminology check this rests on is Q1 below.

---

## 3. Required educational changes (no scoring / parse / browse-membership impact)

These are pure wording, safe to do without touching behavior:

1. **Glossary individual entries** `glossary.hbs:518` (weaving) and `:524` (zulu) → Red's definitions,
   matching the already-updated ducking page. (The +1 weights table rows are already correct.)
2. **Stale family-framing prose** that still says "head direction × bag-fall side": `landingContent.ts:80`,
   `symbolicGlossaryPanels.ts:100`, `symbolicLearnIndex.ts:76`, `freestyle-modifier-advanced-reference.hbs:46`,
   `freestyleService.ts:10796`, `movementSystems.ts:74` → reword so ducking/diving are head-motion and
   weaving/zulu are ducking sets distinguished by catch-foot / bag-path.
3. **Stale "awaiting ruling" prose** is educational text but is **coupled to behavioral classifiers**
   (see §4): `observational.hbs:111`, `freestyleService.ts:9638/9703/9823`,
   `DOCTRINE_BLOCKING_QUESTIONS.weaving`, and the `9640` "definition pending (zulu, ...)" list. The
   words are stale, but they render from the blocker classification, so correcting them honestly
   requires the §4 reclassification. Treat them as §4, not pure wording.

---

## 4. Required behavioral changes (change parse / scoring / browse output or pinned tests)

Ordered roughly by dependency:

1. **Register the `zulu` modifier.** Add a `zulu,1,1,body,...` row to `trick_modifiers.csv` → DB
   reload. Effect: zulu becomes a known modifier token, so zulu-prefixed names parse and score (+1).
   This is a DATA + parser-input change. (Weaving already has its row — no action.)
2. **Retire the placeholder classification.**
   - Remove `'zulu'` from `NB_UNDEFINED_OPERATORS` (`freestyleService.ts:554`).
   - Remove the `weaving → 'red-doctrine'` branch (`:570`) and its label (`:8325`).
   - Update `:9638`, `:9640`, `:9703`, `:9823`, `DOCTRINE_BLOCKING_QUESTIONS.weaving`
     (`observationalUniverse.ts:1420`), and `observational.hbs:111`.
   - **Pinned tests change**: `freestyle.dex-view-rows.routes.test.ts:142` asserts a weaving fixture
     lands in the `dex-red-doctrine` bucket; `freestyleMovementSystems.test.ts:166` asserts
     `resolveModifierCompositionGloss('weaving')` is null. Both must be updated. This is why §3.3 is
     not a pure-wording change.
3. **Add zulu to the movement-system axis** (`movementSystems.ts:78`) and **author composition glosses**
   for weaving and zulu (the `ducking@143 / diving@189` pattern). Effect: both render as first-class
   movement-system groups (once member tricks exist). Updates the movement-system unit test.
4. **Add a `ZULU` notation token** in `notationRendering.ts` for parity with `WEAVING` (135).
5. **No new canonical SET entries** (they are not sets) and **no operator-reference entries** (parity
   with ducking/diving). Confirm via Q1.
6. **Modifier links / new canonical trick rows** are NOT part of first-classing the operator. They
   arrive only if/when specific zulu/weaving compounds are promoted from the observational frontier —
   a separate, later trick-promotion workstream. First-classing the operator just makes that frontier
   eligible.
7. **Scoring impact is latent, not immediate.** Zero active rows reference either modifier today, so
   nothing in the live dictionary re-scores. Future zulu/weaving compounds would score base + 1.

---

## 5. Notation (can canonical JOB notation be authored yet?)

**ADD: settled.** Both are +1 body modifiers (weaving confirmed in `trick_modifiers.csv:12`; both
already +1 in the glossary weights table). Zulu's +1 is by family analogy and the glossary already
asserts it, but Red stated movement, not ADD — confirm via Q2.

**JOB / operational notation: partially.** The ducking chassis is `... DUCK [BOD] ...`.

- **Weaving — close enough to propose, pending confirmation.** "Caught on the same foot that performed
  the set" is a SAME-side terminal, which the existing bracket grammar expresses directly. A candidate
  chassis (proposed separately from implementation, not authored into data):
  `... DUCK [BOD] > SAME <surface> [DEL]` — i.e. the ducking body event resolving to a same-foot
  delay. Bracket count is unchanged from ducking, consistent with +1. Needs curator confirmation that
  the same-foot catch is the intended structural distinguisher (Q4).
- **Zulu — not yet.** "The bag travels across the body, under the chin, before the duck" has **no
  existing token** in the bracket grammar. `[XBD]` means a cross-body DELAY (a landing surface), not a
  bag path preceding a `[BOD]` duck. So what is missing is a grammar decision: is the across-body /
  under-chin path a **non-scoring annotation** (e.g. an unbracketed `(across body)` pre-state, leaving
  ADD at +1) or a **scoring structural component** (which would change the bracket count and the ADD)?
  Until that is decided, zulu canonical notation cannot be authored without inventing doctrine. See Q3.

---

## 6. Remaining open questions (curator confirmation required)

**Q1 — terminology (the load-bearing one).** Red calls both a "ducking set." Confirm this means a
*variety of ducking* (→ model as body modifiers in the ducking family, this document's recommendation),
NOT a launch-set belonging in the Set Encyclopedia. Everything in §2-§5 assumes the modifier reading.

**Q2 — zulu ADD.** Confirm zulu = +1 (ducking-family weight). The platform already lists +1 and weaving
is confirmed +1, but Red's definition gives movement only.

**Q3 — zulu notation grammar.** How is "across the body, under the chin, before the duck" encoded: a
non-scoring pre-state annotation (ADD stays +1) or a scoring component (ADD changes)? This blocks
canonical zulu JOB notation.

**Q4 — weaving notation.** Confirm the same-foot catch is the structural distinguisher and that weaving
op_notation is the ducking chassis with a SAME-side terminal at +1 (no bracket-count change).

**Q5 — separate modifiers vs descriptive variants (largely already answered by the data).** Diving and
weaving already exist as their own modifier rows, so the established pattern is one modifier per named
variant; this recommends registering zulu the same way (so "zulu mirage" parses as zulu + mirage).
Confirm there is no intent to instead treat them as non-scoring readings of ducking.

**Q6 — frontier-clearing.** Several surfaces say "only weaving awaits a ruling." Once weaving/zulu are
registered, is the movement-operator frontier doctrine-clear, or does Q3 (zulu notation) keep zulu's
observational cluster blocked while weaving's clears? This determines whether the "awaiting ruling"
prose is fully retired or narrowed to zulu-notation-pending.

---

## 7. Suggested sequencing (for when implementation is greenlit — not now)

1. Confirm Q1-Q2 (cheap, unblocks everything).
2. Educational §3.1-§3.2 (glossary + family prose) — safe, no behavior.
3. Register zulu modifier (§4.1) + retire placeholder classification (§4.2) with the two pinned-test
   updates — the core behavioral step; weaving needs no data change, only declassification.
4. Movement-system axis + composition glosses + zulu notation token (§4.3-§4.4).
5. Notation: author weaving candidate (Q4) and resolve zulu grammar (Q3) before authoring zulu.
6. Observational frontier promotions (separate workstream, out of scope here).
