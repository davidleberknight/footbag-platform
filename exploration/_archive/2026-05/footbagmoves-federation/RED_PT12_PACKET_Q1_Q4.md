# Red pt12 -- Focused Packet (Q1-Q4)

Date: 2026-05-11. Status: draft for human review before dispatch to Red.

Scope: 4 implementation-blocking clarifications surfaced by W2a Wave-2 curation. Each question has a concrete row example, current IFPA additive math, FM-reported math, and an explicit implementation consequence.

Preserved baselines (do not re-litigate): pt10 (quantum=+1, nuclear=+2, spinning/whirling/swirling flat +1, rotational escalation retired); pt11 (blurry=+1 flat, torque=Miraging Osis, blender=Whirling Osis, ripwalk=Stepping Butterfly); pt3 (stepping vs tapping distinct); pt4 (eggbeater=atomic legover); pt6 (furious composition); pt8 (productive-multiplicity policy).

Federation-not-adoption preserved. Parser/editorial separation preserved.

---

## Integrity note up front

Tier-1 and Tier-2 Wave-2 rows are **not** blocked by any of Q1-Q4. They are math-clean against current rulings and ready to insert regardless of Red outcomes. The detailed block matrix sits in §6.

Q1-Q4 unblock Tier-3 ready-after-Red rows and inform Wave-3 candidate triage. They are worth asking because:
- Q1 (same-side) extends an already-queued pt12 item (Barfry) into a general rule.
- Q2-Q3 (math edge cases) surface consistent off-by-ones whose pattern Red can confirm or correct in one ruling each.
- Q4 (fairy vocabulary) gates one Wave-2 row (Casket) plus a broader Wave-3 cohort; one ruling unblocks both.

---

## Q1. Same-side (`ss`) ADD impact -- general rule

**Issue:** Same-side variants in FM technical_names have inconsistent ADD impact vs their non-ss equivalents. pt11 queued Barfry Nuclear ss math; the same question recurs across Wave-2 and Wave-3 candidates. A general rule resolves all of them in one answer.

**Concrete example:** Hurl = Nuclear ss Whirl. FM reports ADD=4.

| Reading | Math | Total |
|---------|------|-------|
| Current IFPA additive (no ss accounted) | nuclear (2) + whirl (3) | 5 |
| FM-reported | (FM treats `ss` as -1) | 4 |
| Delta | -1 from ss | |

**Cross-row evidence (-1 hypothesis vs zero-effect hypothesis):**

| Row | Decomposition | IFPA additive | FM | Implied ss impact |
|-----|---------------|---------------|----|-------------------|
| Hurl | Nuclear ss Whirl | 5 | 4 | -1 |
| Barfry | Nuclear ss Butterfly (pt11 queued) | 5 | 4 | -1 |
| Maverick | Pixie ss Osis | 4 | 4 | 0 |
| Casket | Fairy ss Drifter | depends on Q4 | 4 | tbd |

Hurl and Barfry are consistent at -1. Maverick is at 0. Pattern suggests ss may interact with the specific modifier rather than reducing base ADD uniformly.

**Implementation consequence:**

- If ss = -1: Hurl is insertable as `nuclear ss whirl` with adds=4, modifier_links=`nuclear`, ss flag captured (probably via a `same_side` boolean column or a `ss` modifier-link entry).
- If ss = 0: Hurl is insertable as adds=5 (FM math wrong on Hurl), OR ss is a cosmetic display flag with no ADD impact.
- If ss = modifier-specific: requires per-modifier table extension or a structured ss-interaction model. Heaviest path.

**Affected Wave-2 rows:** Hurl (ready-after-Red), Casket (ready-after-Red, also blocked by Q4). Neither is Tier 1 or Tier 2.

**Affected family ladders:** Whirl family (Hurl at 4 ADD), drifter family (Casket at 4 ADD). Both are sparse-tier additions.

**Block status:** Tier 1: no. Tier 2: no. Tier 3: 2 rows (Hurl, Casket).

---

## Q2. Symposium on a 2-ADD rotational base (mirage)

**Issue:** Wave-1 ships symposium=+1 on whirl (Montage 7-ADD math, Mullet 6-ADD math, both verified). One Wave-2 candidate (Conniption City) reports a FM ADD that contradicts the additive +1 reading on mirage as base.

