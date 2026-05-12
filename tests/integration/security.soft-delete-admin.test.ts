/**
 * Regression: a soft-deleted admin member must NOT pass admin checks.
 *
 * The `account.getIsAdmin` and `account.listAdminMemberIds` statements feed
 * the admin short-circuit in `tierPredicates.isAdmin`. If those statements
 * read from the bare `members` table without filtering `deleted_at IS NULL`,
 * a soft-deleted admin row would still report `is_admin = 1` and pass every
 * tier predicate via the admin short-circuit.
 *
 * Defence-in-depth: the auth middleware uses `findMemberForSession` which
 * already filters via `members_active`, so a soft-deleted member cannot
 * start a session. But any code path that calls `getIsAdmin` directly
 * (background jobs, repair tasks, future seams) must observe the same
 * filter. Both statements query `members_active`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

const LIVE_ADMIN_ID  = 'member-live-admin';
const SOFT_DELETED_ADMIN_ID = 'member-soft-deleted-admin';
const PURGED_ADMIN_ID = 'member-purged-admin';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbModule: typeof import('../../src/db/db');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: LIVE_ADMIN_ID,
    slug: 'live_admin',
    login_email: 'live-admin@example.com',
    display_name: 'Live Admin',
    is_admin: 1,
  });
  insertMember(db, {
    id: SOFT_DELETED_ADMIN_ID,
    slug: 'soft_deleted_admin',
    login_email: 'soft-deleted-admin@example.com',
    display_name: 'Soft Deleted Admin',
    is_admin: 1,
    deleted_at: '2026-01-01T00:00:00.000Z',
  });
  insertMember(db, {
    id: PURGED_ADMIN_ID,
    slug: 'purged_admin',
    login_email: 'purged-admin@example.com',
    display_name: 'Purged Admin',
    is_admin: 1,
    personal_data_purged_at: '2026-01-01T00:00:00.000Z',
  });
  db.close();
  dbModule = await import('../../src/db/db');
});

afterAll(() => cleanupTestDb(dbPath));

describe('account.getIsAdmin filters soft-deleted and purged members', () => {
  it('returns is_admin=1 for a live admin', () => {
    const row = dbModule.account.getIsAdmin.get(LIVE_ADMIN_ID) as { is_admin: number } | undefined;
    expect(row?.is_admin).toBe(1);
  });

  it('returns no row for a soft-deleted admin (deleted_at IS NOT NULL filtered via members_active)', () => {
    const row = dbModule.account.getIsAdmin.get(SOFT_DELETED_ADMIN_ID) as { is_admin: number } | undefined;
    expect(row).toBeUndefined();
  });

  it('returns no row for a purged admin (personal_data_purged_at IS NOT NULL filtered)', () => {
    const row = dbModule.account.getIsAdmin.get(PURGED_ADMIN_ID) as { is_admin: number } | undefined;
    expect(row).toBeUndefined();
  });
});

describe('account.listAdminMemberIds filters soft-deleted and purged members', () => {
  it('only returns live admins', () => {
    const ids = dbModule.account.listAdminMemberIds.all() as Array<{ id: string }>;
    const idSet = new Set(ids.map(r => r.id));
    expect(idSet.has(LIVE_ADMIN_ID)).toBe(true);
    expect(idSet.has(SOFT_DELETED_ADMIN_ID)).toBe(false);
    expect(idSet.has(PURGED_ADMIN_ID)).toBe(false);
  });
});
