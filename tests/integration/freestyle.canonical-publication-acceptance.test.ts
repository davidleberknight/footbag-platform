/**
 * Can the curation funnel produce what the retired promotion pipeline produced?
 *
 * Ten tricks were promoted in one historical change by editing committed CSVs and
 * re-running loaders. That route is retired: a canonical trick is now created by a
 * curator through the application, from a ruling, in one transaction. This is the
 * acceptance test for that claim, and it publishes all ten the new way.
 *
 * Nothing here edits a committed input, runs a retired loader as authority, writes
 * a trick by hand, invents a provenance, or leaves a trick half-published. The
 * dictionary is built from the committed inputs first, the ten are removed from
 * it, and then the funnel puts them back using the same rulings that are actually
 * in the ledger.
 *
 * Two differences from the historical rows are intended rather than tolerated. The
 * funnel creates a trick as `curated`, because publication is a curator's act and
 * expert review is a later, separate one; the historical rows read
 * `expert_reviewed` because that is what the CSV said. And no derived parse is
 * expected, because a parse is produced by the content pipeline and a newly
 * published trick simply has none yet.
 *
 * The four built on the reverse swirl land in the reverse-swirl family, which is
 * the corrected doctrine. The historical rows carry an override to the swirl
 * family that has since been superseded; reproducing it here would be recreating
 * a data error rather than testing publication.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { spawnSync } from 'node:child_process';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4143');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000slicec';

/** The committed sequence, in the rebuild's order. */
const REFRESH: readonly (readonly [string, string[]])[] = [
  ['16_preflight_trick_ownership.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'tricks']],
  ['19_load_red_additions.py', []],
  ['17_load_trick_dictionary.py', ['--stage', 'aliases']],
  ['20_link_footbag_org_sources.py', []],
  ['21_load_footbag_org_pending_tricks.py', []],
  ['21a_load_alias_additions.py', []],
  ['21b_apply_alias_overrides.py', []],
  ['21c_retire_stale_tricks.py', []],
  ['28_load_ev_adjudications.py', []],
];

const SWIRL_CHAIN = 'swirl-chain-terminal-replacement';
const EXPERT_SOURCE = 'red-husted-2026-04-20';

interface Case {
  /** The ruling's name in the committed ledger, and the name published. */
  name: string;
  slug: string;
  adds: string;
  base: string;
  /** What the base-slug rule should produce with no override. */
  family: string;
  notation: string;
  evidenceBasis: string;
  derivationMethod: string;
  conventionId: string;
  aliases: string;
  aliasSlugs: string[];
  modifierLinks: string;
  modifierSlugs: string[];
  sourceId: string;
}

/** The exact ten, with the shape the funnel has to reproduce. */
const TEN: readonly Case[] = [
  // Eight swirl-chain compounds. Their notation was derived under the ratified
  // convention, which is what the provenance records; none rests on an outside
  // source, so none links to one.
  {
    name: 'Drifter Swirl', slug: 'drifter_swirl', adds: '4', base: 'swirl', family: 'swirl',
    notation: 'SET > OP IN [DEX] > SAME OUT [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  {
    name: 'Nemesis Swirl', slug: 'nemesis_swirl', adds: '7', base: 'swirl', family: 'swirl',
    notation: 'CLIP > OP IN [DEX] > SAME IN [DEX] > OP OUT [DEX] > SAME OUT [DEX] '
      + '> OP OUT [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  {
    name: 'Ripwalk Swirl', slug: 'ripwalk_swirl', adds: '5', base: 'swirl', family: 'swirl',
    notation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  {
    name: 'Sidewalk Swirl', slug: 'sidewalk_swirl', adds: '5', base: 'swirl', family: 'swirl',
    notation: 'CLIP > OP IN [DEX] >> SAME OUT [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  // The four built on the reverse swirl. The base-slug rule puts them in the
  // reverse-swirl family with no override, which is the corrected doctrine.
  {
    name: 'Butterfly Reverse Swirl', slug: 'butterfly_reverse_swirl', adds: '4',
    base: 'rev_swirl', family: 'rev_swirl',
    notation: 'SET > OP OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  {
    name: 'Barfly Reverse Swirl', slug: 'barfly_reverse_swirl', adds: '5',
    base: 'rev_swirl', family: 'rev_swirl',
    notation: 'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  {
    name: 'Paradon Reverse Swirl', slug: 'paradon_reverse_swirl', adds: '5',
    base: 'rev_swirl', family: 'rev_swirl',
    notation: 'TOE > OP OUT [DEX] > OP OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  {
    name: 'Stepping Butterfly Reverse Swirl', slug: 'stepping_butterfly_reverse_swirl',
    adds: '5', base: 'rev_swirl', family: 'rev_swirl',
    notation: 'CLIP > OP IN [DEX] >> OP OUT [DEX] > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
    evidenceBasis: 'platform-structure', derivationMethod: 'convention-derivation',
    conventionId: SWIRL_CHAIN, aliases: '', aliasSlugs: [], modifierLinks: '',
    modifierSlugs: [], sourceId: '',
  },
  // Two flapper compounds. Their notation rests on what a source described in
  // prose, so each links to the source it rests on.
  {
    name: 'Butterfly Flapper', slug: 'butterfly_flapper', adds: '4',
    base: 'cross_body_sole_stall', family: 'cross_body_sole_stall',
    notation: 'SET >> OP OUT [DEX] > OP SOLE [XBD] [UNS] [DEL]',
    evidenceBasis: 'source-prose', derivationMethod: 'reconstruction', conventionId: '',
    aliases: 'Buttersole|Sole Train', aliasSlugs: ['buttersole', 'sole_train'],
    modifierLinks: '', modifierSlugs: [], sourceId: EXPERT_SOURCE,
  },
  {
    name: 'Symposium Whirling Flapper', slug: 'symposium_whirling_flapper', adds: '5',
    base: 'cross_body_sole_stall', family: 'cross_body_sole_stall',
    notation: 'CLIP >> (no plant while) OP FRONT WHIRL [DEX] [BOD] >> OP SOLE [XBD] [UNS] [DEL]',
    evidenceBasis: 'source-prose', derivationMethod: 'reconstruction', conventionId: '',
    aliases: 'Singularity', aliasSlugs: ['singularity'],
    modifierLinks: 'symposium|whirling', modifierSlugs: ['symposium', 'whirling'],
    sourceId: EXPERT_SOURCE,
  },
];

function tryLoader([name, args]: readonly [string, string[]]) {
  return spawnSync('python3', [`freestyle/loaders/${name}`, '--db', dbPath, ...args],
    { encoding: 'utf8', ...SPAWN_GUARD });
}

function runLoader(stage: readonly [string, string[]]) {
  const r = tryLoader(stage);
  if (r.status !== 0) {
    throw new Error(`loader ${stage[0]} ${stage[1].join(' ')} failed: ${r.stderr ?? ''}`);
  }
  return r;
}

/** Run the whole sequence, stopping at the first stage that refuses. */
function attemptRefresh(): { name: string; status: number | null; stderr: string }[] {
  const out: { name: string; status: number | null; stderr: string }[] = [];
  for (const stage of REFRESH) {
    const r = tryLoader(stage);
    out.push({ name: stage[0], status: r.status, stderr: r.stderr ?? '' });
    if (r.status !== 0) break;
  }
  return out;
}

function open(): BetterSqlite3.Database {
  const conn = new BetterSqlite3(dbPath);
  conn.pragma('foreign_keys = ON');
  return conn;
}

let db: BetterSqlite3.Database;
/** The ruling each case was published from, and the slug the funnel produced. */
const published = new Map<string, { candidateId: string; slug: string }>();
let historicalRows: Record<string, unknown>[] = [];

/** The post-cutover case: a trick no committed input has ever carried. */
const NOVEL = {
  candidateId: '', slug: '', name: '',
  notation: 'CLIP > OP IN [DEX] > OP OUT [DEX] > SAME CLIP [XBD] [DEL]',
  adds: '4', aliasSlug: 'a_novel_nickname', modifierSlug: 'symposium',
};
let novelRefreshResults: { name: string; status: number | null; stderr: string }[] = [];
let novelAfterFirst: Record<string, unknown> = {};
let novelAfterSecond: Record<string, unknown> = {};

/** The refusal the committed inputs give once the historical ten are curator-owned. */
let historicalRefusal: { status: number | null; stderr: string } = { status: 0, stderr: '' };
let beforeHistoricalRefresh: Record<string, unknown> = {};
let afterHistoricalRefresh: Record<string, unknown> = {};

function trickRow(conn: BetterSqlite3.Database, slug: string) {
  return conn.prepare(
    `SELECT slug, canonical_name, adds, base_trick, trick_family, category, description,
            aliases_json, notation, operational_notation, operational_notation_source,
            notation_evidence_basis, notation_derivation_method, notation_convention_id,
            review_status, is_active, is_core, structural_parse_json, computed_adds,
            trick_origin_producer
       FROM freestyle_tricks WHERE slug = ?`,
  ).get(slug) as Record<string, unknown> | undefined;
}

beforeAll(async () => {
  const seed = createTestDb(dbPath);
  insertMember(seed, {
    id: ADMIN_ID, slug: 'acceptance_admin', display_name: 'Acceptance Admin',
    login_email: 'acceptance-admin@example.com', is_admin: 1,
  });
  seed.close();

  // A real dictionary and the real ruling ledger, from the committed inputs.
  REFRESH.forEach(runLoader);

  await importApp();
  const { freestyleCurationService } = await import('../../src/services/freestyleCurationService');

  // ── The post-cutover case, first, while the dictionary is untouched ───────
  //
  // A ruling whose name no committed input carries: the dictionary is built from
  // those inputs, so a name absent from it is a name they do not ask for. This is
  // the trick the funnel exists to create, and the one a refresh must preserve.
  {
    const picker = open();
    const candidates = picker.prepare(
      `SELECT candidate_id, submitted_name FROM freestyle_ev_adjudications
        WHERE final_disposition = 'C' AND object_type = 'complete-trick'
          AND ev_state NOT IN ('doctrine', 'undefined_operator')
          AND blocker_id NOT LIKE 'Q%' AND blocker_id <> 'source-recovery'
          AND published_trick_slug IS NULL AND authored_notation IS NULL
        ORDER BY candidate_id`,
    ).all() as { candidate_id: string; submitted_name: string }[];
    const free = candidates.find((c) => {
      const slug = c.submitted_name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      return slug
        && !picker.prepare('SELECT 1 FROM freestyle_tricks WHERE slug = ?').get(slug)
        && !picker.prepare('SELECT 1 FROM freestyle_trick_aliases WHERE alias_slug = ?').get(slug);
    });
    picker.close();
    if (!free) throw new Error('no publishable ruling names a trick the inputs do not carry');
    NOVEL.candidateId = free.candidate_id;
    NOVEL.name = free.submitted_name.toLowerCase();
    NOVEL.slug = NOVEL.name.replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');

    freestyleCurationService.saveAuthoredNotation(NOVEL.candidateId, {
      notation: NOVEL.notation, evidenceBasis: 'footage',
      derivationMethod: 'reconstruction', conventionId: '',
      provenanceNote: 'Read off a record video frame by frame.',
    }, ADMIN_ID);
    freestyleCurationService.publishCanonicalTrick(NOVEL.candidateId, {
      canonicalName: NOVEL.name, adds: NOVEL.adds, baseTrick: 'swirl',
      category: 'compound', familyOverride: '', description: '',
      aliases: 'a novel nickname', sourceId: '', sourceUrl: '',
      sourceAssertedNotation: '', modifierLinks: NOVEL.modifierSlug,
    }, ADMIN_ID);
  }

  const novelState = () => {
    const conn = open();
    try {
      return {
        trick: trickRow(conn, NOVEL.slug),
        alias: conn.prepare('SELECT alias_slug, trick_slug FROM freestyle_trick_aliases'
          + ' WHERE alias_slug = ?').get(NOVEL.aliasSlug),
        modifier: conn.prepare('SELECT modifier_slug, apply_order FROM'
          + ' freestyle_trick_modifier_links WHERE trick_slug = ?').get(NOVEL.slug),
        ruling: conn.prepare('SELECT published_trick_slug, ev_state, authored_notation,'
          + ' notation_authored_by, version FROM freestyle_ev_adjudications'
          + ' WHERE candidate_id = ?').get(NOVEL.candidateId),
      } as Record<string, unknown>;
    } finally {
      conn.close();
    }
  };

  const novelBefore = novelState();
  novelRefreshResults = attemptRefresh();
  novelAfterFirst = novelState();
  if (novelRefreshResults.every((r) => r.status === 0)) {
    REFRESH.forEach(runLoader);
  }
  novelAfterSecond = novelState();
  expect(novelBefore).toEqual(novelAfterFirst);

  // ── The historical ten ────────────────────────────────────────────────────
  const conn = open();
  historicalRows = TEN.map((c) => trickRow(conn, c.slug)!)
    .filter(Boolean) as Record<string, unknown>[];

  // Remove the ten so the funnel has to create them. This is fixture setup, not
  // part of the path under test: what is being proved is that publication can
  // produce them, so they must not already be there.
  const slugs = TEN.map((c) => c.slug);
  const marks = slugs.map(() => '?').join(',');
  conn.exec('BEGIN');
  conn.prepare(`DELETE FROM freestyle_trick_aliases WHERE trick_slug IN (${marks})`).run(...slugs);
  conn.prepare(`DELETE FROM freestyle_trick_modifier_links WHERE trick_slug IN (${marks})`).run(...slugs);
  conn.prepare(`DELETE FROM freestyle_trick_source_links WHERE trick_slug IN (${marks})`).run(...slugs);
  conn.prepare(`DELETE FROM freestyle_trick_relations WHERE from_trick_slug IN (${marks})`).run(...slugs);
  conn.prepare(`DELETE FROM freestyle_trick_relations WHERE to_trick_slug IN (${marks})`).run(...slugs);
  conn.prepare(`DELETE FROM freestyle_tricks WHERE slug IN (${marks})`).run(...slugs);
  conn.exec('COMMIT');

  const rulingIdFor = conn.prepare(
    'SELECT candidate_id FROM freestyle_ev_adjudications WHERE submitted_name = ?');
  const ids = new Map<string, string>(
    TEN.map((c) => [c.name, (rulingIdFor.get(c.name) as { candidate_id: string }).candidate_id]));
  conn.close();

  for (const c of TEN) {
    const candidateId = ids.get(c.name)!;
    // The curator writes the movement onto the ruling, then publishes it. Two
    // application calls, no other writes.
    freestyleCurationService.saveAuthoredNotation(candidateId, {
      notation: c.notation,
      evidenceBasis: c.evidenceBasis,
      derivationMethod: c.derivationMethod,
      conventionId: c.conventionId,
      provenanceNote: c.conventionId
        ? 'Derived by appending the swirl to the base and replacing its terminal clip.'
        : 'Reconstructed from the source description of the movement.',
    }, ADMIN_ID);

    const slug = freestyleCurationService.publishCanonicalTrick(candidateId, {
      canonicalName: c.name.toLowerCase(),
      adds: c.adds,
      baseTrick: c.base,
      category: 'compound',
      familyOverride: '',
      description: '',
      aliases: c.aliases,
      sourceId: c.sourceId,
      sourceUrl: '',
      sourceAssertedNotation: '',
      modifierLinks: c.modifierLinks,
    }, ADMIN_ID);
    published.set(c.slug, { candidateId, slug });
  }

  // The ordinary refresh, now that ten slugs the committed inputs still carry are
  // held by a curator. It must refuse rather than take them back.
  const tenState = () => {
    const conn2 = open();
    try {
      return {
        tricks: TEN.map((c) => trickRow(conn2, c.slug)),
        aliases: conn2.prepare('SELECT alias_slug, trick_slug, alias_type, alias_display'
          + ' FROM freestyle_trick_aliases WHERE trick_slug IN'
          + " (SELECT slug FROM freestyle_tricks WHERE trick_origin_producer ="
          + " 'curator-publication') ORDER BY alias_slug").all(),
        modifiers: conn2.prepare('SELECT trick_slug, modifier_slug, apply_order FROM'
          + ' freestyle_trick_modifier_links WHERE trick_slug IN'
          + " (SELECT slug FROM freestyle_tricks WHERE trick_origin_producer ="
          + " 'curator-publication') ORDER BY trick_slug, apply_order").all(),
        sources: conn2.prepare('SELECT trick_slug, source_id FROM'
          + ' freestyle_trick_source_links WHERE trick_slug IN'
          + " (SELECT slug FROM freestyle_tricks WHERE trick_origin_producer ="
          + " 'curator-publication') ORDER BY trick_slug").all(),
        rulings: [...published.values()].map(({ candidateId }) => conn2.prepare(
          'SELECT candidate_id, published_trick_slug, ev_state, final_disposition,'
          + ' authored_notation, version FROM freestyle_ev_adjudications'
          + ' WHERE candidate_id = ?').get(candidateId)),
      } as Record<string, unknown>;
    } finally {
      conn2.close();
    }
  };

  beforeHistoricalRefresh = tenState();
  const attempt = attemptRefresh();
  const refused = attempt.find((r) => r.status !== 0);
  historicalRefusal = refused ?? { status: 0, stderr: '' };
  afterHistoricalRefresh = tenState();

  db = open();
});

afterAll(() => {
  db?.close();
  cleanupTestDb(dbPath);
});

describe('the funnel reproduces the ten promotions', () => {
  it('had ten historical rows to reproduce', () => {
    expect(historicalRows).toHaveLength(10);
  });

  it.each(TEN.map((c) => [c.slug, c] as const))(
    '%s is published with the fields publication owns', (_slug, c) => {
      const produced = published.get(c.slug);
      expect(produced?.slug).toBe(c.slug);

      const row = trickRow(db, c.slug)!;
      expect(row.canonical_name).toBe(c.name.toLowerCase());
      expect(row.adds).toBe(c.adds);
      expect(row.base_trick).toBe(c.base);
      expect(row.trick_family).toBe(c.family);
      expect(row.category).toBe('compound');
      // The execution notation is the movement the curator authored, carried
      // across unchanged.
      expect(row.operational_notation).toBe(c.notation);
      expect(row.notation_evidence_basis).toBe(c.evidenceBasis);
      expect(row.notation_derivation_method).toBe(c.derivationMethod);
      expect(row.notation_convention_id).toBe(c.conventionId || null);
      expect(row.operational_notation_source).toBeTruthy();
      expect(row.is_active).toBe(1);
      expect(row.review_status).toBe('curated');
      expect(row.is_core).toBe(0);
      expect(row.aliases_json).toBe('[]');
      expect(row.trick_origin_producer).toBe('curator-publication');
      // Owned by the content pipeline, not by publication.
      expect(row.notation).toBeNull();
      expect(row.structural_parse_json).toBeNull();
      expect(row.computed_adds).toBeNull();
    });

  it.each(TEN.map((c) => [c.slug, c] as const))(
    '%s carries the attachments the publication supplied', (_slug, c) => {
      const aliases = db.prepare(
        'SELECT alias_slug FROM freestyle_trick_aliases WHERE trick_slug = ? ORDER BY alias_slug',
      ).all(c.slug).map((r) => (r as { alias_slug: string }).alias_slug);
      expect(aliases).toEqual([...c.aliasSlugs].sort());

      const modifiers = db.prepare(
        'SELECT modifier_slug FROM freestyle_trick_modifier_links WHERE trick_slug = ?'
        + ' ORDER BY apply_order',
      ).all(c.slug).map((r) => (r as { modifier_slug: string }).modifier_slug);
      expect(modifiers).toEqual(c.modifierSlugs);

      const sources = db.prepare(
        'SELECT source_id FROM freestyle_trick_source_links WHERE trick_slug = ?',
      ).all(c.slug).map((r) => (r as { source_id: string }).source_id);
      expect(sources).toEqual(c.sourceId ? [c.sourceId] : []);
    });

  it.each(TEN.map((c) => [c.slug, c] as const))(
    '%s resolved the ruling it was published from', (_slug, c) => {
      const { candidateId } = published.get(c.slug)!;
      const ruling = db.prepare(
        `SELECT published_trick_slug, ev_state, final_disposition, match_type,
                authored_notation, notation_evidence_basis, notation_authored_by, version
           FROM freestyle_ev_adjudications WHERE candidate_id = ?`,
      ).get(candidateId) as Record<string, unknown>;
      expect(ruling.published_trick_slug).toBe(c.slug);
      expect(ruling.ev_state).toBe('canonical');
      expect(ruling.final_disposition).toBe('A');
      expect(ruling.match_type).toBe('promoted-canonical');
      // The movement stays on the ruling as well as on the trick.
      expect(ruling.authored_notation).toBe(c.notation);
      expect(ruling.notation_evidence_basis).toBe(c.evidenceBasis);
      expect(ruling.notation_authored_by).toBe(ADMIN_ID);
    });

  it('wrote one audit entry per publication, and no more', () => {
    const rows = db.prepare(
      "SELECT entity_id, COUNT(*) AS n FROM audit_entries"
      + " WHERE action_type = 'freestyle.trick.published' GROUP BY entity_id",
    ).all() as { entity_id: string; n: number }[];
    expect(rows.every((r) => r.n === 1)).toBe(true);
    // The ten, plus the post-cutover trick published alongside them.
    expect(rows.map((r) => r.entity_id).sort())
      .toEqual([...TEN.map((c) => c.slug), NOVEL.slug].sort());
  });
});

describe('the four built on the reverse swirl', () => {
  const revSwirl = TEN.filter((c) => c.base === 'rev_swirl');

  it('are the four the historical promotion carried', () => {
    expect(revSwirl.map((c) => c.slug)).toEqual([
      'butterfly_reverse_swirl', 'barfly_reverse_swirl',
      'paradon_reverse_swirl', 'stepping_butterfly_reverse_swirl',
    ]);
  });

  it('land in the reverse-swirl family with no override', () => {
    for (const c of revSwirl) {
      expect(trickRow(db, c.slug)!.trick_family).toBe('rev_swirl');
    }
  });

  it('does not include atomic reverse swirl, which was promoted separately', () => {
    expect(TEN.map((c) => c.slug)).not.toContain('atomic_reverse_swirl');
  });
});

describe('what publication deliberately does not reproduce', () => {
  it('creates a curated trick, not an expert-reviewed one', () => {
    // The historical rows read expert_reviewed because the committed file said
    // so. Publication is a curator's act; expert review is a later, separate one.
    for (const c of TEN) {
      expect(trickRow(db, c.slug)!.review_status).toBe('curated');
    }
    expect(historicalRows.some((r) => r.review_status === 'expert_reviewed')).toBe(true);
  });

  it('leaves the derived parse absent', () => {
    for (const c of TEN) {
      expect(trickRow(db, c.slug)!.structural_parse_json).toBeNull();
    }
  });
});

describe('a refresh will not take the historical ten back', () => {
  // The committed inputs still carry these ten, because the promotion route that
  // put them there ran before the funnel existed. Once a curator owns those
  // slugs, an ordinary refresh stops rather than reclaiming them. That is the
  // conflict guard working, not a limit on what the funnel can do: publication
  // itself succeeded for all ten above.
  it('refuses the refresh at the ownership preflight', () => {
    expect(historicalRefusal.status).not.toBe(0);
    expect(historicalRefusal.stderr).toContain('not entitled to claim');
    expect(historicalRefusal.stderr).toContain('Nothing was changed');
  });

  it('names every one of the ten, with who holds it and who wanted it', () => {
    for (const c of TEN) {
      expect(historicalRefusal.stderr).toContain(
        `${c.slug}: held by curator-publication; expert-additions wants to claim it`);
    }
  });

  it('changes nothing at all, partially or otherwise', () => {
    expect(afterHistoricalRefresh).toEqual(beforeHistoricalRefresh);
  });

  it('leaves the ten tricks, their rulings and their attachments as published', () => {
    for (const c of TEN) {
      const row = trickRow(db, c.slug)!;
      expect(row.trick_origin_producer).toBe('curator-publication');
      expect(row.trick_family).toBe(c.family);
      expect(row.operational_notation).toBe(c.notation);
      const ruling = db.prepare(
        'SELECT published_trick_slug FROM freestyle_ev_adjudications WHERE candidate_id = ?',
      ).get(published.get(c.slug)!.candidateId) as { published_trick_slug: string };
      expect(ruling.published_trick_slug).toBe(c.slug);
    }
  });

  it('violates no foreign key', () => {
    expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});

describe('a trick the committed inputs never carried survives a refresh', () => {
  // The case the funnel is actually for: a name no input asks for, published by a
  // curator, then refreshed. This is the post-cutover lifecycle.
  it('was published from a real ruling naming a slug no input carries', () => {
    expect(NOVEL.candidateId).toBeTruthy();
    expect(NOVEL.slug).toBeTruthy();
    expect(TEN.map((c) => c.slug)).not.toContain(NOVEL.slug);
  });

  it('completes the whole refresh without refusing', () => {
    const failed = novelRefreshResults.filter((r) => r.status !== 0);
    expect(failed.map((r) => `${r.name}: ${r.stderr.trim()}`)).toEqual([]);
    expect(novelRefreshResults).toHaveLength(REFRESH.length);
  });

  it('keeps the trick, its ownership, its ruling and its attachments', () => {
    const trick = novelAfterFirst.trick as Record<string, unknown>;
    expect(trick).toBeDefined();
    expect(trick.trick_origin_producer).toBe('curator-publication');
    expect(trick.operational_notation).toBe(NOVEL.notation);
    expect(trick.review_status).toBe('curated');
    expect(novelAfterFirst.alias).toEqual({
      alias_slug: NOVEL.aliasSlug, trick_slug: NOVEL.slug });
    expect(novelAfterFirst.modifier).toEqual({
      modifier_slug: NOVEL.modifierSlug, apply_order: 1 });
    const ruling = novelAfterFirst.ruling as Record<string, unknown>;
    expect(ruling.published_trick_slug).toBe(NOVEL.slug);
    expect(ruling.ev_state).toBe('canonical');
    expect(ruling.authored_notation).toBe(NOVEL.notation);
    expect(ruling.notation_authored_by).toBe(ADMIN_ID);
  });

  it('is a fixed point: a second refresh changes nothing', () => {
    expect(novelAfterSecond).toEqual(novelAfterFirst);
  });
});
