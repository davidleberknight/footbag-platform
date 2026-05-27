# Composite-Modifier Expansion Framework
**Date:** 2026-05-22
**Status:** Design note — no implementation in this slice
**Builds on:** `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md`
**Trigger:** Wave 3 closed the mechanical promotion pool (28 → 0 candidates). The remaining non-first-class compounds are blocked by semantic compression and composite-modifier interpretation, not by parser vocabulary.

---

## §0. Posture

This is a **reference framework** for the next promotion frontier. It does NOT:
- Mass-promote anything.
- Re-open the `SEMANTIC_COMPRESSION_DOCTRINE.md`'s settled five-class taxonomy.
- Auto-expand every compressed modifier recursively.
- Harden the doctrine prematurely against future Red rulings.

It DOES:
- Inventory the actual remaining composite-modifier candidates (separating them from look-alikes that are really just missing-notation).
- Specify when expansion happens at which architectural layer.
- Recommend per-trick publication depth.
- Surface the doctrine state for each pilot so curator-paced promotion can proceed.

---

## §1. The strict composite-modifier cohort (post Red 2026-05-20)

The Red 2026-05-20 adjudication **retired** the general "blurry = stepping + paradox" expansion. The modifier table now treats `blurry` flatly as +1 (= stepping only); the historical stepping+paradox composition survives only as a **per-slug carve-out** for the four compounds whose official ADDs were locked under the pre-retraction reading.

The carve-out lives in `legacy_data/scripts/build_trick_reconciliation_workbook.py` as `MODIFIER_COMPOSITIONS`:

```python
MODIFIER_COMPOSITIONS = {
  "blurry": {
    "atoms":   ["stepping", "paradox"],
    "targets": frozenset({"blur", "blurry-whirl", "blurry-torque", "food-processor"}),
  },
}
```

**Four-row allowlist** — narrow on purpose. `blurriest` (= blurry barfly) intentionally uses blurry-as-+1 in the modifier-stack and is NOT in the allowlist; applying the carve-out to it would over-derive.

