# Phase 5e — Editorial Data Cleanup Plan (Planning)

Proposal-only. No code changes, no data writes, no FootbagMoves ingestion, no new tricks (except as flagged future candidates), no parser/UI changes.

Builds on:
- `SEMANTIC_AUDIT_FINDINGS.md` §4 (candidate-core ambiguity), §12 (editorial metadata help)
- `PHASE5_STATUS_SHAPE_CONSULTS.md` §6 F1 (sparse modifier-link coverage as failure-mode-as-feature)
- Phase 5a re-audit results (commit 2006023; audit doc regenerated 2026-05-09)

---

## 1. Goal

The Phase 5a editorial-decomposition layer is doing exactly what it was architected to do: surface curator-data quality signals without inventing data and without overriding parser semantics. Specifically:

- 4 broken upstream-link callouts on `/freestyle/tricks/:slug`
- 16 "modifier coverage absent" badges across the audit picklist
- 12 "differs from asserted" divergence flags
- 2 clean editorial composes ("matches asserted")

**Phase 5e turns those signals into a curator-facing data-cleanup plan.** The objective is to use Phase 5a's editorial QA as a hardening step for the dictionary BEFORE we point a larger external corpus (FootbagMoves.com) at it. A messy editorial layer + a larger import = compounded signal noise. Cleaning first means future imports' quality signals stand out cleanly against a known-good baseline.

This proposal classifies the surfaced signals, recommends safe per-row cleanup actions, and groups them by safety tier so James can approve in batches.

---

## 2. Inventory: broken upstream links (4)

| # | Slug | `base_trick` value | Classification | Math closure today |
|---|---|---|---|---|
| 1 | `around-the-world` | `atw` | **alias-base reference** — `atw` is an alias on `freestyle_trick_aliases` mapping back to `around-the-world` itself | n/a (parser independent) |
| 2 | `barfly` | `infinity` | **missing canonical upstream** — no row with slug `infinity`; no alias resolves it | n/a (composedAdds null) |
| 3 | `cloud-kick` | `cloud kick` (with space) | **format mismatch / slug normalization** — slug is `cloud-kick`; column populated with canonical_name form | self-ref-in-name-form |
| 4 | `cross-body-sole-stall` | `cross-body sole stall` | **format mismatch / slug normalization** — same hyphen-vs-space pattern | self-ref-in-name-form |

### 2a. Per-row classification detail

**`around-the-world` (alias-base reference).** `atw` is a known alias mapping `atw → around-the-world` in `freestyle_trick_aliases`. So the row's `base_trick='atw'` is structurally a self-reference written via its own alias. The dict-by-slug lookup keys on slug, not alias, so the lookup misses → broken_link signal. There is no genuine upstream lineage being lost — `around-the-world` is a base trick.

**`barfly` (missing canonical upstream).** `barfly` description: "Double infinity." Editorial state asserts `infinity` as the upstream concept, but no `infinity` row exists in `freestyle_tricks`. This is the load-bearing CANONICALIZATION_POLICY §10 productive-multiplicity tension — Red has historically used "infinity" as a structural concept without it ever becoming a canonical row. Genuine ontology question.

**`cloud-kick` and `cross-body-sole-stall` (format mismatch).** Both rows treat `base_trick` as the canonical_name (space-separated) form rather than the slug (hyphen-separated) form. For both rows the value matches `canonical_name`, which means they're **self-references written in name form**, not cross-row references. After normalization they would be self-references → editorial decomposition would correctly omit the block (per the `baseSlug === row.slug` rule). The rows themselves are conceptually base tricks (cloud-kick is its own family; cross-body-sole-stall is a recognized stall surface).

### 2b. Likely additional broken-link cases outside the audit picklist

The 27-slug audit doesn't cover the full 146-row corpus. Broader cleanup execution should run a one-off corpus-wide query before applying fixes:

```sql
-- candidate broken-link / format-mismatch rows
SELECT t.slug, t.base_trick
FROM freestyle_tricks t
LEFT JOIN freestyle_tricks b ON b.slug = t.base_trick
WHERE t.is_active = 1
  AND t.base_trick IS NOT NULL
  AND t.base_trick != ''
  AND t.base_trick != t.slug
  AND b.slug IS NULL;
```

That set is the canonical scope for Phase 5e's broken-link cleanup. Phase 5e proposal authorizes the query (read-only) but no writes.

---

## 3. Inventory: modifier-coverage-absent rows (16 in audit picklist)

For each, I checked the `description` text against `freestyle_trick_modifiers` to classify whether the description IMPLIES a structured modifier that already exists in the modifier table but isn't yet linked.

