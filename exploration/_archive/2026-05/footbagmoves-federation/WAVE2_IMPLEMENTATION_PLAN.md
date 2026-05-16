# Wave-2 Tier-1 Implementation Plan

Date: 2026-05-11. Status: planning only. No DB writes. No ontology mutation. Federation-not-adoption preserved.

Scope: 6 math-clean Tier-1 candidates from the W2a shortlist (Matador, Phoenix, Mind Bender, Tripwalk, Legeater, Spinal Tap). All ready-now per the Q1-Q4 implementation-block matrix; none touched by Q1-Q4 dependencies.

Companion artifacts:
- `WAVE2_INSERTION_MATRIX.csv` -- per-row canonical/slug/base/modifier_links/adds/aliases/category/notation values ready for `red_additions_2026_04_20.csv` append.
- `WAVE2_OPERATIONAL_NOTATION_SEEDS.csv` -- per-row FM operational-notation evidence + curator-authoring status.
- `WAVE2_MEDIA_TARGETS.md` -- media-readiness inventory + curator priorities.
- `WAVE2_FAMILY_IMPACT.md` -- family-ladder before/after with pedagogical pairings.
- `WAVE2_CANDIDATE_SHORTLIST.md` -- W2a curation; defines Tier-1/2/3 categorization.
- `RED_PT12_PACKET_Q1_Q4.md` -- block matrix confirming Tier-1 needs no Red answer.

---

## 1. Validation summary

### 1.1 Modifier-weight ground truth (live `freestyle_trick_modifiers`)

Verified against the active DB:

| Modifier | add_bonus | add_bonus_rotational | pt-batch baseline |
|----------|----------:|---------------------:|-------------------|
| nuclear  | 2 | 2 | pt10 (nuclear=+2=Paradox Atomic set) |
| pixie    | 1 | 1 | pre-pt established |
| ducking  | 1 | 1 | pre-pt established |
| paradox  | 1 | 1 | pre-pt established |
| quantum  | 1 | 1 | pt10 (=+1) |
| tapping  | 1 | 1 | pt3 (distinct from stepping) |
| symposium | 1 | 1 | pre-pt established |

All 6 modifiers used by Tier-1 rows are at active weights matching pt10/pt11 rulings. No modifier weight changes are needed.

### 1.2 Base-trick ground truth (live `freestyle_tricks`)

| Base | Slug | adds | rotational |
|------|------|----:|------------|
| butterfly | butterfly | 3 | no |
| blender | blender | 4 | yes |
| pickup | pickup | 2 | no |
| torque | torque | 4 | yes |

All 4 bases used by Tier-1 are active and at expected ADD values.

### 1.3 Slug absence verification

Live DB query confirms none of the 6 Tier-1 slugs are present in `freestyle_tricks` with `is_active=1`. Wave-1 slugs (tap/paste/hatchet/pigbeater/montage/mullet/spender/scrambled-eggbeater) all present and verified. Wave-2 insertion will not collide.

### 1.4 ADD math (each row verified additively)

| Row | Composition | Math | Total |
|-----|-------------|------|------:|
| Matador | nuclear + butterfly | 2 + 3 | 5 |
| Phoenix | pixie + ducking + butterfly | 1 + 1 + 3 | 5 |
| Mind Bender | ducking + paradox + blender | 1 + 1 + 4 | 6 |
| Tripwalk | quantum + butterfly | 1 + 3 | 4 |
| Legeater | quantum + pickup | 1 + 2 | 3 |
| Spinal Tap | tapping + torque | 1 + 4 | 5 |

All 6 agree with FM-reported ADD. No deltas.

### 1.5 Parser behavior

All canonical_name strings tokenize cleanly via the existing parser:
- `nuclear butterfly` -> [nuclear (modifier), butterfly (core_family)]
- `pixie ducking butterfly` -> [pixie, ducking, butterfly]
- `ducking paradox blender` -> [ducking, paradox, blender]
- `quantum butterfly` -> [quantum, butterfly]
- `quantum pickup` -> [quantum, pickup]
- `tapping torque` -> [tapping, torque]

All tokens are in the IFPA modifier or base-trick vocabulary. Zero parser-risk. No new modifier tokens introduced.

### 1.6 Notation rendering

Existing role-aware token rendering (`shapeNotationDisplay`) handles all 6 notation strings without changes. Cool-palette (semantic) tokens render via `notation-token notation-{cssRole}` classes; existing tooltip system attaches `data-role` and `title` attributes. Glossary deeplink (`/freestyle/glossary#notation`) covers all 6 trick pages without new glossary entries.

### 1.7 Operational-notation readiness

