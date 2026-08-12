/**
 * The Hall of Fame and Big Add Posse pages are editorial landing pages. Each
 * tells its honor's history and sends the reader to that honor's own site. They
 * carry no on-site roster of honorees and no per-person honor page, so honored
 * people seeded in the database reach neither page and no person link is
 * rendered on either.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertHistoricalPerson, insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3104');

let createApp: Awaited<ReturnType<typeof importApp>>;

const LINKED_PERSON = 'hof-person-linked-001';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Honored people exist in the database, including one who has claimed a live
  // member account. Neither page may surface any of them.
  insertHistoricalPerson(db, { person_id: 'hof-dated-001', person_name: 'Ada Recent', hof_member: 1, hof_induction_year: 2015 });
  insertHistoricalPerson(db, { person_id: 'hof-undated-001', person_name: 'Cyrus Undated', hof_member: 1, hof_induction_year: null });

  insertHistoricalPerson(db, { person_id: LINKED_PERSON, person_name: 'Bella Claimed', hof_member: 1, hof_induction_year: 2010 });
  insertMember(db, { id: 'member-bella', slug: 'bella_claimed', display_name: 'Bella Claimed', login_email: 'bella@example.com' });
  db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(LINKED_PERSON, 'member-bella');

  insertHistoricalPerson(db, { person_id: 'bap-001', person_name: 'Dex Poser', bap_member: 1, bap_induction_year: 2008 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /hof — editorial landing page', () => {
  it('tells the honor history and links out to the honor\'s own site', async () => {
    const res = await request(await createApp()).get('/hof');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Footbag Hall of Fame');
    expect(res.text).toContain('A Bit of History...');
    expect(res.text).toContain('https://www.footbaghalloffame.net/');
  });

  it('carries no inductee roster', async () => {
    const res = await request(await createApp()).get('/hof');
    expect(res.text).not.toContain('Inductees');
    expect(res.text).not.toContain('Ada Recent');
    expect(res.text).not.toContain('Cyrus Undated');
    expect(res.text).not.toContain('Bella Claimed');
  });

  it('renders no person link', async () => {
    const res = await request(await createApp()).get('/hof');
    expect(res.text).not.toContain('href="/history/');
    expect(res.text).not.toContain('href="/members/bella_claimed"');
  });
});

describe('GET /bap — editorial landing page', () => {
  it('tells the honor history and links out to the honor\'s own site', async () => {
    const res = await request(await createApp()).get('/bap');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Big Add Posse');
    expect(res.text).toContain('History of the BAP');
    expect(res.text).toContain('https://bigaddposse.com/');
  });

  it('carries no member roster and no person link', async () => {
    const res = await request(await createApp()).get('/bap');
    expect(res.text).not.toContain('Dex Poser');
    expect(res.text).not.toContain('href="/history/');
  });
});
