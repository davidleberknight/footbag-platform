/**
 * The Hall of Fame and Big Add Posse pages carry an on-site index of their
 * canonical honorees (public historical record), each linked to a claimed member
 * profile when one exists, otherwise the history page. Dated inductees sort
 * most-recent first; undated ones follow. The external site link is retained.
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

  insertHistoricalPerson(db, { person_id: 'hof-dated-001', person_name: 'Ada Recent', hof_member: 1, hof_induction_year: 2015 });
  insertHistoricalPerson(db, { person_id: 'hof-undated-001', person_name: 'Cyrus Undated', hof_member: 1, hof_induction_year: null });

  // A HoF person who has claimed a live, searchable member account: their index
  // entry links to the member profile, not the history page.
  insertHistoricalPerson(db, { person_id: LINKED_PERSON, person_name: 'Bella Claimed', hof_member: 1, hof_induction_year: 2010 });
  insertMember(db, { id: 'member-bella', slug: 'bella_claimed', display_name: 'Bella Claimed', login_email: 'bella@example.com' });
  db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?').run(LINKED_PERSON, 'member-bella');

  insertHistoricalPerson(db, { person_id: 'bap-001', person_name: 'Dex Poser', bap_member: 1, bap_induction_year: 2008 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /hof — on-site inductee index', () => {
  it('renders the inductee index and keeps the external site link', async () => {
    const res = await request(await createApp()).get('/hof');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Inductees');
    expect(res.text).toContain('Ada Recent');
    expect(res.text).toContain('Cyrus Undated');
    expect(res.text).toContain('2015');
    expect(res.text).toContain('footbaghalloffame.net');
  });

  it('links an unclaimed honoree to the history page and a claimed one to the member profile', async () => {
    const res = await request(await createApp()).get('/hof');
    expect(res.text).toContain('href="/history/hof-dated-001"');
    expect(res.text).toContain('href="/members/bella_claimed"');
    expect(res.text).not.toContain('href="/history/hof-person-linked-001"');
  });

  it('sorts dated inductees before undated ones', async () => {
    const res = await request(await createApp()).get('/hof');
    expect(res.text.indexOf('Ada Recent')).toBeLessThan(res.text.indexOf('Cyrus Undated'));
  });
});

describe('GET /bap — on-site member index', () => {
  it('renders the member index with induction year and keeps the external link', async () => {
    const res = await request(await createApp()).get('/bap');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dex Poser');
    expect(res.text).toContain('2008');
    expect(res.text).toContain('href="/history/bap-001"');
    expect(res.text).toContain('bigaddposse.com');
  });
});
