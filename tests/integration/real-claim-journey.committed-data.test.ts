/**
 * The real-claim journey, end to end, on a record taken from the committed
 * migration data: register, verify, claim the legacy record, onboarding, confirm
 * the club the record carries, edit the profile, and volunteer to co-lead that
 * club.
 *
 * The record is the one the development crawl targets by default, the Hall of
 * Fame honoree with the lowest numeric member id and a full name, read from the
 * committed canonical persons file along with the club the committed club roster
 * puts them in. Nothing here needs the private member export or a running stack,
 * so the journey runs wherever the suite runs, including the push gate.
 *
 * Assertions key on the record id and on what the journey should change, never
 * on the person's name.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { parseCsvRecords } from '../../scripts/verify-seed-urls';

const { dbPath } = setTestEnv('3463');

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PERSONS_CSV = path.join(REPO_ROOT, 'legacy_data', 'event_results', 'canonical_input', 'persons.csv');
const CLUB_MEMBERS_CSV = path.join(REPO_ROOT, 'legacy_data', 'seed', 'club_members.csv');
const CLUBS_CSV = path.join(REPO_ROOT, 'legacy_data', 'seed', 'clubs.csv');

type Row = Record<string, string>;

function readCsv(file: string): Row[] {
  const [header = [], ...records] = parseCsvRecords(fs.readFileSync(file, 'utf8'));
  return records
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

/** The development crawl's default target, with the club the committed roster gives it. */
function committedHonoreeWithClub(): { person: Row; club: Row } {
  const rosterClubKeys = new Map<string, string>();
  for (const r of readCsv(CLUB_MEMBERS_CSV)) {
    if (!rosterClubKeys.has(r.mirror_member_id)) rosterClubKeys.set(r.mirror_member_id, r.legacy_club_key);
  }
  const clubs = new Map(readCsv(CLUBS_CSV).map((c) => [c.legacy_club_key, c]));
  const honorees = readCsv(PERSONS_CSV)
    .filter((p) => ['1', 'true', 'True'].includes(p.hof_member))
    .filter((p) => /^\d+$/.test(p.member_id))
    .filter((p) => p.person_name.split(/\s+/).length >= 2 && !/\d/.test(p.person_name))
    .sort((a, b) => Number(a.member_id) - Number(b.member_id));
  for (const person of honorees) {
    const club = clubs.get(rosterClubKeys.get(person.member_id) ?? '');
    if (club) return { person, club };
  }
  throw new Error('no committed Hall-of-Fame honoree with a committed club; the fixture data has changed');
}

let target: { person: Row; club: Row };
let clubId: string;

beforeAll(async () => {
  target = committedHonoreeWithClub();
  const db = createTestDb(dbPath);
  const {
    insertHistoricalPerson, insertClub, insertLegacyClubCandidate, insertLegacyPersonClubAffiliation,
  } = await import('../fixtures/factories');
  const { person, club } = target;
  insertHistoricalPerson(db, {
    person_id: person.person_id,
    person_name: person.person_name,
    legacy_member_id: person.member_id,
    hof_member: 1,
    hof_induction_year: person.hof_induction_year ? Number(person.hof_induction_year) : null,
  });
  clubId = insertClub(db, { name: club.name, city: club.city, country: club.country });
  const candidateId = insertLegacyClubCandidate(db, {
    legacy_club_key: club.legacy_club_key,
    display_name: club.name,
    city: club.city,
    country: club.country,
    mapped_club_id: clubId,
    // A candidate the club loader turned into a real club; a junk one never surfaces a card.
    classification: 'pre_populate',
  });
  insertLegacyPersonClubAffiliation(db, {
    legacy_member_id: person.member_id,
    legacy_club_candidate_id: candidateId,
  });
  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the real-claim journey on a committed Hall-of-Fame record', () => {
  it('claims the record, grants its honors, joins its club and co-leads it', async () => {
    const { buildRealClaimJourney } = await import('../../src/testkit/realClaimJourney');
    const { db } = await import('../../src/db/db');
    const legacyId = target.person.member_id;

    const built = await buildRealClaimJourney(legacyId);
    expect(built.claimedLegacy).toBe(true);

    const member = db
      .prepare('SELECT legacy_member_id, historical_person_id, is_hof FROM members WHERE id = ?')
      .get(built.memberId) as { legacy_member_id: string; historical_person_id: string; is_hof: number };
    expect(member.legacy_member_id).toBe(legacyId);
    expect(member.historical_person_id).toBe(target.person.person_id);
    expect(member.is_hof, 'a Hall-of-Fame record grants the honor on claim').toBe(1);

    const legacy = db
      .prepare('SELECT claimed_by_member_id FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { claimed_by_member_id: string };
    expect(legacy.claimed_by_member_id).toBe(built.memberId);

    const joined = db
      .prepare('SELECT club_id FROM member_club_affiliations WHERE member_id = ?')
      .all(built.memberId) as { club_id: string }[];
    expect(joined.map((j) => j.club_id), 'the confirmed legacy club becomes a membership').toContain(clubId);
    expect(built.coLedClubIds, 'the earned tier makes the claimant eligible to co-lead the club').toEqual([clubId]);
  });
});
