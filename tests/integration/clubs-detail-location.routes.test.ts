/**
 * A club's city can legitimately be blank: the legacy database recorded some
 * clubs with a country and nothing finer, and no upstream correction invents a
 * city that was never known. The club detail page must therefore render a
 * partial location without punctuation left dangling where the missing part was.
 *
 * The page previously assembled the line itself as city, region, country, so a
 * blank city rendered a leading comma before the country. It now uses the shared
 * location formatter, which drops absent parts and, when there is nothing
 * locating the club at all, says so in words instead of showing an empty line.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub, insertTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3242');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Country only: the real case, a Swiss club whose city and region are blank.
  insertClub(db, {
    id: 'club-test-country-only',
    name: 'Bow No Bones',
    city: '',
    region: null,
    country: 'Switzerland',
    status: 'active',
    publiclyVisible: true,
    hashtag_tag_id: insertTag(db, { standard_type: 'club', tag_normalized: '#club_country_only' }),
  });

  // Nothing locating it at all, which is what the formatter's fallback wording
  // exists for.
  insertClub(db, {
    id: 'club-test-no-location',
    name: 'Nowhere Footbag',
    city: '',
    region: null,
    country: 'Unknown',
    status: 'active',
    publiclyVisible: true,
    hashtag_tag_id: insertTag(db, { standard_type: 'club', tag_normalized: '#club_no_location' }),
  });

  // A fully located club, so the ordinary case is pinned alongside the edges.
  insertClub(db, {
    id: 'club-test-full-location',
    name: 'Zurich Footbag',
    city: 'Zurich',
    region: 'Zurich',
    country: 'Switzerland',
    status: 'active',
    publiclyVisible: true,
    hashtag_tag_id: insertTag(db, { standard_type: 'club', tag_normalized: '#club_full_location' }),
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The rendered Location value, whitespace collapsed. */
async function locationLine(clubKey: string): Promise<string> {
  const res = await request(createApp()).get(`/clubs/${clubKey}`);
  expect(res.status).toBe(200);
  const match = res.text.match(/<dt>Location<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
  expect(match, 'the detail page must render a Location row').not.toBeNull();
  return match![1].replace(/\s+/g, ' ').trim();
}

describe('club detail location line', () => {
  it('a club with only a country shows the country and no dangling comma', async () => {
    const line = await locationLine('club_country_only');
    expect(line).toBe('Switzerland');
  });

  it('a club with nothing locating it says so instead of rendering punctuation', async () => {
    const line = await locationLine('club_no_location');
    expect(line).toBe('Location under investigation');
  });

  it('a fully located club still reads city, region, country', async () => {
    const line = await locationLine('club_full_location');
    expect(line).toBe('Zurich, Zurich, Switzerland');
  });

  it('no location line ever begins or ends with a separator', async () => {
    for (const key of ['club_country_only', 'club_no_location', 'club_full_location']) {
      const line = await locationLine(key);
      expect(line, key).not.toMatch(/^,|,$/);
      expect(line, key).not.toMatch(/,\s*,/);
    }
  });
});
