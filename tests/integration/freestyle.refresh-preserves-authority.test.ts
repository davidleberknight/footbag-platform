/**
 * What an ordinary freestyle refresh must not destroy.
 *
 * The freestyle tables were once a pure function of committed inputs, so every
 * loader could clear its table and repopulate it. Two of those tables no longer
 * work that way. Adjudications are written by curators through the application:
 * a movement notation authored onto a ruling, and the resolution recorded when
 * that ruling's trick is published. A canonical trick created through the
 * publication funnel exists only in the database and in no committed file.
 *
 * This harness builds exactly that state through the real loaders and the real
 * services, then runs the refresh against it. It is a measurement, not a fix:
 * every assertion here describes what a repaired refresh must preserve, and the
 * ones describing today's behaviour are written to fail the moment that
 * behaviour changes, so the repair cannot land silently.
 *
 * The loaders run in the sequence the freestyle rebuild uses. A smaller
 * reproduction would not do: the failure is a property of that order, since the
 * adjudication loader runs last precisely because its rows point at trick rows
 * the dictionary loaders create, which is what leaves those rows alive when the
 * dictionary loader tries to clear the table beneath them.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4141');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000refresh1';

// Four scoring brackets, so the published trick asserts 4 ADD.
const NOTATION = 'CLIP > OP IN [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]';
const PROVENANCE_NOTE = 'Read off a record video frame by frame.';

// The dictionary sequence the freestyle rebuild runs, in its order. The
// adjudication seed is last because its rows reference trick slugs.
const DICTIONARY_LOADERS = [
  '17_load_trick_dictionary.py',
  '19_load_red_additions.py',
  '20_link_footbag_org_sources.py',
  '21_load_footbag_org_pending_tricks.py',
  '21a_load_alias_additions.py',
  '21b_apply_alias_overrides.py',
];
const ADJUDICATION_LOADER = '28_load_ev_adjudications.py';

function runLoader(name: string) {
  return spawnSync('python3', [`freestyle/loaders/${name}`, '--db', dbPath], {
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
}

function runLoaderOrThrow(name: string): void {
  const r = runLoader(name);
  if (r.status !== 0) {
    throw new Error(`loader ${name} failed (${r.status}): ${r.stderr ?? ''}`);
  }
}

interface Snapshot {
  foreignKeysOn: boolean;
  trickCount: number;
  adjudicationCount: number;
  /** The trick created through the funnel, absent from every committed input. */
  nativeTrick: Record<string, unknown> | undefined;
  nativeAliasCount: number;
  nativeModifierLinkCount: number;
  /** The ruling that was published: resolved, and pointing at the new trick. */
  published: AdjudicationState | undefined;
  /** A ruling whose movement was authored and never published. */
  draft: AdjudicationState | undefined;
}

interface AdjudicationState {
  authored_notation: string | null;
  notation_evidence_basis: string | null;
  notation_derivation_method: string | null;
  notation_convention_id: string | null;
  notation_provenance_note: string | null;
  notation_authored_by: string | null;
  notation_authored_at: string | null;
  published_trick_slug: string | null;
  ev_state: string;
  final_disposition: string;
  version: number;
}

let db: BetterSqlite3.Database;
let publishedCandidateId = '';
let draftCandidateId = '';
let nativeSlug = '';

let pre: Snapshot;
let afterRefreshAttempt: Snapshot;
let refreshAttempt: ReturnType<typeof runLoader>;
let secondRefreshAttempt: ReturnType<typeof runLoader>;
let afterAdjudicationReseed: Snapshot;
let afterUnobstructedDictionaryLoad: Snapshot;

function open(): BetterSqlite3.Database {
  const conn = new BetterSqlite3(dbPath);
  conn.pragma('foreign_keys = ON');
  return conn;
}

function adjudication(conn: BetterSqlite3.Database, id: string): AdjudicationState | undefined {
  return conn.prepare(
    `SELECT authored_notation, notation_evidence_basis, notation_derivation_method,
            notation_convention_id, notation_provenance_note, notation_authored_by,
            notation_authored_at, published_trick_slug, ev_state, final_disposition, version
       FROM freestyle_ev_adjudications WHERE candidate_id = ?`,
  ).get(id) as AdjudicationState | undefined;
}

