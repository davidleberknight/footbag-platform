# Freestyle Vocabulary Registry — Surface Design — 2026-05-21

A design for a new freestyle ontology surface that accounts for every
historically documented trick name not yet canonically published.
Builds on `COVERAGE_DOCTRINE_AND_ADD_PEDAGOGY_2026-05-21.md` §B — that
doc proposed the staged-publication *doctrine*; this doc designs the
*surface* that makes it browsable.

Design only. No code, no schema. Implementation is a later slice.

---

## 1. Critique of the current "missing tricks" problem

The previous coverage-doctrine doc critiqued the *messaging*. The
deeper problem this surface addresses: **there is no surface at all.**

- 171 tricks are published; ~670+ more are catalogued in
  `SYMBOLIC_GRAMMAR_MASTER.csv` and the observational export.
- But those CSVs live in `exploration/` — they are **not
  reader-facing in any form.** From a public user's standpoint the
  ~670 tracked tricks are *completely invisible*. The project has done
  the cataloguing work and gets zero credit for it.
- So the advanced user's conclusion ("tricks are missing, history was
  ignored") is, from where they stand, **reasonable** — they have no
  way to see otherwise.

The fix is not better wording on the dictionary landing. It is a
surface where a user can search "ducking barfly," find it, and see:
*known, catalogued, source-attributed, status = Observed, here is why
it is not yet published.* Visibility is the deliverable.

## 2. Doctrinal model for the registry

Two layers, one system of record:

```
                SYMBOLIC_GRAMMAR_MASTER.csv
                (curator system-of-record — exploration/)
                 /                              \
   Canonical Dictionary                Freestyle Vocabulary Registry
   /freestyle/tricks                   /freestyle/registry
   fully curated, polished,            the complete tracked vocabulary;
   pedagogical detail pages            governed status per entry
   (the publication layer)             (the accountability layer)
```

Core doctrine:

> **Every historically documented freestyle trick name exists
> somewhere in the system, with a governed status — even when it is
> not yet canonically published.**

Five principles:

1. **The registry is a projection, not a second source of truth.** It
   is generated from the master spreadsheet. The master stays the
   single curator-edited system of record; the registry is its
   public, read-only face.
2. **The registry is governed, not a dump.** Every entry carries a
   status. An entry with no status is not eligible to be in the
   registry. The status taxonomy *is* the governance.
3. **The registry never canonicalizes.** Promotion flows one way —
   registry → canonical, only through the Canonical Trick Publication
   Contract, only by curator decision. The registry surfaces
   candidates; it never auto-promotes. (Per the freestyle-topology-
   governance rule: observational ≠ canonical.)
4. **The dictionary is reachable from the registry as the gold
   standard.** Every Published Canonical entry links to its dictionary
   page. The registry routes users *toward* the published layer; it
   does not compete with it.
5. **Honest incompleteness is the feature.** The registry exists to
   make omissions explainable and governance visible — see §10.

## 3. Naming

| Candidate | Assessment |
|---|---|
| **Freestyle Vocabulary Registry** | **Recommended.** "Registry" conveys *governed + tracked*; "vocabulary" is accurate (it is the language layer, names + status). Does not collide with any status name. |
| Observed Vocabulary Registry | Strong alternate — but "Observed" is also one of the *statuses* inside the registry. Naming the whole surface after one of its states invites confusion (the registry also holds Published Canonical and Under Review entries). |
| Historical Trick Registry | Avoid — "Historical" is misleading. Many tracked-but-unpublished tricks are modern, not historical/obsolete. |
| Extended Vocabulary | Avoid — "Extended" reads as an appendix of extras / leftovers, the exact "miscellaneous" impression to prevent. |

Recommendation: **Freestyle Vocabulary Registry**, route
`/freestyle/registry`. Short public label: "Vocabulary Registry."

## 4. Scope boundaries

**In scope:**
- Every documented freestyle *trick name* in the tracked corpus
  (footbag.org, FootbagMoves, PassBack, IFPA canonical) — one entry
  per name.
- Per-entry governance metadata + source provenance + status.
- Published Canonical tricks appear too — as thin entries (status +
  link to the dictionary page). The registry is the *complete index*;
  the dictionary is the *published-detail subset*.

**Out of scope:**
- Modifiers / operators on their own — those belong to the glossary /
  operator reference, not a "trick" registry.
- Undocumented / speculative names — only *sourced* names enter. An
  unsourced name is not registry-eligible (it would be the dumping
  ground the brief forbids).
- Net and golf vocabulary — freestyle only.
- Full pedagogical content — the registry is names + status +
  metadata. Teaching is the canonical dictionary's job.
- Aliases as separate entries — an alias is a *relationship between
  entries*, not its own scope line.

## 5. Statuses and lifecycle

