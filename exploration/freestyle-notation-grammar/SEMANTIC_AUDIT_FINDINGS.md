# Phase 3.5 — Semantic Audit Findings

Synthesis of the 27-slug semantic-audit-notes.md corpus (post-pt9 + parser follow-up; commit 0d6b9a4 baseline). Read-only analysis: no code changes, no ontology rewrites, no new tricks, no new Red ingestion. Findings drive the next phase's prioritization, not this one's edits.

**Source corpus**: `semantic-audit-notes.md` at repo root, 27 captured panels:

- exact_self_atom (12): head-stall, knee-clipper, cross-body-sole-stall, cloud-kick, double-leg-over, atom-smasher, food-processor, surging, dada-curve, around-the-world, rev-up, shooting
- exact_modifier_derived (13): sailing, whirl, butterfly, paradox-whirl, spinning-whirl, spinning-symposium-whirl, mobius, gauntlet, blur, ripwalk, barfly, blurriest, sumo
- approximate (1): barraging-osis
- policy_dependent (1): quantum

**Finding-class taxonomy**: each finding is tagged `[ontology]`, `[presentation]`, or `[parser]` to separate human-comprehension issues from parser-correctness issues. The parser is largely correct on its own terms; most UX failures are presentation drift between metadata the parser computes and what the template surfaces.

---

## 1. Successful semantic teaching `[parser ✓ + presentation ✓]`

The panels that earn their existence — structural decomposition teaches something the trick name alone doesn't.

**`paradox-whirl`** — clean baseline. `Derivation: paradox(+1) + whirl(3) = 4`. Both descriptive and ADD-contributing layers list `Core family: whirl` + `Modifier: paradox`. Math reads exactly as the name does, modifier weight is explicit.

**`spinning-symposium-whirl`** — densest formula in corpus, scales gracefully:

> `Derivation: spinning(+2 rot) + symposium(+1) + whirl(3) = 6`

Three roles, layered weights, rotational annotation `+2 rot` carries the family-aware bonus. Pedagogical win — a reader could re-derive the ADD from this line alone.

**`barraging-osis`** — the parser's only approximate row, handled honestly:

> `Status: Approximate ... The structural decomposition resolves cleanly but the computed ADD disagrees with the asserted value.`
> `Asserted ADD: 5 / Computed ADD: 4 / (disagrees with asserted; asserted value is editorial truth)`
> `Derivation: barraging(+1) + osis(3) = 4`

The "asserted is authoritative; computed is diagnostic" Phase-2.5 contract is exactly what this panel performs. The disagreement reads educational, not alarming.

**`spinning-whirl` rotational-escalation warning** — surfaces uncertainty without blocking:

> `Parse warnings: rotational_escalation_policy_pending_red:spinning+whirl(+2 rot vs +1 non-rot)`

Architectural separation between "rotational_family is a property of the base" and "rotational_modifier_bonus_policy is a property of the modifier" is preserved as a visible-but-non-blocking flag.

**Why these succeed**: the canonical_name decomposes structurally into tokens that all classify into role buckets present in the parser registries; the math closes (or fails closed); rotational/ADD weights come from a real modifier table. Nothing is hidden, nothing is invented.

---

## 2. Successful modifier layering `[parser ✓]`

A subset of #1 worth calling out separately because it speaks to the parser's compositional engine, not just one trick:

| Slug | Tokens | Formula | Layered correctly? |
|---|---|---|---|
| `paradox-whirl` | 2 | `paradox(+1) + whirl(3) = 4` | ✓ |
| `spinning-whirl` | 2 | `spinning(+2 rot) + whirl(3) = 5` | ✓ rotational |
| `spinning-symposium-whirl` | 3 | `spinning(+2 rot) + symposium(+1) + whirl(3) = 6` | ✓ |
| `barraging-osis` | 2 | `barraging(+1) + osis(3) = 4` | ✓ honest fail |

