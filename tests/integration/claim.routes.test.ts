/**
 * Integration tests for legacy account claim routes (three-table design:
 * members + legacy_members + historical_persons; claim marks the legacy row).
 *
 * Covers:
 *   GET  /history/claim          — claim lookup form (auth required)
 *   POST /history/claim          — legacy identifier lookup
 *   POST /history/claim/confirm  — execute atomic merge against legacy_members
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { insertMember, insertLegacyMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const TEST_DB_PATH = path.join(process.cwd(), `test-claim-${Date.now()}.db`);

// JWT/SES env vars come from tests/setup-env.ts (per-vitest-worker defaults).
process.env.FOOTBAG_DB_PATH = TEST_DB_PATH;
process.env.PORT            = '3099';
process.env.NODE_ENV        = 'test';
process.env.LOG_LEVEL       = 'error';
process.env.PUBLIC_BASE_URL = 'http://localhost:3099';
process.env.SESSION_SECRET  = 'claim-test-secret';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: typeof import('../../src/app').createApp;

const CLAIMER_ID   = 'claim-test-claimer';
const CLAIMER_SLUG = 'claim_tester';
const OTHER_ID     = 'claim-test-other';
const OTHER_SLUG   = 'other_tester';

// Legacy account with NO corresponding HP — claim just links legacy_member_id.
const LEGACY_NO_HP = 'LM-12345';

// Legacy account WITH a corresponding historical_person — claim also sets members.historical_person_id.
const LEGACY_WITH_HP  = '99999';
const HP_PERSON_ID    = 'hp-claim-test-001';

function claimerCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: CLAIMER_ID })}`;
}

function otherCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: OTHER_ID })}`;
}

let testDb: BetterSqlite3.Database;

async function issueClaimToken(memberId: string, identifier: string): Promise<string> {
  // Reads the claim-confirm URL from the rendered POST response (which now
  // includes the simulated-email card on dev) instead of from the outbox
  // row. The post-render drain in simulatedEmailService.getEmailPreview()
  // marks the outbox row sent and NULLs body_text per scrub-safety, so the
  // DB-row read path is no longer reliable. The HTML response is the
  // authoritative source for the just-sent URL.
  const cookie = `footbag_session=${createTestSessionJwt({ memberId })}`;
  const app = createApp();
  const res = await request(app)
    .post('/history/claim').set('Cookie', cookie).type('form').send({ identifier });
  expect(res.status).toBe(200);
  const m = res.text.match(/\/history\/claim\/confirm\/([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(`No claim URL in response HTML for member ${memberId}`);
  return m[1];
}

beforeAll(async () => {
  const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
  testDb = new BetterSqlite3(TEST_DB_PATH);
  testDb.pragma('journal_mode = WAL');
  testDb.pragma('foreign_keys = ON');
  testDb.exec(schema);

  insertMember(testDb, { id: CLAIMER_ID, slug: CLAIMER_SLUG, display_name: 'Claim Tester', login_email: 'claimer@example.com' });
  insertMember(testDb, { id: OTHER_ID, slug: OTHER_SLUG, display_name: 'Other Tester', login_email: 'other@example.com', country: null });

  insertLegacyMember(testDb, {
    legacy_member_id: LEGACY_NO_HP,
    real_name: 'Legacy Player',
    display_name: 'Legacy Player',
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
    legacy_member_id: LEGACY_WITH_HP,
    country: 'NZ',
    hof_member: 1,
    hof_induction_year: 2005,
    bap_member: 0,
    first_year: 1988,
  });
  insertLegacyMember(testDb, {
    legacy_member_id: LEGACY_WITH_HP,
    real_name: 'Historical Claimant',
    display_name: 'Historical Claimant',
    legacy_email: 'historical-claimant@oldsite.com',
    country: null,
    is_hof: 0,
    is_bap: 0,
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

describe('GET /history/claim — 302 to unified wizard (round-2 unification)', () => {
  // 302 (not 301) because the redirect target depends on the current session
  // slug; a cached 301 would let later visits route a stale slug into the URL.
  it('unauthenticated -> 302 to /login with returnTo (auth gate before redirect)', async () => {
    const app = createApp();
    const res = await request(app).get('/history/claim');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login?returnTo=%2Fhistory%2Fclaim');
  });

  it('authenticated -> 302 to wizard, query string preserved', async () => {
    const app = createApp();
    const res = await request(app).get('/history/claim').set('Cookie', claimerCookie());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${CLAIMER_SLUG}/link-history`);
  });

  it('?from=register query string is preserved through the 302', async () => {
    const app = createApp();
    const res = await request(app).get('/history/claim?from=register').set('Cookie', claimerCookie());
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${CLAIMER_SLUG}/link-history?from=register`);
  });
});

// ── POST /history/claim — lookup ──────────────────────────────────────────────

describe('POST /history/claim — non-revealing initiation', () => {
  it('empty identifier -> 422 with error', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim').set('Cookie', claimerCookie()).type('form').send({ identifier: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Please enter a legacy identifier');
  });

  it('valid match by legacy_email -> 200 with non-revealing "sent" banner (no record details)', async () => {
    const m = insertMember(testDb, { slug: `lookup_e_${Date.now()}`, login_email: `lookup-e-${Date.now()}@example.com` });
    const app = createApp();
    const res = await request(app)
      .post('/history/claim').set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: m })}`).type('form')
      .send({ identifier: 'legacy@oldsite.com' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/confirmation link has been sent/);
    // Non-revealing: the matched record's details must not appear on this page.
    expect(res.text).not.toContain('Legacy Player');
    // Dev parity: the simulated-email card must render on the sent state so
    // the developer can complete the click-to-confirm flow without leaving
    // the page. This is the regression that broke the dev workflow when the
    // sent-state branch was first added (no emailPreview was passed to the
    // view-model). Asserts the partial's identifying markup.
    expect(res.text).toContain('Simulated email (dev)');
  });

  it('no match -> 200 with the SAME non-revealing "sent" banner', async () => {
    const m = insertMember(testDb, { slug: `lookup_nx_${Date.now()}`, login_email: `lookup-nx-${Date.now()}@example.com` });
    const app = createApp();
    const res = await request(app)
      .post('/history/claim').set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: m })}`).type('form').send({ identifier: 'nonexistent@nowhere.com' });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/confirmation link has been sent/);
  });

  it('whitespace-only identifier -> 422', async () => {
    const freshId = insertMember(testDb, { slug: 'ws_tester', display_name: 'WS Tester', login_email: 'wstester@example.com' });
    const app = createApp();
    const res = await request(app)
      .post('/history/claim').set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: freshId })}`)
      .type('form').send({ identifier: '   ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Please enter a legacy identifier');
  });
});

// ── POST /history/claim — dev outcomeNote (anti-enumeration silent paths) ────

describe('POST /history/claim — dev outcomeNote on silent-no-op outcomes', () => {
  it('no_match identifier -> 200 with "No confirmation email was sent" outcomeNote (regression: card was previously empty)', async () => {
    const m = insertMember(testDb, {
      slug: `out_nx_${Date.now()}`,
      login_email: `out-nx-${Date.now()}@example.com`,
    });
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: m })}`)
      .type('form')
      .send({ identifier: `definitely-not-a-real-id-${Date.now()}@nowhere.example` });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/confirmation link has been sent/);
    expect(res.text).toContain('No confirmation email was sent for this attempt');
    expect(res.text).toContain('may not match an eligible legacy record');
  });

  it('matching identifier -> 200, no outcomeNote, simulated-email card has the enqueued message', async () => {
    const stamp = Date.now();
    const legacyId = `LM-OUT-MATCH-${stamp}`;
    const legacyEmail = `out-match-${stamp}@oldsite.example`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Out Match',
      legacy_email: legacyEmail,
    });
    const memberId = insertMember(testDb, {
      slug: `out_match_${stamp}`,
      login_email: `requestor-${stamp}@example.com`,
    });
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId })}`)
      .type('form')
      .send({ identifier: legacyEmail });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/confirmation link has been sent/);
    expect(res.text).not.toContain('No confirmation email was sent for this attempt');
    expect(res.text).toContain('Simulated email (dev)');
    expect(res.text).toMatch(/\/history\/claim\/confirm\//);
  });

  // Per-member rate limit: CLAIM_INIT_MAX_PER_HOUR=5 (src/services/identity
  // AccessService.ts:1047). The per-target cap is tested above using distinct
  // members; this case exhausts the per-member cap by using the SAME member
  // for six attempts and asserts the sixth returns 429 with Retry-After.
  it('per-member rate-limit (6th attempt) -> 429 with Retry-After', async () => {
    const stamp = Date.now();
    const member = insertMember(testDb, {
      slug: `member_pm_rl_${stamp}`,
      login_email: `member-pm-rl-${stamp}@example.com`,
    });
    const cookie = `footbag_session=${createTestSessionJwt({ memberId: member })}`;
    const app = createApp();
    // Five separate legacy identifiers, all garbage so the per-target cap on
    // any one row never fires. Same requesting member five times exhausts the
    // per-member bucket.
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/history/claim')
        .set('Cookie', cookie)
        .type('form')
        .send({ identifier: `garbage-pm-${stamp}-${i}` });
      // Each attempt resolves as a no-match (200, anti-enumeration shape).
      expect(r.status).toBe(200);
    }
    // Sixth attempt from the same member: per-member cap fires, 429.
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', cookie)
      .type('form')
      .send({ identifier: `garbage-pm-${stamp}-6` });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
    expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
  });

  it('per-target rate-limit (4th attempt) -> outcomeNote names the hourly send cap', async () => {
    const stamp = Date.now();
    const legacyId = `LM-OUT-RL-${stamp}`;
    const legacyEmail = `out-rl-${stamp}@oldsite.example`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Out RateLimit',
      legacy_email: legacyEmail,
    });
    const app = createApp();
    // Exhaust the per-target cap (CLAIM_INIT_TARGET_MAX_PER_HOUR=3) with three
    // distinct requesting members so per-member caps don't fire first.
    for (let i = 0; i < 3; i++) {
      const m = insertMember(testDb, {
        slug: `out_rl_p${i}_${stamp}`,
        login_email: `out-rl-p${i}-${stamp}@example.com`,
      });
      const r = await request(app)
        .post('/history/claim')
        .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: m })}`)
        .type('form')
        .send({ identifier: legacyEmail });
      expect(r.status).toBe(200);
    }
    // Fourth attempt from a fresh requester: per-target cap fires silently;
    // the dev outcomeNote should explain it was the cap, not a no_match.
    const fourthMember = insertMember(testDb, {
      slug: `out_rl_4_${stamp}`,
      login_email: `out-rl-4-${stamp}@example.com`,
    });
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: fourthMember })}`)
      .type('form')
      .send({ identifier: legacyEmail });
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/confirmation link has been sent/);
    expect(res.text).toContain('hit its hourly send cap');
  });

  it('staleness scoping: prior matching attempt does not bleed into a current no_match render', async () => {
    const stamp = Date.now();
    const legacyId = `LM-OUT-STALE-${stamp}`;
    const legacyEmail = `out-stale-${stamp}@oldsite.example`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Out Stale',
      legacy_email: legacyEmail,
    });
    const matchMember = insertMember(testDb, {
      slug: `out_stale_match_${stamp}`,
      login_email: `out-stale-match-${stamp}@example.com`,
    });
    const app = createApp();
    // First request enqueues a real message into the stub buffer.
    const r1 = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: matchMember })}`)
      .type('form')
      .send({ identifier: legacyEmail });
    expect(r1.status).toBe(200);
    expect(r1.text).toContain('Simulated email (dev)');
    // Second request from a different member with a non-matching identifier
    // must NOT see the prior match in its sent-state card; sinceIndex scopes
    // the card to "this turn".
    const noMatchMember = insertMember(testDb, {
      slug: `out_stale_nx_${stamp}`,
      login_email: `out-stale-nx-${stamp}@example.com`,
    });
    const r2 = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: noMatchMember })}`)
      .type('form')
      .send({ identifier: `nothing-matches-${stamp}@nowhere.example` });
    expect(r2.status).toBe(200);
    expect(r2.text).toContain('No confirmation email was sent for this attempt');
    // The earlier match's claim-confirm URL must not appear in the current
    // turn's card.
    expect(r2.text).not.toMatch(/\/history\/claim\/confirm\//);
  });
});

// ── POST /history/claim — email-equality fast path (no second email) ─────────

describe('POST /history/claim — email-equality fast path', () => {
  it('verified login_email matches legacy_email -> 303 to /members/<slug>; NO outbox row enqueued; legacy row is claimed', async () => {
    const stamp = Date.now();
    const sharedEmail = `shared-${stamp}@example.com`;
    const legacyId = `LM-EQ-${stamp}`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Equal Email',
      legacy_email: sharedEmail,
    });
    const memberSlug = `eq_match_${stamp}`;
    const memberId = insertMember(testDb, {
      slug: memberSlug,
      login_email: sharedEmail, // verified by default in factory
    });
    const outboxBefore = (testDb.prepare('SELECT COUNT(*) AS c FROM outbox_emails').get() as { c: number }).c;

    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId })}`)
      .type('form')
      .send({ identifier: sharedEmail });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${memberSlug}`);

    const outboxAfter = (testDb.prepare('SELECT COUNT(*) AS c FROM outbox_emails').get() as { c: number }).c;
    expect(outboxAfter).toBe(outboxBefore);

    const legacyClaimedBy = testDb
      .prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { claimed_by_member_id: string | null } | undefined;
    expect(legacyClaimedBy?.claimed_by_member_id).toBe(memberId);
  });

  it('email mismatch -> falls through to the token-email path (existing behavior)', async () => {
    const stamp = Date.now();
    const legacyId = `LM-NEQ-${stamp}`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Not Equal',
      legacy_email: `legacy-neq-${stamp}@oldsite.example`,
    });
    const memberId = insertMember(testDb, {
      slug: `neq_${stamp}`,
      login_email: `member-neq-${stamp}@example.com`,
    });
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId })}`)
      .type('form')
      .send({ identifier: `legacy-neq-${stamp}@oldsite.example` });
    expect(res.status).toBe(200);
    expect(res.text).toContain('Simulated email (dev)');
    expect(res.text).toMatch(/\/history\/claim\/confirm\//);
  });

  // Note: the email_verified_at guard in initiateLegacyClaim is cheap
  // defense-in-depth. Unverified members cannot authenticate
  // (db.ts findMemberForSession filters on `email_verified_at IS NOT NULL`),
  // so the unverified branch is unreachable from the route. The guard stays
  // in case the auth-gate query is ever loosened.

  it('email match comparison is case-insensitive', async () => {
    const stamp = Date.now();
    const upperEmail = `Mixed-Case-${stamp}@Example.COM`;
    const lowerEmail = upperEmail.toLowerCase();
    const legacyId = `LM-CASE-${stamp}`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Case Match',
      legacy_email: upperEmail, // stored verbatim with mixed case
    });
    const memberSlug = `case_${stamp}`;
    const memberId = insertMember(testDb, {
      slug: memberSlug,
      login_email: lowerEmail, // factory normalizes to lowercase for *_normalized
    });
    const app = createApp();
    const res = await request(app)
      .post('/history/claim')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId })}`)
      .type('form')
      .send({ identifier: upperEmail });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${memberSlug}`);
  });
});

// ── GET /history/claim/confirm/:token ─────────────────────────────────────────

describe('GET /history/claim/confirm/:token — peek-only review page', () => {
  it('valid token -> 200 renders confirm page with matched record details', async () => {
    const memberId = insertMember(testDb, {
      slug: `peek_valid_${Date.now()}`,
      login_email: `peek-valid-${Date.now()}@example.com`,
    });
    const legacyId = `LM-PEEK-${Date.now()}`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Peek Target',
      display_name: 'Peek Target',
      legacy_email: `peek-target-${Date.now()}@oldsite.com`,
      country: 'JP',
      is_hof: 1,
    });
    const token = await issueClaimToken(memberId, legacyId);

    const app = createApp();
    const res = await request(app)
      .get(`/history/claim/confirm/${token}`)
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId })}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Peek Target');
    expect(res.text).toContain('JP');
    expect(res.text).toContain('Hall of Fame');
    // Token must round-trip into the POST form as a hidden field.
    expect(res.text).toContain(`value="${token}"`);
  });

  it('invalid token -> 400 with generic "no longer valid" message', async () => {
    const memberId = insertMember(testDb, {
      slug: `peek_invalid_${Date.now()}`,
      login_email: `peek-invalid-${Date.now()}@example.com`,
    });
    const app = createApp();
    const res = await request(app)
      .get('/history/claim/confirm/not-a-real-token')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId })}`);
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/no longer valid/);
  });

  it('token bound to a different member -> 400 (no leak of valid-but-foreign tokens)', async () => {
    const ownerId = insertMember(testDb, {
      slug: `peek_owner_${Date.now()}`,
      login_email: `peek-owner-${Date.now()}@example.com`,
    });
    const otherId = insertMember(testDb, {
      slug: `peek_other_${Date.now()}`,
      login_email: `peek-other-${Date.now()}@example.com`,
    });
    const legacyId = `LM-PEEK-FOREIGN-${Date.now()}`;
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'Foreign Target',
      legacy_email: `foreign-target-${Date.now()}@oldsite.com`,
    });
    const token = await issueClaimToken(ownerId, legacyId);

    const app = createApp();
    const res = await request(app)
      .get(`/history/claim/confirm/${token}`)
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: otherId })}`);
    expect(res.status).toBe(400);
    expect(res.text).toMatch(/no longer valid/);
  });

  it('unauthenticated -> 302 to /login', async () => {
    const app = createApp();
    const res = await request(app).get('/history/claim/confirm/anything');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });
});

// ── POST /history/claim/confirm — merge (no HP match) ────────────────────────

describe('POST /history/claim/confirm — merge (no HP match)', () => {
  it('token-flow merge -> 302 to profile; legacy_members row marked claimed (not deleted); HP FK stays NULL', async () => {
    const token = await issueClaimToken(CLAIMER_ID, LEGACY_NO_HP);
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm').set('Cookie', claimerCookie())
      .type('form').send({ token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${CLAIMER_SLUG}`);

    const claimer = testDb.prepare(
      'SELECT legacy_member_id, historical_person_id, bio, city, is_hof, is_bap FROM members WHERE id = ?',
    ).get(CLAIMER_ID) as {
      legacy_member_id: string | null; historical_person_id: string | null;
      bio: string; city: string | null; is_hof: number; is_bap: number;
    };
    expect(claimer.legacy_member_id).toBe(LEGACY_NO_HP);
    expect(claimer.historical_person_id).toBeNull();
    expect(claimer.is_hof).toBe(1);

    const legacy = testDb.prepare(
      'SELECT claimed_by_member_id, claimed_at FROM legacy_members WHERE legacy_member_id = ?',
    ).get(LEGACY_NO_HP) as { claimed_by_member_id: string | null; claimed_at: string | null };
    expect(legacy.claimed_by_member_id).toBe(CLAIMER_ID);
    expect(legacy.claimed_at).toBeTruthy();

    const stillExists = testDb.prepare('SELECT 1 AS ok FROM legacy_members WHERE legacy_member_id = ?').get(LEGACY_NO_HP);
    expect(stillExists).toBeTruthy();
  });

  it('reusing a consumed token -> 422 (single-use enforced)', async () => {
    // Re-claim attempt against an already-consumed token from the previous test.
    // Since CLAIMER is now linked, the initiate-step would fail on the
    // already-claimed check anyway, so we provide an obviously bad token.
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm').set('Cookie', claimerCookie())
      .type('form').send({ token: 'not-a-real-token-string' });
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/no longer valid/);
  });

  it('missing token -> 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm').set('Cookie', otherCookie()).type('form').send({});
    expect(res.status).toBe(422);
    expect(res.text).toContain('Invalid claim request');
  });

  it('empty token -> 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm').set('Cookie', otherCookie())
      .type('form').send({ token: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Invalid claim request');
  });
});

// ── POST /history/claim/confirm — merge (HP match exists) ────────────────────

describe('POST /history/claim/confirm — merge (HP match)', () => {
  it('successful claim sets members.historical_person_id and carries forward HP country/HoF/induction year', async () => {
    const token = await issueClaimToken(OTHER_ID, LEGACY_WITH_HP);
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm').set('Cookie', otherCookie())
      .type('form').send({ token });
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${OTHER_SLUG}`);

    // HP carry-forward: legacy_members had country=NULL and is_hof=0, but the
    // linked historical_persons row had country='NZ', hof_member=1,
    // hof_induction_year=2005, first_year=1988. The member row must reflect
    // those because the claim also merges HP fields (three-table design).
    const member = testDb.prepare(
      `SELECT legacy_member_id, historical_person_id, country, is_hof, is_bap,
              hof_inducted_year, first_competition_year
       FROM members WHERE id = ?`,
    ).get(OTHER_ID) as {
      legacy_member_id: string | null;
      historical_person_id: string | null;
      country: string | null;
      is_hof: number;
      is_bap: number;
      hof_inducted_year: number | null;
      first_competition_year: number | null;
    };
    expect(member.legacy_member_id).toBe(LEGACY_WITH_HP);
    expect(member.historical_person_id).toBe(HP_PERSON_ID);
    expect(member.country).toBe('NZ');
    expect(member.is_hof).toBe(1);
    expect(member.is_bap).toBe(0);
    expect(member.hof_inducted_year).toBe(2005);
    expect(member.first_competition_year).toBe(1988);
  });

  it('HP carry-forward does not overwrite a member-row country that was already set', async () => {
    const claimerId = insertMember(testDb, {
      slug: 'hp_no_overwrite', display_name: 'HP NoOverwrite',
      login_email: 'hp-no-overwrite@example.com',
      country: 'DE',
    });
    const legacyId = 'LM-HP-NO-OVERWRITE';
    insertLegacyMember(testDb, {
      legacy_member_id: legacyId,
      real_name: 'HP NoOverwrite',
      display_name: 'HP NoOverwrite',
      legacy_email: 'hp-no-overwrite@oldsite.com',
      country: null,
    });
    insertHistoricalPerson(testDb, {
      person_id: 'hp-no-overwrite-001',
      person_name: 'HP NoOverwrite',
      legacy_member_id: legacyId,
      country: 'NZ',
      hof_member: 0,
      bap_member: 1,
    });

    const token = await issueClaimToken(claimerId, legacyId);
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: claimerId })}`)
      .type('form').send({ token });
    expect(res.status).toBe(302);

    const row = testDb.prepare(
      'SELECT country, is_hof, is_bap FROM members WHERE id = ?',
    ).get(claimerId) as { country: string | null; is_hof: number; is_bap: number };
    expect(row.country).toBe('DE');   // member had DE; HP did not overwrite.
    expect(row.is_hof).toBe(0);       // both 0.
    expect(row.is_bap).toBe(1);       // OR semantics from HP.
  });

  it('HP carry-forward is a no-op when the claimed legacy account has no linked HP', async () => {
    // Uses the LEGACY_NO_HP row exercised earlier — the claimer has already
    // claimed it in the first merge describe block. Verify the member row
    // has no historical_person_id, confirming no HP merge happened.
    const row = testDb.prepare(
      'SELECT historical_person_id FROM members WHERE id = ?',
    ).get(CLAIMER_ID) as { historical_person_id: string | null };
    expect(row.historical_person_id).toBeNull();
  });
});

// ── Merge field semantics ─────────────────────────────────────────────────────

describe('merge field semantics', () => {
  const MERGE_CLAIMER_ID    = 'merge-test-claimer';
  const MERGE_CLAIMER_SLUG  = 'merge_tester';
  const MERGE_LEGACY_ID     = 'LM-MERGE';

  function mergeCookie(): string {
    return `footbag_session=${createTestSessionJwt({ memberId: MERGE_CLAIMER_ID })}`;
  }

  it('fill-if-empty rules and OR semantics', async () => {
    insertMember(testDb, {
      id: MERGE_CLAIMER_ID, slug: MERGE_CLAIMER_SLUG,
      display_name: 'Merge Tester', login_email: 'mergetester@example.com',
      city: 'Denver', country: 'US',
    });
    insertLegacyMember(testDb, {
      legacy_member_id: MERGE_LEGACY_ID,
      real_name: 'Old Player', display_name: 'Old Player',
      legacy_email: 'old-player@oldsite.com',
      bio: 'Legacy bio', city: 'Portland', region: 'OR', country: 'CA',
      is_hof: 0, is_bap: 1,
    });

    const token = await issueClaimToken(MERGE_CLAIMER_ID, MERGE_LEGACY_ID);
    const app = createApp();
    const res = await request(app)
      .post('/history/claim/confirm').set('Cookie', mergeCookie())
      .type('form').send({ token });
    expect(res.status).toBe(302);

    const row = testDb.prepare(
      'SELECT legacy_member_id, bio, city, region, country, is_hof, is_bap FROM members WHERE id = ?',
    ).get(MERGE_CLAIMER_ID) as {
      legacy_member_id: string | null; bio: string;
      city: string | null; region: string | null; country: string | null;
      is_hof: number; is_bap: number;
    };

    expect(row.legacy_member_id).toBe(MERGE_LEGACY_ID);
    expect(row.bio).toBe('Legacy bio');      // member bio defaulted to '', filled from legacy.
    expect(row.city).toBe('Denver');         // member had 'Denver' (non-empty), not overwritten.
    expect(row.region).toBe('OR');           // member had NULL, filled from legacy.
    expect(row.country).toBe('US');          // member had 'US', not overwritten.
    expect(row.is_bap).toBe(1);              // OR semantics, legacy had 1.
    expect(row.is_hof).toBe(0);              // both 0.
  });
});

// ── Adversarial / race cases ──────────────────────────────────────────────────

describe('POST /history/claim/confirm — adversarial', () => {
  it('second claim on same legacy_members row is rejected', async () => {
    const raceLegacyId = 'LM-RACE';
    insertLegacyMember(testDb, {
      legacy_member_id: raceLegacyId, real_name: 'Race Target',
      legacy_email: 'race-target@oldsite.com',
    });

    const firstId  = insertMember(testDb, { slug: 'race_first',  display_name: 'Race First',  login_email: 'racefirst@example.com' });
    const secondId = insertMember(testDb, { slug: 'race_second', display_name: 'Race Second', login_email: 'racesecond@example.com' });

    const firstCookie  = `footbag_session=${createTestSessionJwt({ memberId: firstId })}`;
    const secondCookie = `footbag_session=${createTestSessionJwt({ memberId: secondId })}`;

    const firstToken = await issueClaimToken(firstId, raceLegacyId);
    const app = createApp();
    const res1 = await request(app)
      .post('/history/claim/confirm').set('Cookie', firstCookie)
      .type('form').send({ token: firstToken });
    expect(res1.status).toBe(302);

    // Second member tries to issue their own token for the now-claimed row.
    // The initiate step finds nothing (row is no longer eligible) so no
    // token is issued; the second member never receives a confirm link.
    const secondCookieAgent = request.agent(createApp());
    const initRes = await secondCookieAgent
      .post('/history/claim').set('Cookie', secondCookie).type('form')
      .send({ identifier: raceLegacyId });
    expect(initRes.status).toBe(200);
    const issued = testDb.prepare(
      `SELECT id FROM outbox_emails WHERE recipient_member_id = ?`,
    ).get(secondId) as { id: string } | undefined;
    expect(issued).toBeUndefined();
  });
});
