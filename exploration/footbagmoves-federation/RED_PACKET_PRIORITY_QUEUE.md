# Red Packet Priority Queue (PASSBACK-GRAMMAR-2 / Part C)

Candidate questions for the next Red review packet(s). Each question is
atomic, high-leverage, evidence-backed, and not already settled.

## Selection criteria (applied)

A question made this queue only if it satisfies ALL:

- **Atomic** — answers in one paragraph; not a multi-part packet.
- **Evidence-backed** — the conflict appears in DB/inventory/screenshots.
- **High-leverage** — resolution unblocks ≥ 1 row or settles an operator class.
- **Ontology-relevant** — affects canonical decomposition or modifier table.
- **Not already resolved** — not covered by pt1–pt11 rulings or the SS ruling.
- **Not a parser/UI question** — implementation details excluded.

Questions are ranked by:
1. **Promotion blocker** count
2. **Class scope** (settles many rows vs one)
3. **Pre-existing pt12 dependency**

## Priority queue

### Q1 — Atomic on Illusion (Omelette delta)

**Why it matters**: Omelette's FM ADD=4 (decomposition "Atomic Illusion") diverges from IFPA's omelette=3. If atomic+illusion is genuinely 4 ADD by IFPA's own additive math (atomic=+1, illusion=3), then IFPA's omelette=3 has the math gap, not FM. Alternatively, omelette may be a different trick than "atomic illusion" in IFPA's eyes.

**Affected rows**:
- omelette (currently IFPA=3 ADD; FM=4 ADD)
- by extension: any IFPA row whose modifier_links decompose with atomic+illusion

**Ontology impact**: If IFPA's omelette is mis-attested, the row's `adds` may need to shift from 3 to 4. Or omelette may need re-classification (e.g., atomic-illusion as a separate row).

**Promotion impact**: blocks atomic-illusion promotion as a SCALE-5 candidate.

**Phrasing seed**: "IFPA records omelette = 3 ADD. FM records Omelette = 4 ADD with technical_name 'Atomic Illusion'. Under IFPA's additive math, atomic(+1) + illusion(3) = 4. Is omelette = 3 a math attestation gap, or is omelette a different trick than 'atomic illusion'?"

---

### Q2 — Double-Pixie semantics (Terrage delta)

**Why it matters**: Terrage's FM ADD=3 (decomposition "Double Pixie") diverges from IFPA's terrage=4. Either FM's "Double Pixie" reading is incomplete (and IFPA's 4 is correct), or IFPA's terrage has a +1 inflation. Pixie is +1 per IFPA; double-pixie is the question.

**Affected rows**:
- terrage (currently IFPA=4; FM=3)
- broader question: does "Double X" in FM technical_name imply 2x the modifier's ADD weight, or is it a single composite modifier?

