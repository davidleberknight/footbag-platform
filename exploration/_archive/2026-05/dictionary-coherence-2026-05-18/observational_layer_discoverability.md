# Observational Layer Discoverability

Covers brief Part 1.5 (Observed Tricks / External Ecosystem) and the
standalone audit of the observational layer's public surface.

Supports `FINAL_RECOMMENDATION.md` cross-cutting recommendation CR-2.

This doc audits the current `/freestyle/observational` surface, its
isolation from canonical browse, the discoverability gap the brief
identifies, and the recommended landing-card pathway. Foundational
constraint: the observational layer never inlines into canonical
browse surfaces, regardless of how prominently we want to surface its
existence.

---

## 1. Where Observed sits in the ontology

Per the ontology disambiguation in `FINAL_RECOMMENDATION.md`, four
surfaces are NOT interchangeable:

| Surface | Meaning | Layer |
|---|---|---|
| **Family** | Canonical derivative lineage | Canonical |
| **Movement System** | Operator / mechanical grammar | Canonical |
| **Neighborhoods** | Embodied movement similarity | Observational |
| **Observed** | Externally seen, not yet canonized | Observational |

**Observed** is the surface this doc concerns. It answers: what does
the external ecosystem name that we haven't formally adopted? It is
provenance-anchored (PassBack, FM, TT lessons, Shred Global, Footbag
Finland), STATUS-bucketed (pending-review, pending-canonicalization,
rejected), and curator-paced (every promotion requires explicit
curator action).

Skill doctrine A is explicit: layers may LINK, layers must NOT
COLLAPSE. Observed entries surface their existence, attribute their
source, and stage for canonical review -- they never appear as
canonical without a curator-authored promotion.

---

## 2. Current state

### 2.1. Surface and routing

- Route: `/freestyle/observational` (`src/routes/publicRoutes.ts:61`).
- Controller method: `freestyleController.observational()`.
- Service method: `freestyleService.getObservationalLayerPage()`.
- Template: `src/views/freestyle/observational.hbs`.
- Content source: `src/content/freestyleObservationalTricks.ts`
  (`OBSERVATIONAL_TRICKS` content module). DB-FREE; curator-authored
  TypeScript only.

### 2.2. Status buckets

Three buckets in the content module:

| Bucket | Meaning | Curator action |
|---|---|---|
| `pending-review` | Surfaced; not yet evaluated | Curator triages; may promote, defer, or reject |
| `pending-canonicalization` | Reviewed; promotion candidate | Curator authors canonical entry; observational row retires when promotion lands |
| `rejected` | Reviewed; will not be canonized | Stays observational permanently as a "name we encountered but don't recognize" data point |

### 2.3. Attribution

Each observational entry carries source attribution:

- PassBack
- FootbagMoves (not yet loaded; staged for future ingestion)
- Shred Global
- Footbag Finland
- TT lessons
- Other expert sources as they come online

Source-attributed display is a feature, not a leak: the user sees
"this trick name appears in PassBack's tutorial set but hasn't been
formally adopted yet."

### 2.4. Isolation invariant (already enforced)

Per recon: "Only `/freestyle/observational` exposes observational
data; no leakage to `/freestyle/tricks` or other canonical surfaces."

Concrete: the public queries on `freestyle_tricks` filter
`is_active=1` (`src/db/db.ts` -- `freestyleTricks.listAll`,
`getBySlug`, `listByFamily`). Pending and external-only rows are
filtered out of canonical browse by design. Observational entries
live in a content module, not in `freestyle_tricks` at all, so they
cannot leak through the DB layer regardless.

### 2.5. Affordances PRESENT

