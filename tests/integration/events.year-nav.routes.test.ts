/**
 * Year-archive adjacent-year navigation: a year page renders previous/next
 * year anchors when the immediately-adjacent years contain completed public
 * events. The adjacency logic is unit-tested elsewhere; this pins the rendered
 * anchors so a template regression that drops the nav block is caught.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertTag, insertEvent } from '../fixtures/factories';

const { dbPath } = setTestEnv('3211');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Three consecutive years of completed public events so the middle year has
  // both a previous and a next archive sibling.
  for (const year of [2023, 2024, 2025]) {
    const tagId = insertTag(db, {
      tag_normalized: `#event_${year}_open`,
      tag_display:    `#Event_${year}_Open`,
    });
    insertEvent(db, {
      hashtag_tag_id:      tagId,
      title:               `${year} Open`,
      status:              'completed',
      start_date:          `${year}-07-10`,
      end_date:            `${year}-07-12`,
      city:                'Testville',
      country:             'US',
      registration_status: 'closed',
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /events/year/:year — adjacent-year navigation', () => {
  it('renders previous and next year anchors when adjacent years have completed public events', async () => {
    const res = await request(createApp()).get('/events/year/2024');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/events/year/2023"');
    expect(res.text).toContain('href="/events/year/2025"');
  });
});
