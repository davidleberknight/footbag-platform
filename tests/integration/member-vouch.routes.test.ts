/**
 * The Active Player vouch, from the member-facing side: the control on another
 * member's profile and the POST behind it.
 *
 * The rules of the vouch belong to ActivePlayerService and are covered by its
 * own suite. What this suite holds is the surface contract: the control is
 * offered only to a member who may actually use it, the outcome the voucher
 * reads back is the right one for what happened, and every way of reaching the
 * handler without the control (a crafted target, a self-vouch, a foreign
 * origin, a padded body) is refused.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4188');

import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { expectCsrfReject } from '../fixtures/expectCsrfReject';
import {
  insertMember,
  createMemberAtTier,
  createTier0WithActivePlayer,
  createTestSessionJwt,
  insertSystemConfig,
} from '../fixtures/factories';

const VOUCHER_T2 = 'mv-voucher-t2';
const VOUCHER_NO_SHORTEN = 'mv-voucher-noshorten';
const VOUCHER_TIER1_TARGET = 'mv-voucher-t1target';
const VOUCHER_MASS = 'mv-voucher-mass';
const VOUCHER_RATE = 'mv-voucher-rate';
const VOUCHER_T3 = 'mv-voucher-t3';
const VIEWER_T1 = 'mv-viewer-t1';
const VIEWER_T0 = 'mv-viewer-t0';
const ADMIN_T0 = 'mv-admin-t0';
const ADMIN_T2 = 'mv-admin-t2';

const TARGET_PLAIN = 'mv-target-plain';
const TARGET_FUTURE_AP = 'mv-target-future';
const TARGET_TIER1 = 'mv-target-tier1';
const TARGET_HOF = 'mv-target-hof';
const TARGET_PENDING = 'mv-target-pending';
const TARGET_MASS = 'mv-target-mass';

const SLUG = (id: string) => id.replace(/-/g, '_');
// Held verbatim here rather than imported, so a silent rewording of the
// member-facing sentence fails this suite rather than passing with new text.
const VOUCH_ROUTE_SENTENCE =
  'You can also vouch for a Tier 0 member to give them Active Player status: find them with '
  + 'the member search below, then use the vouch control on their profile.';
const FAR_FUTURE_AP = '2099-01-01T00:00:00.000Z';

let createApp: Awaited<ReturnType<typeof importApp>>;

const cookieFor = (id: string) =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId: id, role: 'member' })}`;
const adminCookieFor = (id: string) =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId: id, role: 'admin' })}`;

/** The flash cookie a response hands back, in `name=value` form. */
function flashCookieIn(res: { headers: Record<string, unknown> }): string {
  const setCookies = (res.headers['set-cookie'] as unknown as string[] | undefined) ?? [];
  const flash = setCookies.find((c) => c.startsWith('footbag_flash='));
  return flash ? flash.split(';')[0] : '';
}

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function grantRows(memberId: string): Array<Record<string, unknown>> {
  const db = openDb();
  const rows = db.prepare(
    `SELECT change_type, reason_code, actor_member_id, new_active_player_expires_at
       FROM active_player_grants WHERE member_id = ? ORDER BY created_at`,
  ).all(memberId) as Array<Record<string, unknown>>;
  db.close();
  return rows;
}

