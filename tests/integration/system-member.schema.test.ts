/**
 * Schema invariants for the system member account (DD §2.8).
 *
 * Asserts the three-branch credential CHECK rejects malformed system rows
 * and accepts the well-formed alive-without-credentials shape, plus the
 * partial UNIQUE index enforces single-row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import type BetterSqlite3 from 'better-sqlite3';

const { dbPath } = setTestEnv('3204');

let db: BetterSqlite3.Database;

const TS = '2025-01-01T00:00:00.000Z';

function insertSystemMember(o: {
  id: string;
  isSystem: 0 | 1;
  loginEmail?: string | null;
  passwordHash?: string | null;
  personalDataPurgedAt?: string | null;
}): void {
  db.prepare(`
    INSERT INTO members (
      id, slug, login_email, login_email_normalized, email_verified_at,
      password_hash, password_changed_at, password_version,
      real_name, display_name, display_name_normalized,
      bio, city, country,
      is_admin, is_system, is_hof, is_bap, is_deceased,
      searchable, deleted_at, personal_data_purged_at,
      show_competitive_results,
      created_at, created_by, updated_at, updated_by, version
    ) VALUES (?, ?, ?, ?, ?, ?, ?, 1, 'Test', 'Test', 'test', '', NULL, NULL,
              0, ?, 0, 0, 0, 1, NULL, ?, 1, ?, 'seed', ?, 'seed', 1)
  `).run(
    o.id,
    `slug-${o.id}`,
    o.loginEmail ?? null,
    o.loginEmail ? o.loginEmail.toLowerCase() : null,
    o.loginEmail ? TS : null,
    o.passwordHash ?? null,
    o.passwordHash ? TS : null,
    o.isSystem,
    o.personalDataPurgedAt ?? null,
    TS, TS,
  );
}

beforeAll(() => {
  db = createTestDb(dbPath);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('members credential CHECK: three-branch invariant (DD §2.8)', () => {
  // Order matters: the CHECK-violation cases must run before any well-formed
  // is_system=1 row exists, otherwise the partial UNIQUE on is_system fires
  // first and we cannot observe the CHECK rejection.

  it('rejects is_system=1 paired with a populated login_email (no branch matches)', () => {
    expect(() => {
      insertSystemMember({
        id: 'sys-bad-email',
        isSystem: 1,
        loginEmail: 'should-not-be-here@example.com',
        passwordHash: '$argon2$test',
      });
    }).toThrowError(/CHECK constraint failed/);
  });

  it('rejects is_system=0 with all credentials NULL + not purged (non-system rows must be live or purged)', () => {
    expect(() => {
      insertSystemMember({ id: 'non-sys-no-creds', isSystem: 0 });
    }).toThrowError(/CHECK constraint failed/);
  });

  it('accepts a well-formed system-member row (is_system=1 + all credentials NULL + not purged)', () => {
    expect(() => {
      insertSystemMember({ id: 'sys-ok', isSystem: 1 });
    }).not.toThrow();
  });
});

describe('ux_members_system partial UNIQUE (DD §2.8)', () => {
  it('rejects a second is_system=1 row (single-row enforcement)', () => {
    // 'sys-ok' was inserted in the previous describe block.
    expect(() => {
      insertSystemMember({ id: 'sys-second', isSystem: 1 });
    }).toThrowError(/UNIQUE constraint failed/);
  });
});
