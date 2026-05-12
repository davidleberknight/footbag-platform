/**
 * Integration tests for the unified link-history page at
 * GET /members/:slug/link-history. ONE-section page: mixed candidate list
 * (legacy + HP + back-linked "both"), manual-id input that tries both
 * tables, sent-state inline (after a manual claim that didn't email-fast-
 * path), and a clubs-coming-soon placeholder. Reachable from the post-
 * verify funnel for every classifier outcome and from the profile-edit CTA.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3122');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const UNLINKED_ID   = 'wiz-unlinked';
const UNLINKED_SLUG = 'wiz_unlinked';

const LEGACY_ONLY_ID   = 'wiz-legacy-only';
const LEGACY_ONLY_SLUG = 'wiz_legacy_only';

const BOTH_ID   = 'wiz-both';
const BOTH_SLUG = 'wiz_both';
const BOTH_HP_NAME = 'Both Linked HP';

const OTHER_ID   = 'wiz-other';
const OTHER_SLUG = 'wiz_other';

const MANUAL_LEGACY_ID = 'LM-MANUAL-FIND';
const MANUAL_LEGACY_EMAIL = 'manual-find@oldsite.example';

const MANUAL_HP_ID = 'hp-manual-find';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: UNLINKED_ID, slug: UNLINKED_SLUG, real_name: 'Wiz Unlinked' });

  const claimLegacy = db.prepare(
    'UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = ? WHERE legacy_member_id = ?',
  );
  const linkHp = db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?');

  // legacy-only: legacy claimed, HP not linked
  const legacyA = insertLegacyMember(db, { real_name: 'Legacy Only Linked' });
  insertMember(db, {
    id: LEGACY_ONLY_ID,
    slug: LEGACY_ONLY_SLUG,
    real_name: 'Legacy Only Linked',
    legacy_member_id: legacyA,
  });
  claimLegacy.run(LEGACY_ONLY_ID, '2024-01-12T10:00:00.000Z', legacyA);

  // both: legacy AND HP linked
  const legacyB = insertLegacyMember(db, { real_name: 'Both Linked' });
  const hpB = insertHistoricalPerson(db, { person_name: BOTH_HP_NAME });
  insertMember(db, {
    id: BOTH_ID,
    slug: BOTH_SLUG,
    real_name: 'Both Linked',
    legacy_member_id: legacyB,
  });
  claimLegacy.run(BOTH_ID, '2024-02-01T10:00:00.000Z', legacyB);
  linkHp.run(hpB, BOTH_ID);

  // other: a separate member used to confirm the owner-only gate
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG });

  // Manual-id targets used by the find-form tests.
  insertLegacyMember(db, {
    legacy_member_id: MANUAL_LEGACY_ID,
    real_name: 'Manual Find Target',
    legacy_email: MANUAL_LEGACY_EMAIL,
  });
  insertHistoricalPerson(db, {
    person_id: MANUAL_HP_ID,
    person_name: 'Manual HP Target',
  });

  db.close();
  createApp = await importApp();
  // Reopen as a long-lived handle for runtime fixture inserts (schema is
  // already loaded; do not reuse createTestDb here as it would re-exec
  // the schema and fail with "table X already exists").
  testDb = new BetterSqlite3(dbPath);
  testDb.pragma('foreign_keys = ON');
});

afterAll(() => {
  testDb.close();
  cleanupTestDb(dbPath);
});

function cookieFor(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId })}`;
}

describe('GET /members/:slug/link-history — unified wizard', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const res = await request(createApp()).get(`/members/${UNLINKED_SLUG}/link-history`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
    expect(res.headers.location).toContain(`returnTo=%2Fmembers%2F${UNLINKED_SLUG}%2Flink-history`);
  });

  it('authenticated, slug != session owner -> 404 (anti-enumeration)', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history`)
      .set('Cookie', cookieFor(OTHER_ID));
    expect(res.status).toBe(404);
  });

  it('authenticated owner, both unlinked -> renders manual-id input + clubs placeholder', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    // Manual-id form is always visible
    expect(res.text).toContain(`action="/members/${UNLINKED_SLUG}/link-history/find"`);
    expect(res.text).toContain('Old footbag.org member ID');
    // Clubs placeholder
    expect(res.text).toContain('Your clubs (coming soon)');
    // No "already linked" badges for an unlinked member
    expect(res.text).not.toContain('Linked.');
  });

  it('authenticated owner, legacy linked + HP unlinked -> renders legacy linked badge + manual-id input', async () => {
    const res = await request(createApp())
      .get(`/members/${LEGACY_ONLY_SLUG}/link-history`)
      .set('Cookie', cookieFor(LEGACY_ONLY_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your old footbag.org user account');
    expect(res.text).toContain('Linked Jan 12, 2024');
    expect(res.text).toContain(`action="/members/${LEGACY_ONLY_SLUG}/link-history/find"`);
  });

  it('authenticated owner, both linked -> two linked badges, no actionable forms beyond manual-id', async () => {
    const res = await request(createApp())
      .get(`/members/${BOTH_SLUG}/link-history`)
      .set('Cookie', cookieFor(BOTH_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your old footbag.org user account');
    expect(res.text).toContain(BOTH_HP_NAME);
    // No "This is me" submit button when both are linked
    expect(res.text).not.toContain('This is me — link my history');
    // Clubs placeholder still rendered
    expect(res.text).toContain('Your clubs (coming soon)');
  });

  it('?from=register renders the "Skip and complete this later" affordance pointing at /members', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history?from=register`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Skip and complete this later');
    expect(res.text).toContain('href="/members"');
    expect(res.text).toMatch(/href="\/members"\s+class="text-muted"/);
  });

  it('?reason=low_confidence renders the low-confidence preamble', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history?reason=low_confidence`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain("We searched for a confident match and didn't find one");
  });

  it('direct navigation (no from=register) hides the skip affordance', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Skip and complete this later');
  });

  it('Back-to-dashboard link points at /members (not the user profile)', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Back to dashboard');
    expect(res.text).toMatch(/href="\/members"/);
  });

  it('hero contains only the page title (no instructional paragraph stuffed inside)', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toMatch(
      /<div class="hero hero-sm">\s*<div>\s*<h1>[^<]+<\/h1>\s*<\/div>\s*<\/div>/,
    );
  });

  it('?sent=1&out=no_match renders the dev outcomeNote inline on the wizard', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history?sent=1&out=no_match&since=0`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/confirmation link has been sent/);
    expect(res.text).toContain('No confirmation email was sent for this attempt');
  });

  it('?nomatch=1 renders the anti-enumeration "didn\'t match" notice', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history?nomatch=1`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain("That identifier didn't match an eligible record");
  });
});

describe('POST /members/:slug/link-history/find — manual-id lookup', () => {
  it('legacy email match, fast-path eligible -> 303 to wizard with linked=legacy', async () => {
    // Make the requesting member's login_email match the legacy_email so
    // the email-equality fast path fires inside initiateLegacyClaim.
    const stamp = Date.now();
    const sharedEmail = `wiz-fastpath-${stamp}@example.com`;
    insertLegacyMember(testDb, {
      legacy_member_id: `LM-WIZ-FAST-${stamp}`,
      real_name: 'Wiz Fast',
      legacy_email: sharedEmail,
    });
    const memberId = insertMember(testDb, {
      slug: `wiz_fast_${stamp}`,
      login_email: sharedEmail,
    });
    const res = await request(createApp())
      .post(`/members/wiz_fast_${stamp}/link-history/find`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: sharedEmail });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/wiz_fast_${stamp}/link-history?linked=legacy`);
  });

  it('legacy email match, NOT fast-path eligible -> 303 to wizard with sent=1&out=enqueued', async () => {
    const stamp = Date.now() + 1;
    const memberSlug = `wiz_enq_${stamp}`;
    const memberId = insertMember(testDb, {
      slug: memberSlug,
      login_email: `wiz-enq-${stamp}@example.com`,
    });
    const res = await request(createApp())
      .post(`/members/${memberSlug}/link-history/find`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: MANUAL_LEGACY_EMAIL });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`^/members/${memberSlug}/link-history\\?sent=1&out=enqueued&since=\\d+$`));
  });

  it('historical-person id (no legacy back-link) -> 303 to /history/<personId>/claim', async () => {
    const stamp = Date.now() + 2;
    const memberSlug = `wiz_hp_${stamp}`;
    const memberId = insertMember(testDb, {
      slug: memberSlug,
      login_email: `wiz-hp-${stamp}@example.com`,
    });
    const res = await request(createApp())
      .post(`/members/${memberSlug}/link-history/find`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: MANUAL_HP_ID });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/history/${MANUAL_HP_ID}/claim`);
  });

  // Per-member rate limit on the wizard path: CLAIM_INIT_MAX_PER_HOUR=5
  // (src/services/identityAccessService.ts:1047). When exhausted, the
  // controller catches RateLimitedError and redirects to the wizard with
  // ?nomatch=1 (Retry-After header is dropped by the redirect — a documented
  // degradation specific to the wizard's redirect-based UX vs. the /history/
  // claim path's direct 429 render).
  it('per-member rate-limit (6th attempt) -> 303 to wizard with nomatch=1', async () => {
    const stamp = Date.now() + 100;
    const memberSlug = `wiz_pm_rl_${stamp}`;
    const memberId = insertMember(testDb, {
      slug: memberSlug,
      login_email: `wiz-pm-rl-${stamp}@example.com`,
    });
    const cookie = cookieFor(memberId);
    const app = createApp();
    // Exhaust the per-member bucket with five garbage identifiers (each one
    // resolves as a no_match redirect, so the per-target cap on any one row
    // never fires).
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post(`/members/${memberSlug}/link-history/find`)
        .set('Cookie', cookie)
        .type('form')
        .send({ identifier: `garbage-wiz-${stamp}-${i}` });
      expect(r.status).toBe(303);
    }
    // Sixth attempt from same member: per-member cap fires; controller
    // catches the RateLimitedError and redirects with ?nomatch=1.
    const res = await request(app)
      .post(`/members/${memberSlug}/link-history/find`)
      .set('Cookie', cookie)
      .type('form')
      .send({ identifier: `garbage-wiz-${stamp}-6` });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`^/members/${memberSlug}/link-history\\?nomatch=1&tried=`));
  });

  it('garbage identifier -> 303 to wizard with sent=1&out=no_match&nomatch=1&tried=<echo>', async () => {
    const stamp = Date.now() + 3;
    const memberSlug = `wiz_garb_${stamp}`;
    const memberId = insertMember(testDb, {
      slug: memberSlug,
      login_email: `wiz-garb-${stamp}@example.com`,
    });
    const tried = `garbage-${stamp}`;
    const res = await request(createApp())
      .post(`/members/${memberSlug}/link-history/find`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: tried });
    expect(res.status).toBe(303);
    expect(res.headers.location).toMatch(new RegExp(`^/members/${memberSlug}/link-history\\?sent=1&out=no_match&since=\\d+&nomatch=1&tried=${tried}$`));
  });

  it('historical-person via legacy_member_id back-link -> 303 to /history/<personId>/claim', async () => {
    // The user's actual reported case: type a legacy_member_id like "11985"
    // into the wizard. The legacy_members row exists but is a stub (no
    // legacy_email), so initiateLegacyClaim returns no_match. The fallback
    // chain MUST then try historical_persons by the legacy_member_id back-
    // link and route the user to that HP's confirm page; claiming the HP
    // transitively claims the legacy row inside claimHistoricalPerson.
    const stamp = Date.now() + 4;
    const memberSlug = `wiz_backlink_${stamp}`;
    const memberId = insertMember(testDb, {
      slug: memberSlug,
      login_email: `wiz-backlink-${stamp}@example.com`,
    });
    const stubLegacyId = `LM-STUB-BACKLINK-${stamp}`;
    insertLegacyMember(testDb, {
      legacy_member_id: stubLegacyId,
      // Intentionally no legacy_email -- this is the dev-stub-row shape.
    });
    const hpPersonId = `hp-backlink-${stamp}`;
    insertHistoricalPerson(testDb, {
      person_id: hpPersonId,
      person_name: 'Stub Backlink HP',
      legacy_member_id: stubLegacyId,
    });
    const res = await request(createApp())
      .post(`/members/${memberSlug}/link-history/find`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: stubLegacyId });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/history/${hpPersonId}/claim`);
  });

  it('GET ?nomatch=1&tried=<key> renders the typed key inside the no-match notice', async () => {
    const res = await request(createApp())
      .get(`/members/${UNLINKED_SLUG}/link-history?nomatch=1&tried=foo123`)
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('You tried:');
    expect(res.text).toContain('foo123');
  });

  it('empty identifier -> 303 to wizard with nomatch=1', async () => {
    const res = await request(createApp())
      .post(`/members/${UNLINKED_SLUG}/link-history/find`)
      .set('Cookie', cookieFor(UNLINKED_ID))
      .type('form')
      .send({ identifier: '' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${UNLINKED_SLUG}/link-history?nomatch=1`);
  });

  it('owner gate: non-owner posting to a different slug -> 404', async () => {
    const res = await request(createApp())
      .post(`/members/${UNLINKED_SLUG}/link-history/find`)
      .set('Cookie', cookieFor(OTHER_ID))
      .type('form')
      .send({ identifier: 'anything' });
    expect(res.status).toBe(404);
  });
});

describe('GET /history/auto-link and /history/claim 302 redirects', () => {
  // 302 (not 301) because the redirect target depends on the current session
  // slug; a cached 301 would let later visits route a stale slug into the URL.
  it('GET /history/auto-link unauthenticated -> 302 to /login (auth gate fires before redirect)', async () => {
    const res = await request(createApp()).get('/history/auto-link');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('GET /history/auto-link authenticated -> 302 to wizard', async () => {
    const res = await request(createApp())
      .get('/history/auto-link?from=register')
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${UNLINKED_SLUG}/link-history?from=register`);
  });

  it('GET /history/claim authenticated -> 302 to wizard', async () => {
    const res = await request(createApp())
      .get('/history/claim?from=register&reason=low_confidence')
      .set('Cookie', cookieFor(UNLINKED_ID));
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe(`/members/${UNLINKED_SLUG}/link-history?from=register&reason=low_confidence`);
  });
});
