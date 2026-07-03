# Historical Ontology Doctrine — Red 2026-05-21 Ingest

A governance/doctrine clarification batch received from Red Husted
during the FB.org master-spreadsheet ingest phase. This is **not** an
ADD adjudication batch — it produces no new resolved-canon rows. It is
a historical/ontology-governance clarification that materially affects
compression doctrine, blurry/stepping interpretation, historical
provenance handling, publication-layer philosophy, and source-
divergence policy.

Status: **doctrine — adopted 2026-05-21.** Reversible (content-module
+ documentation only; no schema, no SQL, no public-surface mutation).

---

## 1. Source guidance (Red Husted, 2026-05-21)

Five load-bearing statements, recorded verbatim with the curator
interpretation each licenses.

### 1.1 Historical divergence legitimacy

> "You probably are going to come up against many inconsistencies
> between the older sites and the newer, just because tech and
> understanding of tech evolved and the old sites were never updated."

**Interpretation.** Historical source divergence is *expected*, not a
data-quality defect. Conflicting notation across FB.org / FootbagMoves /
PassBack / IFPA is historically real — it records how the sport's
understanding of its own movement vocabulary evolved. Preserving
provenance is correct. Aggressive normalization would erase history.

### 1.2 Compression becomes impractical for spoken naming

Red confirms that long-form structural descriptions eventually become
impractical as spoken names. Worked example offered:

> "Stepping Diving Paradox Torque Screw"

**Interpretation.** Compressed spoken names and expanded structural
decompositions are *intentionally different layers*. A name short
enough to call out in a circle and a decomposition complete enough to
derive an ADD are not the same artifact and should never be forced to
be. This directly validates the project's four-layer separation.

### 1.3 Blurry → stepping conceptual evolution

> "More people use the term 'Stepping' now than 'Blurry' as thinking
> about these moves have changed."

**Interpretation.** `blurry` is historically-compressed vocabulary;
`stepping` is the later, structurally-explicit interpretation of the
same movement mechanic. The terms did not replace one another by
correction — player cognition of the move changed, and the vocabulary
followed. Both layers are legitimate and may coexist.

### 1.4 Historical ADD persistence

Red confirms that most ADD values remained stable historically — the
exception being X-Dex reinterpretations.

**Interpretation.** A move's ADD identity can survive conceptual
reinterpretation. When the *understanding* of a move changes (blurry
re-read as stepping+paradox) the ADD value often does not. ADD identity
and structural-interpretation identity are decoupled. The X-Dex family
is the principal exception: reinterpreting hidden cross-body structure
*did* move ADD values.

### 1.5 Rooted-family structural difficulty

Red identifies "Rooted"-style unique sets as among the hardest
structural ontology problems.

**Interpretation.** The rooted family stays doctrine-sensitive. Avoid
premature topology hardening; a dedicated glossary/governance treatment
is likely warranted later (see [[GLOSSARY_SECTION_SCAFFOLD]]).

---

## 2. Doctrine A — Historical divergence is expected and legitimate

**Adopted doctrine.**

> Divergence between historical footbag sources (FB.org, FootbagMoves,
> PassBack, IFPA) is an expected and legitimate property of the corpus,
> not a defect to be corrected. Each source records the sport's
> understanding of its movement vocabulary *at the time that source was
> authored*. Older sources were never updated as understanding evolved;
> their content is a historical record, not stale data.

Consequences:

- A conflict between two sources is **information**, not an error to
  resolve by overwrite.
- The master spreadsheet's per-source row model (one row per
  source per trick, cross-linked via `equivalent_to`) is the correct
  representation and is now Red-validated.
- "Correcting" an old source to match a newer one is forbidden — it
  destroys the historical record. (See Hard Constraints.)

## 3. Doctrine B — Divergence-preservation policy (reinforced)

The FB.org master-ingest slices (1-ADD through 4-ADD, 2026-05-21)
already implement divergence preservation. Red's guidance **validates
that policy** and the project now adopts it as explicit doctrine.

When sources conflict on notation, ADD value, naming, or
decomposition:

1. **Preserve per-source truth.** `source_adds` carries each source's
   own claim; never overwrite it with another source's value.
2. **Preserve provenance.** `provenance_notes` records cross-source
   confirmations and divergences with the source named.
3. **Preserve historical notation.** `symbolic_notation_raw` /
   `jobs_notation_raw` keep the source's notation verbatim, including
   source typos (flag intent in `parser_notes`, do not silently fix).
