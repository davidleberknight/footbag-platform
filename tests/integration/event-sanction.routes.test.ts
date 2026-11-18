/**
 * An event organizer's sanction request and the administrator's decision on it.
 *
 * The contract: only a current organizer of an event created on the
 * sanctioned path reaches the request, and only one holding Tier 2 or Tier 3
 * may send it. The form carries the attestation and every question, warns of a
 * missing Women's or Intermediate division without blocking, and refuses an
 * incomplete or inconsistent answer with nothing written. Submitting moves the
 * event to pending approval, raises one routine item in the sanctioning area of
 * the work queue, records who sent it and emails every organizer. One
 * administrator decides from the queue item: an approval sanctions the event,
 * opens it for registration and enables payment where a fee is set; a rejection
 * needs a reason, returns the event to draft and lets the organizers revise and
 * resubmit. An administrator who organizes the event cannot decide it, and a
 * submitter who lost Tier 2 or 3 cannot be approved. A Board-awarded World
 * Championships is sanctioned by an administrator citing the Board's decision.
 * Every act submitted twice acts once.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { flashCookieOf } from '../fixtures/flashCookie';
import {
  createMemberAtTier,
  completeOnboarding,
  createTestSessionJwt,
  insertEvent,
  insertEventOrganizer,
  insertDiscipline,
  insertMember,
  insertMemberTierGrant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4964');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string, admin = false): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, ...(admin ? { role: 'admin' as const } : {}) })}`;
}

function makeMember(id: string, tier: 'tier1' | 'tier2'): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
    return id;
  });
}

function makeAdmin(id: string): string {
  return withDb((db) => {
    insertMember(db, { id, slug: id.replace(/-/g, '_'), display_name: `Admin ${id}`, login_email: `${id}@example.com`, is_admin: 1 });
    return id;
  });
}

interface SeededEvent { id: string; key: string; base: string }

function seedEvent(title: string, organizers: string[], o: {
  status?: 'draft' | 'reg_open'; competitor_fee_cents?: number;
  divisions?: Array<{ gender: 'open' | 'women' | 'mixed'; cls: 'open' | 'novice' | 'intermediate' | 'masters'; prize?: 0 | 1 }>;
} = {}): SeededEvent {
  return withDb((db) => {
    const id = insertEvent(db, { title, status: o.status ?? 'draft', competitor_fee_cents: o.competitor_fee_cents ?? null });
    for (const m of organizers) insertEventOrganizer(db, id, m);
    for (const [i, d] of (o.divisions ?? [
      { gender: 'open', cls: 'open' }, { gender: 'women', cls: 'open' }, { gender: 'open', cls: 'intermediate' },
    ]).entries()) {
      insertDiscipline(db, id, {
        name: `Division ${i}`, discipline_category: 'net', game_id: 'game_footbag_net', team_type: 'singles',
        gender_eligibility: d.gender, division_class: d.cls, offers_prize_money: d.prize ?? 0, sort_order: i + 1,
      });
    }
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1), base: `/events/${tag.slice(1)}` };
  });
}

function get(memberId: string, path: string, admin = false) {
  return request(createApp()).get(path).set('Cookie', cookieFor(memberId, admin));
}

function post(memberId: string, path: string, body: Record<string, string>, admin = false) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId, admin)).type('form').send(body);
}

function landedOn(memberId: string, res: { headers: Record<string, string> }, admin = false) {
  return request(createApp()).get(res.headers.location)
    .set('Cookie', [cookieFor(memberId, admin), flashCookieOf(res as never)].filter(Boolean).join('; '));
}

/** A complete request, as the form is filled in for an event with no fee. */
function requestForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    attest: '1', deviates: 'no', deviations: '', prize_money: 'no', prize_total: '', prize_currency: 'USD',
    entry_fee_includes: '', frequency: 'first_time', years_held: '', expected_players: '40',
    expected_spectators: '', permits: 'not_needed', insurance: 'yes', justification: '',
    ...overrides,
  };
}

