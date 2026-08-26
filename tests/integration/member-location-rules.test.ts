/**
 * The member location rules, enforced identically on both paths that write
 * them: the onboarding wizard's personal-details step and the profile edit
 * form.
 *
 * The country column feeds the Official IFPA Roster alongside the
 * region column, so one country recorded under several spellings splits a
 * roster the same way one state recorded as CA, California and Calif. does.
 * A submitted country therefore folds to the single name the picker offers,
 * and an unrecognized spelling is refused.
 *
 * Two rules pull against each other here and both are pinned below. A country
 * the member CHANGES must be canonical. A country they leave untouched must
 * not block the save, because a profile migrated from the old site carries
 * whatever the import wrote and the member never chose it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3077');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberService').memberService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  svc = (await import('../../src/services/memberService')).memberService;
});

afterAll(() => cleanupTestDb(dbPath));

let seq = 0;
function seedMember(fields: Record<string, string | number | null> = {}): { id: string; slug: string } {
  seq += 1;
  const id = `loc-mem-${seq}`;
  const slug = `loc-slug-${seq}`;
  const db = new BetterSqlite3(dbPath);
  insertMember(db, { id, slug, login_email: `${id}@example.com` });
  const keys = Object.keys(fields);
  if (keys.length > 0) {
    const set = keys.map((k) => `${k} = ?`).join(', ');
    db.prepare(`UPDATE members SET ${set} WHERE id = ?`).run(...keys.map((k) => fields[k]), id);
  }
  db.close();
  return { id, slug };
}

function stored(id: string): { city: string; region: string | null; country: string } {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare('SELECT city, region, country FROM members WHERE id = ?')
    .get(id) as { city: string; region: string | null; country: string };
  db.close();
  return row;
}

function editInput(over: Record<string, unknown> = {}): Parameters<typeof svc.updateOwnProfile>[1] {
  return {
    bio: '', city: 'Portland', region: 'OR', country: 'United States',
    phone: '', whatsapp: '', emailVisibility: 'private', phoneVisible: '0',
    whatsappVisible: '0', searchable: '1', firstCompetitionYear: '',
    birthDay: '14', birthMonth: '3', birthYear: '1978',
    showCompetitiveResults: '1', showFirstCompetitionYear: '1', showGender: '0',
    gender: '', links: [],
    ...over,
  } as Parameters<typeof svc.updateOwnProfile>[1];
}

describe('country canonicalization on the profile edit path', () => {
  it('folds an alias spelling to the name the picker offers', async () => {
    const { id, slug } = seedMember({ country: 'Canada', region: 'ON', city: 'Toronto' });
    await svc.updateOwnProfile(slug, editInput({ country: 'USA' }));
    expect(stored(id).country).toBe('United States');
  });

  it('folds a bare ISO code, which is what a hand-built request carries', async () => {
    const { id, slug } = seedMember({ country: 'Canada', region: 'ON', city: 'Toronto' });
    await svc.updateOwnProfile(slug, editInput({ country: 'us' }));
    expect(stored(id).country).toBe('United States');
  });

  it('refuses a changed country that names no country the platform knows', async () => {
    const { id, slug } = seedMember({ country: 'United States', region: 'OR', city: 'Portland' });
    await expect(
      svc.updateOwnProfile(slug, editInput({ country: 'Freedonia', region: '' })),
    ).rejects.toThrow('Country must be one of the countries offered in the list');
    expect(stored(id).country).toBe('United States');
  });

  // The picker deliberately re-offers a stored value it does not list, so a
  // migrated profile must stay editable. Holding an untouched country to the
  // rule would trap the member on a form they cannot submit over a field they
  // never chose.
  it('lets a member with a legacy country spelling save an unrelated field', async () => {
    const { id, slug } = seedMember({
      country: 'United States of America', region: 'OR', city: 'Portland',
    });
    await svc.updateOwnProfile(
      slug,
      editInput({ country: 'United States of America', bio: 'A new bio' }),
    );
    expect(stored(id).country).toBe('United States of America');
  });
});

describe('country spelling cannot be used to escape the region rule', () => {
  // The state and province list is looked up by country. A country spelled in
  // a way the lookup does not recognize used to match no list, so its region
  // skipped the two-letter-code rule entirely and free text reached the roster
  // export -- the exact failure the region rule exists to prevent.
  it('refuses a full state name even when the country is spelled with dots', async () => {
    const { id, slug } = seedMember({ country: 'Canada', region: 'ON', city: 'Toronto' });
    await expect(
      svc.updateOwnProfile(slug, editInput({ country: 'U.S.', region: 'Oregon' })),
    ).rejects.toThrow('two-letter state or province code');
    expect(stored(id).region).toBe('ON');
  });

  it('still names the missing region first when a required region is blank', async () => {
    const { slug } = seedMember({ country: 'Canada', region: 'ON', city: 'Toronto' });
    await expect(
      svc.updateOwnProfile(slug, editInput({ country: 'U.S.', region: '' })),
    ).rejects.toThrow('Region or state is required');
  });
});

describe('length caps apply on the profile edit path too', () => {
  // The wizard has always capped these. The edit form did not, so a member
  // could store through it what the wizard refused, and the roster showed it.
  it('refuses an over-long city', async () => {
    const { id, slug } = seedMember({ country: 'United States', region: 'OR', city: 'Portland' });
    await expect(
      svc.updateOwnProfile(slug, editInput({ city: 'x'.repeat(65) })),
    ).rejects.toThrow('City must be 64 characters or fewer.');
    expect(stored(id).city).toBe('Portland');
  });

  it('accepts a city at exactly the cap', async () => {
    const { id, slug } = seedMember({ country: 'United States', region: 'OR', city: 'Portland' });
    await svc.updateOwnProfile(slug, editInput({ city: 'y'.repeat(64) }));
    expect(stored(id).city).toBe('y'.repeat(64));
  });
});

describe('the same rules hold on the onboarding wizard path', () => {
  it('folds an alias spelling the member picked', () => {
    const { id } = seedMember({ country: null, region: null, city: null });
    svc.setPersonalDetails(id, {
      city: 'Portland', region: 'OR', country: 'USA', birthDay: '1', birthMonth: '1', birthYear: '1990',
      gender: 'undisclosed', yearValue: '',
    });
    expect(stored(id).country).toBe('United States');
  });

  it('refuses a country that names nothing', () => {
    const { id } = seedMember({ country: null, region: null, city: null });
    expect(() =>
      svc.setPersonalDetails(id, {
        city: 'Portland', region: '', country: 'Freedonia', birthDay: '1', birthMonth: '1', birthYear: '1990',
        gender: 'undisclosed', yearValue: '',
      }),
    ).toThrow('Country must be one of the countries offered in the list');
  });

  it('refuses an out-of-range year rather than storing nothing', () => {
    const { id } = seedMember({ country: null, region: null, city: null });
    expect(() =>
      svc.setPersonalDetails(id, {
        city: 'Portland', region: 'OR', country: 'United States', birthDay: '1', birthMonth: '1', birthYear: '1990',
        gender: 'undisclosed', yearValue: '1899',
      }),
    ).toThrow('Year must be a whole number between 1972 and');
  });

  // A member re-submitting this step must be treated exactly as the edit form
  // treats them: only a country they changed is held to the rule.
  it('lets a member re-save the step with the legacy country already on file', () => {
    const { id } = seedMember({
      country: 'United States of America', region: 'OR', city: 'Portland',
    });
    svc.setPersonalDetails(id, {
      city: 'Salem', region: 'OR', country: 'United States of America',
      birthDay: '1', birthMonth: '1', birthYear: '1990', gender: 'undisclosed', yearValue: '',
    });
    expect(stored(id).city).toBe('Salem');
    expect(stored(id).country).toBe('United States of America');
  });
});
