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
import { seedPersona } from './personaFactory';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../lib/personaGuards';
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

  const findBySlug = db.prepare(
    `SELECT password_hash AS passwordHash FROM members WHERE slug = ?`,
  );
  // Re-hash a persona whose stored hash predates the current argon2id scheme,
  // in place, without disturbing the persona's accumulated rows. The seed is
  // idempotent by slug, so an old persona kept by successive code-only deploys
  // would otherwise carry a stale hash forever; this heals it on every seed run
  // so no rebuild or manual refresh is needed.
  const rehashBySlug = db.prepare(
    `UPDATE members
        SET password_hash = ?, password_changed_at = ?, password_version = password_version + 1,
            updated_at = ?, updated_by = 'system', version = version + 1
      WHERE slug = ?`,
  );
  const isCurrentScheme = (hash: unknown): boolean =>
    typeof hash === 'string' && hash.startsWith('$argon2id$');

  let created = 0;
  let healed = 0;
  let skipped = 0;
  let skippedBlocked = 0;
  const failedSlugs: string[] = [];
  let orphanSlugs: string[] = [];
  try {
    for (const spec of specs) {
      if (spec.blockedBy) {
        // The persona's feature is not built yet, so there is nothing to seed.
        // It still lives in the catalog and renders greyed on /dev/personas.
        skippedBlocked += 1;
        console.log(`[persona-seed] skip (blocked: ${spec.blockedBy}): ${spec.slug}`);
        continue;
      }
      const existing = findBySlug.get(spec.slug) as { passwordHash: unknown } | undefined;
      if (existing) {
        if (isCurrentScheme(existing.passwordHash)) {
          skipped += 1;
          console.log(`[persona-seed] skip (slug exists): ${spec.slug}`);
        } else {
          const now = new Date().toISOString();
          rehashBySlug.run(passwordHash, now, now, spec.slug);
          healed += 1;
          console.log(`[persona-seed] re-hashed stale password: ${spec.slug}`);
        }
        continue;
      }
      try {
        db.transaction(() => seedPersona(db, spec, { passwordHash }))();
        created += 1;
        console.log(`[persona-seed] seeded persona: ${spec.slug} (${spec.tier})`);
      } catch (err) {
        // Name the persona that failed and keep going. Its transaction rolled
        // back on its own, so the database holds no partial persona; the run
        // exits non-zero below once every offender has been reported.
        failedSlugs.push(spec.slug);
        const detail = err instanceof Error ? err.message : String(err);
        console.error(`[persona-seed] FAILED ${spec.slug}: ${detail}`);
      }
    }

    // A persona present under a slug the catalog no longer carries. It survives
    // every future seed run (the loop only visits current specs), so it goes on
    // answering to /dev/switch as a persona nothing in code describes.
    const catalogSlugs = new Set(specs.map((s) => s.slug));
    orphanSlugs = (
      db
        .prepare(`SELECT slug FROM members WHERE id LIKE ? ORDER BY slug`)
        .all(`${SEEDED_PERSONA_MEMBER_ID_PREFIX}%`) as { slug: string }[]
    )
      .map((r) => r.slug)
      .filter((slug) => !catalogSlugs.has(slug));
  } finally {
    db.close();
  }

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
