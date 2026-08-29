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

describe('notation authoring: what a draft may and may not look like', () => {
  it('stores an authored notation with the two claims its provenance is made of', () => {
    const id = insertFreestyleEvAdjudication(db, {
      normalized_name: 'authoredtranscription',
      authored_notation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
      notation_evidence_basis: 'source-notation',
      notation_derivation_method: 'transcription',
      notation_provenance_note: 'Copied from the source in its own register.',
      notation_authored_at: '2026-08-29T00:00:00.000Z',
      notation_authored_by: 'curator-1',
    });

    const row = db
      .prepare(`SELECT authored_notation, notation_evidence_basis, notation_derivation_method,
                       notation_convention_id, notation_provenance_note
                  FROM freestyle_ev_adjudications WHERE candidate_id = ?`)
      .get(id) as {
        authored_notation: string; notation_evidence_basis: string;
        notation_derivation_method: string; notation_convention_id: string | null;
        notation_provenance_note: string | null;
      };
    expect(row.notation_evidence_basis).toBe('source-notation');
    expect(row.notation_derivation_method).toBe('transcription');
    expect(row.notation_convention_id).toBeNull();
  });

  it('stores a derivation together with the convention it was made under', () => {
    const id = insertFreestyleEvAdjudication(db, {
      normalized_name: 'authoredderivation',
      authored_notation: 'CLIP > OP IN [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]',
      notation_evidence_basis: 'platform-structure',
      notation_derivation_method: 'convention-derivation',
      notation_convention_id: 'swirl-chain-terminal-replacement',
    });

    const row = db
      .prepare('SELECT notation_convention_id FROM freestyle_ev_adjudications WHERE candidate_id = ?')
      .get(id) as { notation_convention_id: string };
    expect(row.notation_convention_id).toBe('swirl-chain-terminal-replacement');
  });

  it('lets an authored notation stand without a prose note', () => {
    const id = insertFreestyleEvAdjudication(db, {
      normalized_name: 'authorednonote',
      authored_notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',
      notation_evidence_basis: 'footage',
      notation_derivation_method: 'reconstruction',
    });
    expect(id).toBeTruthy();
  });

  it('refuses provenance on a ruling whose notation was never authored', () => {
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'provenancewithoutnotation',
        notation_evidence_basis: 'source-notation',
        notation_derivation_method: 'transcription',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses an authorship stamp on a ruling whose notation was never authored', () => {
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'stampwithoutnotation',
        notation_authored_by: 'curator-1',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses an authored notation that does not say what it rests on', () => {
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'notationwithoutbasis',
        authored_notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',
        notation_derivation_method: 'transcription',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses an authored notation that does not say how it was produced', () => {
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'notationwithoutmethod',
        authored_notation: 'TOE > SAME OUT [DEX] > SAME TOE [DEL]',
        notation_evidence_basis: 'footage',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses a derivation that does not name its convention', () => {
    // The convention is what makes the exemplar rule computable: without it the
    // row cannot be excluded from corroborating the rule it came from.
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'derivationwithoutconvention',
        authored_notation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
        notation_evidence_basis: 'platform-structure',
        notation_derivation_method: 'convention-derivation',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses a convention on a method that is not a derivation', () => {
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'transcriptionwithconvention',
        authored_notation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
        notation_evidence_basis: 'source-notation',
        notation_derivation_method: 'transcription',
        notation_convention_id: 'swirl-chain-terminal-replacement',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('refuses a convention on a ruling with no notation at all', () => {
    expect(() =>
      insertFreestyleEvAdjudication(db, {
        normalized_name: 'conventionwithoutnotation',
        notation_convention_id: 'swirl-chain-terminal-replacement',
      }),
    ).toThrow(/CHECK constraint failed/i);
  });

  it('leaves every seeded ruling unauthored, which is the ordinary state', () => {
    const id = insertFreestyleEvAdjudication(db, { normalized_name: 'unauthoredordinary' });
    const row = db
      .prepare(`SELECT authored_notation, notation_evidence_basis, notation_derivation_method,
                       notation_convention_id, notation_authored_at, notation_authored_by
                  FROM freestyle_ev_adjudications WHERE candidate_id = ?`)
      .get(id) as Record<string, string | null>;
    for (const [column, value] of Object.entries(row)) {
      expect(value, `${column} on an unauthored ruling`).toBeNull();
    }
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
