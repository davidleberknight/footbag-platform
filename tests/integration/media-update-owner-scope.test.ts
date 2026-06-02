/**
 * Defense-in-depth: the member-media UPDATE statements
 * (`updateMemberMediaCaption`, `setMediaItemExternalUrl`) are owner-scoped via
 * `AND uploader_member_id = ?`. A write addressed with a correct row id but a
 * non-owner member id must affect zero rows. The service layer reads the
 * owner-scoped row before writing, so this guard is only reachable at the
 * statement layer; this test exercises the prepared statements directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertMediaItem } from '../fixtures/factories';

const { dbPath } = setTestEnv('3981');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let media: typeof import('../../src/db/db').media;

const OWNER = 'media-owner-scope-owner';
const OTHER = 'media-owner-scope-other';
let mediaId: string;

const NOW = '2026-01-01T00:00:00.000Z';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER, slug: 'mos_owner' });
  insertMember(db, { id: OTHER, slug: 'mos_other' });
  mediaId = insertMediaItem(db, { uploader_member_id: OWNER, caption: 'original' });
  db.close();
  ({ media } = await import('../../src/db/db'));
});

afterAll(() => cleanupTestDb(dbPath));

describe('member-media UPDATE owner scoping', () => {
  it('updateMemberMediaCaption is a no-op for a non-owner member id', () => {
    const res = media.updateMemberMediaCaption.run('hijacked', NOW, mediaId, OTHER);
    expect(res.changes).toBe(0);
  });

  it('updateMemberMediaCaption applies for the owner member id', () => {
    const res = media.updateMemberMediaCaption.run('owner-edit', NOW, mediaId, OWNER);
    expect(res.changes).toBe(1);
  });

  it('setMediaItemExternalUrl is a no-op for a non-owner member id', () => {
    const res = media.setMediaItemExternalUrl.run('https://example.com/x', NOW, mediaId, OTHER);
    expect(res.changes).toBe(0);
  });

  it('setMediaItemExternalUrl applies for the owner member id', () => {
    const res = media.setMediaItemExternalUrl.run('https://example.com/y', NOW, mediaId, OWNER);
    expect(res.changes).toBe(1);
  });
});
