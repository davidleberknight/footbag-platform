# Freestyle Feature — Checkpoint (v2.1 Data Layer)

## Status
Freestyle data layer is complete and stable. UI intentionally unchanged.

## What is implemented

### Schema
- Extended `freestyle_tricks`:
  - notation
  - review_status
  - is_core
  - is_active
  - updated_at
- Added tables:
  - freestyle_trick_sources
  - freestyle_trick_source_links
  - freestyle_trick_aliases
  - freestyle_trick_modifier_links
  - freestyle_trick_relations

### Loaders
- `17_load_trick_dictionary.py` (extended)
- `19_load_red_additions.py` (new)
- `20_link_footbag_org_sources.py` (new)

### Data state (dev DB)
- 95 tricks total
- 87 active
- 8 pending (is_active=0)
- 79 aliases
- 151 source_links
- 3 source registries:
  - curated-v1
  - red-husted-2026-04-20
  - footbag-org-2026-04

### QC
- `check_trick_source_disagreements.py`
- 4 ADD disagreements:
  - atom-smasher (4 vs 3)
  - flurry (4 vs 3)
  - fury (4 vs 5)
  - quantum (NULL vs 3)
- notation divergence expected (canonical not set yet)

---

## What is NOT implemented (intentionally deferred)

- UI updates for trick pages
- db.ts support for new tables
- service layer updates
- rendering of:
  - aliases
  - sources
  - relationships
- tests for new schema
- doc-sync / PR polish

---

## Known issues (deferred)

- Duplicate tricks:
  - atom-smasher vs atomsmasher
- reset-local-db.sh does NOT load trick dictionary
- modifier system not fully validated
- relationships table not populated yet

---

## Pending (waiting on Red)

- Quantum definition
- Merkon
- Terrage / Barrage behavior
- Royale / Ripstein
- Flail / Omelette mapping
- broader modifier structure
- family structure clarification

---

## Next entry point (when returning)

Start with:

1. App-side read-only rendering:
   - aliases
   - sources
   - notation

2. Validate trick pages visually

3. THEN:
   - process Red second response
   - expand dictionary (scraped 152 tricks)
   - refine relationships / modifiers

---

## Notes

- UI is stable and unchanged
- aliases_json retained for backward compatibility
- pending tricks are hidden but preserved with provenance
- system is now:
  - multi-source
  - expert-aware
  - QC-driven
