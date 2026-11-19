/**
 * The quiet-club item on the admin cleanup queue: an active club with a
 * co-leader that the site has seen no sign of life from for two years
 * surfaces for an administrator, who can ask its co-leaders to sign in and
 * edit the club. Nothing applies the item on its own.
 *
 * Every row here is stamped by the factories from the JavaScript clock, so
 * the cases move that clock to place each row in time and then open the
 * queue at a chosen later moment.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertClub, insertClubLeader, insertMemberClubAffiliation,
  insertEvent, insertAuditEntry, insertClubViabilitySignal, createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3262');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'qc-admin';
const T0 = Date.parse('2031-01-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;
const at = (days: number): Date => new Date(T0 + days * DAY);

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'qc_admin', login_email: 'qc-admin@example.com', is_admin: 1 });
  createApp = await importApp();
});

afterEach(() => {
  vi.useRealTimers();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

/** A club with one co-leader (and a plain member), all created at day `day`. */
function seedLedClub(
  key: string,
  leaderLastLoginAt: string | null = null,
): { clubId: string; leaderId: string; memberId: string } {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(0));
  const clubId = insertClub(db, { id: `qc-club-${key}`, name: `Quiet Club ${key}` });
  const leaderId = insertMember(db, {
    id: `qc-leader-${key}`, slug: `qc_leader_${key}`, login_email: `qc-leader-${key}@example.com`,
    last_login_at: leaderLastLoginAt,
  });
  insertMemberClubAffiliation(db, leaderId, clubId);
  insertClubLeader(db, { club_id: clubId, member_id: leaderId });
  const memberId = insertMember(db, {
    id: `qc-member-${key}`, slug: `qc_member_${key}`, login_email: `qc-member-${key}@example.com`,
  });
  insertMemberClubAffiliation(db, memberId, clubId);
  return { clubId, leaderId, memberId };
}

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

async function queueHtmlAt(day: number): Promise<string> {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(at(day));
  const res = await request(createApp()).get('/admin/club-cleanup').set('Cookie', adminCookie());
  expect(res.status).toBe(200);
  return res.text;
}

const askForm = (clubId: string): string => `/admin/club-cleanup/${clubId}/contact-coleaders`;

describe('GET /admin/club-cleanup: the quiet-club item', () => {
  // Defect caught: a led club nobody has touched for two years never reaches
  // an admin, so the directory keeps listing a club that may be long gone;
  // or one is flagged a day early, before the two years are up.
  it('lists a led club only once two years pass with no sign of life', async () => {
    const { clubId } = seedLedClub('boundary');
    expect(await queueHtmlAt(729)).not.toContain(askForm(clubId));
    expect(await queueHtmlAt(731)).toContain(askForm(clubId));
  });

  // Defect caught: one of the things a living club does is not counted as a
  // sign of life, so an active club is put in front of an admin as quiet.
  it('each kind of sign of life keeps a club off the item for two years from that sign', async () => {
    const quietControl = seedLedClub('control');
    const signs: Record<string, () => void> = {
      event: () => { insertEvent(db, { host_club_id: 'qc-club-event' }); },
      join: () => {
        const id = insertMember(db, { id: 'qc-joiner', slug: 'qc_joiner', login_email: 'qc-joiner@example.com' });
        insertMemberClubAffiliation(db, id, 'qc-club-join');
      },
      leaderadded: () => {
        const id = insertMember(db, { id: 'qc-second-leader', slug: 'qc_second_leader', login_email: 'qc-second-leader@example.com' });
        insertMemberClubAffiliation(db, id, 'qc-club-leaderadded');
        insertClubLeader(db, { club_id: 'qc-club-leaderadded', member_id: id });
      },
      edit: () => {
        insertAuditEntry(db, {
          action_type: 'club.content_edited', actor_type: 'member', actor_member_id: 'qc-leader-edit',
          entity_type: 'club', entity_id: 'qc-club-edit',
        });
      },
      signal: () => {
        insertClubViabilitySignal(db, { club_id: 'qc-club-signal', member_id: 'qc-member-signal', activity_signal: 'active' });
      },
    };
    for (const key of Object.keys(signs)) seedLedClub(key);
    // A co-leader who signs in is the one sign the member row itself carries.
    seedLedClub('login', at(400).toISOString());

    vi.setSystemTime(at(400));
    for (const add of Object.values(signs)) add();

    const html = await queueHtmlAt(731);
    expect(html, 'the positive control is listed').toContain(askForm(quietControl.clubId));
    for (const key of [...Object.keys(signs), 'login']) {
      expect(html, `a club whose last sign was a ${key} is not quiet`).not.toContain(askForm(`qc-club-${key}`));
    }
    // Two years after those signs they are quiet again.
    const later = await queueHtmlAt(400 + 731);
    for (const key of [...Object.keys(signs), 'login']) {
      expect(later, `a club quiet two years after its ${key} is listed`).toContain(askForm(`qc-club-${key}`));
    }
  });

  // Defect caught: an administrator's own correction, or a member leaving or
  // making the club inactive, is counted as the club being alive, so a club
  // nobody runs never reaches the item.
  it('an admin correction and a member leaving are not signs of life', async () => {
    const corrected = seedLedClub('corrected');
    const left = seedLedClub('left');
    vi.setSystemTime(at(400));
    insertAuditEntry(db, {
      action_type: 'club.content_corrected', actor_type: 'admin', actor_member_id: ADMIN_ID,
      entity_type: 'club', entity_id: corrected.clubId,
    });
    insertAuditEntry(db, {
      action_type: 'club.member_left', actor_type: 'member', actor_member_id: left.memberId,
      entity_type: 'club', entity_id: left.clubId,
    });
    const html = await queueHtmlAt(731);
    expect(html).toContain(askForm(corrected.clubId));
    expect(html).toContain(askForm(left.clubId));
  });

  // Defect caught: a leaderless club lands on the quiet item too, offering to
  // email co-leaders it does not have, beside its own could-use-a-leader item.
  it('a leaderless club is not a quiet club', async () => {
    const led = seedLedClub('ledbeside');
    const leaderlessId = insertClub(db, { id: 'qc-club-leaderless', name: 'Quiet Club leaderless' });
    const html = await queueHtmlAt(731);
    expect(html).toContain(askForm(led.clubId));
    expect(html).not.toContain(askForm(leaderlessId));
    expect(html).toContain(`/admin/club-cleanup/${leaderlessId}/contact-members`);
  });
});

