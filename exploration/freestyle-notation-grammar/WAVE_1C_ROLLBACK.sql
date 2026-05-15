-- OP-NOTATION-WAVE-1C rollback SQL
-- Reverts the 21 compound-row operational_notation inserts to NULL.
-- Tier 1 (11 clean rows) + Tier 2 (4 governance-flagged rows) +
-- Tier 3 (6 Wave-1B Tier-2 carryover rows; same governance flags).
--
-- USAGE:
--   sqlite3 database/footbag.db < exploration/freestyle-notation-grammar/WAVE_1C_ROLLBACK.sql
--
-- NOTE: Tier 1 + Tier 2 + Tier 3 may be applied in separate transactions.
-- This rollback reverts all three in one transaction; partial rollback
-- requires editing the slug list.

BEGIN TRANSACTION;

UPDATE freestyle_tricks
SET operational_notation = NULL
WHERE slug IN (
  -- Tier 1 (11 clean, no Red dependency)
  'smear',
  'magellan',
  'merkon',
  'reaper',
  'reverse-drifter',
  'atomic-butterfly',
  'sidewalk',
  'tombstone',
  'blurriest',
  'barraging-osis',
  'superfly',
  -- Tier 2 (4 new governance-flagged rows)
  'witchdoctor',
  'food-processor',
  'sumo',
  'tomahawk',
  -- Tier 3 (6 Wave-1B Tier-2 carryover; also governance-flagged)
  'omelette',
  'fury',
  'fusion',
  'plasma',
  'nemesis',
  'gauntlet'
)
  AND is_active = 1;

-- Verify rollback (expect all 21 NULL)
SELECT 'Post-rollback verification (expect all 21 NULL):' AS marker;
SELECT slug, adds, operational_notation FROM freestyle_tricks
WHERE slug IN (
  'smear','magellan','merkon','reaper','reverse-drifter','atomic-butterfly',
  'sidewalk','tombstone','blurriest','barraging-osis','superfly',
  'witchdoctor','food-processor','sumo','tomahawk',
  'omelette','fury','fusion','plasma','nemesis','gauntlet'
)
ORDER BY CAST(adds AS INTEGER), slug;

COMMIT;