4. **No silent overwrite.** A UPDATE-existing-row operation populates
   governance columns and appends to `provenance_notes`; it never
   mutates the existing source-attribution columns.
5. **Mark `doctrine_status='hedged'`** where sources materially
   diverge on ADD or decomposition. `'settled'` is reserved for rows
   where the canonical reading is uncontested.

Do **not** normalize away: historical vocabulary, older ADD
interpretations, or compressed naming artifacts.

Worked precedents already in the master (Red-validated by this batch):

| Trick | Divergence | Master handling |
|---|---|---|
| Witchdoctor | FB.org=4 vs IFPA canonical=5 | `source_adds` per-source; canonical 5 in `add_formula`; `doctrine_status=hedged`; divergence in `provenance_notes` + `unresolved_questions` |
| Atom Smasher | FB.org=3 vs IFPA=4 (hidden X-Dex) | new fborg row at `source_adds=3`; `parser_notes` flags IFPA 4 |
| Omelette | FM=4 vs IFPA=3 | FM row `source_adds` stays 4; FB.org confirmation of 3 in provenance |
| Triage / S&M Smasher | FB.org=4 vs FM=6 | FM row `source_adds` stays 6; FB.org=4 in provenance |

## 4. Doctrine C — Blurry / stepping conceptual evolution

**Adopted ontology note.**

> `blurry` and `stepping` name the same family of movement mechanics
> at two different points in the sport's conceptual history. `blurry`
> is the historically-compressed term; `stepping` is the later,
> structurally-explicit interpretation. The shift from "blurry" to
> "stepping" reflects evolving player cognition of the move, not a
> correction of an error. Both terms are legitimate. They may coexist
> in the dictionary without forced collapse.

Application:

- **Preserve blurry-family historical naming.** Do not retire `blurry`
  entries or aliases. They are the historical layer.
- **Preserve stepping-family structural interpretation.** The
  `stepping`-prefixed structural readings are the modern explicit
  layer.
- **Stable ADD may outlive reinterpretation.** A move re-understood
  from "blurry X" to "stepping paradox X" can keep its historical ADD
  value (Doctrine D). The reinterpretation changes the *structural
  reading*, not necessarily the *ADD identity*.
- **`doctrine_status` wording.** For blurry/stepping pairs, prefer
  `hedged` over `settled` until the curator confirms the coexistence
  framing per-row; the relationship is "two legitimate layers," not
  "one correct, one wrong."
- **`parser_notes` wording.** Where a parser note describes a
  blurry↔stepping relationship, frame it as historical-layer vs
  explicit-layer, not as alias-of or supersedes.

This refines, but does not overturn, the existing
SEMANTIC_COMPRESSION_DOCTRINE §12 "Blurry = stepping + paradox for the
4 confirmed cases" locked delta. That delta remains a *structural-
reading* equivalence; this doctrine adds the *historical-layer*
framing around it.

## 5. Doctrine D — Historical ADD persistence

**Adopted doctrine.**

> A move's ADD identity can persist across conceptual reinterpretation.
> When the structural understanding of a move evolves, its ADD value
> often does not change. ADD identity and structural-interpretation
> identity are decoupled axes. The X-Dex family is the principal
> historical exception: reinterpreting hidden cross-body structure did
> move ADD values.

Application:

- For blurry-family, atomic-family, and any hidden-structure trick: a
  changed *reading* does not automatically imply a changed *ADD*.
  Treat ADD value and structural decomposition as separately sourced.
- The master's `source_adds` (per-source historical claim),
  `computed_add_count` (parser-derived), and `add_formula` (curator
  human-readable) columns already model this decoupling. Keep them
  distinct; never collapse them.
- X-Dex reinterpretation is the known exception class — when an X-Dex
  re-reading is in play (Atom Smasher, atomic family), ADD *and*
  structure may both move; mark `doctrine_status='hedged'`.

## 6. Doctrine E — Publication philosophy refinement

**Adopted foundational publication principle.**

> A move may simultaneously possess, without contradiction:
> - a **compressed canonical spoken name** (short enough to call out);
> - an **expanded structural explanation** (complete enough to derive
>   an ADD);
> - **historically evolved semantics** (the reading changed over time);
> - a **stable ADD identity** (the number often did not change).
>
> These are four distinct, co-existing properties of one move. A
> publication surface that presents one must not imply the others are
> wrong, absent, or superseded.

