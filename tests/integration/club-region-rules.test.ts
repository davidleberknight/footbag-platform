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
 * the member column feeds the Official IFPA Roster, where a fixed code
 * is the reconcilable form, while a club's region is read by visitors as a
 * page heading. Nothing joins the two columns.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { parseCsvRecords } from '../../scripts/verify-seed-urls';
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

describe('the committed club seed meets the rule promotion applies', () => {
  // A seed club the old site never made real is promoted when a member confirms
  // it, and promotion takes the seed's state over the member's answer. A state
  // the rule does not accept therefore refuses the member with a message they
  // cannot act on, and a blank one asks them for what the old site recorded.
  it('gives every club in a country with states one the rule accepts', () => {
    const seed = path.join(__dirname, '..', '..', 'legacy_data', 'seed', 'clubs.csv');
    const [header = [], ...records] = parseCsvRecords(fs.readFileSync(seed, 'utf8'));
    const col = (name: string) => header.indexOf(name);
    const failures: string[] = [];
    let checked = 0;
    for (const r of records.filter((rec) => rec.length > 1)) {
      const country = (r[col('country')] ?? '').trim();
      if (!['United States', 'Canada'].includes(country)) continue;
      checked += 1;
      const region = (r[col('region')] ?? '').trim();
      const verdict = rules.resolveClubRegion(country, region);
      if (verdict.status !== 'ok' || verdict.region !== region) {
        failures.push(`${r[col('legacy_club_key')]}: ${JSON.stringify(region)} -> ${verdict.status}`);
      }
    }
    expect(checked, 'the seed still holds US and Canadian clubs to check').toBeGreaterThan(0);
    expect(failures, 'seed states the promotion rule refuses or rewrites').toEqual([]);
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

  it('capitalizes an all-lowercase candidate city on the club it creates', async () => {
    // Legacy records carry free text, and a club promoted from one would
    // otherwise list its city as typed twenty years ago.
    const actor = seedCreator();
    const candidateId = seedCandidate({ country: 'France', city: 'saint etienne' });
    const result = await svc.promoteCandidate(candidateId, actor, { actorType: 'admin' });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT city FROM clubs WHERE id = ?').get(result.clubId) as
      { city: string };
    db.close();
    expect(row.city).toBe('Saint Etienne');
  });
});

describe('promotion cannot create a club with no country', () => {
  // The member who confirms a wizard card reaches the same refusal as an admin,
  // and the wizard shows the refusal's message on the card, so the class and the
  // message are the contract both callers rely on.
  it('refuses a candidate with no country with the create form\'s validation message', async () => {
    const actor = seedCreator();
    const db = new BetterSqlite3(dbPath);
    const candidateId = insertLegacyClubCandidate(db, {
      classification: 'onboarding_visible',
      display_name: `Candidate ${nextId('c')}`,
      city: 'Lyon',
      country: null,
    });
    db.close();
    const { ValidationError } = await import('../../src/services/serviceErrors');
    const attempt = svc.promoteCandidate(candidateId, actor, { actorType: 'member', region: 'Rhone' });
    await expect(attempt).rejects.toBeInstanceOf(ValidationError);
    await expect(attempt).rejects.toThrow('Country is required.');
  });
});
