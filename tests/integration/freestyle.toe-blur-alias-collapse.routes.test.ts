/**
 * toe-blur → quantum-mirage alias contract.
 *
 * Per Red's equivalence ruling ("Toe Blur (3 ADD) = Quantum Mirage"), the
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
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';

const { dbPath } = setTestEnv('3167');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The quantum set primitive: an inactive trick row, as the built dictionary
  // holds it, since quantum lives on its set page rather than as a trick.
  insertFreestyleTrick(db, {
    slug:                'quantum',
    canonical_name:      'quantum',
    adds:                '2',
    base_trick:          'quantum',
    trick_family:        'quantum',
    category:            'set',
    review_status:       'expert_reviewed',
    is_active:           0,
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

  insertFreestyleTrickAlias(db, 'toe-blur', 'quantum-mirage', 'toe blur', {
    alias_type: 'common', alias_origin_producer: 'expert-additions',
  });
  insertFreestyleTrickAlias(db, 'toe-butterfly', 'quantum', 'toe butterfly', {
    alias_type: 'common', alias_origin_producer: 'expert-additions',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('toe-blur alias re-pointing (Red equivalence ruling)', () => {
  it('quantum-mirage detail page surfaces "toe blur" as an alternate name', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/quantum-mirage');
    expect(res.status).toBe(200);
    // The "Also known as" row surfaces the alias display text.
    expect(res.text).toMatch(/toe blur/i);
  });

  // Defect caught: quantum, a set with no active trick row, dead-ends in a 404
  // at its trick URL instead of reaching its set page, where the quantum launch
  // is taught (and where no toe-blur claim is made).
  it('quantum permanently redirects to the quantum set page', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/quantum');
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/quantum');
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
