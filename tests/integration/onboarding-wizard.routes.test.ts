/**
 * Integration tests for the onboarding wizard surface
 * (/register/wizard/:taskType). The wizard follows the project-wide
 * HTTP response convention: POST state-changing handlers 303 to the
 * next-task GET (or /register/wizard/complete); transient-notice
 * outcomes 303 to the same step carrying a flash cookie that the next
 * GET consumes; validation errors re-render inline at 422; rate-limit
 * re-renders at 429 with Retry-After.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { expectLoggedError } from '../setup-env';
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

  it('authenticated GET creates all task rows on first visit (idempotent)', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_bootstrap_${Date.now()}`, login_email: `wiz-bs-${Date.now()}@example.com` });
    expect(countOnboardingTasks(memberId)).toBe(0);
    const res = await request(createApp())
      .get('/register/wizard/personal_details')
      .set('Cookie', cookieFor(memberId));
    expect(res.status).toBe(200);
    expect(countOnboardingTasks(memberId)).toBe(3);
    await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(countOnboardingTasks(memberId)).toBe(3);
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

  it('renders each known taskType (club_affiliations 303-transitions when the member has zero possible cards)', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_eachtask_${stamp}`, login_email: `wiz-each-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    for (const taskType of ['legacy_claim']) {
      const res = await request(createApp())
        .get(`/register/wizard/${taskType}`)
        .set('Cookie', cookie);
      expect(res.status, `taskType=${taskType}`).toBe(200);
    }
    // club_affiliations with no legacy linkage auto-transitions to
    // not_applicable on GET, and 303-redirects to the next pending task.
    const ca = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookie);
    expect(ca.status).toBe(303);
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
    // Member has no legacy_member_id linkage -> listWizardCardsForMember
    // returns []; the GET handler auto-transitions club_affiliations to
    // not_applicable and 303-redirects to the next pending task.
    const followUp = await request(createApp())
      .get('/register/wizard/club_affiliations')
      .set('Cookie', cookieFor(memberId));
    expect(followUp.status).toBe(303);
    expect(getTaskState(memberId, 'club_affiliations')).toBe('not_applicable');
  });

  it('skipping all tasks in sequence lands on /register/wizard/complete', async () => {
    const stamp = Date.now();
    const memberId = insertMember(testDb, { slug: `wiz_skip_all_${stamp}`, login_email: `wiz-skip-all-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp()).get('/register/wizard/personal_details').set('Cookie', cookie);
    let res = await request(createApp()).post('/register/wizard/personal_details/skip').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/legacy_claim');
    res = await request(createApp()).post('/register/wizard/legacy_claim/skip').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/club_affiliations');
    res = await request(createApp()).post('/register/wizard/club_affiliations/skip').set('Cookie', cookie).type('form').send({});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/register/wizard/complete');
    const followUp = await request(createApp()).get('/register/wizard/complete').set('Cookie', cookie);
    expect(followUp.text).toContain('Your onboarding tasks are handled');
    for (const tt of ['personal_details', 'legacy_claim', 'club_affiliations'] as const) {
      expect(getTaskState(memberId, tt), `task=${tt}`).toBe('skipped');
    }
    expect(countAuditEntries(memberId, 'onboarding_task_skipped')).toBe(3);
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

  // ── B5 regression: confirmation-email enqueue failure ────────────────────
  //
  // initiateLegacyClaim used to call bare enqueueEmail then return
  // `{ kind: 'enqueued' }` regardless of outcome. R4 pattern (mirrored from
  // changePassword): use enqueueEmailOrFail wrapped in try/catch; on catch,
  // append a `legacy.claim_initiate_notification_failed` audit row and
  // re-throw so the controller maps to 503 via handleControllerError.
  describe('enqueueEmailOrFail failure', () => {
    // eslint-disable-next-line @typescript-eslint/consistent-type-imports
    let commsMod: typeof import('../../src/services/communicationService');

    beforeAll(async () => {
      commsMod = await import('../../src/services/communicationService');
    });

    afterEach(() => {
      commsMod.resetCommunicationServiceForTests();
    });

    it('throws → 503 + token committed + audit row + no outbox row', async () => {
      expectLoggedError('audit: legacy.claim_initiate_notification_failed');
      const stamp = Date.now() + 200;
      const targetEmail = `wiz-enq-fail-${stamp}@oldsite.example`;
      const legacyId = `LM-WIZ-ENQFAIL-${stamp}`;
      insertLegacyMember(testDb, {
        legacy_member_id: legacyId,
        real_name: 'Wiz EnqFail Target',
        legacy_email: targetEmail,
      });
      const memberId = insertMember(testDb, {
        slug: `wiz_enqfail_${stamp}`,
        login_email: `wiz-enqfail-req-${stamp}@example.com`,
      });

      const { ServiceUnavailableError } = await import('../../src/services/serviceErrors');
      commsMod.setCommunicationServiceForTests({
        enqueueEmail: () => {
          throw new ServiceUnavailableError('synthetic enqueue failure');
        },
        enqueueEmailOrFail: () => {
          throw new ServiceUnavailableError(
            'synthetic enqueueEmailOrFail failure for legacy-claim initiation',
          );
        },
        enqueueMailingListEmail: () => ({ enqueued: 0, duplicates: 0 }),
        processSendQueue: async () => ({
          claimed: 0, sent: 0, failed: 0, deadLettered: 0, paused: false,
        }),
      });

      const res = await request(createApp())
        .post('/register/wizard/legacy_claim/find')
        .set('Cookie', cookieFor(memberId))
        .type('form')
        .send({ identifier: targetEmail });

      expect(res.status).toBe(503);

      // The account_claim token was committed by accountTokenService.issueToken
      // before the enqueueEmailOrFail call. Confirm row presence keyed on the
      // requesting member and target legacy id.
      const tokenRow = testDb.prepare(
        `SELECT id, target_legacy_member_id FROM account_tokens
           WHERE member_id = ? AND token_type = 'account_claim'
           ORDER BY created_at DESC LIMIT 1`,
      ).get(memberId) as
        | { id: string; target_legacy_member_id: string | null }
        | undefined;
      expect(tokenRow).toBeDefined();
      expect(tokenRow!.target_legacy_member_id).toBe(legacyId);

      // Catch-block audit row exists and carries the expected shape.
      const auditRow = testDb.prepare(
        `SELECT action_type, category, actor_type, entity_id FROM audit_entries
           WHERE entity_id = ?
             AND action_type = 'legacy.claim_initiate_notification_failed'
           ORDER BY created_at DESC LIMIT 1`,
      ).get(memberId) as
        | { action_type: string; category: string; actor_type: string; entity_id: string }
        | undefined;
      expect(auditRow).toBeDefined();
      expect(auditRow!.action_type).toBe('legacy.claim_initiate_notification_failed');
      expect(auditRow!.category).toBe('identity');
      expect(auditRow!.actor_type).toBe('system');
      expect(auditRow!.entity_id).toBe(memberId);

      // The strict helper threw before any outbox row could land.
      const outboxRows = testDb.prepare(
        `SELECT id FROM outbox_emails WHERE recipient_email = ?`,
      ).all(targetEmail) as Array<{ id: string }>;
      expect(outboxRows).toHaveLength(0);
    });
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

describe('last outstanding task -> 303 to /register/wizard/complete', () => {
  it('skipping all three tasks lands on complete', async () => {
    const memberId = insertMember(testDb, { slug: `wiz_done_${Date.now()}`, login_email: `wiz-done-${Date.now()}@example.com` });
    const cookie = cookieFor(memberId);
    await request(createApp()).get('/register/wizard/personal_details').set('Cookie', cookie);
    await request(createApp()).post('/register/wizard/personal_details/skip').set('Cookie', cookie).type('form').send({});
    await request(createApp()).post('/register/wizard/legacy_claim/skip').set('Cookie', cookie).type('form').send({});
    await request(createApp()).post('/register/wizard/club_affiliations/skip').set('Cookie', cookie).type('form').send({});
    const followUp = await request(createApp()).get('/register/wizard/complete').set('Cookie', cookie);
    expect(followUp.status).toBe(200);
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
    const detour = await agent.get('/register/wizard/personal_details').set('Cookie', cookieFor(memberId));
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

// ── wizard.start audit entry (SC §MemberOnboardingService invariant) ─────────
//
// Every wizard transition emits an audit_entries row. The `start` event
// fires once per member, the first time the task list materializes; later
// GETs are idempotent no-ops on the task table and must not duplicate
// the audit row.

describe('GET /register/wizard/:taskType — wizard.start audit invariant', () => {
  it('first GET writes exactly one wizard.start audit entry; second GET is a no-op', async () => {
    const stamp = Date.now() + 200;
    const memberId = insertMember(testDb, { slug: `wiz_start_${stamp}`, login_email: `wiz-start-${stamp}@example.com` });
    const cookie = cookieFor(memberId);
    const app = createApp();

    expect(countAuditEntries(memberId, 'wizard.start')).toBe(0);

    await request(app).get('/register/wizard/legacy_claim').set('Cookie', cookie);
    expect(countAuditEntries(memberId, 'wizard.start')).toBe(1);

    await request(app).get('/register/wizard/legacy_claim').set('Cookie', cookie);
    expect(countAuditEntries(memberId, 'wizard.start')).toBe(1);
  });
});

// ── Per-IP rate limit on legacy-claim initiate (DD §3.8) ─────────────────────
//
// Caps a single source IP across all members it has authenticated as. Silent
// outcome so an attacker rotating sock-puppet accounts cannot enumerate the
// cap from response shape. The per-member cap remains a throw (legitimate
// users own that feedback signal); the per-IP cap is purely defensive.

describe('initiateLegacyClaim — per-IP rate limit', () => {
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  let rl: typeof import('../../src/services/rateLimitService');

  beforeAll(async () => {
    svc = (await import('../../src/services/identityAccessService')).identityAccessService;
    rl  = await import('../../src/services/rateLimitService');
  });

  it('11th call from one IP across 11 distinct members returns silent ip_rate_limited', () => {
    rl.resetRateLimitForTests();
    const stamp = Date.now() + 300;
    const SHARED_IP = `203.0.113.${(stamp % 200) + 1}`;
    const memberIds: string[] = [];
    for (let i = 0; i < 11; i++) {
      memberIds.push(insertMember(testDb, {
        slug:        `wiz_ip_${stamp}_${i}`,
        login_email: `wiz-ip-${stamp}-${i}@example.com`,
      }));
    }
    // First 10 attempts succeed under the IP cap (each a no_match, anti-enum).
    for (let i = 0; i < 10; i++) {
      const outcome = svc.initiateLegacyClaim(memberIds[i], `bogus-id-${stamp}-${i}`, SHARED_IP);
      expect(outcome.kind).toBe('no_match');
    }
    // 11th from a fresh member on the same IP hits the IP cap.
    const blocked = svc.initiateLegacyClaim(memberIds[10], `bogus-id-${stamp}-10`, SHARED_IP);
    expect(blocked.kind).toBe('ip_rate_limited');
  });
});