function eventRow(id: string) {
  return withDb((db) => db.prepare(
    `SELECT status, sanction_status, payment_enabled, sanction_requested_by_member_id, sanction_decided_by_member_id,
            sanction_decision_reason, sanction_expected_players, sanction_permits, sanction_insurance,
            sanction_event_frequency, sanction_deviations, sanction_justification,
            prize_money_total_cents, prize_money_currency, reg_opened_at
       FROM events WHERE id = ?`,
  ).get(id) as Record<string, string | number | null>);
}

function queueItems(eventId: string) {
  return withDb((db) => db.prepare(
    "SELECT id, status, decision_label FROM work_queue_items WHERE task_type = 'sanction_request' AND entity_id = ? ORDER BY opened_at, id",
  ).all(eventId) as Array<{ id: string; status: string; decision_label: string | null }>);
}

function openItem(eventId: string): string {
  const open = queueItems(eventId).filter((i) => i.status === 'open');
  expect(open).toHaveLength(1);
  return open[0].id;
}

function audits(eventId: string, actionType: string) {
  return withDb((db) => db.prepare(
    'SELECT actor_type, actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ? ORDER BY occurred_at, id',
  ).all(eventId, actionType) as Array<{ actor_type: string; actor_member_id: string; reason_text: string | null; metadata_json: string }>);
}

/** The mail of one template that names this event's title, per recipient. */
function mail(template: string, memberIds: string[], title: string) {
  return withDb((db) => db.prepare(
    `SELECT recipient_member_id, body_text FROM outbox_emails
      WHERE template_key = ? AND recipient_member_id IN (${memberIds.map(() => '?').join(',')})
        AND (subject LIKE ? OR body_text LIKE ?)
      ORDER BY recipient_member_id, id`,
  ).all(template, ...memberIds, `%${title}%`, `%${title}%`) as Array<{ recipient_member_id: string; body_text: string | null }>);
}

function counts(eventId: string) {
  return withDb((db) => ({
    items: (db.prepare("SELECT COUNT(*) AS n FROM work_queue_items WHERE entity_id = ?").get(eventId) as { n: number }).n,
    audits: (db.prepare('SELECT COUNT(*) AS n FROM audit_entries WHERE entity_id = ?').get(eventId) as { n: number }).n,
    outbox: (db.prepare("SELECT COUNT(*) AS n FROM outbox_emails WHERE template_key LIKE 'event_sanction%'").get() as { n: number }).n,
  }));
}

let olive: string;   // Tier 2 organizer
let oscar: string;   // Tier 2 co-organizer
let tina: string;    // Tier 1 organizer
let outsider: string;
let admin: string;
let admin2: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  olive = makeMember('sx-olive', 'tier2');
  oscar = makeMember('sx-oscar', 'tier2');
  tina = makeMember('sx-tina', 'tier1');
  outsider = makeMember('sx-outsider', 'tier2');
  admin = makeAdmin('sx-admin');
  admin2 = makeAdmin('sx-admin-two');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('who reaches the sanction request', () => {
  // Defect caught: a member who does not run the event reaches its request, or
  // learns that a draft exists by asking for it.
  it('answers a non-organizer as not found, and writes nothing for them', async () => {
    const event = seedEvent('Guarded Sanction Open', [olive]);
    expect((await get(outsider, `${event.base}/sanction`)).status).toBe(404);
    expect((await post(outsider, `${event.base}/sanction`, requestForm())).status).toBe(404);
    expect(eventRow(event.id).sanction_status).toBe('none');
  });

  // Defect caught: a free event, which opened at creation, is offered a
  // sanction request it can never use.
  it('answers a free event as not found', async () => {
    const event = seedEvent('Free Kick Jam', [olive], { status: 'reg_open' });
    expect((await get(olive, `${event.base}/sanction`)).status).toBe(404);
    const manage = await get(olive, `${event.base}/manage`);
    expect(manage.text).not.toContain(`${event.base}/sanction`);
  });

  // Defect caught: a Tier 1 organizer sends a request the story reserves for
  // Tier 2 and 3, or is shown a button that only fails.
  it('refuses a Tier 1 organizer and shows them no request button, while a Tier 2 co-organizer gets one', async () => {
    const event = seedEvent('Tiered Classic', [tina, olive]);
    expect((await get(tina, `${event.base}/sanction`)).status).toBe(403);
    expect((await post(tina, `${event.base}/sanction`, requestForm())).status).toBe(403);
    expect(eventRow(event.id).sanction_status).toBe('none');
    expect((await get(tina, `${event.base}/manage`)).text).not.toContain(`href="${event.base}/sanction"`);
    expect((await get(olive, `${event.base}/manage`)).text).toContain(`href="${event.base}/sanction"`);
  });
});

