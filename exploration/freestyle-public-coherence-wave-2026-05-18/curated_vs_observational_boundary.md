# Curated vs Observational boundary

Phase B audit deliverable. Defines the explicit distinction between
curated canonical tricks and observational / external-source tricks so
the upcoming observational layer pilot (see `observational_layer_proposal.md`)
cannot dilute canonical governance standards.

## Two-layer separation contract

| Aspect | Curated canonical | Observational / external-source |
|---|---|---|
| Governance | Curator-confirmed; satisfies V1 + V2 publication contract | External-source documented; no curator confirmation yet |
| Storage | `freestyle_tricks` DB table | `src/content/freestyleObservationalTricks.ts` (curator-authored TypeScript content; reversible) |
| Trick-detail page | YES — `/freestyle/tricks/:slug` 200 + trick-shell render | NO — listed only in `/freestyle/observational` (proposed) |
| Hashtag identity | One canonical hashtag in `tags` table | NONE — observational entries never get hashtag chips |
| Formula | Required (notation OR equivalence OR core-atom marker) | Optional candidate readings; explicitly marked "proposed" |
| ADD value | Required (numeric or explicit unrated) | Numeric pending-canonicalization OR null |
| Family placement | Required (own slug for core atoms; base_trick for compounds) | NONE — observational entries don't get family classification |
| Browse discoverability | ADD view + at least one of family/movement-system/category | Observational-only listing surface |
| Media attachments | Allowed (curated media tagged with the canonical hashtag) | NONE — curator-gated media guarantee preserves observational separation |
| Cross-link from canonical surfaces | Allowed (other tricks link via family / aliases / parallels) | NONE — observational entries are never cross-linked from canonical pages |
| Render mode | Registered render modes only (V2 invariant 9) | Distinct observational card variant with explicit badge |
| Search results | Indexed as canonical when search lands | Indexed separately or not at all (TBD when search ships) |

## Promotion direction (observational → canonical only)

```
External corpus (PassBack / FootbagMoves / Shred Global / FB-Finland)
      ↓
Observational candidate
      ↓  curator review
      ↓
Promotion package: name + slug + ADD + base + family + notation/equivalence + hashtag
      ↓
Canonical curated trick (publication contract V1 + V2 gate)
```

Demotion (canonical → observational) is **not** a normal flow.
Removing a curated row requires explicit rejection rationale +
migration of inbound cross-links. This is a separate workflow,
deliberately discouraged.

## Forever-invariants (extends V1 §6 + V2 invariants 7-9)

1. **No canonical cross-contamination.** Observational entries never
   render inside canonical surfaces (landing core-tricks grid, ADD
   analysis worked examples, glossary term entries, trick-detail
   pages, family views, movement-system view).
2. **No hashtag bleed.** Observational entries never get a `#-tag`
   chip. The `#-tag` convention is canonical-only.
3. **No media bleed.** Curated media tags map to canonical hashtags;
   observational entries have no media-tag identity.
4. **No auto-promotion.** Frequency in external corpora (PassBack /
   FootbagMoves / etc.) never auto-promotes — see
   `[[feedback_frequency_not_authority]]`.
5. **No frequency-as-authority.** Corpus recurrence is evidence, not
   canonical status — per `[[feedback_frequency_not_authority]]`.
6. **Reversible storage.** Observational entries live in a TypeScript
   content module per `[[feedback_reversible_content_governance]]`;
   no DB schema, no migrations, no historical lock-in.

## Anti-patterns to refuse

- Allowing an observational entry to share a slug with a canonical
  trick (slug namespace collision).
- Auto-detecting a high-frequency PassBack name and silently making it
  canonical because "everyone uses it."
- Adding a hashtag chip to an observational card as a "preview."
- Cross-linking an observational entry from a canonical family panel
  ("see also: …").
- Inferring a canonical row from observational data even when the gap
  classification says `safe_not_written` — the curator-confirmation
  step is the gate, not the readability of the inferred name.

## Allowed bridging mechanics

- **Citation lines.** Observational entries cite their external source
  (PassBack / FootbagMoves / etc.). Canonical entries may carry
  matching citations under existing provenance fields without crossing
  the layer boundary.
- **Curator promotion notes.** A curator note on an observational
  entry ("ready for canonicalization pending ADD ruling") is the
  bridge — a structured prompt, not auto-promotion.
- **Manual demotion** (canonical → observational) only with explicit
  rationale documented in the IP + inbound-link migration plan.

## Gate enforcement

A new trick may join the curated set ONLY when:

1. V1 §1-§6 all satisfied.
2. V2 invariants 7-9 all satisfied.
3. All 12 field requirements in the V2 minimum-acceptable table.
4. Promotion package signed off (curator).

Until then it stays observational. The publication-contract gate is
the layer boundary.
