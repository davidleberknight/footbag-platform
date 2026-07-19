/**
 * Decomposition copy renders base tricks by their canonical display name, never
 * the raw machine slug. A trick built on a compound base (ducking_legover,
 * double_over_down, ...) shows the spaced canonical name in its editorial base
 * line, its composed derivation, and any parallel-trick decomposition summary.
 * The underscore slug stays only in links and identity, never in rendered prose.
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

const { dbPath } = setTestEnv('3767');

let createApp: Awaited<ReturnType<typeof importApp>>;

// [slug, canonical display name, adds]
const COMPOUNDS: Array<[string, string, string]> = [
  ['ducking_legover', 'ducking legover', '3'],
  ['ducking_mirage', 'ducking mirage', '3'],
  ['double_leg_over', 'double leg over', '3'],
  ['double_over_down', 'double over down', '4'],
  ['ducking_paradox_illusion', 'ducking paradox illusion', '4'],
  ['diving_butterfly', 'diving butterfly', '4'],
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Compound base rows: active with numeric ADD so they resolve; own families so
  // they are not parallels of the child tricks (which differ in ADD anyway).
  for (const [slug, name, adds] of COMPOUNDS) {
    insertFreestyleTrick(db, {
      slug, canonical_name: name, adds, base_trick: slug, trick_family: slug,
      category: 'compound', review_status: 'expert_reviewed', is_active: 1,
      operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
    });
  }
  // One child per compound, all sharing family + ADD so they are mutual parallels:
  // each child's editorial base is its compound, and each appears in the others'
  // parallel-decomposition summaries.
  COMPOUNDS.forEach(([slug], i) => {
    insertFreestyleTrick(db, {
      slug: `child_${i}`, canonical_name: `child ${i}`, adds: '5', base_trick: slug,
      trick_family: 'legover', category: 'compound', review_status: 'expert_reviewed',
      is_active: 1, operational_notation: 'SET > OP IN [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
      // A present (even minimal) parse enables the notation-grammar panel that
      // renders the editorial decomposition and its composed derivation.
      structural_parse_json: '{}',
    });
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — decomposition renders canonical base names', () => {
  it('the composed derivation shows each compound base by canonical name, not the raw slug', async () => {
    for (let i = 0; i < COMPOUNDS.length; i++) {
      const [slug, name] = COMPOUNDS[i];
      const res = await request(await createApp()).get(`/freestyle/tricks/child_${i}`);
      expect(res.status, `child_${i} status`).toBe(200);
      // The composed derivation reads "<base display name>(<adds>) = ...".
      expect(res.text, `${slug} derivation uses display name`).toContain(`${name}(`);
      // The old raw-slug derivation form "<slug>(<adds>)" is gone; hrefs that carry
      // the slug never append "(", so this is specific to the derivation prose.
      expect(res.text, `${slug} raw-slug derivation`).not.toContain(`${slug}(`);
    }
  });
});
