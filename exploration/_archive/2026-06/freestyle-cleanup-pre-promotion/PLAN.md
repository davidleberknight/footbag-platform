# Freestyle Pre-Promotion Cleanup Plan

Two read-only cleanup audits to run before the next trick-promotion / topology-coverage sprint, so the promotion work lands on clean fields and correct linkages.

**Hard scope guards.** No promotions. No doctrine changes. No new tricks. No broad rewrites. Audit first, propose minimal fixes, apply nothing until the audit reports are reviewed.

## Part 1 - Dictionary field hygiene
Structural list fields (ADD math, JOB notation) should be machine-readable and carry no explanatory prose. The audit scans every active trick's ADD/JOB/notation fields for semicolons, em dashes, parenthetical commentary, and editorial keywords ("historical name", "variant", "without terminal", "not family", "under review"), and proposes the smallest split that keeps the math structural and relocates prose to an existing prose field.

- Deliverable: `DICTIONARY_FIELD_HYGIENE_AUDIT.md` (affected tricks, current vs proposed clean text, prose destination, minimal fix plan).
- Finding in brief: the prose lives in the `derivation` field of `src/content/freestyleResolvedFormulas.ts`, not the DB. 11 flagged; 3 are clear editorial commentary to strip, 4 are structural glosses to review, 4 are math qualifiers to keep. JOB fields are clean.

## Part 2 - Media / record linkage integrity
Media and records must resolve to canonical trick slugs or wired aliases. The audit checks media-tag resolution, record-to-trick resolution, alias coverage, orphans, and missing reciprocal links, with the 2-bag-juggling mismatch as the worked case.

- Deliverables: `MEDIA_RECORD_LINKAGE_AUDIT.md` (orphans, unresolved aliases, mismatched slugs, missing links) and `MEDIA_RECORD_FIX_PLAN.md` (high-confidence wires, review-only cases, regression tests).
- Finding in brief: curated `media_tags` are essentially clean (2 minor orphans). The gap is `freestyle_records`, which links by `trick_name` through a pure slugify (`trickNameToSlug`) that neither strips side qualifiers nor maps aliases. 71 record names do not resolve: 1 juggle (alias wire), 20 qualifier-strip (resolver fix), 3 abbreviations + 47 compounds (review).

## Recommended smallest safe commit sequence
1. **Dictionary field hygiene fixes** - strip editorial prose from the 3 clear `derivation` fields (prose is already captured in `operator` / `provenance` / `description` / red_corrections), leaving structural math. Review the 4 structural glosses separately.
2. **Media alias / linkage fixes** - teach `trickNameToSlug` to strip side qualifiers (recovers 20 records) and wire the `2-bag-juggle` / `3-bag-juggle` aliases (recovers the juggle). Whitelist or retire the 2 orphan media tags.
3. **Regression tests** - resolver qualifier-strip unit test, record-to-trick reciprocal test, dictionary badge consistency test, and a named regression for `2-bag-juggling` / `2 bag juggle` / `2 bag juggling`.

Each step is independently revertible and independently testable. Steps 1 and 2 touch disjoint files; step 3 locks both.

## Status
Both audits are complete and read-only. The three audit/fix documents in this directory hold the detail. Nothing is applied. Awaiting review before any fix commit.
