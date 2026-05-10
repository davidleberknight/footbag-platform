/**
 * Integration tests for `scripts/cleanup-club-data-cl1`.
 *
 * Exercises the read-only `planFixes` and the write `applyFixes` against a
 * fresh schema-only DB seeded with all 11 target rows, plus a few drift
 * cases (already-fixed rows + a missing club) to confirm the per-row skip
 * reasons. Re-runs the apply path twice in a row to confirm idempotency:
 * the second pass plans zero applicable fixes and produces only
 * `already_fixed` skips.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { planFixes, applyFixes } from '../../scripts/cleanup-club-data-cl1';

const TS = '2026-01-01T00:00:00.000Z';

interface ClubSeed {
  id: string;
  name: string;
  city: string;
  country: string;
  external_url: string | null;
}

const TARGET_SEEDS: ClubSeed[] = [
  // Name-fix targets
  { id: 'club_7708a9c255d1205ded153c47', name: 'Tu  Wat',                    city: 'Berlin',   country: 'Germany', external_url: null },
  { id: 'club_a4e25f79b279c5a8f5c34ee1', name: 'NightXShadow  Footbag Club', city: 'New York', country: 'USA',     external_url: null },
  { id: 'club_0f2fe506ea83e9b35f7d222f', name: 'Marathon  Footbag Club',     city: 'Boston',   country: 'USA',     external_url: null },
  // URL-prefix targets
  { id: 'club_626e4b84266bedca942e15d4', name: 'Maniac Footbag Team',                             city: 'X', country: 'Poland', external_url: 'http://https://www.facebook.com/MANIACSportTeam' },
  { id: 'club_8c645f63050d2b8102c55dd3', name: 'Footbag Medellin',                                city: 'X', country: 'Colombia', external_url: 'http://https://m.facebook.com/footbag.medellin' },
  { id: 'club_ffe36e01d0ca7881e20d1f5c', name: 'Vancouver Footbag Freestyle',                     city: 'X', country: 'Canada',   external_url: 'http://https://www.facebook.com/groups/shredvan' },
  { id: 'club_7ea35d812706d92138687490', name: 'Austin Style Footbag Club - Texas Footbag League', city: 'X', country: 'USA',      external_url: 'http://https://www.facebook.com/groups/216661849514732/' },
  // URL-null targets
  { id: 'club_e3a32bc11e016e3369f0d4c8', name: 'BC Soramäki Indians', city: 'X', country: 'Finland',     external_url: 'http://-' },
  { id: 'club_29d694a6b89083468c975f3d', name: 'Arica Footbag Club',  city: 'X', country: 'Chile',       external_url: 'http://Bienvenidos' },
  { id: 'club_32e2d136a68e0c1d47ba84dc', name: 'bow-no-bones',        city: 'X', country: 'Switzerland', external_url: 'http://Coming' },
  { id: 'club_e281326a16c36f817bad02a0', name: 'Urban Komba',         city: 'X', country: 'Bulgaria',    external_url: 'http://e-mail:' },
];

function freshDb(): BetterSqlite3.Database {
  const schema = fs.readFileSync(path.join(process.cwd(), 'database', 'schema.sql'), 'utf8');
  const db = new BetterSqlite3(':memory:');
  db.pragma('foreign_keys = ON');
  db.exec(schema);
  return db;
}

function seedClubs(db: BetterSqlite3.Database, seeds: ClubSeed[]): void {
  const insTag = db.prepare(
    `INSERT INTO tags (id, created_at, created_by, updated_at, updated_by, version,
                       tag_normalized, tag_display, is_standard, standard_type)
     VALUES (@id, '${TS}', 'test', '${TS}', 'test', 1, @norm, @display, 1, 'club')`,
  );
  const insClub = db.prepare(
    `INSERT INTO clubs (id, created_at, created_by, updated_at, updated_by, version,
                         name, description, city, region, country,
                         external_url, status, hashtag_tag_id)
     VALUES (@id, '${TS}', 'test', '${TS}', 'test', 1,
             @name, '', @city, NULL, @country,
             @external_url, 'active', @tag_id)`,
  );
  for (const seed of seeds) {
    const tagId = `tag_${seed.id.slice(-12)}`;
    const norm  = `#club_test_${seed.id.slice(-8)}`.toLowerCase();
    insTag.run({ id: tagId, norm, display: norm });
    insClub.run({ ...seed, tag_id: tagId });
  }
}

let db: BetterSqlite3.Database;

beforeEach(() => {
  db = freshDb();
  seedClubs(db, TARGET_SEEDS);
});

afterEach(() => {
  db.close();
});

describe('cleanup-club-data-cl1: planFixes (read-only diagnostic)', () => {
  it('plans all 11 fixes against a fresh fixture with no drift', () => {
    const { applicable, result } = planFixes(db);
    expect(applicable).toHaveLength(11);
    expect(result.skipped).toHaveLength(0);
  });

  it('skips with already_fixed when a name has been pre-corrected', () => {
    db.prepare('UPDATE clubs SET name = ? WHERE id = ?').run(
      'Tu Wat',
      'club_7708a9c255d1205ded153c47',
    );
    const { applicable, result } = planFixes(db);
    expect(applicable).toHaveLength(10);
    const skip = result.skipped.find(s => s.id === 'club_7708a9c255d1205ded153c47');
    expect(skip?.reason).toBe('already_fixed');
    expect(skip?.kind).toBe('name');
  });

  it('skips with already_fixed when a URL has been pre-corrected', () => {
    db.prepare('UPDATE clubs SET external_url = NULL WHERE id = ?').run(
      'club_e3a32bc11e016e3369f0d4c8',
    );
    const { applicable, result } = planFixes(db);
    expect(applicable).toHaveLength(10);
    const skip = result.skipped.find(s => s.id === 'club_e3a32bc11e016e3369f0d4c8');
    expect(skip?.reason).toBe('already_fixed');
    expect(skip?.kind).toBe('url');
  });

  it('skips with club_not_found when a target id is missing from the table', () => {
    db.prepare('DELETE FROM clubs WHERE id = ?').run('club_e281326a16c36f817bad02a0');
    const { applicable, result } = planFixes(db);
    expect(applicable).toHaveLength(10);
    const skip = result.skipped.find(s => s.id === 'club_e281326a16c36f817bad02a0');
    expect(skip?.reason).toBe('club_not_found');
  });
});

describe('cleanup-club-data-cl1: applyFixes (transactional write)', () => {
  it('writes all expected new values, bumps version, and updates the actor', () => {
    const { applicable, result } = planFixes(db);
    applyFixes(db, applicable, result);
    expect(result.applied).toHaveLength(11);

    // F1: names collapsed
    expect(
      db.prepare<{ id: string }, { name: string; version: number; updated_by: string }>(
        'SELECT name, version, updated_by FROM clubs WHERE id = @id',
      ).get({ id: 'club_7708a9c255d1205ded153c47' }),
    ).toEqual({ name: 'Tu Wat', version: 2, updated_by: 'system:cleanup-cl1' });

    // F2: URL prefix stripped
    expect(
      db.prepare<{ id: string }, { external_url: string }>(
        'SELECT external_url FROM clubs WHERE id = @id',
      ).get({ id: 'club_626e4b84266bedca942e15d4' })?.external_url,
    ).toBe('https://www.facebook.com/MANIACSportTeam');

    // F3: placeholder URL nulled
    expect(
      db.prepare<{ id: string }, { external_url: string | null }>(
        'SELECT external_url FROM clubs WHERE id = @id',
      ).get({ id: 'club_e3a32bc11e016e3369f0d4c8' })?.external_url,
    ).toBeNull();
  });

  it('is idempotent: applying twice yields zero applicable on the second run', () => {
    {
      const { applicable, result } = planFixes(db);
      applyFixes(db, applicable, result);
    }
    const { applicable, result } = planFixes(db);
    expect(applicable).toHaveLength(0);
    expect(result.skipped).toHaveLength(11);
    expect(result.skipped.every(s => s.reason === 'already_fixed')).toBe(true);
  });

  it('clears external_url_validated_at on URL fixes', () => {
    // Pre-stamp validated_at on a URL-fix target before running.
    const id = 'club_e281326a16c36f817bad02a0';
    db.prepare(
      `UPDATE clubs SET external_url_validated_at = '2025-01-01T00:00:00Z' WHERE id = ?`,
    ).run(id);

    const { applicable, result } = planFixes(db);
    applyFixes(db, applicable, result);

    const row = db.prepare<{ id: string }, { external_url: string | null; external_url_validated_at: string | null }>(
      'SELECT external_url, external_url_validated_at FROM clubs WHERE id = @id',
    ).get({ id });
    expect(row?.external_url).toBeNull();
    expect(row?.external_url_validated_at).toBeNull();
  });
});