FM operational notation exists for all 6 rows (per A1 priority score breakdown). Federation-not-adoption posture: do NOT auto-import. Initial insertion: `operational_notation = NULL`. Operational-notation seeding becomes curator follow-up (see `WAVE2_OPERATIONAL_NOTATION_SEEDS.csv` for FM evidence inventory).

### 1.8 Family-ladder impact (summary; full table in `WAVE2_FAMILY_IMPACT.md`)

| Family | Today | Wave-2 adds | Tier impact |
|--------|------:|------------:|-------------|
| butterfly | 9 | +3 (Tripwalk 4, Matador 5, Phoenix 5) | 5-ADD tier triples (1->3) |
| blender | 3 | +1 (Mind Bender 6) | 6-ADD tier pair (Spender, Mind Bender) |
| pickup | 4 | +1 (Legeater 3) | 3-ADD tier 4-way modifier comparison |
| torque | 7 | +1 (Spinal Tap 5) | 5-ADD tier becomes densest torque tier |

---

## 2. Insertion plan (procedural; not executed)

The plan reuses the Wave-1 path: append rows to `red_additions_2026_04_20.csv`, run loader 19, run parser-population, verify counts, take backups.

### 2.1 Single-CSV append

Append 6 rows to `legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv`. Schema (existing):
```
canonical_name,adds,base_trick,category,aliases,modifier_links,description,review_status,is_active,review_note
```

Per-row values in `WAVE2_INSERTION_MATRIX.csv`. All 6 rows use:
- `category` = compound
- `review_status` = red_review (matches Wave-1)
- `is_active` = 1
- `review_note` = "Wave-2 Tier-1 (W2b); math-clean against pt10/pt11; FM tech_name as alias"

### 2.2 No corrections needed

Unlike Wave-1 (which required a Pigbeater family-override correction via `red_corrections_2026_04_20.csv`), Tier-1 needs no per-field corrections. Every row's `trick_family` derives correctly from `base_trick` (butterfly, blender, pickup, torque all resolve to their own family slug).

The `feedback_loader_19_family_default.md` quirk (loader sets trick_family=base_trick) does not bite here because Tier-1 base tricks are all themselves family roots.

### 2.3 Loader sequence

1. **Pre-flight:** Backup the staged CSV to `/tmp/red_additions_2026_04_20.csv.wave2-tier1-backup`.
2. **Apply loader 19:** `python3 legacy_data/event_results/scripts/19_load_red_additions.py --apply`. Expected: 6 new rows inserted; existing 8 Wave-1 rows untouched; 0 corrections.
3. **Run parser population:** `python3 scripts/parse_freestyle_notation.py --apply`. Required per `feedback_parser_population_after_rebuild.md`. Populates `structural_parse_json` and `computed_adds` for new rows.
4. **Verify counts:** `SELECT COUNT(*) FROM freestyle_tricks WHERE is_active=1;` -- expect previous total + 6.
5. **Spot-check each new row:** `SELECT slug, canonical_name, adds, trick_family, base_trick FROM freestyle_tricks WHERE slug IN ('matador','phoenix','mind-bender','tripwalk','legeater','spinal-tap');` -- expect 6 rows with values matching the matrix.
6. **Modifier-link verification:** `SELECT trick_slug, modifier_slug FROM freestyle_trick_modifier_links WHERE trick_slug IN (...);` -- expect total link rows = sum of modifier_counts (Matador 1 + Phoenix 2 + Mind Bender 2 + Tripwalk 1 + Legeater 1 + Spinal Tap 1 = 8 link rows).

### 2.4 Test impact

- **Unit tests:** zero impact. No code changes; modifier-weight tests, parser tests, and operational-notation tests unaffected.
- **Integration tests:** 244-test freestyle integration suite is slug-agnostic for new entries. Assertions on existing rows (montage, etc.) are unaffected. New rows do not have integration tests yet; per `.claude/rules/testing.md`, route-level tests for new pages should follow before sitewide rollout, but the existing test suite remains green.
- **Build:** zero impact.

### 2.5 Rollback

Per Wave-1 precedent: `/tmp/red_additions_2026_04_20.csv.wave2-tier1-backup` is the canonical rollback artifact. To rollback:
1. Restore the CSV from backup.
2. Re-run loader 19 (which truncates and reloads).
3. Re-run parser population.

Or, surgical rollback via SQL DELETE on the 6 slugs followed by re-run of loader 19 from the rolled-back CSV.

---

## 3. Ship-staging recommendation

### 3.1 Ship semantic-only first; operational notation later

All 6 rows ship semantic notation immediately (it derives from canonical_name + base_trick + modifier_links; no curator authoring needed).

