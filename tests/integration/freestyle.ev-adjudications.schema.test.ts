/**
 * The Emerging Vocabulary adjudication table's storage contract.
 *
 * A ruling about an observational freestyle name is durable lexical history. It
 * outlives the name's trick row, exists for names that have no trick row at all,
 * and is never silently replaced by a second ruling for the same name. These are
 * the constraints that make those three properties true rather than customary:
 * the optional foreign key to the trick dictionary, the one-ruling-per-name index,
 * and the refusal to let a linked trick row be deleted out from under a ruling.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleEvAdjudication } from '../fixtures/factories';

const { dbPath } = setTestEnv('4133');

let db: BetterSqlite3.Database;

beforeAll(() => {
  db = createTestDb(dbPath);
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

interface AdjudicationRow {
  candidate_id: string;
  submitted_name: string;
  normalized_name: string;
  note: string;
  proposed_formula: string;
  failure_class: string;
  residual_home: string;
  published_trick_slug: string | null;
  version: number;
}

function readAdjudication(candidateId: string): AdjudicationRow | undefined {
  return db
    .prepare('SELECT * FROM freestyle_ev_adjudications WHERE candidate_id = ?')
    .get(candidateId) as AdjudicationRow | undefined;
}

describe('the trick link is optional', () => {
  it('stores a ruling about a name that has no trick row', () => {
    const id = insertFreestyleEvAdjudication(db, {
      submitted_name: 'Unlinked Folk Name',
      normalized_name: 'unlinkedfolkname',
      ev_state: 'folk',
      final_disposition: 'C',
    });

    const row = readAdjudication(id);
    expect(row?.published_trick_slug).toBeNull();
    expect(row?.normalized_name).toBe('unlinkedfolkname');
  });

  it('keeps the curator working fields that no generator reads', () => {
    const id = insertFreestyleEvAdjudication(db, {
      normalized_name: 'workingfieldsname',
      proposed_formula: 'pixie(+1) + mirage(2) = 3',
      failure_class: 'compression-ambiguity',
      residual_home: 'Notation paper',
      note: 'held pending an operator definition',
    });

    const row = readAdjudication(id);
    expect(row?.proposed_formula).toBe('pixie(+1) + mirage(2) = 3');
    expect(row?.failure_class).toBe('compression-ambiguity');
    expect(row?.residual_home).toBe('Notation paper');
    expect(row?.note).toBe('held pending an operator definition');
  });
});

describe('the trick link is a real foreign key', () => {
  it('accepts a link to a trick row that exists', () => {
    const slug = insertFreestyleTrick(db, { slug: 'linked_candidate_trick' });
    const id = insertFreestyleEvAdjudication(db, {
      normalized_name: 'linkedcandidatetrick',
      published_trick_slug: slug,
    });

    expect(readAdjudication(id)?.published_trick_slug).toBe('linked_candidate_trick');
  });

  it('refuses a link to a slug no trick row carries', () => {
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'danglinglinkname',
        published_trick_slug: 'no_such_trick_slug',
      }),
    ).toThrow(/FOREIGN KEY/i);

    const orphan = db
      .prepare('SELECT COUNT(*) AS n FROM freestyle_ev_adjudications WHERE normalized_name = ?')
      .get('danglinglinkname') as { n: number };
    expect(orphan.n).toBe(0);
  });

  it('refuses to delete a trick row a ruling still points at, so the history survives', () => {
    const slug = insertFreestyleTrick(db, { slug: 'protected_by_its_ruling' });
    const id = insertFreestyleEvAdjudication(db, {
      normalized_name: 'protectedbyitsruling',
      published_trick_slug: slug,
    });

    expect(() =>
      db.prepare('DELETE FROM freestyle_tricks WHERE slug = ?').run(slug),
    ).toThrow(/FOREIGN KEY/i);

    expect(readAdjudication(id)?.published_trick_slug).toBe('protected_by_its_ruling');
  });
});

describe('one ruling per name', () => {
  it('refuses a second ruling carrying a normalized name already adjudicated', () => {
    insertFreestyleEvAdjudication(db, {
      submitted_name: 'Duplicate Ruling Target',
      normalized_name: 'duplicaterulingtarget',
    });

    expect(() =>
      insertFreestyleEvAdjudication(db, {
        submitted_name: 'Duplicate Ruling Target (again)',
        normalized_name: 'duplicaterulingtarget',
      }),
    ).toThrow(/UNIQUE/i);
  });

  it('refuses two rulings claiming the same recorded position', () => {
    insertFreestyleEvAdjudication(db, {
      normalized_name: 'firstatthisposition',
      sequence_no: 90_001,
    });

    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'secondatthisposition',
        sequence_no: 90_001,
      }),
    ).toThrow(/UNIQUE/i);
  });

  it('lets two rulings share a submitted name when their normalized names differ', () => {
    const first = insertFreestyleEvAdjudication(db, {
      submitted_name: 'Shared Submitted Name',
      normalized_name: 'sharedsubmittednameone',
    });
    const second = insertFreestyleEvAdjudication(db, {
      submitted_name: 'Shared Submitted Name',
      normalized_name: 'sharedsubmittednametwo',
    });

    expect(readAdjudication(first)?.submitted_name).toBe('Shared Submitted Name');
    expect(readAdjudication(second)?.submitted_name).toBe('Shared Submitted Name');
  });
});

describe('unlinked rulings are untouched by trick-dictionary churn', () => {
  it('survives the deletion of an unrelated trick row', () => {
    const id = insertFreestyleEvAdjudication(db, {
      submitted_name: 'Legacy Unlinked Ruling',
      normalized_name: 'legacyunlinkedruling',
      ev_state: 'alias',
      final_disposition: 'A',
      matched_existing_object: 'same-formula-row',
      match_type: 'formula-identity',
    });
    const doomed = insertFreestyleTrick(db, { slug: 'unrelated_trick_row' });

    db.prepare('DELETE FROM freestyle_tricks WHERE slug = ?').run(doomed);

    const row = readAdjudication(id);
    expect(row?.published_trick_slug).toBeNull();
    expect(row?.matched_existing_object).toBe('same-formula-row');
  });
});

describe('row metadata', () => {
  it('requires the audit stamps every mutable row carries and defaults the version', () => {
    const columns = db
      .prepare("PRAGMA table_info('freestyle_ev_adjudications')")
      .all() as { name: string; notnull: number; dflt_value: string | null }[];
    const byName = new Map(columns.map((c) => [c.name, c]));

    for (const stamp of ['created_at', 'created_by', 'updated_at', 'updated_by', 'version']) {
      expect(byName.get(stamp)?.notnull, `${stamp} must be NOT NULL`).toBe(1);
    }
    expect(byName.get('version')?.dflt_value).toBe('1');
    expect(byName.get('published_trick_slug')?.notnull, 'the trick link must stay nullable').toBe(0);

    const id = insertFreestyleEvAdjudication(db, { normalized_name: 'metadatastampname' });
    expect(readAdjudication(id)?.version).toBe(1);
  });
});