The compositional path is the engine's genuinely-load-bearing capability. Phase 4+ work should preserve this and not regress it.

---

## 3. Misleading "exact" semantics `[parser architecture]`

**The single biggest UX problem in the corpus.** Status `exact_modifier_derived` claims the structural decomposition reproduces ADD via "a base trick plus modifier weights" — but ~10 of 13 panels labeled this status show formulas with **zero modifier weights**, just `slug(N) = N`.

Representative slugs and their formulas:

| Slug | Formula | Modifier visible? |
|---|---|---|
| `whirl` | `whirl(3) = 3` | none |
| `butterfly` | `butterfly(3) = 3` | none |
| `mobius` | `mobius(5) = 5` | none |
| `gauntlet` | `gauntlet(7) = 7` | none |
| `barfly` | `barfly(4) = 4` | none |
| `blur` | `blur(4) = 4` | none |
| `ripwalk` | `ripwalk(4) = 4` | none |
| `blurriest` | `blurriest(5) = 5` | none |
| `sumo` | `sumo(5) = 5` | none |
| `sailing` | `sailing(2) = 2` | none |

Status sentence on each: *"The structural decomposition reproduces the asserted ADD from a base trick plus modifier weights."* The narrative claim and the displayed formula contradict each other.

**Root cause `[parser architecture]`**: the parser tokenizes only `canonical_name`; it never reads `base_trick` or `modifier_links` columns. Single-token canonicals classify into the `core_family` role registry (every active non-modifier slug lives there), bypass the D1 self-atom collapse path (which only fires when `descriptive["core_family"]` is empty OR there are unresolved tokens), and fall through to the modifier-derived `compute_formula` code path with an empty contributions list — yielding `slug(N) = N` and `exact_modifier_derived` status.

**Two fix axes** (do NOT implement now — Phase 4+ scope):
- (a) Parser-side: status determination consults formula shape. If `contributions == []` and `core_family.len == 1` and core matches canonical_slug, label `exact_self_atom`. Cosmetic; doesn't improve the formula.
- (b) Parser-side: extend the row-load step to consume `base_trick` + `modifier_links` columns. Synthesize a richer formula from row metadata when canonical_name isn't structurally decomposable. E.g. for `sumo` the synthesized formula could be `nuclear(+?) + mirage(2) = 5 [editorial: X-Dex escalation per Red pt9]`. Substantive; reaches into the named-compound class that pt9, pt8, pt7 keep adding to.

(b) is the larger lift and the one that buys real explanatory value. (a) is cheap and reduces the misleading-label count without changing the formula.

---

## 4. Candidate-core ambiguity `[ontology + presentation]`

Tightly related to #3 but worth its own section — these are rows whose canonical name LOOKS base-level but whose data classifies them as derivatives. The panel currently hides the upstream relationship entirely.

| Slug | Memory says base is | Panel shows |
|---|---|---|
| `blur` | mirage-derived | `blur(4) = 4` (no mention of mirage) |
| `ripwalk` | butterfly-derived | `ripwalk(4) = 4` (no mention of butterfly) |
| `barfly` | infinity (not a dict row) | `barfly(4) = 4` (no mention of infinity) |
| `blurriest` | barfly-derived | `blurriest(5) = 5` (no mention of barfly) |
| `sumo` | mirage + nuclear (X-Dex) | `sumo(5) = 5` (no mention of either) |

`barfly` is the load-bearing case: its `base_trick` references `infinity`, which isn't a dictionary row. The downstream link is broken AND the panel never says so. James's "candidate-core hides ontology" hypothesis is fully corroborated.

**Why this fails** for human comprehension: the productive-multiplicity ontology (Red pt3 + CANONICALIZATION_POLICY §10) is the *interesting* truth about these rows. A learner reading `/freestyle/tricks/blur` should be able to see that blur is structurally a mirage derivative, even if the canonical name has stabilized as "blur" in community usage. Right now they can't.