**Concrete example:** Conniption City = Quantum Symposium Mirage. FM reports ADD=5.

| Reading | Math | Total |
|---------|------|-------|
| Current IFPA additive | quantum (1) + symposium (1) + mirage (2) | 4 |
| FM-reported | -- | 5 |
| Delta | +1 unaccounted | |

**Counter-evidence from a similar row:** Royall Assassin = Pixie Ducking Symposium Mirage. FM=5. Additive: pixie (1) + ducking (1) + symposium (1) + mirage (2) = 5. Math agrees.

Royall Assassin agreeing under straightforward additive math is evidence against a systematic "symposium on mirage = +2" rule. The Conniption City discrepancy may be a FM data-entry error on that single row.

**Implementation consequence:**

- If "FM is wrong on Conniption City": insert as adds=4 with FM disagreement preserved in `freestyle_trick_source_links.notes`.
- If "symposium on mirage = +2 (rotational-base bonus on 2-ADD base)": ripple effect on every symposium-on-mirage row in the corpus (currently small, but worth surfacing).
- If "quantum interacts with symposium on rotational base": more complex; affects future quantum+modifier compositions.

**Affected Wave-2 rows:** Conniption City (ready-after-Red). Tier 3.

**Affected family ladders:** Mirage family (currently 11 active; Conniption City would land at 5 ADD).

**Block status:** Tier 1: no. Tier 2: no. Tier 3: 1 row.

---

## Q3. Blurry on a non-rotational base

**Issue:** pt11 ruled blurry=+1 flat. Three FM rows where blurry lands on a non-rotational base all show a consistent +1 discrepancy vs additive math. Pattern is clean enough to ask: is the +1 ruling rotational-only, or universal?

**Concrete example:** Bedwetter = Blurry Eggbeater. FM reports ADD=5.

| Reading | Math | Total |
|---------|------|-------|
| Current IFPA additive (pt11 blurry=+1) | blurry (1) + eggbeater (3) | 4 |
| FM-reported | (pre-pt11 blurry=+2 reading) | 5 |
| Delta | +1 (pre-pt11 weight) | |

**Cross-row evidence:**

| Row | Decomposition | IFPA additive (pt11) | FM | Delta |
|-----|---------------|-----------------------|----|-------|
| Bedwetter | Blurry Eggbeater (eggbeater non-rotational) | 4 | 5 | +1 |
| Blizzard | Blurry Illusion (illusion non-rotational) | 3 | 4 | +1 |
| Golden Shower | Blurry Ducking Eggbeater (non-rotational) | 5 | 6 | +1 |

Three consistent +1 disagreements on non-rotational bases. Already-queued pt12 items Blurry Whirl and Blurry Torque concern blurry on rotational bases; the relationship between the two cohorts is the implicit question.

**Implementation consequence:**

- If blurry=+1 on ALL bases (rotational and non-rotational): insert Bedwetter as adds=4 with FM disagreement preserved; FM math is pre-pt11.
- If blurry=+1 rotational / +2 non-rotational: insert Bedwetter as adds=5; modifier table needs `blurry` entry with add_bonus=2, add_bonus_rotational=1 (reverting the pt11 1,1 flip for non-rotational case).
- If blurry behaves differently still: defer all blurry-on-non-rotational rows pending more rulings.

This question's answer also informs how pt12 Blurry Whirl and Blurry Torque resolve.

**Affected Wave-2 rows:** Bedwetter (ready-after-Red). Tier 3.

**Affected family ladders:** Eggbeater rows in legover family (Bedwetter at 4 or 5 ADD). Smaller impact on illusion family (Blizzard, not in Wave-2 shortlist).

**Block status:** Tier 1: no. Tier 2: no. Tier 3: 1 row.

---

## Q4. Status of `fairy` as IFPA modifier

**Issue:** FM uses the token `fairy` as a modifier across 8+ rows. IFPA's `freestyle_trick_modifiers` table does not contain `fairy`. Wave-1 set a precedent by adopting `diving` (Hatchet=Diving Whirl shipped). One Wave-2 candidate (Casket) blocks on the same adjudication for `fairy`. The decision propagates to a Wave-3 cohort of ~8 FM rows.

**Concrete example:** Casket = Fairy ss Drifter. FM reports ADD=4.

