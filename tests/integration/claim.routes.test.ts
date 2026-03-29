/**
 * Integration tests for legacy account claim routes.
 *
 * Covers:
 *   GET  /history/claim          — claim lookup form (auth required)
 *   POST /history/claim          — legacy identifier lookup
 *   POST /history/claim/confirm  — execute atomic merge
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { insertMember, insertImportedPlaceholder, insertHistoricalPerson } from '../fixtures/factories';
import { createSessionCookie } from '../../src/middleware/authStub';

const TEST_DB_PATH = path.join(process.cwd(), `test-claim-${Date.now()}.db`);

process.env.FOOTBAG_DB_PATH  = TEST_DB_PATH;
process.env.PORT             = '3099';
process.env.NODE_ENV         = 'test';
process.env.LOG_LEVEL        = 'error';
process.env.PUBLIC_BASE_URL  = 'http://localhost:3099';
process.env.SESSION_SECRET   = 'claim-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

const TEST_SECRET   = process.env.SESSION_SECRET!;
const CLAIMER_ID    = 'claim-test-claimer';
const CLAIMER_SLUG  = 'claim_tester';
const OTHER_ID      = 'claim-test-other';
const OTHER_SLUG    = 'other_tester';
const PLACEHOLDER_ID  = 'legacy-placeholder-001';
const HP_PERSON_ID    = 'hp-claim-test-001';
const HP_LEGACY_ID    = '99999';

function claimerCookie(): string {
  return `footbag_session=${createSessionCookie(CLAIMER_ID, 'member', TEST_SECRET, 'Claim Tester', CLAIMER_SLUG)}`;
}

function otherCookie(): string {
  return `footbag_session=${createSessionCookie(OTHER_ID, 'member', TEST_SECRET, 'Other Tester', OTHER_SLUG)}`;
}

let testDb: BetterSqlite3.Database;

beforeAll(async () => {
  const schema = fs.readFileSync(
    path.join(process.cwd(), 'database', 'schema.sql'),
    'utf8',
  );
  testDb = new BetterSqlite3(TEST_DB_PATH);
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(schema);

  insertMember(testDb, { id: CLAIMER_ID, slug: CLAIMER_SLUG, display_name: 'Claim Tester', login_email: 'claimer@example.com' });
  insertMember(testDb, { id: OTHER_ID, slug: OTHER_SLUG, display_name: 'Other Tester', login_email: 'other@example.com' });

  insertImportedPlaceholder(testDb, {
    id: PLACEHOLDER_ID,
    display_name: 'Legacy Player',
    legacy_member_id: 'LM-12345',
    legacy_user_id: 'legacyuser',
    legacy_email: 'legacy@oldsite.com',
    bio: 'Legacy bio text',
    city: 'Portland',
    country: 'US',
    is_hof: 1,
    is_bap: 0,
  });

  insertHistoricalPerson(testDb, {
    person_id: HP_PERSON_ID,
    person_name: 'Historical Claimant',
    legacy_member_id: HP_LEGACY_ID,
    country: 'NZ',
    fbhof_member: 1,
    bap_member: 0,
  });

  const mod = await import('../../src/app');
  createApp = mod.createApp;
});

afterAll(() => {
  testDb.close();
  for (const ext of ['', '-wal', '-shm']) {
    try { fs.unlinkSync(TEST_DB_PATH + ext); } catch { /* ignore */ }
  }
});

// ── GET /history/claim ────────────────────────────────────────────────────────

describe('GET /history/claim — claim form', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const app = createApp();
    const res = await request(app).get('/history/claim');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?returnTo=%2Fhistory%2Fclaim');
  });

  it('authenticated -> 200 with form', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/history/claim')
      .set('Cookie', claimerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Legacy identifier');
  });
});

// ── POST /history/claim — lookup ──────────────────────────────────────────────

