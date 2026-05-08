# Canonicalization Policy — Freestyle Ontology

**Status:** BINDING. Codifies current consensus for freestyle dictionary ontology and adjudication decisions. Revisions require explicit human approval and a corresponding audit-log entry (topic_type = POLICY) in `red_corrections_pt*.csv`.

**Scope:** What enters the dictionary, in what form, with what authority. Pure ontology and governance — workflow / process / loader mechanics are out of scope (see the freestyle-dictionary workflow skill for those).

**Companion documents:**
- `OPEN_QUESTIONS.md` — current open items, held media rows
- `red-correction-pt*.txt` — raw Red Husted expert input
- `red_corrections_consolidated.csv`, `red_corrections_pt*.csv` — adjudication audit logs

**Last update:** 2026-05-06 (initial codification, post-pt8).

---

## 1. Canonical vs alias vs structural-decomposition

Every name considered for the dictionary lands in exactly ONE of three states. Decide state BEFORE writing.

### A. Canonical row in `freestyle_tricks` (or `red_additions`)

Required when AT LEAST ONE of:

1. **Named-identity persistence.** Community uses the name independently of its decomposition (e.g. `dyno`, `paradon`, `bigwalk`, `surreal`, `nemesis`, `gauntlet` — known by community name in competition / tutorials, not as the structural form).
2. **Not losslessly decomposable.** Base + modifiers do not fully describe the move. If they do, model via `modifier_links` instead of a new row.
3. **Historical / competitive significance.** Appears in competition results, widely-recognized tutorials (TT lessons, AnzTrikz, FootbagSpot), or a curator's authoritative set. Records-only appearance is weak signal; competition / TT lesson / Red's curated set is strong signal.
4. **Structural ambiguity resolver.** Multiple valid decompositions exist for the same physical move; the name is the canonical anchor that resolves the ambiguity.
5. **Direction-reversed canonical** per §4 (direction is structural, not a qualifier).

### B. Alias (in `trick_aliases.csv` OR inline `aliases` column on a `red_additions` row)

Required when ALL of:

- The name maps cleanly to ONE existing canonical (no ambiguity)
- The name is a historical, community-shorthand, or displaced form of an existing canonical
- No structural information would be lost by collapsing to alias

### C. Structural decomposition only (NO row, NO alias)

Required when ALL of:

- The name is a pure modifier-stack (e.g. "Spinning Paradox Mirage", "Symp Frantic")
- All decomposition components are themselves canonical
- Community does NOT use the name independently of its parts
- ADD math decomposes cleanly under the modifier table

### Preference order when multiple states could apply

1. **C (structural) > A (canonical)** — fewer rows = less drift; combinatorial expansion is forbidden.
2. **B (alias) > A (canonical)** — when a single-target mapping exists, alias suffices.
3. **A (canonical) only** when B and C are insufficient.

### Anti-patterns (forbidden)

- **Combinatorial expansion.** Every (modifier × base) tuple does NOT deserve a row. Only the named / significant subset does.
- **Surface-only variants** (e.g. `kick` vs `stall` for the same motion). Pick one canonical surface; the other is alias-only.
- **Naming-only "direction" variants** (e.g. CW/CCW / in-or-out execution variants). Stay in one canonical row when the community treats them as the same trick.

---

## 2. Evidence hierarchy and source precedence

When sources conflict, higher tier wins. Lower tiers serve as candidate-generators and sanity checks, not as override authority for higher tiers.

| Tier | Source | Authority |
|---|---|---|
| 1 | Red Husted (expert reviewer) | Overrides all others. Absolute. |
| 2 | Tricks of the Trade lessons (Kenny Shults, WorldFootbag YouTube) | Overrides 3+ for ADD when the title states it; same era as Red. |
| 3 | PassBack records | Overrides 4+ for community-current naming and ADD. |
| 4 | footbag.org (`scraped_footbag_moves.csv`) | Authoritative for fb.org-original entries by `showmove/<id>`. NOT authoritative for community-evolved naming. |
| 5 | footbagmoves.com | Reference baseline; treat as Tier 4 sibling. |
| 6 | Existing legacy dict rows (`tricks.csv`) | Preserved unless higher tier overrides. Override channel: UPSERT in `red_additions` (do NOT edit `tricks.csv`). |
| 7 | Inferred decomposition (modifier-math, slug-pattern guessing) | Weakest. Sanity check only. NEVER overrides any explicit source. |