| Reading | Math | Total |
|---------|------|-------|
| Current IFPA additive | fairy (unknown) + drifter (3) +/- ss (Q1) | indeterminate |
| FM-reported | -- | 4 |

The math here depends on both Q1 (ss impact) and Q4 (fairy weight + classification).

**Three options:**

- **(a) Adopt as IFPA modifier.** Add `fairy` to `freestyle_trick_modifiers` with explicit add_bonus and add_bonus_rotational values. Matches `diving` precedent. Unblocks 9 FM rows (Casket + Fear + Feral + Ferocious + Fudge + Fume + Guillotine + Fairy Beater + Fairy ss Osis). Curator must assign weights.
- **(b) Folk alias only.** `fairy`-prefixed FM rows become IFPA aliases on existing IFPA canonicals (e.g., Fairy Mirage = alias on an existing pixie/quantum mirage row). Avoids growing the IFPA modifier table; less editorial precision.
- **(c) Reject.** FM `fairy`-prefixed rows are not promoted to canonical. The 9 rows remain FM-only. Aligns with federation-not-adoption posture but discards real evidence.

**Implementation consequence:**

- Option (a): single modifier-table INSERT plus 9 canonical-row pathways open up. Most editorial value. Requires Red to specify the add_bonus values.
- Option (b): no modifier-table change; alias rows only. Pattern matches the Blur=Stepping Paradox Mirage precedent (FM label is folk alias).
- Option (c): closes the 9-row cohort without further work.

**Affected Wave-2 rows:** Casket (ready-after-Red, doubly blocked with Q1). Tier 3.

**Affected family ladders:** depends on option. Option (a) potentially touches drifter, mirage, butterfly, osis, illusion, pickup families with fairy-prefixed rows.

**Block status:** Tier 1: no. Tier 2: no. Tier 3: 1 Wave-2 row + ~8 Wave-3 candidates.

---

## 5. Summary table

| Q | Subject | Concrete row | IFPA additive | FM | Delta | Tier-1 blocked | Tier-2 blocked | Tier-3 rows blocked |
|--:|---------|--------------|--------------:|---:|------:|:-:|:-:|:-:|
| Q1 | Same-side ADD impact | Hurl (Nuclear ss Whirl) | 5 | 4 | -1 | no | no | 2 (Hurl, Casket) |
| Q2 | Symposium on mirage | Conniption City (Quantum Symposium Mirage) | 4 | 5 | +1 | no | no | 1 (Conniption City) |
| Q3 | Blurry on non-rotational | Bedwetter (Blurry Eggbeater) | 4 | 5 | +1 | no | no | 1 (Bedwetter) |
| Q4 | `fairy` modifier status | Casket (Fairy ss Drifter) | indeterminate | 4 | -- | no | no | 1 (Casket) + ~8 Wave-3 |

---

## 6. Implementation-block matrix

Tier-1 + Tier-2 Wave-2 rows are stable regardless of Q1-Q4 outcomes. Tier-3 has 4 rows in ready-after-Red state, each blocked by exactly the question(s) below.

| Wave-2 row | Tier | Q1 | Q2 | Q3 | Q4 | Ready when |
|-----------|:---:|:--:|:--:|:--:|:--:|------------|
| Matador | 1 | -- | -- | -- | -- | now |
| Phoenix | 1 | -- | -- | -- | -- | now |
| Mind Bender | 1 | -- | -- | -- | -- | now |
| Tripwalk | 2 | -- | -- | -- | -- | now |
| Tapdown | 2 | -- | -- | -- | -- | now |
| Spinal Tap | 2 | -- | -- | -- | -- | now |
| Tremor | 3 | -- | -- | -- | -- | now |
| Legeater | 3 | -- | -- | -- | -- | now |
| Shmoe | 3 | -- | -- | -- | -- | now |
| Twirl | 3 | -- | -- | -- | -- | now (Q6 deferred) |
| Symposium-Eggbeater | 3 | -- | -- | -- | -- | now (Q7 deferred) |
| Conniption City | 3 | -- | block | -- | -- | after Q2 |
| Hurl | 3 | block | -- | -- | -- | after Q1 |
| Bedwetter | 3 | -- | -- | block | -- | after Q3 |
| Casket | 3 | block | -- | -- | block | after Q1+Q4 |
| Marius | -- | n/a (alias) | n/a | n/a | n/a | now (alias-only) |
| Whirlwind | -- | n/a (alias) | n/a | n/a | n/a | now (alias-only) |
| Ripped Warrior | held | -- | -- | -- | -- | after Q6 (separate) |

