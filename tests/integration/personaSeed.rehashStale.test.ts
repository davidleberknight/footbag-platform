/**
 * Persona seed runner: stale-hash self-heal.
 *
 * The seed is idempotent by slug, so a persona kept across successive
 * code-only deploys would otherwise carry whatever password hash it was first
 * seeded with. When that hash predates the current argon2id scheme, the runner
 * must re-hash it in place on the next seed run, without disturbing the
 * persona's accumulated rows, so no rebuild or manual refresh is needed to
 * restore the fresh-hash contract the persona smoke asserts.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import * as path from 'node:path';

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = process.env.FOOTBAG_ENV ?? 'development';

afterAll(() => {
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

const REPO_ROOT = path.resolve(__dirname, '..', '..');

describe('persona seed runner: stale-hash self-heal', () => {
  let dbPath: string;
  let tmpDir: string;
  let personaSlug: string;
  let priorArgv: string[];

  beforeAll(async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { seedPersona } = await import('../../src/testkit/personaFactory');
    const { CANONICAL_PERSONAS } = await import('../../src/testkit/canonicalPersonas');

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'personaseed-rehash-'));
    dbPath = path.join(tmpDir, 'footbag.db');
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);

    // Seed one real persona, then force its password onto a pre-argon2id
    // scheme to stand in for a row left behind by an older seed runner.
    const spec = CANONICAL_PERSONAS.find((p) => !p.blockedBy)!;
    personaSlug = spec.slug;
    db.transaction(() => seedPersona(db, spec, { passwordHash: 'legacy-plaintext-or-bcrypt' }))();
    db.close();
  });

  afterAll(async () => {
    const fs = await import('node:fs');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('re-hashes a stale password in place and preserves the persona row', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;

    const before = (() => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT id, password_hash AS h, version AS v FROM members WHERE slug = ?')
        .get(personaSlug) as { id: string; h: string; v: number };
      db.close();
      return row;
    })();
    expect(before.h.startsWith('$argon2id$')).toBe(false);

    const { main } = await import('../../src/testkit/personaSeedRunner');
    priorArgv = process.argv;
    process.argv = ['node', 'personaSeedRunner.js', '--db', dbPath];
    try {
      const code = await main();
      expect(code).toBe(0);
    } finally {
      process.argv = priorArgv;
    }

    const after = (() => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT id, password_hash AS h, version AS v FROM members WHERE slug = ?')
        .get(personaSlug) as { id: string; h: string; v: number };
      const count = (
        db.prepare('SELECT COUNT(*) AS c FROM members WHERE slug = ?').get(personaSlug) as {
          c: number;
        }
      ).c;
      db.close();
      return { row, count };
    })();

    // Healed to the current scheme, same row (id preserved, no duplicate),
    // version bumped by the in-place update.
    expect(after.row.h.startsWith('$argon2id$')).toBe(true);
    expect(after.row.id).toBe(before.id);
    expect(after.count).toBe(1);
    expect(after.row.v).toBe(before.v + 1);
  }, 30_000);

  it('leaves an already-current hash unchanged on a second run', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;

    const first = (() => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT password_hash AS h, version AS v FROM members WHERE slug = ?')
        .get(personaSlug) as { h: string; v: number };
      db.close();
      return row;
    })();

    const { main } = await import('../../src/testkit/personaSeedRunner');
    priorArgv = process.argv;
    process.argv = ['node', 'personaSeedRunner.js', '--db', dbPath];
    try {
      expect(await main()).toBe(0);
    } finally {
      process.argv = priorArgv;
    }

    const second = (() => {
      const db = new BetterSqlite3(dbPath, { readonly: true });
      const row = db
        .prepare('SELECT password_hash AS h, version AS v FROM members WHERE slug = ?')
        .get(personaSlug) as { h: string; v: number };
      db.close();
      return row;
    })();

    // No re-hash and no version bump: a current-scheme hash is skipped.
    expect(second.h).toBe(first.h);
    expect(second.v).toBe(first.v);
  }, 30_000);
});
