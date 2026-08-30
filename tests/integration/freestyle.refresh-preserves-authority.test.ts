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
 * services, then runs the whole refresh against it and requires everything a
 * curator wrote to still be there afterwards. It began as a measurement of what
 * the refresh destroyed; each stage that stopped destroying flipped its
 * assertions, and the ruling seed was the last of them.
 *
 * The loaders run in the sequence the freestyle rebuild uses, ruling seed
 * included. A smaller reproduction would not do: every failure it caught was a
 * property of that order, and the seed runs last precisely because its rows point
 * at trick rows the dictionary loaders create.
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
// The dictionary loader appears twice: its tricks first, its aliases after the
// expert overlay has established the rows and names they resolve against, and
// before the footbag.org intake, which reads the alias table to decide what to
// create.
const DICTIONARY_LOADERS: readonly (readonly [string, string[]])[] = [
  ['16_preflight_trick_ownership.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'tricks']],
  ['19_load_red_additions.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'aliases']],
  ['20_link_footbag_org_sources.py', []],
  ['21_load_footbag_org_pending_tricks.py', []],
  ['21a_load_alias_additions.py', []],
  ['21b_apply_alias_overrides.py', []],
  ['21c_retire_stale_tricks.py', []],
];
const ADJUDICATION_LOADER: readonly [string, string[]] = ['28_load_ev_adjudications.py', []];

/** The whole thing, in the rebuild's order. Nothing is held back any more. */
const FULL_REFRESH: readonly (readonly [string, string[]])[] =
  [...DICTIONARY_LOADERS, ADJUDICATION_LOADER];

function runLoader([name, args]: readonly [string, string[]]) {
  return spawnSync('python3', [`freestyle/loaders/${name}`, '--db', dbPath, ...args], {
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
}

function runLoaderOrThrow(stage: readonly [string, string[]]): void {
  const r = runLoader(stage);
  if (r.status !== 0) {
    throw new Error(`loader ${stage[0]} ${stage[1].join(' ')} failed (${r.status}): `
      + `${r.stderr ?? ''}`);
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
let refreshResults: readonly (readonly [string, ReturnType<typeof runLoader>])[];
let afterRefresh: Snapshot;
let afterRepeatedRefresh: Snapshot;

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
                notation_evidence_basis, notation_derivation_method, review_status, is_active,
                trick_origin_producer
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

  // 6. The ordinary refresh, against that same database: the whole committed
  //    sequence, preflight through retirement AND the ruling seed, exactly as
  //    the rebuild runs it. Nothing is held back now.
  refreshResults = FULL_REFRESH.map(
    (stage) => [`${stage[0]} ${stage[1].join(' ')}`.trim(), runLoader(stage)] as const);
  afterRefresh = snapshot();

  // Twice more, to show the refresh is repeatable rather than merely surviving
  // once.
  FULL_REFRESH.forEach(runLoaderOrThrow);
  FULL_REFRESH.forEach(runLoaderOrThrow);
  afterRepeatedRefresh = snapshot();

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

describe('an ordinary refresh completes', () => {
  it('runs every stage of the committed sequence without aborting', () => {
    const failed = refreshResults
      .filter(([, r]) => r.status !== 0)
      .map(([name, r]) => `${name}: ${r.stderr?.trim() ?? ''}`);
    expect(failed).toEqual([]);
  });

  it('never clears the trick table on the way through', () => {
    // The specific failure this replaced. Its absence is the repair, so it is
    // asserted rather than left to be inferred from the run succeeding.
    const combined = refreshResults.map(([, r]) => `${r.stdout ?? ''}${r.stderr ?? ''}`).join('');
    expect(combined).not.toContain('FOREIGN KEY constraint failed');
    expect(combined).not.toContain('DELETE FROM freestyle_tricks');
  });

  it('keeps foreign keys enabled throughout', () => {
    expect(afterRefresh.foreignKeysOn).toBe(true);
    expect(afterRepeatedRefresh.foreignKeysOn).toBe(true);
  });

  it('is repeatable, not merely survivable once', () => {
    expect(afterRepeatedRefresh.trickCount).toBe(afterRefresh.trickCount);
    expect(afterRepeatedRefresh.nativeTrick).toEqual(afterRefresh.nativeTrick);
    expect(afterRepeatedRefresh.published).toEqual(afterRefresh.published);
    expect(afterRepeatedRefresh.draft).toEqual(afterRefresh.draft);
  });

  it('still reaches the committed dictionary content it should', () => {
    expect(afterRefresh.trickCount).toBe(pre.trickCount);
    expect(afterRefresh.adjudicationCount).toBe(pre.adjudicationCount);
  });
});

describe('what the refresh no longer destroys', () => {
  it('leaves an authored but unpublished ruling exactly as the curator left it', () => {
    expect(afterRefresh.draft).toEqual(pre.draft);
    expect(afterRefresh.draft!.authored_notation).toBe(NOTATION);
    expect(afterRefresh.draft!.notation_evidence_basis).toBe('footage');
    expect(afterRefresh.draft!.notation_derivation_method).toBe('reconstruction');
    expect(afterRefresh.draft!.notation_provenance_note).toBe(PROVENANCE_NOTE);
    expect(afterRefresh.draft!.notation_authored_by).toBe(ADMIN_ID);
    expect(afterRefresh.draft!.notation_authored_at).toBe(pre.draft!.notation_authored_at);
  });

  it('leaves a resolved ruling and the trick it points at', () => {
    expect(afterRefresh.published).toEqual(pre.published);
    expect(afterRefresh.published!.published_trick_slug).toBe(nativeSlug);
    expect(afterRefresh.published!.ev_state).toBe('canonical');
    expect(afterRefresh.published!.final_disposition).toBe('A');
  });

  it('leaves the curator-created trick, which no committed input carries', () => {
    expect(afterRefresh.nativeTrick).toEqual(pre.nativeTrick);
    expect(afterRefresh.nativeTrick!.trick_origin_producer).toBe('curator-publication');
  });

  it('leaves that trick its notation provenance', () => {
    expect(afterRefresh.nativeTrick!.operational_notation).toBe(NOTATION);
    expect(afterRefresh.nativeTrick!.notation_evidence_basis).toBe('footage');
    expect(afterRefresh.nativeTrick!.notation_derivation_method).toBe('reconstruction');
  });

  it('leaves its aliases and modifier links attached', () => {
    expect(afterRefresh.nativeAliasCount).toBe(pre.nativeAliasCount);
    expect(afterRefresh.nativeModifierLinkCount).toBe(pre.nativeModifierLinkCount);
  });
});

describe('the ruling seed tops up rather than rebuilding', () => {
  // It was the last stage that treated this table as derived. It now inserts the
  // historical rulings a database is missing and verifies the ones it has, so a
  // curator's work outlives a refresh instead of being replaced by the ledger it
  // was seeded from.
  it('keeps every ruling the ledger carries', () => {
    expect(afterRefresh.adjudicationCount).toBe(pre.adjudicationCount);
  });

  it('re-seeds a historical ruling that has gone missing, at its own place', () => {
    const conn = open();
    try {
      const before = conn.prepare(
        'SELECT candidate_id, sequence_no FROM freestyle_ev_adjudications'
        + " WHERE published_trick_slug IS NULL AND version = 1 ORDER BY sequence_no LIMIT 1",
      ).get() as { candidate_id: string; sequence_no: number };
      conn.prepare('DELETE FROM freestyle_ev_adjudications WHERE candidate_id = ?')
        .run(before.candidate_id);
      runLoaderOrThrow(ADJUDICATION_LOADER);
      const after = conn.prepare(
        'SELECT sequence_no, version FROM freestyle_ev_adjudications WHERE candidate_id = ?',
      ).get(before.candidate_id) as { sequence_no: number; version: number };
      // Its own ordinal, not one past the end: the number is the ledger position.
      expect(after.sequence_no).toBe(before.sequence_no);
      expect(after.version).toBe(1);
    } finally {
      conn.close();
    }
  });

  it('refuses when a historical fact has changed underneath it', () => {
    const conn = open();
    try {
      const victim = conn.prepare(
        'SELECT candidate_id, owner FROM freestyle_ev_adjudications'
        + ' WHERE version = 1 ORDER BY sequence_no LIMIT 1',
      ).get() as { candidate_id: string; owner: string };
      conn.prepare('UPDATE freestyle_ev_adjudications SET owner = ? WHERE candidate_id = ?')
        .run('somebody-else', victim.candidate_id);

      const refused = runLoader(ADJUDICATION_LOADER);
      expect(refused.status).not.toBe(0);
      expect(refused.stderr).toContain(victim.candidate_id);
      expect(refused.stderr).toContain('owner');
      expect(refused.stderr).toContain('somebody-else');
      expect(refused.stderr).toContain('Nothing was written');

      conn.prepare('UPDATE freestyle_ev_adjudications SET owner = ? WHERE candidate_id = ?')
        .run(victim.owner, victim.candidate_id);
      runLoaderOrThrow(ADJUDICATION_LOADER);
    } finally {
      conn.close();
    }
  });
});