**Conclusion:** 11 of 18 Wave-2 rows can proceed today (Tier-1, Tier-2, 5 Tier-3 unblocked, plus 2 federation-conflict aliases). 4 Tier-3 rows wait for Q1-Q4 outcomes. 1 row (Ripped Warrior) waits on Q6 (out of this packet).

---

## 7. Expected ontology impact (Q1-Q4 answers)

### If all 4 questions land "FM is correct, IFPA needs adjustment"

- Q1 same-side becomes a structural concept (likely a column or new modifier).
- Q2 introduces symposium-rotational-base-weight asymmetry.
- Q3 reverts pt11 blurry ruling for non-rotational bases (1,2 weight restored for non-rot, 1,1 stays for rot).
- Q4 adds `fairy` to the IFPA modifier table.

Combined: 1 modifier-table addition, 1 ruling extension (Q3), 1 column or schema addition (Q1), 1 weight-asymmetry rule (Q2). Real ontology growth but bounded and surgical.

### If all 4 questions land "IFPA is correct, FM is wrong for these rows"

- Q1 confirms ss as cosmetic (zero ADD impact).
- Q2 marks Conniption City as FM-data-error.
- Q3 confirms pt11 blurry=+1 flat universally.
- Q4 rejects `fairy` as IFPA-vocab; FM rows treated as folk aliases.

Combined: no ontology change. The 4 ready-after-Red rows insert at IFPA-additive math with FM disagreement preserved in `freestyle_trick_source_links.notes`. Federation-not-adoption posture maintained in its strongest form.

### Mixed outcome (most likely)

Probable real-world result is some adoption (likely Q4 option a or b for `fairy` based on `diving` precedent) and some FM-error confirmation (likely Q2 since Royall Assassin counter-case agrees). Net ontology growth: small.

---

## 8. Preservation guarantees (these do not change regardless of answers)

- **Federation-not-adoption.** No FM row auto-imports. Every Red-cleared row still goes through `red_additions_2026_04_20.csv` + curator review per Wave-1 precedent.
- **Parser/editorial separation.** Q1-Q4 answers shape the EDITORIAL decomposition table (modifier_links + base + adds). The parser layer reads only canonical_name; nothing in Q1-Q4 changes that.
- **pt10/pt11 normalization baseline.** Q3 may extend (not contradict) pt11; Q1, Q2, Q4 do not touch pt10/pt11 settled rulings. `feedback_parser_editorial_separation.md` invariant maintained.
- **Asserted ADD remains editorial truth.** Every row's final adds value is the curator decision after Red ruling, not FM data nor parser inference.

---

## 9. Out of this packet

- Q5 (paradox inclusion in spinning chains for federation conflicts Marius / Whirlwind) -- deferred. Marius and Whirlwind insertable as folk aliases regardless of Q5 outcome.
- Q6 (direction-strip canonicalization for Twirl, Ripped Warrior) -- deferred. Twirl insertable now under current direction-strip behavior; Ripped Warrior remains held until Q6 lands.
- Q7 (display-only FM rows for Symposium-Eggbeater and similar) -- deferred. Symposium-Eggbeater insertable now under "trust display name when tokens are IFPA-recognized" pattern.
- Q8 (meta: FM math reliability) -- deferred indefinitely; not needed for any Wave-2 row.

The 5 already-queued pt12 items (Blurry Whirl/Torque canonical decomposition, spinning-torque adds cleanup, Barfry ss math, Frigidosis, and the 5 Wave-1 DEFER candidates Genesis/Enterrage/Whirlygig/Bladerunner/Merlin) remain in their own pt12 packet.

---

## 10. Recommended dispatch shape

Send Q1-Q4 as a single packet to Red. Expected ruling effort: small per question (each is a one-line policy decision plus optional add_bonus values for Q4). Expected unblock: 4 Tier-3 Wave-2 rows.

If Red prefers smaller chunks: Q3 alone is the highest-signal individual question because it extends an already-settled pt11 ruling rather than introducing new policy. Send Q3 first if a single-question dispatch is preferred.
