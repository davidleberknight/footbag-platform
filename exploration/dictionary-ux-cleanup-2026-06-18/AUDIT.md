# Final Dictionary UX Cleanup — audit + fixes

Beginner-comprehension polish pass on the trick-detail pages. This report lists
findings per the six audit items, marks each FIXED (applied this pass) or
REMAINING (flagged for follow-up), and records the data gaps that copy alone
cannot close.

## Fixes applied this pass

1. **Structural-fact rows now carry a one-line plain-English note** (items 1, 2).
   Each Movement system / Movement neighborhood / Modifier value renders its
   classification name followed by a tooltip-brief explanation, one fact per
   line. Sources, all human-authored where possible:
   - Movement systems: first sentence of the curator axis definition
     (`MOVEMENT_SYSTEM_AXES.axisDefinition`).
   - Movement neighborhoods: first sentence of the curator topology definition.
   - Modifiers: `src/content/freestyleStructuralFactNotes.ts` — the 13 modifiers
     with a curator feel card are paraphrased (notation jargon stripped); 9
     well-defined operators that lacked curator copy (gyro, diving, swirling,
     inspinning, miraging, whirling, tapping, sailing, railing) carry a derived
     one-liner stating only the settled mechanic, **flagged NEEDS-CURATOR** in
     the module header for confirmation.
   - Family base: no note (it is a linked trick name that explains itself on click).