function snapshot(): Snapshot {
  const conn = open();
  try {
    const count = (sql: string, ...p: unknown[]): number =>
      (conn.prepare(sql).get(...p) as { n: number }).n;
    return {
      foreignKeysOn: conn.pragma('foreign_keys', { simple: true }) === 1,
      trickCount: count('SELECT COUNT(*) AS n FROM freestyle_tricks'),
      adjudicationCount: count('SELECT COUNT(*) AS n FROM freestyle_ev_adjudications'),
      nativeTrick: conn.prepare(
        `SELECT slug, canonical_name, adds, base_trick, trick_family, category,
                operational_notation, operational_notation_source,
                notation_evidence_basis, notation_derivation_method, review_status, is_active
           FROM freestyle_tricks WHERE slug = ?`,
      ).get(nativeSlug) as Record<string, unknown> | undefined,
      nativeAliasCount: count(
        'SELECT COUNT(*) AS n FROM freestyle_trick_aliases WHERE trick_slug = ?', nativeSlug),
      nativeModifierLinkCount: count(
        'SELECT COUNT(*) AS n FROM freestyle_trick_modifier_links WHERE trick_slug = ?', nativeSlug),
      published: adjudication(conn, publishedCandidateId),
      draft: adjudication(conn, draftCandidateId),
    };
  } finally {
    conn.close();
  }
}

beforeAll(async () => {
  // 1. Schema, then the committed-input load exactly as the rebuild runs it.
  const seed = createTestDb(dbPath);
  insertMember(seed, {
    id: ADMIN_ID, slug: 'refresh_admin', display_name: 'Refresh Admin',
    login_email: 'refresh-admin@example.com', is_admin: 1,
  });
  seed.close();

  DICTIONARY_LOADERS.forEach(runLoaderOrThrow);
  runLoaderOrThrow(ADJUDICATION_LOADER);

  // 2. Two rulings the funnel can act on. Chosen from the committed ledger by a
  //    deterministic query rather than by a hard-coded id, and required to fold
  //    to a name nothing already holds, so the fixture describes the state a
  //    curator reaches rather than one particular row.
  const picker = open();
  const candidates = picker.prepare(
    `SELECT a.candidate_id, a.submitted_name
       FROM freestyle_ev_adjudications a
      WHERE a.final_disposition = 'C'
        AND a.object_type = 'complete-trick'
        AND a.ev_state NOT IN ('doctrine', 'undefined_operator')
        AND a.blocker_id NOT LIKE 'Q%'
        AND a.blocker_id <> 'source-recovery'
        AND a.published_trick_slug IS NULL
        AND a.authored_notation IS NULL
      ORDER BY a.candidate_id`,
  ).all() as { candidate_id: string; submitted_name: string }[];

  const free = candidates.filter((c) => {
    const slug = c.submitted_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    const taken = picker.prepare('SELECT 1 FROM freestyle_tricks WHERE slug = ?').get(slug)
      ?? picker.prepare('SELECT 1 FROM freestyle_trick_aliases WHERE alias_slug = ?').get(slug);
    return !taken;
  });
  picker.close();

  if (free.length < 2) throw new Error('the committed ledger offers too few publishable rulings');
  publishedCandidateId = free[0]!.candidate_id;
  draftCandidateId     = free[1]!.candidate_id;
  nativeSlug = free[0]!.submitted_name
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

  // 3 and 4. Author and publish through the services, never by hand.
  await importApp();
  const { freestyleCurationService } = await import('../../src/services/freestyleCurationService');

  const authored = {
    notation: NOTATION,
    evidenceBasis: 'footage',
    derivationMethod: 'reconstruction',
    conventionId: '',
    provenanceNote: PROVENANCE_NOTE,
  };
  freestyleCurationService.saveAuthoredNotation(publishedCandidateId, authored, ADMIN_ID);
  // 5. A second ruling whose movement is written and whose trick is not created.
  freestyleCurationService.saveAuthoredNotation(draftCandidateId, authored, ADMIN_ID);

  const conn = open();
  const aBase = conn.prepare(
    "SELECT slug FROM freestyle_tricks WHERE is_active = 1 AND category = 'compound' LIMIT 1",
  ).get() as { slug: string };
  const aModifier = conn.prepare('SELECT slug FROM freestyle_trick_modifiers LIMIT 1')
    .get() as { slug: string };
  conn.close();

  const producedSlug = freestyleCurationService.publishCanonicalTrick(
    publishedCandidateId,
    {
      canonicalName: free[0]!.submitted_name.toLowerCase(),
      adds: '4',
      baseTrick: aBase.slug,
      category: 'compound',
      familyOverride: '',
      description: 'Created through the publication funnel, present in no committed input.',
      aliases: 'harness only nickname',
      sourceId: '', sourceUrl: '', sourceAssertedNotation: '',
      modifierLinks: aModifier.slug,
    },
    ADMIN_ID,
  );
  expect(producedSlug).toBe(nativeSlug);

  pre = snapshot();

  // 6. The ordinary refresh, against that same database.
  refreshAttempt = runLoader(DICTIONARY_LOADERS[0]!);
  afterRefreshAttempt = snapshot();

  // What the abort is hiding. The adjudication loader is unmodified and runs
  // exactly as the rebuild runs it; it touches no trick row, so nothing here
  // relaxes a constraint to let it through.
  runLoaderOrThrow(ADJUDICATION_LOADER);
  afterAdjudicationReseed = snapshot();

  // Reseeding does not clear the obstruction; it restores it. The ledger's own
  // rows link to committed trick slugs, so the refresh aborts again on the very
  // next attempt. Today the funnel's trick is therefore never actually deleted:
  // the constraint stops the run before the delete lands, and that accident is
  // the only thing protecting it.
  secondRefreshAttempt = runLoader(DICTIONARY_LOADERS[0]!);

  // Which is why the loss needs demonstrating deliberately. Emptying the ruling
  // table models the first repair anyone reaches for, clearing the dependants so
  // the reload can proceed. Nothing here disables a constraint: the delete is a
  // plain write that foreign keys permit, and it is exactly what a naive repair
  // would do. What follows is the cost of that choice.
  const naive = open();
  naive.prepare('DELETE FROM freestyle_ev_adjudications').run();
  naive.close();

  runLoaderOrThrow(DICTIONARY_LOADERS[0]!);
  afterUnobstructedDictionaryLoad = snapshot();

  db = open();
});

