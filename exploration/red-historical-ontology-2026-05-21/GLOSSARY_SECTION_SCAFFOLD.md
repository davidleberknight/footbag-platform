# Glossary Section Scaffold — "Historical Evolution of Structural Understanding"

**Status: SCAFFOLD ONLY. Not authored.** This document captures intent
and structure for a future glossary/doctrine section. It does not
write glossary prose, does not touch `src/views/freestyle/glossary.hbs`,
and does not touch the service layer. Authoring is a separate,
curator-gated slice.

Origin: Phase D of the Red 2026-05-21 historical-ontology ingest. See
[[HISTORICAL_ONTOLOGY_DOCTRINE]] for the doctrine this section would
make public-facing.

---

## Purpose

Most glossary sections answer "what is this term?" This section would
answer a different question: **"why does the vocabulary itself keep
changing?"** It is a meta-section — it teaches the reader that the
dictionary is a living historical record, not a fixed reference.

It exists because Red's 2026-05-21 guidance made explicit something the
FB.org master ingest kept surfacing: the same move carries different
names, notations, and sometimes ADD values across historical sources,
and that divergence is *legitimate history*, not error.

## Suggested title

> **Historical Evolution of Structural Understanding**

Alternate working titles (curator to choose):
- "How Freestyle Vocabulary Evolved"
- "Why the Same Trick Has Many Names"
- "The Dictionary as a Living Record"

## Placement (candidate)

Within the existing glossary section spine (§1–§11 live; §12 Pathways
deferred), this would sit late — it is an advanced/reflective section,
not a primer. Candidate: a new section adjacent to §11 "Community &
Historical Vocabulary," or a subsection within it. Curator decides
whether it is its own top-level section or a §11 expansion.

Tier badge: `advanced` (it presumes the reader already knows the
core vocabulary).

## Candidate topics (each a future subsection — none authored)

1. **Compression vs explicit structure.** Why spoken names compress
   ("Stepping Diving Paradox Torque Screw" is not a callable name) and
   why expanded decompositions exist alongside them. The two are
   different layers serving different jobs.

2. **Spoken names vs symbolic decomposition.** The four-layer model
   made reader-facing: a move's short name, its symbolic decomposition,
   its internal derivation, and its pedagogical explanation are four
   distinct artifacts.

3. **Historical ADD persistence.** Why a move's ADD number often
   stayed stable even as its structural reading changed — ADD identity
   and structural-interpretation identity are decoupled.

4. **Blurry → stepping conceptual evolution.** The worked example.
   `blurry` as historically-compressed vocabulary; `stepping` as the
   later structurally-explicit reading; both legitimate; the shift
   tracks evolving player cognition, not a correction.

5. **X-Dex reinterpretation history.** The one known exception class
   where reinterpreting hidden cross-body structure moved ADD values,
   not just readings. Why X-Dex is special.

6. **Evolving player cognition.** The human story: as players got
   better at seeing structure, the vocabulary got more explicit. The
   dictionary records that arc.

7. **Source-divergence legitimacy.** Why FB.org, FootbagMoves,
   PassBack, and IFPA disagree, and why the project preserves all four
   rather than collapsing them. Older sites were never updated; their
   content is a snapshot of its era.

8. **Rooted-family difficulty (candidate).** Rooted-style unique sets
   as a worked example of a structural ontology problem that resists
   tidy decomposition. Optional; lower priority per Red.

## Pedagogical framing notes (for the future author)

- This section should *teach restraint*: the reader should leave
  understanding that the dictionary deliberately does not force one
  answer where history offers several.
- It should name the four layers explicitly but lightly — it is a
  glossary section, not the doctrine document.
- It should use the blurry/stepping pair as the spine worked example;
  it is the most legible case.
- It must not leak parser jargon (`structural_parse_json`,
  `computed_adds`, `add_formula_status`) onto the public surface.
- It must not name individuals (per the no-individual-names rule for
  public freestyle surfaces). Red's guidance informs the section but
  Red is not named in rendered prose.
- It should carry no ADD adjudication — it explains *why* values are
  what they are historically, not what they *should* be.

## Explicitly out of scope for the future authoring slice

- No new route, no schema change, no service-method change beyond
  whatever `FreestyleGlossaryContent` field a new section needs.
- No retroactive editing of historical source data.
- No collapse of blurry/stepping or any source-divergence pair.
- No canonicalization of rooted-family topology.

## Dependencies / sequencing

- **Author after** the FB.org master ingest completes (5/6/7-ADD
  slices) — the section's source-divergence examples should draw on a
  complete master.
- **Author after** the blurry/stepping per-row coexistence triage
  (recommended doctrine slice 2 in [[HISTORICAL_ONTOLOGY_DOCTRINE]] §9)
  — so the worked example rests on confirmed per-row framing.
- Glossary architecture work (GA Phase 1/6, 2026-05-21) established the
  §1–§11 spine and the outward-link vocabulary; this section slots into
  that spine and should reuse its card/callout primitives.

---

*Scaffold only. Adopted as intent 2026-05-21; authoring deferred and
curator-gated.*
