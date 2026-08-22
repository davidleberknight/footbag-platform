/**
 * A member's legal name is recorded as two parts rather than guessed from one
 * string.
 *
 * The surname is the private matching anchor every claim path gates on, and it
 * used to be derived by taking the last word of the full name. These tests pin
 * the names that guess gets wrong, and the one it refused outright: a member
 * whose legal name is a single word could not register at all.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3165');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

interface NameRow {
  given_names: string | null;
  family_name: string | null;
  real_name: string;
  slug: string;
}

function readByEmail(email: string): NameRow | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(
    'SELECT given_names, family_name, real_name, slug FROM members WHERE login_email = ?',
  ).get(email) as NameRow | undefined;
  db.close();
  return row;
}

function register(fields: Record<string, string>): request.Test {
  return request(createApp())
    .post('/register')
    .type('form')
    .send({ password: 'securepass123', confirmPassword: 'securepass123', ...fields });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the two parts are recorded as given', () => {
  it('keeps an ordinary two-part name in its two parts', async () => {
    const email = 'two-part@example.com';
    expect((await register({ givenNames: 'Jane', familyName: 'Footbagger', email })).status).toBe(303);
    const row = readByEmail(email)!;
    expect(row.given_names).toBe('Jane');
    expect(row.family_name).toBe('Footbagger');
    expect(row.real_name).toBe('Jane Footbagger');
  });

  // The old guess took the last word, so this member's surname would have been
  // recorded as "López" and they would never have matched their own record.
  it('keeps a two-surname family name whole', async () => {
    const email = 'double-surname@example.com';
    expect((await register({
      givenNames: 'José Reynel', familyName: 'Reynel López', email,
    })).status).toBe(303);
    const row = readByEmail(email)!;
    expect(row.family_name).toBe('Reynel López');
    expect(row.real_name).toBe('José Reynel Reynel López');
  });

  it('keeps a family name that begins with a particle whole', async () => {
    const email = 'particle@example.com';
    expect((await register({ givenNames: 'Aaron', familyName: 'de Glanville', email })).status).toBe(303);
    const row = readByEmail(email)!;
    expect(row.family_name).toBe('de Glanville');
    expect(row.real_name).toBe('Aaron de Glanville');
  });

  it('keeps several given names whole', async () => {
    const email = 'many-given@example.com';
    expect((await register({
      givenNames: 'Maria Luisa Carmen', familyName: 'Herrera', email,
    })).status).toBe(303);
    const row = readByEmail(email)!;
    expect(row.given_names).toBe('Maria Luisa Carmen');
    expect(row.family_name).toBe('Herrera');
    expect(row.real_name).toBe('Maria Luisa Carmen Herrera');
  });

  it('keeps a hyphenated family name whole', async () => {
    const email = 'hyphen@example.com';
    expect((await register({ givenNames: 'Alex', familyName: 'Smith-Jones', email })).status).toBe(303);
    expect(readByEmail(email)!.family_name).toBe('Smith-Jones');
  });

  it('keeps an apostrophe in a family name', async () => {
    const email = 'apostrophe@example.com';
    expect((await register({ givenNames: 'Sean', familyName: "O'Brien", email })).status).toBe(303);
    expect(readByEmail(email)!.family_name).toBe("O'Brien");
  });

  it('accepts a name written in a non-Latin script', async () => {
    const email = 'non-latin@example.com';
    expect((await register({ givenNames: '世界', familyName: '你好', email })).status).toBe(303);
    const row = readByEmail(email)!;
    expect(row.given_names).toBe('世界');
    expect(row.family_name).toBe('你好');
  });
});

describe('the family name is the required half', () => {
  // The family name is the anchor every claim path matches on, so it is the
  // part that must be there. A member with a single legal name records it as
  // their family name, which is why that case is accepted rather than refused.
  it('accepts a member whose legal name is a single word', async () => {
    const email = 'mononym@example.com';
    expect((await register({ givenNames: '', familyName: 'Sukarno', email })).status).toBe(303);
    const row = readByEmail(email)!;
    expect(row.given_names).toBeNull();
    expect(row.family_name).toBe('Sukarno');
    expect(row.real_name).toBe('Sukarno');
  });

  it('refuses a registration that gives only given names', async () => {
    const res = await register({
      givenNames: 'Sukarno', familyName: '', email: 'given-only@example.com',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('enter it as your family name');
    expect(readByEmail('given-only@example.com')).toBeUndefined();
  });

  it('refuses a registration that gives neither', async () => {
    const res = await register({ givenNames: '', familyName: '', email: 'neither@example.com' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter your name');
    expect(readByEmail('neither@example.com')).toBeUndefined();
  });

  it('refuses a name of a single character', async () => {
    const res = await register({ givenNames: '', familyName: 'X', email: 'onechar@example.com' });
    expect(res.status).toBe(422);
  });

  it('still refuses digits and over-long names', async () => {
    expect((await register({
      givenNames: 'Player', familyName: '123', email: 'digits@example.com',
    })).status).toBe(422);
    expect((await register({
      givenNames: 'x'.repeat(40), familyName: 'y'.repeat(40), email: 'toolong@example.com',
    })).status).toBe(422);
  });
});

describe('the two rules that key on the surname read the recorded part', () => {
  // The display name is checked against the recorded family name, so a member
  // with two surnames is held to the whole thing rather than to its last word.
  // The display name here differs from the assembled full name deliberately: an
  // identical one skips the rule entirely and would prove nothing.
  it('accepts a different display name carrying the whole two-surname family name', async () => {
    const email = 'display-double@example.com';
    const res = await register({
      givenNames: 'Boris', familyName: 'Belouin Ollivier',
      displayName: 'B Belouin Ollivier', email,
    });
    expect(res.status).toBe(303);
    expect(readByEmail(email)!.family_name).toBe('Belouin Ollivier');
  });

  it('refuses a display name that keeps only the last word of a two-surname family name', async () => {
    const res = await register({
      givenNames: 'Boris', familyName: 'Belouin Ollivier',
      displayName: 'Boris Ollivier', email: 'display-partial@example.com',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must include your family name');
  });

  // A profile URL cannot contain a space, so holding a multi-word family name
  // to the whole thing would leave the member no slug they could ever choose.
  it('accepts a chosen profile URL for a member with a two-surname family name', async () => {
    const email = 'slug-double@example.com';
    const res = await register({
      givenNames: 'Boris', familyName: 'Belouin Ollivier',
      slug: 'boris_belouin_ollivier', email,
    });
    expect(res.status).toBe(303);
    expect(readByEmail(email)!.slug).toBe('boris_belouin_ollivier');
  });

  it('accepts a chosen profile URL for a member whose family name has a particle', async () => {
    const email = 'slug-particle@example.com';
    const res = await register({
      givenNames: 'Ada', familyName: 'van der Berg',
      slug: 'ada_van_der_berg', email,
    });
    expect(res.status).toBe(303);
    expect(readByEmail(email)!.slug).toBe('ada_van_der_berg');
  });

  it('refuses a display name that drops the family name', async () => {
    const res = await register({
      givenNames: 'Nina', familyName: 'Rodriguez',
      displayName: 'Nina Different', email: 'display-wrong@example.com',
    });
    expect(res.status).toBe(422);
    expect(res.text).toContain('must include your family name');
  });

  it('holds the profile URL to the recorded family name', async () => {
    const ok = await register({
      givenNames: 'Ivo', familyName: 'Novak', slug: 'ivo_novak', email: 'slug-ok@example.com',
    });
    expect(ok.status).toBe(303);
    expect(readByEmail('slug-ok@example.com')!.slug).toBe('ivo_novak');

    const bad = await register({
      givenNames: 'Ivo', familyName: 'Novak', slug: 'just_ivo', email: 'slug-bad@example.com',
    });
    expect(bad.status).toBe(422);
    expect(bad.text).toContain('must contain your family name');
  });

  // A member with a single legal name recorded it as their family name, so the
  // same rule applies to them with no special case behind it.
  it('holds a single-name member to that one name', async () => {
    const ok = await register({
      givenNames: '', familyName: 'Ronaldinho', slug: 'ronaldinho_x',
      email: 'mononym-slug@example.com',
    });
    expect(ok.status).toBe(303);

    const bad = await register({
      givenNames: '', familyName: 'Ronaldinho', slug: 'someone_else',
      email: 'mononym-slug2@example.com',
    });
    expect(bad.status).toBe(422);
    expect(bad.text).toContain('must contain your family name');
  });
});
