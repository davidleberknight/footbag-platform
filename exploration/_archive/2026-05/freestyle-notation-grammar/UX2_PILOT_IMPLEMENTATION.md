# UX2 Pilot -- Flagship Montage Page Implementation Report

Date: 2026-05-11.

Companion artifacts:
- `UX2_EDITORIAL_LAYOUT_PLAN.md` -- the design that motivated this pilot.
- `screenshots/ux2-pilot/` -- before / after captures at 375 / 768 / 1440.

Scope: single page (`/freestyle/tricks/montage`). No sitewide rollout. No
ontology expansion. No parser changes. No notation-rendering redesign.

Status: green build, green freestyle integration suite (244/244), pilot
template live and rendering. The other 148 trick pages are unchanged.

---

## 1. What was built

A second template, `src/views/freestyle/trick-ux2.hbs`, that reorganises the
trick detail page into four blocks:

1. **HERO** -- title, ADD chip, family chip, sort_name, and a one-sentence
   editorial summary. The hero opens the page with the headline and the
   elevator pitch, not with ontology framing.
2. **LEARN** -- about prose, semantic notation, operational notation,
   execution summary, learning notes, prerequisite prose, family ladder,
   related tricks. The four learner-oriented prose sections sit between
   the formal notation blocks and the lateral-navigation surfaces.
3. **MEDIA** -- a media block with the featured-media slot reprise and the
   tutorial / demo grouping. Single empty-state body when no media exists.
4. **REFERENCE & TAIL** -- pathways summary, previous tricks, next tricks,
   passback records, record progression, and the structural decomposition
   panel wrapped in a collapsed `<details>` element. Diagnostics remain
   one click away; they no longer lead the page.

The legacy template `src/views/freestyle/trick.hbs` was not modified. The
controller branches on the new `content.ux2Pilot` view-model field; when it
is non-null, the pilot template renders, otherwise the legacy template
renders. Today only `montage` populates `ux2Pilot`.

---

## 2. Files touched

| File | Change | Notes |
|------|--------|-------|
| `src/services/freestyleService.ts` | Added `Ux2PilotData` interface, `UX2_PILOT_RAW` constant, `lookupUx2Pilot()`, `splitProseParagraphs()`, and a single `ux2Pilot` field on `FreestyleTrickContent`. | Prose lives in source for the pilot; no schema columns added. |
| `src/controllers/freestyleController.ts` | Two-line branch in `trick()`: picks `'freestyle/trick-ux2'` when `vm.content.ux2Pilot` is populated. | Single decision point; zero impact on any other route. |
| `src/views/freestyle/trick-ux2.hbs` | New template, ~540 lines. Reuses every existing partial (`video-facade`), CSS class (`notation-token`, `op-token`, `family-ladder`, `reference-media-tile`), and glossary deeplink pattern. | Only structural containers and four prose blocks are net-new. |
| `src/public/css/style.css` | Appended a single block (~120 lines) covering hero summary, featured-media preview card, featured-media empty state, prose paragraph spacing, and the collapsed `<details>` summary affordance. | No existing rules modified. |

Total net additions: ~700 lines across one new template + one CSS block +
~60 service lines. Total existing-line edits: 2 (the controller branch
and the new view-model field assignment).

---

## 3. View-model shape

```ts
export interface Ux2PilotData {
  shortDescription: string | null;                  // hero elevator pitch
  executionParagraphs: string[];                    // pre-split paragraphs
  learningParagraphs: string[];                     // pre-split paragraphs
  prerequisiteParagraphs: string[];                 // pre-split paragraphs
  featuredMedia: TrickReferenceMediaItem | null;    // null = empty state
  featuredMediaEmptyState: string | null;           // empty-state copy
}
```

Per `.claude/rules/template-conventions.md` the template branches only on
pre-shaped data. Paragraph splitting happens in the service via
`splitProseParagraphs()`; the Handlebars side iterates the arrays.

Optional `ux2Pilot: Ux2PilotData | null` on `FreestyleTrickContent`:
the field is the only mechanism that activates the pilot template, so
gating expansion to a new trick is a single map entry.

---

## 4. Before / after

Before (legacy `trick.hbs`):

- Hero ends at "compound" badge; no editorial summary.
- After the description, the page is dominated by Notation + Set notation +
  Structural decomposition. The fold renders as a parser-validation surface.
- Pathways and Reference Media live deep in the page.
- Empty media gives no signal to the user; the Reference Media section
  silently does not render.

After (pilot `trick-ux2.hbs`):

