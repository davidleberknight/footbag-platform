/**
 * A curated media clip from the PassBack Tutorials source (source_id
 * 'passback_tutorials'), tagged to a trick, classifies as a TUTORIAL on the
 * browse surface because the source is registered in SOURCE_TIER. Without the
 * registration tierOf returns null and the clip falls to demo/default coverage
 * inconsistently. The friendly coverage text is rendered; the raw source key
 * never appears as visible browse copy.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertMember, insertFreestyleTrick, insertTtLesson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3784');
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const uploader = insertMember(db, { id: 'm-pbt', slug: 'pbt_uploader' });
  insertFreestyleTrick(db, {
    slug: 'pbt_trick', canonical_name: 'pbt trick', adds: '3',
    base_trick: 'pbt_trick', trick_family: 'pbt_trick', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
  });
  // A PassBack Tutorials clip tagged to the trick (the trick-tagged case the
  // registry gap left unclassified).
  insertTtLesson(db, {
    uploader_member_id: uploader, ttNumber: 1, trickSlug: 'pbt_trick',
    videoId: 'pbtvid1', source_id: 'passback_tutorials',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('PassBack Tutorials source — rendered classification', () => {
  it('classifies a passback_tutorials clip as Tutorial coverage, not Demo', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // The source is registered as TUTORIAL, so the only trick with media reads
    // as tutorial coverage; without the registration tierOf would be null and it
    // would read as demo coverage.
    expect(res.text).toContain('data-media-coverage="tutorial"');
    expect(res.text).not.toContain('data-media-coverage="demo"');
  });

  it('does not expose the raw passback_tutorials source key as rendered browse copy', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('passback_tutorials');
  });
});
