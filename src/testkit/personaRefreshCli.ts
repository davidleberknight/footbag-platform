/**
 * Persona refresh runner, command line. Rebuilds every seeded persona back to
 * its canonical spec by tearing down persona-owned rows and re-seeding, which
 * is the only way an existing database picks up a persona spec that changed
 * since it was seeded. The seed runner cannot do this: it is idempotent by
 * slug, so it makes a database complete against the catalog but never current.
 *
 * The same teardown is reachable from the browser at POST /dev/personas/refresh.
 * This entry point exists because the operator paths that build a database are
 * scripts, so a refresh that can only be clicked leaves scripted rebuilds on a
 * stale catalog with no way to say so.
 *
 * Destructive, so it runs in two steps: the default is a read-only report of
 * what a refresh would tear down and rebuild, and `--apply` performs it. The
 * teardown and re-seed share one transaction (the refresh runner owns it), so
 * a failure part-way leaves the personas as they were.
 *
 * A refresh makes the personas a database ALREADY HAS current; it is not a way
 * to introduce them. On a database holding none it reports that and does
 * nothing, so running it by default on every deploy or launch can never conjure
 * a persona catalog into a database that deliberately has none. Seeding a
 * database that has no personas is the seed runner's job.
 *
 * One deliberate difference from the browser route: that route deletes the
 * storage objects a persona uploaded after the transaction commits, using the
 * media storage adapter. The adapter reads the application config, which
 * requires the full server environment this CLI does not have, so the bytes are
 * reported here rather than deleted, and the DB rows referencing them are gone
 * either way. Refresh from the browser route when the media store must come
 * back empty too.
 *
 * Env guard: ./personaSecrets throws on import unless FOOTBAG_ENV is
 * 'development' or 'staging'. Production is hard-blocked.
 *
 * Usage (dev, via tsx):
 *   FOOTBAG_ENV=development npx tsx src/testkit/personaRefreshCli.ts
 *   FOOTBAG_ENV=development npx tsx src/testkit/personaRefreshCli.ts --apply
 *   FOOTBAG_ENV=development npx tsx src/testkit/personaRefreshCli.ts --apply --db ./custom.db
 *
 * Usage (staging, compiled):
 *   FOOTBAG_ENV=staging node dist/testkit/personaRefreshCli.js --apply
 */
import argon2 from 'argon2';
import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { TEST_PERSONA_SEED_PASSWORD_LITERAL } from './personaSecrets';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
import { refreshAllPersonas } from './personaRefreshRunner';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../lib/personaGuards';
import { parseDbArg } from './seedCli';

export async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const { dbPath } = parseDbArg(argv);
  const apply = argv.includes('--apply');
  const env = process.env.FOOTBAG_ENV ?? '<unset>';

  if (!existsSync(dbPath)) {
    console.error(`[persona-refresh] DB file not found: ${dbPath}`);
    return 1;
  }

  const specs = CANONICAL_PERSONAS;
  const buildable = specs.filter((s) => !s.blockedBy);
  console.log(`[persona-refresh] env=${env} db=${dbPath} specs=${specs.length}`);

  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  try {
    // Read-only diagnostic, printed on both paths so the apply run records what
    // it acted on rather than only what it did.
    const present = db
      .prepare(`SELECT slug FROM members WHERE id LIKE ? ORDER BY slug`)
      .all(`${SEEDED_PERSONA_MEMBER_ID_PREFIX}%`) as { slug: string }[];
    const catalogSlugs = new Set(specs.map((s) => s.slug));
    const orphans = present.map((r) => r.slug).filter((slug) => !catalogSlugs.has(slug));
    const presentSlugs = new Set(present.map((r) => r.slug));
    const missing = buildable.filter((s) => !presentSlugs.has(s.slug)).map((s) => s.slug);

    // Answered before the per-slug listing, so a database with no personas says
    // one thing rather than reciting the whole catalog as pending work it will
    // not do. This is the case that makes running by default safe.
    if (present.length === 0) {
      console.log(
        '[persona-refresh] no personas in this database; nothing to make current.' +
          " Seeding a database that has none is the seed runner's job.",
      );
      return 0;
    }

    console.log(
      `[persona-refresh] present=${present.length} buildable=${buildable.length}` +
        ` blocked=${specs.length - buildable.length} orphaned=${orphans.length} missing=${missing.length}`,
    );
    for (const slug of orphans) {
      console.log(`[persona-refresh] would drop orphan (no longer in the catalog): ${slug}`);
    }
    for (const slug of missing) {
      console.log(`[persona-refresh] would add (in the catalog, absent here): ${slug}`);
    }

    if (!apply) {
      console.log(
        '[persona-refresh] report only, nothing written.' +
          ' Re-run with --apply to rebuild every persona from its current spec.',
      );
      console.log(
        '[persona-refresh] --apply DELETES persona-owned rows, including anything a' +
          ' tester built while acting as a persona.',
      );
      return 0;
    }

    // Direct argon2 rather than the shared hashPassword helper, for the reason
    // the seed runner gives: the helper pulls in the application config, which
    // demands a full server environment this CLI does not have.
    const passwordHash = await argon2.hash(TEST_PERSONA_SEED_PASSWORD_LITERAL);
    const result = refreshAllPersonas(db, { passwordHash });

    console.log(
      `[persona-refresh] done. deletedMembers=${result.deletedMembers}` +
        ` reseeded=${result.reseeded} actorGrantRowsRemoved=${result.actorGrantRowsRemoved}`,
    );
    if (result.actorGrantRowsRemoved > 0) {
      console.log(
        '[persona-refresh] a persona had granted tiers or Active Player standing to other' +
          ' members; those grants are gone and the members revert to their pre-test state.',
      );
    }
    for (const key of result.deletedMediaKeys) {
      console.log(`[persona-refresh] orphaned media object (row deleted, bytes kept): ${key}`);
    }
    console.log('[persona-refresh] this database is CURRENT against the catalog.');
    return 0;
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[persona-refresh] fatal:', err);
      process.exit(1);
    });
}
