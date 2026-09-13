/**
 * The takedown decision's object-storage half, with a stub storage adapter so
 * the contract is observable: hiding the item is what every public read
 * honours, and removing its stored objects is what stops the storage origin
 * still serving the bytes to anyone holding the URL.
 *
 * The order matters and is asserted: the row is hidden first, so a failure to
 * remove the objects can never leave a visible item, and the same decision run
 * again retries the removal without deciding anything a second time.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, seedEmailTemplates } from '../fixtures/testDb';
import {
  insertMember,
  completeOnboarding,
  insertMediaItem,
  insertMediaFlag,
} from '../fixtures/factories';
import type { MediaStorageAdapter } from '../../src/adapters/mediaStorageAdapter';

const { dbPath } = setTestEnv('4183');

let svcModule: typeof import('../../src/services/mediaModerationService');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000ms001';
const UPLOADER_ID = 'bbbbbbbb-0000-0000-0000-0000000ms002';
const REPORTER_ID = 'cccccccc-0000-0000-0000-0000000ms003';

const ITEM_OK = 'media_ms_ok';
const ITEM_FAILS = 'media_ms_fails';
const ITEM_ACTIVE = 'media_ms_active';

interface StubStorage extends MediaStorageAdapter {
  deleted: string[];
  failOn: Set<string>;
}

function stubStorage(): StubStorage {
  const deleted: string[] = [];
  const failOn = new Set<string>();
  return {
    deleted,
    failOn,
    async put() { /* unused */ },
    async get() { return Buffer.alloc(0); },
    async delete(key: string) {
      if (failOn.has(key)) throw new Error(`storage refused ${key}`);
      deleted.push(key);
    },
    constructURL(key: string) { return `/media-store/${key}`; },
    async exists() { return true; },
    async headSize() { return null; },
    async generatePresignedPutUrl() { return 'https://example.invalid/put'; },
  } as StubStorage;
}

function readDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath, { readonly: true });
}

function statusOf(mediaId: string): string {
  const db = readDb();
  const row = db.prepare('SELECT moderation_status FROM media_items WHERE id = ?').get(mediaId) as { moderation_status: string };
  db.close();
  return row.moderation_status;
}

function storageCards(mediaId: string): { id: string; status: string }[] {
  const db = readDb();
  const rows = db
    .prepare("SELECT id, status FROM work_queue_items WHERE task_type = 'media_takedown_storage_removal' AND entity_type = 'media_item' AND entity_id = ? ORDER BY id")
    .all(mediaId) as { id: string; status: string }[];
  db.close();
  return rows;
}

function auditCount(mediaId: string): number {
  const db = readDb();
  const row = db
    .prepare("SELECT COUNT(*) AS n FROM audit_entries WHERE entity_type = 'media_item' AND entity_id = ?")
    .get(mediaId) as { n: number };
  db.close();
  return row.n;
}

let storage: StubStorage;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedEmailTemplates(db);

  insertMember(db, { id: ADMIN_ID, slug: 'ms_admin', display_name: 'MS Admin', login_email: 'ms-admin@example.com', is_admin: 1 });
  insertMember(db, { id: UPLOADER_ID, slug: 'ms_uploader', display_name: 'MS Uploader', login_email: 'ms-uploader@example.com' });
  insertMember(db, { id: REPORTER_ID, slug: 'ms_reporter', display_name: 'MS Reporter', login_email: 'ms-reporter@example.com' });
  for (const id of [ADMIN_ID, UPLOADER_ID, REPORTER_ID]) completeOnboarding(db, id);

  for (const id of [ITEM_OK, ITEM_FAILS, ITEM_ACTIVE]) {
    insertMediaItem(db, {
      id,
      uploader_member_id: UPLOADER_ID,
      caption: `Caption ${id}`,
      s3_key_thumb: `${id}/thumb.jpg`,
      s3_key_display: `${id}/display.jpg`,
      tags: ['#by_ms_uploader'],
    });
    insertMediaFlag(db, { media_id: id, reporter_member_id: REPORTER_ID, reason_code: 'spam' });
  }

  db.close();
  svcModule = await import('../../src/services/mediaModerationService');
});