### Conflict protocol

- **Tier 1 wins absolutely.** Never silently override Red.
- **Tier 2 vs Tier 3:** if both are explicit and disagree, DEFER + log; ask Red.
- **Tier 4 / 5 vs Tier 6:** UPSERT into `red_additions`; preserve the old description in the row note.
- **Tier 4 / 5 internal disagreement** (e.g. naming variants): preserve both as aliases on the canonical that wins by Tier 1 / 2 endorsement.
- **Tier 7 (inference) failure** = DEFER, never silent rewrite. Math that doesn't close is information, not a bug to "fix" by inventing modifiers.

---

## 3. ADD-math conflict protocol

When a stated structure does not produce the stated ADD value:

1. **Do NOT silently invent** a missing modifier or extra component to make math close.
2. **Do NOT change** the ADD value to fit the structure.
3. **Do NOT invent** rotational behavior (or any modifier property) to close the math.
4. **Do NOT remove** the contradiction by deleting one source's claim.

### Required actions, in order

1. Document the discrepancy in the row's `review_note`, citing both sources by version.
2. If the row is not yet active, leave it `is_active=0` and mark `review_status=pending`.
3. If the row is already active under one source, log the conflict in `red_corrections_consolidated.csv` (or `red_corrections_pt*.csv`) with `disposition=partial` or `deferred`.
4. Forward to the next expert-review packet for Red.

### Special case: stated ADD without stated structure

When Red gives ADD authority but no structure (precedent: `bullwhip`, `nemesis` pre-pt8, `jani walker` pt8): activate the row with empty `base_trick` + empty `modifier_links` + `description="Compound trick."` + a note flagging that structure is deferred. ADD-only activation IS allowed under expert authority.

### Worked examples (current state, 2026-05)

- **Voodoo:** fb.org "Paradox Symposium Blur" + 5 ADD does NOT decompose cleanly (paradox 1 + symposium 1 + "blur" → 4, not 5). Status: DEFER, do not invent the missing element.
- **Jani Walker:** Red pt8 = 5 ADD; fb.org structure "Barraging Butterfly" = 4 under modifier math. Status: ADD-only activation; structure deferred.
- **Nemesis:** math forces `barfly` to be rotational (furious +2 rot + barfly 4 = 6). Captured in note as inference, not silently committed to barfly's rotational classification.

---

## 4. Directionality policy

### Core rule (Red pt6)

**Direction is structural, not a qualifier.** A direction-reversed move IS its own canonical entry, not "the same trick with a `reverse-` qualifier."

### Anchor examples (Red-confirmed)

- mirage ≠ illusion
- spinning ≠ inspinning
- ATW ≠ reverse-ATW
- drifter ≠ reverse-drifter

### Promotion criteria (reverse-X to its own canonical)

Promote when AT LEAST ONE:

- Direction reversal changes spin / dexterity-direction / movement-vector at the structural level (not just naming convention)
- Community treats the reversed form as a distinct move (separate name in active use)
- ADD value or family identity differs (or could differ once analyzed)

### Direction is NEVER modeled as a modifier

`reverse` is NOT a row in `trick_modifiers.csv`. Reverse-X always promotes to a separate canonical, OR closes as not-distinct (and is not added at all).

### Naming-only direction (do not promote)

Within-trick CW/CCW or in/out execution variants stay in one canonical row when the community treats them as the same trick. The canonical notation captures both forms (e.g. ATW notation supports both CW and CCW).

### Open exceptions to address

- **Reverse Swirl** is currently an alias on `swirl`. Per this rule, should be promoted to its own canonical. Pending Red confirmation (next expert-review packet).
- **Reverse Magellan**: not in any source — close (do not add).

---

## 5. Modifier / set / body / naming distinction