afterAll(() => {
  db?.close();
  cleanupTestDb(dbPath);
});

describe('the state a curator reaches through the funnel', () => {
  it('builds on the committed corpus, not on a toy fixture', () => {
    expect(pre.trickCount).toBeGreaterThan(900);
    expect(pre.adjudicationCount).toBeGreaterThan(800);
  });

  it('enforces foreign keys throughout', () => {
    expect(pre.foreignKeysOn).toBe(true);
  });

  it('holds a canonical trick that exists in no committed input', () => {
    expect(pre.nativeTrick).toBeDefined();
    expect(pre.nativeTrick!.adds).toBe('4');
    expect(pre.nativeTrick!.operational_notation).toBe(NOTATION);
    expect(pre.nativeTrick!.review_status).toBe('curated');
    expect(pre.nativeTrick!.is_active).toBe(1);
    expect(pre.nativeTrick!.notation_evidence_basis).toBe('footage');
    expect(pre.nativeTrick!.notation_derivation_method).toBe('reconstruction');
    expect(pre.nativeAliasCount).toBe(1);
    expect(pre.nativeModifierLinkCount).toBe(1);
  });

  it('holds a resolved ruling pointing at that trick', () => {
    expect(pre.published!.published_trick_slug).toBe(nativeSlug);
    expect(pre.published!.ev_state).toBe('canonical');
    expect(pre.published!.final_disposition).toBe('A');
    expect(pre.published!.authored_notation).toBe(NOTATION);
    expect(pre.published!.notation_evidence_basis).toBe('footage');
    expect(pre.published!.notation_derivation_method).toBe('reconstruction');
    expect(pre.published!.notation_provenance_note).toBe(PROVENANCE_NOTE);
    expect(pre.published!.notation_authored_by).toBe(ADMIN_ID);
    expect(pre.published!.notation_authored_at).toBeTruthy();
    expect(pre.published!.version).toBeGreaterThan(1);
  });

  it('holds an authored ruling whose trick was never created', () => {
    expect(pre.draft!.authored_notation).toBe(NOTATION);
    expect(pre.draft!.notation_provenance_note).toBe(PROVENANCE_NOTE);
    expect(pre.draft!.notation_authored_by).toBe(ADMIN_ID);
    expect(pre.draft!.published_trick_slug).toBeNull();
  });
});

