# Red pt12 Packet -- Draft (Wave-2 Adjudication)

Status: draft for human review before sending to Red. Date: 2026-05-11. Scope: pt12 additions surfaced by Wave-2 candidate curation (W2a phase).

Bounded scope per W2a brief:
- unresolved ontology tensions
- modifier ambiguity (FM-vocab vs IFPA-vocab)
- same-side weighting
- paradox inclusion semantics
- rotational normalization edge cases on lower-tier rotational bases

Explicitly NOT in scope (already settled; do not re-litigate):
- Quantum=+1 (pt10)
- Nuclear=+2 = Paradox Atomic set (pt10)
- Blurry=+1 flat (pt11)
- Spinning/Whirling/Swirling flat +1 (pt10 rotational escalation retired)
- Stepping distinct from Tapping (pt3)
- Pixie established as +1
- Torque=Miraging Osis (pt11)
- Blender=Whirling Osis (pt11)
- Ripwalk=Stepping Butterfly (pt11)
- Furious composition pattern for fury (pt6)
- Productive multiplicity policy (pt8 §10)

The 5 already-queued pt12 items (Blurry Whirl/Torque, spinning-torque cleanup, Barfry ss math, Frigidosis, and the 5 Wave-1 DEFER candidates Genesis/Enterrage/Whirlygig/Bladerunner/Merlin) remain in the queue and are NOT re-asked here. Q1-Q4 below extend that queue; Q5-Q8 are optional and may be deferred.

---

## Q1. Same-side weighting (general rule extending pt11 Barfry)

Wave-2 surfaces multiple same-side variants beyond the pt11 Barfry case. Need a general ADD rule rather than per-row rulings.

**Cases:**
- Hurl = Nuclear ss Whirl (FM=4). Non-ss equivalent would be Nuclear Whirl: nuclear (2) + whirl (3) = 5. With ss, FM reports 4. Difference: -1.
- Casket = Fairy ss Drifter (FM=4). Fairy is FM-vocab (see Q4); ss makes FM=4.
- Nallegam = Fairy Pickup (same side), FM=3.
- Maverick = Pixie ss Osis (FM=4). Without ss: pixie (1) + osis (3) = 4. With ss, FM=4. Difference: 0.

Wave-1 / pt11 already queued: Barfry = Nuclear ss Butterfly (FM=4 vs IFPA expected 5; -1 same as Hurl).

**Question:** Is the same-side modifier's ADD impact:
- (a) **a flat -1** from the non-ss equivalent (matches Barfry, Hurl observations);
- (b) **zero-effect** (cosmetic body-side flag; matches Maverick observation; explains why some FM same-side rows agree with non-ss math);
- (c) **base-family-dependent** (e.g., -1 on butterfly/whirl but zero on osis/drifter); or
- (d) **modifier-stack-dependent** (e.g., same-side reduces the bonus of one specific modifier in the chain, not the base ADD)?

A general rule unblocks: Hurl, Casket, Barfry, Nallegam, Maverick, and 49 other same-side rows in `footbagmoves_match_preview_same_side.csv`.

---

## Q2. Symposium-on-lower-tier rotational bases (mirage, blender)

Wave-1 settled symposium=+1 on whirl (Montage: 3+...+1=7, Mullet: 3+...+1=6, Spender: blender+...). Mirage is rotational base at 2 ADD; blender is rotational base at 4 ADD.

**Cases:**
- Conniption City = Quantum Symposium Mirage (FM=5). IFPA-style math: quantum (1) + symposium (1) + mirage (2) = 4. Off by one.
- Royall Assassin = Pixie Ducking Symposium Mirage (FM=5; A1b). IFPA: pixie (1) + ducking (1) + symposium (1) + mirage (2) = 5. Math agrees.

The Conniption City off-by-one suggests one of:
- (a) Symposium on a 2-ADD rotational base (mirage) carries +2, not +1.
- (b) Quantum on a rotational base interacts differently.
- (c) FM math is wrong for this specific row.

Royall Assassin agreeing under straightforward additive math is the counter-evidence for (a). One-row discrepancy may be a FM data-entry slip.

**Question:** Is Conniption City FM=5 a real off-by-one (and if so, which modifier carries the additional ADD), or is it FM data error / mis-classified entry? More generally, does symposium carry the same +1 weight on every rotational base, or does mirage-as-base-2 alter the bonus calculus?

---

## Q3. Blurry on non-rotational bases (extends pt11)