Four orthogonal categories. Each name belongs to exactly one.

### A. Modifier (alters a base trick; contributes ADD per `trick_modifiers.csv`)

- **Body modifiers:** paradox, spinning, ducking, symposium, gyro, stepping, tapping, barraging, weaving, diving, blazing, miraging, whirling, terraging
- **Set modifiers** that ALSO stand alone as set primitives (see B): atomic, pixie, fairy, quantum, nuclear, furious, pogo, shooting, blurry, rooted

### B. Set primitive (a launch / origin position)

Stands alone as a 0–2 ADD entity AND acts as a +0 to +3 modifier on a base.

- atomic, pixie, fairy, quantum, nuclear, furious, pogo, shooting, blurry, rooted (per pt8)

### C. Body primitive (pure motion; no stall surface, not a launch)

- spin, double-spin, hop-over, walk-over, flying-inside, flying-outside, spyro

### D. Naming adjective (NOT a modifier; NEVER modeled in `trick_modifiers.csv`)

- **inside** / **outside** — execution-side description, not bonus-bearing (Red pt7)
- **down** pattern — each "Down X" is its own trick; "down" itself is not a modifier (Red pt7)
- **Symp** — shorthand for Symposium (alias, not modifier)

### E. Pending classification (Red has not ruled)

- **backside** — appears in PassBack ("BS Magellan", "BS Paste") and fb.org ("Backside Symposium Toe Blur"). Pending: modifier vs naming-adjective. Do not classify until Red rules.
- **sailing**, **blistering** — no internal source mention. Pending existence confirmation.

### Concrete decisions captured (Red-confirmed)

| Item | Category | ADD bonus | Source |
|---|---|---|---|
| rooted | set | +0 / +0 | Red pt8 |
| terraging | body modifier | +3 / +3 | Red pt8 |
| furious | set | +1 / +2 | Red pt6 |
| pogo | set | +0 / +0 | Red pt6 |
| shooting | set | +3 (rotational pending) | Red pt7 |

---

## 6. Alias policy

### Hard rules

1. Each alias maps to **exactly ONE** canonical `trick_canon`.
2. **No circular aliases** (A → B and B → A is forbidden).
3. **No alias chains** (A → B → C is forbidden; must be A → C and B → C directly).
4. **No ambiguous shorthand** promoted to alias (e.g., "open", "shut" — keep informal until the alias schema supports tiers).
5. **Alias targets MUST resolve** to a canonical row in `freestyle_tricks` (active OR pending) at load time.
6. **Categories are NOT aliases** ("double dex", "dex", "compound" — keep out).
7. **Instructional phrases are NOT slugs** and do NOT generate `*-2add` derived slugs.
8. **Inline aliases override** dedicated alias rows when both exist for the same alias body.

### Historical preservation

- Older / displaced names become aliases on the modern canonical.
- DO NOT delete a historical name; demote to alias.
- Examples: "miraging legover" → "double leg over"; "atomsmasher" → "atom smasher".

### Alias removal protocol

Remove an alias only when ALL of:

- The target does not resolve, AND
- No higher-tier source (per §2) supports the mapping, AND
- The mapping was inferred, not Red-stated.

Document every removal in `red_corrections_pt*.csv` with the disposing pt batch and reason. Example: pt8 removed `jani walker → furious butterfly` (was inferred without Red confirmation; Red declined to endorse the mapping).

---

## 7. Expert-override protocol

### Authority

**Red Husted's stated answers override ALL inferred decomposition.** Tier 1 absolute (per §2).

### Provenance preservation (mandatory)

Every override MUST cite its source explicitly:

- Format: `Red pt<N> YYYY-MM-DD: <quoted or summarized statement>`
- Location: row `review_note` in `red_additions_2026_04_20.csv` (and the corresponding audit-log row in `red_corrections_*.csv`)
- Pre-override value preserved in:
  - row `review_note` (full prior decomposition stated, with the source it came from)
  - `freestyle_trick_source_links.asserted_<field>` (records what the prior source asserted, for QC divergence reporting)

