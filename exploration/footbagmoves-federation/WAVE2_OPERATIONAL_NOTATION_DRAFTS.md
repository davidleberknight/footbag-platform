# Wave-2 Operational Notation Drafts (W2c-A)

Date: 2026-05-11. Status: drafts only. No DB writes. Federation-not-adoption: each draft is FM evidence pending curator review.

Source: `legacy_data/out/footbagmoves_inventory.csv` column `operational_notation_raw`. Each FM string is presented verbatim as a draft seed; the column entry that lands in `freestyle_tricks.operational_notation` is a curator decision (may differ from the FM verbatim).

Grammar reference: `OPERATIONAL_NOTATION_GRAMMAR.md`. Tokens (CLIP, TOE, DUCK, OP IN, OP OUT, OP CLIP, SAME, FRONT, BACK, SPIN, WHIRL, DEX, PDX, BOD, XBD, DEL) all map to existing operational-token role classes per `src/services/operationalNotationRendering.ts`.

Apply path when approved: append rows to `red_corrections_2026_04_20.csv` with field=`operational_notation` and field=`operational_notation_source`. Loader 19 applies via the existing per-field-correction mechanism.

---

## 1. FM evidence (verbatim from inventory)

| Slug | FM display | FM technical | Operational notation (FM, verbatim) |
|------|-----------|--------------|--------------------------------------|
| matador | Matador | Nuclear Butterfly | `Clip > Same Out (DEX)(PDX) >> Op Out (DEX) > Op Clip (XBD)(DEL)` |
| phoenix | Phoenix | Pixie Ducking Butterfly | `Toe > Same In (DEX) >> Duck (BOD) >> Op Out (DEX) > Op Clip (XBD)(DEL)` |
| mind-bender | Mind Bender | Ducking Paradox Blender | `Clip >> Duck (BOD) >> Same Front Whirl (DEX)(PDX) > (back) Spin (BOD) > Same Clip (XBD)(DEL)` |
| tripwalk | Tripwalk | Quantum Butterfly | `Toe > Op In (DEX) >> Op Out (DEX) > Op Clip (XBD)(DEL)` |
| legeater | Legeater | Quantum Pickup | `Toe > Op In (DEX) >> Op In (DEX) > Same Toe (DEL)` |
| spinal-tap | Spinal Tap | Tapping Torque | `Toe > Op Out (DEX) >> Same In (DEX) > (front) Spin (BOD) > Op Clip (XBD)(DEL)` |

---

## 2. Curator-review checklist (per row)

Before any FM string lands in `operational_notation`, curator should verify:

- [ ] Sequence tokens (CLIP, TOE) are in the IFPA-grammar set (no FM-private surface-tokens).
- [ ] Body-component flags (BOD, DEX, XBD, PDX, DEL) tokenize via `shapeOperationalNotationDisplay()` without warnings.
- [ ] Pre-state annotations like `(front)`, `(back)` are intended directional notes vs FM-internal markup.
- [ ] Same/Op side tokens align with the IFPA-side convention for the trick.
- [ ] The sequence reads correctly when rendered with warm-palette token highlighting (preview against the trick-detail "Set notation (operational)" section before committing).

Wave-1 precedent: Matador's siblings on Montage / Mullet / Spender shipped after this same checklist. See memory `project_freestyle_state.md` "Operational notation surface (O1a-d)" for the cadence.

---

## 3. Per-row notes

### 3.1 Matador (Nuclear Butterfly)

FM: `Clip > Same Out (DEX)(PDX) >> Op Out (DEX) > Op Clip (XBD)(DEL)`

Reads as: clipper set, same-side out kick with dex and paradox, then opposite-out kick with dex, landing in cross-body clipper delay. 4 sequence steps (Clip start; Same Out; Op Out; Op Clip end).

PDX flag on Same Out is the explicit paradox marker -- this is where nuclear's +2 ADD (per pt10 Paradox Atomic set) anchors. Curator note: confirm PDX placement matches IFPA paradox-direction convention.

Recommended source-note: `FM curator-reviewed (2026-05-11)`.

### 3.2 Phoenix (Pixie Ducking Butterfly)

FM: `Toe > Same In (DEX) >> Duck (BOD) >> Op Out (DEX) > Op Clip (XBD)(DEL)`

Reads as: toe set, same-side in kick (pixie reset), ducking body compression, opposite-out kick, cross-body clipper delay. 5 sequence steps.

The `Duck (BOD)` marker between Same In and Op Out is the ducking body-modifier surfacing in the operational layer. 3-modifier compound surfaces as 3-step body sequence -- editorially this is the most operational-grammar-rich Wave-2 row.

Recommended source-note: `FM curator-reviewed (2026-05-11)`.

### 3.3 Mind Bender (Ducking Paradox Blender)

FM: `Clip >> Duck (BOD) >> Same Front Whirl (DEX)(PDX) > (back) Spin (BOD) > Same Clip (XBD)(DEL)`

Reads as: clipper set, ducking compression, same-side front whirl with dex and paradox, body reverses to a back spin, same-side cross-body clipper delay. 5 sequence steps.

Most-complete operational notation in Wave-2. The `(front)` / `(back)` directional annotations differentiate body orientation across the spin transition -- these are pre-state flags per the grammar. Pairs operationally with Spender's notation for cross-row teaching value (Spender uses `Spinning (BOD)` where Mind Bender uses `Duck (BOD)`).

