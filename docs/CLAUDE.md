# CLAUDE.md

## Source precedence

Follow root CLAUDE.md source-of-truth order. Additionally:
- When `docs/VIEW_CATALOG.md` or `docs/SERVICE_CATALOG.md` disagrees with current code, the catalog describes the target pattern and the code describes current behavior; the gap is a deviation tracked in `IMPLEMENTATION_PLAN.md`, not catalog drift.
- Surface conflicts explicitly; do not silently blend incompatible sources.

## Documentation rules

- Canonical docs are references, not scope trackers — except `IMPLEMENTATION_PLAN.md` which is the active-slice governor.
- Use the `doc-sync` skill for drift detection or synchronization.
- Do not edit any doc without explicit human consent.