This is now a foundational publication principle. It is consistent
with — and strengthens — the four-layer separation:

| Layer | Artifact | This doctrine's contribution |
|---|---|---|
| Canonical spoken name | `canonical_name` | may be compressed; that is correct, not lossy |
| Symbolic decomposition | notation columns | the expanded layer; intentionally longer |
| Parser / internal derivation | `structural_parse_json`, `computed_adds` | derivation, never a public name |
| Pedagogical explanation | glossary / trick-detail prose | the place where the *history* of the reading is told |

**Proposed propagation (curator/Dave approval required).** This
principle is a natural addition to
`docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` as a seventh contract
clause ("a canonical trick may carry compressed and expanded
representations simultaneously"). That file is in the curator/Dave-owned
`docs/` canonical set; this exploration doc records the proposed
addition but does **not** edit the canonical contract. Surface to the
curator for a docs-side decision.

## 7. Rooted-family edge-case posture

Red flags "Rooted"-style unique sets as among the hardest structural
ontology problems. `Rooted` is already curator-known: RED_RESOLVED_CANON
§A.2 records "Rooted = 0 ADD (pt8; stall baseline)" and the project
memory notes rooted as a "0-ADD set."

Posture adopted:

- **Keep rooted-family doctrine-sensitive.** Do not harden a topology
  axis or family grouping around rooted-style sets.
- **No premature canonicalization.** Rooted-style unique sets stay
  observational until a dedicated curator pass.
- **Future treatment.** A dedicated glossary/governance section is
  likely warranted — scaffolded in [[GLOSSARY_SECTION_SCAFFOLD]] as a
  candidate topic, not authored here.

---

## 8. Hard constraints (carried from the task brief)

- Preserve four-layer separation.
- No ontology over-hardening.
- Preserve source provenance.
- Preserve historical ambiguity honestly.
- Avoid parser leakage into publication surfaces.
- **Do not retroactively "correct" old sources.** An older site's
  content is a historical record; editing it to match modern
  understanding destroys the record.
- Reversible governance preferred (documentation + content modules;
  no schema, no SQL).

## 9. Recommended future doctrine slices

Forward-looking; none authored here.

1. **Glossary section — "Historical Evolution of Structural
   Understanding."** Scaffolded in [[GLOSSARY_SECTION_SCAFFOLD]].
   Author after the FB.org master ingest (5/6/7-ADD) completes.
2. **Blurry/stepping per-row coexistence triage.** Walk the
   blurry-family and stepping-family master rows; confirm the
   two-layer framing per row; set `doctrine_status` accordingly.
   Curator-gated.
3. **Rooted-family governance pass.** Dedicated treatment of
   rooted-style unique sets; topology posture; glossary entry.
   Curator-gated; low priority per Red.
4. **Publication-contract clause 7.** Propose the
   compressed+expanded-coexistence principle (§6) as a seventh clause
   in `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md`. Requires
   curator/Dave approval (docs/ canonical set).
5. **X-Dex reinterpretation history.** A focused doctrine note on the
   one historical exception class where ADD *and* structure both
   moved. Feeds the glossary section.

## 10. Cross-references

- [[GLOSSARY_SECTION_SCAFFOLD]] — Phase D scaffold for the future
  "Historical Evolution of Structural Understanding" glossary section.
- `exploration/red-consolidation/SEMANTIC_COMPRESSION_DOCTRINE.md` —
  the live compression doctrine; §12A integrates this batch.
- `exploration/red-consolidation/RED_RESOLVED_CANON.md` — settled ADD
  rulings; unchanged by this batch (governance-only).
- `exploration/footbagmoves-federation/SYMBOLIC_GRAMMAR_MASTER.csv` —
  the master spreadsheet whose divergence-preservation policy this
  batch validates.
- `feedback_reversible_content_governance` — reversible governance
  doctrine; this batch is documentation-only and fully reversible.
- `feedback_parser_editorial_separation` — parser/editorial separation;
  reinforced by Doctrine E's four-layer table.
- `docs/CANONICAL_TRICK_PUBLICATION_CONTRACT.md` — curator/Dave-owned;
  §6 proposes a seventh clause but does not edit it.

---

*Adopted 2026-05-21. Governance/doctrine ingest; no ADD adjudication;
fully reversible.*
