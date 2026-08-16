/**
 * One seed pass over the persona catalog, separated from the CLI that drives it.
 *
 * It lives apart from `personaSeedRunner` for one reason: that module imports
 * the persona seed password, and that import is refused outside development and
 * staging so the harness cannot be pulled into a production build. The loop
 * itself needs no secret, and its tests have to import it, so keeping the two in
 * one file would mean either weakening the guard or leaving the loop untested.
 */
import BetterSqlite3 from 'better-sqlite3';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
import { seedPersona } from './personaFactory';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../lib/personaGuards';

/** What one seed pass did, for the caller to report and for tests to assert. */
export interface SeedPersonasResult {
  created: number;
  healed: number;
  skipped: number;
  skippedBlocked: number;
  orphanSlugs: string[];
  failedSlugs: string[];
}

/**
 * One seed pass over the catalog against an open database: add what is missing,
 * leave what is already there, heal a stale password hash in place, and report
 * personas the catalog no longer carries. Exported separately from `main` so it
 * can be driven against a real test database without the CLI's argv parsing and
 * env-gated persona secret, matching how `refreshAllPersonas` is tested.
 *
 * Never throws for one persona's sake: every failure is collected by slug so a
 * single bad row cannot hide the rest of the catalog from the operator.
 */
export function seedPersonas(
  db: BetterSqlite3.Database,
  specs: typeof CANONICAL_PERSONAS,
  passwordHash: string,
): SeedPersonasResult {
  // Identity is the derived member id, not the slug. The platform rewrites a
  // slug when it purges a member, so a purged persona goes on existing under
  // its original id with a slug the catalog has never heard of. Keying this
  // lookup on the slug made the seed miss such a row, try to create the persona
  // again, and fail on the unique member id it had never released.
  const personaId = (slug: string): string => `${SEEDED_PERSONA_MEMBER_ID_PREFIX}${slug}`;
  const findById = db.prepare(
    `SELECT password_hash AS passwordHash FROM members WHERE id = ?`,
  );
  // Re-hash a persona whose stored hash predates the current argon2id scheme,
  // in place, without disturbing the persona's accumulated rows. The seed is
  // idempotent by persona, so an old persona kept by successive code-only
  // deploys would otherwise carry a stale hash forever; this heals it on every
  // seed run so no rebuild or manual refresh is needed.
  const rehashById = db.prepare(
    `UPDATE members
        SET password_hash = ?, password_changed_at = ?, password_version = password_version + 1,
            updated_at = ?, updated_by = 'system', version = version + 1
      WHERE id = ?`,
  );
  const isCurrentScheme = (hash: unknown): boolean =>
    typeof hash === 'string' && hash.startsWith('$argon2id$');
  // A persona can legitimately hold no hash at all: the deceased persona has
  // login disabled, a purged one has had every credential cleared, and the
  // system member never had any. Absent is not stale, and the difference is
  // load-bearing rather than cosmetic. The members credentials CHECK admits
  // only three row shapes -- full credentials with no purge timestamp, no
  // credentials with one, or a system account -- so writing a hash onto a row
  // whose login_email is NULL matches none of them and SQLite refuses the
  // write. Reading absent as stale is what made a second seed run abort on the
  // eighth persona and never look at the sixty-five behind it.
  const hasStoredHash = (hash: unknown): boolean => typeof hash === 'string' && hash.length > 0;

  let created = 0;
  let healed = 0;
  let skipped = 0;
  let skippedBlocked = 0;
  const failedSlugs: string[] = [];

  for (const spec of specs) {
    if (spec.blockedBy) {
      // The persona's feature is not built yet, so there is nothing to seed.
      // It still lives in the catalog and renders greyed on /dev/personas.
      skippedBlocked += 1;
      console.log(`[persona-seed] skip (blocked: ${spec.blockedBy}): ${spec.slug}`);
      continue;
    }
    // Name the persona that failed and keep going, whichever branch failed. A
    // create rolls its own transaction back, so the database holds no partial
    // persona, and the caller reports a non-zero exit once every offender has
    // been named. The re-hash belongs inside this same guard: it is the branch
    // that used to throw past the loop and truncate the catalog.
    try {
      const existing = findById.get(personaId(spec.slug)) as
        | { passwordHash: unknown }
        | undefined;
      if (existing) {
        if (!hasStoredHash(existing.passwordHash)) {
          skipped += 1;
          console.log(`[persona-seed] skip (exists, login disabled): ${spec.slug}`);
        } else if (isCurrentScheme(existing.passwordHash)) {
          skipped += 1;
          console.log(`[persona-seed] skip (exists): ${spec.slug}`);
        } else {
          const now = new Date().toISOString();
          rehashById.run(passwordHash, now, now, personaId(spec.slug));
          healed += 1;
          console.log(`[persona-seed] re-hashed stale password: ${spec.slug}`);
        }
        continue;
      }
      db.transaction(() => seedPersona(db, spec, { passwordHash }))();
      created += 1;
      console.log(`[persona-seed] seeded persona: ${spec.slug} (${spec.tier})`);
    } catch (err) {
      failedSlugs.push(spec.slug);
      const detail = err instanceof Error ? err.message : String(err);
      console.error(`[persona-seed] FAILED ${spec.slug}: ${detail}`);
    }
  }

  // A persona the catalog no longer carries. It survives every future seed run
  // (the loop only visits current specs), so it goes on answering to
  // /dev/switch as a persona nothing in code describes. Matched on the id for
  // the same reason the lookup above is: a purged persona keeps its id and
  // loses its slug, and reporting it as an orphan on that basis would send an
  // operator hunting for a persona the catalog does describe.
  const catalogIds = new Set(specs.map((s) => personaId(s.slug)));
  const orphanSlugs = (
    db
      .prepare(`SELECT id, slug FROM members WHERE id LIKE ? ORDER BY slug`)
      .all(`${SEEDED_PERSONA_MEMBER_ID_PREFIX}%`) as { id: string; slug: string }[]
  )
    .filter((r) => !catalogIds.has(r.id))
    .map((r) => r.slug);

  return { created, healed, skipped, skippedBlocked, orphanSlugs, failedSlugs };
}