### Never silently rewrite

- A canonical's ADD or structure changing across pt batches must leave a trail. Loss of the trail is a policy violation.
- Multiple Red statements that conflict each other (e.g. pt2 vs pt6) are handled by treating the LATER statement as authoritative AND preserving both in the note.

### Unresolved conflicts

- DEFER state, NOT silent normalization.
- Documented in `OPEN_QUESTIONS.md` AND `red_corrections_pt*.csv` with `disposition=deferred` (or `pending` for "Red will check").
- Re-asked in the next expert-review packet.

### Glossary-clarification questions

When Red's wording suggests a terminology mismatch with the schema (e.g. "the base trick is Gyro" when gyro is modeled as a modifier, not a base), treat as a governance-level question. Ask separately from data questions, and DO NOT alter the schema unilaterally to accommodate the loose phrasing.

---

## 8. Glossary separation

Glossary terms describe runs, scoring concepts, style, or community vocabulary. They are NOT tricks. They are NOT modifiers.

### Examples (informational)

- **Run-quality labels:** guiltless (3+ ADD), tiltless (2+ ADD), tripless (4+ ADD), fearless (5+ ADD), beastly (6+ ADD), godly (7+ ADD), shoutless, dropless
- **Scoring / shape:** density, BOP (Butterfly / Osis / Paradox Mirage)
- **Community vocabulary:** shred circle

### Hard rules

- **Never** store glossary terms in `freestyle_tricks`.
- **Never** store glossary terms in `freestyle_trick_modifiers`.
- Glossary terms **never** override canonical ontology.
- Glossary lives in editorial markdown / static content first.
- Create a glossary DB table only if a clear product need exists. (None currently. Do not anticipate one.)

### Reverse rule

A trick name appearing in glossary copy does NOT become a glossary term. Trick descriptions remain in `freestyle_tricks`; glossary entries describe the move/run quality independently of trick identity.

---

## 9. Freeze philosophy

### Stability over expansion

- Prefer ontology stability to aggressive growth.
- A row not added is cheaper than a row added wrong.
- Expert clarification time is finite. Do not burn it on speculative additions.
- Cost of removing a bogus active row > cost of leaving a valid trick deferred.

### Under-classification beats pollution

- DEFER is always available. Defaulting to defer is not failure.
- A pending row preserves provenance without polluting the active surface (`is_active=0` is hidden from public-facing endpoints).
- Better to leave a known trick UNCATEGORIZED than to invent a category.
- Better to leave structure DEFERRED than to invent decomposition.

### External sites are candidate-generators, not authoritative truth

- footbag.org, footbagmoves.com, PassBack: sources for candidate rows. They generate items for Red review.
- Their entries do NOT enter the dictionary as ACTIVE without:
  - Tier 1 endorsement (Red), OR
  - Explicit pipeline-approval rule for the source (currently NONE — even fb.org pending entries land as `is_active=0` until promoted).
- A trick existing on footbag.org is NOT itself sufficient to add it as canonical-active.

### Transience awareness

Rows that exist only via the fb.org pending pool (`is_active=0`, sourced from the scraped_footbag_moves loader) are TRANSIENT in dev: they vanish on local-DB resets that don't run that loader. Treat them as STAGED for review, never as durable canonical.

### Ontology pollution = loss of trust

- One bogus row that passes QC may persist for years.
- The downstream cost (incorrect public-facing data, broken aliases, wrong record attribution) is large and slow to surface.
- Default = ask Red. Bias toward fewer rows. Deferred over speculated.

---

## 10. Productive multiplicity patterns

### Red pt3 principle

> *"Double / Triple describes repetition unless community usage stabilizes a distinct name."*

Source: `red-corrections-pt3.txt` — Red's explicit guidance on "Double Legover", "Double Fairy", "Double Blender", "Double Spinning Osis":

> *"Double is not its own set of moves (like stepping) but only signifies someone has done a double dexterity or double body spin. Double can involve different trick families."*

