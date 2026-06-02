/**
 * Persona refresh: rebuild every seeded persona back to its canonical initial
 * state, in place, touching only persona-owned rows.
 *
 * Why this exists: a tester acting as a persona (via /dev/switch) exercises real
 * app flows that append to the persistent ledgers — most visibly a tier upgrade,
 * which appends a member_tier_grants row so member_tier_current reports the new
 * tier permanently. Re-running the seed runner cannot undo that: it skips slugs
 * that already exist, and even a fresh grant would lose the latest-row race
 * because seed grants are stamped 2025-01-01 while an in-app upgrade is stamped
 * "now". So the only way back to the seeded baseline is to delete the persona's
 * rows (the upgrade grant included) and re-seed.
 *
 * The membership ledgers (member_tier_grants, active_player_grants, audit_entries)
 * are append-only: BEFORE DELETE triggers RAISE(ABORT). To delete persona rows
 * from them this routine temporarily drops exactly those three triggers, deletes,
 * then recreates them from their own definitions captured out of sqlite_master.
 * Everything runs inside one synchronous transaction, so any failure rolls the
 * DDL back and the triggers are restored — the guard is never left off.
 *
 * Scope is strictly persona-owned rows: members whose id matches
 * member_persona_%, their deterministic legacy roots (legmem_persona_<slug> and
 * the club-leader fallback legmem_persona_<slug>_club), and the random-id rows
 * reachable only by FK from those roots (clubs, tags, candidates, affiliations,
 * bootstrap leaders/signals, name variants). Shared parents (e.g. the announce
 * mailing_lists row) and any non-persona data are never touched. If a tester
 * created rows in a table this routine does not own (e.g. media), the member
 * delete will hit a FK RESTRICT and the whole transaction rolls back loudly
 * rather than corrupting state.
 *
 * Permanent test scaffolding under src/testkit/ (raw SQL allowlisted here, same
 * as the row builders). Reuses the app's shared db connection — never opens a
 * second one. The password hash is passed in by the caller (the dev route reads
 * the env-guarded persona secret); tests omit it and reseed with the placeholder
 * hash, so this module imports nothing env-gated and is safe to load with
 * FOOTBAG_ENV unset under Vitest.
 */
import BetterSqlite3 from 'better-sqlite3';
import { CANONICAL_PERSONAS } from './canonicalPersonas';
import { loadLocalPersonas } from './personaSchemaValidator';
import {
  seedPersona,
  normalizeNameForVariant,
  PERSONA_SEED_CREATED_BY,
} from './personaFactory';
import type { PersonaSpec } from './personaFactory';

/**
 * The append-only BEFORE DELETE triggers covering tables a persona writes. These
 * are dropped for the duration of the teardown and recreated from their captured
 * sqlite_master definitions. (payment_status_transitions is also append-only but
 * personas never write it, so its trigger is left alone — see insertPayment.)
 */
const APPEND_ONLY_DELETE_TRIGGERS = [
  'trg_tier_grants_no_delete',
  'trg_active_player_grants_no_delete',
  'trg_audit_no_delete',
];

export interface RefreshPersonasOptions {
  /**
   * Pre-computed argon2 hash applied to each reseeded member so a tester can log
   * in through the normal form. Omitted in tests (members get the factory's
   * placeholder hash and authenticate via cookie issuance instead).
   */
  passwordHash?: string;
}

export interface RefreshResult {
  deletedMembers: number;
  reseeded: number;
}

