/**
 * Zulu / Weaving first-batch promotion.
 *
 * Zulu and Weaving are ducking sets (Zulu: the bag travels across the body
 * before the duck; Weaving: the bag is caught on the same foot that performed
 * the set). Their first-batch compounds mirror the matching Ducking compound's
 * base chain and ADD, with a non-scoring annotation for the distinguishing
 * launch detail.
 *
 * Pins:
 *   - the canonical set page derives its example-tricks section from
 *     freestyle_trick_modifier_links, so a promoted compound linked to the set
 *     surfaces on /freestyle/sets/weaving and /freestyle/sets/zulu;
 *   - the promoted bare compounds are removed from the Emerging Vocabulary
 *     (TRACKED_UNPUBLISHED_NAMES), since they are now canonical-published.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink } from '../fixtures/factories';

const { dbPath } = setTestEnv('3258');

let createApp: Awaited<ReturnType<typeof importApp>>;

// (base, family, adds) for the six first-batch bases, mirroring the live
// ducking_<base> exemplars.
const BASES: ReadonlyArray<[string, string, string, string]> = [
  ['mirage',   'mirage',        '3', 'TOE > DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]'],
  ['clipper',  'clipper_stall', '3', 'TOE > DUCK [BOD] > SAME CLIP [XBD] [DEL]'],
  ['legover',  'legover',       '3', 'TOE > DUCK [BOD] > OP OUT [DEX] > SAME TOE [DEL]'],
  ['butterfly','butterfly',     '4', 'SET > DUCK [BOD] > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]'],
  ['whirl',    'whirl',         '4', 'SET > DUCK [BOD] > OP IN [DEX] > OP CLIP [XBD] [DEL]'],
  ['osis',     'osis',          '4', 'SET > DUCK [BOD] > SAME/OP OSIS [BOD] [XBD] [DEL]'],
];

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const setSlug of ['weaving', 'zulu'] as const) {
    insertFreestyleTrickModifier(db, {
      slug: setSlug, modifier_name: setSlug, add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body', notes: '',
    });
    for (const [base, family, adds, notation] of BASES) {
      const slug = `${setSlug}_${base}`;
      insertFreestyleTrick(db, {
        slug, canonical_name: `${setSlug} ${base}`, adds,
        base_trick: base, trick_family: family, category: 'compound',
        operational_notation: notation, review_status: 'expert_reviewed', is_active: 1,
      });
      insertFreestyleTrickModifierLink(db, slug, setSlug);
    }
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Zulu / Weaving encyclopedia example sections derive from modifier links', () => {
  for (const setSlug of ['weaving', 'zulu'] as const) {
    it(`/freestyle/sets/${setSlug} renders its promoted compounds as example tricks`, async () => {
      const res = await request(await createApp()).get(`/freestyle/sets/${setSlug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('class="set-detail-trick-list"');
      // every first-batch compound for this set is linked from the example section
      for (const [base] of BASES) {
        expect(res.text, `${setSlug} ${base} example link`).toContain(`href="/freestyle/tricks/${setSlug}_${base}"`);
      }
    });
  }
});

describe('Zulu / Weaving promoted compounds leave the Emerging Vocabulary', () => {
  it('the 12 promoted slugs do NOT appear in TRACKED_UNPUBLISHED_NAMES', async () => {
    const { TRACKED_UNPUBLISHED_NAMES } = await import('../../src/content/freestyleTrackedNames');
    const tracked = new Set<string>();
    for (const group of TRACKED_UNPUBLISHED_NAMES) {
      for (const name of group.names) tracked.add(name.slug);
    }
    for (const setSlug of ['weaving', 'zulu']) {
      for (const [base] of BASES) {
        expect(tracked.has(`${setSlug}_${base}`), `${setSlug}_${base} still tracked`).toBe(false);
      }
    }
  });

  it('a non-promoted neighbour (weaving_guay) is still tracked', async () => {
    const { TRACKED_UNPUBLISHED_NAMES } = await import('../../src/content/freestyleTrackedNames');
    const tracked = new Set<string>();
    for (const group of TRACKED_UNPUBLISHED_NAMES) {
      for (const name of group.names) tracked.add(name.slug);
    }
    expect(tracked.has('weaving_guay')).toBe(true);
  });
});