describe('the request form', () => {
  // Defect caught: the form posts somewhere else, nests its form, or leaves
  // out the volunteer notice above the submit button.
  it('renders one form posting to the request, with the notice above its submit button', async () => {
    const event = seedEvent('Form Check Open', [olive]);
    const res = await get(olive, `${event.base}/sanction`);
    expect(res.status).toBe(200);
    const open = res.text.indexOf(`action="${event.base}/sanction"`);
    expect(open).toBeGreaterThan(-1);
    const close = res.text.indexOf('</form>', open);
    const body = res.text.slice(open, close);
    expect(body).not.toContain('<form ');
    expect(body).toContain('name="attest"');
    const notice = body.indexOf('data-volunteer-notice');
    expect(notice).toBeGreaterThan(-1);
    expect(notice).toBeLessThan(body.indexOf('type="submit"'));
  });

  // Defect caught: a tournament missing its Women's or Intermediate division
  // is either not warned at all, or is blocked though the administrator decides.
  it('warns of each missing division by category and still accepts the request', async () => {
    const event = seedEvent('Open Only Cup', [olive], { divisions: [{ gender: 'open', cls: 'open' }] });
    const page = await get(olive, `${event.base}/sanction`);
    expect(page.text).toContain('Women&#x27;s in Singles Footbag Net');
    expect(page.text).toContain('Intermediate in Singles Footbag Net');
    const res = await post(olive, `${event.base}/sanction`, requestForm());
    expect(res.status).toBe(303);
    expect(eventRow(event.id).sanction_status).toBe('pending');
    const item = await get(admin, `/admin/work-queue/${openItem(event.id)}`, true);
    expect(item.text).toContain('Women&#x27;s in Singles Footbag Net');
  });

  // Defect caught: an incomplete or inconsistent request is accepted, or a
  // refusal half-writes the request or raises a queue item.
  it('refuses each incomplete or inconsistent answer by field, writing nothing', async () => {
    const event = seedEvent('Strict Answers Open', [olive], {
      competitor_fee_cents: 2500,
      divisions: [{ gender: 'open', cls: 'open', prize: 1 }, { gender: 'women', cls: 'intermediate' }],
    });
    const cases: Array<[Record<string, string>, string]> = [
      [{ attest: '0' }, 'attest'],
      [{ deviates: 'yes', deviations: '' }, 'deviations'],
      [{ prize_money: 'no' }, 'prize_money'],
      [{ prize_money: 'yes', prize_total: '', justification: 'Covers the venue.' }, 'prize_total'],
      [{ prize_money: 'yes', prize_total: '500', prize_currency: 'dollars', justification: 'Covers the venue.' }, 'prize_currency'],
      [{ frequency: 'annual', years_held: '' }, 'years_held'],
      [{ expected_players: 'forty' }, 'expected_players'],
      [{ permits: 'maybe' }, 'permits'],
      [{ prize_money: 'yes', prize_total: '500', justification: '' }, 'justification'],
    ];
    for (const [overrides, field] of cases) {
      const res = await post(olive, `${event.base}/sanction`, requestForm({
        prize_money: 'yes', prize_total: '500', justification: 'Covers the venue.', ...overrides,
      }));
      expect(res.status, field).toBe(422);
      // The refused form comes back with its submit control, ready to correct.
      expect(res.text, field).toContain(`action="${event.base}/sanction"`);
    }
    expect(eventRow(event.id).sanction_status).toBe('none');
    expect(queueItems(event.id)).toHaveLength(0);
  });

  // Defect caught: a prize-money event without the prize division refuses
  // forever, or a correct resubmission from the refused form fails.
  it('accepts the refused form once the one wrong answer is corrected', async () => {
    const event = seedEvent('Second Try Open', [olive], { divisions: [{ gender: 'women', cls: 'intermediate', prize: 1 }] });
    expect((await post(olive, `${event.base}/sanction`, requestForm({ prize_money: 'no' }))).status).toBe(422);
    const res = await post(olive, `${event.base}/sanction`, requestForm({ prize_money: 'yes', prize_total: '750.50', prize_currency: 'eur' }));
    expect(res.status).toBe(303);
    const row = eventRow(event.id);
    expect(row.prize_money_total_cents).toBe(75050);
    expect(row.prize_money_currency).toBe('EUR');
  });
});

