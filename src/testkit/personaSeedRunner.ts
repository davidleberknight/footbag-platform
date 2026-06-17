/**
 * Persona seed runner. Seeds the canonical persona catalog into the dev/staging
 * database so the /dev/switch route and the persona listing have members to act as.
 *
 * Env guard: ./personaSecrets throws on import unless FOOTBAG_ENV is
 * 'development' or 'staging'. Production is hard-blocked.
 *
 * Idempotent: a persona whose slug already exists as a member is skipped, so
 * re-running after a partial seed (or alongside other seeds) is safe.
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

  const existsBySlug = db.prepare(`SELECT 1 FROM members WHERE slug = ?`);
  let created = 0;
  let skipped = 0;
  let skippedBlocked = 0;
  try {
    for (const spec of specs) {
      if (spec.blockedBy) {
        // The persona's feature is not built yet, so there is nothing to seed.
        // It still lives in the catalog and renders greyed on /dev/personas.
        skippedBlocked += 1;
        console.log(`[persona-seed] skip (blocked: ${spec.blockedBy}): ${spec.slug}`);
        continue;
      }
      if (existsBySlug.get(spec.slug)) {
        skipped += 1;
        console.log(`[persona-seed] skip (slug exists): ${spec.slug}`);
        continue;
      }
      db.transaction(() => seedPersona(db, spec, { passwordHash }))();
      created += 1;
      console.log(`[persona-seed] seeded persona: ${spec.slug} (${spec.tier})`);
    }
  } finally {
    db.close();
  }

  console.log(
    `[persona-seed] done. created=${created} skipped=${skipped} skippedBlocked=${skippedBlocked}`,
  );
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
