/**
 * Persona refresh, command line: report-then-apply contract.
 *
 * The refresh is the only path that makes an existing database current against
 * the persona catalog, and it gets there by deleting persona-owned rows. So the
 * command line entry point reports what it would change and writes nothing
 * until an explicit apply flag is given, and the apply run converges the
 * database on the catalog: a persona under a slug the catalog no longer carries
 * is gone, and every buildable spec is present.
 *
 * Because the operator entry points run this by default, a database holding no
 * personas must come through untouched. A refresh keeps existing personas
 * current; it is not a way to introduce them, and a default that seeded 54
 * members into a database that deliberately has none would be a far worse
 * surprise than the staleness it set out to prevent.
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
const RETIRED_SLUG = 'persona_dropped_from_catalog';

/** Run the refresh CLI against dbPath, returning its exit code and captured output. */
async function runRefresh(dbPath: string, apply: boolean): Promise<{ code: number; out: string }> {
  const { main } = await import('../../src/testkit/personaRefreshCli');
  const lines: string[] = [];
  const log = vi.spyOn(console, 'log').mockImplementation((...a) => void lines.push(a.join(' ')));
  const err = vi.spyOn(console, 'error').mockImplementation((...a) => void lines.push(a.join(' ')));
  const priorArgv = process.argv;
  process.argv = ['node', 'personaRefreshCli.js', '--db', dbPath, ...(apply ? ['--apply'] : [])];
  try {
    const code = await main();
    return { code, out: lines.join('\n') };
  } finally {
    process.argv = priorArgv;
    log.mockRestore();
    err.mockRestore();
  }
}

function personaSlugs(dbPath: string, BetterSqlite3: typeof import('better-sqlite3')): string[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(`SELECT slug FROM members WHERE id LIKE 'member_persona_%' ORDER BY slug`)
    .all() as { slug: string }[];
  db.close();
  return rows.map((r) => r.slug);
}

describe('persona refresh command line', () => {
  let tmpDir: string;
  let dbPath: string;
  let BetterSqlite3: typeof import('better-sqlite3');

  beforeAll(async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    BetterSqlite3 = (await import('better-sqlite3')).default;
    const { insertMember } = await import('../fixtures/factories');
    const { SEEDED_PERSONA_MEMBER_ID_PREFIX } = await import('../../src/lib/personaGuards');
    const { main: seedMain } = await import('../../src/testkit/personaSeedRunner');

    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-personarefresh-'));
    dbPath = path.join(tmpDir, 'footbag.db');
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);
    db.close();

    // Seed the catalog, then add a persona under a slug the catalog does not
    // carry — the state a database reaches when a spec is renamed or removed.
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined);
    const priorArgv = process.argv;
    process.argv = ['node', 'personaSeedRunner.js', '--db', dbPath];
    try {
      await seedMain();
    } finally {
      process.argv = priorArgv;
      log.mockRestore();
    }

    const after = new BetterSqlite3(dbPath);
    after.pragma('foreign_keys = ON');
    insertMember(after, {
      id: `${SEEDED_PERSONA_MEMBER_ID_PREFIX}${RETIRED_SLUG}`,
      slug: RETIRED_SLUG,
    });
    after.close();
  }, 90_000);

  afterAll(async () => {
    const fs = await import('node:fs');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('reports the pending changes and writes nothing without the apply flag', async () => {
    const before = personaSlugs(dbPath, BetterSqlite3);

    const { code, out } = await runRefresh(dbPath, false);

    expect(code).toBe(0);
    expect(out).toContain(`would drop orphan (no longer in the catalog): ${RETIRED_SLUG}`);
    expect(out).toContain('report only, nothing written.');
    expect(personaSlugs(dbPath, BetterSqlite3)).toEqual(before);
  }, 60_000);

  it('converges the database on the catalog when applied', async () => {
    const { CANONICAL_PERSONAS } = await import('../../src/testkit/canonicalPersonas');
    const buildable = CANONICAL_PERSONAS.filter((p) => !p.blockedBy).map((p) => p.slug);

    const { code, out } = await runRefresh(dbPath, true);

    expect(code).toBe(0);
    expect(out).toContain('this database is CURRENT against the catalog.');

    const after = personaSlugs(dbPath, BetterSqlite3);
    expect(after).not.toContain(RETIRED_SLUG);
    expect(after.slice().sort()).toEqual(buildable.slice().sort());
  }, 90_000);

  it('leaves a database holding no personas untouched, even when applied', async () => {
    const fs = await import('node:fs');
    const os = await import('node:os');
    const { insertMember } = await import('../fixtures/factories');

    const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-personanone-'));
    const emptyDb = path.join(emptyDir, 'footbag.db');
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');
    const db = new BetterSqlite3(emptyDb);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);
    // An ordinary member, to prove the no-op protects real rows and not merely
    // an empty file.
    const realMemberId = insertMember(db, { slug: 'a_real_member' });
    db.close();

    try {
      const { code, out } = await runRefresh(emptyDb, true);

      expect(code).toBe(0);
      expect(out).toContain('no personas in this database');

      const check = new BetterSqlite3(emptyDb, { readonly: true });
      const personas = (
        check
          .prepare(`SELECT COUNT(*) AS c FROM members WHERE id LIKE 'member_persona_%'`)
          .get() as { c: number }
      ).c;
      const realStillThere = (
        check.prepare('SELECT COUNT(*) AS c FROM members WHERE id = ?').get(realMemberId) as {
          c: number;
        }
      ).c;
      check.close();

      expect(personas).toBe(0);
      expect(realStillThere).toBe(1);
    } finally {
      fs.rmSync(emptyDir, { recursive: true, force: true });
    }
  }, 60_000);
});