describe('POST /admin/club-cleanup/:clubId/contact-coleaders', () => {
  // Defect caught: the ask reaches the club's ordinary members, or nobody,
  // or is not recorded, so the admin cannot tell whether the leaders were asked.
  it('emails the co-leaders only, records the ask, and shows when they were asked', async () => {
    const { clubId, leaderId, memberId } = seedLedClub('ask');
    vi.setSystemTime(at(731));
    const res = await request(createApp()).post(askForm(clubId)).set('Cookie', adminCookie()).type('form').send({});
    expect(res.status).toBe(303);

    const recipients = db.prepare(
      `SELECT recipient_member_id FROM outbox_emails WHERE recipient_member_id IN (?, ?)`,
    ).all(leaderId, memberId) as Array<{ recipient_member_id: string }>;
    expect(recipients.map((r) => r.recipient_member_id)).toEqual([leaderId]);

    const audit = db.prepare(
      `SELECT actor_type, metadata_json FROM audit_entries
        WHERE action_type = 'admin.club_cleanup.contact_coleaders' AND entity_id = ?`,
    ).all(clubId) as Array<{ actor_type: string; metadata_json: string }>;
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_type).toBe('admin');
    expect(JSON.parse(audit[0].metadata_json).recipient_count).toBe(1);

    // The ask is not itself a sign of life, so the item stays, carrying the date.
    const html = await queueHtmlAt(732);
    expect(html).toContain(askForm(clubId));
    expect(html).toContain(at(731).toISOString().slice(0, 10));
  });

  // Defect caught: a double click on the ask mails every co-leader twice and
  // records two asks.
  it('the same administrator pressing again within the repeat window sends and records nothing more', async () => {
    const { clubId, leaderId } = seedLedClub('askdup');
    vi.setSystemTime(at(731));
    for (let i = 0; i < 2; i++) {
      const res = await request(createApp()).post(askForm(clubId)).set('Cookie', adminCookie()).type('form').send({});
      expect(res.status).toBe(303);
    }
    const emails = db.prepare('SELECT COUNT(*) AS n FROM outbox_emails WHERE recipient_member_id = ?')
      .get(leaderId) as { n: number };
    expect(emails.n).toBe(1);
    const asks = db.prepare(
      `SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'admin.club_cleanup.contact_coleaders' AND entity_id = ?`,
    ).get(clubId) as { n: number };
    expect(asks.n).toBe(1);
  });

  // Defect caught: a co-leader whose mailbox has bounced is counted as asked,
  // so the audit trail and the admin believe a co-leader was reached who was not.
  it('counts only co-leaders the ask actually reached', async () => {
    const { clubId, leaderId } = seedLedClub('askbounce');
    const bouncedId = insertMember(db, {
      id: 'qc-bounced-leader', slug: 'qc_bounced_leader', login_email: 'qc-bounced-leader@example.com',
      email_status: 'bounced',
    });
    insertMemberClubAffiliation(db, bouncedId, clubId);
    insertClubLeader(db, { club_id: clubId, member_id: bouncedId });
    vi.setSystemTime(at(731));
    const res = await request(createApp()).post(askForm(clubId)).set('Cookie', adminCookie()).type('form').send({});
    expect(res.status).toBe(303);
    const queued = db.prepare('SELECT recipient_member_id FROM outbox_emails WHERE recipient_member_id IN (?, ?)')
      .all(leaderId, bouncedId) as Array<{ recipient_member_id: string }>;
    expect(queued.map((r) => r.recipient_member_id)).toEqual([leaderId]);
    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'admin.club_cleanup.contact_coleaders' AND entity_id = ?`,
    ).get(clubId) as { metadata_json: string };
    expect(JSON.parse(audit.metadata_json).recipient_count).toBe(1);
  });

  // Defect caught: the co-leader's answer, an edit to the club, does not clear
  // the item, so the admin is left chasing a club that has answered.
  it('a co-leader edit after the ask clears the item', async () => {
    const { clubId, leaderId } = seedLedClub('answered');
    vi.setSystemTime(at(731));
    await request(createApp()).post(askForm(clubId)).set('Cookie', adminCookie()).type('form').send({});
    vi.setSystemTime(at(740));
    insertAuditEntry(db, {
      action_type: 'club.content_edited', actor_type: 'member', actor_member_id: leaderId,
      entity_type: 'club', entity_id: clubId,
    });
    expect(await queueHtmlAt(741)).not.toContain(askForm(clubId));
  });

  it('a non-admin cannot ask, and an unknown club is not found', async () => {
    const { clubId, leaderId } = seedLedClub('gate');
    const asMember = await request(createApp()).post(askForm(clubId))
      .set('Cookie', `__Host-footbag_session=${createTestSessionJwt({ memberId: leaderId })}`)
      .type('form').send({});
    expect(asMember.status).toBe(403);
    const unknown = await request(createApp()).post(askForm('qc-club-missing'))
      .set('Cookie', adminCookie()).type('form').send({});
    expect(unknown.status).toBe(404);
  });
});

describe('resolving the quiet-club item', () => {
  // Defect caught: Apply the Rules makes a quiet club inactive with nobody
  // having decided, which the design reserves for the admin.
  it('Apply the Rules leaves a quiet club active', async () => {
    const { clubId } = seedLedClub('rules');
    vi.setSystemTime(at(731));
    const res = await request(createApp()).post('/admin/club-cleanup/apply-rules')
      .set('Cookie', adminCookie()).type('form').send({});
    expect(res.status).toBe(303);
    const club = db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string };
    expect(club.status).toBe('active');
  });

  // Defect caught: a parked quiet club either never comes back, so a club
  // that goes quiet again after a later sign is lost, or comes straight back
  // the next time the queue opens.
  it('a park holds until a newer sign, and the club returns once quiet again after it', async () => {
    const { clubId } = seedLedClub('parked');
    vi.setSystemTime(at(731));
    const res = await request(createApp()).post(`/admin/club-cleanup/${clubId}/resolve`)
      .set('Cookie', adminCookie()).type('form')
      .send({ predicate: 'quiet', action: 'park', reasonText: 'Seasonal club' });
    expect(res.status).toBe(303);
    expect(await queueHtmlAt(900)).not.toContain(askForm(clubId));

    vi.setSystemTime(at(1000));
    const id = insertMember(db, { id: 'qc-late-joiner', slug: 'qc_late_joiner', login_email: 'qc-late-joiner@example.com' });
    insertMemberClubAffiliation(db, id, clubId);
    expect(await queueHtmlAt(1000 + 729)).not.toContain(askForm(clubId));
    expect(await queueHtmlAt(1000 + 731)).toContain(askForm(clubId));
  });
});
