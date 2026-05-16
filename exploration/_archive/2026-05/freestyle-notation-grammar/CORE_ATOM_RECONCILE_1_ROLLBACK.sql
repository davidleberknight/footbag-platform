-- CORE-ATOM-CANONICAL-RECONCILE-1 rollback SQL (applied 2026-05-15)
-- Reverses the 10 row operations:
--   • around-the-world canonical_name title-case
--   • reverse-around-the-world → orbit slug rename + 5 field updates
--   • 2 alias re-points + 1 alias insert
--   • clipper canonical_name + is_core
--   • clipper-stall canonical_name + is_core
--   • toe-stall is_core
--
-- USAGE:
--   sqlite3 database/footbag.db < exploration/freestyle-notation-grammar/CORE_ATOM_RECONCILE_1_ROLLBACK.sql

BEGIN TRANSACTION;

-- Revert around-the-world canonical_name
UPDATE freestyle_tricks SET canonical_name='around the world' WHERE slug='around-the-world';

-- Revert orbit → reverse-around-the-world
UPDATE freestyle_tricks
SET slug                 = 'reverse-around-the-world',
    canonical_name       = 'reverse around the world',
    is_core              = 0,
    base_trick           = 'around-the-world',
    trick_family         = 'atw',
    operational_notation = NULL
WHERE slug='orbit';

-- Remove the inserted reverse-around-the-world alias FIRST (FK depends on
-- the still-existing 'reverse-around-the-world' freestyle_tricks row that
-- the slug-rename revert below restores).
DELETE FROM freestyle_trick_aliases WHERE alias_slug='reverse-around-the-world';

-- Revert alias re-points
UPDATE freestyle_trick_aliases SET trick_slug='reverse-around-the-world' WHERE alias_slug IN ('ratw','reverse-atw');

-- Revert clipper (kick)
UPDATE freestyle_tricks SET canonical_name='clipper', is_core=1 WHERE slug='clipper';

-- Revert clipper-stall
UPDATE freestyle_tricks SET canonical_name='clipper stall', is_core=0 WHERE slug='clipper-stall';

-- Revert toe-stall
UPDATE freestyle_tricks SET is_core=0 WHERE slug='toe-stall';

-- Verify
SELECT 'Post-rollback verification:' AS marker;
SELECT slug, canonical_name, adds, is_core
FROM freestyle_tricks
WHERE slug IN ('around-the-world','reverse-around-the-world','orbit','clipper','clipper-stall','toe-stall')
ORDER BY adds, slug;
SELECT alias_slug, alias_text, trick_slug FROM freestyle_trick_aliases
WHERE alias_slug IN ('ratw','reverse-atw','reverse-around-the-world');

COMMIT;
