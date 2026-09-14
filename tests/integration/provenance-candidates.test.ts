/**
 * Integration tests for the provenance candidate builder.
 *
 * Calls `buildProvenanceCandidates(db)` directly against a fresh SQLite
 * schema seeded with fixtures that cover every classification branch of
 * the script: HIGH exact, HIGH variant, MEDIUM multi-legacy, MEDIUM
 * multi-HP, and unresolved (no match). The script is read-only; these
 * tests verify that assertion too by comparing row counts before and
 * after.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertHistoricalPerson, insertLegacyMember, insertNameVariant } from '../fixtures/factories';
import { buildProvenanceCandidates } from '../../scripts/build-provenance-candidates';

const { dbPath } = setTestEnv('4204');

function seed(db: BetterSqlite3.Database): void {
  const TS = '2025-01-01T00:00:00.000Z';

  const legacy = (legacy_member_id: string, display_name: string): string =>
    insertLegacyMember(db, {
      legacy_member_id,
      display_name,
      // The matcher prefers real_name and falls back to display_name; these
      // fixtures are mirror-derived rows that carry only the roster name.
      real_name: null,
      import_source: 'mirror',
    });

  // HIGH / exact_normalized_unique: one HP, one legacy, exact match.
  insertHistoricalPerson(db, {
    person_id: 'hp-exact', person_name: 'Alex Tester', source: 'test', country: null,
  });
  legacy('LM-exact', 'Alex Tester');

  // HIGH / variant_normalized_unique.
  insertHistoricalPerson(db, {
    person_id: 'hp-variant', person_name: 'René Dupont', source: 'test', country: null,
  });
  legacy('LM-variant', 'Rene Dupont');
  insertNameVariant(db, {
    canonical_normalized: 'rené dupont',
    variant_normalized: 'rene dupont',
    source: 'mirror_mined',
    created_at: TS,
  });

  // MEDIUM / ambiguous_multiple_legacy_matches: one HP, two legacies with same name.
  insertHistoricalPerson(db, {
    person_id: 'hp-multi-legacy', person_name: 'Pat Common', source: 'test', country: null,
  });
  legacy('LM-multi-a', 'Pat Common');
  legacy('LM-multi-b', 'Pat Common');

  // MEDIUM / ambiguous_multiple_hp_matches: two HPs share the same name,
  // both point at the same single legacy candidate.
  insertHistoricalPerson(db, {
    person_id: 'hp-share-a', person_name: 'Jordan Shared', source: 'test', country: null,
  });
  insertHistoricalPerson(db, {
    person_id: 'hp-share-b', person_name: 'Jordan Shared', source: 'test', country: null,
  });
  legacy('LM-shared', 'Jordan Shared');

  // Unresolved: HP with no matching legacy name anywhere.
  insertHistoricalPerson(db, {
    person_id: 'hp-unresolved', person_name: 'Nobody Stranger', source: 'test', country: null,
  });

  // Already-linked HP — must be excluded because legacy_member_id IS NULL is the filter.
  legacy('LM-existing', 'Already Linked');
  insertHistoricalPerson(db, {
    person_id: 'hp-prelinked',
    person_name: 'Already Linked',
    legacy_member_id: 'LM-existing',
    source: 'test',
    country: null,
  });
}

let db: BetterSqlite3.Database;

beforeAll(() => {
  db = createTestDb(dbPath);
  seed(db);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

describe('buildProvenanceCandidates', () => {
  it('emits HIGH / exact_normalized_unique for a unique exact match', () => {
    const { candidates } = buildProvenanceCandidates(db);
    const row = candidates.find((c) => c.historical_person_id === 'hp-exact');
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      candidate_legacy_member_id: 'LM-exact',
      confidence: 'HIGH',
      reason: 'exact_normalized_unique',
      ambiguity_count: 1,
    });
  });

  it('emits HIGH / variant_normalized_unique for a variant-assisted unique match', () => {
    const { candidates } = buildProvenanceCandidates(db);
    const row = candidates.find((c) => c.historical_person_id === 'hp-variant');
    expect(row).toBeDefined();
    expect(row).toMatchObject({
      candidate_legacy_member_id: 'LM-variant',
      confidence: 'HIGH',
      reason: 'variant_normalized_unique',
      ambiguity_count: 1,
    });
  });

  it('emits MEDIUM / ambiguous_multiple_legacy_matches (one row per candidate)', () => {
    const { candidates } = buildProvenanceCandidates(db);
    const rows = candidates.filter((c) => c.historical_person_id === 'hp-multi-legacy');
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.confidence).toBe('MEDIUM');
      expect(r.reason).toBe('ambiguous_multiple_legacy_matches');
      expect(r.ambiguity_count).toBe(2);
    }
    expect(rows.map((r) => r.candidate_legacy_member_id).sort())
      .toEqual(['LM-multi-a', 'LM-multi-b']);
  });

  it('emits MEDIUM / ambiguous_multiple_hp_matches when two HPs contend for the same legacy', () => {
    const { candidates } = buildProvenanceCandidates(db);
    const rows = candidates.filter((c) =>
      c.historical_person_id === 'hp-share-a' ||
      c.historical_person_id === 'hp-share-b');
    expect(rows).toHaveLength(2);
    for (const r of rows) {
      expect(r.confidence).toBe('MEDIUM');
      expect(r.reason).toBe('ambiguous_multiple_hp_matches');
      expect(r.ambiguity_count).toBe(2);
      expect(r.candidate_legacy_member_id).toBe('LM-shared');
    }
  });

  it('counts unresolved HPs in the summary but does not emit rows for them', () => {
    const { candidates, summary } = buildProvenanceCandidates(db);
    expect(candidates.find((c) => c.historical_person_id === 'hp-unresolved')).toBeUndefined();
    expect(summary.unresolved).toBeGreaterThanOrEqual(1);
  });

  it('ignores HPs that already have legacy_member_id set (baseline filter)', () => {
    const { candidates } = buildProvenanceCandidates(db);
    expect(candidates.find((c) => c.historical_person_id === 'hp-prelinked')).toBeUndefined();
  });

  it('summary counts match emitted row confidence counts', () => {
    const { candidates, summary } = buildProvenanceCandidates(db);
    expect(summary.high_count).toBe(
      candidates.filter((c) => c.confidence === 'HIGH').length,
    );
    expect(summary.medium_count).toBe(
      candidates.filter((c) => c.confidence === 'MEDIUM').length,
    );
  });

  it('is deterministic across runs (stable sort and same output)', () => {
    const r1 = buildProvenanceCandidates(db);
    const r2 = buildProvenanceCandidates(db);
    expect(r2.candidates).toEqual(r1.candidates);
  });

  it('does not mutate the DB', () => {
    const countBefore = {
      hp: (db.prepare('SELECT COUNT(*) AS n FROM historical_persons').get() as { n: number }).n,
      lm: (db.prepare('SELECT COUNT(*) AS n FROM legacy_members').get() as { n: number }).n,
      nv: (db.prepare('SELECT COUNT(*) AS n FROM name_variants').get() as { n: number }).n,
    };
    buildProvenanceCandidates(db);
    const countAfter = {
      hp: (db.prepare('SELECT COUNT(*) AS n FROM historical_persons').get() as { n: number }).n,
      lm: (db.prepare('SELECT COUNT(*) AS n FROM legacy_members').get() as { n: number }).n,
      nv: (db.prepare('SELECT COUNT(*) AS n FROM name_variants').get() as { n: number }).n,
    };
    expect(countAfter).toEqual(countBefore);
  });
});
