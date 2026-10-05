/**
 * The curated name-variant lookups the claim step's name key reads.
 *
 * Contract under test: whole-name variant rows tie one whole name to another in
 * either direction, nickname pairs tie a first name to its alternate in either
 * direction, and the normalization the rows are stored in is the one lookups
 * apply. Read-only; no rows are modified.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertNameVariant, insertGivenNameVariant } from '../fixtures/factories';

const { dbPath } = setTestEnv('3099');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/nameVariantsService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertNameVariant(db, { canonical_normalized: 'jonathan william hargreaves', variant_normalized: 'jon hargreaves' });
  insertNameVariant(db, { canonical_normalized: 'jonathan william hargreaves', variant_normalized: 'johnny hargreaves' });
  insertGivenNameVariant(db, { short_form_normalized: 'dave', long_form_normalized: 'david' });
  insertGivenNameVariant(db, { short_form_normalized: 'davy', long_form_normalized: 'david' });
  db.close();
  svc = await import('../../src/services/nameVariantsService');
});

afterAll(() => cleanupTestDb(dbPath));

describe('normalizeForMatch', () => {
  // Defect caught: a lookup in a different normalized form than the stored
  // rows finds nothing for a name that has a curated variant.
  it('applies NFKC, lowercase, trim and whitespace collapse, and empty stays empty', () => {
    expect(svc.normalizeForMatch('  René   Dupont  ')).toBe('rené dupont');
    expect(svc.normalizeForMatch('Ｒené Dupont')).toBe('rené dupont');
    expect(svc.normalizeForMatch('   \t\n  ')).toBe('');
  });
});

describe('wholeNameVariants', () => {
  // Defect caught: a curated row is read in one direction only, so a member
  // registered under the short form never reaches the long-form record.
  it('reads rows in both directions and never returns the input', () => {
    expect(svc.wholeNameVariants('jon hargreaves')).toEqual(['jonathan william hargreaves']);
    expect(svc.wholeNameVariants('jonathan william hargreaves').sort())
      .toEqual(['johnny hargreaves', 'jon hargreaves']);
    expect(svc.wholeNameVariants('nobody here')).toEqual([]);
    expect(svc.wholeNameVariants('')).toEqual([]);
  });
});

describe('nicknameAlternates', () => {
  // Defect caught: a nickname reaches its long form but not back, or misses a
  // sibling nickname sharing the long form.
  it('reads pairs in both directions and never returns the input', () => {
    expect(svc.nicknameAlternates('dave')).toEqual(['david']);
    expect(svc.nicknameAlternates('david').sort()).toEqual(['dave', 'davy']);
    expect(svc.nicknameAlternates('zebedee')).toEqual([]);
    expect(svc.nicknameAlternates('')).toEqual([]);
  });
});