| # | Slug | `base_trick` (resolved) | `description` | Implied modifier(s) | Modifier in table? | Math closure if linked |
|---|---|---|---|---|---|---|
| 1 | `atom-smasher` | mirage (2) | "Atomic mirage: outside-then-inside dex sequence..." | atomic | ✓ set, +1/+2 | mirage(2) + atomic(+2 rot) = **4 = asserted** ✓ |
| 2 | `barraging-osis` | osis (3) | "Barraging-modified osis." | barraging | ✓ body, +1/+1 | osis(3) + barraging(+1) = **4 ≠ asserted (5)** — known approximate (baroque legacy) |
| 3 | `blur` | mirage (2) | "Blurry-modified mirage." | blurry | ✓ set, +1/+2 | mirage(2) + blurry(+2 rot) = **4 = asserted** ✓ |
| 4 | `blurriest` | barfly (4) | "Blurry-modified barfly." | blurry | ✓ | barfly(4) + blurry(+1 non-rot) = **5 = asserted** ✓ |
| 5 | `double-leg-over` | legover (2) | "**Mirage-modified** legover." | miraging (NOT mirage; description language loose) | ✓ body, +1/+1 (modifier `miraging`) | legover(2) + miraging(+1) = **3 = asserted** ✓ |
| 6 | `food-processor` | blender (4) | "Blurry-modified blender." | blurry | ✓ | blender(4) + blurry(+2 rot) = **6 = asserted** ✓ |
| 7 | `mobius` | torque (4) | "Gyro-modified torque." | gyro | ✓ body, +1/+1 | torque(4) + gyro(+1) = **5 = asserted** ✓ |
| 8 | `paradox-whirl` | whirl (3) | "Paradox-modified whirl." | paradox | ✓ body, +1/+1 | whirl(3) + paradox(+1) = **4 = asserted** ✓ |
| 9 | `rev-up` | whirl (3) | "reverse whirl variant" | reverse (NOT a modifier per Red pt6 — directionality only) | ✗ (deliberately not in table) | whirl(3) + 0 = **3 = asserted** ✓ (already shown) |
| 10 | `ripwalk` | butterfly (3) | "Blurry-modified butterfly." | blurry | ✓ | butterfly(3) + blurry(+1 non-rot) = **4 = asserted** ✓ |
| 11 | `spinning-symposium-whirl` | whirl (3) | "Spinning-modified symposium whirl." | spinning, symposium | ✓ ✓ | whirl(3) + spinning(+2 rot) + symposium(+1) = **6 = asserted** ✓ |
| 12 | `spinning-whirl` | whirl (3) | "Spinning-modified whirl." | spinning | ✓ body, +1/+2 | whirl(3) + spinning(+2 rot) = **5 = asserted** ✓ |
| 13 | `around-the-world` | (broken — atw) | "full leg circle around the bag" | n/a (description doesn't imply modifier) | n/a | n/a |
| 14 | `barfly` | (broken — infinity) | "Double infinity." | n/a (multiplicity prefix per §10, not a modifier) | n/a | n/a |
| 15 | `cloud-kick` | (broken — format) | "Kick off the back of the shin." | n/a (no modifier in description) | n/a | n/a |
| 16 | `cross-body-sole-stall` | (broken — format) | "Cross-body sole delay surface." | n/a (no modifier in description) | n/a | n/a |

### 3a. Headline result

**10 of 16 modifier-coverage-absent rows have a description that implies a modifier already in `freestyle_trick_modifiers`, where backfilling the link would make math close cleanly to asserted ADD.** These are the highest-leverage cleanup targets — pure data backfill, math-validated, no Red consultation needed.

**1 of 16** (`barraging-osis`) has a description-implied modifier that backfills cleanly but produces editorial composedAdds=4 vs asserted=5 — known approximate case (baroque legacy). Backfilling is still correct; the divergence will be honestly surfaced.

**1 of 16** (`double-leg-over`) has a description that names "Mirage-modified" but the actual modifier slug is `miraging`. Description language is curator-loose. Two cleanup options below.

**1 of 16** (`rev-up`) has a description that names "reverse" — explicitly NOT a modifier per Red pt6 / CANONICALIZATION_POLICY §4. Modifier coverage absent is correct; nothing to backfill. Editorial layer already shows "matches asserted" at base alone.

**4 of 16** are the same 4 broken-link rows — they're modifier-coverage-absent too because their broken base prevents composedAdds resolution anyway. Cleanup is the broken-link fix (§4); modifier coverage is downstream of that.

### 3b. Likely additional modifier-coverage-absent rows outside the audit picklist

Same caveat as §2b — the 27-slug audit doesn't cover all 146 active tricks. The corpus-wide query for full inventory:

```sql
-- Active tricks with base_trick set but no entries in the join table
SELECT t.slug, t.base_trick, t.description
FROM freestyle_tricks t
LEFT JOIN freestyle_trick_modifier_links l ON l.trick_slug = t.slug
WHERE t.is_active = 1
  AND t.base_trick IS NOT NULL
  AND t.base_trick != ''
  AND t.base_trick != t.slug
  AND l.trick_slug IS NULL;
```

Phase 5e proposal authorizes the query (read-only) but no writes.

---

## 4. Cleanup recommendations — by safety tier

### Tier A: safe mechanical cleanup (no ambiguity; math-closes-cleanly; no Red required)

These are the highest-leverage, lowest-risk fixes. All can be applied as a single approval batch.

**A1. Format-mismatch base_trick normalization (2 rows in audit picklist; possibly more corpus-wide).**
- `cloud-kick`: `base_trick='cloud kick'` → either `''` (empty) OR `'cloud-kick'` (explicit self-ref). Both produce the same Phase-5a outcome (block omitted). Recommendation: use `''` to align with the convention used by the cleaner self-reference rows (e.g. `quantum`, `whirl`, `butterfly` all have `base_trick = slug`, but rows like `surging`, `dada-curve` use empty).
- `cross-body-sole-stall`: same pattern — `base_trick='cross-body sole stall'` → `''` or self-slug.

**A2. Alias-base-reference correction (1 row in audit picklist; possibly more).**
- `around-the-world`: `base_trick='atw'` → `'around-the-world'` (explicit self-ref) OR `''`. Same Phase-5a outcome (block omitted). Recommendation: `''` for consistency with A1.

**A3. Modifier-link backfill, math-closes case (8 rows in audit picklist).**
Add `freestyle_trick_modifier_links` rows for the description-implied modifier where math closes cleanly to asserted:
- `atom-smasher` ← `atomic` (+2 rot)
- `blur` ← `blurry` (+2 rot)
- `blurriest` ← `blurry` (+1)
- `food-processor` ← `blurry` (+2 rot)
- `mobius` ← `gyro` (+1)
- `paradox-whirl` ← `paradox` (+1)
- `ripwalk` ← `blurry` (+1)
- `spinning-whirl` ← `spinning` (+2 rot)

For `spinning-symposium-whirl` (one row, two modifiers):
- `spinning-symposium-whirl` ← `spinning` (apply_order=1, +2 rot), `symposium` (apply_order=2, +1)

After backfill, all 9 panels will render `(matches asserted)` in the editorial composed line — the load-bearing audit-finding-§3 closure (no longer "exact" with self-atom-shaped formula in the editorial layer).

**Total tier A: 11 rows in audit picklist + corpus-wide additions to be enumerated by the §2b/§3b queries before execution.**

### Tier B: James-adjudicable cleanup (curator judgment, not Red-tier ontology)

These need a small judgment call but don't require Red consultation.

**B1. `double-leg-over` — description loose, modifier exact.** Description says "Mirage-modified legover" but the actual modifier slug is `miraging`. Two options:
- (i) **Backfill `miraging` link only** — math closes (legover(2) + miraging(+1) = 3). Description text preserved as curator language. Editorial layer composes correctly.
- (ii) **Backfill `miraging` link + tighten description** — change "Mirage-modified" to "Miraging-modified" to match the modifier-table form. Heavier touch; affects the displayed Editorial context block.

Recommendation: **(i) — backfill only.** Description is human prose; the join table is the structured data. Don't conflate the channels. James to confirm.

**B2. `barraging-osis` — math doesn't close, but backfilling is still correct.** Description: "Barraging-modified osis." Implied modifier: `barraging`. Backfill produces editorial composedAdds=4 vs asserted=5 (known approximate; baroque legacy per CANONICALIZATION_POLICY §3 worked example). Same divergence the parser surfaces with `add_formula_status='approximate'`. Two options:
- (i) **Backfill `barraging` link** — editorial layer surfaces the divergence honestly via "differs from asserted; asserted is editorial truth." Mirrors parser behavior.
- (ii) **Leave as modifier-coverage-absent** — preserves the "modifier absent" badge as a marker that this row's editorial state is intentionally incomplete pending Red.

Recommendation: **(i) — backfill.** Honest divergence is the Phase-5a contract; refusing to populate the layer because we don't like the math is the wrong reason. James to confirm.

### Tier C: Red-required ontology decisions

These touch genuine ontology questions that should not be unilaterally resolved.

**C1. `barfly` upstream — what to do about `infinity`?**

The row asserts `infinity` as the structural upstream. No row with slug `infinity` exists. Three options, each with different implications:

- (i) **Add an `infinity` canonical row.** Would need: ADD value (Red would have to assign), description, category, family. Red has historically used "infinity" as a structural concept but never elevated it to a registered name. Adding the row creates a new canonical that other rows (only barfly currently) could reference. **Heavy ontological move.**

- (ii) **Change `barfly.base_trick` to empty** (or to `barfly` self-ref). Acknowledges that no resolvable upstream exists in the dictionary. Editorial layer would skip the block (self-ref) or render with "absent" (empty). Loses the editorial assertion that barfly is structurally infinity-derived. **Information loss.**

- (iii) **Leave the broken-link callout as-is.** The Phase-5a panel honestly surfaces the broken upstream as a known editorial-data signal. Curators see the gap; the dictionary state reflects what Red has and hasn't ratified. **Status quo.**

Recommendation: **(iii) — leave as-is, escalate to Red in next packet.** Specifically ask Red:
- Is "infinity" a canonical concept that warrants its own row?
- If yes, what ADD + structural decomposition?
- If no, should `barfly.base_trick` be cleared?

Until Red rules, the broken-link badge is the architecturally-correct state. **Do NOT add an `infinity` row in Tier A or B.** This is the load-bearing example for "the curator-data signal architecture is doing its job — don't paper over it before the curator decides."

**C2. Productive-multiplicity reconfirmation for blurry-X family** (deferred, NOT proposed for change).

Backfilling `blurry` modifier links for `blur`, `ripwalk`, `blurriest`, `food-processor` (Tier A3) is mechanically clean — math closes for all four. But it raises a CANONICALIZATION_POLICY §10 question: does formalizing the modifier link strengthen the case that these rows are structurally "blurry-modified-X" rather than community-stabilized canonical names with their own identity? The policy-doc answer is "stabilized canonicals stay canonical even when structurally derivable" — so the backfill doesn't threaten their identity. But the structural relationship becomes more visible.

**No Red question needed for Tier A3 itself.** Flagging only because future iterations might want to revisit "do all four of these belong as separate canonicals or should some collapse?" — that's a Red consultation, not a Phase-5e cleanup item.

**C3. Mass-corpus pattern question** (deferred to FootbagMoves import readiness).

The §3b corpus-wide query will likely surface dozens more "description implies modifier X but join table empty" rows across the 146 active tricks. Bulk Tier-A3-style backfill is appropriate when math closes, but: are there patterns we want to catch BEFORE bulk-applying that should go to Red? E.g., are there description forms ("X-modified Y", "X Y", "Y of type X") whose normalization merits a Red ruling rather than mechanical inference? Recommend: run §3b query, classify hits by pattern, then ask Red to ratify the patterns. Out of scope for Phase 5e itself (proposal-only); flagged as the natural Phase-5f (or whatever comes next).

---

## 5. Recommended rollout sequence

If Phase 5e is approved:

**5e-1: Corpus-wide inventory (read-only).**
Run §2b and §3b queries against the live DB. Generate a CSV at `legacy_data/reports/editorial_data_cleanup_inventory.csv` with one row per cleanup candidate (broken-link OR modifier-coverage-absent). Columns: slug, base_trick, base_status, implied_modifier, modifier_in_table, math_closure_predicted, tier (A1/A2/A3/B1/B2/C1/C2/...). Single read-only script, no writes.

**5e-2: Tier A approval.**
Present the inventory CSV to James. Approve the 11 audit-picklist Tier-A rows + however many corpus-wide additions surface. Apply as a single batched data-edit pass via the curated-CSV channel (`legacy_data/inputs/curated/tricks/red_corrections_*.csv` and `red_additions_*.csv`) — same pipeline pt9 used. Run pipeline rebuild + parser-population per `feedback_parser_population_after_rebuild.md`. Re-run audit; verify all 9 modifier-link backfills now show "matches asserted."

**5e-3: Tier B approval (optional, after A lands).**
Apply B1 (`double-leg-over` miraging link) and B2 (`barraging-osis` barraging link) per James's call. Same pipeline path. Re-audit.

**5e-4: Tier C escalation.**
Compose a Red packet with:
- The `barfly`/`infinity` question (C1).
- Any patterns surfaced by §3b that needed adjudication (C3).
- Any corpus-wide broken-link cases that aren't simple format-mismatch (per §2b).

Goes via the existing red-correction-pt* / OPEN_QUESTIONS.md channel.

**5e-5: Re-run Phase 5a audit with cleaned data.**
Confirm:
- Broken-link callouts dropped from 4 → ≤1 (only barfly remains pending Red).
- Modifier-coverage-absent badges drop materially (Tier A3 closes 9 of 16; B closes 2 more if approved).
- Editorial-vs-asserted "matches asserted" count grows from 2 to 11+.
- No regressions in parser-derived blocks (forever-rules verified).

**5e-6: FootbagMoves import readiness gate.**
With editorial layer cleaned, future external corpus imports' quality signals stand out cleanly. Out of scope for Phase 5e itself; this is the post-cleanup state the cleanup is a prerequisite for.

---

## 6. Out of scope for Phase 5e

Per the proposal constraints, none of these are addressed:
- FootbagMoves.com ingestion (post-cleanup readiness gate).
- New trick rows beyond the existing 146 active.
- ADD or modifier-weight changes (e.g. fixing barraging-osis math by changing modifier table).
- Asserted-ADD changes anywhere.
- Parser code changes.
- UI / template changes.
- Red ingestion at the data level (only the C-tier escalation packet preparation).
- Reweighting candidate-core productive-multiplicity rows (CANONICALIZATION_POLICY §10 territory).

---

## 7. Forever-rules carried forward

The Phase 5a forever-rules from `feedback_parser_editorial_separation.md` apply to Phase 5e execution:

- **No slug-specific cleanup branches.** All Tier A fixes are pattern-driven (alias→canonical, name→slug normalization, description-implied modifier link). No "if slug == sumo" branches anywhere.
- **Editorial-derived ADDs never override asserted.** Tier B2's barraging-osis backfill creates an editorial-vs-asserted divergence; that's the honest signal; we don't update asserted to make it match.
- **No description-text parsing in code.** The "description implies modifier X" inference in §3 is HUMAN curator judgment in this proposal, NOT runtime parsing. Phase 5e cleanup is data writes, not parser changes. Architecture B2 (description-text parsing) remains permanently deferred.
- **`sourceLabel: 'editorial'` stays a const literal.** No changes to the view-model attribution.

---

## 8. Estimated effort

Tier A (safe mechanical):
- Inventory CSV: ~30 minutes (single SQL script + analysis pass).
- Data edits: ~1–2 hours for the audit-picklist 11 rows + maybe 30–60 corpus-wide adds.
- Pipeline rebuild + re-audit: ~10 minutes.

Tier B (James-adjudicable): ~15 minutes per row after approval.

Tier C (Red-required): packet preparation ~30 minutes; turnaround time for Red response is the long pole.

**Cleanup is small in code-time; the bottleneck is approval-and-review time, not implementation. Phase 5e's value is in serializing the approvals correctly so each tier batches cleanly.**

---

## 9. Recommended decision

**Approve Phase 5e as a multi-tier rollout** with explicit batch gates between tiers. Specifically:

1. **Approve Tier A as a single-batch mechanical cleanup** (broken-link normalization + math-closes modifier-link backfill) once the §2b/§3b corpus-wide queries surface the full set.
2. **Hold Tier B for separate approval** after Tier A lands and re-audit confirms the predicted improvements.
3. **Defer Tier C** (barfly/infinity + pattern questions) until the next Red packet round.

**Do not bundle tiers in a single commit.** Each tier is a different risk class; mixing dilutes the audit trail and makes rollback awkward.

**Do not start FootbagMoves ingestion until at least Tier A lands and re-audit confirms the editorial layer is clean.** That's the architectural payoff of doing this work first.

---

## Cross-references

| File / Path | Role |
|---|---|
| `exploration/freestyle-notation-grammar/PHASE5_STATUS_SHAPE_CONSULTS.md` | Architecture B1 strict (the layer being cleaned) |
| `exploration/freestyle-notation-grammar/SEMANTIC_AUDIT_FINDINGS.md` | §4 candidate-core ambiguity, §12 editorial metadata help — the audit findings Phase 5e operationalizes |
| `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` | §3 ADD-math conflict protocol (barraging-osis); §4 directionality (rev-up); §10 productive multiplicity (blurry-X family) |
| `legacy_data/inputs/curated/tricks/red_corrections_pt9.csv` | The pipeline channel Tier-A and Tier-B writes will flow through |
| `database/schema.sql` | `freestyle_tricks`, `freestyle_trick_modifier_links`, `freestyle_trick_modifiers` schemas being edited |
| `feedback_parser_editorial_separation.md` (memory) | Forever-rules carried forward into Phase 5e execution |
| `feedback_parser_population_after_rebuild.md` (memory) | Reminder: parser-population step needed after rebuild for re-audit |
