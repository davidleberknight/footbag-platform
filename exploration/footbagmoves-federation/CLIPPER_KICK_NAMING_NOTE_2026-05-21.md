# Clipper-Kick Naming — Decision Note — 2026-05-21

A naming / technical-debt note. **No data fix.** Records why
`clipper-kick` is *not* promoted as a new canonical row, so a future
reviewer does not re-attempt it and create a duplicate.

---

## The facts (current DB state — left unchanged)

The live `freestyle_tricks` table already separates the clipper kick,
the clipper stall, and the flying kick into distinct canonical rows:

| slug | adds | category | description |
|---|---|---|---|
| `clipper` | 1 | body | "Body kick into clipper position." — **this is the clipper kick** |
| `clipper-stall` | 2 | surface | the stall / delay (alias "clipper delay") |
| `flying-clipper` | 2 | body | "Jumping body kick into clipper position." — the flying kick (alias "jester") |

## Decision

- **`clipper-kick` is represented by canonical slug `clipper`.** The
  clipper kick already exists as a canonical row; it is simply slugged
  with the bare term `clipper`.
- **`clipper-stall` remains the separate stall/delay row.** Kick and
  stall are *not* collapsed — they are already distinct rows.
- **`flying clipper` currently means the flying *kick* variant** —
  the `flying-clipper` row is "Jumping body kick into clipper position."
- **Do NOT insert a `clipper-kick` row.** It would duplicate the
  existing `clipper` row. The FB.org-master `clipper-kick` staging row
  is therefore `curator_decision=reject` (don't-insert), not because
  the trick is doubtful but because it is already canonical.
- **Do NOT add "clipper kick" as an alias of `clipper`.** `clipper` is
  an overloaded umbrella term (it reads as kick, as stall/delay, and
  as the position/contact family); piling another alias onto it
  deepens the ambiguity rather than resolving it.

## Why no rename now

The semantically cleaner end-state would rename the ambiguously-named
rows:

- `clipper` → `clipper-kick`
- `flying-clipper` → `flying-clipper-kick`

That is **deliberately deferred.** `clipper` is a core atom
(`is_core=1`) and the slug is referenced across ~8 `src/` files
(`freestyleService.ts`, `glossaryAnchors.ts`,
`semanticNotationRendering.ts`, `symbolicProgressions.ts`, and four
`content/` modules); `flying-clipper` is referenced in
`freestyleSymbolicEquivalences.ts`, `freestyleResolvedFormulas.ts`,
`freestyleService.ts`. Renaming is a cross-cutting slug migration
touching core-atom references, service code, content modules, glossary
anchors, and tests — a dedicated slice, not a step inside federation
intake.

## Future optional cleanup (technical debt — not scheduled)

A dedicated **slug-migration slice** could later:

1. rename `clipper` → `clipper-kick` (DB row, `base_trick` /
   `trick_family` references, all `src/` code references, content
   modules, glossary anchors, tests);
2. rename `flying-clipper` → `flying-clipper-kick` likewise;
3. decide whether a bare `clipper` umbrella row (pure position /
   family-root concept, no ADD) should then exist, or whether
   `clipper` survives only as a `trick_family` label.

Until that slice is scoped and approved, the bare `clipper` slug
stands as legacy naming. This is a known, documented debt — not a bug.

## For future reviewers

> If you are reviewing the FB.org INSERT staging queue or any
> federation intake: **`clipper-kick` is already canonical as the
> `clipper` row.** Do not insert a `clipper-kick` row and do not add a
> `clipper kick` alias. See this note.

## Cross-references

- `FBORG_INSERT_STAGING_QUEUE_2026-05-21.csv` — `clipper-kick` row,
  `curator_decision=reject` with this note cited.
- `FBORG_INSERT_TRIAGE_2026-05-21.md` — triage REJECT entry updated to
  point here.
- `SYMBOLIC_GRAMMAR_MASTER.csv` — `clipper-kick` row `equivalent_to`
  corrected to point at the live `clipper` row.