- Source attribution per entry.
- Status bucket per entry.
- Curator-authored placeholder note explaining why an entry is
  observational (e.g. "named in PassBack tutorial #X; awaiting
  curator-authored decomposition").

### 2.6. Affordances ABSENT (by design)

- Hashtag chips.
- Trick-detail pages (`/freestyle/tricks/:slug` never resolves for an
  observational entry).
- Canonical promotion buttons / forms.
- Inline tagging into family / movement-system browse views.

These absences are correct. They encode the observational-vs-canonical
separation. Any future change that introduces them must be evaluated
against doctrine A.

---

## 3. The discoverability gap

The brief identifies the problem precisely: "THIS IS CURRENTLY MISSING
FROM PUBLIC DISCOVERABILITY." Recon validates:

- `/freestyle` section landing -- does not link to
  `/freestyle/observational`.
- `/freestyle/tricks` browse surface -- does not link to
  `/freestyle/observational`.
- `/freestyle/glossary` -- references the observational concept in
  prose but does not deep-link.
- Navigation menus (header, footer, breadcrumbs) -- no entry.

Net: a user arrives at `/freestyle/observational` only via a direct
URL, a search engine, or the existing memory of where it lives. New
visitors do not find it.

The surface is high-value (it's the honest representation of
"everything the dictionary doesn't claim yet") and currently invisible.

---

## 4. Options considered

### Option A: Leave `/freestyle/observational` undiscoverable

REJECTED. The brief is explicit; the value of the surface is
unrealized without discovery.

### Option B: Inline observational entries into `/freestyle/tricks`
browse views

REJECTED. Violates doctrine A (layers must not collapse). Violates
the existing isolation invariant. Would require either:

- Mixing canonical + observational rows on browse views, which makes
  the canonical claim of each row ambiguous.
- A status badge per row, which is implementation language leaked
  to public.

Either is unacceptable. The brief's preferred framing -- "Observed
Tricks" -- explicitly positions the surface as parallel to canonical,
not embedded within it.

### Option C: Add observational entries to family browse view filtered
by attribution source

REJECTED. Same doctrine A violation; same UX confusion. A user
filtering "Show observational from PassBack within whirl family"
combines canonical (family) and observational (source) in a way that
implies a canonical claim ("these are observational whirl-family
tricks") which we cannot defend.

### Option D: Rename `/freestyle/observational` to
`/freestyle/tricks/observed`

REJECTED. Locked at session-level. The existing route + page title +
h1 stay unchanged. "Observed Tricks" is a discoverability label, not
a rename target.

### Option E: Add a landing-card pathway from `/freestyle/tricks`

RECOMMENDED. Locked CR-2. Specific implementation per
`dictionary_landing_page_plan.md` Card 5:

- Landing surface (CR-1) carries an "Observed Tricks" card.
- Card body explains: "Tricks named in tutorials, records, and other
  ecosystems that haven't yet entered canonical review."
- Card carries an `.observational-badge` chip (small, single-color,
  no decoration) -- visually distinguishes from canonical browse
  cards.
- Card href: `/freestyle/observational`.
- Existing surface unchanged.

### Option F: Add a header/footer link to `/freestyle/observational`

PARTIAL. The landing card (Option E) is the primary discoverability
path. A header nav entry is over-prominent given that observational is
auxiliary; a footer entry is acceptable if other freestyle subsection
footer links exist. Recommend: defer the footer decision to the
freestyle-public-coherence wave's footer audit.

---

## 5. Recommended approach

### 5.1. Primary path: landing-card pathway

Per CR-2 + `dictionary_landing_page_plan.md` §2.3 Card 5:

- Card 5 on the new `/freestyle/tricks` landing surface.
- Title: "Observed Tricks".
- Subtitle: "Community-observed, staged before canonical promotion".
- Body: "Tricks named in tutorials, records, and other ecosystems that
  haven't yet entered canonical review. Curated for transparency."
- Use-when: "When you've heard a name we haven't formally adopted
  yet."
- Observational badge: yes.
- Href: `/freestyle/observational` (unchanged route).

### 5.2. Preserve all current affordances

- Route stays `/freestyle/observational`.
- Page title stays whatever it currently is (recon did not capture
  the exact string; curator may revise but the slice does not require
  a rename).
- Status buckets stay (`pending-review`, `pending-canonicalization`,
  `rejected`).
- Source attribution stays.
- Content module (`freestyleObservationalTricks.ts`) stays the source
  of truth.

### 5.3. Add an inbound link FROM `/freestyle/observational` BACK to
the dictionary

Reciprocal navigation: the observational page should carry a
"Browse canonical tricks instead" link back to `/freestyle/tricks`
(landing) at the page header or footer. Round-trip discoverability
costs nothing and helps users who arrive at observational from search.

### 5.4. Surface count on landing

The landing stat row (per landing-page-plan §2.2) carries the
observational count as a chip. This is sufficient prominence; the
landing card carries the click-through path.

### 5.5. Status-bucket presentation

Existing presentation is correct. The three buckets
(`pending-review`, `pending-canonicalization`, `rejected`) render with
status-explanatory copy per bucket. No change recommended.

One curator decision point: whether `rejected` entries stay visible
indefinitely or fade out after a curator-set retention period.
Recommend: keep visible. The "we encountered this name and decided
against it" data point has lasting value for users who hear the name
elsewhere.

---

## 6. Implementation sketch

Most of the work lands in the landing-page slice (doc 3); this doc's
implementation footprint is minimal.

### 6.1. Within the landing-page slice

- Card 5 entry in `freestyleDictionaryLanding.ts` content module.
- `.observational-badge` CSS rule (shared with Card 4 / Movement
  Neighborhoods).
- Integration test asserting Card 5 renders + carries badge + hrefs to
  `/freestyle/observational`.

### 6.2. Within this slice (independent)

- Add "Browse canonical tricks" link from `/freestyle/observational`
  back to `/freestyle/tricks` (one-line template change in
  `observational.hbs`).
- No service change.
- No content-module change.

### 6.3. Optional: structured affordance for "promote this entry"

OUT OF SCOPE. Promotion is a curator action; it happens by editing
the content module (remove the observational entry) plus authoring a
canonical row in `tricks.csv` / `red_additions_2026_04_20.csv`. No
public-surface affordance.

---

## 7. Curator decision points

- **(DECIDED at session-level)** Surface name: "Observed Tricks";
  current route + h1 unchanged.
- **(DECIDED at session-level)** No inline observational rows in
  canonical browse views.
- **(DEFER)** Whether to add a footer entry to navigation. Recommend
  defer.
- **(DEFER)** Whether `rejected` entries fade out after a retention
  period. Recommend keep visible.
- **(DEFER)** Final card body copy (preliminary version in landing
  plan §2.3 Card 5).
- **(DEFER)** Whether to add a `last reviewed` timestamp to each
  observational entry. Out of scope; potential future enhancement.

---

## 8. Risks and mitigations

### 8.1. Risk: Observational entries get promoted accidentally

Mitigation: promotion requires a curator-authored canonical row in
the source CSVs + removal of the observational entry from the content
module. No automation; no UI affordance. The structural barrier is
maintained.

### 8.2. Risk: User confused by canonical vs observational

Mitigation: the observational badge on Card 5 + the body copy ("not
yet adopted") + the destination page's status buckets + source
attribution. Multiple labels at multiple points; the absence of
canonical claim is visible at every level.

### 8.3. Risk: Source attribution feels like endorsement

Mitigation: the page explicitly frames each source as "where we saw
this name", not "what this trick is". Attribution = provenance, not
authority. Phrasing in observational page copy should reinforce this;
recommend curator review existing wording.

### 8.4. Risk: PassBack / FM volume swamps the observational list

Mitigation: the content module is curator-paced. Bulk ingestion (the
brief's deferred "broader footbagmoves.com ingestion") is explicitly
out of scope per the slice's DO-NOT constraints. The observational
list grows at curator pace.

If the list eventually becomes unwieldy, future iteration may add
sub-grouping (by source, by status, by suspected canonical family).
Not for this slice.

### 8.5. Risk: User clicks an observational entry expecting a detail
page

Mitigation: observational entries do not link to
`/freestyle/tricks/:slug`. The page renders entries as cards with
status + source + placeholder note, NO outbound trick-detail link.
This is the doctrine A separation in concrete form.

If the curator wants to add an outbound "tutorial source" link per
entry (e.g. linking to the YouTube video where PassBack uses the
name), that's a separate enhancement; out of scope here.

### 8.6. Risk: Skill doctrine A violation via gradual feature creep

Mitigation: this doc + skill doctrine + the existing isolation
invariant in `db.ts` form a three-layer defense. Future slices
proposing observational-to-canonical mixing must surface to the
curator. Re-read the disambiguation table in
`FINAL_RECOMMENDATION.md` before any such proposal.

---

## 9. Out of scope

- Schema migration for observational entries (content module stays).
- Bulk import from FootbagMoves or other external sources.
- Automated observational-to-canonical promotion.
- Hashtag chip rendering on observational entries.
- Trick-detail pages for observational entries.
- Per-entry outbound source video links (deferred enhancement).
- Status-bucket retention policy (defer).
- Observational entry tagging (e.g. "looks like whirl-family"). Any
  such tag would imply a canonical claim and is exactly the doctrine
  A trap to avoid.

---

## 10. Cross-references

- `FINAL_RECOMMENDATION.md` -- CR-2 cross-cutting recommendation;
  ontology disambiguation table.
- `dictionary_landing_page_plan.md` -- Card 5 specification; primary
  implementation site.
- `family_and_neighborhood_governance.md` -- canonical home of the
  ontology disambiguation; doctrine C multi-axis treatment.
- Skill doctrine A (footbag-freestyle-dictionary skill) -- four-layer
  ontology separation invariant.
- Skill topology-governance "Observational ≠ canonical" -- core
  invariant.

---

## 11. Summary

`/freestyle/observational` is correctly isolated, well-attributed, and
currently undiscoverable. The recommendation is one landing card (per
CR-2 + `dictionary_landing_page_plan.md` Card 5) plus a reciprocal
"back to canonical" link from the observational page. Route, page
title, content module, isolation invariant all unchanged. Skill
doctrine A + the observational-vs-canonical separation preserved
end-to-end. The brief's Part 1.5 discoverability gap closes without
ontology hardening, without inline mixing, without affordance creep.