describe('submitting the request', () => {
  // Defect caught: a submit leaves the event in draft, raises no item or one
  // outside the sanctioning area, forgets who sent it, or tells only one
  // organizer.
  it('moves the event to review, raises one sanctioning item, audits the submitter and emails every organizer', async () => {
    const event = seedEvent('Submitted Open', [olive, oscar]);
    const res = await post(olive, `${event.base}/sanction`, requestForm({ deviates: 'yes', deviations: 'Rally scoring to 15.' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`${event.base}/manage`);
    const row = eventRow(event.id);
    expect(row.status).toBe('pending_approval');
    expect(row.sanction_status).toBe('pending');
    expect(row.sanction_requested_by_member_id).toBe(olive);
    expect(row.sanction_expected_players).toBe(40);
    expect(row.sanction_deviations).toBe('Rally scoring to 15.');
    expect(row.sanction_insurance).toBe('yes');
    const itemId = openItem(event.id);
    const audit = audits(event.id, 'event.sanction_requested');
    expect(audit).toHaveLength(1);
    expect(audit[0].actor_member_id).toBe(olive);
    expect(JSON.parse(audit[0].metadata_json).work_queue_item_id).toBe(itemId);
    expect(mail('event_sanction_requested', [olive, oscar], 'Submitted Open').map((m) => m.recipient_member_id)).toEqual([olive, oscar].sort());

    // The item is under the sanctioning area's filter, and its page carries
    // every answer and the two decisions.
    const list = await get(admin, '/admin/work-queue?topic=sanctioning', true);
    expect(list.text).toContain(`/admin/work-queue/${itemId}`);
    const item = await get(admin, `/admin/work-queue/${itemId}`, true);
    expect(item.text).toContain('Rally scoring to 15.');
    expect(item.text).toContain('Member sx-oscar');
    expect(item.text).toContain(`action="/admin/work-queue/${itemId}/sanction/approve"`);
    expect(item.text).toContain(`action="/admin/work-queue/${itemId}/sanction/reject"`);

    // The manage page no longer offers the request.
    const manage = await landedOn(olive, res);
    expect(manage.text).not.toContain(`href="${event.base}/sanction"`);
  });

  // Defect caught: a double-clicked submit raises two items, two audit rows
  // or two rounds of email; another organizer's later submit raises a second.
  it('acts once when submitted twice, and reports a co-organizer\'s later submit without acting', async () => {
    const event = seedEvent('Twice Sent Open', [olive, oscar]);
    expect((await post(olive, `${event.base}/sanction`, requestForm())).status).toBe(303);
    const before = counts(event.id);
    const again = await post(olive, `${event.base}/sanction`, requestForm());
    expect(again.status).toBe(303);
    expect(again.headers.location).toBe(`${event.base}/manage`);
    expect(counts(event.id)).toEqual(before);
    const other = await post(oscar, `${event.base}/sanction`, requestForm());
    expect(other.status).toBe(303);
    expect(counts(event.id)).toEqual(before);
    expect(eventRow(event.id).sanction_requested_by_member_id).toBe(olive);
  });

  // Defect caught: an organizer who changes an answer while the request is
  // under review is told it was submitted, though nothing they changed was saved.
  it('reports a changed resubmission during review as already in, not as a fresh success', async () => {
    const event = seedEvent('Changed Mind Open', [olive]);
    expect((await post(olive, `${event.base}/sanction`, requestForm())).status).toBe(303);
    const changed = await post(olive, `${event.base}/sanction`, requestForm({ expected_players: '41' }));
    expect(changed.status).toBe(303);
    const landed = await landedOn(olive, changed);
    expect(landed.text).toContain('class="form-notice"');
    expect(landed.text).not.toContain('class="form-success-banner"');
    expect(eventRow(event.id).sanction_expected_players).toBe(40);
  });

  // Defect caught: two organizers submitting at once both land, because the
  // write itself does not refuse an event already under review or sanctioned.
  it('refuses at the write itself an event already under review or sanctioned', async () => {
    const { eventWrites } = await import('../../src/db/db');
    const pending = seedEvent('Race Pending Open', [olive]);
    await post(olive, `${pending.base}/sanction`, requestForm());
    const now = new Date().toISOString();
    const write = (id: string) => eventWrites.submitSanctionRequest.run(
      now, oscar, null, null, null, 'annual', '2020', 9, null, 'yes', 'yes', null, null, now, oscar, id,
    ).changes;
    expect(write(pending.id)).toBe(0);
    expect(eventRow(pending.id)).toMatchObject({ sanction_requested_by_member_id: olive, sanction_expected_players: 40 });
    const open = seedEvent('Race Free Open', [olive], { status: 'reg_open' });
    expect(write(open.id)).toBe(0);
    expect(eventRow(open.id).sanction_status).toBe('none');
  });
});

describe('the administrator\'s decision', () => {
  // Defect caught: approval leaves the event unpublished, skips payment on a
  // fee-charging event, leaves the item open, or tells no organizer.
  it('approves: sanctioned, open for registration, payment on, item resolved, audited, organizers emailed', async () => {
    const event = seedEvent('Approved Open', [olive, oscar], { competitor_fee_cents: 3000 });
    await post(olive, `${event.base}/sanction`, requestForm({ justification: 'Covers the gym.' }));
    expect((await request(createApp()).get(event.base)).status).toBe(404);
    const itemId = openItem(event.id);

    const res = await post(admin, `/admin/work-queue/${itemId}/sanction/approve`, { note: 'Checked with the secretary.' }, true);
    expect(res.status).toBe(303);
    const row = eventRow(event.id);
    expect(row.status).toBe('reg_open');
    expect(row.sanction_status).toBe('approved');
    expect(row.payment_enabled).toBe(1);
    expect(row.reg_opened_at).not.toBeNull();
    expect(row.sanction_decided_by_member_id).toBe(admin);
    expect(queueItems(event.id)[0]).toMatchObject({ status: 'resolved', decision_label: 'approved' });
    const audit = audits(event.id, 'event.sanction_approved');
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actor_type: 'admin', actor_member_id: admin, reason_text: 'Checked with the secretary.' });
    const sent = mail('event_sanctioned', [olive, oscar], 'Approved Open');
    expect(sent.map((m) => m.recipient_member_id)).toEqual([olive, oscar].sort());
    expect(sent[0].body_text).toContain('/ifpa/sanctioning-guidelines');
    expect(sent[0].body_text).toContain('Checked with the secretary.');

    expect((await request(createApp()).get(event.base)).status).toBe(200);
  });

  // Defect caught: a free sanctioned event is switched to taking payment.
  it('leaves payment off when the event sets no fee', async () => {
    const event = seedEvent('No Fee Open', [olive]);
    await post(olive, `${event.base}/sanction`, requestForm());
    expect((await post(admin, `/admin/work-queue/${openItem(event.id)}/sanction/approve`, { note: '' }, true)).status).toBe(303);
    expect(eventRow(event.id)).toMatchObject({ sanction_status: 'approved', payment_enabled: 0 });
  });

  // Defect caught: a repeated approval sends the organizers a second email or
  // audits twice; another administrator's later decision overrides the first.
  it('acts once when approved twice, and reports another administrator\'s later decision without acting', async () => {
    const event = seedEvent('Approved Twice Open', [olive]);
    await post(olive, `${event.base}/sanction`, requestForm());
    const itemId = openItem(event.id);
    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/approve`, { note: '' }, true)).status).toBe(303);
    const before = counts(event.id);
    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/approve`, { note: '' }, true)).status).toBe(303);
    expect((await post(admin2, `/admin/work-queue/${itemId}/sanction/reject`, { reason: 'Too late.' }, true)).status).toBe(303);
    expect(counts(event.id)).toEqual(before);
    expect(eventRow(event.id).sanction_status).toBe('approved');
  });

  // Defect caught: an administrator approves the request for an event they
  // run themselves.
  it('refuses a decision from an administrator who organizes the event', async () => {
    const event = seedEvent('Own Event Open', [olive, admin]);
    await post(olive, `${event.base}/sanction`, requestForm());
    const itemId = openItem(event.id);
    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/approve`, { note: '' }, true)).status).toBe(422);
    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/reject`, { reason: 'Mine.' }, true)).status).toBe(422);
    expect(eventRow(event.id).sanction_status).toBe('pending');
    expect(audits(event.id, 'event.sanction_approved')).toHaveLength(0);
  });

  // Defect caught: a request is approved after its sender lost the Tier 2 or 3
  // the story requires at approval.
  it('refuses to approve once the submitter no longer holds Tier 2 or Tier 3', async () => {
    const lapsing = makeMember('sx-lapsing', 'tier2');
    const event = seedEvent('Lapsed Tier Open', [lapsing]);
    await post(lapsing, `${event.base}/sanction`, requestForm());
    withDb((db) => insertMemberTierGrant(db, {
      member_id: lapsing, old_tier_status: 'tier2', new_tier_status: 'tier1',
      new_underlying_tier_status: 'tier1', reason_code: 'purchase.tier1',
    }));
    expect((await post(admin, `/admin/work-queue/${openItem(event.id)}/sanction/approve`, { note: '' }, true)).status).toBe(422);
    expect(eventRow(event.id).sanction_status).toBe('pending');
  });

  // Defect caught: a rejection without a reason, or one that leaves the event
  // under review, keeps the reason from the organizers, or bars a resubmission.
  it('rejects with a reason, returns the event to draft, and takes a revised resubmission', async () => {
    const event = seedEvent('Rejected Open', [olive, oscar]);
    await post(olive, `${event.base}/sanction`, requestForm());
    const itemId = openItem(event.id);
    expect((await post(admin, `/admin/work-queue/${itemId}/sanction/reject`, { reason: '' }, true)).status).toBe(422);
    expect(eventRow(event.id).sanction_status).toBe('pending');

    const res = await post(admin, `/admin/work-queue/${itemId}/sanction/reject`, { reason: 'Add a Women\'s doubles division' }, true);
    expect(res.status).toBe(303);
    expect(eventRow(event.id)).toMatchObject({ status: 'draft', sanction_status: 'rejected', sanction_decision_reason: 'Add a Women\'s doubles division' });
    expect(queueItems(event.id)[0]).toMatchObject({ status: 'resolved', decision_label: 'rejected' });
    expect(audits(event.id, 'event.sanction_rejected')[0]).toMatchObject({ actor_member_id: admin, reason_text: 'Add a Women\'s doubles division' });
    const sent = mail('event_sanction_rejected', [olive, oscar], 'Rejected Open');
    expect(sent).toHaveLength(2);
    expect(sent[0].body_text).toContain('Add a Women\'s doubles division');
    expect(sent[0].body_text).toContain(`${event.base}/manage`);

    const manage = await get(oscar, `${event.base}/manage`);
    expect(manage.text).toContain('Add a Women&#x27;s doubles division');
    expect(manage.text).toContain(`href="${event.base}/sanction"`);
    const again = await post(oscar, `${event.base}/sanction`, requestForm({ expected_players: '55' }));
    expect(again.status).toBe(303);
    expect(eventRow(event.id)).toMatchObject({ status: 'pending_approval', sanction_status: 'pending', sanction_requested_by_member_id: oscar, sanction_decision_reason: null, sanction_expected_players: 55 });
    expect(queueItems(event.id).map((i) => i.status)).toEqual(['resolved', 'open']);
    expect(JSON.parse(audits(event.id, 'event.sanction_requested')[1].metadata_json).resubmission).toBe(true);
  });

  // Defect caught: a member who is not an administrator decides a request.
  it('refuses the decision routes to a member who is not an administrator', async () => {
    const event = seedEvent('Members Only Decide Open', [olive]);
    await post(olive, `${event.base}/sanction`, requestForm());
    const itemId = openItem(event.id);
    expect((await post(outsider, `/admin/work-queue/${itemId}/sanction/approve`, { note: '' })).status).toBe(403);
    expect(eventRow(event.id).sanction_status).toBe('pending');
  });
});

