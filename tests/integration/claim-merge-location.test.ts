/**
 * What a claim merge is allowed to write into a member's location columns, and
 * whose value wins when two sources disagree.
 *
 * Two contracts meet here. The location columns feed the Official IFPA Roster
 * export, so an imported value has to satisfy the same shape rules a member's
 * own form does. But a claim must never fail because a record written twenty
 * years ago holds a typo -- refusing would roll back the whole claim
 * transaction, taking the claim itself, the tier grant and the audit row with
 * it, and lock a member out of their own history. So an imported value is
 * normalised where it can be and dropped where it cannot, and the member
 * supplies it on the personal-details step instead.
 *
 * The precedence contract is separate: curated historical data outranks the
 * legacy dump. Both merges fill only empty columns, which settles precedence
 * inside one claim but settles nothing across two, so a member who claims their
 * legacy account first and their curated record later needs the curated values
 * put back on top of what the dump left.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson } from '../fixtures/factories';

const { dbPath } = setTestEnv('3078');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
});

afterAll(() => cleanupTestDb(dbPath));

let seq = 0;
function nextId(prefix: string): string {
  seq += 1;
  return `${prefix}-${seq.toString().padStart(4, '0')}`;
}

function memberRow(id: string): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM members WHERE id = ?').get(id) as Record<string, unknown>;
  db.close();
  return row;
}

/** A member with empty location columns, beside an unclaimed legacy record. */
function seedLegacyClaim(legacy: {
  city?: string | null; region?: string | null; country?: string | null;
  first_competition_year?: number | null;
}): { memberId: string; legacyId: string } {
  const memberId = nextId('mem');
  const legacyId = nextId('leg');
  const db = new BetterSqlite3(dbPath);
  insertMember(db, {
    id: memberId,
    slug: `slug_${memberId}`,
    login_email: `${memberId}@example.com`,
    city: null,
    region: null,
    country: null,
  });
  insertLegacyMember(db, {
    legacy_member_id: legacyId,
    city: legacy.city ?? null,
    region: legacy.region ?? null,
    country: legacy.country ?? null,
    first_competition_year: legacy.first_competition_year ?? null,
  });
  db.close();
  return { memberId, legacyId };
}

describe('imported location is held to the shape rules, but never refused', () => {
  it('completes the claim and leaves the country unset when it names no known country', () => {
    const { memberId, legacyId } = seedLegacyClaim({ city: 'Lyon', country: 'Freedonia' });
    expect(() => svc.claimLegacyAccount(memberId, legacyId)).not.toThrow();
    const row = memberRow(memberId);
    // The claim landed -- this is the part that must never be sacrificed.
    expect(row.legacy_member_id).toBe(legacyId);
    expect(row.country).toBeNull();
    // A value that DID normalise still lands.
    expect(row.city).toBe('Lyon');
  });

  it('folds an imported country spelled as an ISO code to the name the picker offers', () => {
    const { memberId, legacyId } = seedLegacyClaim({ city: 'Lyon', country: 'FR' });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(memberRow(memberId).country).toBe('France');
  });

  // An imported record answered no picker, so it may spell a state either way.
  // The member's own form refuses a full name, because there a name proves the
  // submission did not come from the picker; here there was no picker.
  it('folds an imported state name to its official code', () => {
    const { memberId, legacyId } = seedLegacyClaim({
      city: 'Portland', region: 'Oregon', country: 'United States',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(memberRow(memberId).region).toBe('OR');
  });

  it('drops an imported region that is neither a code nor a state name', () => {
    const { memberId, legacyId } = seedLegacyClaim({
      city: 'Portland', region: 'somewhere near the coast', country: 'United States',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    expect(memberRow(memberId).region).toBeNull();
  });

  it('drops an imported city longer than the column rule allows', () => {
    const { memberId, legacyId } = seedLegacyClaim({
      city: 'x'.repeat(65), country: 'France',
    });
    svc.claimLegacyAccount(memberId, legacyId);
    const row = memberRow(memberId);
    expect(row.city).toBeNull();
    expect(row.country).toBe('France');
  });
});

describe('the claim does not copy imported address columns onto the member row', () => {
  // Nothing on the platform reads a member's street address or postal code:
  // no page renders them, there is no edit surface, and the roster export does
  // not carry them. Personal data is not retained without a stated purpose, so
  // they stay in the archival legacy snapshot where the historical record lives.
  it('leaves street address and postal code unset, and keeps them on the snapshot', () => {
    const memberId = nextId('mem');
    const legacyId = nextId('leg');
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: memberId,
      slug: `slug_${memberId}`,
      login_email: `${memberId}@example.com`,
      city: null, region: null, country: null,
    });
    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      street_address: '1 Old Road',
      postal_code: 'A1B2C3',
      city: 'Oldtown',
      country: 'France',
    });
    db.close();

    svc.claimLegacyAccount(memberId, legacyId);

    const row = memberRow(memberId);
    expect(row.street_address).toBeNull();
    expect(row.postal_code).toBeNull();
    // The rest of the merge still ran.
    expect(row.city).toBe('Oldtown');
    expect(row.country).toBe('France');

    const db2 = new BetterSqlite3(dbPath, { readonly: true });
    const snapshot = db2
      .prepare('SELECT street_address, postal_code FROM legacy_members WHERE legacy_member_id = ?')
      .get(legacyId) as { street_address: string | null; postal_code: string | null };
    db2.close();
    expect(snapshot.street_address).toBe('1 Old Road');
    expect(snapshot.postal_code).toBe('A1B2C3');
  });
});

