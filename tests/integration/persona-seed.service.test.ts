/**
 * seedPersonas — the top-up pass over the canonical catalog.
 *
 * Real SQLite (no mocks). The seed's contract is that it adds personas the
 * database is missing and never updates one it already has, so a second run
 * over a populated database is the case that matters and the case that used to
 * fail: a persona whose credentials are deliberately absent read as one
 * carrying a stale password hash, the healing write was refused by the members
 * credentials CHECK, and because that branch sat outside the per-persona guard
 * the whole run stopped there and never looked at the rest of the catalog.
 *
 * No passwordHash of consequence is needed: a synthetic argon2id-shaped string
 * stands in, so the module never imports the env-gated persona secret.
 */
import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { seedPersonas } from '../../src/testkit/personaSeedCore';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';

const { dbPath } = setTestEnv('3098');

// Shaped like a current-scheme hash so the healing branch reads it as current.
const HASH = '$argon2id$v=19$m=65536,t=3,p=4$c2VlZHNlZWQ$c2VlZHNlZWRzZWVkc2VlZA';

let db: BetterSqlite3.Database;

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  cleanupTestDb(dbPath);
  db = createTestDb(dbPath);
});

afterEach(() => {
  db.close();
});

/**
 * Clear a seeded persona's credentials the way the platform itself does.
 *
 * This is the shape the seed used to choke on, and it is not something the
 * seeder produces: the PII purge and deceased-scrub paths produce it later, in
 * any development database that has been running a while. The members
 * credentials CHECK admits it only with the purge timestamp set, which is
 * exactly why writing a password hash back onto such a row is refused.
 */
function purgeCredentials(slug: string): void {
  db.prepare(
    `UPDATE members
        SET login_email = NULL, login_email_normalized = NULL,
            password_hash = NULL, password_changed_at = NULL,
            personal_data_purged_at = '2026-01-01T00:00:00.000Z'
      WHERE slug = ?`,
  ).run(slug);
}

/** Personas whose credentials are absent: the shape that broke it. */
function loginDisabledSlugs(): string[] {
  const rows = db
    .prepare(
      `SELECT slug FROM members
        WHERE id LIKE 'member_persona_%' AND password_hash IS NULL
        ORDER BY slug`,
    )
    .all() as { slug: string }[];
  return rows.map((r) => r.slug);
}

