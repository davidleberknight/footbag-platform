/**
 * Recording that a ruling became a trick that already exists.
 *
 * Ten names were promoted through the committed-file pipeline before the curation
 * funnel existed. That route could not touch the ruling record, so each ruling
 * still reads as an open decision while the trick it produced has been live ever
 * since. Nothing on a page is wrong; the record is missing the link saying which
 * trick each name became.
 *
 * The repair writes the ruling's side of that relationship and nothing else. It
 * creates no trick, changes none, and moves no ownership: the ten belong to the
 * committed inputs and stay there, which is why this cannot go through the
 * publication path. Publication creates something; this records something that
 * already happened, and the audit action says so rather than claiming a
 * publication that never occurred.
 *
 * Identity is checked rather than inferred. The caller supplies both the ruling
 * and the slug, and the service refuses unless the ruling's own normalised name
 * equals the trick's canonical name folded the same way.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleEvAdjudication,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('4144');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000recon01';

/** One of the ten, as the committed inputs and the ledger actually hold it. */
const SLUG = 'drifter_swirl';
const NAME = 'drifter swirl';
/** A fresh ruling per test, so each counts only the audit rows it caused. */
let candidateCounter = 0;
let CANDIDATE = '';

let db: BetterSqlite3.Database;
let service: typeof import('../../src/services/freestyleCurationService')['freestyleCurationService'];

function open(): BetterSqlite3.Database {
  const conn = new BetterSqlite3(dbPath);
  conn.pragma('foreign_keys = ON');
  return conn;
}

function trickRow(slug: string) {
  return db.prepare('SELECT * FROM freestyle_tricks WHERE slug = ?').get(slug) as
    Record<string, unknown> | undefined;
}

function ruling(candidateId: string) {
  return db.prepare(
    `SELECT ev_state, hold_kind, match_type, final_disposition, matched_existing_object,
            published_trick_slug, version, authored_notation, note, source, confidence,
            owner, proposed_formula, evidence_state, blocker_id
       FROM freestyle_ev_adjudications WHERE candidate_id = ?`,
  ).get(candidateId) as Record<string, unknown>;
}

function auditRows(candidateId: string) {
  return db.prepare(
    "SELECT metadata_json FROM audit_entries WHERE entity_id = ?"
    + " AND action_type = 'freestyle.adjudication.reconciled' ORDER BY occurred_at, rowid",
  ).all(candidateId) as { metadata_json: string }[];
}

/** Rebuild the fixture so each test starts from the unreconciled state.
 *
 *  The audit ledger is append-only and deliberately cannot be cleared, so each
 *  test gets its own ruling id and counts only its own entries.
 */
function seed(conn: BetterSqlite3.Database): void {
  candidateCounter += 1;
  CANDIDATE = `ev-historical-drifter-${candidateCounter}`;
  conn.exec('DELETE FROM freestyle_ev_adjudications');
  conn.exec('DELETE FROM freestyle_trick_aliases');
  conn.exec('DELETE FROM freestyle_tricks');

  insertFreestyleTrick(conn, {
    slug: SLUG, canonical_name: NAME, adds: '4', base_trick: 'swirl',
    trick_family: 'swirl', category: 'compound', review_status: 'expert_reviewed',
    operational_notation: 'SET > OP IN [DEX] > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]',
    trick_origin_producer: 'expert-additions',
    // A derived parse, so "unchanged" covers the fields a careless repair would
    // most plausibly disturb rather than only the ones that were empty anyway.
    structural_parse_json: '{"roles":{"terminal":"clip"}}',
    computed_adds: 4,
    computed_add_formula: 'drifter(3) + swirl(+1)',
    add_formula_status: 'agrees',
  });
  insertFreestyleTrickAlias(conn, 'drift_swirl', SLUG, 'drift swirl');
  // A second trick, so a mismatched pairing has somewhere wrong to point.
  insertFreestyleTrick(conn, {
    slug: 'nemesis_swirl', canonical_name: 'nemesis swirl', adds: '7',
    trick_family: 'swirl', category: 'compound',
    trick_origin_producer: 'expert-additions',
  });

  insertFreestyleEvAdjudication(conn, {
    candidate_id: CANDIDATE, submitted_name: 'Drifter Swirl',
    normalized_name: 'drifterswirl', ev_state: 'parser', final_disposition: 'C',
    hold_kind: 'parser', evidence_state: 'compositional-name-only',
    object_type: 'complete-trick', blocker_id: 'D9', owner: 'james', source: 'SG',
    confidence: 'high', proposed_formula: 'drifter(3) + swirl-chain(+1) = 4',
    note: 'the historical note',
  });
}

beforeAll(async () => {
  const conn = createTestDb(dbPath);
  insertMember(conn, {
    id: ADMIN_ID, slug: 'recon_admin', display_name: 'Recon Admin',
    login_email: 'recon-admin@example.com', is_admin: 1,
  });
  conn.close();
  await importApp();
  ({ freestyleCurationService: service } =
    await import('../../src/services/freestyleCurationService'));
  db = open();
});

afterAll(() => {
  db?.close();
  cleanupTestDb(dbPath);
});

beforeEach(() => {
  seed(db);
});

