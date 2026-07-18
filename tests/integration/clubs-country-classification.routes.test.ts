/**
 * A club's country page is grouped strictly by its stored country value, so a
 * club whose country is wrong lands on the wrong country page. This pins the
 * two reported misfilings (a club in Athens must appear under Greece, a club in
 * the Kutaisi area under Georgia, and neither under Argentina) and the corpus
 * invariant that guards against any future misgrouping: every public club
 * belongs to exactly one country group, and the sum of the per-country totals
 * equals the directory total. A separate case pins that the nation Georgia and
 * the US state Georgia never collide, because the country page keys on the
 * country value, not on a region that happens to share the name.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub } from '../fixtures/factories';

const { dbPath } = setTestEnv('3216');

let createApp: Awaited<ReturnType<typeof importApp>>;

// The full public corpus this suite seeds, grouped by the country each club
// must resolve to. Real ids + publiclyVisible so every one appears in the
// directory. Kept as data so the corpus invariant can iterate it.
const PUBLIC_CLUBS: Array<{ id: string; name: string; city: string; region: string | null; country: string }> = [
  { id: 'club-ar-asoc', name: 'Asociacion Argentina de Footbag', city: 'Buenos Aires', region: null, country: 'Argentina' },
  { id: 'club-ar-bafc', name: 'Buenos Aires Footbag Club', city: 'Buenos Aires', region: null, country: 'Argentina' },
  { id: 'club-gr-athens', name: 'Greece Footbag Community', city: 'Athens', region: null, country: 'Greece' },
  { id: 'club-ge-kutaisi', name: 'Kutaisi Footbag Club', city: 'Mglebi', region: null, country: 'Georgia' },
  { id: 'club-us-portland', name: 'Portland Footbag', city: 'Portland', region: 'Oregon', country: 'USA' },
  { id: 'club-us-atlanta', name: 'Georgia Peach Kickers', city: 'Atlanta', region: 'Georgia', country: 'USA' },
  { id: 'club-ca-toronto', name: 'Toronto Footbag', city: 'Toronto', region: 'Ontario', country: 'Canada' },
];

// countrySlug -> { slug, count } expected on its country page.
const COUNTRY_SLUGS: Record<string, number> = { argentina: 2, greece: 1, georgia: 1, usa: 2, canada: 1 };

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const c of PUBLIC_CLUBS) {
    insertClub(db, {
      id: c.id, name: c.name, city: c.city, region: c.region, country: c.country,
      status: 'active', publiclyVisible: true,
    });
  }
  // A default fixture club: it must never inflate any total.
  insertClub(db, { name: 'Default Fixture Club', country: 'USA', status: 'active' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('club country classification', () => {
  it('Argentina shows only Argentine clubs, not the Athens or Kutaisi clubs', async () => {
    const res = await request(createApp()).get('/clubs/argentina');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Asociacion Argentina de Footbag');
    expect(res.text).toContain('Buenos Aires Footbag Club');
    expect(res.text).not.toContain('Greece Footbag Community');
    expect(res.text).not.toContain('Kutaisi Footbag Club');
    expect(res.text).toContain('2 clubs');
  });

  it('the Athens club resolves to Greece', async () => {
    const res = await request(createApp()).get('/clubs/greece');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Clubs in Greece');
    expect(res.text).toContain('Greece Footbag Community');
    expect(res.text).not.toContain('Asociacion Argentina de Footbag');
  });

  it('the Kutaisi-area club resolves to Georgia', async () => {
    const res = await request(createApp()).get('/clubs/georgia');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Clubs in Georgia');
    expect(res.text).toContain('Kutaisi Footbag Club');
  });

  it('the nation Georgia and the US-state Georgia do not collide', async () => {
    // A USA club with region 'Georgia' belongs to USA, never to the /clubs/georgia
    // nation page, because grouping keys on country, not region.
    const georgia = await request(createApp()).get('/clubs/georgia');
    expect(georgia.status).toBe(200);
    expect(georgia.text).not.toContain('Georgia Peach Kickers');

    const usa = await request(createApp()).get('/clubs/usa');
    expect(usa.status).toBe(200);
    expect(usa.text).toContain('Georgia Peach Kickers');
    expect(usa.text).toContain('Portland Footbag');
  });

  it('every public club appears in exactly one country group', async () => {
    const slugs = Object.keys(COUNTRY_SLUGS);
    const pages = new Map<string, string>();
    for (const slug of slugs) {
      const res = await request(createApp()).get(`/clubs/${slug}`);
      expect(res.status).toBe(200);
      pages.set(slug, res.text);
    }
    for (const club of PUBLIC_CLUBS) {
      const hits = slugs.filter((slug) => pages.get(slug)!.includes(club.name));
      expect(hits, `${club.name} should appear on exactly one country page, got [${hits.join(', ')}]`).toHaveLength(1);
    }
  });

  it('the sum of every country-page total equals the directory total', async () => {
    const index = await request(createApp()).get('/clubs');
    expect(index.status).toBe(200);
    // 7 seeded public clubs; the default fixture is excluded.
    expect(index.text).toContain('7 clubs');

    let sum = 0;
    for (const [slug, expected] of Object.entries(COUNTRY_SLUGS)) {
      const res = await request(createApp()).get(`/clubs/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text, `${slug} country page total`).toContain(`${expected} clubs`);
      sum += expected;
    }
    expect(sum).toBe(7);
  });
});
