---
name: footbag-freestyle-dictionary
description: Use when adding, modifying, reviewing, or classifying freestyle trick / dictionary / glossary / modifier / alias / sequence data in the footbag-platform project. Enforces strict layer separation between trick dictionary, modifiers, aliases, glossary, sequence/combo analysis, and canonical competition results.
---

# Footbag Freestyle Dictionary Skill

Use this skill when adding, modifying, reviewing, or classifying freestyle trick / dictionary / glossary / sequence data in the footbag-platform project.

## Core Rule

Do not mix these layers:

- Trick Dictionary
- Modifier System
- Alias / Naming System
- Glossary / Terminology
- Sequence / Combo Analysis
- Canonical Competition Results

Each has different truth rules.

---

## 1. Trick Dictionary Layer

Use `freestyle_tricks` only for actual physical moves.

Examples:

- butterfly
- whirl
- ripwalk
- vortex
- atom smasher
- flurry

A trick should generally have:

- canonical name
- slug
- ADD value
- category / family
- description
- source / provenance
- review status

Do not store glossary terms here.

---

## 2. Modifier Layer

Use the modifier system for structural components that alter tricks.

Examples:

- atomic
- paradox
- gyro
- spinning
- stepping
- symposium
- pogo

Important:

- Some modifiers add ADDs.
- Some do not. Example: Red clarified that Pogo is a set but does not add ADD.
- Some concepts can exist both as a trick and a modifier form. Example: Barrage can be a standalone trick, while barraging can modify another trick.

Do not enforce ADD math globally unless expert-reviewed.

---

## 3. Alias / Naming Layer

Use aliases for naming evolution, abbreviations, and alternate terms.

Examples:

- Toe Blur → Quantum Mirage
- Toe Ripwalk → Quantum Butterfly
- Spyro → Inspin
- PS Whirl → Paradox Symposium Whirl

Rules:

- Modern community name should generally be canonical.
- Older names become historical aliases.
- Descriptive names can be aliases for named tricks.
- Do not merge identities silently when terminology is ambiguous.

---

## 4. Glossary / Terminology Layer

Glossary terms describe runs, style, scoring concepts, or community vocabulary.

They are not tricks and not modifiers.

Examples:

- guiltless
- tiltless
- fearless
- tripless
- beastly
- godly
- BOP
- dropless
- shuffle
- density
- shred circle

Important definitions:

- Tiltless = run where all tricks are 2+ ADD
- Guiltless = run where all tricks are 3+ ADD
- Tripless = run where all tricks are 4+ ADD
- Fearless = run where all tricks are 5+ ADD
- Beastly = run where all tricks are 6+ ADD
- Godly = run where all tricks are 7+ ADD
- BOP = Butterfly / Osis / Paradox Mirage

Rules:

- Do not store glossary terms in `freestyle_tricks`.
- Do not store glossary terms in `freestyle_trick_modifiers`.
- Prefer editorial markdown / static content first.
- Only create a glossary DB table if there is a clear product need.

---

## 5. Sequence / Combo Layer

Sequence and combo analysis is future work.

This layer describes how tricks are used in runs:

- streaks
- transitions
- connector tricks
- ADD density
- longest 5+ ADD streaks
- run quality labels

Do not treat records-based difficulty metrics as true combo metrics.

Current safe proxy:

- Freestyle Difficulty Index = records-based ADD profile
- It is not true combo / sequence analysis.

True combo analysis requires sequence-level data.

---

## 6. Canonical Competition Results Layer

Canonical results remain separate.

Use canonical results for:

- events
- disciplines
- placements
- participants
- freestyle doubles partnerships
- competition leaders

Never write trick dictionary or glossary content into canonical competition tables.

---

## Source / Truth Rules

Use this priority:

1. Expert-reviewed corrections from Red Husted
2. Curated project dictionary
3. footbag.org as source / provenance
4. scraped data as pending / unreviewed

footbag.org is an important source, but not automatic truth.

When sources disagree:

- canonical field wins
- preserve source disagreement in provenance
- emit / report QC conflicts
- do not silently overwrite

---

## Red Husted Clarifications

Known Red-reviewed points:

- Atom Smasher = 4 ADD due to X-Dex
- Flurry = 4 ADD
- Sidewalk should be added
- Tombstone should be added
- Flail and Omelette are common names and should be added
- Merkon is standalone
- Terrage and Barrage are standalone and can also be used compositionally
- Royale and Ripstein are primary / popular entries
- Eclipse is 3 ADD; hop-over portion counts
- 1 ADD delay / body tricks should be included
- Spyro is a trick, not a general modifier concept; name has largely shifted toward Inspin
- Surging = spinning + stepping
- Pogo is a set and does not add ADD
- Quantum is modern naming replacing older "toe" naming
- Gyro = spinning and dexing with the same foot that set the bag
- Atomic can be modeled as a standard modifier

---

## Activation / Review Rules

A trick row should be active only when:

- ADD value is known, if it is a trick
- canonical name is accepted
- ambiguity is resolved
- source / provenance is preserved
- `review_status` is `curated` or `expert_reviewed`

Pending rows:

- keep `is_active=0`
- preserve source links
- include review notes
- do not surface publicly

---

## Implementation Rules

Before changing schema or loading data:

1. Classify the concept layer.
2. Check whether it is a trick, modifier, alias, glossary term, or future sequence concept.
3. Preserve provenance.
4. Avoid UI changes unless explicitly requested.
5. Avoid mass-importing scraped rows without review.
6. Keep changes additive and reversible.

---

## Product Goal

Build a freestyle reference better than footbag.org by combining:

- complete dictionary coverage
- aliases and historical naming
- expert validation
- provenance
- relationships
- records
- player links
- future combo analytics

Do not copy footbag.org text wholesale. Extract concepts, rewrite clearly, attribute generously, and connect the data.