**Ontology impact**: If "Double" is a +N stacking convention (2 × pixie's +1 = +2), then a class of FM "Double-X" technical_names becomes computable. If it's a single composite, IFPA's terrage=4 math needs justification.

**Promotion impact**: blocks terrage promotion as a SCALE-5 candidate; affects class of FM rows using "Double" composition.

**Phrasing seed**: "FM technical_name 'Double Pixie' yields Terrage = 3 ADD. IFPA records terrage = 4 ADD. Does 'Double <modifier>' in FM mean (a) 2 × modifier ADD weight, (b) a single composite-modifier with its own weight, or (c) FM data noise?"

---

### Q3 — Positional operators ADD weight (class question)

**Why it matters**: SS=+0 is settled. The other positional operators (`near`, `far`, `op`, `os`, `set`-as-surface-shorthand) appear across the corpus in the same syntactic slot as `ss`, and inspection of their occurrences shows no ADD-weight pattern. But formal Red ruling has not been requested for these.

**Affected rows**:
- 14 inventory rows with "Far" token (Barfly, Reaper, Ripwalk, Cyborg, Leviathan, etc.)
- 2 "op" rows (Flipwalk, Zipwalk)
- 3 "os" rows (Paradon, Pteradon, Triadon)
- 8 "set"-surface rows (Barrage, Orpheus, Flipwalk, Triadon, etc.)
- 0 "near" rows in scrape, present in screenshots
- The full PassBack/FM grammar layer

**Ontology impact**: Formal confirmation that positional operators are 0-ADD universally would close the C11+C12 conflict pair. No modifier-table additions; no parser changes; just a documented rule analogous to SS=+0.

**Promotion impact**: doesn't block any current promotion track, but settling this class removes a future blocker for FM grammar Phase 2.

**Phrasing seed**: "Per the SS ruling, same-side carries no ADD weight. Inspection of the corpus shows `near`, `far`, `op`, `os`, and surface-`set` operators consistently appear with 0 ADD impact across observed compounds. Should the rule generalize: 'positional operators in FM grammar carry 0 ADD weight universally'? Or should specific operators be ruled separately?"

---

### Q4 — `Reverse` direction operator ADD weight (single-operator question)

**Why it matters**: `Reverse` appears in 3 IFPA-canonical contexts (Reverse Whirl = rev-whirl at 3 ADD, Reverse Drifter = Grifter alias, Reverse Torque = Flux at 4 ADD, Reverse Blender = Dyno at 4 ADD). All ADD values match base-trick ADD with no Reverse-modifier ADD added. Suggests Reverse = 0 ADD universally as a directional operator.

**Affected rows**:
- rev-whirl, rev-up, dyno, flux, grifter, plus FM tech_names with "Reverse" prefix

**Ontology impact**: Confirms Reverse as a directional + descriptive operator (no ADD); no modifier-table entry needed.

**Promotion impact**: doesn't block but enables clean prose for the rev-* whirl family rows.

**Phrasing seed**: "Reverse Whirl (rev-whirl) = 3 ADD, Reverse Blender (Dyno) = 4 ADD, Reverse Torque (Flux) = 4 ADD — Reverse appears to be a 0-ADD direction reversal. Should Reverse be formally documented as a 0-ADD directional operator?"

---

### Q5 (pt12 dependency) — Blurry on rotational bases

**Why it matters**: pt12 queue items 1–2 + 5b (Blurry Whirl, Blurry Torque, Food Processor / Blurry Blender) all hit the same problem class: blurry's +1 flat rule (pt11) doesn't reach the asserted ADDs for several named blurry compounds. The blurry-modifier notes explicitly call out Blur (= Stepping Paradox Mirage) and Ripwalk (= Stepping Butterfly) as deeper decompositions. The unresolved question: which rotational-base blurry compounds expand similarly, and what's the expansion rule?

**Affected rows**:
- blurry-whirl (5 ADD; pt12 item 1)
- blurry-torque (6 ADD; pt12 item 2)
- food-processor (6 ADD; pt12 item 5b)
- whirlygig (FM "Blurry Symposium Whirl" → FM=6 vs IFPA expected 5; pt12 item 9)

**Ontology impact**: Could require new expanded-decomposition rules; potentially new compound modifier-link rows; potentially modifier-table notes documenting which blurry compounds are flat vs expanded.

**Promotion impact**: blocks all 4 pt12 items; affects ~3 actively-deferred SCALE candidates (blurry-whirl, food-processor, whirlygig).

**Phrasing seed**: "Pt11 ruled blurry = +1 flat. Several named blurry compounds (Blur, Ripwalk) carry deeper structural decompositions in their modifier notes. Blurry-Whirl, Blurry-Torque, Food Processor (Blurry Blender), and Whirlygig (Blurry Symposium Whirl) all show ADD-math gaps versus the flat blurry+base rule. What is the canonical rule for when a blurry compound expands vs stays flat? Per-trick decomposition catalogue, or a class-level rule?"

---

### Q6 — Furious operator (single-modifier question)

**Why it matters**: Fury = furious+paradox+mirage = 5 per pt6. But FM uses "Furious Mirage" as a single-modifier reading (Fury=6 in FM). Additionally, FM has Genesis = "Furious Whirl" → FM=7 vs IFPA expected 5 (pt12 item 7). Whether Furious is a +N modifier with its own weight, or a folk-shorthand for paradox+mirage, would settle several FM rows.

**Affected rows**:
- fury (currently IFPA=5 per pt6; FM=6)
- Genesis (FM "Furious Whirl"; pt12 item 7; FM=7 vs IFPA expected 5)
- Any other FM "Furious X" rows in the inventory

**Ontology impact**: If Furious is a +N IFPA modifier, modifier table grows by 1. If Furious is folk shorthand for paradox+mirage, no growth.

**Promotion impact**: not currently blocking any SCALE candidate (fury is pt6-settled IFPA-side); affects FM reconciliation only.

**Phrasing seed**: "FM uses 'Furious' as a leading modifier in technical_names (Furious Mirage = Fury, Furious Whirl = Genesis). Pt6 settled Fury = furious+paradox+mirage = 5, suggesting furious is folk shorthand for paradox+atomic-or-something. Is Furious an IFPA-recognized modifier with its own ADD weight, or is it permanently FM-vocab?"

---

### Q7 — Recursive set operator inheritance (Phase 2 grammar question)

**Why it matters**: PassBack Sets like Slaying = Symp Sailing = Symp Pixie Atomic are 3-deep modifier compositions. FM uses these names as "Set" entries (alongside primitives like Pixie, Atomic). If IFPA decides to expose recursive modifier compositions in the educational glossary (Phase 2), the question is whether the recursive name (Slaying) carries semantic weight beyond its expansion, or is purely a folk-shorthand.

**Affected rows**:
- Educational glossary surface (does not yet exist)
- 12+ recursive Sets-tab entries (Sailing, Slaying, Slicing, Frantic, Phasing, Hyper, Pogo, Leaning, Inspinning, Quasi, Riffing, Smiling)

**Ontology impact**: If recursive names are first-class modifier entries, modifier table grows substantially. If they're folk shorthand, no growth.

**Promotion impact**: doesn't block any current promotion; opens the design space for FM-grammar Phase 2.

**Phrasing seed**: "PassBack's Sets tab defines compound modifier names (Sailing = Pixie Atomic, Phasing = Fairy ss Spinning, etc.). Should IFPA's educational layer expose these as named compositions (with cross-references), or treat them as folk-shorthand only?"

---

## Recommended Top-3 packet

Three questions are highest-priority for the next Red packet (see `RED_PACKET_TOP3.md`):

1. **Q1 (Omelette atomic-illusion)** — unblocks 1 SCALE candidate; tests an additive-math edge case
2. **Q2 (Terrage double-pixie)** — unblocks 1 SCALE candidate; settles a class question ("Double X" semantics)
3. **Q3 (positional operators class)** — settles 5 operator families with one ruling; clears Phase 2 grammar work

Q4–Q7 are queued for subsequent packets. Q5 (pt12 Blurry) is already
queued via existing pt12 work and folds into the next pt12 packet.

## What this queue does NOT include

- Questions about parser internals or UI/UX
- Settled SS semantics
- The Q4-class FM-vocab batch (already drafted in `RED_PT12_PACKET_Q1_Q4.md`)
- Already-resolved pt1–pt11 rulings
- Implementation timing or scope questions

## Cross-reference

- `RED_PACKET_TOP3.md` — full-prose drafts of the 3 highest-priority questions
- `PASSBACK_CONFLICT_MATRIX.csv` — provides conflict_id → question mapping
- `RED_PT12_PACKET_Q1_Q4.md` — existing Q4 FM-vocab batch
- `RED_PT12_SS_SEMANTICS.md` — settled SS packet (for format reference)
