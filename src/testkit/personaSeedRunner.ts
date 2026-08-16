/**
 * Persona seed runner. Seeds the canonical persona catalog into the dev/staging
 * database so the /dev/switch route and the persona listing have members to act as.
 *
 * Env guard: ./personaSecrets throws on import unless FOOTBAG_ENV is
 * 'development' or 'staging'. Production is hard-blocked.
 *
 * Idempotent: a persona whose slug already exists is not re-created, so
 * re-running after a partial seed (or alongside other seeds) is safe. An
 * existing persona whose stored password hash predates the current argon2id
 * scheme is re-hashed in place (its accumulated rows untouched), so successive
 * code-only deploys never leave a persona on a stale hash.
 *
 * This makes a database COMPLETE against the catalog, never CURRENT: an
 * existing persona keeps whatever rows it was first seeded with, so a spec
 * edited since that seed never reaches the database. Only the refresh runner
 * (which tears the personas down and rebuilds them) makes a database current.
 * The closing summary therefore names every persona present under a slug the
 * catalog no longer carries, and says which of the two states the run reached,
 * so a stale catalog is visible without anyone rebuilding to find out.
 *
 * One persona that cannot be seeded does not withhold the rest: the failure is
 * reported against its own slug and the run continues, then exits non-zero so a
 * calling script still fails. Aborting on the first collision left the catalog
 * half-applied with only a raw constraint dump to identify the offender, and
 * hid every later collision behind the first.
 *
 * Input: CANONICAL_PERSONAS, the maintainer-curated catalog in code
 * (personaFactory.ts has the full PersonaSpec type; canonicalPersonas.ts has live examples).
 *
 * Usage (dev, via tsx):
 *   FOOTBAG_ENV=development npx tsx src/testkit/personaSeedRunner.ts
 *   FOOTBAG_ENV=development npx tsx src/testkit/personaSeedRunner.ts --db ./custom.db
 *
 * Usage (staging, compiled):
 *   FOOTBAG_ENV=staging node dist/testkit/personaSeedRunner.js
 */
import argon2 from 'argon2';
import BetterSqlite3 from 'better-sqlite3';
import { existsSync } from 'node:fs';
import { TEST_PERSONA_SEED_PASSWORD_LITERAL } from './personaSecrets';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
import { seedPersonas, type SeedPersonasResult } from './personaSeedCore';
import { parseDbArg } from './seedCli';

export async function main(): Promise<number> {
  const { dbPath } = parseDbArg(process.argv.slice(2));
  const env = process.env.FOOTBAG_ENV ?? '<unset>';

  if (!existsSync(dbPath)) {
    console.error(`[persona-seed] DB file not found: ${dbPath}`);
    return 1;
  }

  const specs = CANONICAL_PERSONAS;
  console.log(`[persona-seed] env=${env} specs=${specs.length}`);

  // Direct argon2, not the shared hashPassword helper: this CLI seed script
  // runs without the app's full env, and the helper imports src/config/env
  // (which requires PORT/SESSION_SECRET) and would crash at load. Seed data is
  // strong-hashed; the cheap test profile is irrelevant here.
  const passwordHash = await argon2.hash(TEST_PERSONA_SEED_PASSWORD_LITERAL);
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  let result: SeedPersonasResult;
  try {
    result = seedPersonas(db, specs, passwordHash);
  } finally {
    db.close();
  }

  const { created, healed, skipped, skippedBlocked, orphanSlugs, failedSlugs } = result;

  for (const slug of orphanSlugs) {
    console.log(`[persona-seed] orphan (no longer in the catalog): ${slug}`);
  }
  console.log(
    `[persona-seed] done. created=${created} healed=${healed} skipped=${skipped}` +
      ` skippedBlocked=${skippedBlocked} orphaned=${orphanSlugs.length} failed=${failedSlugs.length}`,
  );

  // Say which of the two states this database reached, because the difference
  // is invisible from the counts alone and a stale persona reads as a bug in
  // the feature it covers rather than as an out-of-date database.
  if (skipped > 0 || orphanSlugs.length > 0) {
    console.log(
      '[persona-seed] this database is COMPLETE against the catalog, not CURRENT:' +
        ` ${skipped} existing persona(s) kept the rows they were first seeded with.`,
    );
    console.log(
      '[persona-seed] to rebuild every persona from its current spec, locally run' +
        ' ./scripts/manage-test-personas.sh --refresh-test-personas --apply,' +
        ' or deploy with --refresh-test-personas.',
    );
  } else {
    console.log('[persona-seed] this database is CURRENT against the catalog.');
  }

  if (failedSlugs.length > 0) {
    console.error(`[persona-seed] failed personas: ${failedSlugs.join(', ')}`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('[persona-seed] fatal:', err);
      process.exit(1);
    });
}
