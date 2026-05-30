/**
 * Schema-coupling canary for src/dev-bootstrap/seed.ts.
 *
 * The dev-admin-seed script writes raw INSERTs into `members`,
 * `member_tier_grants`, and `audit_entries`. A schema column rename,
 * drop, or new NOT NULL is silent until a maintainer next runs the seed
 * locally or via deploy-time staging-side exec and hits a SQLite error.
 * This test runs seedOne against a freshly-initialized schema and fails
 * as soon as any referenced column drifts away from the seed's
 * expectations.
 *
 * Also pins the env-guard, env-var-input path, and marker constants so a
 * silent change to seedConfig (e.g. relaxing the env guard or renaming a
 * marker) breaks this test.
 *
 * The test sets FOOTBAG_ENV='development' before importing seedOne
 * because seedConfig throws on import in any non-{development,staging}
 * env.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3094');
process.env.FOOTBAG_ENV = 'development';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let seedModule: typeof import('../../src/dev-bootstrap/seed');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  seedModule = await import('../../src/dev-bootstrap/seed');
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  delete process.env.FOOTBAG_DEV_ADMIN_SEED_JSON;
});

describe('dev-shortcuts/seed.seedOne — schema coupling + markers', () => {
  it('inserts members + member_tier_grants + audit_entries rows against the current schema', async () => {
    const db = new BetterSqlite3(dbPath);
    try {
      const result = await seedModule.seedOne(
        db,
        {
          loginEmail:  'schema-coupling@example.com',
          displayName: 'Schema Coupling',
          realName:    'Schema Coupling',
          tier:        'tier2',
        },
        // argon2 hash of an empty string; the test doesn't verify the hash,
        // only that the INSERT accepts a TEXT value in password_hash.
        '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        '2026-05-11T00:00:00.000Z',
      );
      expect(result).toBe('created');

      const m = db.prepare(
        `SELECT id, is_admin, login_email FROM members WHERE login_email = ?`,
      ).get('schema-coupling@example.com') as { id: string; is_admin: number; login_email: string } | undefined;
      expect(m).toBeDefined();
      expect(m!.is_admin).toBe(1);

      const grant = db.prepare(
        `SELECT reason_code, new_tier_status, created_by FROM member_tier_grants WHERE member_id = ?`,
      ).get(m!.id) as { reason_code: string; new_tier_status: string; created_by: string } | undefined;
      expect(grant).toBeDefined();
      expect(grant!.reason_code).toBe('dev_admin_seed.admin_tier2');
      expect(grant!.new_tier_status).toBe('tier2');
      expect(grant!.created_by).toBe('dev-shortcuts/seed');

      const audit = db.prepare(
        `SELECT action_type FROM audit_entries WHERE entity_id = ?`,
      ).get(m!.id) as { action_type: string } | undefined;
      expect(audit).toBeDefined();
      expect(audit!.action_type).toBe('grant_admin_dev_seed');
    } finally {
      db.close();
    }
  });

  it('re-seeding the same loginEmail is a no-op when the dev-admin-seed marker is already present', async () => {
    const db = new BetterSqlite3(dbPath);
    try {
      const result = await seedModule.seedOne(
        db,
        {
          loginEmail:  'schema-coupling@example.com',
          displayName: 'Schema Coupling',
          realName:    'Schema Coupling',
          tier:        'tier2',
        },
        '$argon2id$v=19$m=65536,t=3,p=4$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
        '2026-05-12T00:00:00.000Z',
      );
      expect(result).toBe('noop');
    } finally {
      db.close();
    }
  });
});

describe('dev-shortcuts/seedConfig — env-guard contract', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('refuses to import when FOOTBAG_ENV is unset', async () => {
    const prior = process.env.FOOTBAG_ENV;
    delete process.env.FOOTBAG_ENV;
    try {
      await expect(
        import('../../src/dev-bootstrap/seedConfig'),
      ).rejects.toThrow(/seedConfig may only be imported in FOOTBAG_ENV in \{development, staging\}/);
    } finally {
      process.env.FOOTBAG_ENV = prior;
    }
  });

  it('refuses to import under FOOTBAG_ENV=production', async () => {
    const prior = process.env.FOOTBAG_ENV;
    process.env.FOOTBAG_ENV = 'production';
    try {
      await expect(
        import('../../src/dev-bootstrap/seedConfig'),
      ).rejects.toThrow(/seedConfig may only be imported in FOOTBAG_ENV in \{development, staging\}/);
    } finally {
      process.env.FOOTBAG_ENV = prior;
    }
  });

  it('imports cleanly under FOOTBAG_ENV=staging (parity with FOOTBAG_ENV=development)', async () => {
    const prior = process.env.FOOTBAG_ENV;
    process.env.FOOTBAG_ENV = 'staging';
    try {
      const m = await import('../../src/dev-bootstrap/seedConfig');
      expect(m.DEV_ADMIN_SEED_REASON_CODE).toBe('dev_admin_seed.admin_tier2');
      expect(m.DEV_ADMIN_SEED_AUDIT_ACTION_TYPE).toBe('grant_admin_dev_seed');
      expect(m.DEV_ADMIN_SEED_CREATED_BY).toBe('dev-shortcuts/seed');
      expect(m.DEV_ADMIN_SEED_ENV_VAR_NAME).toBe('FOOTBAG_DEV_ADMIN_SEED_JSON');
    } finally {
      process.env.FOOTBAG_ENV = prior;
    }
  });
});