The eight statuses from the brief split into **pipeline states** (a
name's position on the path to/from publication) and **resolution
classifications** (a terminal or orthogonal outcome).

### Pipeline states

| Status | Meaning |
|---|---|
| **Observed / Historical** | Documented in a source; catalogued; not yet reviewed for publication. The default entry state. |
| **Under Review** | Actively in a curator decision queue. |
| **Published Canonical** | Meets the Publication Contract; has a live dictionary page. |

### Resolution classifications

| Status | Meaning |
|---|---|
| **Alias / Equivalence Candidate** | Likely the same trick as a published one under another name, or an equivalence-topology variant; reconciliation pending. |
| **Pending Symbolic Resolution** | Decomposition / parser state incomplete; the structural reading is unresolved. |
| **Policy-Dependent** | ADD or structure depends on an unsettled doctrine question (e.g. Wave-2 Red items). |
| **Insufficiently Sourced** | Appears in too few / too weak sources to verify; held pending corroboration. |
| **Historical / Obsolete Naming** | A real but deprecated name — superseded by modern vocabulary (the blurry→stepping pattern). |

### Lifecycle (typical flows)

```
Observed ──► Under Review ──► Published Canonical
   │                │
   │                ├──► Alias / Equivalence Candidate ──► (folds into a canonical trick)
   │                ├──► Pending Symbolic Resolution ──► (waits on decomposition)
   │                └──► Policy-Dependent ──► (waits on a doctrine ruling)
   │
   ├──► Insufficiently Sourced ──► (held; may re-enter on new evidence)
   └──► Historical / Obsolete Naming ──► (terminal; preserved as record)
```

### Status is DERIVED, not hand-maintained

The registry status must be **computed from the master's existing
governance columns** so it never drifts from the system of record:

| Registry status | Derivation from master |
|---|---|
| Published Canonical | row exists in live `freestyle_tricks` |
| Pending Symbolic Resolution | `doctrine_status` ∈ {hedged, pending} + parser-incomplete |
| Policy-Dependent | `doctrine_status='hedged'` with a doctrine-question note |
| Under Review | `curator_review_needed='true'` |
| Alias / Equivalence Candidate | `equivalent_to` populated + not yet published |
| Insufficiently Sourced | single weak source, `add_confidence='low'` |
| Historical / Obsolete Naming | curator-flagged (small explicit allow-list) |
| Observed / Historical | the residual default |

A small derivation function owns this mapping. Hand-maintained status
= guaranteed drift; derived status = always in sync.

## 6. UI / UX structure

Route `/freestyle/registry`. A reference surface (per the
landing-vs-reference boundary — the dictionary landing *previews* it,
the registry *decomposes*).

**Page shape:**

1. **Header + governance statement.** One short paragraph: what the
   registry is, why it exists, that it is actively governed. Sets the
   scholarly-stewardship tone immediately.
2. **Status legend.** The 8 statuses, each with a one-line definition
   and a colour/shape badge. This legend is load-bearing — it is what
   makes the surface read as *governed* rather than *miscellaneous*.
3. **Counts strip.** "171 Published Canonical · N Observed · N Under
   Review · …" — the pipeline made numeric. Visible governance.
4. **Filter / search bar.** Filter by status, source, ADD, family;
   free-text name search.
5. **Entry list** — table or card grid. Per entry (see §5 of the
   brief): name · status badge · ADD (source value) · source
   provenance · possible canonical relationship · symbolic confidence
   · ADD confidence · publication note. Published Canonical entries
   link to their dictionary page.
6. **Per-entry expand** (MVP: a row detail; long-term: a light detail
   panel) — parser state, unresolved doctrine note, alias/equivalence
   target, full provenance.

**Tone enforcement** (the strong UX requirement):
- The legend + counts strip up top = "this is a system, not a pile."
- Status badges colour-graded by maturity (published = solid; observed
  = neutral; under-review = active; etc.).
- Never the words "leftover / misc / unsorted / junk." Every entry is
  *tracked*, never *missing*.
- Confidence shown as calibrated indicators, not apologies.

## 7. Interaction with adjacent systems

- **Canonical trick pages.** A Published Canonical registry entry
  deep-links to `/freestyle/tricks/:slug`. The dictionary page does
  *not* need a back-link (avoid clutter) — optionally a subtle
  "tracked in the Vocabulary Registry" footer link.
- **Aliases.** An Alias/Equivalence Candidate entry shows "tracked as
  a likely alias of `<canonical trick>`" linking the canonical. On
  curator confirmation it becomes a real alias and the registry entry
  resolves (status → Published Canonical via the parent, or a
  collapsed-alias display).
- **Equivalence chains.** Pending Symbolic Resolution + equivalence
  entries link into the equivalence-topology data — "this name may be
  an equivalence-chain reading of `<X>`."
- **Parser confidence.** The registry surfaces the master's
  `parse_confidence` directly as the "symbolic confidence" indicator;
  a low value visibly justifies a Pending Symbolic Resolution status.
- **Observational topology.** Registry entries carry the master's
  `derived_symbolic_family` / `derived_topology_family`, so the
  registry is *browsable by observational family*. The registry is, in
  effect, the public index of the observational topology layer.

## 8. MVP vs long-term architecture

### MVP — lightweight, reversible

- **Data:** a generated `registry export` (CSV/JSON) derived from
  `SYMBOLIC_GRAMMAR_MASTER.csv` by a build script — the status
  derivation of §5 applied once. No new DB table, no schema migration
  (per the reversible-content-governance rule — content/generated
  data, not SQL, while the ontology is in flux).
- **Surface:** one read-only page at `/freestyle/registry` — service
  reads the generated registry data, shapes the view-model; a
  Handlebars template renders the legend + filterable list.
- **Editing:** none. The registry is read-only public. All curation
  happens upstream in the master spreadsheet (curator-internal).
- **Scope of MVP:** the ~670 observational rows + the 171 published =
  the full index, status-derived, searchable, filterable. That alone
  solves the visibility problem.

### Long-term

- A `freestyle_vocabulary_registry` table or SQL view once the
  ontology + the registry concept have stabilized (post-Red,
  post-curator-validation) — only then is hardening to schema safe.
- Per-entry detail panels; richer provenance; equivalence-graph
  visualization.
- Two-way curator workflow tooling (internal) feeding the registry.
- The registry as the spine that feeds *both* the dictionary and
  itself from one governed pipeline.

Sequencing: ship the MVP read-only page first; it is fully reversible
(delete a generated file + a route). Defer the table until the
concept is proven.

## 9. Ontology / governance risks

| Risk | Mitigation |
|---|---|
| **Becomes a dumping ground** | Every entry must have a derived status; unsourced names are scope-excluded (§4). The status taxonomy is mandatory. |
| **Status drift from the master** | Status is *derived* from the master's governance columns, never hand-kept (§5). |
| **Accidental canonicalization** | The registry never promotes. Canonical relationships are always hedged ("candidate", "possible") until curator-confirmed. Promotion is one-way, contract-gated. |
| **Exposes internal review state publicly** | The registry is a public *read* surface showing curated *status* — it is not review *tooling*. Review/classification tooling stays internal (per the internal-only constraint). Displaying "Under Review" is a status, like a public issue tracker; it is not the editing workflow. |
| **Individual names leak via provenance** | Public registry shows *source-level* provenance only (footbag.org / FootbagMoves / PassBack) — never individuals. The master's provenance_notes carry individual-name asides (e.g. the pogo rows); the registry export must strip them. |
| **Cross-source divergence reads as error** | Per the Red 2026-05-21 historical-divergence doctrine, divergence is legitimate. The registry frames "sources differ" as honest record, not defect. |
| **Unmaintainable at scale** | 670+ entries — the registry MUST be generated, never hand-curated. The build script + master are the maintenance model. |
| **Registry competes with / undermines the dictionary** | Clear hierarchy in copy and UI: dictionary = published/polished/pedagogical; registry = tracked index. The registry visibly routes toward the dictionary as the quality layer. |
| **Doctrine-sensitive entries hardened prematurely** | Pending Symbolic Resolution / Policy-Dependent statuses explicitly hold these; the registry shows the open question rather than a forced answer. |

## 10. Preserving authority while exposing incompleteness

The apparent paradox — showing 171/~840 published — resolves because
**visible governance reads as competence, not as incompleteness.**

- **A governed ledger is the opposite of looking incomplete.** An
  unexplained gap looks like neglect. A gap shown as 670 entries each
  with a status, a source, a confidence, and a reason looks like
  *scholarship*. The registry converts "missing" into "accounted for."
- **The dictionary's authority comes from its bar.** The registry
  *proves the bar is real* by showing exactly what is still below it
  and why. A strict standard with nothing visibly held to it is just
  an assertion; a strict standard with a 670-entry governed queue
  behind it is a demonstrated process.
- **Route toward the gold standard.** Every Published Canonical entry
  links to its polished dictionary page. The registry continuously
  points users at the published layer as the destination.
- **Numbers are both the honesty and the confidence.** "171 published
  · 670 tracked across governed states" is fully honest *and* reads as
  a managed pipeline. Honesty without numbers reads as apology;
  numbers without honesty reads as spin; together they read as
  stewardship.
- **Frame it as the accountability layer.** Public language: "the
  Vocabulary Registry is the project's accountability ledger for
  freestyle's documented vocabulary." That sentence makes exposing
  incompleteness the *point*, not an embarrassment.

The long-term goal — exhaustive accountable coverage — is itself an
authority claim: the project is not selectively publishing a favoured
subset, it is systematically working a complete corpus. The registry
is what makes that claim legible.

---

## Requested-output index

1. Missing-tricks critique — §1
2. Doctrinal model — §2
3. Naming — §3 (recommend: Freestyle Vocabulary Registry)
4. Scope boundaries — §4
5. Statuses + lifecycle — §5
6. UI/UX structure — §6
7. Adjacent-system interaction — §7
8. MVP vs long-term — §8
9. Risks — §9
10. Authority vs incompleteness — §10

*Design proposal only. No code, no schema. The MVP (read-only page +
generated registry export from the master) is the recommended first
implementation slice, once the curator approves the doctrine + name.*