function placeholders(n: number): string {
  return new Array(n).fill('?').join(', ');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Tear down all persona-owned rows and re-seed the canonical (+ optional .local)
 * catalog. Synchronous: runs inside a single better-sqlite3 transaction.
 */
export function refreshAllPersonas(
  db: BetterSqlite3.Database,
  repoRoot: string,
  opts: RefreshPersonasOptions = {},
): RefreshResult {
  const specs: PersonaSpec[] = [...CANONICAL_PERSONAS, ...loadLocalPersonas(repoRoot)];

  // First column of every row as a string, dropping nulls. Used to pull id sets
  // out of the FK graph before the linking rows are deleted.
  const col = (sql: string, params: string[]): string[] =>
    (db.prepare(sql).all(...params) as Record<string, unknown>[])
      .map((r) => Object.values(r)[0] as string | null)
      .filter((v): v is string => v != null);

  // DELETE … WHERE column IN (…); no-op on an empty id set (IN () is invalid).
  // table/column are code constants, never caller input — no injection surface.
  const delIn = (table: string, column: string, ids: string[]): number => {
    if (ids.length === 0) return 0;
    return db
      .prepare(`DELETE FROM ${table} WHERE ${column} IN (${placeholders(ids.length)})`)
      .run(...ids).changes;
  };

  const run = db.transaction((): RefreshResult => {
    // 1. Discover persona members actually present, by deterministic id prefix.
    //    Covers every seeded persona plus any whose .local spec was removed since
    //    seeding (orphans), so a refresh always converges to the current catalog.
    const memberRows = db
      .prepare(`SELECT id, slug FROM members WHERE id LIKE 'member_persona_%'`)
      .all() as { id: string; slug: string }[];
    const memberIds = memberRows.map((r) => r.id);
    // Two deterministic legacy roots per slug: the legacy-claim identity and the
    // club-leader fallback identity (personaFactory seeds one or the other).
    const legacyRoots = memberRows.flatMap((r) => [
      `legmem_persona_${r.slug}`,
      `legmem_persona_${r.slug}_club`,
    ]);

    // 2. Snapshot random-id rows reachable only by FK from the persona roots,
    //    BEFORE deleting the linking rows (afterwards they are unreachable).
    let lpcaIds: string[] = [];
    let candidateIds: string[] = [];
    let leaderIds: string[] = [];
    let clubIds: string[] = [];
    let tagIds: string[] = [];
    const nameVariantKeys: Array<[string, string]> = [];

    if (memberIds.length > 0) {
      const personHpIds = col(
        `SELECT person_id FROM historical_persons WHERE legacy_member_id IN (${placeholders(legacyRoots.length)})`,
        legacyRoots,
      );

      // Legacy person↔club affiliations owned by these personas, reached via a
      // legacy root or a persona historical person.
      const lpcaWhere =
        `legacy_member_id IN (${placeholders(legacyRoots.length)})` +
        (personHpIds.length
          ? ` OR historical_person_id IN (${placeholders(personHpIds.length)})`
          : '');
      const lpcaRows = db
        .prepare(
          `SELECT id, legacy_club_candidate_id, resolved_club_id
             FROM legacy_person_club_affiliations
            WHERE ${lpcaWhere}`,
        )
        .all(...legacyRoots, ...personHpIds) as {
        id: string;
        legacy_club_candidate_id: string | null;
        resolved_club_id: string | null;
      }[];
      lpcaIds = lpcaRows.map((r) => r.id);
      candidateIds = unique(
        lpcaRows.map((r) => r.legacy_club_candidate_id).filter((v): v is string => v != null),
      );
      const resolvedClubIds = lpcaRows
        .map((r) => r.resolved_club_id)
        .filter((v): v is string => v != null);

      const candidateClubIds = candidateIds.length
        ? col(
            `SELECT mapped_club_id FROM legacy_club_candidates
              WHERE id IN (${placeholders(candidateIds.length)}) AND mapped_club_id IS NOT NULL`,
            candidateIds,
          )
        : [];

      const affiliationClubIds = col(
        `SELECT club_id FROM member_club_affiliations WHERE member_id IN (${placeholders(memberIds.length)})`,
        memberIds,
      );

      const leaderRows = db
        .prepare(
          `SELECT id, club_id FROM club_bootstrap_leaders
            WHERE claimed_member_id IN (${placeholders(memberIds.length)})
               OR legacy_member_id IN (${placeholders(legacyRoots.length)})`,
        )
        .all(...memberIds, ...legacyRoots) as { id: string; club_id: string }[];
      leaderIds = leaderRows.map((r) => r.id);
      const leaderClubIds = leaderRows.map((r) => r.club_id).filter((v): v is string => v != null);

      clubIds = unique([
        ...affiliationClubIds,
        ...leaderClubIds,
        ...candidateClubIds,
        ...resolvedClubIds,
      ]);
      tagIds = clubIds.length
        ? col(
            `SELECT hashtag_tag_id FROM clubs WHERE id IN (${placeholders(clubIds.length)})`,
            clubIds,
          )
        : [];

      // name_variants are written only for a `medium` auto-link persona, linking
      // its member real_name to the historical-person middle-token name. The row
      // has no id and no FK to the persona, so it is identified by recomputing the
      // (canonical, variant) normalized-name key from the persona's own DB rows.
      // Persona names are synthetic, so an exact-key collision with a real
      // name_variants row is negligible. Non-medium personas have no such row, so
      // these deletes are no-ops for them.
      for (const { id, slug } of memberRows) {
        const member = db.prepare(`SELECT real_name FROM members WHERE id = ?`).get(id) as
          | { real_name: string }
          | undefined;
        const hp = db
          .prepare(`SELECT person_name FROM historical_persons WHERE legacy_member_id = ?`)
          .get(`legmem_persona_${slug}`) as { person_name: string } | undefined;
        if (member && hp) {
          nameVariantKeys.push([
            normalizeNameForVariant(hp.person_name),
            normalizeNameForVariant(member.real_name),
          ]);
        }
      }
    }

    // 3. Capture the append-only DELETE triggers so they can be restored.
    const triggerRows = db
      .prepare(
        `SELECT name, sql FROM sqlite_master
          WHERE type='trigger' AND name IN (${placeholders(APPEND_ONLY_DELETE_TRIGGERS.length)})`,
      )
      .all(...APPEND_ONLY_DELETE_TRIGGERS) as { name: string; sql: string }[];
    if (triggerRows.length !== APPEND_ONLY_DELETE_TRIGGERS.length) {
      throw new Error(
        `persona refresh: expected ${APPEND_ONLY_DELETE_TRIGGERS.length} append-only DELETE triggers, found ${triggerRows.length} (schema drift)`,
      );
    }

    // 4. Drop the guards, delete persona rows child→parent, restore the guards.
    for (const name of APPEND_ONLY_DELETE_TRIGGERS) {
      db.exec(`DROP TRIGGER ${name}`);
    }

    delIn('club_bootstrap_leader_signals', 'bootstrap_leader_id', leaderIds);
    delIn('club_bootstrap_leaders', 'id', leaderIds);
    delIn('legacy_person_club_affiliations', 'id', lpcaIds);
    delIn('member_club_affiliations', 'member_id', memberIds);
    delIn('mailing_list_subscriptions', 'member_id', memberIds); // shared mailing_lists parent left intact
    delIn('member_onboarding_tasks', 'member_id', memberIds);
    delIn('active_player_grants', 'member_id', memberIds); // guard dropped
    delIn('member_tier_grants', 'member_id', memberIds); // guard dropped — removes the stuck upgrade grant
    delIn('payments', 'member_id', memberIds);
    if (memberIds.length > 0) {
      db.prepare(
        `DELETE FROM audit_entries
          WHERE created_by = ? AND entity_id IN (${placeholders(memberIds.length)})`,
      ).run(PERSONA_SEED_CREATED_BY, ...memberIds); // guard dropped; only seed-marked rows
    }
    if (legacyRoots.length > 0) {
      // Break the members↔legacy_members claim cycle before deleting members:
      // members.legacy_member_id → legacy_members, and (for a linked persona)
      // legacy_members.claimed_by_member_id → members. Null both claim columns
      // together to satisfy the both-null-or-both-set CHECK.
      db.prepare(
        `UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL
          WHERE legacy_member_id IN (${placeholders(legacyRoots.length)})`,
      ).run(...legacyRoots);
    }
    const deletedMembers = delIn('members', 'id', memberIds); // before legacy/HP (NO ACTION FKs)
    delIn('legacy_club_candidates', 'id', candidateIds);
    delIn('clubs', 'id', clubIds);
    delIn('tags', 'id', tagIds);
    delIn('historical_persons', 'legacy_member_id', legacyRoots);
    delIn('legacy_members', 'legacy_member_id', legacyRoots);
    for (const [canonical, variant] of nameVariantKeys) {
      db.prepare(
        `DELETE FROM name_variants WHERE canonical_normalized = ? AND variant_normalized = ?`,
      ).run(canonical, variant);
    }

    for (const { sql } of triggerRows) {
      db.exec(sql);
    }

    // 5. Re-seed the current catalog (full rebuild — no skip-if-exists).
    for (const spec of specs) {
      seedPersona(db, spec, opts.passwordHash ? { passwordHash: opts.passwordHash } : {});
    }

    return { deletedMembers, reseeded: specs.length };
  });

  return run();
}
