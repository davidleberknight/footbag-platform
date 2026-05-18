# Unresolved PassBack questions

Phase B audit deliverable. Surfaces the rows in
`passback_overlap_matrix.csv` + `passback_formula_disagreements.csv`
that need curator adjudication or Wave 2 reply before the PB ingestion
pipeline can advance them out of observational/pending status.

**Goal**: every unresolved row has a named question + named blocker.
No silent omissions. The reviewer can resolve in any order.

## 1. Wave 2 hold (22 rows)

22 alignment rows are flagged `pending_red = true`. These touch one of
the Wave 2 packet questions sent to Red Husted 2026-05-15:

- Blurry transitivity beyond pt11-settled whirl/torque
- Barraging operator class (structural dex-multiplier vs body modifier)
- Atomic family X-dex scope
- Operator-vs-trick boundary (Fairy weight)
- Compression intent
- Hidden-vs-flat preservation

**Blocker**: Red Husted Wave 2 reply.

**Action**: hold all 22 rows from both canonical promotion and
observational staging. Mark observational entries (if any subsequently
seed) with explicit "Wave 2 pending" badge.

Sample rows (selected from the alignment CSV's `pending_red=true`
subset; see `passback_overlap_matrix.csv` for the full list):

| External name | PB formula | Question |
|---|---|---|
| Various `barraging-X` compounds | barraging far / near / op X | Barraging operator class |
| Various `fairy-X` compounds | fairy + base | Fairy weight |
| `Atom Smasher` variants | atomic far/near X | Atomic-family X-dex scope |
| Various `blurry-X` compounds beyond whirl/torque | blurry + base | Blurry transitivity |

## 2. Formula disagreements requiring curator adjudication (3 rows)

3 rows have `agree_name_formula_differs`: PB and IFPA use the same
name but different structural formulas. Per V1 §6 (no fabricated
structure), the curator must adjudicate which formula is the
canonical reading.

**Action**: curator review per case. For each, the question is:

- Is PB's formula a curator-acceptable alternate reading? (Add as
  observational alternate; IFPA primary stands.)
- Is one formula wrong? (Reconcile to the curator-confirmed one;
  document the rejection.)
- Are both valid at different "stopping depths"? (Multi-depth case
  per the existing ADD-analysis pattern.)

**Blocker**: human curator.

## 3. ADD-disagreement cohort (68 rows)

68 rows have same name, different ADD value. The structural
explanation (per the existing intake design) is:

- PB's `dex_count` counts dexterities mechanically
- IFPA's `adds` counts total ADD contribution including operator
  weights + stall + positional

These are largely PRESENTATION-LAYER differences, not true
disagreements. Reconcile via observational notes on canonical
trick-detail pages: "PB documents this trick at ADD N (counts N
dexes); IFPA canonical ADD is M (includes operator stack)."

**Blocker**: per-row curator review for the small fraction that may be
true reconciliation cases.

**Question for each row**: is the PB `dex_count` the explanation, or
is this a true ADD disagreement that needs curator adjudication?

## 4. PB-only tricks NOT observational-safe (109 rows)

180 PB-only rows total; 71 are observational-safe (readable formula +
no Wave 2 dependency); the remaining **109 are NOT observational-safe**
and need triage:

- Formula not readable in IFPA operator vocabulary
- OR Wave 2 sensitivity
- OR PB-only operator tokens (refraction, terraging, miraging variants
  beyond the curator-confirmed set)

**Action**: per-row curator triage:

- If the formula can be re-expressed in IFPA operators → promote to
  observational-safe; move to Batch B
- If the PB operator token is structurally distinct → add to the
  unresolved operator-token list (Section 5 below)
- If Wave 2 — hold

**Blocker**: curator review + Section 5 operator-token resolution.

## 5. PB-only operator tokens (13 unmatched)

Per `passback_operator_alignment.csv`, ~13 PB-only operator-shaped
tokens don't appear in the IFPA inventory. Examples (top 5 by
frequency, derivable from the CSV):

| PB token | Question |
|---|---|
| `refraction` | Is this an IFPA operator, an alias for a known one, or PB-folk vocabulary? |
| `miraging` | Already in IFPA as the `miraging` reading of torque (pt11); confirm same usage |
| `terraging` | Per memory: "Terraging = Double Pixie" (legacy move set folk equivalence); confirm + add as alias |
| Various `*-ing` PB-folk tokens | Folk gerund forms of known operators; classify per case |
| `tipping` | In IFPA modifier inventory? Verify. |

**Action**: curator classification per token. Aligned tokens get
explicit alias mapping; PB-only tokens get either operator-inventory
admission OR explicit observational-only status.

**Blocker**: curator + operator inventory governance (memory
`project_freestyle_core_atoms` for canonical atom set).

## 6. Cross-sport pb-dict2 cohort (42 rows)

42 rows come from `pb-dict2.txt`, the cross-sport companion file.
These may include tricks NOT in the main passback-dicrionary.txt
that are documented elsewhere (other footbag sports / disciplines).

**Question**: which of the 42 belong in the freestyle-canonical
intake pipeline at all? Some may be net-specific or other-discipline.

**Action**: scope review — separate freestyle-relevant rows from
other-discipline rows; route the latter elsewhere (or shelve).

**Blocker**: curator + scope decision per row.

## 7. Glossary terms (180 PB glossary rows)

Separate from the trick intake: 180 PB glossary terms are staged in
`passback_glossary_staging.csv`. Most are educational-layer
candidates with `match_status='new_term'` and `proposed_layer=
'educational'`.

These don't compete with curated tricks (different surface), but they
do need governance:

- Which are safe to surface as glossary supplements? (probably most
  of the 180)
- Which conflict with existing IFPA glossary terminology?
- Which need adjudication?

**Action**: separate slice. Not blocking the trick ingestion pipeline.

## Resolution workflow

For each numbered section above:

1. Resolve the named blocker (Wave 2 reply / curator review / scope
   decision).
2. Run the audit script again (re-generate
   `passback_overlap_matrix.csv` from the alignment CSV).
3. Move rows out of "unresolved" into one of: canonical-promotion /
   alias-governance / observational-staged / explicitly-rejected.
4. Reload this document and update the per-section counts.

## Honest-incompleteness contract

Every unresolved row stays surfaced here until resolved. No silent
omissions. No fabricated formulas. No auto-promotion. The PassBack
pipeline advances when humans decide; not faster.
