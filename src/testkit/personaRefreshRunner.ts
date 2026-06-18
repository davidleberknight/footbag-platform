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
 * Scope is persona-owned rows: members whose id matches member_persona_%, their
 * deterministic legacy roots (legmem_persona_<slug> and the club-leader fallback
 * legmem_persona_<slug>_club), the random-id rows reachable only by FK from
 * those roots (seeded clubs, tags, candidates, affiliations, bootstrap
 * leaders/signals, name variants), and every row a tester session can mint as a
 * persona through deployed flows: account tokens, declared anchors, outbox
 * emails, audit rows the persona acted in, media items, galleries, payments and
 * their status transitions, work-queue items about the persona, media jobs,
 * and expiry-reminder rows. Work-queue items a persona RESOLVED about other
 * entities keep their decision history and only lose the resolver reference.
 * Claim flows converge in both directions: a real legacy account a persona
 * claimed is released (claimable again), and a real member who claimed a
 * persona identity is detached from it before the persona rows go. Clubs are
 * deleted only when persona-seeded (the deterministic club-test- id prefix):
 * a real club a persona joined keeps its row and loses only the persona's
 * membership/leader rows, and a club a persona created through the app
 * survives leaderless rather than risk deleting a shared row. Shared parents
 * (e.g. the announce mailing_lists row) and any non-persona data are never
 * touched, with one counted exception: tier/active-player grants a persona
 * AUTHORED on other members are removed (reverting those members to pre-test
 * state) and the count is reported in the result. If a tester reached a table
 * this routine still does not own (e.g. vouches), the member delete hits a FK
 * RESTRICT and the whole transaction rolls back loudly rather than corrupting
 * state. Accepted residue after a refresh: orphaned media files on disk for
 * persona uploads, and TEXT created_by/updated_by stamps on real rows that
 * carry a torn-down persona id.
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
import {
  seedPersona,
  normalizeNameForVariant,
  PERSONA_SEED_CREATED_BY,
  PERSONA_SWITCH_AUDIT_ACTION_TYPE,
} from './personaFactory';
import type { PersonaSpec } from './personaFactory';

/**
 * The append-only BEFORE DELETE triggers covering tables a persona writes. These
 * are dropped for the duration of the teardown and recreated from their captured
 * sqlite_master definitions. The payment-transition and expiry-reminder ledgers
 * are included because deployed flows (tier purchase, the expiry worker) append
 * rows for personas; leaving either trigger in place would abort the teardown.
 */
const APPEND_ONLY_DELETE_TRIGGERS = [
  'trg_tier_grants_no_delete',
  'trg_active_player_grants_no_delete',
  'trg_audit_no_delete',
  'trg_payment_transitions_no_delete',
  'trg_active_player_reminder_sent_no_delete',
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
  /**
   * Tier/active-player ledger rows a persona AUTHORED on other members
   * (actor_member_id = persona) that the reset removed. Those members revert
   * to their pre-test state; the count makes that reversion visible in the
   * refresh audit row instead of silent.
   */
  actorGrantRowsRemoved: number;
  /**
   * Media-store object keys (thumb/display) for every media_item a persona
   * uploaded, captured before the rows are deleted. This routine is DB-only;
   * the async refresh route deletes these bytes after the transaction commits.
   */
  deletedMediaKeys: string[];
}

function placeholders(n: number): string {
  return new Array(n).fill('?').join(', ');
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}

/**
 * Tear down all persona-owned rows and re-seed the canonical catalog.
 * Synchronous: runs inside a single better-sqlite3 transaction.
 */