Pt11 settled blurry=+1 flat (modifier-table 1,2 -> 1,1). Verified rotational cases: Blurriest, Whirlygig (Blurry Symposium Whirl on whirl). The pt12 queue carries Blurry Whirl / Blurry Torque canonical decomposition (math-conflict on rotational base).

Wave-2 surfaces blurry on **non-rotational** bases:

**Cases:**
- Bedwetter = Blurry Eggbeater (FM=5). IFPA math: blurry (1) + eggbeater (3) = 4. Off by one.
- Blizzard = Blurry Illusion (A1a; not in Wave-2 shortlist). IFPA: blurry (1) + illusion (2) = 3. FM=4. Off by one.
- Golden Shower = Blurry Ducking Eggbeater (A1b). IFPA: blurry (1) + ducking (1) + eggbeater (3) = 5. FM=6. Off by one.

Three consistent off-by-ones (Bedwetter, Blizzard, Golden Shower) when blurry lands on non-rotational base.

**Question:** Does pt11 blurry=+1 apply only to rotational bases, with non-rotational base bonus being +2 (matching the pre-pt11 1,2 table)? Or is the off-by-one pattern a separate phenomenon (e.g., blurry on a 2-ADD or 3-ADD base requires a different weight)?

This question is the prerequisite for promoting Bedwetter to ready_now.

---

## Q4. FM-vocabulary modifier status

Wave-2 surfaces multiple FM-vocabulary modifier tokens not present in IFPA's `freestyle_trick_modifiers` table:

| FM token | Example FM rows | Apparent semantics |
|----------|-----------------|---------------------|
| fairy | Fear, Feral, Ferocious, Fudge, Fume, Guillotine, Casket, Fairy Beater | unclear; possibly a base-touch modifier |
| gyro | Mantis, Parallax, Quagmire, Blister, Gyro Clipper | possibly a rotation-style modifier |
| blazing | Blaze | possibly a paradox-family modifier |
| diving | Hatchet (Wave-1 shipped) | already adjudicated; ships in IFPA modifier_links |

Hatchet's "diving" was incorporated in Wave-1 (Diving Whirl, modifier_links=diving). That set a precedent for accepting FM-vocab into IFPA when math agrees.

**Question:** For each remaining FM token (fairy, gyro, blazing):
- (a) **Adopt as IFPA modifier** -- add to `freestyle_trick_modifiers`; specify add_bonus and add_bonus_rotational values.
- (b) **Recognize as folk alias** -- FM rows using these tokens become canonical IFPA rows under IFPA-vocab decomposition (e.g., "fairy" maps to a known modifier or modifier-combination); FM-token retained only as a display alias.
- (c) **Reject** -- FM-only rows are not promoted; not added to IFPA dict.

Per-token answer needed. The diving precedent (option a) is the simplest path; fairy's spread across 8+ FM rows suggests it earns adjudication on its own merits.

---

## Q5. Paradox inclusion in symposium-on-whirl chains (federation-conflict adjudication)

**Cases:**
- Whirlwind = FM "Spinning Paradox Symposium Whirl" (FM=6) maps to IFPA `spinning-symposium-whirl` (IFPA=5). IFPA decomp: spinning + symposium + whirl = 1+1+3 = 5. FM adds paradox as an explicit token.
- Marius = FM "Spinning Paradox Torque" (FM=6) maps to IFPA `spinning-torque` (IFPA=5). IFPA decomp: spinning + torque = 1+4 = 5. FM adds paradox.

Two consistent +1 disagreements driven by FM including "paradox" as an explicit token where IFPA omits it.

