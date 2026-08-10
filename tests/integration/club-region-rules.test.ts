/**
 * A club in a country that writes its addresses with states or provinces must
 * carry one, on every path that creates a club.
 *
 * The reason is the country page: it groups clubs by region only when EVERY
 * club in that country has one, so a single region-less row turns a listing of
 * hundreds into one flat alphabetical column. Both creation paths are covered
 * here, because a rule enforced on one of them is not a rule.
 *
 * Clubs store the full state or province name ("New York"), which is the
 * opposite of the member column's two-letter code ("NY"). That is deliberate:
 * the member column feeds the Official IFPA Roster export, where a fixed code
 * is the reconcilable form, while a club's region is read by visitors as a
 * page heading. Nothing joins the two columns.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyClubCandidate } from '../fixtures/factories';

const { dbPath } = setTestEnv('3081');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/clubService').clubService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let rules: typeof import('../../src/services/clubService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  const mod = await import('../../src/services/clubService');
  svc = mod.clubService;
  rules = mod;
});

afterAll(() => cleanupTestDb(dbPath));

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString().padStart(4, '0')}`;
}

function seedCreator(): string {
  const id = nextId('creator');
  const db = new BetterSqlite3(dbPath);
  insertMember(db, { id, slug: `slug_${id}`, login_email: `${id}@example.com` });
  db.close();
  return id;
}

function createInput(over: Record<string, unknown> = {}): Parameters<typeof svc.createClub>[1] {
  return {
    name: `Club ${nextId('n')}`,
    description: 'A club.',
    city: 'Boulder',
    region: 'Colorado',
    country: 'United States',
    slug: `club_${nextId('s').replace(/-/g, '_')}`,
    confirmNearMatches: true,
    ...over,
  } as Parameters<typeof svc.createClub>[1];
}

describe('resolveClubRegion', () => {
  it('folds a two-letter code to the full name a club row stores', () => {
    expect(rules.resolveClubRegion('United States', 'NY')).toEqual({
      status: 'ok', region: 'New York',
    });
  });

  it('accepts the full name unchanged', () => {
    expect(rules.resolveClubRegion('Canada', 'Ontario')).toEqual({
      status: 'ok', region: 'Ontario',
    });
  });

  it('reports a missing state for a country that uses them', () => {
    expect(rules.resolveClubRegion('USA', null)).toEqual({ status: 'missing' });
    expect(rules.resolveClubRegion('USA', '  ')).toEqual({ status: 'missing' });
  });

  it('reports an unrecognized state rather than storing free text', () => {
    expect(rules.resolveClubRegion('United States', 'Somewhere')).toEqual({
      status: 'unrecognized',
    });
  });

  it('leaves a country with no official set free-text, including blank', () => {
    expect(rules.resolveClubRegion('France', 'Occitanie')).toEqual({
      status: 'ok', region: 'Occitanie',
    });
    expect(rules.resolveClubRegion('France', null)).toEqual({ status: 'ok', region: null });
  });
});

describe('createClub holds the same rule the promotion path does', () => {
  it('refuses a blank state for a country that uses them', () => {
    const creator = seedCreator();
    try {
      svc.createClub(creator, createInput({ region: '' }));
      throw new Error('expected createClub to reject');
    } catch (err) {
      expect((err as { fieldErrors?: Record<string, string> }).fieldErrors?.region)
        .toContain('State or province is required');
    }
  });

  it('refuses a state that is not one of the country\'s', () => {
    const creator = seedCreator();
    try {
      svc.createClub(creator, createInput({ region: 'Bavaria' }));
      throw new Error('expected createClub to reject');
    } catch (err) {
      expect((err as { fieldErrors?: Record<string, string> }).fieldErrors?.region)
        .toContain('full state or province name');
    }
  });

  it('stores the full name when a code was submitted', () => {
    const creator = seedCreator();
    const result = svc.createClub(creator, createInput({ region: 'CO' }));
    expect(result.branch).toBe('created');
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db
      .prepare('SELECT region FROM clubs WHERE id = ?')
      .get((result as { clubId: string }).clubId) as { region: string };
    db.close();
    expect(row.region).toBe('Colorado');
  });

  it('leaves a country with no official set alone', () => {
    const creator = seedCreator();
    const result = svc.createClub(
      creator,
      createInput({ country: 'France', city: 'Lyon', region: '' }),
    );
    expect(result.branch).toBe('created');
  });
});

describe('promotion cannot create the region-less club that flattens a country page', () => {
  function seedCandidate(over: Record<string, unknown> = {}): string {
    const db = new BetterSqlite3(dbPath);
    const id = insertLegacyClubCandidate(db, {
      classification: 'onboarding_visible',
      display_name: `Candidate ${nextId('c')}`,
      city: 'Boulder',
      country: 'USA',
      ...over,
    });
    db.close();
    return id;
  }

  it('refuses when neither the candidate nor the caller supplies a state', async () => {
    const actor = seedCreator();
    const candidateId = seedCandidate();
    await expect(
      svc.promoteCandidate(candidateId, actor, { actorType: 'admin' }),
    ).rejects.toThrow('State or province is required');
  });

  it('accepts the state the caller supplies, stored as the full name', async () => {
    const actor = seedCreator();
    const candidateId = seedCandidate();
    const result = await svc.promoteCandidate(candidateId, actor, {
      actorType: 'admin', region: 'CO',
    });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT region FROM clubs WHERE id = ?').get(result.clubId) as
      { region: string };
    db.close();
    expect(row.region).toBe('Colorado');
  });

  // Curated data outranks anything supplied later, so a candidate that already
  // carries a state keeps it and the caller's answer is ignored.
  it('keeps the candidate\'s own state over one the caller offers', async () => {
    const actor = seedCreator();
    const candidateId = seedCandidate({ region: 'Oregon' });
    const result = await svc.promoteCandidate(candidateId, actor, {
      actorType: 'admin', region: 'Colorado',
    });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT region FROM clubs WHERE id = ?').get(result.clubId) as
      { region: string };
    db.close();
    expect(row.region).toBe('Oregon');
  });

  it('promotes a candidate in a country with no official set, with no state', async () => {
    const actor = seedCreator();
    const candidateId = seedCandidate({ country: 'France', city: 'Lyon' });
    const result = await svc.promoteCandidate(candidateId, actor, { actorType: 'admin' });
    expect(result.branch).toBe('promoted');
  });
});
