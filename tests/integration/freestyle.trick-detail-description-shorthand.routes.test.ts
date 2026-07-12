/**
 * Trick-detail description shorthand suppression.
 *
 * Auto-generated structural-placeholder descriptions (a "; JOB" notation echo,
 * notation bracket tokens, or ADD-arithmetic shorthand like "4 ADD = x(+1) +
 * y(3)") belong in the notation and ADD blocks, not in the About prose. The
 * trick About block applies the single-home suppression policy, so those
 * descriptions never render as public copy. Genuine coaching prose still
 * renders.
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

const { dbPath } = setTestEnv('3568');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // A trick whose description is a generated shorthand backfill.
  insertFreestyleTrick(db, {
    slug: 'shorthand_placeholder', canonical_name: 'shorthand placeholder', adds: '4',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    description: 'Placeholder modifier on shorthandbase base. 4 ADD = placeholder(+1) + shorthandbase(3); JOB CLIP > SAME IN [DEX] [PDX]',
    operational_notation: 'CLIP > SAME IN [DEX] [PDX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  // A trick with genuine reader-facing prose, which must still render.
  insertFreestyleTrick(db, {
    slug: 'genuine_prose', canonical_name: 'genuine prose', adds: '3',
    base_trick: 'whirl', trick_family: 'whirl', category: 'dex',
    description: 'A clear coaching sentence describing how the leg circles the bag.',
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — description shorthand suppression', () => {
  it('suppresses a structural-placeholder description (no shorthand as public prose)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/shorthand_placeholder');
    expect(res.status).toBe(200);
    // These strings occur only in the description, never in the notation or ADD
    // blocks, so their absence proves the About prose did not render.
    expect(res.text).not.toContain('ADD = placeholder');
    expect(res.text).not.toContain('modifier on shorthandbase base');
    expect(res.text).not.toContain('placeholder(+1)');
  });

  it('still renders a genuine coaching description', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/genuine_prose');
    expect(res.status).toBe(200);
    expect(res.text).toContain('A clear coaching sentence describing how the leg circles the bag.');
  });
});