export function refreshAllPersonas(
  db: BetterSqlite3.Database,
  opts: RefreshPersonasOptions = {},
): RefreshResult {
  const specs: PersonaSpec[] = CANONICAL_PERSONAS;

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

  // Two-column variant: DELETE … WHERE colA IN (…) OR colB IN (…). Either side
  // with an empty id set is dropped from the predicate; both empty is a no-op.
  const delIn2 = (
    table: string,
    colA: string,
    idsA: string[],
    colB: string,
    idsB: string[],
  ): number => {
    const parts: string[] = [];
    const params: string[] = [];
    if (idsA.length > 0) {
      parts.push(`${colA} IN (${placeholders(idsA.length)})`);
      params.push(...idsA);
    }
    if (idsB.length > 0) {
      parts.push(`${colB} IN (${placeholders(idsB.length)})`);
      params.push(...idsB);
    }
    if (parts.length === 0) return 0;
    return db.prepare(`DELETE FROM ${table} WHERE ${parts.join(' OR ')}`).run(...params).changes;
  };

  const run = db.transaction((): RefreshResult => {
    // 1. Discover persona members actually present, by deterministic id prefix.
    //    Covers every seeded persona plus any whose spec was removed from the
    //    catalog since seeding (orphans), so a refresh always converges to it.
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
    let personaPaymentIds: string[] = [];
    let personHpIds: string[] = [];
    const nameVariantKeys: Array<[string, string]> = [];

    if (memberIds.length > 0) {
      personHpIds = col(
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
      // Keep only persona-seeded clubs (deterministic id prefix). A real club a
      // persona merely joined must survive: deleting it would destroy shared
      // data, and the persona's membership rows are removed separately anyway.
      clubIds = clubIds.length
        ? col(
            `SELECT id FROM clubs
              WHERE id IN (${placeholders(clubIds.length)}) AND id LIKE 'club-test-%'`,
            clubIds,
          )
        : [];
      // Captured before the payments delete; the transition rows are reachable
      // only through their payment ids.
      personaPaymentIds = col(
        `SELECT id FROM payments WHERE member_id IN (${placeholders(memberIds.length)})`,
        memberIds,
      );
      const clubTagIds = clubIds.length
        ? col(
            `SELECT hashtag_tag_id FROM clubs WHERE id IN (${placeholders(clubIds.length)})`,
            clubIds,
          )
        : [];
      // Member-owned named galleries seeded for a persona carry a `#by_<slug>`
      // uploader tag; include those so the tag and its links are torn down too.
      const galleryTagIds = memberIds.length
        ? col(
            `SELECT DISTINCT mgt.tag_id
               FROM member_gallery_tags mgt
               JOIN member_galleries g ON g.id = mgt.gallery_id
              WHERE g.owner_member_id IN (${placeholders(memberIds.length)})`,
            memberIds,
          )
        : [];
      tagIds = unique([...clubTagIds, ...galleryTagIds]);

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
    // Tokens go before the audit rows, anchors, and legacy roots their target_*
    // columns reference, so no token is ever left pointing at a deleted row.
    delIn2('account_tokens', 'member_id', memberIds, 'target_legacy_member_id', legacyRoots);
    delIn('member_declared_anchors', 'member_id', memberIds);
    delIn2('outbox_emails', 'recipient_member_id', memberIds, 'sender_member_id', memberIds);
    // Work-queue items about a persona are torn down with it. Items a persona
    // RESOLVED about other entities keep their decision history and lose only
    // the resolver reference (nullable column, no append-only guard).
    if (memberIds.length > 0) {
      db.prepare(
        `DELETE FROM work_queue_items
          WHERE entity_type = 'member' AND entity_id IN (${placeholders(memberIds.length)})`,
      ).run(...memberIds);
      db.prepare(
        `UPDATE work_queue_items SET resolved_by_member_id = NULL
          WHERE resolved_by_member_id IN (${placeholders(memberIds.length)})`,
      ).run(...memberIds);
    }
    delIn('media_jobs', 'admin_member_id', memberIds);
    // media_tags and media_flags cascade; members.avatar_media_id and
    // clubs.logo_media_id are SET NULL, so no ordering hazard. The uploaded
    // media's storage-object keys are captured first so the async refresh route
    // can delete the bytes after this DB-only transaction commits.
    const deletedMediaKeys = unique(
      (memberIds.length
        ? (db
            .prepare(
              `SELECT s3_key_thumb, s3_key_display FROM media_items
               WHERE uploader_member_id IN (${placeholders(memberIds.length)})`,
            )
            .all(...memberIds) as { s3_key_thumb: string | null; s3_key_display: string | null }[])
        : []
      )
        .flatMap((r) => [r.s3_key_thumb, r.s3_key_display])
        .filter((k): k is string => !!k),
    );
    delIn('media_items', 'uploader_member_id', memberIds);
    delIn('member_galleries', 'owner_member_id', memberIds); // gallery tag/link children cascade
    delIn2('club_viability_signals', 'member_id', memberIds, 'club_id', clubIds);
    delIn2('club_leaders', 'member_id', memberIds, 'club_id', clubIds);
    delIn('club_cleanup_resolutions', 'club_id', clubIds);
    // Candidate-keyed defer rows must go before the candidate delete below;
    // the deferred_by pass also removes a persona admin's defer on a REAL
    // candidate (the member FK would block the member delete, and dropping
    // the row just reverts that candidate to undeferred).
    delIn2('candidate_cleanup_resolutions', 'candidate_id', candidateIds, 'deferred_by_member_id', memberIds);
    // Claim markers are expiring coordination hints, safe to drop: the
    // claimant pass unblocks the member delete, the item pass covers claims
    // by anyone on a persona club or candidate (ids are unique across both
    // tables, so a single item_id pass addresses both item types).
    delIn('club_cleanup_claims', 'claimed_by_member_id', memberIds);
    delIn('club_cleanup_claims', 'item_id', [...clubIds, ...candidateIds]);
    // A persona acting as admin can stamp grants on other members; those rows
    // would otherwise block the member delete, and removing them reverts the
    // affected member to pre-test state (latest-row-wins ledgers), so the
    // actor pass is counted and reported. The club-scoped pass catches a
    // NON-persona member who joined a persona club: their join grant
    // references the doomed club and its affiliation row, so it must go
    // before the affiliations below. All passes run guard-dropped.
    delIn('active_player_grants', 'member_id', memberIds);
    const apActorRowsRemoved = delIn('active_player_grants', 'actor_member_id', memberIds);
    delIn('active_player_grants', 'related_club_id', clubIds);
    // member side covers the persona's own memberships; club side covers a
    // non-persona member who joined a persona club (the club is deleted, so
    // every row referencing it has to go, whoever owns it).
    delIn2('member_club_affiliations', 'member_id', memberIds, 'club_id', clubIds);
    delIn('mailing_list_subscriptions', 'member_id', memberIds); // shared mailing_lists parent left intact
    delIn('member_onboarding_tasks', 'member_id', memberIds);
    delIn('active_player_reminder_sent', 'member_id', memberIds); // guard dropped
    delIn('member_tier_grants', 'member_id', memberIds); // guard dropped — removes the stuck upgrade grant
    const tierActorRowsRemoved = delIn('member_tier_grants', 'actor_member_id', memberIds); // counted: reverts other members' tiers
    delIn('payment_status_transitions', 'payment_id', personaPaymentIds); // guard dropped
    delIn('payments', 'member_id', memberIds);
    // Audit rows where a persona was the actor block the member delete. Rows
    // merely ABOUT a persona but written by a non-persona actor survive: they
    // carry no member FK and deleting them would erase real audit history.
    delIn('audit_entries', 'actor_member_id', memberIds); // guard dropped
    if (memberIds.length > 0) {
      db.prepare(
        `DELETE FROM audit_entries
          WHERE created_by = ? AND entity_id IN (${placeholders(memberIds.length)})`,
      ).run(PERSONA_SEED_CREATED_BY, ...memberIds); // guard dropped; only seed-marked rows
      // Harness-origin switch rows carry a NULL actor (system-issued), so the
      // actor pass above misses them and they would pile up one per /dev/switch.
      db.prepare(
        `DELETE FROM audit_entries
          WHERE action_type = ? AND entity_id IN (${placeholders(memberIds.length)})`,
      ).run(PERSONA_SWITCH_AUDIT_ACTION_TYPE, ...memberIds); // guard dropped
    }
    if (memberIds.length > 0) {
      // Break the members↔legacy_members claim cycle before deleting members:
      // members.legacy_member_id → legacy_members, and (for a linked persona)
      // legacy_members.claimed_by_member_id → members. Null both claim columns
      // together to satisfy the both-null-or-both-set CHECK. claimed_by is also
      // matched directly: a persona can claim a REAL legacy account through the
      // normal claim flows, and that row must be un-claimed (made claimable
      // again) before the persona member row goes.
      db.prepare(
        `UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL
          WHERE legacy_member_id IN (${placeholders(legacyRoots.length)})
             OR claimed_by_member_id IN (${placeholders(memberIds.length)})`,
      ).run(...legacyRoots, ...memberIds);
    }
    const deletedMembers = delIn('members', 'id', memberIds); // before legacy/HP (NO ACTION FKs)
    // The reverse claim direction: a real member may have claimed a persona
    // identity (synthetic surnames are claimable through the normal flows).
    // Detach those links so the persona HP/legacy rows below can go; only
    // non-persona members remain at this point.
    if (legacyRoots.length > 0) {
      db.prepare(
        `UPDATE members SET legacy_member_id = NULL
          WHERE legacy_member_id IN (${placeholders(legacyRoots.length)})`,
      ).run(...legacyRoots);
    }
    if (personHpIds.length > 0) {
      db.prepare(
        `UPDATE members SET historical_person_id = NULL
          WHERE historical_person_id IN (${placeholders(personHpIds.length)})`,
      ).run(...personHpIds);
    }
    delIn('legacy_club_candidates', 'id', candidateIds);
    delIn('clubs', 'id', clubIds);
    // A non-persona member can attach a persona club's hashtag to their own
    // media or galleries; those association rows reference the doomed tag and
    // must go first. Only the association is lost, never the member's media.
    delIn('media_tags', 'tag_id', tagIds);
    delIn('member_gallery_tags', 'tag_id', tagIds);
    delIn('member_gallery_exclude_tags', 'tag_id', tagIds);
    delIn('tag_stats', 'tag_id', tagIds);
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

    // 5. Re-seed the current catalog (full rebuild — no skip-if-exists). Blocked
    //    personas have no built feature to seed, so they are skipped: they keep
    //    no member row and render greyed on /dev/personas.
    let reseeded = 0;
    for (const spec of specs) {
      if (spec.blockedBy) continue;
      seedPersona(db, spec, opts.passwordHash ? { passwordHash: opts.passwordHash } : {});
      reseeded += 1;
    }

    return {
      deletedMembers,
      reseeded,
      actorGrantRowsRemoved: tierActorRowsRemoved + apActorRowsRemoved,
      deletedMediaKeys,
    };
  });

  return run();
}