describe('what an ordinary refresh does today', () => {
  it('aborts, and names the trick table it could not clear', () => {
    expect(refreshAttempt.status).not.toBe(0);
    // Pinned to the actual cause. An unrelated crash must not satisfy this.
    expect(refreshAttempt.stderr).toContain('FOREIGN KEY constraint failed');
    expect(refreshAttempt.stderr).toContain('DELETE FROM freestyle_tricks');
  });

  it('leaves every row where it was, because it never got past the delete', () => {
    expect(afterRefreshAttempt.trickCount).toBe(pre.trickCount);
    expect(afterRefreshAttempt.nativeTrick).toEqual(pre.nativeTrick);
    expect(afterRefreshAttempt.published).toEqual(pre.published);
    expect(afterRefreshAttempt.draft).toEqual(pre.draft);
  });
});

describe('what the abort is hiding', () => {
  it('loses authored notation and its provenance when the rulings are reseeded', () => {
    expect(afterAdjudicationReseed.draft).toBeDefined();
    expect(afterAdjudicationReseed.draft!.authored_notation).toBeNull();
    expect(afterAdjudicationReseed.draft!.notation_evidence_basis).toBeNull();
    expect(afterAdjudicationReseed.draft!.notation_derivation_method).toBeNull();
    expect(afterAdjudicationReseed.draft!.notation_provenance_note).toBeNull();
    expect(afterAdjudicationReseed.draft!.notation_authored_by).toBeNull();
    expect(afterAdjudicationReseed.draft!.notation_authored_at).toBeNull();
  });

  it('loses the publication link and the resolution it recorded', () => {
    expect(afterAdjudicationReseed.published!.published_trick_slug).toBeNull();
    expect(afterAdjudicationReseed.published!.ev_state).not.toBe('canonical');
    expect(afterAdjudicationReseed.published!.final_disposition).toBe('C');
    expect(afterAdjudicationReseed.published!.version).toBe(1);
  });

  it('still aborts on the next attempt, because the reseed restores the links', () => {
    // The obstruction is not cleared by reseeding, it is recreated: the ledger's
    // own rows point at committed trick slugs. So the refresh cannot be fixed by
    // running it twice, and the funnel's trick is never actually deleted today.
    expect(secondRefreshAttempt.status).not.toBe(0);
    expect(secondRefreshAttempt.stderr).toContain('FOREIGN KEY constraint failed');
  });

  it('deletes the funnel-created trick once the rulings are cleared out of the way', () => {
    // The hazard behind the crash. Clearing the dependants is the obvious way to
    // make the reload proceed, and it takes the funnel's trick with it: the row
    // is in no committed input, so the reload has nothing to recreate it from.
    expect(afterUnobstructedDictionaryLoad.nativeTrick).toBeUndefined();
    expect(afterUnobstructedDictionaryLoad.nativeAliasCount).toBe(0);
    expect(afterUnobstructedDictionaryLoad.nativeModifierLinkCount).toBe(0);
  });

  it('keeps foreign keys enabled while losing all of it', () => {
    // Nothing here relaxed a constraint. The losses come from loaders behaving
    // exactly as written, which is why a constraint cannot be the whole defence.
    expect(afterAdjudicationReseed.foreignKeysOn).toBe(true);
    expect(afterUnobstructedDictionaryLoad.foreignKeysOn).toBe(true);
  });
});

describe('what a repaired refresh will have to hold', () => {
  // These are the acceptance conditions for the repair, stated once, here, so
  // the slice that changes loader behaviour is measured against them rather
  // than against its own new tests. They read the recorded snapshots, so they
  // describe the contract without asserting today's broken outcome twice.
  it('names the three losses a refresh must never cause', () => {
    const losses = {
      authoredNotation: afterAdjudicationReseed.draft!.authored_notation === null,
      publicationLink:  afterAdjudicationReseed.published!.published_trick_slug === null,
      nativeTrick:      afterUnobstructedDictionaryLoad.nativeTrick === undefined,
    };
    // Every one of these is true today. A repair flips all three to false, and
    // this test is what fails if it flips only some of them.
    expect(losses).toEqual({
      authoredNotation: true,
      publicationLink:  true,
      nativeTrick:      true,
    });
  });
});
