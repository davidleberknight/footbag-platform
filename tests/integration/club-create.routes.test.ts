/**
 * Club creation business rules (M_Create_Club). The create route's happy path
 * and tier gate are covered elsewhere; these are the rejection branches that
 * enforce the story's rules: a malformed slug, the two-club affiliation cap,
 * and the one-club-per-name-and-country uniqueness rule. Each is asserted by
 * the user-visible outcome the rule produces, not by mirroring the service.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import originRequest from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedPersona } from '../../src/testkit/personaFactory';
import { insertClub, insertMemberClubAffiliation, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3422');

const FREE = 'club_creator_free';
const CAPPED = 'club_creator_capped';
const FREE_ID = `member_persona_${FREE}`;
const CAPPED_ID = `member_persona_${CAPPED}`;

let createApp: Awaited<ReturnType<typeof importApp>>;

function cookie(memberId: string): string {
  return `footbag_session=${createTestSessionJwt({ memberId, ttlSeconds: 24 * 60 * 60 })}`;
}

function createClub(memberId: string, body: Record<string, string>) {
  return originRequest(createApp())
    .post('/clubs/create')
    .set('Cookie', cookie(memberId))
    .send({ description: '', region: '', whatsapp: '', ...body });
}

const VALID = { city: 'Townsville', country: 'USA', contactEmail: 'organizer@example.com' };

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedPersona(db, { slug: FREE, displayName: 'Free Creator', tier: 'tier1', onboardingComplete: true, coverageNotes: ['club create: unconstrained'] });
  seedPersona(db, { slug: CAPPED, displayName: 'Capped Creator', tier: 'tier1', onboardingComplete: true, coverageNotes: ['club create: at affiliation cap'] });
  // Put the capped creator in two current clubs so a third creation is barred.
  const c1 = insertClub(db, { name: 'Cap Club One', country: 'USA' });
  const c2 = insertClub(db, { name: 'Cap Club Two', country: 'USA' });
  insertMemberClubAffiliation(db, CAPPED_ID, c1, { is_current: 1, is_primary: 1 });
  insertMemberClubAffiliation(db, CAPPED_ID, c2, { is_current: 1 });
  // An existing club for the name-and-country uniqueness rule.
  insertClub(db, { name: 'Existing Footbag Club', country: 'USA' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /clubs/create business rules', () => {
  it('rejects a malformed slug', async () => {
    const res = await createClub(FREE_ID, { name: 'Slug Test Club', slug: 'Bad Slug!', ...VALID });
    expect(res.status, 'malformed slug rejected').toBe(422);
    expect(res.text, 'the form reports the error').toMatch(/slug|fix the errors/i);
  });

  it('bars a member already in two clubs from creating a third', async () => {
    const res = await createClub(CAPPED_ID, { name: 'Third Club Attempt', slug: 'thirdclub', ...VALID });
    expect(res.status, 'affiliation cap enforced').toBe(422);
    expect(res.text, 'the cap is explained to the member').toMatch(/already in 2 clubs/i);
  });

  it('rejects a duplicate club name in the same country', async () => {
    const res = await createClub(FREE_ID, { name: 'Existing Footbag Club', slug: 'existingdup', ...VALID });
    expect(res.status, 'duplicate name+country rejected').toBe(422);
    expect(res.text, 'points at the existing club').toMatch(/already exists/i);
  });
});
