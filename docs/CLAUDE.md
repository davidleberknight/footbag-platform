# CLAUDE.md

## Source precedence

Follow root CLAUDE.md source-of-truth order. Additionally:
- When `docs/TESTING.md`, `.claude/rules/view-layer.md`, or a service's file-header JSDoc disagrees with current code, the canonical source describes the target pattern and the code describes current behavior; the gap is a deviation tracked in `IMPLEMENTATION_PLAN.md`, not canonical drift.
- Surface conflicts explicitly; do not silently blend incompatible sources.

## Documentation rules

- Canonical docs are references, not scope trackers, except `IMPLEMENTATION_PLAN.md` which is the active-slice governor.
- Use the `doc-sync` skill for drift detection or synchronization.
- Do not edit any doc without explicit human consent.
- State what the system does (the real mechanism), not what it lacks: write the positive behavior, never a negative requirement like "there is no X" or "not gated".