describe('a reconciled ruling', () => {
  it('reads exactly as one resolved by a publication', () => {
    expect(service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID))
      .toBe('reconciled');
    const r = ruling(CANDIDATE);
    expect(r.ev_state).toBe('canonical');
    expect(r.hold_kind).toBe('canonical');
    expect(r.match_type).toBe('promoted-canonical');
    expect(r.final_disposition).toBe('A');
    expect(r.matched_existing_object).toBe(SLUG);
    expect(r.published_trick_slug).toBe(SLUG);
    expect(r.version).toBe(2);
  });

  it('keeps every historical fact the ruling carried', () => {
    const before = ruling(CANDIDATE);
    service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID);
    const after = ruling(CANDIDATE);
    for (const field of ['note', 'source', 'confidence', 'owner', 'proposed_formula',
                         'evidence_state', 'blocker_id', 'authored_notation']) {
      expect(after[field]).toEqual(before[field]);
    }
  });
});

describe('the trick is not touched', () => {
  it('is byte-for-byte what it was', () => {
    const before = trickRow(SLUG);
    service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID);
    expect(trickRow(SLUG)).toEqual(before);
  });

  it('keeps its committed-input ownership', () => {
    service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID);
    expect(trickRow(SLUG)!.trick_origin_producer).toBe('expert-additions');
  });

  it('keeps its attachments', () => {
    const before = db.prepare(
      'SELECT * FROM freestyle_trick_aliases WHERE trick_slug = ?').all(SLUG);
    service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID);
    expect(db.prepare('SELECT * FROM freestyle_trick_aliases WHERE trick_slug = ?')
      .all(SLUG)).toEqual(before);
  });

  it('creates no trick', () => {
    const before = (db.prepare('SELECT COUNT(*) AS n FROM freestyle_tricks')
      .get() as { n: number }).n;
    service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID);
    expect((db.prepare('SELECT COUNT(*) AS n FROM freestyle_tricks')
      .get() as { n: number }).n).toBe(before);
  });
});

describe('the audit says what happened', () => {
  it('writes one entry, under an action that is not a publication', () => {
    service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID);
    expect(auditRows(CANDIDATE)).toHaveLength(1);
    const published = db.prepare(
      "SELECT COUNT(*) AS n FROM audit_entries WHERE action_type = 'freestyle.trick.published'",
    ).get() as { n: number };
    expect(published.n).toBe(0);
  });

  it('records what the ruling said before and after, and that the trick pre-existed', () => {
    service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID);
    const meta = JSON.parse(auditRows(CANDIDATE)[0]!.metadata_json) as Record<string, unknown>;
    expect(meta.candidateId).toBe(CANDIDATE);
    expect(meta.canonicalSlug).toBe(SLUG);
    expect(meta.trickPreexisting).toBe(true);
    expect(meta.before).toEqual({
      evState: 'parser', finalDisposition: 'C', matchType: '', publishedTrickSlug: null,
    });
    expect(meta.after).toEqual({
      evState: 'canonical', finalDisposition: 'A', matchType: 'promoted-canonical',
      publishedTrickSlug: SLUG,
    });
  });
});

describe('running it again', () => {
  it('is a no-op that writes nothing', () => {
    expect(service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID))
      .toBe('reconciled');
    const after = ruling(CANDIDATE);

    expect(service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID))
      .toBe('already');
    expect(ruling(CANDIDATE)).toEqual(after);
    expect(ruling(CANDIDATE).version).toBe(2);
    expect(auditRows(CANDIDATE)).toHaveLength(1);
  });
});

describe('what it refuses', () => {
  it('a ruling that does not exist', () => {
    expect(() => service.reconcileHistoricalPublication('ev-nope', SLUG, ADMIN_ID))
      .toThrow(/No adjudication/);
  });

  it('a trick that does not exist', () => {
    expect(() => service.reconcileHistoricalPublication(CANDIDATE, 'no_such_trick', ADMIN_ID))
      .toThrow(/not a trick in the dictionary/);
  });

  it('a pairing whose names are not the same name', () => {
    // The whole point is recording an identity that already holds.
    expect(() => service.reconcileHistoricalPublication(CANDIDATE, 'nemesis_swirl', ADMIN_ID))
      .toThrow(/not the same name/);
    expect(ruling(CANDIDATE).published_trick_slug).toBeNull();
  });

  it('a ruling already recorded against a different trick', () => {
    db.prepare('UPDATE freestyle_ev_adjudications SET published_trick_slug = ?'
      + ' WHERE candidate_id = ?').run('nemesis_swirl', CANDIDATE);
    expect(() => service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID))
      .toThrow(/already recorded against/);
  });

  it('a ruling that is no longer open', () => {
    db.prepare("UPDATE freestyle_ev_adjudications SET final_disposition = 'B'"
      + ' WHERE candidate_id = ?').run(CANDIDATE);
    expect(() => service.reconcileHistoricalPublication(CANDIDATE, SLUG, ADMIN_ID))
      .toThrow(/already been resolved some other way/);
  });

  it('writes nothing when it refuses', () => {
    const trickBefore = trickRow(SLUG);
    const rulingBefore = ruling(CANDIDATE);
    expect(() => service.reconcileHistoricalPublication(CANDIDATE, 'nemesis_swirl', ADMIN_ID))
      .toThrow();
    expect(trickRow(SLUG)).toEqual(trickBefore);
    expect(ruling(CANDIDATE)).toEqual(rulingBefore);
    expect(auditRows(CANDIDATE)).toEqual([]);
  });
});