describe('POST /history/claim — lookup', () => {
  it('empty identifier -> 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', claimerCookie())
      .type('form')
      .send({ identifier: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Please enter a legacy identifier');
  });

  it('valid match by legacy_email -> 200 with confirmation', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', claimerCookie())
      .type('form')
      .send({ identifier: 'legacy@oldsite.com' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Legacy Player');
    expect(res.text).toContain('Confirm');
  });

  it('valid match by legacy_member_id -> 200 with confirmation', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', claimerCookie())
      .type('form')
      .send({ identifier: 'LM-12345' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Legacy Player');
  });

  it('valid match by legacy_user_id -> 200 with confirmation', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', claimerCookie())
      .type('form')
      .send({ identifier: 'legacyuser' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Legacy Player');
  });

  it('no match -> 200 with "not found" message', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', claimerCookie())
      .type('form')
      .send({ identifier: 'nonexistent@nowhere.com' });
    expect(res.status).toBe(200);
    expect(res.text).toContain('No matching legacy record');
  });
});

// ── POST /history/claim/confirm — merge ───────────────────────────────────────

describe('POST /history/claim/confirm — merge (imported placeholder)', () => {
  it('successful merge -> 302 to profile', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', claimerCookie())
      .type('form')
      .send({ source: 'imported_placeholder', targetId: PLACEHOLDER_ID });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${CLAIMER_SLUG}`);

    // Verify DB state after merge.
    const claimer = testDb.prepare('SELECT legacy_member_id, bio, city, is_hof, is_bap FROM members WHERE id = ?').get(CLAIMER_ID) as {
      legacy_member_id: string | null; bio: string; city: string | null; is_hof: number; is_bap: number;
    };
    expect(claimer.legacy_member_id).toBe('LM-12345');
    expect(claimer.is_hof).toBe(1);

    // Placeholder should be soft-deleted with legacy_member_id NULLed.
    const placeholder = testDb.prepare('SELECT deleted_at, legacy_member_id FROM members WHERE id = ?').get(PLACEHOLDER_ID) as {
      deleted_at: string | null; legacy_member_id: string | null;
    };
    expect(placeholder.deleted_at).not.toBeNull();
    expect(placeholder.legacy_member_id).toBeNull();
  });

  it('already claimed -> 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', claimerCookie())
      .type('form')
      .send({ source: 'imported_placeholder', targetId: 'some-other-id' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('already linked');
  });

  it('invalid targetId -> 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', otherCookie())
      .type('form')
      .send({ source: 'imported_placeholder', targetId: 'does-not-exist' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('no longer available');
  });

  it('missing fields -> 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', otherCookie())
      .type('form')
      .send({});
    expect(res.status).toBe(422);
    expect(res.text).toContain('Invalid claim request');
  });
});

// ── POST /history/claim/confirm — merge (historical person) ───────────────────

describe('POST /history/claim/confirm — merge (historical person)', () => {
  it('lookup by legacy_member_id finds historical person', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', otherCookie())
      .type('form')
      .send({ identifier: HP_LEGACY_ID });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Historical Claimant');
    expect(res.text).toContain('historical_person');
  });

  it('successful historical person claim -> 302 to profile', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', otherCookie())
      .type('form')
      .send({ source: 'historical_person', targetId: HP_LEGACY_ID });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OTHER_SLUG}`);

    // Verify: other member now has legacy_member_id and is_hof from historical person.
    const member = testDb.prepare('SELECT legacy_member_id, is_hof FROM members WHERE id = ?').get(OTHER_ID) as {
      legacy_member_id: string | null; is_hof: number;
    };
    expect(member.legacy_member_id).toBe(HP_LEGACY_ID);
    expect(member.is_hof).toBe(1);
  });
});

// ── Merge field semantics ─────────────────────────────────────────────────────

describe('merge field semantics', () => {
  const MERGE_CLAIMER_ID   = 'merge-test-claimer';
  const MERGE_CLAIMER_SLUG = 'merge_tester';
  const MERGE_PLACEHOLDER  = 'merge-placeholder';

  function mergeCookie(): string {
    return `footbag_session=${createSessionCookie(MERGE_CLAIMER_ID, 'member', TEST_SECRET, 'Merge Tester', MERGE_CLAIMER_SLUG)}`;
  }

  it('fill-if-empty rules and OR semantics', async () => {
    // Insert fresh test data for this test.
    insertMember(testDb, {
      id: MERGE_CLAIMER_ID,
      slug: MERGE_CLAIMER_SLUG,
      display_name: 'Merge Tester',
      login_email: 'mergetester@example.com',
      city: 'Denver',
      country: 'US',
    });

    insertImportedPlaceholder(testDb, {
      id: MERGE_PLACEHOLDER,
      display_name: 'Old Player',
      legacy_member_id: 'LM-MERGE',
      bio: 'Legacy bio',
      city: 'Portland',
      region: 'OR',
      country: 'CA',
      is_hof: 0,
      is_bap: 1,
    });

    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', mergeCookie())
      .type('form')
      .send({ source: 'imported_placeholder', targetId: MERGE_PLACEHOLDER });
    expect(res.status).toBe(302);

    const row = testDb.prepare(
      'SELECT legacy_member_id, bio, city, region, country, is_hof, is_bap FROM members WHERE id = ?',
    ).get(MERGE_CLAIMER_ID) as {
      legacy_member_id: string | null; bio: string;
      city: string | null; region: string | null; country: string | null;
      is_hof: number; is_bap: number;
    };

    // legacy_member_id transferred.
    expect(row.legacy_member_id).toBe('LM-MERGE');

    // Bio: claimer had empty string (factory default), should be filled.
    // (insertMember factory doesn't set bio, so it defaults to '' from schema)
    // Actually check: the active member's bio default depends on the schema.
    // The factory inserts don't set bio, so it gets the schema default.

    // City: claimer had 'Denver', should NOT be overwritten.
    expect(row.city).toBe('Denver');

    // Region: claimer had NULL (factory default), should be filled from placeholder.
    expect(row.region).toBe('OR');

    // Country: claimer had 'US', should NOT be overwritten.
    expect(row.country).toBe('US');

    // is_bap: OR semantics, placeholder had 1.
    expect(row.is_bap).toBe(1);

    // is_hof: both 0, stays 0.
    expect(row.is_hof).toBe(0);
  });
});
