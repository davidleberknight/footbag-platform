# Freestyle History — Public-Facing Condensed Adaptation

Slice: Historical Evolution Refresh (2026-05-17). Drafted for `/freestyle/history`. Not yet implemented; this is editorial source material for a future template/service update.

## Intent

Replace or augment the existing `/freestyle/history` content with a tighter, more visual, more narrative version. The current page reads well but predates major conceptual developments — movement-language framing, formula accountability, decomposition pedagogy, the ADD-analysis page, the developing combo-analysis surface. This condensed adaptation positions history as the *editorial layer* over the platform's structural surfaces.

**Length target:** ~800-1200 words (current page is ~600). The increase is mostly framing prose; the new page should *feel* tighter because of better section partitioning and the removal of statistical tables (they live in the v7 long-form report).

**What this is NOT:** A research paper. The full v7 evolution report carries the statistical detail. This is the *narrative* that an interested freestyler reads after watching a few demonstrations.

---

## Proposed page structure

### Hero (existing)

Keep the existing hero/intro media panel. Same structure.

### §1 — The Two-Phase Story (new opening; replaces standalone "Competitive Eras")

Single short opening section. ~150 words.

> Freestyle footbag has two distinct histories. The first is **vocabulary building** — roughly 1985 to 2008, the years in which the named tricks, the family structures, and the modifier conventions were established by a generation of innovators. The second is **vocabulary maturation** — 2008 to today, the years in which that vocabulary was deepened, recombined, and pushed against the limits of human biomechanics, without fundamentally new trick structures emerging.
>
> The competitive sport reflects both phases. Early-era players invented the language; modern-era players write longer, more layered sentences in it. The ADD scoring system encodes the difficulty of those sentences additively — a base trick's value plus the value of each modifier layered on top. Today's ADD-22 sequences and modern modifier-stacking architectures are the natural extensions of structures that took three decades to build.

### §2 — Competitive Eras (existing, condensed)

Keep the 5-era timeline, but trim each era's prose by ~30%. The era cards remain; the descriptions get tighter. Keep the keyFigures lists.

### §3 — Pioneers (existing, with profileHref enhancement)

Keep the founders & pioneers table. **Add service-side profileHref population** so HoF/BAP names link to their profile pages — currently most rows render as plain text. This is a service change documented in `history_drift_audit.md` (Coherence Cleanup Slice).

Optional: add a 1-sentence intro that names the *contribution* the pioneer cohort made — they built the trick vocabulary that today's analysis surfaces describe.

### §4 — The ADD System (existing, refreshed)

Refresh the existing "ADD System" section. Current cross-link to `/freestyle/add-analysis` is strong; keep it. Add one new sentence acknowledging ADD as *additive structural accounting* rather than holistic judgment:

> ADD treats a trick as a decomposable structure. The system assigns a weight to each base trick and to each modifier; the total is the sum. This isn't just a scoring convention — it's the same logic that lets the dictionary describe a compound trick like mobius as "gyro torque" and have the ADD add up the same way (4 + 1 = 5).

Cross-link to `/freestyle/add-analysis` for the worked examples and discrepancy cases.

### §5 — How Combos Grew (existing, with combo-analysis cross-link)

Keep the "How Combos Grew" + "From Routines to Guiltless" content but add cross-links to the future `/freestyle/combo-analysis` surface (or current planning docs if the surface hasn't shipped) for the technical vocabulary (setup tricks, resolution tricks, launch nodes, recovery patterns, etc.).

> The vocabulary players use to talk about combos — *setup tricks*, *resolution tricks*, *recovery patterns*, *concentration vs breadth* — emerged from this period as players started to think about runs structurally rather than as random collections of hard tricks. See [Combo & Run Architecture](/freestyle/combo-analysis) for the formal taxonomy.

### §6 — Geographic Shift (existing, condensed)

Keep the existing prose. Cross-link to `/freestyle/competition` remains valid.

### §7 — Modern Era + Movement-Language Maturation (existing + new framing)

Refresh the "Modern Game" section. Current prose stands. **Add** one short new section after it acknowledging the formal-vocabulary work:

> ### Movement Language as the Modern Vocabulary
>
> The competitive sport's evolution has been mirrored by the maturation of its *vocabulary*. Today freestyle is documented across four formal layers: the **canonical** trick dictionary (which tricks exist and what their ADD values are), the **educational** glossary (what each trick means and how it relates to others), the **symbolic** layer of named compounds and equivalence chains (`mobius = gyro torque`), and the **operational** notation that compresses a trick to its structural skeleton (`paradox = CLIP > OP IN [DEX]`).
>
> These layers describe the same sport at different levels of analysis — a movement that was originally inherited as kinesthetic practice and is now legible to readers who weren't present when it was being built. The continued refinement of this language is its own form of evolution.

### §8 — Source note (existing, refreshed)

Keep the existing source note. Add a sentence pointing to the full v7 report.

> Based on analysis of 774 documented competitive events (1980–2026) and 395 Sick3 format sequences. Player descriptions draw from competition records and community documentation. For the full statistical report with player tables, year-by-year ADD progression, and network analysis, see the [Freestyle Evolution Report](TBD link or path).

---

## What's removed from the existing page

- Nothing explicitly removed; existing structure is preserved
- Some prose tightening throughout (estimated -20% to -30% per existing section)
- Some run-quality terminology references redirect to `/freestyle/combo-analysis` once that surface exists (currently the references still point at glossary `#run-quality`)

## What's added

- §1 two-phase opening framing
- §4 additive-structural-accounting sentence
- §5 combo-analysis cross-link
- §7 movement-language maturation sub-section
- §8 v7 report cross-link
- profileHref population on pioneers (service-side; not template content)

## What's deferred

- Editorial review by maintainer is required before any of this prose ships
- The combo-analysis cross-link in §5 only works once `/freestyle/combo-analysis` exists; until then it's a forward reference
- The v7 long-form report cross-link in §8 needs a stable URL or download path

## Implementation cost estimate

When a future slice ships this:
- Service: 1-2 new content array fields on `FreestyleHistoryContent`
- Template: ~30 lines changed in `history.hbs` (mostly additive)
- Tests: 4-6 new specs for the new sections
- profileHref service-side fill is a separate sub-task

Estimated effort: small, similar to the ADD Analysis page Phase 1.

## Cross-references

- `FREESTYLE_EVOLUTION_REPORT_v7.md` — the long-form source
- `history_drift_audit.md` (Coherence Cleanup Slice) — the prior audit identifying drift items
- `history_rewrite_recommendations.md` (Coherence Cleanup Slice) — the prior tier A/B/C analysis (this condensed adaptation is closer to Tier B mid-scope addition)
- `proposed_combo_analysis_page_structure.md` — the page §5 cross-links to
