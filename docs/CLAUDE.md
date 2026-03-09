# CLAUDE.md

## Purpose
Local rules for editing project documentation.

## Source precedence
- Prefer the latest local docs when they conflict with older GitHub snapshots.
- Treat `PROJECT_SUMMARY_CONCISE.md` as the quickest repo overview.
- Use project docs to reconcile scope before writing new docs or suggesting edits.
- Surface conflicts instead of silently blending incompatible sources.
- Always ask the human if in doubt.

## Documentation rules
- Avoid broadening MVFP slice docs into whole-platform docs unless the human asks.
- Always invoke the doc-sync skill before making any doc edits, without exception.
- DO NOT EDIT PROJECT DOCUMENTS unless the human explicitly gives consent; use the doc-sync skill.

## MVFP scope note
- `docs/VIEW_CATALOG_V0_1.md` defines the current view scope for this Minimum Viable first-page slice.
- `docs/DEV_ONBOARDING_V0_1.md` is a draft setup guide covering the steps to stand up the required MVFP infrastructure and code.

