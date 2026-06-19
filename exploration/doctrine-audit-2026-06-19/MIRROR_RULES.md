# Settled-Operator Mirror Rules (from the gyro-led pilot)

Derived and validated by promoting 3 rows end-to-end (gyro-toe, gyro-symposium-mirage,
gyro-symposium-double-leg-over). All three: parser `computed_adds == adds`, build clean, 2051
freestyle tests green. These rules let future settled-operator batches be generated
systematically instead of trick-by-trick.

## Operator chassis rules (the structural mirror)

### gyro (+1)
- Prepend `<entry> > (back) SPIN [BOD]`.
- **Flip the base's LEADING dex parity** (OP↔SAME); keep every subsequent dex and the terminal
  exactly as the base has them.
- Entry token: **`CLIP`** for dex-bearing bases (mirage/whirl/legover/dlo/torque…); **`SET`** for
  pure-stall bases (toe-stall, clipper-stall).
- ADD = base + 1 (the single `[BOD]`).
- Examples proven: gyro-toe = `SET > (back) SPIN [BOD] > SAME TOE [DEL]` (mirror of gyro-clipper,
  cross-body clip dropped, CLIP terminal → TOE).

### symposium (+1)
- **Fuse `[BOD]` onto the base's leading dex** with a `(no plant while)` prefix:
  `OP IN [DEX]` → `(no plant while) … IN [BOD] [DEX]`.
- ADD = base + 1.

### gyro + symposium stacked (+2)
- gyro flips the leading dex to **SAME**, symposium fuses its `[BOD]` onto that same dex:
  → `(back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > <rest of base>`.
- Examples proven:
  - gyro-symposium-mirage = `CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > OP TOE [DEL]` (= 4; mirror of gyro-symposium-whirl, whirl terminal `OP CLIP [XBD] [DEL]` → mirage terminal `OP TOE [DEL]`).
  - gyro-symposium-double-leg-over = `CLIP > (back) SPIN [BOD] > (no plant while) SAME IN [BOD] [DEX] > OP OUT [DEX] > SAME TOE [DEL]` (= 5; gyro-double-leg-over chassis + symposium `[BOD]` on the leading dex; the DLO's second `OP OUT [DEX]` is carried unchanged).

**Mirror selection:** pick the existing same-operator sibling whose base shares the most
structure, then swap only the **terminal** (stall vs clip vs toe) and carry through the extra
dex(es). Parity (SAME/OP) and `(plant)` annotations are best-effort/curator-refinable and do NOT
affect ADD or first-class.

## Pipeline rules (how to author + verify)

1. **Dedup BEFORE counting.** Strip `ss`/`(same side)`/`far`/`near`/`op` qualifiers (they do NOT
   change the slug) and fold folk parentheticals to the existing folk slug. Raw candidate lists
   inflate ~3–5× otherwise (nuclear 35→3, gyro 26→~4).
2. **base_trick = the terminal atom/base** (toe-stall, mirage, double-leg-over) — never the operator.
3. **trick_family = loader-19 default from base_trick**, but verify against the *majority*
   convention for that base, not a single sibling. (double-leg-over compounds: 15 use
   `double-leg-over`, 4 drift to `legover`; follow the 15. Override via a paired red_corrections
   `trick_family` row only when the default is wrong.)
4. **Author rows in two files:**
   - `red_additions`: `canonical_name,adds,base_trick,category=compound,aliases(pipe),modifier_links(pipe),description,review_status=expert_reviewed,is_active=1,review_note`
   - `red_corrections` (×2 per row): `slug,notation,,<UPPERCASE STRUCTURAL NAME>,…` and
     `slug,operational_notation,,<symbolic chassis>,…`
   - Loader 19 inserts additions then applies corrections in the **same run**, so corrections
     land on the just-added rows.
5. **aliases** go in the red_additions `aliases` column (pipe-list of folk texts) — wires both
   `aliases_json` and `freestyle_trick_aliases`. Verify the alias slug is free first.
6. **modifier_links** = the operator(s) in apply order (`gyro|symposium`), nothing else.
7. **Verification = `computed_adds == adds` with `add_formula_status` `exact_*`** — the parser
   re-derives bracket-count==ADD; that is the machine check, not just eyeballing.
8. **Skip conditions (do not mirror):**
   - empty-op_notation exemplars (terraging) — nothing to mirror; that's authoring.
   - held doctrine (atomic +1 vs code +2-rotational).
   - naming-open or operator-equivalent families (spyro = gyro aliases; furious ≡ barraging) —
     these are alias/governance work, not new rows.

## Reusable bracket-count check (pre-write)
Count `[DEX] [BOD] [XBD] [PDX] [DEL] [UNS] [XDEX]` brackets in the chassis; it must equal `adds`.
`(back) SPIN`, `(no plant while)`, `(plant)`, `(land)` are annotations and are NOT counted.
