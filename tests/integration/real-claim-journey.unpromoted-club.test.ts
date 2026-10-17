/**
 * The real-claim journey on a record whose legacy club the old site never turned
 * into a real club. Claiming such a record surfaces a membership card with no live
 * club behind it; confirming it has to create the club first, the way a member
 * confirming the same card in the onboarding wizard does. A journey that confirms
 * without creating the club is refused partway, leaving a half-built account and
 * a server error on the build-claim page for every such record.
 *
 * Two shapes: a club in a country that does not group clubs by state, and one in a
 * country that does, where the old site recorded no state and the card asks for one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3464');

const STATELESS_ID = '900301';
const STATE_NEEDED_ID = '900302';
let statelessCandidateId: string;
let stateNeededCandidateId: string;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  const {
    insertLegacyMember, insertLegacyClubCandidate, insertLegacyPersonClubAffiliation,
  } = await import('../fixtures/factories');

  insertLegacyMember(db, { legacy_member_id: STATELESS_ID, real_name: 'Unpromoted Finn' });
  statelessCandidateId = insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_club_unpromoted_fi',
    display_name: 'Helsinki Unpromoted Footbag',
    city: 'Helsinki',
    country: 'Finland',
    mapped_club_id: null,
    classification: 'pre_populate',
  });
  insertLegacyPersonClubAffiliation(db, {
    legacy_member_id: STATELESS_ID,
    legacy_club_candidate_id: statelessCandidateId,
  });

  insertLegacyMember(db, { legacy_member_id: STATE_NEEDED_ID, real_name: 'Unpromoted Yank' });
  stateNeededCandidateId = insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_club_unpromoted_us',
    display_name: 'Portland Unpromoted Footbag',
    city: 'Portland',
    country: 'United States',
    region: null,
    mapped_club_id: null,
    classification: 'pre_populate',
  });
  insertLegacyPersonClubAffiliation(db, {
    legacy_member_id: STATE_NEEDED_ID,
    legacy_club_candidate_id: stateNeededCandidateId,
  });
  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

async function claimAndReadClub(legacyId: string, candidateId: string) {
  const { buildRealClaimJourney } = await import('../../src/testkit/realClaimJourney');
  const { db } = await import('../../src/db/db');
  const built = await buildRealClaimJourney(legacyId);
  const candidate = db
    .prepare('SELECT mapped_club_id FROM legacy_club_candidates WHERE id = ?')
    .get(candidateId) as { mapped_club_id: string | null };
  const club = candidate.mapped_club_id
    ? db.prepare('SELECT id, country, region FROM clubs WHERE id = ?').get(candidate.mapped_club_id) as
        { id: string; country: string; region: string | null }
    : undefined;
  const joined = db
    .prepare('SELECT club_id FROM member_club_affiliations WHERE member_id = ?')
    .all(built.memberId) as { club_id: string }[];
  return { built, club, joined };
}

describe('the real-claim journey on a club the old site never made real', () => {
  it('creates the club and joins it, in a country that does not group clubs by state', async () => {
    const { built, club, joined } = await claimAndReadClub(STATELESS_ID, statelessCandidateId);
    expect(built.claimedLegacy).toBe(true);
    expect(club, 'confirming the card creates the club the candidate stood for').toBeDefined();
    expect(joined.map((j) => j.club_id), 'the confirmed club becomes a membership').toContain(club!.id);
  });

  it('creates the club with an offered state, where the country groups clubs by state', async () => {
    const { subdivisionsForCountry } = await import('../../src/services/countryUtils');
    const { built, club, joined } = await claimAndReadClub(STATE_NEEDED_ID, stateNeededCandidateId);
    expect(built.claimedLegacy).toBe(true);
    expect(club, 'confirming the card creates the club the candidate stood for').toBeDefined();
    const offered = subdivisionsForCountry(club!.country).map((s) => s.label);
    expect(offered, 'the created club carries a state the country lists, not a blank').toContain(club!.region);
    expect(joined.map((j) => j.club_id), 'the confirmed club becomes a membership').toContain(club!.id);
  });
});