describe('curated historical data outranks the legacy dump across separate claims', () => {
  /**
   * The member claims a legacy account in one transaction and a curated
   * historical record in a later one. The record carries no legacy back-link,
   * which is what lets the two claims happen separately.
   */
  function seedSeparateClaims(opts: {
    legacyCountry: string | null;
    legacyFirstYear: number | null;
    hpCountry: string | null;
    hpFirstYear: number | null;
    memberName?: string;
  }): { memberId: string; hpId: string } {
    const memberId = nextId('mem');
    const legacyId = nextId('leg');
    const hpId = nextId('hp');
    const name = opts.memberName ?? 'Ladder Tester';

    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id: memberId,
      slug: `slug_${memberId}`,
      display_name: name,
      // The self-serve historical claim gates on the member's real name
      // matching the record's, so the fixture has to carry one.
      real_name: name,
      login_email: `${memberId}@example.com`,
      city: null, region: null, country: null,
    });
    insertLegacyMember(db, {
      legacy_member_id: legacyId,
      real_name: name,
      display_name: name,
      country: opts.legacyCountry,
      first_competition_year: opts.legacyFirstYear,
    });
    insertHistoricalPerson(db, {
      person_id: hpId,
      person_name: name,
      legacy_member_id: null,
      country: opts.hpCountry,
      first_year: opts.hpFirstYear,
    });
    // The factory substitutes a default country for an absent one, so a record
    // that genuinely says nothing about country has to be written as such.
    if (opts.hpCountry === null) {
      db.prepare('UPDATE historical_persons SET country = NULL WHERE person_id = ?').run(hpId);
    }
    db.close();

    // Transaction one: the dump's values land on the member row.
    svc.claimLegacyAccount(memberId, legacyId);
    return { memberId, hpId };
  }

  it('replaces the country the dump left with the curated one', () => {
    const { memberId, hpId } = seedSeparateClaims({
      legacyCountry: 'Japan', legacyFirstYear: null,
      hpCountry: 'France', hpFirstYear: null,
    });
    expect(memberRow(memberId).country).toBe('Japan');

    svc.claimHistoricalPerson(memberId, hpId);
    expect(memberRow(memberId).country).toBe('France');
  });

  it('replaces the first competition year the dump left with the curated one', () => {
    const { memberId, hpId } = seedSeparateClaims({
      legacyCountry: null, legacyFirstYear: 1988,
      hpCountry: null, hpFirstYear: 1985,
    });
    expect(memberRow(memberId).first_competition_year).toBe(1988);

    svc.claimHistoricalPerson(memberId, hpId);
    expect(memberRow(memberId).first_competition_year).toBe(1985);
  });

  // The re-assert moves a column only when it still holds exactly what the
  // dump wrote. Anything the member has since entered themselves outranks both
  // imports and must survive untouched.
  it('leaves a value the member entered themselves alone', () => {
    const { memberId, hpId } = seedSeparateClaims({
      legacyCountry: 'Japan', legacyFirstYear: 1988,
      hpCountry: 'France', hpFirstYear: 1985,
    });
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE members SET country = ?, first_competition_year = ? WHERE id = ?')
      .run('Germany', 1999, memberId);
    db.close();

    svc.claimHistoricalPerson(memberId, hpId);
    const row = memberRow(memberId);
    expect(row.country).toBe('Germany');
    expect(row.first_competition_year).toBe(1999);
  });

  it('leaves the column alone when the curated record says nothing', () => {
    const { memberId, hpId } = seedSeparateClaims({
      legacyCountry: 'Japan', legacyFirstYear: 1988,
      hpCountry: null, hpFirstYear: null,
    });
    svc.claimHistoricalPerson(memberId, hpId);
    const row = memberRow(memberId);
    expect(row.country).toBe('Japan');
    expect(row.first_competition_year).toBe(1988);
  });
});
