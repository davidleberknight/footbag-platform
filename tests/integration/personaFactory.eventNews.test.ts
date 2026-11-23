/**
 * A persona's seeded event is announced in the news feed, as the real flow
 * announces a public event: a free event by its organizer when it is created,
 * a sanctioned one by the approving administrator. A visitor to a dev or
 * staging stack seeded with personas sees those items on the news page and
 * the home page band, each leading to its event.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import type BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';
import { seedPersona, personaEventNewsId, type PersonaSpec } from '../../src/testkit/personaFactory';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../../src/lib/personaGuards';

const { dbPath } = setTestEnv('4986');

const ADMIN_ID = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}evnews_admin`;

const COMPETITIONS: NonNullable<PersonaSpec['organizesEvent']>['competitions'] = [
  { name: 'Open Singles Footbag Net', category: 'net', gameId: 'game_footbag_net', teamType: 'singles', gender: 'open', skill: 'open' },
];

function organizer(slug: string, title: string, sanctioned: boolean): PersonaSpec {
  return {
    slug, displayName: `Organizer ${slug}`, tier: 'tier1',
    testingUsage: 'Seeded event news check.', coverageNotes: ['organizer'],
    organizesEvent: {
      title, city: 'Boulder', region: 'CO', country: 'United States',
      description: 'A weekend of footbag.',
      startInDays: 40, days: 2, deadlineDaysBefore: 5,
      competitions: COMPETITIONS,
      ...(sanctioned
        ? { sanctionedWithFees: { byPersona: 'evnews_admin', competitorCents: 2000, spectatorCents: 500 } }
        : {}),
    },
  };
}

let db: BetterSqlite3.Database;
let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'evnews_admin', is_admin: 1 });
  seedPersona(db, organizer('evnews_free', 'Free Kick Open', false));
  seedPersona(db, organizer('evnews_sanc', 'Sanctioned Net Classic', true));
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('a seeded persona event in the news feed', () => {
  it('records one automatic event item per event, credited to the act that would have published it', () => {
    const rows = db.prepare(`
      SELECT id, news_type, entity_type, entity_id, created_by, is_public, title
      FROM news_items WHERE entity_type = 'event' ORDER BY id
    `).all() as Array<Record<string, unknown>>;
    // A missing row is a seeded stack whose news page stays empty; a wrong
    // creator credits the announcement to someone who did not publish it.
    expect(rows).toHaveLength(2);
    const free = rows.find((r) => r.id === personaEventNewsId('evnews_free'));
    const sanc = rows.find((r) => r.id === personaEventNewsId('evnews_sanc'));
    expect(free).toMatchObject({
      news_type: 'event_published', entity_id: 'event-test-persona-evnews_free',
      created_by: `${SEEDED_PERSONA_MEMBER_ID_PREFIX}evnews_free`, is_public: 1,
    });
    expect(sanc).toMatchObject({
      news_type: 'event_published', entity_id: 'event-test-persona-evnews_sanc',
      created_by: ADMIN_ID, is_public: 1,
    });
    expect(String(free?.title)).toContain('Free Kick Open');
    expect(String(sanc?.title)).toContain('Sanctioned Net Classic');
  });

  it('lists both items on the news page and the home band, each item page leading to its event', async () => {
    const app = createApp();
    const news = await request(app).get('/news');
    const home = await request(app).get('/');
    expect(news.status).toBe(200);
    expect(home.status).toBe(200);
    for (const slug of ['evnews_free', 'evnews_sanc']) {
      const itemHref = `/news/${personaEventNewsId(slug)}`;
      // Absent here, a visitor to a seeded stack reads that there is no news.
      expect(news.text, `news page lists ${slug}`).toContain(`href="${itemHref}"`);
      expect(home.text, `home band lists ${slug}`).toContain(`href="${itemHref}"`);
      const item = await request(app).get(itemHref);
      expect(item.status).toBe(200);
      // The item names an event the visitor can reach; the event's key carries
      // the year it starts, which can be next year.
      const { start_date } = db.prepare(`SELECT start_date FROM events WHERE id = ?`)
        .get(`event-test-persona-${slug}`) as { start_date: string };
      expect(item.text).toContain(`href="/events/event_${start_date.slice(0, 4)}_persona_${slug}"`);
    }
  });
});