beforeEach(() => {
  storage = stubStorage();
});

afterAll(() => cleanupTestDb(dbPath));

describe('decideDelete — the stored objects', () => {
  it('hides the item and removes both stored objects', async () => {
    const svc = svcModule.createMediaModerationService({ storage });
    const result = await svc.decideDelete({
      mediaId: ITEM_OK,
      adminMemberId: ADMIN_ID,
      reason: 'Reported and removed.',
    });

    expect(result.status).toBe('decided');
    expect(result).toMatchObject({ storageRemoved: true });
    expect(storage.deleted.sort()).toEqual([`${ITEM_OK}/display.jpg`, `${ITEM_OK}/thumb.jpg`]);
    expect(statusOf(ITEM_OK)).toBe('removed_by_admin');
  });

  it('still hides the item when the storage removal fails, and says so', async () => {
    storage.failOn.add(`${ITEM_FAILS}/display.jpg`);
    const svc = svcModule.createMediaModerationService({ storage });

    const result = await svc.decideDelete({
      mediaId: ITEM_FAILS,
      adminMemberId: ADMIN_ID,
      reason: 'Reported and removed.',
    });

    expect(result.status).toBe('decided');
    expect(result).toMatchObject({ storageRemoved: false });
    // The item is out of sight even though its bytes survived, which is the
    // whole reason the row is hidden before the objects are touched.
    expect(statusOf(ITEM_FAILS)).toBe('removed_by_admin');
    expect(storage.deleted).toEqual([`${ITEM_FAILS}/thumb.jpg`]);
  });

  it('raises one queue card when the files survive, and does not stack a second on a failed retry', async () => {
    expect(storageCards(ITEM_FAILS).filter((c) => c.status === 'open')).toHaveLength(1);

    storage.failOn.add(`${ITEM_FAILS}/display.jpg`);
    const svc = svcModule.createMediaModerationService({ storage });
    const again = await svc.retryStorageRemoval({ mediaId: ITEM_FAILS, adminMemberId: ADMIN_ID });

    expect(again.status).toBe('still_failing');
    expect(storageCards(ITEM_FAILS)).toHaveLength(1);
    expect(storageCards(ITEM_FAILS)[0].status).toBe('open');
  });

  it('raises no card at all when the removal works first time', () => {
    expect(storageCards(ITEM_OK)).toHaveLength(0);
  });

  it('closes the card on a retry that works', async () => {
    const svc = svcModule.createMediaModerationService({ storage });
    const result = await svc.retryStorageRemoval({ mediaId: ITEM_FAILS, adminMemberId: ADMIN_ID });

    expect(result.status).toBe('removed');
    expect(storage.deleted.sort()).toEqual([`${ITEM_FAILS}/display.jpg`, `${ITEM_FAILS}/thumb.jpg`]);
    expect(storageCards(ITEM_FAILS)[0].status).toBe('resolved');
  });

  it('touches nothing when asked to retry an item that is still visible', async () => {
    const svc = svcModule.createMediaModerationService({ storage });
    const result = await svc.retryStorageRemoval({ mediaId: ITEM_ACTIVE, adminMemberId: ADMIN_ID });

    expect(result.status).toBe('not_applicable');
    // A visible item owes no files. Deleting its objects here would take the
    // bytes out from under a live item nobody decided against.
    expect(storage.deleted).toEqual([]);
    expect(statusOf(ITEM_ACTIVE)).toBe('active');
  });

  it('retries the removal on a second run without deciding the item again', async () => {
    const auditBefore = auditCount(ITEM_FAILS);
    const svc = svcModule.createMediaModerationService({ storage });

    const result = await svc.decideDelete({
      mediaId: ITEM_FAILS,
      adminMemberId: ADMIN_ID,
      reason: 'Trying the files again.',
    });

    expect(result.status).toBe('already_hidden');
    expect(result).toMatchObject({ storageRemoved: true });
    expect(storage.deleted.sort()).toEqual([`${ITEM_FAILS}/display.jpg`, `${ITEM_FAILS}/thumb.jpg`]);
    expect(auditCount(ITEM_FAILS)).toBe(auditBefore);
  });
});