describe('a Board-awarded World Championships', () => {
  // Defect caught: the award skips the citation, leaves the event a draft,
  // tells no organizer, or records a second award on a repeat.
  it('is sanctioned by an administrator citing the Board decision, once', async () => {
    const event = seedEvent('World Footbag Championships Test', [olive, oscar]);
    const page = await get(admin, '/admin/events/sanctions', true);
    expect(page.status).toBe(200);
    expect(page.text).toContain('World Footbag Championships Test');
    expect(page.text).toContain(`action="/admin/events/${event.id}/sanction-award"`);

    expect((await post(admin, `/admin/events/${event.id}/sanction-award`, { citation: '' }, true)).status).toBe(422);
    expect(eventRow(event.id).sanction_status).toBe('none');

    const res = await post(admin, `/admin/events/${event.id}/sanction-award`, { citation: 'Board decision of 2026-03-01' }, true);
    expect(res.status).toBe(303);
    expect(eventRow(event.id)).toMatchObject({ status: 'reg_open', sanction_status: 'approved', sanction_decision_reason: 'Board decision of 2026-03-01', sanction_requested_by_member_id: null });
    expect(audits(event.id, 'event.sanction_awarded')[0]).toMatchObject({ actor_member_id: admin, reason_text: 'Board decision of 2026-03-01' });
    expect(mail('event_sanctioned', [olive, oscar], 'World Footbag Championships Test')
      .filter((m) => m.body_text?.includes('Board decision of 2026-03-01'))).toHaveLength(2);
    expect(queueItems(event.id)).toHaveLength(0);

    const before = counts(event.id);
    expect((await post(admin, `/admin/events/${event.id}/sanction-award`, { citation: 'Board decision of 2026-03-01' }, true)).status).toBe(303);
    expect(counts(event.id)).toEqual(before);
    const after = await get(admin, '/admin/events/sanctions', true);
    expect(after.text).not.toContain(`action="/admin/events/${event.id}/sanction-award"`);
  });

  // Defect caught: a member who is not an administrator records an award.
  it('refuses the award to a member who is not an administrator', async () => {
    const event = seedEvent('Unawarded Worlds', [olive]);
    expect((await post(outsider, `/admin/events/${event.id}/sanction-award`, { citation: 'Board decision' })).status).toBe(403);
    expect(eventRow(event.id).sanction_status).toBe('none');
  });
});
