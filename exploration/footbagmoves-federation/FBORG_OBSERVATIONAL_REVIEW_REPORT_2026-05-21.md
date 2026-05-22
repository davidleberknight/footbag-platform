# Observational Layer — Review Report — 2026-05-21

A reviewer's-eye summary of the **670** non-canonical rows in the
master spreadsheet — every `SYMBOLIC_GRAMMAR_MASTER.csv` row that is
NOT `publication_status='first_class_ready'`. These are the
explicitly non-canonical / staging / observational rows.

Companion CSV: `FBORG_OBSERVATIONAL_EXPORT_2026-05-21.csv` — 670 rows,
refreshed this slice with the family columns added. Columns:
canonical_slug, display_name, source, source_file, source_adds,
derived_adds, add_formula, symbolic_notation_raw,
parsed_symbol_sequence, **derived_symbolic_family**,
**derived_topology_family**, doctrine_status, first_class,
curator_review_needed, publication_status, unresolved_questions,
provenance_notes, parser_notes, review_status.

Non-doctrinal: counts and breakdowns only.

---

## 1. Size + composition

| Layer | Rows |
|---|---:|
| Master total | 854 |
| `first_class_ready` (canonical-track) | 184 |
| **Observational (this export)** | **670** |

### By source

| source | rows |
|---|---:|
| footbagmoves | 492 |
| passback | 104 |
| fborg | 74 |

### By ADD tier

| ADD | rows | | ADD | rows |
|---|---:|---|---|---:|
| 1 | 1 | | 5 | 176 |
| 2 | 17 | | 6 | 97 |
| 3 | 130 | | 7 | 41 |
| 4 | 203 | | 8 | 3 |
| | | | 9 | 2 |

The observational layer skews deep — 319 rows (48%) are 5-ADD or
higher. The deep tail (6–9 ADD, 143 rows) is where folk compounds and
low-priority curios concentrate.

## 2. Governance state

| publication_status | rows | meaning |
|---|---:|---|
| (empty) | 569 | governance-untouched footbagmoves/passback intake rows |
| observational | 91 | governance-classified, not promotion-track |
| candidate | 8 | settled-doctrine + notation, first_class=false (promising) |
| intake | 2 | stale default — see QC report flag |

| doctrine_status | rows |
|---|---:|
| (empty) | 569 |
| hedged | 74 |
| pending | 19 |
| settled | 8 |

- **569 rows have empty governance** — the original footbagmoves +
  passback corpus, never governance-classified (only FB.org-ingest-
  touched rows were). This is honest intake state; classifying them is
  a large future curator pass, not done here.
- **101 rows are governance-classified** (91 observational + 8
  candidate + 2 intake): of these, 74 hedged + 19 pending = 93 carry
  unsettled doctrine.

## 3. Curator-attention rows

| Signal | rows |
|---|---:|
| `curator_review_needed = true` | 84 |
| `unresolved_questions` non-empty | 83 |

These 84 rows are the curator-review backlog inside the observational
layer — the genuine "needs a human" set. They cluster (per earlier
slice reports) into: fairy-family (pt12 Q4 pending), spyro-family,
pogo-family, multiplicity compounds, the cross-source divergences, and
folk one-offs.

## 4. The 8 `candidate` rows (closest to promotable)

`publication_status='candidate'` = `first_class=false` but doctrine
settled + notation present — the observational rows nearest the
canonical line. Worth a curator glance first:

(from the master — settled-doctrine, first_class=false): the three
pixie-clipper variants from the 3-ADD slice plus others flagged
`candidate` in the Phase-1 audit. See the export filtered on
`publication_status=candidate`.

## 5. How to review the export

The CSV is sortable/filterable on every governance axis. Useful views:

- `publication_status=candidate` — 8 nearest-promotable rows.
- `curator_review_needed=true` — the 84-row review backlog.
- `doctrine_status=hedged` — 74 unsettled rows.
- `source=fborg` + `publication_status=observational` — FB.org rows
  held back from promotion (the hedged FB.org tricks).
- `derived_symbolic_family=<x>` — browse an observational family.

## 6. Non-actions (scope)

- The 569 empty-governance rows are NOT classified here — that is a
  separate large pass.
- No row promoted, no ADD changed, no doctrine settled.
- The export is a derived view; `SYMBOLIC_GRAMMAR_MASTER.csv` remains
  the source of truth.