function vouchCount(targetId: string): number {
  const db = openDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM active_player_vouches WHERE target_member_id = ?`,
  ).get(targetId) as { n: number };
  db.close();
  return row.n;
}

function outboxCount(memberId: string): number {
  const db = openDb();
  const row = db.prepare(
    `SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?`,
  ).get(memberId) as { n: number };
  db.close();
  return row.n;
}

function tierOf(memberId: string): string {
  const db = openDb();
  const row = db.prepare(
    `SELECT tier_status FROM member_membership_status_current WHERE member_id = ?`,
  ).get(memberId) as { tier_status: string } | undefined;
  db.close();
  return row?.tier_status ?? 'tier0';
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The keys applyVouch reads: the grant length and the per-voucher bucket.
  const seedCfg = (config_key: string, value_json: string) => insertSystemConfig(db, {
    config_key, value_json,
    created_at: '2025-01-01T00:00:00.000Z',
    reason_text: 'seed',
  });
  seedCfg('active_player_duration_days', '730');
  seedCfg('vouch_rate_limit_max_per_hour', '5');
  seedCfg('vouch_rate_limit_window_minutes', '60');

  // A voucher per case: the rate-limit bucket is per voucher, so sharing one
  // would make each test's verdict depend on the order the others ran in.
  for (const id of [
    VOUCHER_T2, VOUCHER_NO_SHORTEN, VOUCHER_TIER1_TARGET, VOUCHER_MASS, VOUCHER_RATE,
  ]) {
    createMemberAtTier(db, { id, slug: SLUG(id), tier: 'tier2' });
  }
  createMemberAtTier(db, { id: VOUCHER_T3, slug: SLUG(VOUCHER_T3), tier: 'tier3', underlying_tier_status: 'tier2' });
  createMemberAtTier(db, { id: VIEWER_T1, slug: SLUG(VIEWER_T1), tier: 'tier1' });
  insertMember(db, { id: VIEWER_T0, slug: SLUG(VIEWER_T0) });
  // An administrator holds every tier entitlement through the tier predicates,
  // on a governance rule the seeded rows here deliberately break: this one has
  // no paid grant, and the vouch reads the grant.
  insertMember(db, { id: ADMIN_T0, slug: SLUG(ADMIN_T0), is_admin: 1 });
  createMemberAtTier(db, {
    id: ADMIN_T2, slug: SLUG(ADMIN_T2), tier: 'tier2', memberOverrides: { is_admin: 1 },
  });

  insertMember(db, { id: TARGET_PLAIN, slug: SLUG(TARGET_PLAIN), display_name: 'Plain Target' });
  createTier0WithActivePlayer(db, {
    id: TARGET_FUTURE_AP,
    slug: SLUG(TARGET_FUTURE_AP),
    expiresAt: FAR_FUTURE_AP,
    memberOverrides: { display_name: 'Future Target' },
  });
  createMemberAtTier(db, { id: TARGET_TIER1, slug: SLUG(TARGET_TIER1), tier: 'tier1' });
  insertMember(db, { id: TARGET_HOF, slug: SLUG(TARGET_HOF), is_hof: 1 });
  insertMember(db, { id: TARGET_MASS, slug: SLUG(TARGET_MASS) });
  // Deliberately left mid-wizard: an account with no profile for any viewer.
  insertMember(db, { id: TARGET_PENDING, slug: SLUG(TARGET_PENDING), onboarding: 'none' });

  for (let i = 0; i < 6; i += 1) {
    const id = `mv-rate-target-${i}`;
    insertMember(db, { id, slug: SLUG(id) });
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the vouch control on a member profile', () => {
  it('offers it to a Tier 2 viewer on a Tier 0 member profile', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(TARGET_PLAIN)}`)
      .set('Cookie', cookieFor(VOUCHER_T2));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Vouch for Active Player Status');
    expect(res.text).toContain(`action="/members/${SLUG(TARGET_PLAIN)}/vouch"`);
    expect(res.text).toContain('Vouch for This Member');
  });

  it('offers it to a Tier 3 viewer', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(TARGET_PLAIN)}`)
      .set('Cookie', cookieFor(VOUCHER_T3));

    expect(res.status).toBe(200);
    expect(res.text).toContain('Vouch for Active Player Status');
  });

  it('withholds it from a Tier 1 viewer', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(TARGET_PLAIN)}`)
      .set('Cookie', cookieFor(VIEWER_T1));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Vouch for Active Player Status');
  });

  it('withholds it from a Tier 0 viewer', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(TARGET_PLAIN)}`)
      .set('Cookie', cookieFor(VIEWER_T0));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Vouch for Active Player Status');
  });

  it('withholds it when the member being viewed is not Tier 0', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(TARGET_TIER1)}`)
      .set('Cookie', cookieFor(VOUCHER_T2));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Vouch for Active Player Status');
  });

  it('withholds it from an anonymous viewer of a Hall of Fame profile', async () => {
    const res = await request(createApp()).get(`/members/${SLUG(TARGET_HOF)}`);

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Vouch for Active Player Status');
  });

  it('withholds it from an administrator who holds no paid tier', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(TARGET_PLAIN)}`)
      .set('Cookie', adminCookieFor(ADMIN_T0));

    expect(res.status).toBe(200);
    // The tier predicates would let this administrator through; the vouch reads
    // the tier grant and would refuse, so the control must not appear.
    expect(res.text).not.toContain('Vouch for Active Player Status');
  });

  it('withholds it on the profile of an account still in the wizard', async () => {
    // An administrator is the one viewer who reaches a pending account's page.
    const res = await request(createApp())
      .get(`/members/${SLUG(TARGET_PENDING)}`)
      .set('Cookie', adminCookieFor(ADMIN_T2));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Vouch for Active Player Status');
  });

  it('tells a Tier 2 member on their own profile where the control lives', async () => {
    // The control cannot appear on this page: a member never vouches for
    // themselves. Naming the capability without saying where to use it is what
    // this sentence exists to prevent, so it is held in place here.
    const res = await request(createApp())
      .get(`/members/${SLUG(VOUCHER_T2)}`)
      .set('Cookie', cookieFor(VOUCHER_T2));

    expect(res.status).toBe(200);
    expect(res.text).toContain(VOUCH_ROUTE_SENTENCE);
  });

  it('tells a Tier 3 member the same thing, since the vouch is theirs too', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(VOUCHER_T3)}`)
      .set('Cookie', cookieFor(VOUCHER_T3));

    expect(res.status).toBe(200);
    expect(res.text).toContain(VOUCH_ROUTE_SENTENCE);
  });

  it('tells a Tier 1 member nothing of the kind', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(VIEWER_T1)}`)
      .set('Cookie', cookieFor(VIEWER_T1));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain(VOUCH_ROUTE_SENTENCE);
  });

  it('never puts it on the viewer own profile', async () => {
    const res = await request(createApp())
      .get(`/members/${SLUG(VOUCHER_T2)}`)
      .set('Cookie', cookieFor(VOUCHER_T2));

    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Vouch for Active Player Status');
  });
});

describe('POST /members/:memberKey/vouch', () => {
  it('grants Active Player status and reports the new expiry back', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${SLUG(TARGET_PLAIN)}/vouch`)
      .set('Cookie', cookieFor(VOUCHER_T2))
      .send({});

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${SLUG(TARGET_PLAIN)}`);

    const grants = grantRows(TARGET_PLAIN);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatchObject({
      change_type: 'grant',
      reason_code: 'tier2_vouch_active_player',
      actor_member_id: VOUCHER_T2,
    });
    expect(vouchCount(TARGET_PLAIN)).toBe(1);
    expect(outboxCount(TARGET_PLAIN)).toBe(1);

    const expiresAt = String(grants[0].new_active_player_expires_at);
    const expectedDate = new Date(expiresAt).toLocaleDateString('en-GB', {
      year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC',
    });
    const followUp = await request(app)
      .get(`/members/${SLUG(TARGET_PLAIN)}`)
      .set('Cookie', [cookieFor(VOUCHER_T2), flashCookieIn(res)].join('; '));

    expect(followUp.status).toBe(200);
    expect(followUp.text).toContain(
      `Vouch recorded. Plain Target has Active Player status until ${expectedDate}.`,
    );
    // A standing changed, so this one is the green banner.
    expect(followUp.text).toContain('class="form-success-banner" role="status"');
  });

  it('takes the note exactly once', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${SLUG(TARGET_MASS)}/vouch`)
      .set('Cookie', cookieFor(VOUCHER_MASS))
      .send({});
    const flash = flashCookieIn(res);

    const first = await request(app)
      .get(`/members/${SLUG(TARGET_MASS)}`)
      .set('Cookie', [cookieFor(VOUCHER_MASS), flash].join('; '));
    expect(first.text).toContain('Vouch recorded.');

    // The response that showed it also cleared it, so a browser following the
    // clear no longer carries a note into the next profile it opens.
    const cleared = flashCookieIn(first);
    expect(cleared).toBe('footbag_flash=');

    const second = await request(app)
      .get(`/members/${SLUG(TARGET_MASS)}`)
      .set('Cookie', cookieFor(VOUCHER_MASS));
    expect(second.text).not.toContain('Vouch recorded.');
  });

  it('reports no change when the member already holds a later expiry', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${SLUG(TARGET_FUTURE_AP)}/vouch`)
      .set('Cookie', cookieFor(VOUCHER_NO_SHORTEN))
      .send({});

    expect(res.status).toBe(303);
    // The standing the member already had is the only grant row: an older
    // vouch must not shorten it, and must not add a row either.
    expect(grantRows(TARGET_FUTURE_AP)).toHaveLength(1);
    expect(vouchCount(TARGET_FUTURE_AP)).toBe(0);

    const followUp = await request(app)
      .get(`/members/${SLUG(TARGET_FUTURE_AP)}`)
      .set('Cookie', [cookieFor(VOUCHER_NO_SHORTEN), flashCookieIn(res)].join('; '));
    expect(followUp.text).toContain(
      'No change needed. Future Target already has Active Player status until 1 January 2099.',
    );
    // Nothing changed and nothing was refused, so it reads neutral rather than
    // wearing the green banner that means the standing moved.
    expect(followUp.text).toContain('class="form-notice" role="status"');
    expect(followUp.text).not.toContain('form-success-banner');
  });

  it('reports the story no-op wording for a member above Tier 0', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/members/${SLUG(TARGET_TIER1)}/vouch`)
      .set('Cookie', cookieFor(VOUCHER_TIER1_TARGET))
      .send({});

    expect(res.status).toBe(303);
    expect(grantRows(TARGET_TIER1)).toHaveLength(0);
    expect(vouchCount(TARGET_TIER1)).toBe(0);

    const followUp = await request(app)
      .get(`/members/${SLUG(TARGET_TIER1)}`)
      .set('Cookie', [cookieFor(VOUCHER_TIER1_TARGET), flashCookieIn(res)].join('; '));
    expect(followUp.text).toContain(
      'No change needed - Active Player status applies only to Tier 0 members.',
    );
    expect(followUp.text).toContain('class="form-notice" role="status"');
    expect(followUp.text).not.toContain('form-success-banner');
  });

  it('refuses a Tier 1 voucher', async () => {
    const res = await request(createApp())
      .post(`/members/${SLUG(TARGET_PLAIN)}/vouch`)
      .set('Cookie', cookieFor(VIEWER_T1))
      .send({});

    expect(res.status).toBe(403);
  });

  it('refuses a Tier 0 voucher', async () => {
    const res = await request(createApp())
      .post(`/members/${SLUG(TARGET_PLAIN)}/vouch`)
      .set('Cookie', cookieFor(VIEWER_T0))
      .send({});

    expect(res.status).toBe(403);
  });

  it('sends an unauthenticated caller to log in', async () => {
    const res = await request(createApp())
      .post(`/members/${SLUG(TARGET_PLAIN)}/vouch`)
      .send({});

    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('answers a self-vouch with not-found', async () => {
    const res = await request(createApp())
      .post(`/members/${SLUG(VOUCHER_T2)}/vouch`)
      .set('Cookie', cookieFor(VOUCHER_T2))
      .send({});

    expect(res.status).toBe(404);
  });

  it('answers an unknown member with not-found', async () => {
    const res = await request(createApp())
      .post('/members/nobody_at_all/vouch')
      .set('Cookie', cookieFor(VOUCHER_T2))
      .send({});

    expect(res.status).toBe(404);
  });

  it('answers a member still in the wizard with not-found, and writes nothing', async () => {
    const res = await request(createApp())
      .post(`/members/${SLUG(TARGET_PENDING)}/vouch`)
      .set('Cookie', cookieFor(VOUCHER_T2))
      .send({});

    expect(res.status).toBe(404);
    expect(grantRows(TARGET_PENDING)).toHaveLength(0);
  });

  it('persists nothing a padded body asks for', async () => {
    const before = tierOf(TARGET_MASS);
    const res = await request(createApp())
      .post(`/members/${SLUG(TARGET_MASS)}/vouch`)
      .set('Cookie', cookieFor(VOUCHER_MASS))
      .send({
        tier: 'tier3',
        tier_status: 'tier3',
        memberId: VOUCHER_MASS,
        expiresAt: FAR_FUTURE_AP,
        is_admin: '1',
        reasonText: 'x'.repeat(5000),
      });

    expect(res.status).toBe(303);
    expect(tierOf(TARGET_MASS)).toBe(before);
    const db = openDb();
    const admin = db.prepare(`SELECT is_admin FROM members WHERE id = ?`).get(TARGET_MASS) as { is_admin: number };
    const reasons = db.prepare(
      `SELECT reason_text FROM active_player_vouches WHERE target_member_id = ?`,
    ).all(TARGET_MASS) as Array<{ reason_text: string | null }>;
    db.close();
    expect(admin.is_admin).toBe(0);
    // The body cannot reach the vouch's reason: the surface does not offer one.
    expect(reasons.every(r => r.reason_text === null)).toBe(true);
  });

  it('answers 429 with Retry-After once the voucher passes the limit', async () => {
    const app = createApp();
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app)
        .post(`/members/mv_rate_target_${i}/vouch`)
        .set('Cookie', cookieFor(VOUCHER_RATE))
        .send({});
      expect(res.status).toBe(303);
    }

    const sixth = await request(app)
      .post('/members/mv_rate_target_5/vouch')
      .set('Cookie', cookieFor(VOUCHER_RATE))
      .send({});

    expect(sixth.status).toBe(429);
    expect(sixth.headers['retry-after']).toBe('3600');
    expect(sixth.text).toContain('You have reached the limit for vouches in a short period.');
    // A refusal answered 429 must not wear the banner that means it worked.
    expect(sixth.text).toContain('class="form-error-banner" role="alert"');
    expect(sixth.text).not.toContain('form-success-banner');
    expect(grantRows('mv-rate-target-5')).toHaveLength(0);
  });

  it('rejects a request from a foreign origin', async () => {
    await expectCsrfReject(createApp(), 'post', `/members/${SLUG(TARGET_PLAIN)}/vouch`, {
      cookie: cookieFor(VOUCHER_T2),
    });
  });
});