Operational notation ships in a second curator pass per `WAVE2_OPERATIONAL_NOTATION_SEEDS.csv`. The trick-detail "Set notation (operational)" section omits entirely when `operational_notation` is NULL (verified by Wave-1 Montage rendering); no template changes needed.

This split matches Wave-1's posture and preserves the warm/cool palette discipline.

### 3.2 Media-readiness staging

3 of 6 rows have FM video evidence (Matador, Tripwalk, Phoenix). Per `WAVE2_MEDIA_TARGETS.md`, curator can later author `freestyle_media_links` rows for these. All 6 ship initially with empty Reference Media section (matching Wave-1 baseline; UX2 pilot validated the empty-state pattern).

### 3.3 UX2 pilot scope

Wave-2 Tier-1 does NOT touch the UX2 pilot. Montage remains the sole pilot trick (`content.ux2Pilot` populated only for slug `montage`). The 6 new Tier-1 rows render with the legacy `trick.hbs` template. Promoting any Wave-2 row into the UX2 pilot requires explicit human direction and is a separate decision per `project_freestyle_state.md` gating.

---

## 4. Glossary / token impact

Zero new glossary entries needed. All Tier-1 modifiers (nuclear, pixie, ducking, paradox, quantum, tapping, symposium) are already in the IFPA modifier table; their tokens, role labels, and tooltip text exist via `WORD_TOKEN_LABELS` (UX1 Phase A landed). The glossary section `#notation` already documents every Tier-1 token.

No `glossary.hbs` changes. No service-layer token-mapping changes.

---

## 5. Preservation guarantees

| Contract | Wave-2 Tier-1 preserves it because |
|----------|------------------------------------|
| Federation-not-adoption | No FM data auto-imports. Operational notation, aliases, and descriptions are curator-authored or curator-reviewed; FM is starting evidence only. |
| Parser/editorial separation | Editorial decomposition (base + modifier_links) is the canonical truth; parser reads only canonical_name. Wave-2 Tier-1 ships clean editorial decompositions; parser will produce status=`exact` for all 6 rows. |
| pt10/pt11 baseline | Every modifier weight verified against the live `freestyle_trick_modifiers` table; weights match pt10/pt11 rulings. No weight changes. |
| Restraint-first rendering | New rows render via the legacy template; operational-notation section omits when NULL; Reference Media section omits when no media tagged. No new UI surface introduced. |
| Wave-1 UX hierarchy | Legacy `trick.hbs` continues to render Wave-2 rows. UX2 pilot remains Montage-only. |

---

## 6. Out of scope for this implementation plan

- DB writes. Not executed in W2b planning.
- Ontology mutation. No new modifiers, no weight changes, no base-trick changes.
- Federation conflict resolution (Marius, Whirlwind aliases) -- separate small alias batch; not Tier-1.
- Tier-3 ready-after-Red rows (Conniption City, Hurl, Bedwetter, Casket) -- gated on Q1-Q4.
- Tier-3 ready-now rows (Tremor, Shmoe, Twirl, Symposium-Eggbeater) -- considered for Wave-2 Tier-2; not in this plan's 6-row scope.
- Held-over Ripped Warrior -- gated on Q6 direction-strip ruling.
- Modifier weight adjustments. Pt12-queued rulings remain pending.
- Wave-3 candidates (fairy/gyro/blazing vocab cohort).

---

## 7. Decision points for human review

1. Confirm Tier-1 scope (6 rows: Matador / Phoenix / Mind Bender / Tripwalk / Legeater / Spinal Tap). The W2a shortlist nominated 11 ready-now candidates; this plan implements 6 per your explicit list.
2. Confirm `aliases` strategy: this plan proposes FM technical_name as the sole alias per row (e.g., Matador's alias = "Nuclear Butterfly"). Wave-1 precedent supports this. If curator wants additional aliases (FM display variants, historical names), add per row in the matrix CSV.
3. Confirm `review_status` = `red_review` (Wave-1 precedent) vs `active` (immediate public). Wave-1 used `red_review` then promoted to active; Wave-2 Tier-1 should likely match unless human directs otherwise.
4. Confirm operational-notation deferral (NULL at insertion; curator-authored later) is the right cadence. Alternative: author operational notation alongside row insertion. Adds curator effort but lands editorially-complete pages.
5. Confirm media-link deferral (no `freestyle_media_links` rows at insertion). Alternative: tag Matador/Tripwalk/Phoenix with existing FM video evidence as part of the same wave. Adds curator media-tagging step.

If decisions 3-5 are deferred, the wave ships semantic-only first per §3.1.
