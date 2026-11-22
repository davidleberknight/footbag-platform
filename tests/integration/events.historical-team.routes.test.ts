/**
 * A historical team contest, a division of more than two players that only the
 * historical record holds, renders on its event page as one placement carrying
 * every teammate, under its own name and entry size.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertEvent,
  insertDiscipline,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3497');
let createApp: Awaited<ReturnType<typeof importApp>>;

const EVENT_KEY = 'event_1984_historical_team_test';
const TEAMMATES = ['Tessa Teamone', 'Terry Teamtwo', 'Tori Teamthree'];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const uploaderId = insertMember(db, { id: 'team-uploader', slug: 'team_uploader' });
  const eventId = insertEvent(db, {
    hashtag_tag_id: insertTag(db, { tag_normalized: `#${EVENT_KEY}` }),
    title: '1984 Historical Team Test',
    status: 'completed',
    start_date: '1984-07-01',
    end_date: '1984-07-03',
    registration_status: 'closed',
  });
  const upload = insertResultsUpload(db, eventId, uploaderId);
  const team = insertDiscipline(db, eventId, {
    id: 'disc-historical-team', name: 'Team Freestyle', discipline_category: 'freestyle',
    team_type: 'team', created_by: 'seed_loader', sort_order: 1,
  });
  const entry = insertResultEntry(db, eventId, upload, team, { placement: 1 });
  TEAMMATES.forEach((name, i) => insertResultParticipant(db, entry, name, { participant_order: i + 1 }));
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('a historical team contest on its event page', () => {
  // Defect caught: a team result is dropped, split into one row per player,
  // or filed under singles, so a visitor reads three teammates as rivals.
  it('shows the division once, as a team, with every teammate on its one placement', async () => {
    const res = await request(createApp()).get(`/events/${EVENT_KEY}`);
    expect(res.status).toBe(200);
    const section = res.text.slice(res.text.indexOf('<h3>Team Freestyle</h3>'));
    expect(section).not.toBe(res.text);
    expect(section).toContain('<span class="discipline-meta">team</span>');
    const firstRowEnd = section.indexOf('</tr>', section.indexOf('<tbody>'));
    const firstRow = section.slice(section.indexOf('<tbody>'), firstRowEnd);
    for (const name of TEAMMATES) expect(firstRow, name).toContain(name);
  });
});