**Fix axis `[presentation]`**: expose `base_trick` + `modifier_links` columns from the row in a "Editorial decomposition" panel section, separate from the parser-derived structural decomposition. Doesn't require parser changes. Just a template + service-shape addition to read `freestyle_tricks.{base_trick, modifier_links, description}` and render them.

---

## 5. Self-atom clarity problems `[presentation]`

The two-layer model (descriptive vs ADD-contributing) is conceptually right but visually unexplained. Reader sees role classifications fire in the descriptive layer, then sees them collapsed under "(atom)" in the contributing layer, with no narrative bridge explaining why.

**`knee-clipper`** — descriptive shows `Delay surface: clipper` + `Unusual surface: knee`; ADD-contributing shows `Core family: knee-clipper (atom)`. The split exists, the reader has to infer its purpose.

**`shooting`** — descriptive shows `Set: shooting`; ADD-contributing shows `Core family: shooting (atom)`. Same shape, single token. Why bother classifying it as Set if the contributing layer subsumes it?

**`surging`** — opposite problem. Descriptive shows `Rotation: spinning` + `Modifier: stepping` (virtual expansion of surging per Red pt5). ADD-contributing shows `Core family: surging (atom)`. The reader sees two structural roles surface, then watches them get discarded for ADD math, with no explanation that this IS the "treat surging as a stable named compound but acknowledge its virtual expansion" Red-codified rule.

**Fix axis `[presentation]`**: add a single explanatory sentence above the two layers when they diverge. Something like *"The parser saw structural roles in the name (descriptive) but the ontology treats this trick as a single canonical anchor for ADD math (ADD-contributing). The split preserves the per-token reading without affecting the score."* No code changes — template copy edit.

---

## 6. Confusing decomposition `[presentation]`

A subset of #5 — when the descriptive layer's per-token classifications produce more confusion than enlightenment.

**`head-stall`** — descriptive lists `Unusual surface: head` AND `Unresolved tokens: stall`. The trick is canonically a 1-ADD surface delay; classifying "stall" as unresolved misrepresents its semantic status. "stall" is a known surface-suffix in the language but the parser's role registries don't include a `stall_suffix` bucket.

**`cross-body-sole-stall`** — descriptive lists `Unusual surface: sole` + `Unresolved tokens: cross, body, stall`. Three of four name tokens go to "unresolved" even though "stall" is meaningful and "cross-body" is a recognized positional modifier in freestyle vocabulary. The classification is misleading.

