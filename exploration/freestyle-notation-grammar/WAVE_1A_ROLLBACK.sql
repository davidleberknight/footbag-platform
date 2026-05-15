-- WAVE-1A rollback SQL
-- Reverses the 1 barfly migration + 11 atom-layer authoring inserts applied 2026-05-15.
-- Run as a single transaction; verifies rows after each segment.
--
-- USAGE:
--   sqlite3 database/footbag.db < exploration/freestyle-notation-grammar/WAVE_1A_ROLLBACK.sql

BEGIN TRANSACTION;

-- Segment 1: revert barfly to pre-§13.3 notation
UPDATE freestyle_tricks
SET operational_notation = 'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]'
WHERE slug = 'barfly' AND is_active = 1;

-- Segment 2: null out atom-layer operational_notation rows (revert to pre-Wave-1A)
UPDATE freestyle_tricks
SET operational_notation = NULL
WHERE slug IN (
  'toe-stall',
  'clipper-stall',
  'mirage',
  'illusion',
  'legover',
  'pickup',
  'around-the-world',
  'butterfly',
  'whirl',
  'swirl',
  'osis'
)
  AND is_active = 1;

-- Verify rollback
SELECT 'After rollback — barfly:' AS marker, operational_notation
FROM freestyle_tricks WHERE slug='barfly';

SELECT 'After rollback — atom rows (expect NULL):' AS marker, slug, operational_notation
FROM freestyle_tricks
WHERE slug IN ('toe-stall','clipper-stall','mirage','illusion','legover','pickup','around-the-world','butterfly','whirl','swirl','osis')
ORDER BY slug;

COMMIT;