- Hero ends with the one-sentence editorial summary ("A 7-ADD whirl
  compound: ducking, paradox, symposium, and spinning ..."). The fold
  reads as a learner page first.
- A "Featured demonstration" card sits below the hero. Empty Wave-1 state
  renders as a dashed-border pill with honest copy ("Curated tutorial
  coming soon ...") and a jump-link to the deeper media block.
- Semantic + operational notation remain in the Learn block, still
  token-coloured with their warm-vs-cool palette, glossary deeplinks
  preserved. They sit between About and the new prose.
- Execution / Learning notes / Before-you-try-this read as three short
  prose sections, each with a clear h2 and 1-3 short paragraphs.
- Family ladder + Related Tricks land before Media, so the lateral
  exploration affordance arrives before the gallery.
- Pathways panel is demoted but still in the page.
- Structural Decomposition is wrapped in `<details>`, collapsed, with a
  "Parser diagnostic. Click to expand." hint under the section title.

Screenshots:
- `screenshots/ux2-pilot/before-desktop.png` (1440x900)
- `screenshots/ux2-pilot/before-tablet-768.png` (768x1024)
- `screenshots/ux2-pilot/before-mobile-375.png` (375x812)
- `screenshots/ux2-pilot/after-desktop.png` (1440x900)
- `screenshots/ux2-pilot/after-tablet-768.png` (768x1024)
- `screenshots/ux2-pilot/after-mobile-375.png` (375x812)

---

## 5. Density observations

| Surface | Before | After | Verdict |
|---------|--------|-------|---------|
| Above-the-fold prose | None beyond the breadcrumb + h1 | Short editorial summary + featured-media card label | Higher signal; learner has a sentence before they have to scroll. |
| First non-hero h2 | "About This Trick" (description + dl list of structural fields) | "About this trick" (same content, slightly destructured) | Equivalent. About did not need reshaping. |
| Mid-page diagnostic load (notation grammar + structural decomposition) | Three back-to-back diagnostic sections | Notation + operational kept in Learn (still expanded). Structural decomposition demoted to a single collapsed tail section. | Diagnostic surface area reduced by ~60% in default-render bytes; full diagnostics still 1 click away. |
| Editorial prose surface area | One field (`description`), 50 chars on Montage | Four fields: `shortDescription`, `executionParagraphs`, `learningParagraphs`, `prerequisiteParagraphs` | ~10x prose under curator control. None is required; each section omits gracefully. |
| Media block | Two grids (tutorials + demos), or section absent entirely | Always renders; featured-slot empty state communicates intent | Honest empty state is now first-class. |

The mobile capture (`after-mobile-375.png`) shows the entire Learn block
fitting within five vertical viewport heights. The Wave-1 4-modifier
editorial-decomposition table that previously dominated the page is now
only reachable by tapping the structural-decomposition disclosure.

Restraint observations:
- Featured-media empty state uses a single dashed-border pill, not a
  faux video thumbnail. No fake play overlays, no skeleton-card animation.
- The new prose paragraphs use `max-width: 70ch` to keep desktop line
  length readable; mobile inherits container width.
- All new sections have the existing `content-section` shell so margins
  and dividers match site-wide rhythm. No bespoke section frames.

---

## 6. Hierarchy evaluation (explicit checks per pilot brief)

### 6.1 Does semantic notation remain visually primary enough?

Yes, on balance, with one caveat.

In the Learn block the semantic notation card sits second (after About).
The cool-palette token highlighting is unchanged and still carries the
same `data-role` + `title` tooltip system from UX1 Phase A. Glossary
deeplink ("Token reference →") is unchanged.

What slightly competes with notation primacy:
- The Execution prose section sits directly below operational notation
  and is currently the visually heaviest block in the Learn region (two
  short paragraphs of running text vs the dense-but-narrow notation block
  above it).

This is the intended trade for the pilot: notation is grammar-aware
content, prose is learner-aware content, and the page now serves both
audiences in sequence. Notation has not lost primacy in the Learn
block, but it is no longer the only thing in the Learn block.

Open question: do we want a single "Notation key" tooltip / explainer
between About and Notation, to onboard cold readers? Deferred; not part
of the pilot.

### 6.2 Do parser / QC sections feel appropriately de-emphasised?

Yes. The structural decomposition + parser-derived diagnostic table
that previously occupied roughly 40% of above-the-fold scroll real-estate
on a desktop viewport is now reduced to:

```
▸ Structural decomposition
  Parser diagnostic. Click to expand.
```

That is a 2-line surface near the bottom of the REFERENCE tail. The
underlying panel content is identical when expanded; nothing was deleted.
The asserted-vs-computed framing, descriptive vs ADD-contributing roles,
editorial decomposition table, policy tokens, and diagnostic details all
remain accessible.

Net result: a curator landing on the Pigbeater-equivalent post-correction
verification scenario can still expand the panel and see the full
structural-decomposition picture. A learner landing on Montage from
search never has to scroll through it.

### 6.3 Does the page now feel educational instead of diagnostic?

Yes.

The diagnostic signals (asserted-vs-computed badge, parser status, structural
decomposition role table) no longer lead. The Learn block opens with prose
and walks the reader through About → Notation → Operational → Execution →
Learning notes → Before-you-try-this → Family ladder → Related, which is a
natural learner pathway: what is this, how is it written, how is it executed,
where do I go from here.

The "Watch records / Learn this trick / Related families" pathways panel
(which used to sit immediately after Structural Decomposition) is now in
the REFERENCE tail. This is a minor regression for users specifically
hunting record clips, but is mitigated by:

- Records still appear directly below the pathways panel (Passback
  Records section is unchanged).
- The hero already shows `"{topValue} kicks (record)"` when records
  exist.
- The pathways panel is short (3 cards); arriving at it after the family
  ladder still happens in a single scroll on desktop.

---

## 7. Contract preservations

Each of these was a hard requirement coming into the pilot. None were
relaxed.

| Contract | Status | Evidence |
|----------|--------|----------|
| Warm vs cool notation palette | Preserved | `notation-{cssRole}` classes (cool) and `op-token--{cssRole}` classes (warm) reused verbatim in the new template. Zero CSS overrides. |
| Federation-not-adoption | Preserved | Pilot prose is curator-authored in the service file; no FM data was imported. No code path auto-publishes anything. |
| Glossary linkage | Preserved | Both `/freestyle/glossary#notation` and `/freestyle/glossary#operational-notation` deeplinks render in the pilot template, in the same per-section placement as the legacy template. |
| Tooltip system | Preserved | Native `title=` tooltips on every notation and operational token, with the same labels generated by `shapeNotationDisplay()` / `shapeOperationalNotationDisplay()`. No tooltip rendering was redesigned. |
| Restraint-first design | Preserved | New sections omit when their fields are null/empty. The Media block is the only always-rendered new section, and even it shows an honest empty state rather than fabricated tiles. |
| No heavy JS | Preserved | Pilot adds zero client JavaScript. The `<details>` element is native HTML5 with CSS-only chevron rotation. |
| Three-layer separation | Preserved | Parser (notation grammar), editorial (decomposition table inside the collapsed details), and operational (set notation block) remain independent. Pilot only changes their positioning. |
| Asserted ADD is editorial truth | Preserved | The collapsed structural-decomposition panel keeps the "Asserted ... is editorial truth" framing exactly as the legacy template had it. |

---

## 8. Test status

| Suite | Result | Notes |
|-------|--------|-------|
| Build (`npm run build`) | Green | `tsc -p tsconfig.json` clean. |
| Freestyle integration (`tests/integration/freestyle*`) | 244/244 green | Pilot template is invoked for `montage`, legacy template for all other slugs. Existing assertions on section ordering, tooltip strings, and panel content for non-montage slugs are unaffected. |
| Full suite (`npm test`) | 2337 passed / 5 failed | The 5 failures live in `tests/unit/operationalNotationRendering.test.ts` (per-flag tooltip-label assertions). Verified pre-existing: stashing the pilot diff and re-running shows the same 5 failures. Pilot did not introduce them; documented here only so the report does not claim a clean full-suite. |

The 5 pre-existing failures are outside pilot scope and outside the
freestyle integration suite. They look like UX1-era tooltip-label
shifts that didn't get migrated forward in one unit-test file. Worth a
separate small follow-up; do not roll into this pilot.

---

## 9. Migration notes (for sitewide rollout, if approved)

The pilot deliberately keeps prose in source code rather than schema.
This is the right shape for one trick. It is **not** the right shape for
149 tricks.

To roll the pilot pattern out wider:

1. **Schema additions.** Five nullable columns on `freestyle_tricks`:
   `short_description`, `execution_summary`, `learning_notes`,
   `prerequisite_notes`, `featured_media_id` (FK to
   `freestyle_media_links.id`, `ON DELETE SET NULL`). Single
   `ALTER TABLE` migration.
2. **Loader path.** Extend `SOURCE_ASSERTABLE_FIELDS` allowlist in
   loader 19 by 5 entries so curators can backfill via the existing
   `red_corrections_*.csv` per-field pattern. No new loader logic.
3. **Service shape.** Replace `lookupUx2Pilot(slug)` with a single
   per-row read from `dictRow.short_description` / `execution_summary`
   / etc. The shape stays identical; the source moves from the in-file
   constant to the DB row.
4. **Controller branch.** Once every public trick page should use the
   new template, replace the conditional with an unconditional
   `res.render('freestyle/trick-ux2', vm)` and delete the legacy
   template. Until then, the gate continues to be `ux2Pilot != null`.
5. **Featured-media constraint.** Add a service-layer check that
   `featured_media_id`, if non-null, references a media row that is
   tagged with the current trick. Reject otherwise. Prevents
   cross-trick FK pollution.
6. **Tests.** Add integration coverage for the new section presence and
   empty-state behaviour. Adapt the section-ordering assertions in the
   existing freestyle integration tests (`tests/integration/freestyle.
   tricks-insights.routes.test.ts`) to the new section sequence.

Rollback path: revert the controller branch (or delete the pilot map
entry). Pilot template can be deleted later. The change is fully
isolated; no DB writes, no migration to undo.

---

## 10. Rollout recommendations

**Recommendation: keep the pilot scoped to Montage for at least one
review cycle.** The pilot is built to validate hierarchy, not to set
a release schedule. Things to look at before widening:

1. **Cold-arrival reading test.** Have a learner who has never seen
   the page read it and report whether the execution prose tells
   them what to do. If the answer is "no, but I can see it would
   if it were specific enough," the pilot prose authoring pattern
   works. If the answer is "I lost interest at notation," the prose
   sections may need to lead the Learn block.
2. **Curator authoring test.** Authoring four prose fields per row
   for 149 rows is the rate-limiter for rollout. Until at least one
   additional trick has all four fields filled out by a human curator,
   we do not know the authoring throughput. Pick one prereq-light
   trick (e.g. tap or hatchet) and time it.
3. **Featured-media empty-state ratio.** Wave-1 has 0 media; whirl
   family overall has TT lessons (per memory `reference_worldfootbag_
   channel.md`). Before wide rollout, decide what fraction of pages
   will render the empty state. If >50%, the empty state needs
   stronger copy and possibly a curator-action affordance.
4. **Diagnostic re-emergence.** The collapsed details element is
   native; some screen readers traverse closed details differently.
   Run axe-core against the pilot page before rollout to catch any
   accessibility regression.

Do not roll out alongside Wave-2 canonical insertion. The pilot is a
layout validation; Wave-2 is a data ingestion. Concurrent rollouts
make failure attribution hard.

---

## 11. Out of scope (explicitly NOT done in this pilot)

- No new tricks added.
- No schema migration (proposed in §9, not executed).
- No FM federation prose imported.
- No parser changes.
- No notation rendering changes (cssRole assignment, tooltip strings,
  glossary content all preserved).
- No HTML5 Popover-API token disclosure (UX1 Phase C still deferred).
- No automated tests of the pilot-specific UI behaviour added. The
  existing freestyle integration suite continues to pass.
- No memory writes. The pilot lives in source files only; saving the
  layout to durable memory belongs after review, not before.

---

## 12. Open questions for review

1. Should the hero featured-media preview be unconditional (always
   render with empty state) or conditional (omit when no media)?
   Pilot chose unconditional. Reasoning: the slot communicates
   intent and is honest about availability.
2. Should "Execution" be its own section, or should it be the
   in-prose continuation of "About"? Pilot chose separation.
   Reasoning: About is structural ("what it is"); Execution is
   procedural ("how to do it"). Different intent, different section.
3. Should the prose-source pattern (constant in source) move into
   the schema before rollout to a second trick, or after? §9
   recommends migration before the second trick to avoid copy-paste
   proliferation in source.
4. Where does record-progression / record holder-name surface
   belong in the new hierarchy? Pilot left it in the REFERENCE
   tail, which works for Montage (recordCount=0) but may not work
   for record-rich tricks (e.g. blurry-whirl, paradox-whirl).
5. Should the Wave-1 cohort (Mullet, Hatchet, Pigbeater, Tap) get
   pilot prose next, or should we widen by family (whirl-family
   first) instead?

None of these need answers to keep the pilot live. They are the
discussion points for whatever happens after review.