2. **Jargon removed (item 4, partial):**
   - The neighborhood badge "observational" → **"exploratory"** with a plain
     tooltip ("An exploratory grouping by movement feel, not an official family
     classification"). The exploratory/canonical distinction is preserved in
     beginner language.
   - The set-uptime axis definition dropped the public name attribution
     "Red-settled" (it rendered on the By-movement-system browse view).

## Item 3 — page comprehension test (13 representative pages)

Data: JOB = resolved Execution notation present; Mods = modifier links in DB.

| Page | JOB | ADD | Family | Modifier note | Verdict |
|---|---|---|---|---|---|
| Mirage | yes | 2 | self | (base) | PASS |
| Whirl | yes | 3 | self | (base) | PASS |
| Torque | yes | 4 | Osis | (base) | PASS |
| Mobius | yes | 5 | Torque | gyro ✓ (now noted) | PASS |
| Blur | yes | 4 | Mirage | blurry ✓ | PASS |
| Symposium Mirage | yes | 3 | Mirage | symposium ✓ | PASS |
| Fairy Same Side Mirage | yes | 3 | Mirage | fairy ✓ | PASS |
| Clipper Ducking Whirl | yes | 4 | Whirl | ducking ✓ | PASS |
| Atomic Torque | yes (resolver) | 5 | Torque | atomic ✓ | PASS |
| Ripwalk | yes | 4 | Butterfly | stepping ✓ | PASS |
| Eggbeater | yes | 3 | Legover | **none — 0 modifier links** | FAIL (data) |
| Drifter | yes | 3 | Clipper Stall | none — base, 0 links | PASS (base) |
| Bling Blang | yes | 4 | Whirl | none — 0 links; **name lowercased** | FAIL (data) |

Comprehension after this pass: every page answers what / how-executed / ADD /
family / how-built above the fold, and every page WITH modifier links now
explains what those modifiers mean. The two FAIL rows are **data gaps, not copy
gaps** (below).

## Remaining gaps (flagged; not copy-fixable)

- **Folk-named compounds carry no modifier links** (eggbeater = atomic legover,
  bling-blang, etc.). The structural block correctly shows no Modifier row
  because the DB has no link, so a beginner cannot see "atomic" on eggbeater.
  Fix is a data task (populate `freestyle_trick_modifier_links` for folk-named
  compounds), not UX copy.
- **`bling-blang` renders as a lowercase slug-form name** ("bling-blang") rather
  than "Bling Blang" — a `canonical_name` casing issue in the source row.
- **9 modifier notes are NEEDS-CURATOR** (gyro, diving, swirling, inspinning,
  miraging, whirling, tapping, sailing, railing). They state the settled mechanic
  but should be curator-confirmed. The 8 frontier operators (blazing, terraging,
  surfing, floating, splicing, warping, backside, shooting) intentionally have
  no note — their mechanics are undefined, so silence beats a guess.

## Item 4 — jargon still on other public surfaces (REMAINING)

These are outside the trick-detail structural block (separate surfaces); listed
for a follow-up sweep:
- `/freestyle/glossary`: the word "observational" appears on family-card badges
  and section prose; feel-card text shown on the modifier reference still leaks
  "X-dex", the "PS X shorthand", and "Folk-shorthand for ...".
- `/freestyle/observational` (Emerging Vocabulary): "observational",
  "extrapolated" throughout — arguably acceptable on a governance/frontier page,
  but not beginner language.
- `set-detail.hbs`: "No canonical tricks currently link this set via the
  **modifier registry**." → reword to plain language.
- `trick-equivalent-readings.hbs`: a "pending" flag on curator-unconfirmed
  readings — a curator signal a beginner will not parse.

## Item 5 — consistency (trick-detail contract)

After the earlier structural pass + this one, every active canonical detail page
renders the same contract: hero (name/ADD/family chip) → notation card (Movement
→ Execution → ADD) → About → structural-fact block → wayfinding → deep reference.
No duplicated family prose (family note is anchor-page-only), no source
provenance on detail cards, no separate first-class "Notation summary" block.
Remaining inconsistency is the modifier-link data gap above (some compounds show
no Modifier row).

## Item 6 — compactness

Above the fold a reader now gets: name + ADD (hero), Execution notation, family
(hero chip + structural block), and how-it's-built (About) without scrolling;
movement intuition, equivalent readings, naming/interpretation, structural
neighbors, related families, and parser diagnostics sit below the fold. The
structural-fact notes add one muted line per fact, not paragraphs.

## Status update — jargon sweep + notation pass

Applied:
- **Feel-card jargon removed** (renders on the glossary modifier reference):
  atomic "X-dex-like" + "recent rulings (under community review)"; blurry
  "Folk-shorthand"; paradox + symposium "PS X shorthand".
- **`set-detail` "modifier registry"** empty-state reworded to plain language.
- **Equivalent-readings "pending"** flag → "not yet confirmed".
- **`sole-survivor` notation authored** (no longer INCOMPLETE): it is the exact
  structural twin of `spinning-symposium-whirl`
  (`CLIP > (back) SPIN [BOD] > (no plant while) OP IN [BOD] [DEX] > OP CLIP [XBD] [DEL]`,
  5 brackets = 5 ADD); "sole survivor" is a pun name, not a sole-surface catch
  (correcting this report's earlier hint).

Decisions / deferred:
- **`spyro` notation NOT authored.** It is a 1-ADD gyro body primitive (= a
  single `SPIN [BOD]`, per the genuphobia component), but as a STANDALONE trick
  it would terminate in `[BOD]`, for which there is no precedent (every other
  trick ends in a scored contact/delay). The bracket count is safe but the
  structure is not; it needs curator confirmation of the standalone form.
- **"observational" kept site-wide (curator decision).** The word is a defined,
  explained term across ~38 glossary instances (CSS class names, a definition
  table, family-card pedagogy). Rather than rename it, the trick-detail
  structural-block neighborhood badge was set back to "observational" to match
  the glossary's taught term.

## Modifier-link gap — fixed

The folk-named compounds now carry their modifier links, so the Modifier row
renders: `bling-blang` -> whirling (filled the empty `modifier_links` column in
its existing `red_additions` row), `eggbeater` -> atomic. eggbeater is a
curated-base trick (`noise/tricks.csv`), which had no way to declare modifiers —
loader 17 wiped all links and only `red_additions` recreated them. Rather than
misattribute eggbeater to Red, the base CSV gained a `modifier_links` column and
loader 17 now reads it (general fix for any curated-base trick). Verified: both
links present in `freestyle_trick_modifier_links`; trick-dictionary QC clean.

## Recommended follow-ups (data, not copy)

1. Title-case the `canonical_name` for slug-form rows (bling-blang).
2. Curator pass on the 9 NEEDS-CURATOR modifier notes.
3. Jargon sweep of the glossary + Emerging Vocabulary surfaces (item 4 remainder).
