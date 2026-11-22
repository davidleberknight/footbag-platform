/**
 * An event's organizers running it: the manage page, editing the event, its
 * divisions, its organizers, stepping down, the profile's My Events block, and
 * the organizers named on the public event page.
 *
 * The contract: only a current organizer of the event reaches any of its
 * organizer surfaces, and anyone else is answered as if the event did not
 * exist. Every organizer has the same powers. An edit records each changed
 * field before and after, and an edit that changes nothing records nothing;
 * the event's hashtag never moves. A division offers only the parts its game
 * admits and is named from them, and one with a confirmed registration is no
 * longer changed here. An event holds at most five organizers, the added
 * member is told by email, and the sole organizer cannot leave. The public
 * page names the organizers to everyone and shows their email only to a
 * signed-in member.
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
  insertRegistration,
  insertRegistrationDisciplineSelection,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4962');

let createApp: Awaited<ReturnType<typeof importApp>>;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(id: string, tier: 'tier0' | 'tier1' | 'tier2' = 'tier1'): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
    return id;
  });
}

interface SeededEvent { id: string; key: string }

type EventStatus = 'draft' | 'pending_approval' | 'reg_open' | 'closed' | 'completed' | 'canceled';
type SanctionStatus = 'none' | 'pending' | 'approved' | 'rejected';

function seedEvent(title: string, organizers: string[], o: { status?: EventStatus; sanction_status?: SanctionStatus; competitor_fee_cents?: number } = {}): SeededEvent {
  return withDb((db) => {
    const id = insertEvent(db, { title, ...o });
    for (const m of organizers) insertEventOrganizer(db, id, m);
    const tag = (db.prepare('SELECT t.tag_normalized FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE e.id = ?').get(id) as { tag_normalized: string }).tag_normalized;
    return { id, key: tag.slice(1) };
  });
}

function post(memberId: string, path: string, body: Record<string, string> = {}) {
  return request(createApp()).post(path).set('Cookie', cookieFor(memberId)).type('form').send(body);
}

function get(memberId: string, path: string) {
  return request(createApp()).get(path).set('Cookie', cookieFor(memberId));
}

/** Follow a post-redirect-get the way a browser does, carrying the flash back. */
function landedOn(memberId: string, res: { headers: Record<string, string> }) {
  return request(createApp()).get(res.headers.location)
    .set('Cookie', [cookieFor(memberId), flashCookieOf(res as never)].filter(Boolean).join('; '));
}

function auditRows(eventId: string, actionType: string): Array<{ actor_member_id: string; metadata_json: string }> {
  return withDb((db) => db.prepare(
    'SELECT actor_member_id, metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ? ORDER BY occurred_at, id',
  ).all(eventId, actionType) as Array<{ actor_member_id: string; metadata_json: string }>);
}

function divisions(eventId: string) {
  return withDb((db) => db.prepare(
    'SELECT id, name, game_id, custom_game_name, discipline_category, team_type, gender_eligibility, division_class, offers_prize_money FROM event_disciplines WHERE event_id = ? ORDER BY sort_order, id',
  ).all(eventId) as Array<Record<string, string | number | null>>);
}

function organizersOf(eventId: string): string[] {
  return withDb((db) => (db.prepare('SELECT member_id FROM event_organizers WHERE event_id = ? ORDER BY member_id').all(eventId) as Array<{ member_id: string }>).map((r) => r.member_id));
}

function editForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    title: 'Test Event', description: 'A test event.', start_date: '2030-05-01', end_date: '2030-05-03',
    city: 'Testville', region: '', country: 'United States', registration_deadline: '',
    tshirt_size_collected: '0', competitor_fee: '', spectator_fee: '',
    ...overrides,
  };
}

