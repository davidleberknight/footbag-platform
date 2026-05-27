# Glossary §10 Relocation Plan

Slice: Combo Analysis extraction (2026-05-17). Follow-on to the Coherence Cleanup Slice's `glossary_section_relocation_recommendations.md`.

## What changed since the Coherence Cleanup recommendation

The earlier Coherence Cleanup recommendation said "defer relocation until a Combo/Run Analysis page exists." The Combo Analysis slice (this slice) is the planning step that brings that page into the roadmap. Now the relocation question is concrete: **when** the move happens, **what** moves, **what stays**, and **how** inbound links rewire.

## What moves out of glossary §10

| Content | Current §10 location | Target home |
|---|---|---|
| Run-quality tier table (Tiltless / Guiltless / Tripless / Fearless / Beastly / Godly / Genuine / BOP) | §10 lines 1019–1028 | Combo Analysis surface §A (Run-quality terminology) |
| Sick3 format | Lines 33–37 of v6 implicitly; not in glossary §10 | Combo Analysis §A or `/rules/freestyle/` |
| Shred Contest (Shred:30) | §10 line 1041 | Combo Analysis §A or `/rules/freestyle/` |
| Big Trick / Sick, Big, Best | §10 line 1042 | `/rules/freestyle/` (event-format rules) |
| Circle Contest | §10 line 1043 | `/rules/freestyle/` |
| Most Rippin' Run | §10 line 1044 | `/rules/freestyle/` |
| Freestyle Routine | §10 line 1040 | `/rules/freestyle/` |

## What stays in glossary §10

| Content | Why it stays |
|---|---|
| ADD system definition itself | ADD operates at the *trick* level, not the *run* level — though run-quality tiers depend on it, ADD is glossary-level vocabulary |
| Cross-link to `/freestyle/add-analysis` | Stable inbound surface |
| The "mixed level of analysis" header note (added in Coherence Cleanup Phase 3) | Continues to acknowledge the level mismatch even as the run-quality content moves |

After the move, glossary §10 shrinks to a small section defining ADD itself + pointing at the natural homes for the relocated content.

## Inbound link audit

| Surface | Inbound to §10 | Update needed |
|---|---|---|
| `src/views/freestyle/history.hbs:85` (How Combos Grew) | `#run-quality` anchor | Update to `/freestyle/combo-analysis#run-quality` once the page exists |
| `src/views/freestyle/history.hbs:100` (Routines to Guiltless) | `#run-quality` anchor | Update to `/freestyle/combo-analysis#run-quality` once the page exists |
| `/freestyle/add-analysis` page | Refers to ADD vocabulary | Add cross-link to combo-analysis §A once it exists |
| Any external bookmarks to `/freestyle/glossary#run-quality` | Existing inbound | Add a 301 redirect from glossary `#run-quality` to combo-analysis `#run-quality` once the page exists |

## Migration sequence

Cannot relocate until the destination exists. Sequence:

1. **Pre-move:** Combo Analysis page lands at `/freestyle/combo-analysis` (or similar). Initial implementation can scaffold the four-section taxonomy from `RUN_ARCHITECTURE_GLOSSARY_PLAN.md` without the §10 content yet — empty/placeholder rows are acceptable for the first ship.

2. **Inbound link rewire:** history.hbs cross-links updated to point at `/freestyle/combo-analysis#run-quality` instead of `/freestyle/glossary#run-quality`. (Or both, transitively, with a 301 from the glossary anchor.)

3. **Move:** Run-quality table moves from §10 to combo-analysis §A.

4. **Glossary §10 trim:** §10 shrinks to ADD-system definition + cross-link to combo-analysis for run-quality detail + cross-link to `/freestyle/add-analysis` for ADD construction detail.

5. **Optional: event-format relocation:** Routine / Shred / Big Trick / Circle / Most Rippin' Run rows in §10 move to `/rules/freestyle/` if they're not already documented there.

## Phase ordering vs the live system

| Phase | Code change | Status |
|---|---|---|
| Plan combo-analysis taxonomy | none | THIS SLICE (planning docs) |
| Build combo-analysis page | new route + service + template | Future slice; awaits maintainer prioritization |
| Move §10 content + rewire links | template edits, no DB | Future slice; follows page existence |
| Retire §10's run-quality section | template trim | Future slice; follows move |

## Anti-pattern to avoid

Don't move §10 content into the combo-analysis page before the page is built. Don't leave the relocated content homeless. Don't create a second page that competes with `/freestyle/add-analysis` for the ADD-system definition territory — combo-analysis covers run-architecture, not ADD construction.

## Cross-references

- Coherence Cleanup Slice's `glossary_section_relocation_recommendations.md` — predecessor doc; this plan supersedes its "defer" recommendation
- `RUN_ARCHITECTURE_GLOSSARY_PLAN.md` — the target taxonomy
- `proposed_combo_analysis_page_structure.md` — the destination page
