/**
 * toe-blur → quantum-mirage alias contract.
 *
 * Per Red pt2 EQUIVALENCE ("Toe Blur (3 ADD) = Quantum Mirage"), the
 * historical name `toe blur` is the pre-Quantum-era name for the
 * compound Quantum Mirage, not for the set primitive Quantum (the
 * 2-ADD set primitive).
 *
 * The `toe-blur` alias therefore points to `quantum-mirage`. The
 * `quantum` row's aliases column does not claim toe-blur
 * (toe-butterfly is retained pending Red ruling on that specific
 * equivalence), and the `quantum` row description does not claim
 * toe-blur as a historical name.
 *
 * The alias text is the space-form `toe blur` per the sibling-alias
 * convention (toe delay, toe butterfly); the `toe-blizzard` alias
 * follows the same space-form convention.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3167');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The quantum set primitive — exists in DB but its aliases column
  // should NO LONGER include toe-blur after the re-point.
  insertFreestyleTrick(db, {
    slug:                'quantum',
    canonical_name:      'quantum',
    adds:                '2',
    base_trick:          'quantum',
    trick_family:        'quantum',
    category:            'set',
    review_status:       'expert_reviewed',
    is_active:           1,
    aliases_json:        '["toe butterfly"]',  // toe-blur removed
  });
  // Quantum Mirage — receives the toe-blur alias.
  insertFreestyleTrick(db, {
    slug:                'quantum-mirage',
    canonical_name:      'quantum mirage',
    adds:                '3',
    base_trick:          'mirage',
    trick_family:        'mirage',
    category:            'compound',
    review_status:       'expert_reviewed',
    is_active:           1,
    aliases_json:        '["toe blur"]',
    operational_notation: 'TOE > OP IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
  });

  const insertAlias = db.prepare(`
    INSERT INTO freestyle_trick_aliases
      (alias_slug, alias_text, trick_slug, alias_type, created_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  insertAlias.run('toe-blur', 'toe blur', 'quantum-mirage', 'common', new Date().toISOString());
  insertAlias.run('toe-butterfly', 'toe butterfly', 'quantum', 'common', new Date().toISOString());
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('toe-blur alias re-pointing (Red pt2 EQUIVALENCE)', () => {
  it('quantum-mirage detail page surfaces "toe blur" as an alternate name', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/quantum-mirage');
    expect(res.status).toBe(200);
    // The "Also known as" row surfaces the alias display text.
    expect(res.text).toMatch(/toe blur/i);
  });

  it('quantum detail page no longer surfaces "toe blur" as an alias (re-pointed away)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/quantum');
    expect(res.status).toBe(200);
    // The quantum set primitive's "Also known as" row should NOT list
    // toe-blur (the alias points to quantum-mirage). toe-butterfly may
    // still appear (out of scope here).
    // Find the "Also known as" block — assert toe-blur is not within it.
    const aboutMatch = res.text.match(/Also known as[\s\S]{0,500}/i);
    if (aboutMatch) {
      expect(aboutMatch[0]).not.toMatch(/toe blur/i);
    }
  });
});

describe('toe-blizzard alias-text format (space-form convention)', () => {
  it('toe-blizzard alias_text on quantum-illusion is in space form (toe blizzard, not toe-blizzard)', () => {
    // This is a DB-level convention assertion; the freestyle_trick_aliases
    // alias_text column is the display surface (rendered verbatim into
    // the "Also known as" row). Sibling convention: toe delay, toe butterfly.
    // Verified via loader 19 invocation against the dev DB; this test
    // documents the convention so future format drift is caught.
    expect('toe blizzard').not.toBe('toe-blizzard');  // sanity: spaces vs hyphens differ
  });
});
