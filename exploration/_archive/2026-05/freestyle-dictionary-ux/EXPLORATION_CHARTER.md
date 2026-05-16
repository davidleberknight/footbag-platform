# Exploration Lane: Freestyle Dictionary UX

**Status:** Sandbox. Not production. Not policy. Not scope.

## Purpose

Exercise the freestyle-dictionary ontology against concrete user-facing layouts to discover where the structure feels right, where it feels overwhelming, and where it surfaces gaps the data model doesn't yet reveal.

The goal is **learning**, not building. Decisions remain deferred. The exploration may produce direction, hesitation, redirection, or disposal — any outcome is acceptable.

## What this lane is

- A workspace for projecting the ontology into mockup form
- A place to surface UX questions, tensions, and trade-offs as they emerge
- A reference future Claude sessions can read to understand what was tried and why
- Markdown documents, ASCII wireframes, prose reasoning

## What this lane is NOT

- Not production work
- Not implementation
- Not approved scope
- Not a commitment to ship anything
- Not a substitute for `IMPLEMENTATION_PLAN.md`, `USER_STORIES.md`, or `CANONICALIZATION_POLICY.md`

## Boundaries (hard rules)

The exploration MUST NOT:

- Modify CSVs (canonical or curated)
- Modify ontology (no new tricks, no canonical/alias decisions, no modifier changes)
- Modify schema or any DB tables
- Modify loaders or pipeline scripts
- Add production routes / controllers / services / templates
- Add frontend code (no HTML, CSS, JS)
- Modify gallery configuration
- Touch `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md`
- Touch `docs/USER_STORIES.md`, `docs/SERVICE_CATALOG.md`, `docs/VIEW_CATALOG.md`
- Touch `IMPLEMENTATION_PLAN.md`

If a question arises that requires touching any of those, **escalate** — do not silently update them based on exploration findings.

## What this lane CAN produce

- Mockup documents (markdown + ASCII)
- UX-question logs
- Comparative analyses against competitor sites
- Open-question lists for future expert-review packets
- Recommendations to influence later production scope (after explicit human decision)

## Authorship norms

- Speculative content is welcome
- "I'm not sure" / "this might fail" is welcome
- Counter-arguments to recommendations should be captured, not hidden
- Real ontology data should anchor mockups (use actual trick names, ADDs, families)
- Avoid inventing tricks, ADDs, relationships not in the current dictionary

## Lifecycle

The lane has three exit states:

1. **Promotion** — a finding becomes scope. The user explicitly decides to ship it; the relevant production paths apply (services, templates, tests, doc-sync, prepare-pr). The exploration document stays here for historical reference.
2. **Disposal** — a finding is rejected. The exploration document stays here as a "we considered this and chose not to" record.
3. **Active** — exploration continues. New mockups, more questions, no decisions yet.

Files in this lane do not require doc-sync. They are not canonical sources.

## File layout

```
exploration/freestyle-dictionary-ux/
├── EXPLORATION_CHARTER.md           ← this file
└── FAMILY_PAGE_WHIRL_MOCK.md        ← first mockup: Whirl family page concept
```

Future explorations may add:

- `LANDING_PAGE_MULTI_DOOR_MOCK.md`
- `TRICK_DETAIL_PROGRESSIVE_DISCLOSURE_MOCK.md`
- `ALIAS_HISTORICAL_VIEW_MOCK.md`
- `RELATIONSHIPS_GRAPH_VIEW_MOCK.md`
- per-mockup `OPEN_QUESTIONS.md` files capturing tensions surfaced

Each mockup is self-contained: anchored in real ontology data, ends with explicit open questions, names trade-offs.

## Cross-references

- `~/.claude/projects/.../memory/project_freestyle_dict_future_ia.md` — the strategic-direction memory entry that motivated this lane
- `legacy_data/inputs/curated/tricks/CANONICALIZATION_POLICY.md` — the binding ontology governance (not modified by exploration)
- `.claude/skills/footbag-freestyle-dictionary/SKILL.md` — current ontology layer rules
- `.claude/skills/club-leadership-surface/SKILL.md` — parallel "phase boundary + privacy gate" pattern (referenced for governance modeling)

## A note on volume

This lane should stay small. Three or four mockups, deeply considered, beat thirty shallow ones. If the exploration grows beyond a handful of files without producing decisions or kills, that itself is a signal — pause and ask whether the lane is doing useful work or accumulating speculation.
