/**
 * Atomicity regression tests for memberService profile writes.
 *
 * Each setter writes a domain row AND an audit row. They must commit together:
 * if the audit append throws, the domain update must roll back. Pre-fix the
 * writes ran as separate statements (no transaction), so a failed audit append
 * left the domain field changed with no audit trail.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/memberService').memberService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let audit: typeof import('../../src/services/auditService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  svc = (await import('../../src/services/memberService')).memberService;
  audit = await import('../../src/services/auditService');
});

afterAll(() => cleanupTestDb(dbPath));

let _seq = 0;
function seedMember(fields: Record<string, string | number | null> = {}): { id: string; slug: string } {
  _seq += 1;
  const id = `atom-mem-${_seq}`;
  const slug = `atom-slug-${_seq}`;
  const db = new BetterSqlite3(dbPath);
  insertMember(db, { id, slug, login_email: `${id}@example.com` });
  const keys = Object.keys(fields);
  if (keys.length > 0) {
    const set = keys.map(k => `${k} = ?`).join(', ');
    db.prepare(`UPDATE members SET ${set} WHERE id = ?`).run(...keys.map(k => fields[k]), id);
  }
  db.close();
  return { id, slug };
}

function memberField(id: string, column: string): unknown {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare(`SELECT ${column} AS v FROM members WHERE id = ?`).get(id) as { v: unknown };
  db.close();
  return row.v;
}

function throwOnAudit() {
  return vi.spyOn(audit, 'appendAuditEntry').mockImplementation(() => {
    throw new Error('forced audit failure');
  });
}

describe('memberService write-path atomicity', () => {
  it('updateOwnProfile rolls back the profile update when the audit append throws', () => {
    const { id, slug } = seedMember({ bio: 'ORIGINAL BIO' });
    const spy = throwOnAudit();
    expect(() => svc.updateOwnProfile(slug, {
      bio: 'NEW BIO',
      city: 'NewCity',
      region: '',
      country: '',
      phone: '',
      emailVisibility: 'private',
      firstCompetitionYear: '',
      showCompetitiveResults: '1',
      showFirstCompetitionYear: '0',
    })).toThrow('forced audit failure');
    spy.mockRestore();
    expect(memberField(id, 'bio')).toBe('ORIGINAL BIO');
  });

  it('setPersonalDetails rolls back the city update when the audit append throws', () => {
    const { id } = seedMember({ city: 'ORIGINAL CITY' });
    const spy = throwOnAudit();
    expect(() => svc.setPersonalDetails(id, {
      city: 'NewCity', country: 'NewCountry', birthDate: '1990-01-01',
    })).toThrow('forced audit failure');
    spy.mockRestore();
    expect(memberField(id, 'city')).toBe('ORIGINAL CITY');
  });

  it('setFirstCompetitionYear rolls back the year update when the audit append throws', () => {
    const { id } = seedMember({ first_competition_year: 1990 });
    const spy = throwOnAudit();
    expect(() => svc.setFirstCompetitionYear(id, '2001')).toThrow('forced audit failure');
    spy.mockRestore();
    expect(memberField(id, 'first_competition_year')).toBe(1990);
  });

  it('setPersonalDetails commits the competitive-results flag with the other fields, all-or-nothing', () => {
    // The onboarding wizard submits the flag together with the personal
    // details; a crash mid-submit must not complete the task while silently
    // reverting the preference to the schema default (visible).
    const { id } = seedMember({ city: 'ORIGINAL CITY', show_competitive_results: 1 });
    const spy = throwOnAudit();
    expect(() => svc.setPersonalDetails(id, {
      city: 'NewCity', country: 'NewCountry', birthDate: '1990-01-01',
      showCompetitiveResults: '0',
    })).toThrow('forced audit failure');
    spy.mockRestore();
    expect(memberField(id, 'city')).toBe('ORIGINAL CITY');
    expect(memberField(id, 'show_competitive_results')).toBe(1);

    svc.setPersonalDetails(id, {
      city: 'NewCity', country: 'NewCountry', birthDate: '1990-01-01',
      showCompetitiveResults: '0',
    });
    expect(memberField(id, 'city')).toBe('NewCity');
    expect(memberField(id, 'show_competitive_results')).toBe(0);
  });

  it('setPersonalDetails leaves the competitive-results flag untouched when the field is omitted', () => {
    const { id } = seedMember({ show_competitive_results: 0 });
    svc.setPersonalDetails(id, {
      city: 'SomeCity', country: 'SomeCountry', birthDate: '1990-01-01',
    });
    expect(memberField(id, 'show_competitive_results')).toBe(0);
  });

  it('setShowCompetitiveResults rolls back the flag update when the audit append throws', () => {
    const { id } = seedMember({ show_competitive_results: 1 });
    const spy = throwOnAudit();
    expect(() => svc.setShowCompetitiveResults(id, '0')).toThrow('forced audit failure');
    spy.mockRestore();
    expect(memberField(id, 'show_competitive_results')).toBe(1);
  });
});