**Question:** Is paradox:
- (a) **implicit in IFPA composition** (e.g., spinning-symposium-whirl assumes a paradox reset; FM merely surfaces it)? If so, both IFPA and FM are correct under their own conventions; treat as ADD_ALIAS with no math conflict (alias is folk-only, math is editorial truth at IFPA's value).
- (b) **an actual missing modifier** in IFPA's decomposition for these rows? If so, the IFPA rows should be re-asserted as 6 ADD.
- (c) **a notation-form preference** (some authors include paradox in compound names, others don't)?

This is a federation-conflict ruling, not a row-insertion gate. It affects how Marius / Whirlwind aliases are recorded (with or without the math-conflict tag).

---

## Q6. Direction-strip canonicalization pattern

Wave-1 deferred Ripped Warrior over the stripped `far` directional. Wave-2 surfaces Twirl with stripped `reverse`. Pattern is consistent: FM technical_names sometimes include explicit direction tokens; the inventory builder strips them; the IFPA-side canonical name does not include the direction.

**Cases:**
- Twirl = "Reverse Swirling Osis" -> strip "reverse" -> swirling+osis=4. FM=4. Math agrees.
- Ripped Warrior = "Stepping Ducking Far Butterfly" -> strip "far" -> stepping+ducking+butterfly=5. FM=5. Math agrees.

**Question:** When a FM technical_name includes a directional token (`reverse`, `far`, `back`, `over`, etc.):
- (a) **Single canonical** -- strip the direction and create one IFPA canonical row; do not preserve the directional variant separately.
- (b) **Direction-prefixed canonical** -- preserve as `rev-twirl`, `far-ripped-warrior`, etc., creating a separate canonical row with the directional prefix.
- (c) **Direction-as-modifier** -- add a `direction` modifier to the IFPA modifier table; the canonical row carries direction modifiers in its modifier_links column.

Option (a) is the current inventory behavior. Option (c) would surface directions in the structural decomposition without proliferating canonical rows. Option (b) is the heaviest and likely premature.

---

## Q7. Symposium-Eggbeater (display-only FM entries)

Symposium Eggbeater has a FM display name but no FM technical_name. The IFPA decomposition (symposium + eggbeater = 1+3 = 4) is unambiguous from the display name, and FM=4 agrees.

**Cases (Wave-2 has 1; corpus has ~12 display-only A1a/A1b rows):**
- Symposium Eggbeater (no tech)
- Pixie Osis (no tech)
- Fairy ss Osis (no tech)
- Spinning Ducking Clipper (no tech)
- Weaving Clipper (no tech)
- Atomic Illusion (no tech)
- Atomic Osis (no tech)

**Question:** When FM provides a display name but no technical_name:
- (a) **Trust the display name** as a valid canonical-decomposition source; canonical IFPA row created with explicit modifier_links inferred from the display tokens.
- (b) **Block as FM-internal** -- FM display-only rows are not promotable; require FM tech-name evidence first.
- (c) **Conditional** -- promote when display-name tokens are all IFPA-recognized modifiers AND a known IFPA base; reject otherwise.

Option (c) is the most defensible; option (a) is simplest but trusts FM data hygiene more than the federation-not-adoption posture suggests; option (b) blocks a non-trivial cohort.

---

## Q8. Off-by-one cohort and FM math reliability

The W2a curation surfaced ~10 FM rows where FM-ADD disagrees with IFPA-side additive math by exactly 1. Pattern is not random:

- Blurry-on-non-rotational: 3 cases consistent (Q3)
- Quantum-Symposium-Mirage: 1 case (Q2)
- Spinning-paradox-on-existing-IFPA: 2 cases (Q5)
- Royall Assassin under additive math: agrees (counter-case)

**Question (meta):** Is there a known systematic bias in FM-ADD reporting (e.g., FM includes an implicit "paradox" or "reset" weight in compound names), or are off-by-ones row-specific data entries that should be evaluated individually?

A meta-answer here would simplify future-wave triage by setting an a-priori on whether to trust FM math when it disagrees with IFPA additive expectation.

---

## Bundling and dispatch notes

If Red prefers bundled packets:
- **Bundle A (math-rule extensions):** Q1, Q2, Q3 -- ADD-math rule extensions.
- **Bundle B (vocab governance):** Q4 -- FM-vocab adjudication.
- **Bundle C (federation-conflict and pattern):** Q5, Q6, Q7 -- federation-track conventions.
- **Bundle D (meta):** Q8 -- only worth asking after Q1-Q3 land.

Minimum-viable Wave-2 unblock: Q1 + Q3 (unblocks 4 of 4 ready-after-Red rows). Q4 unblocks no Wave-2 row but blocks several Wave-3 candidates from the fairy/gyro corpus.

---

## What this packet does NOT ask

- Anything pt10/pt11 already settled.
- Re-litigation of stepping/tapping/spinning/whirling/swirling/quantum/nuclear/blurry weights.
- Productive-multiplicity policy.
- Per-row decisions on Genesis/Enterrage/Whirlygig/Bladerunner/Merlin (already in pt12 #7-#11).
- The 5 Wave-1 DEFER candidates that landed in the prior session.
- Anything outside the bounded scope (modifier ambiguity / same-side / paradox / rotational-normalization-edges).
