/**
 * A member creating an event: the form, the tier gates, the permanent event
 * hashtag, and what a free event and a sanctioned one each become.
 *
 * The contract: a member holding Tier 1 benefits creates a free event, which
 * opens for registration at once, is listed publicly and mails its organizer;
 * only a Tier 2 or Tier 3 member takes the sanctioned path, whose event stays a
 * private draft carrying its fees until the sanction is approved. The event's
 * hashtag is #event_{year}_{slug}, made from the title when left blank, shown
 * back before anything is saved when the slug rule changes what was typed, and
 * never shared with another event. The creator becomes the event's organizer.
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
  insertTag,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4961');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Every created event is dated in one future year, so its hashtag is known.
const YEAR = String(new Date().getUTCFullYear() + 2);
const START = `${YEAR}-06-12`;
const END = `${YEAR}-06-14`;

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try { return fn(db); } finally { db.close(); }
}

function cookieFor(memberId: string): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId })}`;
}

function makeMember(id: string, tier: 'tier0' | 'tier1' | 'tier2'): string {
  return withDb((db) => {
    createMemberAtTier(db, {
      id, slug: id.replace(/-/g, '_'), tier,
      memberOverrides: { display_name: `Member ${id}`, login_email: `${id}@example.com` },
    });
    completeOnboarding(db, id);
    return id;
  });
}

function form(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    event_type: 'free',
    title: 'Beaver Open',
    description: 'Two days of net and freestyle.',
    start_date: START,
    end_date: END,
    city: 'Eugene',
    region: 'Oregon',
    country: 'United States',
    registration_deadline: '',
    tshirt_size_collected: '0',
    slug: '',
    competitor_fee: '',
    spectator_fee: '',
    ...overrides,
  };
}

async function create(memberId: string, body: Record<string, string>) {
  return request(createApp()).post('/events/create').set('Cookie', cookieFor(memberId)).type('form').send(body);
}

interface EventRow {
  id: string; title: string; status: string; reg_opened_at: string | null; sanction_status: string;
  competitor_fee_cents: number | null; attendee_fee_cents: number | null; payment_enabled: number;
  tag_normalized: string;
}

function eventByTag(tag: string): EventRow | undefined {
  return withDb((db) => db.prepare(`
    SELECT e.id, e.title, e.status, e.reg_opened_at, e.sanction_status, e.competitor_fee_cents,
           e.attendee_fee_cents, e.payment_enabled, t.tag_normalized
      FROM events e JOIN tags t ON t.id = e.hashtag_tag_id
     WHERE t.tag_normalized = ?
  `).get(tag) as EventRow | undefined);
}

// Counts for one event, so a case is never thrown by another case's events.
function counts(eventTag: string, memberId: string) {
  return withDb((db) => {
    const eventId = (db.prepare(`SELECT e.id FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE t.tag_normalized = ?`).get(eventTag) as { id: string } | undefined)?.id ?? '';
    return {
      events: (db.prepare(`SELECT COUNT(*) c FROM events e JOIN tags t ON t.id = e.hashtag_tag_id WHERE t.tag_normalized = ?`).get(eventTag) as { c: number }).c,
      tags: (db.prepare(`SELECT COUNT(*) c FROM tags WHERE tag_normalized = ?`).get(eventTag) as { c: number }).c,
      audits: (db.prepare(`SELECT COUNT(*) c FROM audit_entries WHERE action_type = 'event.created' AND actor_member_id = ? AND entity_id = ?`).get(memberId, eventId) as { c: number }).c,
      mails: (db.prepare(`SELECT COUNT(*) c FROM outbox_emails WHERE template_key = 'event_created_confirmation' AND recipient_member_id = ? AND idempotency_key = ?`).get(memberId, `event-created:${eventId}:${memberId}`) as { c: number }).c,
    };
  });
}

let tier0: string;
let tier1: string;
let tier2: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  tier0 = makeMember('ec-tier0', 'tier0');
  tier1 = makeMember('ec-tier1', 'tier1');
  tier2 = makeMember('ec-tier2', 'tier2');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('who may create an event', () => {
  // Defect caught: a member without Tier 1 benefits reaches the form and
  // creates an event the story reserves for members holding them.
  it('refuses a member without Tier 1 benefits and offers the form to one with them', async () => {
    const refused = await request(createApp()).get('/events/create').set('Cookie', cookieFor(tier0));
    expect(refused.status).toBe(403);
    expect(refused.text).not.toContain('name="title"');

    const posted = await create(tier0, form({ title: 'Never Open', slug: 'never_open' }));
    expect(posted.status).toBe(403);
    expect(eventByTag(`#event_${YEAR}_never_open`)).toBeUndefined();

    const offered = await request(createApp()).get('/events/create').set('Cookie', cookieFor(tier1));
    expect(offered.status).toBe(200);
    expect(offered.text).toContain('action="/events/create"');
  });

  // Defect caught: a signed-out visitor is shown the form instead of being
  // asked to log in.
  it('sends a signed-out visitor to log in', async () => {
    const res = await request(createApp()).get('/events/create');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  // Defect caught: a Tier 1 member is offered, or can force, the sanctioned
  // path and with it registration fees, which need Tier 2 or Tier 3.
  it('offers and accepts the sanctioned path only from Tier 2 or Tier 3', async () => {
    const t1Form = await request(createApp()).get('/events/create').set('Cookie', cookieFor(tier1));
    expect(t1Form.text).not.toContain('value="sanctioned"');
    const t2Form = await request(createApp()).get('/events/create').set('Cookie', cookieFor(tier2));
    expect(t2Form.text).toContain('value="sanctioned"');

    const forced = await create(tier1, form({ event_type: 'sanctioned', slug: 'forced_sanction', competitor_fee: '20' }));
    expect(forced.status).toBe(422);
    expect(eventByTag(`#event_${YEAR}_forced_sanction`)).toBeUndefined();
  });
});

describe('a free event', () => {
  // Defect caught: a free event is left in draft, invisible and closed to
  // registration, or opens without its tag, its organizer or its notice.
  it('opens for registration with its hashtag, its organizer, an audit row and a notice', async () => {
    const res = await create(tier1, form({ title: 'Beaver Open', slug: 'beaver_open' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/events/event_${YEAR}_beaver_open/manage`);

    const event = eventByTag(`#event_${YEAR}_beaver_open`)!;
    expect(event.status).toBe('reg_open');
    expect(event.reg_opened_at).not.toBeNull();
    expect(event.sanction_status).toBe('none');
    expect(event.competitor_fee_cents).toBeNull();

    const organizers = withDb((db) => db.prepare('SELECT member_id, role FROM event_organizers WHERE event_id = ?').all(event.id));
    expect(organizers).toEqual([{ member_id: tier1, role: 'organizer' }]);
    expect(counts(`#event_${YEAR}_beaver_open`, tier1)).toMatchObject({ audits: 1, mails: 1 });

    const publicPage = await request(createApp()).get(`/events/event_${YEAR}_beaver_open`);
    expect(publicPage.status).toBe(200);
    expect(publicPage.text).toContain('Beaver Open');
    const landing = await request(createApp()).get('/events');
    expect(landing.text).toContain(`href="/events/event_${YEAR}_beaver_open"`);

    const manage = await request(createApp()).get(res.headers.location)
      .set('Cookie', [cookieFor(tier1), flashCookieOf(res)].filter(Boolean).join('; '));
    expect(manage.status).toBe(200);
    expect(manage.text).toContain('form-success-banner');
  });

  // Defect caught: a fee typed on a free event is stored, so an event that
  // was never sanctioned carries a charge.
  it('carries no fee even when one is posted', async () => {
    await create(tier1, form({ title: 'No Fee Jam', slug: 'no_fee_jam', competitor_fee: '15' }));
    expect(eventByTag(`#event_${YEAR}_no_fee_jam`)!.competitor_fee_cents).toBeNull();
  });

  // Defect caught: fields the form does not carry, posted anyway, set the
  // event's status or switch on payment.
  it('ignores posted fields the form does not carry', async () => {
    await create(tier1, form({ title: 'Overpost Cup', slug: 'overpost_cup', status: 'completed', payment_enabled: '1', sanction_status: 'approved' }));
    const event = eventByTag(`#event_${YEAR}_overpost_cup`)!;
    expect(event.status).toBe('reg_open');
    expect(event.payment_enabled).toBe(0);
    expect(event.sanction_status).toBe('none');
  });
});

describe('a sanctioned event', () => {
  // Defect caught: an event waiting on its sanction is published, mailed as
  // open, or loses the fees its sanction request is about.
  it('stays a private draft carrying its fees, and mails nobody', async () => {
    const res = await create(tier2, form({
      event_type: 'sanctioned', title: 'Sanctioned Classic', slug: 'sanctioned_classic',
      competitor_fee: '25.50', spectator_fee: '5',
    }));
    expect(res.status).toBe(303);
    const event = eventByTag(`#event_${YEAR}_sanctioned_classic`)!;
    expect(event.status).toBe('draft');
    expect(event.reg_opened_at).toBeNull();
    expect(event.competitor_fee_cents).toBe(2550);
    expect(event.attendee_fee_cents).toBe(500);
    expect(counts(`#event_${YEAR}_sanctioned_classic`, tier2)).toMatchObject({ audits: 1, mails: 0 });

    expect((await request(createApp()).get(`/events/event_${YEAR}_sanctioned_classic`)).status).toBe(404);
    expect((await request(createApp()).get('/events')).text).not.toContain(`/events/event_${YEAR}_sanctioned_classic`);
    const manage = await request(createApp()).get(`/events/event_${YEAR}_sanctioned_classic/manage`).set('Cookie', cookieFor(tier2));
    expect(manage.status).toBe(200);
  });
});

describe('the event hashtag', () => {
  // Defect caught: a blank hashtag field makes no tag, or a tag that repeats
  // the year the hashtag already carries.
  it('is made from the title, without its year, when left blank', async () => {
    await create(tier1, form({ title: `Willamette Shred ${YEAR}`, slug: '' }));
    expect(eventByTag(`#event_${YEAR}_willamette_shred`)).toBeDefined();
  });

  // Defect caught: a typed hashtag the slug rule changes is saved without the
  // creator seeing what it became, though it can never be changed after.
  it('shows a changed slug back before saving, and the page as rendered then saves it', async () => {
    const shown = await create(tier1, form({ title: 'Zürich Jam', slug: 'Zürich Jam' }));
    expect(shown.status).toBe(422);
    expect(eventByTag(`#event_${YEAR}_zurich_jam`)).toBeUndefined();
    expect(shown.text).toContain('value="zurich_jam"');

    const saved = await create(tier1, form({ title: 'Zürich Jam', slug: 'zurich_jam' }));
    expect(saved.status).toBe(303);
    expect(eventByTag(`#event_${YEAR}_zurich_jam`)).toBeDefined();
  });

  // Defect caught: a second event takes a hashtag another already holds, or
  // the refusal leaves the creator no way forward.
  it('refuses a hashtag that is taken and suggests adding the city', async () => {
    withDb((db) => insertTag(db, { tag_normalized: `#event_${YEAR}_taken_open`, standard_type: 'event' }));
    const res = await create(tier1, form({ title: 'Taken Open', slug: 'taken_open', city: 'Bend' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain(`#event_${YEAR}_taken_open_bend`);
    expect(eventByTag(`#event_${YEAR}_taken_open`)).toBeUndefined();
  });

  // Defect caught: a double click creates a second event, a second tag or a
  // second notice, or answers the creator's own repeat as a collision.
  it('answers a repeated submit with the first outcome and writes nothing more', async () => {
    const body = form({ title: 'Twice Open', slug: 'twice_open' });
    const first = await create(tier1, body);
    const before = counts(`#event_${YEAR}_twice_open`, tier1);
    const second = await create(tier1, body);
    expect(second.status).toBe(303);
    expect(second.headers.location).toBe(first.headers.location);
    expect(counts(`#event_${YEAR}_twice_open`, tier1)).toEqual(before);
  });

  // Defect caught: another member submitting the same hashtag is told their
  // event was created, because someone else's event is read as their repeat.
  it('treats the same form from another member as a taken hashtag', async () => {
    const body = form({ title: 'Twice Open', slug: 'twice_open' });
    const other = await create(tier2, body);
    expect(other.status).toBe(422);
  });
});

describe('invalid input', () => {
  // Defect caught: an event is created with no title or city, ending before
  // it starts, closing registration after it ends, or with an unreadable fee.
  it('refuses each invalid field and creates nothing', async () => {
    const cases: Array<[Record<string, string>, string]> = [
      [{ title: '', slug: 'invalid_a' }, 'title'],
      [{ city: '', slug: 'invalid_b' }, 'city'],
      [{ end_date: `${YEAR}-06-01`, slug: 'invalid_c' }, 'end_date'],
      [{ registration_deadline: `${YEAR}-07-01`, slug: 'invalid_d' }, 'registration_deadline'],
      [{ country: 'Atlantis', slug: 'invalid_e' }, 'country'],
    ];
    for (const [overrides, field] of cases) {
      const res = await create(tier1, form(overrides));
      expect(res.status, `field ${field}`).toBe(422);
      expect(eventByTag(`#event_${YEAR}_${overrides.slug}`), `field ${field}`).toBeUndefined();
    }
    const badFee = await create(tier2, form({ event_type: 'sanctioned', competitor_fee: 'twenty', slug: 'invalid_fee' }));
    expect(badFee.status).toBe(422);
    expect(eventByTag(`#event_${YEAR}_invalid_fee`)).toBeUndefined();
  });

  // Defect caught: markup typed into the title is stored and later rendered
  // as live HTML on the public event page. The shared text cleaner removes
  // the tags and keeps their text.
  it('stores a title with its markup tags removed', async () => {
    await create(tier1, form({ title: '<script>alert(1)</script>Markup Cup', slug: 'markup_cup' }));
    expect(eventByTag(`#event_${YEAR}_markup_cup`)!.title).toBe('alert(1)Markup Cup');
  });
});