let olive: string;     // organizes the main event
let otto: string;      // organizes another event only
let outsider: string;  // organizes nothing
let added: string;     // added as an organizer during the run

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  olive = makeMember('eo-olive');
  otto = makeMember('eo-otto');
  outsider = makeMember('eo-outsider');
  added = makeMember('eo-added');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('who reaches the organizer surfaces', () => {
  // Defect caught: a member who does not run the event, or who runs a
  // different one, can open or change it, or learns that a draft exists.
  it('answers every organizer surface as not found to a non-organizer', async () => {
    const event = seedEvent('Guarded Open', [olive], { status: 'draft' });
    seedEvent('Elsewhere Classic', [otto]);
    const base = `/events/${event.key}`;
    for (const member of [otto, outsider]) {
      expect((await get(member, `${base}/manage`)).status, member).toBe(404);
      for (const [path, body] of [
        [`${base}/edit`, editForm({ title: 'Hijacked' })],
        [`${base}/divisions`, { game_id: 'game_footbag_net', custom_name: '', custom_discipline: '', team_type: 'singles', gender: 'open', division_class: 'open', offers_prize_money: '0' }],
        [`${base}/organizers`, { member_id: member }],
      ] as Array<[string, Record<string, string>]>) {
        expect((await post(member, path, body)).status, `${member} ${path}`).toBe(404);
      }
    }
    expect(organizersOf(event.id)).toEqual([olive]);
    expect(divisions(event.id)).toEqual([]);
    expect((await get(olive, `${base}/manage`)).status).toBe(200);
  });

  // Defect caught: the manage page links a draft to a public page that does
  // not exist, or loses the link for a public event whose registration closed.
  it('links the public event page only for an event the public can see', async () => {
    const publicLink = (key: string) => `href="/events/${key}"`;
    for (const status of ['reg_open', 'closed'] as const) {
      const event = seedEvent(`Public ${status} Open`, [olive], { status });
      expect((await get(olive, `/events/${event.key}/manage`)).text, status).toContain(publicLink(event.key));
    }
    const draft = seedEvent('Private Draft Open', [olive], { status: 'draft' });
    expect((await get(olive, `/events/${draft.key}/manage`)).text).not.toContain(publicLink(draft.key));
  });

  // Defect caught: a signed-out visitor is shown an organizer page.
  it('sends a signed-out visitor to log in', async () => {
    const event = seedEvent('Signed Out Open', [olive]);
    const res = await request(createApp()).get(`/events/${event.key}/manage`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });
});

describe('editing the event', () => {
  // Defect caught: an edit is lost, or its audit row cannot say what the
  // field held before, so another organizer's overwritten value is gone.
  it('saves the change and records each changed field before and after', async () => {
    const event = seedEvent('Edit Me Open', [olive, otto]);
    const res = await post(otto, `/events/${event.key}/edit`, editForm({ title: 'Edited Open', city: 'Portland', start_date: '2031-05-01', end_date: '2031-05-02' }));
    expect(res.status).toBe(303);
    const row = withDb((db) => db.prepare('SELECT title, city, start_date FROM events WHERE id = ?').get(event.id));
    expect(row).toEqual({ title: 'Edited Open', city: 'Portland', start_date: '2031-05-01' });
    const audits = auditRows(event.id, 'event.details_edited');
    expect(audits).toHaveLength(1);
    expect(audits[0].actor_member_id).toBe(otto);
    expect(JSON.parse(audits[0].metadata_json).changes.title).toEqual({ before: 'Edit Me Open', after: 'Edited Open' });

    // The hashtag is permanent, even though the event moved to another year.
    expect((await get(otto, `/events/${event.key}/manage`)).status).toBe(200);
  });

  // Defect caught: saving the form unchanged records an edit that never happened.
  it('writes nothing when nothing changed', async () => {
    const event = seedEvent('Unchanged Open', [olive]);
    const row = withDb((db) => db.prepare('SELECT title, description, start_date, end_date, city, country FROM events WHERE id = ?').get(event.id) as Record<string, string>);
    await post(olive, `/events/${event.key}/edit`, editForm({
      title: row.title, description: row.description, start_date: row.start_date, end_date: row.end_date, city: row.city, country: row.country,
    }));
    expect(auditRows(event.id, 'event.details_edited')).toEqual([]);
  });

  // Defect caught: a fee is set on a free event, or a sanctioned event's fee
  // changes after its sanction request went in.
  it('keeps fees off a free event and fixed once a sanctioned event leaves draft', async () => {
    const free = seedEvent('Free Fee Open', [olive]);
    await post(olive, `/events/${free.key}/edit`, editForm({ competitor_fee: '30' }));
    expect(withDb((db) => db.prepare('SELECT competitor_fee_cents c FROM events WHERE id = ?').get(free.id))).toEqual({ c: null });

    const pending = seedEvent('Pending Fee Open', [olive], { status: 'pending_approval', sanction_status: 'pending', competitor_fee_cents: 2000 });
    await post(olive, `/events/${pending.key}/edit`, editForm({ competitor_fee: '99' }));
    expect(withDb((db) => db.prepare('SELECT competitor_fee_cents c FROM events WHERE id = ?').get(pending.id))).toEqual({ c: 2000 });

    const draft = seedEvent('Draft Fee Open', [olive], { status: 'draft' });
    await post(olive, `/events/${draft.key}/edit`, editForm({ competitor_fee: '12.50' }));
    expect(withDb((db) => db.prepare('SELECT competitor_fee_cents c FROM events WHERE id = ?').get(draft.id))).toEqual({ c: 1250 });
  });

  // Defect caught: the manage page offers a fee field the service will ignore,
  // so an organizer types a new fee on a pending event and believes it saved.
  it('offers the fee fields for editing only while a sanctioned event is a draft', async () => {
    const draft = seedEvent('Editable Fee Open', [olive], { status: 'draft' });
    const pending = seedEvent('Fixed Fee Open', [olive], { status: 'pending_approval', sanction_status: 'pending', competitor_fee_cents: 2000 });
    const feeInput = /<input[^>]*id="competitor_fee"[^>]*>/;
    const draftInput = feeInput.exec((await get(olive, `/events/${draft.key}/manage`)).text)?.[0] ?? '';
    const pendingInput = feeInput.exec((await get(olive, `/events/${pending.key}/manage`)).text)?.[0] ?? '';
    expect(draftInput).toContain('name="competitor_fee"');
    expect(draftInput).not.toContain('readonly');
    expect(pendingInput).toContain('readonly');
  });

  // Defect caught: an invalid edit is saved, or the refusal loses what the
  // organizer typed.
  it('refuses an invalid edit and keeps what was typed', async () => {
    const event = seedEvent('Invalid Edit Open', [olive]);
    const res = await post(olive, `/events/${event.key}/edit`, editForm({ title: 'Kept Title', end_date: '2030-04-01' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('value="Kept Title"');
    expect(withDb((db) => db.prepare('SELECT title FROM events WHERE id = ?').get(event.id))).toEqual({ title: 'Invalid Edit Open' });
  });
});

describe('divisions', () => {
  // Defect caught: the form offers an entry size or gender the chosen game
  // is never played in, such as doubles for a thirty-second shred.
  it('offers only the parts the chosen game admits', async () => {
    const event = seedEvent('Shred Open', [olive]);
    const shred = await get(olive, `/events/${event.key}/manage?game=game_30_second_shred`);
    expect(shred.text).toContain('name="team_type" value="singles"');
    expect(shred.text).not.toContain('name="team_type" value="doubles"');
    expect(shred.text).not.toContain('name="gender" value="mixed"');
    const net = await get(olive, `/events/${event.key}/manage?game=game_footbag_net`);
    expect(net.text).toContain('name="team_type" value="doubles"');
    expect(net.text).toContain('name="gender" value="mixed"');
  });

  // Defect caught: a division is stored without its parts or under a name
  // that does not say what it is, or a part the game does not admit is
  // accepted when posted anyway.
  it('stores a division named from its parts and refuses parts its game does not admit', async () => {
    const event = seedEvent('Division Open', [olive]);
    const base = `/events/${event.key}`;
    const body = { game_id: 'game_footbag_net', custom_name: '', custom_discipline: '', team_type: 'doubles', gender: 'women', division_class: 'intermediate', offers_prize_money: '1' };
    expect((await post(olive, `${base}/divisions`, body)).status).toBe(303);
    expect(divisions(event.id)).toEqual([expect.objectContaining({
      name: "Intermediate Women's Doubles Net", game_id: 'game_footbag_net', discipline_category: 'net',
      team_type: 'doubles', gender_eligibility: 'women', division_class: 'intermediate', offers_prize_money: 1,
    })]);
    expect(auditRows(event.id, 'event.division_added')).toHaveLength(1);

    await post(olive, `${base}/divisions`, { ...body, game_id: 'game_30_second_shred', team_type: 'doubles' });
    await post(olive, `${base}/divisions`, { ...body, team_type: 'singles', gender: 'mixed' });
    expect(divisions(event.id)).toHaveLength(1);
  });

  // Defect caught: an organizer creates a team division, the historical
  // record's entry size, which no registration partner rule enforces.
  it('never offers the team entry size and refuses it when posted', async () => {
    const event = seedEvent('Team Size Open', [olive]);
    const base = `/events/${event.key}`;
    const routines = await get(olive, `${base}/manage?game=game_routines`);
    expect(routines.text).toContain('name="team_type" value="doubles"');
    expect(routines.text).not.toContain('name="team_type" value="team"');
    await post(olive, `${base}/divisions`, {
      game_id: 'game_routines', custom_name: '', custom_discipline: '', team_type: 'team', gender: 'open', division_class: 'open',
    });
    expect(divisions(event.id)).toEqual([]);
  });

  // Defect caught: a game the list does not carry cannot be added, or is
  // added with no name or no discipline to file it under.
  it('takes an unlisted game with its name and discipline, and refuses one without', async () => {
    const event = seedEvent('Custom Game Open', [olive]);
    const base = `/events/${event.key}`;
    const step = await get(olive, `${base}/manage?game=custom&custom_name=Hacky+Relay&custom_discipline=freestyle`);
    expect(step.text).toContain('value="Hacky Relay"');
    await post(olive, `${base}/divisions`, { game_id: '', custom_name: 'Hacky Relay', custom_discipline: 'freestyle', team_type: 'singles', gender: 'open', division_class: 'novice', offers_prize_money: '0' });
    await post(olive, `${base}/divisions`, { game_id: '', custom_name: '', custom_discipline: 'freestyle', team_type: 'singles', gender: 'open', division_class: 'open', offers_prize_money: '0' });
    await post(olive, `${base}/divisions`, { game_id: '', custom_name: 'Kick Polo', custom_discipline: 'polo', team_type: 'singles', gender: 'open', division_class: 'open', offers_prize_money: '0' });
    expect(divisions(event.id)).toEqual([expect.objectContaining({
      name: 'Novice Singles Hacky Relay', game_id: null, custom_game_name: 'Hacky Relay', discipline_category: 'freestyle',
    })]);
  });

  // Defect caught: changing a division leaves its old name, or removing one
  // skips the confirm step a page without JavaScript relies on.
  it('changes a division in place and removes one only after confirming', async () => {
    const event = seedEvent('Change Open', [olive]);
    const base = `/events/${event.key}`;
    await post(olive, `${base}/divisions`, { game_id: 'game_footbag_net', custom_name: '', custom_discipline: '', team_type: 'singles', gender: 'open', division_class: 'open', offers_prize_money: '0' });
    const [division] = divisions(event.id);
    await post(olive, `${base}/divisions`, { division_id: String(division.id), game_id: '', custom_name: '', custom_discipline: '', team_type: 'singles', gender: 'women', division_class: 'masters', offers_prize_money: '0' });
    expect(divisions(event.id)).toEqual([expect.objectContaining({ id: division.id, name: "Masters Women's Singles Net" })]);
    expect(JSON.parse(auditRows(event.id, 'event.division_changed')[0].metadata_json).changes.division_class).toEqual({ before: 'open', after: 'masters' });

    const confirm = await post(olive, `${base}/divisions/${division.id}/remove`);
    expect(confirm.status).toBe(200);
    expect(confirm.text).toContain('name="confirmed" value="1"');
    expect(divisions(event.id)).toHaveLength(1);
    expect((await post(olive, `${base}/divisions/${division.id}/remove`, { confirmed: '1' })).status).toBe(303);
    expect(divisions(event.id)).toEqual([]);
    const again = await post(olive, `${base}/divisions/${division.id}/remove`, { confirmed: '1' });
    expect(again.status).toBe(303);
    expect(auditRows(event.id, 'event.division_removed')).toHaveLength(1);
  });

  // Defect caught: a division someone has a confirmed entry in is renamed or
  // deleted under them.
  it('no longer changes or removes a division with a confirmed registration', async () => {
    const event = seedEvent('Locked Open', [olive]);
    const base = `/events/${event.key}`;
    const divisionId = withDb((db) => {
      const id = insertDiscipline(db, event.id, { name: 'Open Singles Footbag Net', discipline_category: 'net', game_id: 'game_footbag_net', gender_eligibility: 'open', division_class: 'open' });
      const reg = insertRegistration(db, event.id, outsider, { status: 'confirmed' });
      insertRegistrationDisciplineSelection(db, reg, id);
      return id;
    });
    await post(olive, `${base}/divisions`, { division_id: divisionId, game_id: '', custom_name: '', custom_discipline: '', team_type: 'singles', gender: 'women', division_class: 'open', offers_prize_money: '0' });
    await post(olive, `${base}/divisions/${divisionId}/remove`, { confirmed: '1' });
    expect(divisions(event.id)).toEqual([expect.objectContaining({ id: divisionId, name: 'Open Singles Footbag Net' })]);
    const page = await get(olive, `${base}/manage`);
    expect(page.text).not.toContain(`/divisions/${divisionId}/remove`);
  });
});

describe('organizers', () => {
  // Defect caught: an added organizer gets no row, no audit trail or no
  // email.
  it('adds the member chosen by id, records it and emails them', async () => {
    const event = seedEvent('Team Open', [olive]);
    const base = `/events/${event.key}`;
    const res = await post(olive, `${base}/organizers`, { member_id: added });
    expect(res.status).toBe(303);
    expect(organizersOf(event.id)).toEqual([added, olive].sort());
    expect(JSON.parse(auditRows(event.id, 'event.organizer_assigned')[0].metadata_json)).toEqual({ organizer_member_id: added });
    const mails = withDb((db) => db.prepare("SELECT COUNT(*) c FROM outbox_emails WHERE template_key = 'event_organizer_added' AND recipient_member_id = ?").get(added));
    expect(mails).toEqual({ c: 1 });

    // Adding the same member again changes nothing and mails nobody.
    const again = await post(olive, `${base}/organizers`, { member_id: added });
    expect(again.status).toBe(303);
    expect(auditRows(event.id, 'event.organizer_assigned')).toHaveLength(1);
    expect(withDb((db) => db.prepare("SELECT COUNT(*) c FROM outbox_emails WHERE template_key = 'event_organizer_added' AND recipient_member_id = ?").get(added))).toEqual({ c: 1 });
  });

  // Defect caught: an event is given an organizer the member search could not
  // offer, by a typed profile URL or slug, an account still onboarding, a
  // member who opted out of search or one marked deceased, so the picker's
  // promise that only a findable member is added is broken.
  it('refuses an organizer the member search would not offer', async () => {
    const event = seedEvent('Vetted Open', [olive]);
    const base = `/events/${event.key}`;
    const onboarding = withDb((db) => createMemberAtTier(db, {
      id: 'eo-pending', slug: 'eo_pending', tier: 'tier1',
      memberOverrides: { display_name: 'Member eo-pending', login_email: 'eo-pending@example.com', onboarding: 'none' },
    }));
    const unlisted = (id: string, overrides: { searchable?: 0; is_deceased?: 1 }) => withDb((db) => {
      createMemberAtTier(db, {
        id, slug: id.replace(/-/g, '_'), tier: 'tier1',
        memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com`, ...overrides },
      });
      completeOnboarding(db, id);
      return id;
    });
    const optedOut = unlisted('eo-opted-out', { searchable: 0 });
    const deceased = unlisted('eo-deceased', { is_deceased: 1 });
    for (const [label, memberId] of [
      ['nothing chosen', ''],
      ['a profile URL', 'https://footbag.org/members/eo_added'],
      ['a slug', 'eo_added'],
      ['an account still onboarding', onboarding],
      ['a member opted out of search', optedOut],
      ['a deceased member', deceased],
    ] as Array<[string, string]>) {
      const res = await post(olive, `${base}/organizers`, { member_id: memberId });
      expect(res.status, label).toBe(303);
      expect((await landedOn(olive, res)).text, label).toContain('form-error-banner');
      expect(organizersOf(event.id), label).toEqual([olive]);
    }
    expect(auditRows(event.id, 'event.organizer_assigned')).toHaveLength(0);
  });

  // Defect caught: the manage page offers no way to find a co-organizer by
  // name, its search offers someone who already organizes the event, a
  // picker control adds anyone, or the row button does not add the member.
  it('adds a co-organizer found by name through the picker row button', async () => {
    const event = seedEvent('Picker Open', [olive, otto]);
    const base = `/events/${event.key}`;
    const page = await get(olive, `${base}/manage`);
    expect(page.text).toContain('value="search:organizer"');

    // A search result is a button carrying the member; the organizer list's
    // own Remove forms carry the same field as a hidden input.
    const offers = (html: string, id: string) => new RegExp(`<button[^>]*name="member_id" value="${id}"`).test(html);
    const searched = await post(olive, `${base}/organizers`, { member_id: '', pick: 'search:organizer', pick_q: 'eo-added' });
    expect(searched.status).toBe(200);
    expect(offers(searched.text, added)).toBe(true);
    const self = await post(olive, `${base}/organizers`, { member_id: '', pick: 'search:organizer', pick_q: 'eo-olive' });
    expect(offers(self.text, olive)).toBe(false);
    const coOrganizer = await post(olive, `${base}/organizers`, { member_id: '', pick: 'search:organizer', pick_q: 'eo-otto' });
    expect(offers(coOrganizer.text, otto)).toBe(false);
    expect(organizersOf(event.id)).toEqual([olive, otto].sort());
    expect(auditRows(event.id, 'event.organizer_assigned')).toHaveLength(0);

    const res = await post(olive, `${base}/organizers`, { member_id: added, pick_q: 'eo-added' });
    expect(res.status).toBe(303);
    expect(organizersOf(event.id)).toEqual([added, olive, otto].sort());
  });

  // Defect caught: an event takes a sixth organizer, past the cap the story sets.
  it('holds an event to five organizers', async () => {
    const extras = ['eo-cap-a', 'eo-cap-b', 'eo-cap-c', 'eo-cap-d', 'eo-cap-e'].map((id) => makeMember(id));
    const event = seedEvent('Capped Open', [olive, ...extras.slice(0, 4)]);
    const page = await get(olive, `/events/${event.key}/manage`);
    expect(page.text).not.toContain(`action="/events/${event.key}/organizers"`);
    await post(olive, `/events/${event.key}/organizers`, { member_id: extras[4] });
    expect(organizersOf(event.id)).toHaveLength(5);
  });

  // Defect caught: an organizer is removed without the confirm step, or an
  // organizer can remove themselves around the step-down rule.
  it('removes another organizer only after confirming, and never the actor', async () => {
    const event = seedEvent('Removal Open', [olive, otto]);
    const base = `/events/${event.key}`;
    const confirm = await post(olive, `${base}/organizers/remove`, { member_id: otto });
    expect(confirm.status).toBe(200);
    expect(organizersOf(event.id)).toHaveLength(2);
    await post(olive, `${base}/organizers/remove`, { member_id: olive, confirmed: '1' });
    expect(organizersOf(event.id)).toContain(olive);
    expect((await post(olive, `${base}/organizers/remove`, { member_id: otto, confirmed: '1' })).status).toBe(303);
    expect(organizersOf(event.id)).toEqual([olive]);
    expect(auditRows(event.id, 'event.organizer_removed')).toHaveLength(1);
  });

  // Defect caught: the sole organizer is offered a way to leave, or leaves by
  // posting anyway, and the event is left with nobody to run it.
  it('keeps the sole organizer, with no step-down control', async () => {
    const event = seedEvent('Sole Open', [olive]);
    const page = await get(olive, `/events/${event.key}/manage`);
    expect(page.text).not.toContain(`action="/events/${event.key}/step-down"`);
    const res = await post(olive, `/events/${event.key}/step-down`, { confirmed: '1' });
    expect(res.status).toBe(303);
    expect(organizersOf(event.id)).toEqual([olive]);
    expect((await landedOn(olive, res)).text).toContain('form-error-banner');
  });

  // Defect caught: a co-organizer cannot leave from their profile, or leaves
  // without confirming, or lands with no word of how it went.
  it('lets a co-organizer step down from the profile after confirming', async () => {
    const event = seedEvent('Step Down Open', [olive, otto]);
    const profile = await get(otto, '/members/eo_otto');
    expect(profile.text).toContain(`action="/events/${event.key}/step-down"`);
    expect(profile.text).toContain(`/events/${event.key}/manage`);

    const confirm = await post(otto, `/events/${event.key}/step-down`);
    expect(confirm.status).toBe(200);
    expect(organizersOf(event.id)).toHaveLength(2);
    const res = await post(otto, `/events/${event.key}/step-down`, { confirmed: '1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/members/eo_otto');
    expect(organizersOf(event.id)).toEqual([olive]);
    expect(auditRows(event.id, 'event.organizer_stepped_down')).toHaveLength(1);
    expect((await landedOn(otto, res)).text).toContain('form-success-banner');

    // A second press of the same button reports the step-down, not an error.
    const again = await post(otto, `/events/${event.key}/step-down`, { confirmed: '1' });
    expect(again.status).toBe(303);
    expect(auditRows(event.id, 'event.organizer_stepped_down')).toHaveLength(1);
  });
});

describe('My Events on the profile', () => {
  // Defect caught: a canceled event still offers its organizer controls, or
  // an open one is missing, so the organizer cannot find their own event.
  it('lists the events the member organizes now, without a canceled one', async () => {
    const member = makeMember('eo-mine');
    const open = seedEvent('Mine Open', [member]);
    const canceled = seedEvent('Mine Canceled', [member], { status: 'canceled' });
    const profile = await get(member, '/members/eo_mine');
    expect(profile.text).toContain(`/events/${open.key}/manage`);
    expect(profile.text).not.toContain(`/events/${canceled.key}/manage`);
    expect(profile.text).toContain('href="/events/create"');
  });

  // Defect caught: a member without Tier 1 benefits is offered event creation.
  it('offers creation only to a member holding Tier 1 benefits', async () => {
    const member = makeMember('eo-tier0', 'tier0');
    const profile = await get(member, '/members/eo_tier0');
    expect(profile.text).not.toContain('href="/events/create"');
  });
});

describe('organizers on the public event page', () => {
  // Defect caught: an organizer's email reaches a signed-out visitor, or a
  // signed-in member cannot find who to contact.
  it('names the organizers to everyone and shows their email to signed-in members only', async () => {
    const event = seedEvent('Public Open', [olive]);
    const anon = await request(createApp()).get(`/events/${event.key}`);
    expect(anon.text).toContain('Member eo-olive');
    expect(anon.text).not.toContain('eo-olive@example.com');
    const member = await get(outsider, `/events/${event.key}`);
    expect(member.text).toContain('eo-olive@example.com');
  });

  // Defect caught: an upcoming event's page, now linked from the events
  // landing, carries no search description, so a search result shows
  // whatever text the engine scrapes.
  it('describes the event for search engines from its own title and place', async () => {
    const event = seedEvent('Searchable Open', [olive]);
    const res = await request(createApp()).get(`/events/${event.key}`);
    const description = /<meta name="description" content="([^"]*)"/.exec(res.text)?.[1] ?? '';
    expect(description).toContain('Searchable Open');
    expect(description).toContain('Testville');
  });
});