A multiplicity prefix (`Double`, `Triple`, `Quadruple`, `Quintuple`) describes **count of repeated dexterity / body-spin / set events**, not a registered modifier. The presence of a multiplicity prefix is therefore a CLASSIFICATION-LEVEL signal, not a CANONICAL-LEVEL signal: the row may or may not deserve canonical status, and the prefix alone does not decide.

### The named-identity test

A `<Multiplicity> X` entry earns its own canonical row only when **community usage has stabilized it as a distinct, recognized name** — not merely as a count-described variant of another canonical.

**Stabilized examples (already canonical):**
- `double-leg-over` — community-fixed name; Red identifies as "Miraging Legover" structurally but the name persists independently.
- `double-around-the-world` — community-fixed name; standard term in the ATW family.
- `double-spin` — community-fixed name; pairs with `spin` as a body-primitive ladder.

**Descriptive examples (NOT canonical, per Red pt3):**
- `Double Fairy` — Red: "term isn't used much, really a Double Illusion."
- `Double Blender` — Red: "Whirling Blender, two dexes and an Osis."
- `Double Spinning Osis` — Red: "is just that, two spins to an Osis = 5 ADDs."

The distinction is not visible from the name alone, the ADD value, or even the presence of records and notation. It requires Red-tier endorsement OR substantial documented community use.

### Adjudication checklist for `<Multiplicity> X` candidates

1. Does Red explicitly endorse the name as a distinct identity? → if yes, candidate for canonical.
2. Has Red explicitly described it as descriptive (e.g. "is just that", "term isn't used much")? → if yes, NOT canonical.
3. Is there a substantial passback record (not just a struggle-indicator count)? Records are evidence of community use but **not sufficient** without named-identity persistence.
4. Does the name appear in independent sources (TT lessons, AnzTrikz, Footbagspot tutorials, multiple competitor uploads)? Independent sources outweigh single fb.org listings.
5. If steps 1–4 are inconclusive, default to DEFER — not promote.

### Default disposition

In the absence of clear community-fixed identity, productive multiplicity rows default to:

- **`is_active=0` external residue** — visible in the coverage-diff workbook, NOT in the canonical dictionary.
- The base trick (where it exists) handles the rendering. E.g. records labeled "Double X" can resolve via alias to canonical `X` if and when the alias is curator-approved (NOT automatic — see §6 Alias policy).

### Detection tooling

`legacy_data/scripts/build_freestyle_dict_coverage_diff.py` carries a productive-multiplicity detector that flags `Double / Triple / Quadruple / Quintuple <X>` external rows and emits:

- `is_productive_multiplicity` (yes/no)
- `multiplicity_prefix`
- `multiplicity_base_name`
- `multiplicity_note` (whether base resolves; high-evidence caveat)
- `review_needed='productive-multiplicity-review'` for unmatched flagged rows

**The detector flags but does NOT adjudicate.** Decisions remain with Red (or, where Red has spoken, with the curator-applied principle above).

### Cross-references

