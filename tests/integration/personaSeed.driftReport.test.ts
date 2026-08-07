/**
 * Persona seed runner: drift reporting and per-persona failure isolation.
 *
 * The seed is idempotent by slug, so it adds personas a database is missing and
 * never updates one it already has. That makes a database complete against the
 * catalog but not current, and the difference is invisible from the counts
 * alone: a persona seeded before its spec changed renders as a broken feature
 * rather than as an out-of-date database. The runner must therefore say which
 * of the two states the run reached, and name every persona present under a
 * slug the catalog no longer carries.
 *
 * A persona that cannot be seeded must also be reported against its own slug
 * with the rest of the catalog still applied, so one collision neither hides
 * the offender behind a raw constraint dump nor withholds every persona after
 * it. The run still exits non-zero so a calling script fails.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import * as path from 'node:path';

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = process.env.FOOTBAG_ENV ?? 'development';

afterAll(() => {
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const RETIRED_SLUG = 'persona_no_longer_in_catalog';

/** Run the seed runner against dbPath, returning its exit code and captured output. */
async function runSeed(dbPath: string): Promise<{ code: number; out: string }> {
  const { main } = await import('../../src/testkit/personaSeedRunner');
  const lines: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')));
  const err = vi.spyOn(console, 'error').mockImplementation((...a) => void lines.push(a.join(' ')));
  const priorArgv = process.argv;
  process.argv = ['node', 'personaSeedRunner.js', '--db', dbPath];
  try {
    const code = await main();
    return { code, out: lines.join('\n') };
  } finally {
    process.argv = priorArgv;
    log.mockRestore();
    err.mockRestore();
  }
}

describe('persona seed runner: drift reporting', () => {
  let tmpDir: string;
  let dbPath: string;

  beforeAll(async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const BetterSqlite3 = (await import('better-sqlite3')).default;

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-personadrift-'));
    dbPath = path.join(tmpDir, 'footbag.db');
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);
    db.close();
  });

  afterAll(async () => {
    const fs = await import('node:fs');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports a fresh seed as current against the catalog', async () => {
    const { code, out } = await runSeed(dbPath);

    expect(code).toBe(0);
    expect(out).toContain('this database is CURRENT against the catalog.');
    expect(out).toContain('orphaned=0');
    expect(out).toContain('failed=0');
  }, 60_000);

  it('reports a re-run over existing personas as complete but not current', async () => {
    const { code, out } = await runSeed(dbPath);

    // Nothing to add, so every persona is skipped and keeps the rows it was
    // first seeded with — the state a changed spec would never reach.
    expect(code).toBe(0);
    expect(out).toContain('COMPLETE against the catalog, not CURRENT');
    expect(out).toContain('--refresh-test-personas');
  }, 60_000);

  it('names a persona whose slug the catalog no longer carries', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { insertMember } = await import('../fixtures/factories');
    const { SEEDED_PERSONA_MEMBER_ID_PREFIX } = await import('../../src/lib/personaGuards');

    const setup = new BetterSqlite3(dbPath);
    setup.pragma('foreign_keys = ON');
    insertMember(setup, {
      id: `${SEEDED_PERSONA_MEMBER_ID_PREFIX}${RETIRED_SLUG}`,
      slug: RETIRED_SLUG,
    });
    setup.close();

    const { code, out } = await runSeed(dbPath);

    expect(code).toBe(0);
    expect(out).toContain(`orphan (no longer in the catalog): ${RETIRED_SLUG}`);
    expect(out).toContain('orphaned=1');
  }, 60_000);

  it('names a persona it cannot seed, seeds the rest, and exits non-zero', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { insertMember } = await import('../fixtures/factories');
    const { CANONICAL_PERSONAS } = await import('../../src/testkit/canonicalPersonas');

    const collisionDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-personafail-'));
    const collisionDb = path.join(collisionDir, 'footbag.db');
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');

    // A member already holding the login address one persona will claim. The
    // unique index on the normalized address makes that persona's insert fail
    // while every other spec remains seedable.
    const buildable = CANONICAL_PERSONAS.filter((p) => !p.blockedBy);
    const victim = buildable[0];
    const survivor = buildable[buildable.length - 1];

    const db = new BetterSqlite3(collisionDb);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);
    insertMember(db, { login_email: `${victim.slug}@personas.test` });
    db.close();

    try {
      const { code, out } = await runSeed(collisionDb);

      expect(code).toBe(1);
      expect(out).toContain(`FAILED ${victim.slug}:`);
      expect(out).toContain(`failed personas: ${victim.slug}`);

      // The run did not stop at the collision: a later spec still landed.
      const check = new BetterSqlite3(collisionDb, { readonly: true });
      const seeded = (
        check.prepare('SELECT COUNT(*) AS c FROM members WHERE slug = ?').get(survivor.slug) as {
          c: number;
        }
      ).c;
      const failed = (
        check.prepare('SELECT COUNT(*) AS c FROM members WHERE slug = ?').get(victim.slug) as {
          c: number;
        }
      ).c;
      check.close();
      expect(seeded).toBe(1);
      // The failing persona's transaction rolled back: no partial row survives.
      expect(failed).toBe(0);
    } finally {
      fs.rmSync(collisionDir, { recursive: true, force: true });
    }
  }, 60_000);
});
