/**
 * Administrator member-management surface: the member lookup, the per-member
 * record, and the corrections reached from it.
 *
 * Covers the four lookup keys and that the lookup reaches members the
 * member-facing search excludes; the record's admin-only content; the name
 * correction including every registration rule it inherits, the audit row's
 * before-and-after values, and that the member's profile URL and provenance
 * tags survive it; the platform account's reserved-word exemption; the tier
 * change and the Active Player expiry correction, including a correction that
 * shortens a standing; and that a correction changing nothing writes nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, createMemberAtTier, createTestSessionJwt, insertPersonaNamedGallery,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3421');

const ADMIN_ID = 'am_admin_001';
const MEMBER_ID = 'am_member_001';
const SYSTEM_ID = 'am_system_001';
const DECEASED_ID = 'am_deceased_001';
const OPTED_OUT_ID = 'am_optout_001';
const RULES_ID = 'am_rules_001';
const UNCHANGED_ID = 'am_unchanged_001';
const TIER_ID = 'am_tier_001';
const AP_ID = 'am_ap_001';
const AP_PAID_ID = 'am_ap_paid_001';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

function db<T>(fn: (conn: BetterSqlite3.Database) => T): T {
  const conn = new BetterSqlite3(dbPath);
  try {
    return fn(conn);
  } finally {
    conn.close();
  }
}

function readNames(memberId: string): {
  family_name: string | null;
  given_names: string | null;
  real_name: string;
  display_name: string;
  display_name_normalized: string;
  slug: string | null;
} {
  return db((conn) => conn.prepare(
    `SELECT family_name, given_names, real_name, display_name, display_name_normalized, slug
     FROM members WHERE id = ?`,
  ).get(memberId)) as ReturnType<typeof readNames>;
}

function readAudit(actionType: string, entityId: string): Array<{ reason_text: string | null; metadata_json: string | null }> {
  return db((conn) => conn.prepare(
    `SELECT reason_text, metadata_json FROM audit_entries
     WHERE action_type = ? AND entity_id = ? ORDER BY occurred_at`,
  ).all(actionType, entityId)) as Array<{ reason_text: string | null; metadata_json: string | null }>;
}

async function correctName(
  memberId: string,
  body: { given_names?: string; family_name: string; display_name?: string; reason?: string },
): Promise<number> {
  const res = await request(createApp())
    .post(`/admin/members/${memberId}/name/confirm`)
    .set('Cookie', adminCookie())
    .type('form')
    .send({ reason: 'error correction', ...body });
  return res.status;
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'am_admin_one', display_name: 'Ada Admin', real_name: 'Ada Admin',
    login_email: 'am-admin@example.com', is_admin: 1,
  });
  insertMember(conn, {
    id: MEMBER_ID, slug: 'am_member_one', display_name: 'Mo Member', real_name: 'Mo Member',
    given_names: 'Mo', family_name: 'Member', login_email: 'am-member@example.com',
  });
  // A gallery whose criteria tag is this member's uploader tag, so the
  // correction has something real keyed on the slug to leave undisturbed.
  insertPersonaNamedGallery(conn, {
    galleryId: 'am_gallery_001', ownerMemberId: MEMBER_ID, ownerSlug: 'am_member_one',
    name: 'Mo Highlights',
  });
  insertMember(conn, {
    id: SYSTEM_ID, slug: 'am_footbag_hacky', display_name: 'Footbag Hacky',
    real_name: 'Footbag Hacky', given_names: null, family_name: null, is_system: 1,
  });
  insertMember(conn, {
    id: DECEASED_ID, slug: 'am_dee_ceased', display_name: 'Dee Ceased', real_name: 'Dee Ceased',
    given_names: 'Dee', family_name: 'Ceased', login_email: 'am-dee@example.com',
    is_deceased: 1, deceased_at: '2026-01-05T00:00:00.000Z',
  });
  insertMember(conn, {
    id: OPTED_OUT_ID, slug: 'am_pria_vate', display_name: 'Pria Vate', real_name: 'Pria Vate',
    given_names: 'Pria', family_name: 'Vate', login_email: 'am-pria@example.com', searchable: 0,
  });
  insertMember(conn, {
    id: RULES_ID, slug: 'am_rhea_rules', display_name: 'Rhea Rules', real_name: 'Rhea Rules',
    given_names: 'Rhea', family_name: 'Rules', login_email: 'am-rules@example.com',
  });
  insertMember(conn, {
    id: UNCHANGED_ID, slug: 'am_una_changed', display_name: 'Una Changed', real_name: 'Una Changed',
    given_names: 'Una', family_name: 'Changed', login_email: 'am-una@example.com',
  });
  insertMember(conn, {
    id: AP_ID, slug: 'am_alan_player', display_name: 'Alan Player', real_name: 'Alan Player',
    given_names: 'Alan', family_name: 'Player', login_email: 'am-alan@example.com',
  });
  createMemberAtTier(conn, {
    id: TIER_ID, slug: 'am_tia_ered', tier: 'tier0',
    memberOverrides: {
      display_name: 'Tia Ered', real_name: 'Tia Ered', given_names: 'Tia', family_name: 'Ered',
      login_email: 'am-tia@example.com',
    },
  });
  createMemberAtTier(conn, {
    id: AP_PAID_ID, slug: 'am_paula_paid', tier: 'tier1',
    memberOverrides: {
      display_name: 'Paula Paid', real_name: 'Paula Paid', given_names: 'Paula', family_name: 'Paid',
      login_email: 'am-paula@example.com',
    },
  });
  // More members than the lookup shows at once, so the truncation notice has
  // something to report. They share a display-name word nothing else carries.
  for (const n of Array.from({ length: 30 }, (_, i) => i + 1)) {
    insertMember(conn, {
      id: `am_crowd_${n}`, slug: `am_crowd_${n}`,
      display_name: `Cass Crowder ${n}`, real_name: `Cass Crowder ${n}`,
      given_names: 'Cass', family_name: 'Crowder', login_email: `am-crowd-${n}@example.com`,
    });
  }
  conn.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the member lookup', () => {
  it('finds a member by exact id, profile URL, login email, and display-name fragment', async () => {
    for (const query of [MEMBER_ID, 'am_member_one', 'am-member@example.com', 'Member']) {
      const res = await request(createApp())
        .get(`/admin/members?q=${encodeURIComponent(query)}`)
        .set('Cookie', adminCookie());
      expect(res.status, `query ${query}`).toBe(200);
      expect(res.text, `query ${query}`).toContain(`/admin/members/${MEMBER_ID}`);
    }
  });

  it('reaches members the member-facing search excludes, and says why each is set apart', async () => {
    const deceased = await request(createApp())
      .get('/admin/members?q=Ceased').set('Cookie', adminCookie());
    expect(deceased.text).toContain(`/admin/members/${DECEASED_ID}`);
    expect(deceased.text).toContain('Deceased');

    const optedOut = await request(createApp())
      .get('/admin/members?q=Vate').set('Cookie', adminCookie());
    expect(optedOut.text).toContain(`/admin/members/${OPTED_OUT_ID}`);
    expect(optedOut.text).toContain('Not in member search');
  });

  it('asks for more to go on rather than searching a single character', async () => {
    const res = await request(createApp()).get('/admin/members?q=a').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('at least 2 characters');
  });

  it('says the set is truncated rather than reporting a capped count as the whole match', async () => {
    const res = await request(createApp())
      .get('/admin/members?q=Crowder').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Narrow the search');
  });

  it('reports an empty result rather than an error', async () => {
    const res = await request(createApp())
      .get('/admin/members?q=nobodyhasthisname').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('No member matches that search');
  });
});

describe('the member record', () => {
  it('shows the identity, the standing, the account state, and the private contact fields', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Mo Member');
    expect(res.text).toContain('am-member@example.com');
    expect(res.text).toContain('Membership Standing');
    expect(res.text).toContain('Account State');
    expect(res.text).toContain('/members/am_member_one');
  });

  it('links to the member own slice of the audit log', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${MEMBER_ID}`).set('Cookie', adminCookie());
    // Handlebars escapes the equals sign inside an attribute value, which a
    // browser decodes back before following the link.
    expect(res.text).toContain(`/admin/audit-log?member&#x3D;${MEMBER_ID}`);
  });

  it('warns on a record whose account state changes what the platform does with it', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${DECEASED_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('marked deceased');
    expect(res.text).toContain('sends them no email');
  });

  it('404s an unknown member id', async () => {
    const res = await request(createApp())
      .get('/admin/members/am_no_such_member').set('Cookie', adminCookie());
    expect(res.status).toBe(404);
  });
});

describe('the name correction', () => {
  it('rewrites both recorded names and the display name together', async () => {
    expect(await correctName(MEMBER_ID, {
      given_names: 'Maureen', family_name: 'Memberton', display_name: 'Mo Memberton',
    })).toBe(303);

    const after = readNames(MEMBER_ID);
    expect(after.given_names).toBe('Maureen');
    expect(after.family_name).toBe('Memberton');
    expect(after.real_name).toBe('Maureen Memberton');
    expect(after.display_name).toBe('Mo Memberton');
    expect(after.display_name_normalized).toBe('mo memberton');
  });

  it('leaves the profile URL, the provenance tag, and the gallery keyed on it alone', () => {
    const after = readNames(MEMBER_ID);
    expect(after.slug).toBe('am_member_one');

    // The uploader tag and the gallery criteria are both built from the slug,
    // so a name correction that moved the slug would orphan every one of them.
    const tag = db((conn) => conn.prepare(
      `SELECT tag_normalized FROM tags WHERE tag_normalized = ?`,
    ).get('#by_am_member_one')) as { tag_normalized: string } | undefined;
    expect(tag?.tag_normalized).toBe('#by_am_member_one');

    const galleryTag = db((conn) => conn.prepare(
      `SELECT t.tag_normalized FROM member_galleries g
       JOIN member_gallery_tags gt ON gt.gallery_id = g.id
       JOIN tags t ON t.id = gt.tag_id
       WHERE g.owner_member_id = ?`,
    ).get(MEMBER_ID)) as { tag_normalized: string } | undefined;
    expect(galleryTag?.tag_normalized).toBe('#by_am_member_one');
  });

  it('records the administrator, the reason, and each name before and after', () => {
    const rows = readAudit('member.name_corrected', MEMBER_ID);
    expect(rows).toHaveLength(1);
    expect(rows[0].reason_text).toBe('error correction');
    const meta = JSON.parse(rows[0].metadata_json ?? '{}');
    expect(meta.before.display_name).toBe('Mo Member');
    expect(meta.after.display_name).toBe('Mo Memberton');
    expect(meta.before.family_name).toBe('Member');
    expect(meta.after.family_name).toBe('Memberton');
    expect(meta.fields).toContain('display_name');
  });

  it('writes nothing at all when the names are the ones already recorded', async () => {
    expect(await correctName(UNCHANGED_ID, {
      given_names: 'Una', family_name: 'Changed', display_name: 'Una Changed',
    })).toBe(303);
    expect(readAudit('member.name_corrected', UNCHANGED_ID)).toHaveLength(0);
  });

  it('refuses a correction with no reason', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${RULES_ID}/name/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ given_names: 'Rhea', family_name: 'Rules', display_name: 'Rhea Rules', reason: '  ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter the reason');
  });

  it('holds a corrected name to every rule a name meets at registration', async () => {
    const refusals: Array<[string, Record<string, string>]> = [
      ['reserved word',      { family_name: 'Official', display_name: 'IFPA Official' }],
      ['digits',             { family_name: 'Rules2', display_name: 'Rules2' }],
      ['no family name',     { family_name: '   ', display_name: 'Rhea' }],
      ['surname not carried', { family_name: 'Rules', display_name: 'Someone Else' }],
      ['mixed scripts',      { family_name: 'Rulеs', display_name: 'Rulеs' }],
    ];
    for (const [label, body] of refusals) {
      const status = await correctName(RULES_ID, body as { family_name: string });
      expect(status, label).toBe(422);
    }
    // Every attempt was refused, so the record still holds what it started with.
    expect(readNames(RULES_ID).display_name).toBe('Rhea Rules');
    expect(readAudit('member.name_corrected', RULES_ID)).toHaveLength(0);
  });

  it('refuses a name that is too long', async () => {
    expect(await correctName(RULES_ID, {
      given_names: 'R'.repeat(60), family_name: 'Rules', display_name: 'Rhea Rules',
    })).toBe(422);
  });

  it('previews the change without writing it', async () => {
    const preview = await request(createApp())
      .post(`/admin/members/${RULES_ID}/name`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ given_names: 'Rhea', family_name: 'Ruleson', display_name: 'Rhea Ruleson', reason: 'error correction' });
    expect(preview.status).toBe(200);
    expect(preview.text).toContain('Rhea Ruleson');
    expect(readNames(RULES_ID).family_name).toBe('Rules');
  });

  it('names the member on the confirmation, since display names are not unique', async () => {
    const preview = await request(createApp())
      .post(`/admin/members/${RULES_ID}/name`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ given_names: 'Rhea', family_name: 'Ruleson', display_name: 'Rhea Ruleson', reason: 'error correction' });
    expect(preview.text).toContain(RULES_ID);
    expect(preview.text).toContain('am_rhea_rules');
  });
});

describe('the platform account', () => {
  it('is reachable and correctable like any other member, reserved word and all', async () => {
    const found = await request(createApp())
      .get('/admin/members?q=Hacky').set('Cookie', adminCookie());
    expect(found.text).toContain(`/admin/members/${SYSTEM_ID}`);

    expect(await correctName(SYSTEM_ID, {
      given_names: 'Footbag', family_name: 'Hackysack', display_name: 'Footbag Hackysack',
    })).toBe(303);
    expect(readNames(SYSTEM_ID).display_name).toBe('Footbag Hackysack');
  });

  it('is the only account the reserved word is allowed for', async () => {
    expect(await correctName(RULES_ID, {
      given_names: 'Footbag', family_name: 'Hackysack', display_name: 'Footbag Hackysack',
    })).toBe(422);
  });
});

describe('the tier change', () => {
  it('changes the tier and records it', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TIER_ID}/tier/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ tier: 'tier2', reason: 'payment issue resolution' });
    expect(res.status).toBe(303);

    const tier = db((conn) => conn.prepare(
      `SELECT tier_status FROM member_tier_current WHERE member_id = ?`,
    ).get(TIER_ID)) as { tier_status: string } | undefined;
    expect(tier?.tier_status).toBe('tier2');
    expect(readAudit('tier.admin_override', TIER_ID)).toHaveLength(1);
  });

  it('refuses a tier that is not a membership tier', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TIER_ID}/tier/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ tier: 'tier9', reason: 'error correction' });
    expect(res.status).toBe(422);
  });

  it('refuses director standing here, because one place confers it and this is not it', async () => {
    // Director standing carries a ledger row recording the tier the member
    // returns to, and a badge every surface reads. This path writes neither, so
    // accepting it would leave a former director wearing the badge with nothing
    // able to take it off.
    const res = await request(createApp())
      .post(`/admin/members/${TIER_ID}/tier/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ tier: 'tier3', reason: 'elected to the board' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('honour and board page');

    const row = db((conn) => conn.prepare(
      `SELECT is_board FROM members WHERE id = ?`,
    ).get(TIER_ID)) as { is_board: number };
    expect(row.is_board).toBe(0);
  });

  it('does not offer director standing in the tier control', async () => {
    const res = await request(createApp())
      .get(`/admin/members/${TIER_ID}`).set('Cookie', adminCookie());
    expect(res.text).not.toContain('value="tier3"');
  });

  it('refuses a tier change with no reason', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${TIER_ID}/tier/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ tier: 'tier1', reason: '' });
    expect(res.status).toBe(422);
  });
});

describe('the Active Player expiry correction', () => {
  it('sets an expiry, then shortens it, which no other pathway may do', async () => {
    const grant = await request(createApp())
      .post(`/admin/members/${AP_ID}/active-player/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ expires_on: '2027-06-30', reason: 'error correction' });
    expect(grant.status).toBe(303);

    const shorten = await request(createApp())
      .post(`/admin/members/${AP_ID}/active-player/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ expires_on: '2026-09-30', reason: 'granted in error' });
    expect(shorten.status).toBe(303);

    const current = db((conn) => conn.prepare(
      `SELECT active_player_expires_at FROM member_active_player_current WHERE member_id = ?`,
    ).get(AP_ID)) as { active_player_expires_at: string | null } | undefined;
    expect(current?.active_player_expires_at?.slice(0, 10)).toBe('2026-09-30');
    expect(readAudit('active_player.admin_correction', AP_ID)).toHaveLength(2);
  });

  it('ends the standing when the date is left blank', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${AP_ID}/active-player/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ expires_on: '', reason: 'granted in error' });
    expect(res.status).toBe(303);

    const current = db((conn) => conn.prepare(
      `SELECT active_player_expires_at FROM member_active_player_current WHERE member_id = ?`,
    ).get(AP_ID)) as { active_player_expires_at: string | null } | undefined;
    expect(current?.active_player_expires_at).toBeNull();
  });

  it('writes no ledger row for a member whose tier puts the standing out of reach', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${AP_PAID_ID}/active-player/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ expires_on: '2027-06-30', reason: 'error correction' });
    expect(res.status).toBe(303);
    expect(readAudit('active_player.admin_correction', AP_PAID_ID)).toHaveLength(0);
  });

  it('writes nothing when the prefilled form is submitted untouched', async () => {
    // The stored expiry is a moment; the form offers a date. An administrator
    // who opens the record, fills a reason and submits without touching the date
    // is not asking for a change, and must not silently move the standing.
    const grantedBy = 'am_untouched';
    db((conn) => {
      conn.prepare(`
        INSERT INTO members (
          id, slug, created_at, created_by, updated_at, updated_by, version,
          real_name, display_name, display_name_normalized, family_name, given_names,
          login_email, login_email_normalized, email_verified_at, password_hash,
          password_changed_at, bio, gender
        ) VALUES (?, ?, '2026-01-01T00:00:00.000Z', 'seed', '2026-01-01T00:00:00.000Z', 'seed', 1,
                  'Unt Ouched', 'Unt Ouched', 'unt ouched', 'Ouched', 'Unt',
                  'am-untouched@example.com', 'am-untouched@example.com',
                  '2026-01-01T00:00:00.000Z', 'x', '2026-01-01T00:00:00.000Z', '', 'undisclosed')
      `).run(grantedBy, grantedBy);
      // A grant written the way an organic one is: a mid-day moment, not an
      // end-of-day one.
      conn.prepare(`
        INSERT INTO active_player_grants (
          id, created_at, created_by, member_id, actor_member_id, change_type,
          old_active_player_expires_at, new_active_player_expires_at, reason_code
        ) VALUES ('apg_untouched', '2026-01-01T00:00:00.000Z', 'seed', ?, NULL, 'grant',
                  NULL, '2027-09-01T11:22:33.444Z', 'official_event_attendance')
      `).run(grantedBy);
    });

    const before = readAudit('active_player.admin_correction', grantedBy).length;

    const res = await request(createApp())
      .post(`/admin/members/${grantedBy}/active-player/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ expires_on: '2027-09-01', reason: 'reviewed, no change intended' });
    expect(res.status).toBe(303);

    expect(readAudit('active_player.admin_correction', grantedBy)).toHaveLength(before);
    const current = db((conn) => conn.prepare(
      `SELECT new_active_player_expires_at AS e FROM active_player_grants WHERE member_id = ?`,
    ).get(grantedBy)) as { e: string };
    expect(current.e).toBe('2027-09-01T11:22:33.444Z');
  });

  it('refuses text that is not a date', async () => {
    const res = await request(createApp())
      .post(`/admin/members/${AP_ID}/active-player/confirm`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ expires_on: 'next tuesday', reason: 'error correction' });
    expect(res.status).toBe(422);
  });
});
