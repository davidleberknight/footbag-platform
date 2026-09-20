/**
 * A curated clip tagged to a trick classifies as tutorial coverage because the
 * clip says so, through its own #tutorial tag.
 *
 * It used to classify because its source id was registered in a tier map, which
 * meant an unregistered source fell to the default and the same clip read
 * differently on the two surfaces that consulted it. The source is still carried
 * here, and still gets its friendly label, but it no longer decides what the
 * clip is for.
 *
 * The friendly coverage text is rendered; the raw source key never appears as
 * visible browse copy.
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
  // A PassBack Tutorials clip tagged to the trick. The clip says it teaches,
  // through its own #tutorial tag: classification stopped being a property of
  // the source id, so the source alone no longer decides how this reads.
  insertTtLesson(db, {
    uploader_member_id: uploader, ttNumber: 1, trickSlug: 'pbt_trick',
    videoId: 'pbtvid1', source_id: 'passback_tutorials',
    extraTags: ['#curated', '#tutorial'],
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