Recommended source-note: `FM curator-reviewed (2026-05-11)`.

### 3.4 Tripwalk (Quantum Butterfly)

FM: `Toe > Op In (DEX) >> Op Out (DEX) > Op Clip (XBD)(DEL)`

Reads as: toe set, opposite-in kick, opposite-out kick, cross-body clipper delay. 4 sequence steps; cleanest minimum-vocabulary example in Wave-2.

This is the recommended teaching exhibit for the operational-notation warm-palette rendering -- short enough to absorb on one viewing; uses the core OP IN / OP OUT / OP CLIP tokens.

Recommended source-note: `FM curator-reviewed (2026-05-11)`.

### 3.5 Legeater (Quantum Pickup)

FM: `Toe > Op In (DEX) >> Op In (DEX) > Same Toe (DEL)`

Reads as: toe set, opposite-in kick, opposite-in kick again, same-side toe delay. 4 sequence steps; ends in toe delay rather than clipper -- diagnostic of the pickup base.

Pairs with Wave-1 Paste's operational notation (Pixie Pickup -- if seeded) for cross-row pickup-family comparison. Pickup-base ending in toe-delay is the family signature in operational notation.

Recommended source-note: `FM curator-reviewed (2026-05-11)`.

### 3.6 Spinal Tap (Tapping Torque)

FM: `Toe > Op Out (DEX) >> Same In (DEX) > (front) Spin (BOD) > Op Clip (XBD)(DEL)`

Reads as: toe set, opposite-out kick, same-side in kick, front-body spin, cross-body clipper delay. 5 sequence steps.

The `(front) Spin (BOD)` here is the rotational signature inherited from the torque base (pt11 torque = Miraging Osis transitive). Curator should verify the (front) directional annotation aligns with IFPA-side body-direction conventions for torque-family compounds.

Recommended source-note: `FM curator-reviewed (2026-05-11)`.

---

## 4. Recommended apply-batch (when approved)

If W2c-B (operational notation seeding) is approved, append 12 rows to `red_corrections_2026_04_20.csv`:

```
matador,operational_notation,,Clip > Same Out (DEX)(PDX) >> Op Out (DEX) > Op Clip (XBD)(DEL),"FM Wave-2 operational notation seed 2026-05-11"
matador,operational_notation_source,,FM curator-reviewed (2026-05-11),"Source-provenance line for matador operational notation"
phoenix,operational_notation,,Toe > Same In (DEX) >> Duck (BOD) >> Op Out (DEX) > Op Clip (XBD)(DEL),"FM Wave-2 operational notation seed 2026-05-11"
phoenix,operational_notation_source,,FM curator-reviewed (2026-05-11),"Source-provenance line for phoenix operational notation"
mind-bender,operational_notation,,Clip >> Duck (BOD) >> Same Front Whirl (DEX)(PDX) > (back) Spin (BOD) > Same Clip (XBD)(DEL),"FM Wave-2 operational notation seed 2026-05-11"
mind-bender,operational_notation_source,,FM curator-reviewed (2026-05-11),"Source-provenance line for mind-bender operational notation"
tripwalk,operational_notation,,Toe > Op In (DEX) >> Op Out (DEX) > Op Clip (XBD)(DEL),"FM Wave-2 operational notation seed 2026-05-11"
tripwalk,operational_notation_source,,FM curator-reviewed (2026-05-11),"Source-provenance line for tripwalk operational notation"
legeater,operational_notation,,Toe > Op In (DEX) >> Op In (DEX) > Same Toe (DEL),"FM Wave-2 operational notation seed 2026-05-11"
legeater,operational_notation_source,,FM curator-reviewed (2026-05-11),"Source-provenance line for legeater operational notation"
spinal-tap,operational_notation,,Toe > Op Out (DEX) >> Same In (DEX) > (front) Spin (BOD) > Op Clip (XBD)(DEL),"FM Wave-2 operational notation seed 2026-05-11"
spinal-tap,operational_notation_source,,FM curator-reviewed (2026-05-11),"Source-provenance line for spinal-tap operational notation"
```

Apply via the existing loader 19 path. Verify renders via the trick-detail "Set notation (operational)" section. Confirm warm palette tokens highlight correctly.

The "old_value" column is empty because these are first-time fills (current value is NULL). Loader 19 per-field correction logic accepts empty old_value per Wave-1 Pigbeater precedent.

---

## 5. Preservation

- Federation-not-adoption: FM strings are evidence only. Curator approval gates DB writes.
- Parser/editorial separation: operational notation never reads from or writes to the semantic-notation or modifier_links surface.
- Restraint-first: operational-notation section continues to omit when NULL (UX1 behaviour preserved); seeded strings activate the section per existing template logic.
- Wave-1 UX conventions: O1a section structure + O1b token highlighting + O1c glossary link + O1d source-provenance line all reused unchanged.

---

## 6. Out of scope

- No DB writes (this is W2c-A planning).
- No grammar additions. Every FM token maps to existing operational-token roles.
- No tooltip-label changes. Existing `WORD_TOKEN_LABELS` and `COMPONENT_FLAG_LABELS` cover every token in the 6 strings.
- No glossary updates. `/freestyle/glossary#operational-notation` covers the vocabulary already.
- No Wave-3 operational notation drafts. Wave-3 candidates (Tier-3 ready-after-Red, fairy/gyro vocab cohort) deferred.
