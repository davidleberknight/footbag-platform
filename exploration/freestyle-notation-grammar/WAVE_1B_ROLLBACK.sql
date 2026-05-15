-- OP-NOTATION-WAVE-1B rollback SQL
-- Reverts the 27 compound-row operational_notation inserts (Tier 1 + Tier 2)
-- to NULL. Use after Wave-1B has been applied if a full rollback is needed.
--
-- USAGE:
--   sqlite3 database/footbag.db < exploration/freestyle-notation-grammar/WAVE_1B_ROLLBACK.sql
--
-- NOTE: Wave-1B Tier 1 (21 rows, no Red flag) and Tier 2 (6 rows, XDEX/PDX
-- flag) may be applied in separate transactions. This rollback reverts BOTH
-- in one transaction; partial rollback requires editing the slug list below.

BEGIN TRANSACTION;

UPDATE freestyle_tricks
SET operational_notation = NULL
WHERE slug IN (
  -- Tier 1 (no Red dependency, 21 rows)
  'dimwalk',
  'ripwalk',
  'torque',
  'mobius',
  'drifter',
  'blender',
  'vortex',
  'eggbeater',
  'smudge',
  'smoke',
  'smog',
  'parkwalk',
  'paradon',
  'flurry',
  'grave-digger',
  'royale',
  'surge',
  'surreal',
  'venom',
  'spyro-gyro',
  'bigwalk',
  -- Tier 2 (XDEX / PDX flagged, 6 rows)
  'omelette',
  'fusion',
  'plasma',
  'fury',
  'nemesis',
  'gauntlet'
)
  AND is_active = 1;

-- Verify rollback
SELECT 'Post-rollback verification (expect all 27 rows NULL):' AS marker;
SELECT slug, adds, operational_notation
FROM freestyle_tricks
WHERE slug IN (
  'dimwalk','ripwalk','torque','mobius','drifter','blender','vortex',
  'eggbeater','smudge','smoke','smog','parkwalk','paradon','flurry',
  'grave-digger','royale','surge','surreal','venom','spyro-gyro','bigwalk',
  'omelette','fusion','plasma','fury','nemesis','gauntlet'
)
ORDER BY adds, slug;

COMMIT;
