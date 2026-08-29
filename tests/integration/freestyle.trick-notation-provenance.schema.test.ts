/**
 * Where a published trick records how its notation was arrived at.
 *
 * A trick published through the curation funnel carries the two claims the
 * ruling it came from carried: what the notation rests on, and what was done to
 * produce it, plus the named convention when it was derived under one. Copying
 * them onto the trick is what lets a published row be audited without reading
 * the funnel behind it, and it is what makes the exemplar rule computable: a row
 * derived under a convention never corroborates that same convention, and the
 * method and the convention together are what say so.
 *
 * Every row that predates the funnel carries none of it, which is most of the
 * dictionary and must stay legal. What is not legal is half a provenance, or a
 * convention on a row that was not derived under one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('4139');

let db: BetterSqlite3.Database;

beforeAll(() => {
  db = createTestDb(dbPath);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

function provenance(slug: string) {
  return db
    .prepare(`SELECT notation_evidence_basis, notation_derivation_method,
                     notation_convention_id, operational_notation_source
                FROM freestyle_tricks WHERE slug = ?`)
    .get(slug) as {
      notation_evidence_basis: string | null;
      notation_derivation_method: string | null;
      notation_convention_id: string | null;
      operational_notation_source: string | null;
    };
}

describe('a trick that predates the funnel', () => {
  it('carries no structured provenance, and that is legal', () => {
    const slug = insertFreestyleTrick(db, { slug: 'legacy_trick' });
    const row = provenance(slug);
    expect(row.notation_evidence_basis).toBeNull();
    expect(row.notation_derivation_method).toBeNull();
    expect(row.notation_convention_id).toBeNull();
  });

  it('keeps its citation prose, which these columns do not replace', () => {
    insertFreestyleTrick(db, {
      slug: 'legacy_cited',
      operational_notation_source: 'Source: an outside catalogue, curator-reviewed.',
    });
    const row = provenance('legacy_cited');
    expect(row.operational_notation_source).toBe('Source: an outside catalogue, curator-reviewed.');
    expect(row.notation_evidence_basis).toBeNull();
  });
});

describe('a trick published from a ruling', () => {
  it('records what the notation rests on and what was done to produce it', () => {
    insertFreestyleTrick(db, {
      slug: 'published_transcription',
      operational_notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',
      operational_notation_source: 'Source: an outside catalogue, in its own register.',
      notation_evidence_basis: 'source-notation',
      notation_derivation_method: 'transcription',
    });
    const row = provenance('published_transcription');
    expect(row.notation_evidence_basis).toBe('source-notation');
    expect(row.notation_derivation_method).toBe('transcription');
    expect(row.notation_convention_id).toBeNull();
    expect(row.operational_notation_source).toContain('own register');
  });

  it('records the convention a derivation was made under', () => {
    insertFreestyleTrick(db, {
      slug: 'published_derivation',
      operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
      notation_evidence_basis: 'platform-structure',
      notation_derivation_method: 'convention-derivation',
      notation_convention_id: 'swirl-chain-terminal-replacement',
    });
    expect(provenance('published_derivation').notation_convention_id)
      .toBe('swirl-chain-terminal-replacement');
  });
});

describe('what the row refuses', () => {
  it('refuses a notation that says what it rests on but not how it was produced', () => {
    expect(() =>
      insertFreestyleTrick(db, {
        slug: 'half_provenance_basis',
        notation_evidence_basis: 'footage',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses a notation that says how it was produced but not what it rests on', () => {
    expect(() =>
      insertFreestyleTrick(db, {
        slug: 'half_provenance_method',
        notation_derivation_method: 'reconstruction',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses a derivation that does not name its convention', () => {
    expect(() =>
      insertFreestyleTrick(db, {
        slug: 'derivation_without_convention',
        notation_evidence_basis: 'platform-structure',
        notation_derivation_method: 'convention-derivation',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses a convention on a method that is not a derivation', () => {
    expect(() =>
      insertFreestyleTrick(db, {
        slug: 'transcription_with_convention',
        notation_evidence_basis: 'source-notation',
        notation_derivation_method: 'transcription',
        notation_convention_id: 'swirl-chain-terminal-replacement',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses a convention on a legacy row with no provenance at all', () => {
    // The case a natural comparison against NULL would let through.
    expect(() =>
      insertFreestyleTrick(db, {
        slug: 'convention_without_method',
        notation_convention_id: 'swirl-chain-terminal-replacement',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });
});

describe('independence stays computable rather than stored', () => {
  it('has no column claiming a row is an independent exemplar', () => {
    const columns = (db.prepare("PRAGMA table_info('freestyle_tricks')").all() as { name: string }[])
      .map((c) => c.name);
    expect(columns.filter((c) => /independen|exemplar/i.test(c))).toEqual([]);
    // The two fields the rule is computed from are both present.
    expect(columns).toContain('notation_derivation_method');
    expect(columns).toContain('notation_convention_id');
  });
});
