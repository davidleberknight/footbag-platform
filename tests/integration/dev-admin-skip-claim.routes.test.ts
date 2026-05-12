/**
 * Integration test for the dev-only admin shortcut on the legacy claim flow.
 *
 * When FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL=1 AND FOOTBAG_ENV=development AND
 * the requesting member is admin, `initiateLegacyClaim` runs the merge
 * synchronously WITHOUT requiring an email match. Used for dev testing of
 * the legacy claim flow when the operator's admin email isn't seeded as a
 * `legacy_email`. Production admins use `manualLegacyClaimRecovery` (DD §6.5).
 *
 * The env-config boot guard (verified in tests/unit/env-config.test.ts)
 * refuses to start the app with this flag in non-development environments.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, createTestSessionJwt } from '../fixtures/factories';

// Set dev-only flags BEFORE the env config singleton is loaded. setTestEnv
// must run after these so its assignments win for db paths but the dev
// flags are present at config-load time.
process.env.FOOTBAG_ENV = 'development';
process.env.FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL = '1';

const { dbPath } = setTestEnv('3199');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'devskip-admin';
const ADMIN_SLUG = 'devskip_admin';
const ADMIN_EMAIL = 'devskip-admin@example.com';

const ADMIN_STUB_ID = 'devskip-admin-stub';
const ADMIN_STUB_SLUG = 'devskip_admin_stub';
const ADMIN_STUB_EMAIL = 'devskip-admin-stub@example.com';

const NORMIE_ID = 'devskip-normie';
const NORMIE_SLUG = 'devskip_normie';
const NORMIE_EMAIL = 'devskip-normie@example.com';

const LEGACY_ID = 'LM-DEVSKIP';
const LEGACY_EMAIL = 'devskip-legacy@oldsite.example';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID,
    slug: ADMIN_SLUG,
    login_email: ADMIN_EMAIL,
    is_admin: 1,
  });
  insertMember(db, {
    id: ADMIN_STUB_ID,
    slug: ADMIN_STUB_SLUG,
    login_email: ADMIN_STUB_EMAIL,
    is_admin: 1,
  });
  insertMember(db, {
    id: NORMIE_ID,
    slug: NORMIE_SLUG,
    login_email: NORMIE_EMAIL,
  });
  insertLegacyMember(db, {
    legacy_member_id: LEGACY_ID,
    real_name: 'DevSkip Target',
    legacy_email: LEGACY_EMAIL,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

describe('dev admin claim shortcut (FOOTBAG_DEV_ADMIN_SKIP_CLAIM_EMAIL=1)', () => {
  it('admin + flag on + legacy_email != login_email -> 303 to wizard with linked=legacy, NO outbox enqueue', async () => {
    const app = createApp();
    const res = await app && await request(app)
      .post('/members/' + ADMIN_SLUG + '/link-history/find')
      .set('Cookie', cookieFor(ADMIN_ID))
      .type('form')
      .send({ identifier: LEGACY_ID });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${ADMIN_SLUG}/link-history?linked=legacy`);
  });

  it('admin + flag on + stub legacy row (NULL legacy_email) -> 303 to wizard with linked=legacy', async () => {
    // Regression: dev DBs without the full legacy data dump have stub
    // legacy_members rows where only legacy_member_id is populated. The
    // dev admin shortcut must run for these rows too; otherwise the
    // wizard's manual-id submit silently no-matches a row that demonstrably
    // exists. Production: config.devAdminSkipClaimEmail is fail-fast guarded
    // off, so this branch never fires outside development.
    const app = createApp();
    const stamp = Date.now();
    const stubLegacyId = `LM-DEVSKIP-STUB-${stamp}`;
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    insertLegacyMember(db, {
      legacy_member_id: stubLegacyId,
      // Intentionally omit legacy_email, real_name, etc. — the factory
      // defaults real_name to 'Legacy Member' but leaves legacy_email NULL,
      // which is the production-of-stub-row shape we are guarding against.
    });
    db.close();

    const res = await request(app)
      .post('/members/' + ADMIN_STUB_SLUG + '/link-history/find')
      .set('Cookie', cookieFor(ADMIN_STUB_ID))
      .type('form')
      .send({ identifier: stubLegacyId });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${ADMIN_STUB_SLUG}/link-history?linked=legacy`);
  });

  it('non-admin + flag on + stub legacy row -> falls through to no_match (no email to send to)', async () => {
    // Mirror of the stub-row test for non-admins. Without admin status the
    // dev shortcut does not fire, so the email path is the only remaining
    // option, but the row has no legacy_email. The service collapses to
    // no_match (anti-enumeration) and the controller emits the generic
    // "sent" UX with the dev outcomeNote.
    const app = createApp();
    const stamp = Date.now();
    const stubLegacyId = `LM-DEVSKIP-STUB-NORM-${stamp}`;
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    insertLegacyMember(db, { legacy_member_id: stubLegacyId });
    db.close();

    const res = await request(app)
      .post('/members/' + NORMIE_SLUG + '/link-history/find')
      .set('Cookie', cookieFor(NORMIE_ID))
      .type('form')
      .send({ identifier: stubLegacyId });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`^/members/${NORMIE_SLUG}/link-history\\?sent=1&out=no_match(&since=\\d+)?&nomatch=1&tried=LM-DEVSKIP-STUB-NORM-\\d+$`));
  });

  it('non-admin + flag on -> falls through to token-email path (admin-only shortcut)', async () => {
    const app = createApp();
    // Use a fresh legacy id so the per-target rate-limit from the prior test
    // doesn't fire silently. A normie's submission of a legacy id whose
    // legacy_email != login_email would normally enqueue a confirmation email.
    const stamp = Date.now();
    const freshLegacyId = `LM-DEVSKIP-NON-${stamp}`;
    const freshLegacyEmail = `devskip-non-${stamp}@oldsite.example`;
    // Reopen the DB to insert a fresh legacy row without re-loading schema.
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(dbPath);
    db.pragma('foreign_keys = ON');
    insertLegacyMember(db, {
      legacy_member_id: freshLegacyId,
      real_name: 'DevSkip Non',
      legacy_email: freshLegacyEmail,
    });
    db.close();

    const res = await request(app)
      .post('/members/' + NORMIE_SLUG + '/link-history/find')
      .set('Cookie', cookieFor(NORMIE_ID))
      .type('form')
      .send({ identifier: freshLegacyId });
    // Token-email path → wizard with sent=1&out=enqueued (a real outbox row
    // is also enqueued, but the response signal is the redirect).
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`^/members/${NORMIE_SLUG}/link-history\\?sent=1&out=enqueued&since=\\d+$`));
  });
});
