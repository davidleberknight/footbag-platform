/**
 * The year route is a completed-events archive, not a full index of every event
 * in the year. Its title and copy must say so, it must offer a path back to
 * upcoming events, and a not-yet-completed event in the same year is
 * intentionally excluded, so the title must not over-promise completeness.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertTag, insertEvent } from '../fixtures/factories';

const { dbPath } = setTestEnv('3212');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const completedTag = insertTag(db, {
    tag_normalized: '#event_2026_spring',
    tag_display:    '#Event_2026_Spring',
  });
  insertEvent(db, {
    hashtag_tag_id:      completedTag,
    title:               '2026 Spring Classic',
    status:              'completed',
    start_date:          '2026-03-01',
    end_date:            '2026-03-02',
    city:                'Riverton',
    country:             'US',
    registration_status: 'closed',
  });
  // A published, not-yet-completed event in the same year: excluded by the
  // completed-only archive query, which is the intended contract.
  const upcomingTag = insertTag(db, {
    tag_normalized: '#event_2026_autumn',
    tag_display:    '#Event_2026_Autumn',
  });
  insertEvent(db, {
    hashtag_tag_id:      upcomingTag,
    title:               '2026 Autumn Open',
    status:              'published',
    start_date:          '2026-11-01',
    end_date:            '2026-11-02',
    city:                'Riverton',
    country:             'US',
    registration_status: 'open',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /events/year/:year — completed-archive framing', () => {
  it('titles and describes the page as completed events, not a full-year index', async () => {
    const res = await request(createApp()).get('/events/year/2026');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Completed Events from 2026');
    expect(res.text).not.toContain('Footbag Events from 2026');
    expect(res.text.toLowerCase()).toContain('already taken place');
  });

  it('offers a path back to upcoming events', async () => {
    const res = await request(createApp()).get('/events/year/2026');
    expect(res.text).toContain('href="/events"');
    expect(res.text).toContain('Upcoming Events');
  });

  it('shows completed events and excludes not-yet-completed same-year events', async () => {
    const res = await request(createApp()).get('/events/year/2026');
    expect(res.text).toContain('2026 Spring Classic');
    expect(res.text).not.toContain('2026 Autumn Open');
  });
});