After Wave 3, **`blur` is already first-class** because its DB `notation` column is `STEPPING PARADOX MIRAGE` (the expanded form — the parser doesn't need to know about the carve-out). The remaining 3 are the strict composite-modifier cohort:

| slug | adds | base_trick | DB notation | Status |
|---|---|---|---|---|
| `blurry-whirl` | 5 | whirl | (empty) | composite-modifier; carve-out applies |
| `blurry-torque` | 6 | torque | (empty) | composite-modifier; carve-out applies |
| `food-processor` | 6 | blender | (empty) | composite-modifier; carve-out applies + sui-generis folk name (≡ blurry blender) |

---

## §2. Look-alike rows that are NOT composite-modifier

The user's prompt grouped `haze / nova / mantis / food-processor` together as "composite-modifier." On inspection, three of those four are actually **missing-notation rows** with ordinary modifier+base structure — they parse cleanly via the standard `modifier(+N) + base(N) = M ADD` form **as soon as their `notation` column is back-filled**.

| slug | adds | base_trick | description | True parse |
|---|---|---|---|---|
| `mantis` | 4 | eggbeater | "Gyro-modifier eggbeater" | `gyro(+1) + eggbeater(3) = 4 ADD` ✓ |
| `nova` | 4 | double-leg-over | "Symposium-modifier double-leg-over" | `symposium(+1) + dlo(3) = 4 ADD` ✓ |
| `haze` | 4 | double-leg-over | "Stepping-modified double leg over" | `stepping(+1) + dlo(3) = 4 ADD` ✓ |
| `assassin` | 4 | mirage | "Pixie-and-ducking modified mirage" | `pixie(+1) + ducking(+1) + mirage(2) = 4 ADD` ✓ |
| `blurriest` | 5 | barfly | "Blurry-modified barfly" | `blurry(+1) + barfly(4) = 5 ADD` ✓ (post-retraction; blurry flat) |

These are **Wave 4 candidates via notation back-fill** — not composite-modifier work. Bucket them separately. The framework below addresses the genuinely composite cohort.

---

## §3. Doctrine-pending composites (not in this framework's scope)

Two compounds have known composite readings that **Red has not yet ratified**:

| slug | adds | candidate composite reading | Doctrine state |
|---|---|---|---|
| `nemesis` | 6 | furious + paradox = +2 (where furious itself is barraging+paradox) | Red-IMPLICIT via parallel structure; awaits explicit Red confirmation |
| `sumo` | 5 | nuclear composition (`nuclear = paradox + atomic` per pt10) | Open Wave 3 Q7 candidate; doctrine-pending |

Plus a doctrine-pending modifier with downstream effects:

| slug | adds | base | Note |
|---|---|---|---|
| `bigwalk` | 5 | butterfly | "Surging-modified butterfly"; `surging` is doctrine-locked (`DOCTRINE_BLOCKED_SLUGS`); composition unresolved |
| `venom` | 6 | barfly | "Surging-modified barfly"; same dependency |
| `tomahawk` | 5 | whirl | description not surfaced; doctrine-pending |
| `grave-digger` | 5 | torque | doctrine-pending |
| `surreal` | 6 | whirl | doctrine-pending |
| `surgery` | 6 | rev-whirl | doctrine-pending |
| `surge` | 5 | mirage | doctrine-pending (probably surging-related) |

These do NOT get composite-expansion entries until Red rules. Tracking them here so they aren't forgotten.

---

## §4. Composite expansion policy

### §4.1 The three-layer architecture (from `SEMANTIC_COMPRESSION_DOCTRINE.md` §5)

The doctrine doc already defines three rendering layers. The composite-modifier framework slots into them as follows:

| Layer | Surface | Content for composite-modifier compounds |
|---|---|---|
| **Layer A (canonical surface)** | Dictionary card, trick title, search results | Folk / compressed name — `blurry whirl`, `food processor`. The name players use. |
| **Layer B (expanded semantic)** | First-class secondary row, trick-detail Tier 3 | Expanded structural reading — `stepping + paradox + whirl = 5 ADD`. Carve-out applies. |
| **Layer C (parser diagnostic)** | Audit script CSV, internal QC tools | Per-slug derivation classification — "composite via MODIFIER_COMPOSITIONS allowlist; not generally applicable." |

**Layer A never loses the folk name.** Players say "blurry whirl"; the dictionary should too. Expansion lives in Layer B; the parser/audit layer (C) records the policy provenance.

### §4.2 When to expand recursively

**Default: expansion stops at one stopping depth.** `blurry whirl → stepping + paradox + whirl` is one expansion step. We do NOT then expand `whirl` to `xbody(1) + dex(1) + stall(1)` in the same display — that's a deeper structural reading that lives on the trick-detail page's structural Tier 4 surface, separately curated.

`SEMANTIC_COMPRESSION_DOCTRINE.md` §6 case study for `blurry torque` shows two stopping depths (`stepping paradox torque` AND `stepping paradox miraging osis`). Both are valid Layer B readings. Publish one (the shallower stopping depth) by default; reveal the deeper depth on the trick-detail page if the curator wants.

### §4.3 When NOT to expand

- **Sui-generis folk names with no expansion policy** (e.g. `food processor` AS food processor — the folk name lives on Layer A; the structural reading `blurry blender → stepping paradox blender` is the Layer B expansion). Do not auto-expand `food processor → blender` without the structural layer.
- **Doctrine-pending composites** (nemesis, sumo, surging-*) — no Layer B expansion until Red rules.
- **Carve-out targets** — expansion fires ONLY for the four explicit slugs in MODIFIER_COMPOSITIONS. General `blurry-X` and `blurry-Y` slugs that aren't in the allowlist use blurry-as-+1.
- **Multi-stopping-depth display proliferation** — one stopping depth per Layer B card. Deeper depths belong on dedicated trick-detail surfaces.

### §4.4 The publication-policy decision tree

```
Is this a composite-modifier candidate?
├── No → not in scope; promote via standard parser path or curator review
└── Yes
    ├── Is doctrine stable for this compound?
    │   ├── No (Red ruling pending) → HOLD; no Layer B expansion; record in §3 of this doc
    │   └── Yes
    │       ├── Is the compound in the MODIFIER_COMPOSITIONS allowlist?
    │       │   ├── No → use the post-retraction +1 flat reading; standard promote
    │       │   └── Yes → publish Layer B with the expanded stack derivation;
    │       │            Layer A keeps the folk name; promote to FIRST_CLASS_TIER_2
```

---

## §5. Pilot expansions (5)

### Pilot 1. `blurry-whirl`

| Field | Value |
|---|---|
| Layer A (canonical surface) | "Blurry Whirl" (folk-compressed name) |
| Operational chain | `[set] > hippy in dex > op clipper` (whirl's chain; pending curator-published version specific to blurry-whirl) |
| Layer B (expanded reading) | `stepping paradox whirl` |
| ADD derivation | `stepping(+1) + paradox(+1) + whirl(3) = 5 ADD` |
| Family role | whirl-family compound; blurry as compressed stepping+paradox |
| Doctrine | Stable per pt8 / pt11; carve-out preserves the original derivation per Red 2026-05-20 |
| Promotable now? | **YES** — author a RESOLVED_FORMULAS_SPRINT_1 entry with the expanded stack derivation; add to FIRST_CLASS_TIER_2 |
| Expansion feels: | **Readable.** Direct stack; modifier ordering matches the workbook convention. |

### Pilot 2. `blurry-torque`

| Field | Value |
|---|---|
| Layer A | "Blurry Torque" |
| Layer B (expanded — one stopping depth) | `stepping paradox torque` |
| Layer B (deeper — second stopping depth) | `stepping paradox miraging osis` |
| ADD derivation | `stepping(+1) + paradox(+1) + torque(4) = 6 ADD` |
| Family role | torque-family compound |
| Doctrine | Stable; carve-out preserves derivation |
| Promotable now? | **YES** — same approach as blurry-whirl; the shallower stopping depth is the default Layer B reading. Deeper reading goes on the trick-detail page if the curator wants. |
| Expansion feels: | **Readable** at the shallow stopping depth. The deeper `miraging osis` reading is pedagogically rich but should not auto-display on the registry card. |

### Pilot 3. `food-processor`

| Field | Value |
|---|---|
| Layer A | "Food Processor" (sui-generis folk name; metaphorical) |
| Layer B (expanded — folk-alias step) | `blurry blender` |
| Layer B (expanded — structural step) | `stepping paradox blender` |
| Layer B (deeper) | `stepping paradox whirling osis` |
| ADD derivation | `stepping(+1) + paradox(+1) + blender(4) = 6 ADD` |
| Family role | blender-family compound; folk-name peer of "blurry blender" |
| Doctrine | Stable; carve-out preserves derivation |
| Promotable now? | **YES** — publish with the structural reading. The folk-alias step ("food processor ↔ blurry blender") is documented in the trick-detail / glossary; the registry card's Layer B carries the structural reading. |
| Expansion feels: | **Excessive if all three depths display together.** Publish stepping+paradox+blender as the default Layer B; surface "≡ blurry blender" as a folk-alias chip; reserve the deepest depth for the trick-detail page. |

### Pilot 4. `nova` *(NOT composite-modifier; included to illustrate the look-alike contrast)*

| Field | Value |
|---|---|
| Layer A | "Nova" (folk name) |
| Layer B (expanded) | `symposium double-leg-over` |
| ADD derivation | `symposium(+1) + dlo(3) = 4 ADD` |
| Family role | dlo-family compound |
| Doctrine | Stable; **NOT a composite-modifier** — ordinary single-modifier compound with a folk name |
| Promotable now? | **YES** — via notation back-fill ("SYMPOSIUM DOUBLE-LEG-OVER"), no carve-out needed. Belongs in **Wave 4 missing-notation back-fill**, not this framework. |
| Expansion feels: | **Misleading to bucket here.** Nova is folk-named, but its decomposition is mechanically derivable. This is a notation-back-fill row, not a composite-modifier row. |

### Pilot 5. `nemesis` *(doctrine-pending; included as the model for HOLD treatment)*

| Field | Value |
|---|---|
| Layer A | "Nemesis" |
| Layer B (candidate expanded reading) | `furious + paradox + mirage` (where furious = barraging + paradox) |
| ADD derivation candidate | `furious(+2) + paradox(+1) + mirage(2) = 5 ADD` ... but official = 6, so something is off |
| Doctrine | **Red-IMPLICIT via parallel structure; awaits explicit Red confirmation** |
| Promotable now? | **NO — HOLD.** Layer B not published until Red rules. Continues to render as a missing-notation row with the standard "notation pending" Layer B placeholder. |
| Expansion feels: | **Not yet justified.** Two unresolved unknowns (does furious imply barraging+paradox? does nemesis really involve furious?). |

---

## §6. Publication philosophy

### §6.1 The principle

Freestyle language **intentionally compresses** movement concepts. "Blurry whirl" is a real player word, used in real conversation, on real tournament floors. The structural reading "stepping paradox whirl" is a curator-side abstraction — accurate, useful for ADD math, but not what someone says when they stomp out the trick.

The framework therefore inverts the temptation to "always expand." Instead:

> **Folk name on Layer A. Structural reading on Layer B. Decomposition ladder on the trick-detail page.**
> **One stopping depth per layer.**
> **Folk name never disappears.**

This is consistent with the `feedback_foundational_pedagogy_priority.md` rule for atom cards: **movement intuition leads; structural decomposition is secondary.** Same principle, applied to composite-modifier compounds.

### §6.2 The four stopping-depth modes

When the curator publishes a composite-modifier compound, they implicitly pick one of four modes:

| Mode | Layer A | Layer B | Use case |
|---|---|---|---|
| **(a) Folk-only** | folk name | suppressed | Sui-generis primitive with no published expansion (`mobius` historically; `pendulum`-style sui-generis) |
| **(b) Single-depth structural** | folk name | one expanded reading | Default for the four MODIFIER_COMPOSITIONS targets; `blurry whirl → stepping paradox whirl` |
| **(c) Double-depth structural** | folk name | one expanded reading + deeper expansion link | Pedagogically rich compounds (`blurry torque → stepping paradox torque → … → stepping paradox miraging osis`) |
| **(d) Folk-alias + structural** | folk name | folk-alias chip + expanded reading | When the folk name has a recognized canonical-alias (`food processor ≡ blurry blender → stepping paradox blender`) |

The curator picks the mode per trick. The framework supports all four; defaults to (b) for the MODIFIER_COMPOSITIONS allowlist.

### §6.3 When to NOT over-expand

Five conditions where expansion should be withheld or staged:

1. **Doctrine-pending compounds** (`nemesis`, `sumo`, surging-*): no Layer B until Red rules.
2. **Single stopping depth is enough**: don't display all three depths on a registry card. Reserve deeper depths for the trick-detail page.
3. **General application** of a carve-out: the MODIFIER_COMPOSITIONS allowlist is per-trick. Applying the blurry→stepping+paradox expansion to a non-listed slug (`blurriest`) over-derives.
4. **Folk-only readings**: if a compound has no published expansion (e.g., `mobius` before its `spinning torque` reading was settled), publish folk-only and wait. Don't invent an expansion.
5. **Recursive expansion**: never expand the BASE of an already-expanded compound on the same surface. `blurry whirl → stepping paradox whirl` stops there; `whirl → xbody + dex + stall` belongs to the atom card, not the blurry-whirl card.

### §6.4 Why this preserves curator-governed flexibility

The framework is **per-trick** rather than **universal**:
- The MODIFIER_COMPOSITIONS allowlist names specific slugs.
- Each pilot expansion is decided per-slug.
- The HOLD treatment for doctrine-pending compounds is explicit and reversible.
- Layer A always preserves the folk name, so no expansion ever loses the player-facing handle.

A future Red ruling can:
- Add a new modifier to MODIFIER_COMPOSITIONS (e.g., resolve `furious = barraging + paradox` for nemesis).
- Remove a carve-out (e.g., if some future ruling re-retires blurry's stepping+paradox expansion for the four allowlisted slugs, drop those RESOLVED entries).
- Adjust a specific compound's stopping depth without affecting others.

Reversible TS content modules (`feedback_reversible_content_governance`) make all of these one-file changes.

---

## §7. Suggested next slice ("Wave 4-A: composite-modifier carve-out batch")

Strictly within this framework's scope, the next implementation slice would be:

1. Author 3 new entries in `RESOLVED_FORMULAS_SPRINT_1` for:
   - `blurry-whirl`: `stepping(+1) + paradox(+1) + whirl(3) = 5 ADD`
   - `blurry-torque`: `stepping(+1) + paradox(+1) + torque(4) = 6 ADD`
   - `food-processor`: `stepping(+1) + paradox(+1) + blender(4) = 6 ADD`
   Each provenance line cites the MODIFIER_COMPOSITIONS carve-out and the Red pt8 ratification + Red 2026-05-20 retraction (preserving original ADD for the allowlist).
2. Add the 3 slugs to `FIRST_CLASS_TIER_2`.
3. Parity test fixture + cohort entry.
4. Glossary §6 prose update (already partially there; line 812 mentions the carve-out — verify it stays accurate).
5. Build + tests + audit regen.

Expected audit impact: `missing-notation: 39 → 36`; `already first-class: 92 → 95`; cohort total 92 → 95.

**Not in this slice's scope:**
- mantis / nova / haze / assassin / blurriest — these go in a separate "Wave 4-B: missing-notation back-fill" slice using ordinary modifier+base derivation.
- nemesis / sumo / surging-* — HOLD until Red rules.

---

## §8. Cross-references

- `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md` — the 5-class taxonomy + 3-layer architecture this framework sits inside.
- `exploration/red-consolidation/RED_RESOLVED_CANON.md` — Red 2026-05-20 ruling on blurry-as-stepping-only.
- `legacy_data/scripts/build_trick_reconciliation_workbook.py` lines 962-972 — the MODIFIER_COMPOSITIONS allowlist (single source of truth for the carve-out).
- `feedback_foundational_pedagogy_priority.md` — pedagogical priority rule that informs Layer A/B authoring (movement intuition leads; structural decomposition secondary).
- `feedback_reversible_content_governance.md` — content modules are reversible TS; no SQL schema commitments until ontology stabilizes.
- `legacy_data/scripts/audit_derived_add_from_notation.py` — the read-only audit that surfaces composite-modifier candidates as `missing-notation` or `mismatch` and exposes which still need attention.

---

## §9. Posture summary

- The strict composite-modifier cohort is **3 slugs** (`blurry-whirl`, `blurry-torque`, `food-processor`), narrower than the user's prompt suggested.
- The remaining "composite-looking" rows (mantis, nova, haze, assassin, blurriest) are **missing-notation rows**, not composite-modifier rows. They belong to a separate wave.
- The composite-modifier carve-out is **per-trick**, not universal. Applying it broadly would over-derive (`blurriest` is the cited counter-example).
- The framework's expansion verbs are **doctrine-aware**: stable readings use "structurally expandable to" (Level 3); doctrine-pending readings stay at Layer A only.
- Folk names never disappear. Layer A is the player-facing handle; Layer B carries the structural reading.
- **No mass promotion until each compound clears the per-trick gate.**
