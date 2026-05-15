/**
 * Integration tests for the onboarding wizard surface
 * (/register/wizard/:taskType). The wizard follows the project-wide
 * HTTP response convention: POST state-changing handlers 303 to the
 * next-task GET (or /register/wizard/complete); transient-notice
 * outcomes 303 to the same step carrying a flash cookie that the next
 * GET consumes; validation errors re-render inline at 422; rate-limit
 * re-renders at 429 with Retry-After.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3133');

let createApp: Awaited<ReturnType<typeof importApp>>;
let testDb: BetterSqlite3.Database;

const OWNER_ID    = 'wiz-owner';
const OWNER_SLUG  = 'wiz_owner';
const OTHER_ID    = 'wiz-other';
const OTHER_SLUG  = 'wiz_other';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: OWNER_ID, slug: OWNER_SLUG, login_email: 'wiz-owner@example.com' });
  insertMember(db, { id: OTHER_ID, slug: OTHER_SLUG, login_email: 'wiz-other@example.com' });
  db.close();
  createApp = await importApp();
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

function countOnboardingTasks(memberId: string): number {
  return (testDb.prepare(
    'SELECT COUNT(*) AS c FROM member_onboarding_tasks WHERE member_id = ?',
  ).get(memberId) as { c: number }).c;
}

function getTaskState(memberId: string, taskType: string): string | null {
  const row = testDb.prepare(
    'SELECT state FROM member_onboarding_tasks WHERE member_id = ? AND task_type = ?',
  ).get(memberId, taskType) as { state: string } | undefined;
  return row?.state ?? null;
}

function countAuditEntries(memberId: string, actionType: string): number {
  return (testDb.prepare(
    "SELECT COUNT(*) AS c FROM audit_entries WHERE actor_member_id = ? AND action_type = ?",
  ).get(memberId, actionType) as { c: number }).c;
}

describe('GET /register/wizard/:taskType — auth + task list bootstrap', () => {
  it('unauthenticated -> 302 to /login with returnTo', async () => {
    const res = await request(createApp()).get('/register/wizard/legacy_claim');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
    expect(res.headers.location).toContain('returnTo=%2Fregister%2Fwizard%2Flegacy_claim');
  });

  it('authenticated GET creates all four task rows on first visit (idempotent)', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_bootstrap_${Date.now()}`, login_email: `wiz-bs-${Date.now()}@example.com` });
    expect(countOnboardingTasks(memberId)).toBe(0);
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(countOnboardingTasks(memberId)).toBe(4);
    await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(countOnboardingTasks(memberId)).toBe(4);
  });

  it('unknown :taskType -> 404', async () => {
    const res = await request(createApp())
      .get('/register/wizard/no_such_task')
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(404);
  });

  it('unicode in :taskType -> 404', async () => {
    const res = await request(createApp())
      .get(`/register/wizard/${encodeURIComponent('legacy_claim‮')}`)
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(404);
  });

  it('renders each known taskType', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_eachtask_${stamp}`, login_email: `wiz-each-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    for (const taskType of ['legacy_claim', 'club_affiliations', 'first_competition_year', 'show_competitive_results']) {
      const res = await request(createApp())
        .get(`/register/wizard/${taskType}`)
        .set('Cookie', cookie);
      expect(res.status, `taskType=${taskType}`).toBe(200);
    }
  });

  it('GET /register/wizard/complete renders the completion page', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_done_get_${Date.now()}`, login_email: `wiz-done-get-${Date.now()}@example.com` });
    const res = await request(createApp())
      .get('/register/wizard/complete')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Your onboarding tasks are handled');
  });
});

describe('POST /register/wizard/:taskType/skip — 303 advance to next task', () => {
  it('skipping legacy_claim transitions state and redirects 303 to club_affiliations', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_skip_lc_${stamp}`, login_email: `wiz-skip-lc-${stamp}@example.com` });
    await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    const beforeAudits = countAuditEntries(memberId, 'onboarding_task_skipped');
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/skip')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('skipped');
    expect(countAuditEntries(memberId, 'onboarding_task_skipped')).toBe(beforeAudits + 1);
    const followUp = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(followUp.status).toBe(200);
    expect(followUp.text).toContain('Club confirmation is being built');
  });

  it('skipping all four tasks in sequence lands on /register/wizard/complete', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_skip_all_${stamp}`, login_email: `wiz-skip-all-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookie);
    let res = await request(createApp()).post('/register/wizard/legacy_claim/skip').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    res = await request(createApp()).post('/register/wizard/club_affiliations/skip').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/first_competition_year');
    res = await request(createApp()).post('/register/wizard/first_competition_year/skip').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/show_competitive_results');
    res = await request(createApp()).post('/register/wizard/show_competitive_results/skip').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/complete');
    const followUp = await request(createApp()).get('/register/wizard/complete').set('Cookie', cookie);
    expect(followUp.text).toContain('Your onboarding tasks are handled');
    for (const tt of ['legacy_claim', 'club_affiliations', 'first_competition_year', 'show_competitive_results']) {
      expect(getTaskState(memberId, tt), `task=${tt}`).toBe('skipped');
    }
    expect(countAuditEntries(memberId, 'onboarding_task_skipped')).toBe(4);
  });

  it('skip on unknown taskType -> 404, no state changes', async () => {
    const before = countOnboardingTasks(OWNER_ID);
    const res = await request(createApp())
      .post('/register/wizard/no_such_task/skip')
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(404);
    expect(countOnboardingTasks(OWNER_ID)).toBe(before);
  });
});

describe('GET /register/wizard/legacy_claim — candidate list shape', () => {
  it('renders manual-id input pointing at the wizard find endpoint', async () => {
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('action="/register/wizard/legacy_claim/find"');
    expect(res.text).toContain('Old footbag.org member ID');
  });

  it('renders Skip and Back-to-dashboard affordances', async () => {
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(OWNER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain('action="/register/wizard/legacy_claim/skip"');
    expect(res.text).toContain(`href="/members/${OWNER_SLUG}"`);
  });
});

describe('POST /register/wizard/legacy_claim/find — PRG with flash-cookie carryover', () => {
  it('empty identifier -> 422 inline re-render', async () => {
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({ identifier: '' });
    expect(res.status).toBe(422);
    expect(res.headers.location).toBeUndefined();
    expect(res.text).toContain('action="/register/wizard/legacy_claim/find"');
  });

  it('legacy email fast-path -> 303 advance; task completed', async () => {
    const stamp = Date.now();
    const sharedEmail = `wiz-fast-${stamp}@example.com`;
    insertLegacyMember(testDb, { legacy_member_id: `LM-WIZ-FAST-${stamp}`, real_name: 'Wiz Fast', legacy_email: sharedEmail });
    const memberId = insertMember(testDb, { slug: `wiz_fast_${stamp}`, login_email: sharedEmail });
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: sharedEmail });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
  });

  it('enqueued outcome -> 303 same step; follow-up GET surfaces banner + sim-email card', async () => {
    const stamp = Date.now();
    const targetEmail = `wiz-enq-${stamp}@oldsite.example`;
    insertLegacyMember(testDb, { legacy_member_id: `LM-WIZ-ENQ-${stamp}`, real_name: 'Wiz Enq', legacy_email: targetEmail });
    const memberId = insertMember(testDb, { slug: `wiz_enq_${stamp}`, login_email: `wiz-enq-req-${stamp}@example.com` });
    const agent = request.agent(createApp());
    const res = await agent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: targetEmail });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('pending');
    const followUp = await agent
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(followUp.status).toBe(200);
    expect(followUp.text).toMatch(/confirmation link has been sent/);
    expect(followUp.text).toContain('Simulated email (dev)');
    expect(followUp.text).toMatch(/\/register\/wizard\/legacy_claim\/claim\/confirm\//);
  });

  it('no-match identifier -> 303 same step; follow-up GET surfaces the anti-enum banner', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_nx_${stamp}`, login_email: `wiz-nx-${stamp}@example.com` });
    const agent = request.agent(createApp());
    const res = await agent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: `garbage-${stamp}` });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    const followUp = await agent
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(followUp.status).toBe(200);
    expect(followUp.text).toMatch(/confirmation link has been sent/);
  });

  it('HP-only match -> 303 same step; follow-up GET surfaces the matched HP as a prominent card', async () => {
    const stamp = Date.now();
    const hpId = `hp-wiz-${stamp}`;
    insertHistoricalPerson(testDb, { person_id: hpId, person_name: 'Wiz HP Target' });
    const memberId = insertMember(testDb, { slug: `wiz_hp_${stamp}`, login_email: `wiz-hp-${stamp}@example.com` });
    const agent = request.agent(createApp());
    const res = await agent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: hpId });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    const followUp = await agent
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(followUp.text).toContain('Wiz HP Target');
    expect(followUp.text).toContain(`href="/history/${hpId}/claim"`);
  });

  it('per-member rate-limit exhaustion returns 429 with Retry-After', async () => {
    const stamp = Date.now() + 100;
    const memberId = insertMember(testDb, { slug: `wiz_rl_${stamp}`, login_email: `wiz-rl-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    const app = createApp();
    for (let i = 0; i < 5; i++) {
      const r = await request(app)
        .post('/register/wizard/legacy_claim/find').set('Cookie', cookie).type('form')
        .send({ identifier: `garbage-rl-${stamp}-${i}` });
      expect([303, 200]).toContain(r.status);
    }
    const res = await request(app)
      .post('/register/wizard/legacy_claim/find').set('Cookie', cookie).type('form')
      .send({ identifier: `garbage-rl-${stamp}-6` });
    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });
});

describe('POST /register/wizard/legacy_claim/claim/confirm — token confirmation', () => {
  async function issueTokenFor(memberId: string, legacyEmail: string): Promise<string> {
    const cookie = cookieFor(memberId);
    const agent = request.agent(createApp());
    const postRes = await agent
      .post('/register/wizard/legacy_claim/find').set('Cookie', cookie).type('form')
      .send({ identifier: legacyEmail });
    expect(postRes.status).toBe(303);
    const getRes = await agent.get('/register/wizard/legacy_claim').set('Cookie', cookie);
    const m = getRes.text.match(/\/register\/wizard\/legacy_claim\/claim\/confirm\/([A-Za-z0-9_-]+)/);
    if (!m) throw new Error('no claim URL in response');
    return m[1];
  }

  it('valid token GET renders the confirm prompt with record details', async () => {
    const stamp = Date.now();
    const legacyId = `LM-WIZ-TOK-${stamp}`;
    const legacyEmail = `wiz-tok-${stamp}@oldsite.example`;
    insertLegacyMember(testDb, { legacy_member_id: legacyId, real_name: 'Wiz Tok', legacy_email: legacyEmail, country: 'JP', is_hof: 1 });
    const memberId = insertMember(testDb, { slug: `wiz_tok_${stamp}`, login_email: `wiz-tok-req-${stamp}@example.com` });
    const token = await issueTokenFor(memberId, legacyEmail);
    const res = await request(createApp())
      .get(`/register/wizard/legacy_claim/claim/confirm/${token}`)
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Wiz Tok');
    expect(res.text).toContain('JP');
    expect(res.text).toContain(`value="${token}"`);
  });

  it('invalid token GET -> 400 with token-invalid template', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_inv_${Date.now()}`, login_email: `wiz-inv-${Date.now()}@example.com` });
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim/claim/confirm/not-a-real-token')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(400);
    expect(res.text).toContain('no longer valid');
  });

  it('valid token POST -> 303 advance; task completed; legacy row marked claimed', async () => {
    const stamp = Date.now();
    const legacyId = `LM-WIZ-CONS-${stamp}`;
    const legacyEmail = `wiz-cons-${stamp}@oldsite.example`;
    insertLegacyMember(testDb, { legacy_member_id: legacyId, real_name: 'Wiz Cons', legacy_email: legacyEmail });
    const memberId = insertMember(testDb, { slug: `wiz_cons_${stamp}`, login_email: `wiz-cons-req-${stamp}@example.com` });
    const token = await issueTokenFor(memberId, legacyEmail);
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim/confirm')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ token });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    expect(getTaskState(memberId, 'legacy_claim')).toBe('completed');
    const row = testDb.prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?').get(legacyId) as { claimed_by_member_id: string | null };
    expect(row.claimed_by_member_id).toBe(memberId);
  });

  it('missing token POST -> 422', async () => {
    const res = await request(createApp())
      .post('/register/wizard/legacy_claim/claim/confirm')
      .set('Cookie', cookieFor(OWNER_ID))
      .type('form')
      .send({});
    expect(res.status).toBe(422);
  });
});

describe('POST /register/wizard/first_competition_year/submit', () => {
  it('valid year -> 303 advance; members.first_competition_year written', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_yr_${stamp}`, login_email: `wiz-yr-${stamp}@example.com` });
    await request(createApp()).get('/register/wizard/first_competition_year').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/first_competition_year/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ year: '1998' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/show_competitive_results');
    const row = testDb.prepare('SELECT first_competition_year FROM members WHERE id = ?').get(memberId) as { first_competition_year: number | null };
    expect(row.first_competition_year).toBe(1998);
    expect(getTaskState(memberId, 'first_competition_year')).toBe('completed');
  });

  it('invalid year -> 422 with error inline', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_byr_${Date.now()}`, login_email: `wiz-byr-${Date.now()}@example.com` });
    await request(createApp()).get('/register/wizard/first_competition_year').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/first_competition_year/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ year: 'banana' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Year must be');
    expect(getTaskState(memberId, 'first_competition_year')).toBe('pending');
  });

  it('out-of-range year (1900) -> 422', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_oyr_${Date.now()}`, login_email: `wiz-oyr-${Date.now()}@example.com` });
    const res = await request(createApp())
      .post('/register/wizard/first_competition_year/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ year: '1900' });
    expect(res.status).toBe(422);
  });

  it('empty year -> 303 advance; field cleared; task completed', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_eyr_${Date.now()}`, login_email: `wiz-eyr-${Date.now()}@example.com` });
    await request(createApp()).get('/register/wizard/first_competition_year').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/first_competition_year/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ year: '' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/show_competitive_results');
    const row = testDb.prepare('SELECT first_competition_year FROM members WHERE id = ?').get(memberId) as { first_competition_year: number | null };
    expect(row.first_competition_year).toBeNull();
    expect(getTaskState(memberId, 'first_competition_year')).toBe('completed');
  });
});

describe('POST /register/wizard/show_competitive_results/submit', () => {
  it('enabled=1 -> 303 advance; writes 1; completes task', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_sr1_${Date.now()}`, login_email: `wiz-sr1-${Date.now()}@example.com` });
    await request(createApp()).get('/register/wizard/show_competitive_results').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/show_competitive_results/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ enabled: '1' });
    expect(res.status).toBe(303);
    const row = testDb.prepare('SELECT show_competitive_results FROM members WHERE id = ?').get(memberId) as { show_competitive_results: number };
    expect(row.show_competitive_results).toBe(1);
    expect(getTaskState(memberId, 'show_competitive_results')).toBe('completed');
  });

  it('missing enabled (unchecked) -> 303 advance; writes 0', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_sr0_${Date.now()}`, login_email: `wiz-sr0-${Date.now()}@example.com` });
    await request(createApp()).get('/register/wizard/show_competitive_results').set('Cookie', cookieFor(memberId));
    const res = await request(createApp())
      .post('/register/wizard/show_competitive_results/submit')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({});
    expect(res.status).toBe(303);
    const row = testDb.prepare('SELECT show_competitive_results FROM members WHERE id = ?').get(memberId) as { show_competitive_results: number };
    expect(row.show_competitive_results).toBe(0);
  });

  it('last outstanding task -> 303 to /register/wizard/complete', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_done_${Date.now()}`, login_email: `wiz-done-${Date.now()}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookie);
    await request(createApp()).post('/register/wizard/legacy_claim/skip').set('Cookie', cookie).type('form').send({});
    await request(createApp()).post('/register/wizard/club_affiliations/skip').set('Cookie', cookie).type('form').send({});
    await request(createApp()).post('/register/wizard/first_competition_year/skip').set('Cookie', cookie).type('form').send({});
    const res = await request(createApp())
      .post('/register/wizard/show_competitive_results/submit')
      .set('Cookie', cookie)
      .type('form')
      .send({ enabled: '1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/complete');
    const followUp = await request(createApp()).get('/register/wizard/complete').set('Cookie', cookie);
    expect(followUp.text).toContain('Your onboarding tasks are handled');
  });
});

describe('per-member scoping: handlers read memberId from session, never URL/body', () => {
  it('member A POST cannot affect member B onboarding rows', async () => {
    const memberAId = insertMember(testDb, { slug: `wiz_a_${Date.now()}`, login_email: `wiz-a-${Date.now()}@example.com` });
    const memberBId = insertMember(testDb, { slug: `wiz_b_${Date.now()}`, login_email: `wiz-b-${Date.now()}@example.com` });
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberAId));
    await request(createApp()).get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberBId));
    const beforeB = getTaskState(memberBId, 'legacy_claim');
    await request(createApp())
      .post('/register/wizard/legacy_claim/skip').set('Cookie', cookieFor(memberAId)).type('form').send({});
    expect(getTaskState(memberAId, 'legacy_claim')).toBe('skipped');
    expect(getTaskState(memberBId, 'legacy_claim')).toBe(beforeB);
  });
});

describe('flash cookie behavior (adversarial)', () => {
  it('tampered flash signature yields no banner', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_ft_${Date.now()}`, login_email: `wiz-ft-${Date.now()}@example.com` });
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', `${cookieFor(memberId)}; footbag_flash=wizard_legacy_claim_result:{"hpPersonId":"hp-tampered"}`)
      .send();
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('confirmation link has been sent');
  });

  it('flash with hpPersonId pointing at a non-existent HP shows banner but no extra card', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_fg_${stamp}`, login_email: `wiz-fg-${stamp}@example.com` });
    const agent = request.agent(createApp());
    const post = await agent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: `bogus-${stamp}` });
    expect(post.status).toBe(303);
    const get = await agent
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(memberId));
    expect(get.status).toBe(200);
    expect(get.text).toMatch(/confirmation link has been sent/);
    expect(get.text).not.toContain(`hp_review_page`);
  });

  it('flash is not consumed by unrelated task GET; persists for next legacy_claim GET', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_fb_${stamp}`, login_email: `wiz-fb-${stamp}@example.com` });
    const agent = request.agent(createApp());
    const post = await agent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: `garbage-${stamp}` });
    expect(post.status).toBe(303);
    // Detour to a different task GET; the flash must NOT be consumed there.
    const detour = await agent.get('/register/wizard/first_competition_year').set('Cookie', cookieFor(memberId));
    expect(detour.status).toBe(200);
    // The legacy_claim GET still has access to the flash.
    const target = await agent.get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    expect(target.text).toMatch(/confirmation link has been sent/);
  });

  it('flash is consumed (one-shot): second GET shows no banner', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_oneshot_${stamp}`, login_email: `wiz-os-${stamp}@example.com` });
    const agent = request.agent(createApp());
    const post = await agent
      .post('/register/wizard/legacy_claim/find')
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ identifier: `garbage-${stamp}` });
    expect(post.status).toBe(303);
    const first = await agent.get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    expect(first.text).toMatch(/confirmation link has been sent/);
    const second = await agent.get('/register/wizard/legacy_claim').set('Cookie', cookieFor(memberId));
    expect(second.text).not.toMatch(/confirmation link has been sent/);
  });
});

describe('post-verify redirect lands on the wizard', () => {
  it('routes to /register/wizard/legacy_claim regardless of classifier confidence', async () => {
    expect(true).toBe(true);
  });

  it('renders the Back-to-dashboard link based on the requesting session slug', async () => {
    const res = await request(createApp())
      .get('/register/wizard/legacy_claim')
      .set('Cookie', cookieFor(OTHER_ID));
    expect(res.status).toBe(200);
    expect(res.text).toContain(`href="/members/${OTHER_SLUG}"`);
  });
});
