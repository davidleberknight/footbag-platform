/**
 * Representative size guard for GET /freestyle/glossary.
 *
 * The glossary's rendered size scales with the dictionary: the family trees, the
 * connective panels, and the core-trick grids all fill out with real trick rows.
 * Measuring a sparse fixture under-counts the page a visitor actually loads, so
 * this guard renders against a full-dictionary snapshot (every active trick,
 * every modifier, every displayed alias) and caps the rendered byte count. It is
 * the authoritative re-bloat protection for the glossary.
 *
 * The snapshot lives in tests/fixtures/freestyleDictionarySnapshot.json, a
 * point-in-time export of the active dictionary. Regenerate it from the built
 * database by selecting, into { tricks, modifiers, aliases }:
 *   - freestyle_tricks WHERE is_active=1: slug, canonical_name, adds, base_trick,
 *     trick_family, category, description, aliases_json, notation,
 *     operational_notation, sort_order
 *   - freestyle_trick_modifiers: slug, modifier_name, add_bonus,
 *     add_bonus_rotational, modifier_type, notes
 *   - freestyle_trick_aliases WHERE alias_display=1: alias_text, trick_slug
 * The trick description and aliases_json columns are stored null in the fixture
 * because the glossary does not render them; nulling keeps the fixture compact
 * without changing the rendered byte count. If the glossary ever renders either,
 * regenerate with their real values so the guard stays representative.
 *
 * Baseline history (representative full-dictionary render). The ceiling sits a
 * documented margin above the baseline; a future addition that pushes past it
 * must raise the ceiling AND add a baseline entry explaining the growth, so page
 * growth is never silent. This inherits the intent of the earlier sparse-fixture
 * guard, which under-measured the real page and is retired by this one:
 *   306,564 bytes  full active dictionary (919 tricks / 33 modifiers / 339
 *                  aliases) plus the movement-neighbor "eight closest relatives"
 *                  figure and the compound-name decoder. Byte-identical to the
 *                  live full-database render, confirming the fixture is
 *                  representative. Ceiling 320,000 leaves about 13,400 bytes
 *                  (~4.4%) of headroom.
 */
import { readFileSync } from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickAlias,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3565');
let createApp: Awaited<ReturnType<typeof importApp>>;

// Ceiling set with modest documented headroom above the representative baseline
// (306,564 bytes). See the baseline history in the file header.
const CEILING = 320_000;

interface Snapshot {
  tricks: Record<string, unknown>[];
  modifiers: Record<string, unknown>[];
  aliases: { alias_text: string; trick_slug: string }[];
}

beforeAll(async () => {
  const snapshot = JSON.parse(
    readFileSync(path.join(__dirname, '../fixtures/freestyleDictionarySnapshot.json'), 'utf8'),
  ) as Snapshot;
  const db = createTestDb(dbPath);
  for (const t of snapshot.tricks) insertFreestyleTrick(db, { ...t, is_active: 1 });
  for (const m of snapshot.modifiers) insertFreestyleTrickModifier(db, m);
  snapshot.aliases.forEach((a, i) =>
    insertFreestyleTrickAlias(db, `alias_snapshot_${i}`, a.trick_slug, a.alias_text),
  );
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Freestyle glossary — representative re-bloat guard', () => {
  it('rendered glossary body stays within the size ceiling against the full dictionary', async () => {
    const res = await request(await createApp()).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    const bytes = res.text.length;
    expect(bytes, `glossary rendered ${bytes} bytes; ceiling ${CEILING} bytes`).toBeLessThan(CEILING);
  });
});
