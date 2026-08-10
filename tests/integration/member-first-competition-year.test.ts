/**
 * Clearing the first-competition year hides it, on every surface that shows it.
 *
 * A member linked to a historical competition record has that record's first
 * year copied onto their row by the claim merge. A read-time fallback to the
 * record would therefore fire exactly when the member clears the field, putting
 * back the value they had just removed -- and on the profile edit form it would
 * do worse than that, re-offering the cleared year pre-filled so their next save
 * writes it back permanently.
 *
 * The visibility toggle is a separate, working control and is not what these
 * cases are about.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3079');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID   = 'fcy-member-1';
const MEMBER_SLUG = 'fcy_member';
const HP_ID       = 'fcy-hp-1';
const HP_FIRST_YEAR = 1991;

function cookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertHistoricalPerson(db, {
    person_id: HP_ID,
    person_name: 'Year Holder',
    first_year: HP_FIRST_YEAR,
  });
  insertMember(db, {
    id: MEMBER_ID,
    slug: MEMBER_SLUG,
    display_name: 'Year Holder',
    login_email: 'fcy@example.com',
    // Linked to the record, and carrying the record's year exactly as the claim
    // merge would have left it.
    historical_person_id: HP_ID,
    first_competition_year: HP_FIRST_YEAR,
    // The visibility toggle is on, so these cases isolate the effect of
    // clearing the value from the effect of switching the line off.
    show_first_competition_year: 1,
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function clearStoredYear(): void {
  const db = new BetterSqlite3(dbPath);
  db.prepare('UPDATE members SET first_competition_year = NULL WHERE id = ?').run(MEMBER_ID);
  db.close();
}

function setStoredYear(year: number): void {
  const db = new BetterSqlite3(dbPath);
  db.prepare('UPDATE members SET first_competition_year = ? WHERE id = ?').run(year, MEMBER_ID);
  db.close();
}

describe('a stored first-competition year is shown', () => {
  it('renders on the member profile', async () => {
    setStoredYear(HP_FIRST_YEAR);
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}`).set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain(`Competing since ${HP_FIRST_YEAR}`);
  });
});

describe('clearing the year hides it even though the linked record still has one', () => {
  it('leaves no "Competing since" line on the profile', async () => {
    clearStoredYear();
    const res = await request(createApp()).get(`/members/${MEMBER_SLUG}`).set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Competing since');
    expect(res.text).not.toContain(String(HP_FIRST_YEAR));
  });

  // The worst of the three: this shape fills the edit form's own value, so a
  // fallback here would hand the member back the year they cleared and their
  // next save would persist it again.
  it('leaves the edit form field empty rather than re-offering the cleared year', async () => {
    clearStoredYear();
    const res = await request(createApp())
      .get(`/members/${MEMBER_SLUG}/edit`)
      .set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(`value="${HP_FIRST_YEAR}"`);
  });
});