describe('seedPersonas over an already-populated database', () => {
  it('reaches the whole catalog on a second run instead of stopping at the first credential-less persona', () => {
    const first = seedPersonas(db, CANONICAL_PERSONAS, HASH);
    expect(first.created, 'the first run seeds the catalog').toBeGreaterThan(0);
    expect(first.failedSlugs, 'nothing fails on a clean database').toEqual([]);
    // The purge path clears a persona's credentials after seeding, which is how
    // a real development database comes to hold this shape. Two personas in the
    // maintainer's own database are in it today.
    const purged = CANONICAL_PERSONAS.find((s) => !s.blockedBy)!.slug;
    purgeCredentials(purged);
    expect(loginDisabledSlugs(), 'the row shape the bug turned on exists').toContain(purged);

    const second = seedPersonas(db, CANONICAL_PERSONAS, HASH);
    expect(second.failedSlugs, 'a second run fails no persona').toEqual([]);
    expect(second.created, 'a second run creates nothing').toBe(0);
    expect(second.healed, 'and heals nothing, since every hash is current or absent').toBe(0);
    expect(
      second.skipped,
      'every seeded persona is visited and skipped, not abandoned part-way',
    ).toBe(first.created);
  });

  it('leaves a credential-less persona exactly as it was', () => {
    seedPersonas(db, CANONICAL_PERSONAS, HASH);
    const slug = CANONICAL_PERSONAS.find((s) => !s.blockedBy)!.slug;
    purgeCredentials(slug);
    const before = db.prepare(`SELECT * FROM members WHERE slug = ?`).get(slug);

    seedPersonas(db, CANONICAL_PERSONAS, HASH);

    const after = db.prepare(`SELECT * FROM members WHERE slug = ?`).get(slug);
    expect(after, 'no column of a login-disabled persona is rewritten').toEqual(before);
  });

  it('recognises a persona the purge path renamed, rather than trying to create it again', () => {
    seedPersonas(db, CANONICAL_PERSONAS, HASH);
    const slug = CANONICAL_PERSONAS.find((s) => !s.blockedBy)!.slug;
    // The purge rewrites the slug and keeps the id, which is what a real
    // development database holds once the soft-delete cleanup job has run.
    purgeCredentials(slug);
    db.prepare(`UPDATE members SET slug = ? WHERE slug = ?`).run(`removed_${slug}`, slug);

    const result = seedPersonas(db, CANONICAL_PERSONAS, HASH);

    expect(result.failedSlugs, 'the renamed persona is not created a second time').toEqual([]);
    expect(result.created).toBe(0);
    expect(result.orphanSlugs, 'nor is it reported as an orphan the catalog forgot').toEqual([]);
  });

  it('tops up a persona the catalog has gained without disturbing the rest', () => {
    const withoutLast = CANONICAL_PERSONAS.slice(0, -1);
    const added = CANONICAL_PERSONAS[CANONICAL_PERSONAS.length - 1]!;
    seedPersonas(db, withoutLast, HASH);
    const beforeCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM members WHERE id LIKE 'member_persona_%'`).get() as {
        n: number;
      }
    ).n;

    const second = seedPersonas(db, CANONICAL_PERSONAS, HASH);

    const exists = db.prepare(`SELECT slug FROM members WHERE slug = ?`).get(added.slug);
    if (added.blockedBy) {
      expect(exists, 'a blocked persona is catalog-only and is never seeded').toBeUndefined();
    } else {
      expect(exists, 'the newly catalogued persona lands').toBeDefined();
      expect(second.created).toBe(1);
    }
    const afterCount = (
      db.prepare(`SELECT COUNT(*) AS n FROM members WHERE id LIKE 'member_persona_%'`).get() as {
        n: number;
      }
    ).n;
    expect(afterCount - beforeCount, 'nothing else is created or removed').toBe(second.created);
  });
});

describe('seedPersonas password healing', () => {
  it('still heals a persona carrying a genuinely stale hash', () => {
    seedPersonas(db, CANONICAL_PERSONAS, HASH);
    const target = db
      .prepare(
        `SELECT slug FROM members
          WHERE id LIKE 'member_persona_%' AND password_hash IS NOT NULL
          ORDER BY slug LIMIT 1`,
      )
      .get() as { slug: string };
    db.prepare(`UPDATE members SET password_hash = 'bcrypt$stale' WHERE slug = ?`).run(target.slug);

    const result = seedPersonas(db, CANONICAL_PERSONAS, HASH);

    expect(result.healed, 'the stale hash is healed rather than skipped').toBe(1);
    const after = db
      .prepare(`SELECT password_hash AS h FROM members WHERE slug = ?`)
      .get(target.slug) as { h: string };
    expect(after.h).toBe(HASH);
  });
});

describe('seedPersonas failure isolation', () => {
  it('names a failing persona and keeps going through the ones after it', () => {
    // A tier3 spec without its underlying tier is a real refusal the factory
    // raises by name, so this exercises the guard through a genuine failure
    // rather than a manufactured one. It sits between two sound specs.
    const sound = CANONICAL_PERSONAS.filter((s) => !s.blockedBy).slice(0, 2);
    const broken = { ...sound[0]!, slug: 'seed_broken_tier3', tier: 'tier3' as const };
    delete (broken as { underlyingTier?: unknown }).underlyingTier;

    const result = seedPersonas(db, [sound[0]!, broken, sound[1]!], HASH);

    expect(result.failedSlugs, 'the offender is named').toEqual(['seed_broken_tier3']);
    expect(result.created, 'the personas either side of it still land').toBe(2);
    const landed = db
      .prepare(`SELECT COUNT(*) AS n FROM members WHERE slug IN (?, ?)`)
      .get(sound[0]!.slug, sound[1]!.slug) as { n: number };
    expect(landed.n).toBe(2);
  });
});