**`rev-up`** — descriptive shows `Directionality: rev` + `Unresolved tokens: up`. "up" is meaningful in this context (rev-up is the canonical name for the move; up isn't a noise token), but the parser has no bucket for movement-vector tokens.

**`around-the-world`** — descriptive shows only `Unresolved tokens: around, the, world`. All three tokens. The trick is famously a directional family, but none of "around"/"the"/"world" is in any role registry.

**Why this fails**: the descriptive layer is supposed to "preserve what the parser saw at each position," but when every position lands in `unresolved`, the descriptive layer carries no information beyond what the canonical name already shows.

**Fix axis `[presentation]`** (preferred): when descriptive contains ONLY unresolved tokens AND the row self-atomizes, hide the descriptive layer entirely. The per-token reading is empty information.

**Fix axis `[ontology]`** (out of scope here, but documenting): expand role registries to capture surface-suffix ("stall"/"kick"/"delay" markers), positional modifiers ("cross-body", "same-side"), movement vectors ("up", "down" non-policy uses). This is non-trivial Phase-4 work — probably starts with Red consultation on what's actually a token class vs a name-internal artifact.

---

## 7. Unresolved-token noise `[presentation]`

The standalone "Unresolved tokens" section duplicates information already shown in the descriptive layer's `unresolved_tokens` bucket.

**Affected rows in corpus** (9/27): head-stall, cross-body-sole-stall, cloud-kick, double-leg-over, atom-smasher, food-processor, around-the-world, dada-curve, rev-up.

**Concrete example — `cross-body-sole-stall`**:

> Descriptive roles: ... `Unresolved tokens: cross, body, stall`
> ...
> ### Unresolved tokens
> Tokens that did not classify against any role registry. May be subsumed by a self-canonical atom (see ADD-contributing roles above).
> - cross
> - body
> - stall

The same three tokens appear twice in the same panel. The standalone section's narrative *does* add value once (the "may be subsumed" caveat), but at the cost of every reader paging past redundant tokens.

**Fix axis `[presentation]`**: collapse to a single rendering location. Either drop the descriptive-layer entry and keep the standalone section (cleaner separation by role-bucket purity), or drop the standalone section and inline the "may be subsumed" caveat as a tooltip/footnote on the descriptive entry. Template-only change.

---

## 8. Warning overload `[presentation]`

The `Parse warnings` block currently treats all warnings as equal. They aren't.

**`inferred_self_canonical_atom`** fires on 13/27 panels (every self-atom that subsumed unresolved tokens or whose classification fired `core_family` via the slug-equality path). It restates information already visible at the panel header (`Status: Exact (self-atom)`). Borderline noise.

**`policy_token_encountered:<token>`** fires on 1/27 (quantum). Material — it carries the policy concern.

**`approximate_add_formula:computed=<X>,asserted=<Y>`** fires on 1/27 (barraging-osis). Material — it surfaces the editorial-vs-computed gap.

**`rotational_escalation_policy_pending_red:<modifier>+<base>(...)` ** fires on 2/27 (spinning-whirl, spinning-symposium-whirl). Material — it carries a policy uncertainty about the +2-rot rule.

**Stacking issues**:
- `quantum` shows BOTH `policy_token_encountered:quantum` AND `inferred_self_canonical_atom`. Two warnings on a single-token, editorially-fine row. The `inferred_self_canonical_atom` adds noise to a panel whose actual signal is the policy concern.

**Fix axis `[presentation]`**: tier warnings into Material vs Mechanical. Render Material warnings in their own section; render Mechanical warnings collapsed by default behind a "show mechanical warnings (1)" affordance. Template + service-shape change. No parser change required — the warning strings already self-identify by prefix.

---

## 9. Policy-token UX quality `[presentation, with stale narrative]`

The `quantum` panel reads:

> `Status: Policy-dependent`
> `(policy_dependent)`
> `The parse contains tokens (quantum, nuclear, backside, shooting, down-family) whose ADD weights are subject to expert review.`

Two problems:

**(a) Narrative leaks the entire policy-token roster.** Even though only `quantum` is in this row, the reader sees the full list. Information density: 1 useful token, 4 distractors. The "Policy tokens" section AT THE END of the panel then re-mentions quantum (third mention in the same panel: header, narrative, role classification under Set, Policy tokens section, parse warning — total 5 surfaces of "quantum" in a single panel).

**(b) The roster narrative is stale.** Post-pt9, `POLICY_TOKENS = {nuclear, quantum, down}` — shooting and backside were removed. But the rendered panel still lists `(quantum, nuclear, backside, shooting, down-family)`. The status sentence is a hardcoded template string that pt9's parser-follow-up didn't update.

This is **template drift**, not a parser bug. Per the no-code-changes rule for this phase, flagging only.

**Fix axis `[presentation]`**: replace the hardcoded list with a per-row rendering ("This row contains the policy-bearing token: quantum") OR derive the list at template-render time from POLICY_TOKENS. Minimally, sync the hardcoded copy to current state.

---

## 10. Parser honesty successes `[parser ✓]`

Worth naming explicitly because they're load-bearing for the panel's trustworthiness:

- **`barraging-osis` approximate**: doesn't paper over the 4-vs-5 gap. Both numbers shown; editorial truth wins; reader sees the conflict.
- **Rotational-escalation warnings on `spinning-*`**: encodes a known pending-Red policy uncertainty without forcing a verdict.
- **`surging` virtual-expansion descriptive layer**: shows the reader that the parser knows surging = spinning+stepping (per Red pt5), even when ADD math collapses to the named compound.
- **`policy_dependent` status keeps the row in service**: doesn't suppress the ADD or the formula; just labels the underlying weight as contested. The reader still gets `Asserted ADD: 2 / Computed ADD: 2`.

These are the things the panel does that would be hard to retrofit if regressed. Phase-4 work should explicitly preserve them.

---

## 11. Information-density overload `[presentation]`

Per-panel information count audit (rough — counts surfaces, not characters):

| Panel | Status | Asserted | Computed | Derivation | Descriptive roles | ADD-contributing | Policy tokens | Warnings | Standalone unresolved | Mentions of slug-name |
|---|---|---|---|---|---|---|---|---|---|---|
| `head-stall` | header | 1 | 1 | 1 | 2 entries | 1 entry | — | 1 | 1-entry | 4 |
| `cross-body-sole-stall` | header | 1 | 1 | 1 | 2 entries | 1 entry | — | 1 | 3-entry | 4 |
| `quantum` | header | 1 | 1 | 1 | 1 entry | 1 entry | 1 entry | 2 | — | 5 |
| `paradox-whirl` (clean) | header | 1 | 1 | 1 | 2 entries | 2 entries | — | — | — | 0 |

The clean panels (`paradox-whirl`, `spinning-symposium-whirl`, `whirl`, `butterfly`) read at appropriate density. The self-atom-with-unresolved-tokens panels (`cross-body-sole-stall` is the worst) and the policy-stacked panel (`quantum`) are crowded.

**Fix axis `[presentation]`**: the cumulative wins from #5–#9 (collapse redundant unresolved sections, tier warnings, hide descriptive when empty-of-information, slim policy roster) directly attack this. No single intervention fixes density; the cure is composite.

---

## 12. Places where editorial metadata would help `[presentation, no parser change]`

`freestyle_tricks` rows already carry editorial metadata that the panel doesn't surface:

| Slug | `description` already says | Panel doesn't show |
|---|---|---|
| `sumo` | "Nuclear-modified mirage; 5 ADD via X-Dex escalation per Red pt9." | the X-Dex mechanism, the Nuclear modifier, the mirage base |
| `sailing` | "Sailing set. 2 ADD standalone. Per Red pt9 equivalent to Pixie Quantum set." | the Pixie Quantum equivalence |
| `mobius` | (curated baseline: gyro-modified torque, equivalent to symposium torque) | the gyro/torque structural ancestry |
| `barfly` | (curated baseline references infinity family) | the infinity family link |
| `surging` | "Surging primitive (decomposes informally as spinning + stepping; not modeled as a structural compound)" | the explicit Red-pt5 rationale for atomic treatment |
| `nemesis` (not in audit picklist but exemplary) | "Furious-modified barfly." | the furious + barfly composition |

The `description` column is the single highest-leverage information source the panel ignores. Adding a small "Editorial note" block (rendered when `description` differs from the formula's auto-text) would close most of the candidate-core ambiguity (#4) and help with self-atom clarity (#5) at near-zero implementation cost.

**Fix axis `[presentation]`**: route `freestyle_tricks.description` through the service shape into the template. No parser change. No new DB column. Pure rendering.

---

## 13. Places where progressive disclosure seems necessary `[presentation]`

When the panel has more to say than fits cleanly in one screen, progressive disclosure beats either full-display (overload) or aggressive trimming (information loss).

**Candidate disclosure tiers** (illustrative, not specification):

- **Tier 1 (always visible)**: Status header + asserted/computed ADD + Derivation formula + Material warnings.
- **Tier 2 (toggle: "Structural breakdown")**: Descriptive roles + ADD-contributing roles. Hidden by default for self-atom rows where both layers reduce to `Core family: <slug>`.
- **Tier 3 (toggle: "Editorial context")**: `description` column, base_trick (if outside the tokenization), modifier_links (if non-empty), pt-source provenance.
- **Tier 4 (toggle: "Mechanical warnings")**: `inferred_self_canonical_atom` + similar low-information warnings. Hidden by default; surface count behind toggle ("show 1 mechanical warning").

**Why disclosure beats trim**: the audit infrastructure exists for cross-trick analysis; full information must remain accessible to engaged readers. But the default render for casual readers should not lead with `Unresolved tokens: cross, body, stall, double, leg, over, atom, smasher` lists.

---

## 14. Issues that should NOT be "fixed" — genuine freestyle ambiguity

These reflect real ontological tensions in the freestyle community. Papering over them would erase information.

**`barraging-osis` 4-vs-5 disagreement.** This is the canonical example of "the math says X, the community says Y, both are real." Forcing closure (either updating the modifier table to make the math hit 5, or updating asserted to 4) would silently choose one truth over the other. The Phase-2.5 contract — asserted is editorial, computed is diagnostic, both shown — is correct. Keep.

**`surging` virtual-expansion split.** Red pt5 explicitly says surging IS spinning+stepping structurally but is treated as an atomic 2-ADD primitive. The two-layer panel reflects that exactly. Erasing the descriptive layer would lose Red's ruling.

**`spinning-whirl` rotational-escalation warning.** The +2-rot vs +1-non-rot policy is genuinely pending-Red, codified as "rotational_modifier_bonus_policy is a property of the modifier" (PHASE_2_5_REFINEMENTS.md §3). The warning preserves uncertainty rather than forcing a verdict.

**`quantum` policy-dependent status.** Quantum's ADD weight remains contested. Pt9 didn't touch it; Red hasn't ruled. The status accurately reflects ontology state.

**`name(N) = N` formula for single-token bases (whirl, butterfly, mobius, gauntlet).** For genuine base tricks with no compositional name, `whirl(3) = 3` IS the ground truth. The trick name is its own canonical anchor; there's no decomposition to perform. Hiding the formula or rendering it as empty would lose the editorial-truth-equals-asserted-ADD signal. (Note: this is ONLY correct for genuine bases. The same formula on `sumo` or `barfly` is misleading — see #3 and #4.)

**`rev-up` directionality classification.** "rev" is genuinely directional without an ADD bonus; "up" is genuinely uncategorized in the current registry. The descriptive layer reflects exactly that. Inventing a movement-vector role just to absorb "up" would manufacture ontology to suit the panel's appearance.

The throughline: the parser's job is to be honest about what it knows AND what it doesn't. Where it surfaces uncertainty, that uncertainty is real.

---

## 15. Highest-priority UX refinements (Phase 4 candidates)

Ordered by leverage × cost (highest leverage, lowest cost first). All are presentation-layer; none require parser changes.

1. **Surface `description` in an "Editorial context" block** (§12). Closes most candidate-core ambiguity (§4), most named-compound under-explanation (§5), and several self-atom clarity problems (§6) — at the cost of one new template block and one service-shape field. Highest leverage of any single change.

2. **Tier warnings into Material vs Mechanical** (§8). Eliminates ~13 instances of `inferred_self_canonical_atom` from the default render; fixes the `quantum` two-warning stack. Pure template work.

3. **Sync the hardcoded policy-token roster narrative** (§9b). Currently stale post-pt9. Either update the literal string to `(quantum, nuclear, down-family)` or derive it from POLICY_TOKENS at render. Smallest possible fix.

4. **Replace policy roster narrative with per-row rendering** (§9a). "This row contains the policy-bearing token: quantum" instead of leaking the full roster. Combine with #3.

5. **Collapse unresolved-tokens duplication** (§7). Single rendering location. Template-only.

6. **Hide descriptive layer when it carries no information** (§6). For panels where descriptive contains ONLY unresolved-tokens AND the row self-atomizes, suppress the layer. Reveals on toggle if needed. Template + small service-shape predicate.

7. **Add the "Structural breakdown is per-token classification; ADD math may collapse to atom" bridge sentence** (§5). Explains why the two-layer split exists. One sentence in the panel intro.

---

## 16. Highest-priority parser refinements (Phase 4+ candidates)

Larger, more structural. Each is a real parser-architecture decision.

1. **Status-determination consults formula shape** (§3 fix axis a). Cosmetic but reduces misleading-label count from ~10 to 0 in the audit corpus. ~5 lines in `parse_freestyle_notation.py` status-determination block. Cheapest parser-side win.

2. **Parser reads `base_trick` + `modifier_links` columns** (§3 fix axis b). Substantive — extends `compute_formula` to synthesize a richer formula from row metadata when canonical_name doesn't decompose. Closes the candidate-core ambiguity (§4) at the parser level rather than papering over with editorial-context rendering. Requires Red consultation for the synthesis-vs-tokenization precedence rule.

3. **Role-registry expansion** (§6 fix axis ontology). New role buckets for surface-suffix ("stall"/"kick"/"delay"), positional ("cross-body"/"same-side"), movement-vector ("up"/"down"-non-policy). Reclassifies most of the Unresolved-tokens noise. Coordination with Red on which name fragments are real ontology vs name-internal artifacts.

4. **D1 self-atom collapse trigger refinement** (low priority). Currently fires when `descriptive["core_family"]` is empty OR there are unresolved_tokens. The "empty" condition misses single-token canonicals because they populate core_family via slug-equality. Refining the trigger so that single-token canonicals where `name == slug AND no other roles fired` go through the self-atom path would partially address §3 without (1) or (2). Niche; only useful if (1) is rejected.

5. **Compute-formula synthesis with editorial mechanism notes** (Phase 4+). For named compounds with row-level mechanism descriptions (sumo's X-Dex, surging's atomic-by-policy), synthesize a richer formula like `nuclear(?) + mirage(2) = 5 [editorial: X-Dex escalation per Red pt9]`. Needs a structured "mechanism" column or a parsed-from-description fallback.

---

## 17. Recommended next-phase ordering

**Phase 4: presentation refinements (no parser changes).**
- Implements UX refinements §15.1, §15.2, §15.3, §15.5 in one pass.
- Re-runs the audit at the end. Predicted: density drops materially on self-atom panels; candidate-core ambiguity largely closes via description rendering; warning overload goes from 13 mechanical-warning surfaces to ~0 in default render.
- This phase has zero parser risk, zero ontology risk, and visibly improves the diagnostic surface for casual readers.

**Phase 5: parser status-shape consult (parser refinement §16.1).**
- Smallest parser-side win. Removes misleading "exact_modifier_derived" labeling for genuine self-atom shapes.
- Needs a small re-audit afterwards but no Red consultation.

**Phase 6: role-registry expansion or row-metadata consumption (parser refinement §16.2 or §16.3).**
- Substantive parser change. Pick one of the two axes after Phase 4–5 reveal which is more load-bearing for the eventual reader.
- Likely requires Red consultation: which name-fragment patterns are real ontology, which are name-internal artifacts.

**NOT recommended for Phase 4 or 5**:
- Any new trick activation (would change corpus shape mid-analysis).
- Any new Red ingestion (pt10 etc.) — phase-4 should land BEFORE pt10 so pt10 inherits the cleaner diagnostic surface.
- Modifier-table reweighting (would invalidate the rotational-escalation warnings without first ruling on Red's policy answer).
- Asserted-ADD adjustments (editorial truth doesn't move based on math closure).

**Closing the audit**: this `semantic-audit-notes.md` retires when Phases 4–5 land and a fresh capture confirms the predicted UX improvements. Until then it stays at repo root, untracked, regenerable via `scripts/audit-notation-grammar.ts`.