- §1 Canonical vs alias vs structural-decomposition (canonical-row criteria)
- §5 Modifier / set / body / naming distinction (productive multiplicity is NOT a registered modifier)
- §6 Alias policy (descriptive multiplicity names may live as aliases when Red approves)
- §7 Expert-override protocol (Red's explicit corrections supersede heuristic detection)

---

## Cross-references

| File / Path | Role |
|---|---|
| `legacy_data/inputs/curated/tricks/OPEN_QUESTIONS.md` | Current open items + held media rows |
| `legacy_data/inputs/curated/tricks/red-correction-pt*.txt` | Raw Red Husted expert-review responses |
| `legacy_data/inputs/curated/tricks/red_corrections_consolidated.csv` | Adjudication audit log (consolidated, pt1–pt4) |
| `legacy_data/inputs/curated/tricks/red_corrections_pt*.csv` | Pt-specific adjudication audit logs (pt5, pt8) |
| `legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv` | Canonical UPSERT overlay channel (Red-authoritative add/update) |
| `legacy_data/inputs/curated/tricks/red_corrections_2026_04_20.csv` | Field-level UPDATE channel for `tricks.csv` rows |
| `legacy_data/inputs/noise/tricks.csv` | Legacy canonical baseline (Tier 6; do not edit directly) |
| `legacy_data/inputs/noise/trick_aliases.csv` | Dedicated alias rows |
| `legacy_data/inputs/noise/trick_modifiers.csv` | Modifier ADD-bonus table |
| `legacy_data/out/scraped_footbag_moves.csv` | fb.org candidate pool (Tier 4) |

---

## Revision log

| Date | Change | Authority |
|---|---|---|
| 2026-05-06 | Initial codification (post-pt8). | James Leberknight (explicit instruction) |
| 2026-05-07 | RC-2A: normalized 39 `records_master.csv` `trick_name` rows from abbreviations (`pdx-`, `symp-`, `ATW`, `DATW`, `Atomsmasher`, `Janiwalker`, `Alpine X`, `BS X`, etc.) to canonical full forms matching `freestyle_tricks.canonical_name`. Closes the records-table empty-state on 12 affected trick pages. Implements §6 alias-policy rule "alias targets must resolve to canonical." | James Leberknight (explicit instruction) |
| 2026-05-07 | CD-1: PassBack-source sidecar caption format established as `<canonical_trick_name> — <Creator> (<N> kicks, <YYYY-MM-DD>)`. Disambiguates same-trick same-player record clips in the Passback gallery via player + count + date + (where applicable) `(ss)`/`(op)` qualifier inherited from canonical name. | James Leberknight (explicit instruction) |
| 2026-05-07 | Adopted display-time year-1970 floor for `achieved_date` rendering: when parsed year < 1970, suppress the date suffix in caption (Excel-epoch placeholder artifacts like `1905-MM-DD` would otherwise render as visually catastrophic dates). Source data is NOT modified — sanitization is presentation-only. Pattern lives in `fmt_date()` of caption-generator scripts. | James Leberknight (explicit instruction) |
| 2026-05-08 | Added §10 "Productive multiplicity patterns" codifying Red pt3 principle: *"Double / Triple describes repetition unless community usage stabilizes a distinct name."* Captures the named-identity test, stabilized vs. descriptive examples (canonical: `double-leg-over`, `double-around-the-world`, `double-spin`; descriptive: Double Fairy, Double Blender, Double Spinning Osis), adjudication checklist, default disposition (external residue), and reference to the detector in `build_freestyle_dict_coverage_diff.py`. | James Leberknight (explicit instruction) |

---

## Appendix: Future modeling considerations (non-binding)

Items captured here are **observations**, not policy commitments. They flag known modeling tensions where the current schema or row shape is workable but would benefit from a future enhancement. None require immediate schema change; none should be acted on in routine adjudication.

### A1. Multi-family membership

The current `freestyle_tricks.trick_family` column stores a single family slug. Two known canonical tricks belong to TWO families simultaneously:

- **`double-leg-over`** belongs to both the **mirage family** (it is structurally a mirage variant — the dexterity work mirrors mirage's leg paths) AND the **legover family** (it is a leg-over move by name and mechanic).
- **`eggbeater`** belongs to both the **illusion family** (structurally illusion-derivative) AND the **legover family** (it is a leg-over compound).

The current single-family field forces a pick. The platform tolerates the pick, but the ontology under-represents the lineage in both cases. A future schema accommodation would be a secondary-family field (e.g. `trick_family_secondary TEXT NULLABLE`), or a normalized many-to-many `freestyle_trick_families` join table. Either would let the dictionary-by-family view group these tricks under both lineages without duplicating rows.

**Status: deferred.** Document only. Do not add the field, do not add a join table, do not split rows. James direct adjudication 2026-05-08.

### A2. Future modeling considerations are non-binding

Entries in this appendix are intended for designers and future curators reading the policy. They explicitly do NOT:

- override existing canonical decisions
- block adjudication of new tricks under the current schema
- create a backlog item that must be resolved before other work

When a real consumer need arises (e.g. a UI feature that depends on multi-family grouping), the relevant entry can be promoted out of this appendix into a normal policy section with an explicit decision. Until then, single-family modeling is correct per current schema.
