/**
 * What the one number on the clubs landing page counts.
 *
 * The page used to lead with a club total beside it. That total counted every
 * loaded row, including legacy entries nobody has confirmed still exist, so a
 * reader took it as the size of the active club network when it measured the
 * size of the archive. The country count does not have that problem: it is a
 * claim about the platform's own coverage, which the platform can make.
 *
 * The definition is pinned here because it is easy to move by accident. A change
 * to what the load carries, or to which clubs the directory shows, would silently
 * change what the number means to a visitor, and nothing else on the page would
 * look different.
 *
 * The definition: distinct countries among the clubs the public directory lists.
 * Not countries in the database, not countries in the legacy dump. If a country's
 * only club is hidden from the directory, that country is not counted, because a
 * visitor who clicked through would find nothing there.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub, insertTag } from '../fixtures/factories';

const { dbPath } = setTestEnv('3241');

let createApp: Awaited<ReturnType<typeof importApp>>;

/** Countries with a listed club, and one with none, so the two can differ. */
const LISTED = ['USA', 'Canada', 'Poland'] as const;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  let n = 0;
  const club = (country: string, name: string, status: 'active' | 'inactive') => {
    n += 1;
    const tagId = insertTag(db, {
      standard_type: 'club', tag_normalized: `#club_count_${n}`,
    });
    insertClub(db, {
      id: `club-count-${n}`, hashtag_tag_id: tagId, name,
      city: 'Somewhere', country, status,
    });
  };

  // Two clubs in one country, one each in two others: three countries listed.
  club('USA', 'Count Club One', 'active');
  club('USA', 'Count Club Two', 'active');
  club('Canada', 'Count Club Three', 'active');
  club('Poland', 'Count Club Four', 'active');
  // A country whose only club is not listed. It must not reach the count, or the
  // number would promise a destination with nothing at it.
  club('Georgia', 'Count Club Hidden', 'inactive');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the clubs landing page states its country coverage', () => {
  it('counts the distinct countries whose clubs the directory lists', async () => {
    const res = await request(createApp()).get('/clubs');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`${LISTED.length} countries`);
  });

  it('counts a country once however many clubs it holds', async () => {
    // Two of the four listed clubs share a country, so a number tracking clubs
    // rather than countries would read four.
    const res = await request(createApp()).get('/clubs');
    expect(res.text).not.toContain('4 countries');
  });

  it('does not count a country the directory would show as empty', async () => {
    const res = await request(createApp()).get('/clubs');
    expect(res.text).not.toContain('4 countries');
    expect(res.text).not.toContain('Count Club Hidden');
  });

  it('claims no club total, on the landing page or a country page', async () => {
    // A club total counts every recorded row whether or not anyone has confirmed
    // the club exists, so as a headline it claims something the platform cannot
    // know. Removing it is what makes the remaining number trustworthy.
    const index = await request(createApp()).get('/clubs');
    expect(index.text).not.toMatch(/\d+ clubs/);

    const country = await request(createApp()).get('/clubs/usa');
    expect(country.status).toBe(200);
    expect(country.text).not.toMatch(/\d+ clubs/);
  });

  it('still lists every country it counts', async () => {
    // The count and the list are the same set; a number larger than the list
    // would be the mismatch this pins against.
    const res = await request(createApp()).get('/clubs');
    for (const country of LISTED) {
      expect(res.text, country).toContain(country);
    }
  });
});
