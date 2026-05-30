/**
 * Persona seed runner. Seeds the canonical persona catalog (and the optional
 * per-developer .local extension) into the dev/staging database so the
 * /dev/switch route and the persona listing have members to act as.
 *
 * Env guard: ./personaSecrets throws on import unless FOOTBAG_ENV is
 * 'development' or 'staging'. Production is hard-blocked.
 *
 * Idempotent: a persona whose slug already exists as a member is skipped, so
 * re-running after a partial seed (or alongside other seeds) is safe.
 *
 * Input:
 *   1. CANONICAL_PERSONAS (always; the maintainer-curated catalog in code).
 *   2. .local/test-personas.json if present (JSONC-tolerant; `//` line comments
 *      stripped). Per-developer, gitignored. Malformed entries fail loudly.
 *      Absent on a staging box (the canonical catalog is the only input there).
 *
 * .local/test-personas.json shape — a JSON array of PersonaSpec objects (see
 * personaFactory.ts for the full type; canonicalPersonas.ts for live examples):
 *
 *   [
 *     // slug, displayName, tier, and a non-empty coverageNotes[] are required.
 *     {
 *       "slug": "my_tier1_legacy",
 *       "displayName": "My Local Tester",
 *       "tier": "tier1",
 *       "payments": [{ "type": "membership", "status": "succeeded", "purchasedTier": "tier1" }],
 *       "legacy": { "linked": false },
 *       "coverageNotes": ["tier1", "unlinked legacy match"]
 *     }
 *   ]
 *
 * No checked-in `.example` template exists (the entire .local/ tree is
 * gitignored); this JSDoc plus canonicalPersonas.ts are the schema reference,
 * mirroring how the dev-admin seed documents .local/dev-admin-seed.json.
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
import * as path from 'node:path';
import { TEST_PERSONA_SEED_PASSWORD_LITERAL } from './personaSecrets';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
import { seedPersona } from './personaFactory';
import { parseDbArg } from './seedCli';
import { loadLocalPersonas } from './personaSchemaValidator';

export async function main(): Promise<number> {
  const repoRoot = path.resolve(__dirname, '..', '..');
  const { dbPath } = parseDbArg(process.argv.slice(2));
  const env = process.env.FOOTBAG_ENV ?? '<unset>';

  if (!existsSync(dbPath)) {
    console.error(`[persona-seed] DB file not found: ${dbPath}`);
    return 1;
  }

  const specs = [...CANONICAL_PERSONAS, ...loadLocalPersonas(repoRoot)];
  console.log(`[persona-seed] env=${env} specs=${specs.length}`);

  const passwordHash = await argon2.hash(TEST_PERSONA_SEED_PASSWORD_LITERAL);
  const db = new BetterSqlite3(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  const existsBySlug = db.prepare(`SELECT 1 FROM members WHERE slug = ?`);
  let created = 0;
  let skipped = 0;
  try {
    for (const spec of specs) {
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

  console.log(`[persona-seed] done. created=${created} skipped=${skipped}`);
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
