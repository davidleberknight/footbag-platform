/**
 * refreshAllPersonas — scoped persona teardown + reseed.
 *
 * Real SQLite (no mocks). Each test builds a fresh schema, seeds the canonical
 * catalog by calling refreshAllPersonas against an empty DB, then exercises one
 * dimension.
 *
 * No passwordHash is passed: seeded members get the factory placeholder hash, so
 * the module never imports the env-gated persona secret (FOOTBAG_ENV is unset
 * under Vitest).
 */
import { describe, it, expect, afterAll, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { refreshAllPersonas } from '../../src/testkit/personaRefreshRunner';
import {
  insertMember,
  insertClub,
  insertLegacyMember,
  insertMemberClubAffiliation,
  insertMemberTierGrant,
  insertAuditEntry,
  insertPayment,
  insertLegacyClubCandidate,
} from '../../src/testkit/personaRowBuilders';
import { insertOutboxEmail } from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');

const T1 = 'member_persona_t1_paid';
const T2 = 'member_persona_t2_paid';

let db: BetterSqlite3.Database;

const tierOf = (memberId: string): string | undefined =>
  (db.prepare(`SELECT tier_status FROM member_tier_current WHERE member_id = ?`).get(memberId) as
    | { tier_status: string }
    | undefined)?.tier_status;

const count = (sql: string, ...params: unknown[]): number =>
  (db.prepare(sql).get(...params) as { n: number }).n;

afterAll(() => {
  cleanupTestDb(dbPath);
});

beforeEach(() => {
  cleanupTestDb(dbPath);
  db = createTestDb(dbPath);
  // Baseline: seed the canonical catalog from an empty DB.
  refreshAllPersonas(db);
});

afterEach(() => {
  db.close();
});

describe('refreshAllPersonas', () => {
  it('resets a tier upgrade that stuck in the append-only ledger', () => {
    expect(tierOf(T1)).toBe('tier1');

    // Simulate an in-app upgrade: a later-stamped grant wins member_tier_current.
    insertMemberTierGrant(db, {
      member_id: T1,
      new_tier_status: 'tier2',
      created_at: '2026-01-01T00:00:00.000Z',
      reason_code: 'purchase.tier2',
    });
    expect(tierOf(T1)).toBe('tier2');

    refreshAllPersonas(db);

    // Back to the seeded tier, and the upgrade grant is physically gone — proving
    // the row was deleted, not merely out-voted by a fresh seed grant.
    expect(tierOf(T1)).toBe('tier1');
    const grants = db
      .prepare(`SELECT created_at, new_tier_status FROM member_tier_grants WHERE member_id = ?`)
      .all(T1) as { created_at: string; new_tier_status: string }[];
    expect(grants).toHaveLength(1);
    expect(grants[0].new_tier_status).toBe('tier1');
    expect(grants.some((g) => g.created_at === '2026-01-01T00:00:00.000Z')).toBe(false);
  });

  it('rebuilds persona-owned rows including legacy identity and name variants', () => {
    // Linked legacy persona keeps its deterministic legacy root.
    expect(count(`SELECT COUNT(*) AS n FROM legacy_members WHERE legacy_member_id = ?`, 'legmem_persona_legacy_linked')).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = ?`, 'member_persona_legacy_linked')).toBe(1);
    // The medium auto-link persona seeds a name_variants row.
    expect(count(`SELECT COUNT(*) AS n FROM historical_persons WHERE legacy_member_id = ?`, 'legmem_persona_autolink_medium')).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM name_variants`)).toBeGreaterThan(0);
  });

  it('leaves non-persona data untouched', () => {
    insertMember(db, { id: 'member-outsider-1', slug: 'outsider_1' });
    insertMemberTierGrant(db, { member_id: 'member-outsider-1', new_tier_status: 'tier1' });
    insertClub(db, { id: 'club-outsider-1' });
    // An audit row referencing a persona member but written by a non-persona actor.
    insertAuditEntry(db, {
      created_by: 'real-system',
      action_type: 'real_event',
      entity_id: T1,
    });
    // The shared mailing_lists parent (seeded by ml_subscribed) must survive teardown.
    expect(count(`SELECT COUNT(*) AS n FROM mailing_lists WHERE slug = 'announce'`)).toBe(1);

    refreshAllPersonas(db);

    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = 'member-outsider-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants WHERE member_id = 'member-outsider-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM clubs WHERE id = 'club-outsider-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM audit_entries WHERE created_by = 'real-system'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM mailing_lists WHERE slug = 'announce'`)).toBe(1);
  });

  it('is idempotent: repeated refreshes do not accumulate or throw', () => {
    const personaMembers = () => count(`SELECT COUNT(*) AS n FROM members WHERE id LIKE 'member_persona_%'`);
    const clubs = () => count(`SELECT COUNT(*) AS n FROM clubs`);
    const tags = () => count(`SELECT COUNT(*) AS n FROM tags`);
    const variants = () => count(`SELECT COUNT(*) AS n FROM name_variants`);

    const m0 = personaMembers();
    const c0 = clubs();
    const t0 = tags();
    const v0 = variants();

    expect(() => refreshAllPersonas(db)).not.toThrow();
    expect(() => refreshAllPersonas(db)).not.toThrow();

    // Stable counts prove teardown removed the prior round's random-id rows
    // (clubs/tags) and PK-keyed rows (members/name_variants) before reseeding.
    expect(personaMembers()).toBe(m0);
    expect(clubs()).toBe(c0);
    expect(tags()).toBe(t0);
    expect(variants()).toBe(v0);
    expect(tierOf(T1)).toBe('tier1');
  });

  it('tears down every row a tester session can mint through deployed flows', () => {
    const TS = '2026-01-01T00:00:00.000Z';

    // A real (non-seeded) club the persona joined and leads: the club itself
    // must survive refresh; only the persona's membership rows go.
    insertClub(db, { id: 'club-real-keep-1' });
    insertMemberClubAffiliation(db, T1, 'club-real-keep-1');
    db.prepare(
      `INSERT INTO club_leaders
         (id, created_at, created_by, updated_at, updated_by, version, club_id, member_id, role, added_at)
       VALUES ('cl-real-1', ?, 'club_service', ?, 'club_service', 1, 'club-real-keep-1', ?, 'co-leader', ?)`,
    ).run(TS, TS, T1, TS);
    db.prepare(
      `INSERT INTO club_viability_signals
         (id, created_at, created_by, member_id, club_id, source_stage, activity_signal)
       VALUES ('cvs-persona-1', ?, 'system', ?, 'club-real-keep-1', 'club_detail', 'active')`,
    ).run(TS, T1);

    // Auth and identity flows: reset token, declared anchor, the anchor's
    // mailbox-link token, and a notification email.
    db.prepare(
      `INSERT INTO account_tokens
         (id, created_at, created_by, updated_at, updated_by, version, member_id, token_type, token_hash, issued_at, expires_at)
       VALUES ('tok-persona-1', ?, 'system', ?, 'system', 1, ?, 'password_reset', 'hash-1', ?, ?)`,
    ).run(TS, TS, T1, TS, TS);
    db.prepare(
      `INSERT INTO member_declared_anchors
         (id, created_at, created_by, updated_at, updated_by, version, member_id, anchor_type, anchor_value)
       VALUES ('anchor-persona-1', ?, 'system', ?, 'system', 1, ?, 'old_email', 'old@example.com')`,
    ).run(TS, TS, T1);
    db.prepare(
      `INSERT INTO account_tokens
         (id, created_at, created_by, updated_at, updated_by, version, member_id, target_anchor_id, token_type, token_hash, issued_at, expires_at)
       VALUES ('tok-persona-2', ?, 'system', ?, 'system', 1, ?, 'anchor-persona-1', 'mailbox_link', 'hash-2', ?, ?)`,
    ).run(TS, TS, T1, TS, TS);
    insertOutboxEmail(db, { id: 'out-persona-1', recipient_member_id: T1, subject: 'Welcome' });

    // A purchase: the persona as audit ACTOR, the payment, and its append-only
    // status transition.
    insertAuditEntry(db, {
      created_by: 'system',
      actor_type: 'member',
      actor_member_id: T1,
      action_type: 'payment.checkout_started',
      entity_type: 'payment',
      entity_id: 'pay-persona-pst-1',
    });
    insertPayment(db, { id: 'pay-persona-pst-1', member_id: T1, status: 'pending' });
    db.prepare(
      `INSERT INTO payment_status_transitions
         (id, created_at, created_by, payment_id, event_type, to_status, transition_at)
       VALUES ('pst-persona-1', ?, 'system', 'pay-persona-pst-1', 'payment_intent.succeeded', 'succeeded', ?)`,
    ).run(TS, TS);

    // Media flows: an uploaded photo and a created gallery.
    db.prepare(
      `INSERT INTO media_items
         (id, created_at, created_by, updated_at, updated_by, version, uploader_member_id, media_type, uploaded_at, s3_key_thumb, s3_key_display)
       VALUES ('media-persona-1', ?, 'system', ?, 'system', 1, ?, 'photo', ?, 'k/thumb.jpg', 'k/display.jpg')`,
    ).run(TS, TS, T1, TS);
    db.prepare(
      `INSERT INTO member_galleries
         (id, created_at, created_by, updated_at, updated_by, version, owner_member_id, name)
       VALUES ('gal-persona-1', ?, 'system', ?, 'system', 1, ?, 'My Gallery')`,
    ).run(TS, TS, T1);

    // Admin-persona surfaces: a work-queue item the persona resolved (about a
    // real entity, so the row must survive minus its resolver), one about the
    // persona, and a curator video job the persona started.
    db.prepare(
      `INSERT INTO work_queue_items
         (id, created_at, created_by, updated_at, updated_by, version, queue_category, task_type, entity_type, entity_id, status, opened_at, resolved_at, resolved_by_member_id)
       VALUES ('wq-resolved-1', ?, 'system', ?, 'system', 1, 'membership', 'link_help', 'club', 'club-real-keep-1', 'resolved', ?, ?, ?)`,
    ).run(TS, TS, TS, TS, T2);
    db.prepare(
      `INSERT INTO work_queue_items
         (id, created_at, created_by, updated_at, updated_by, version, queue_category, task_type, entity_type, entity_id, status, opened_at)
       VALUES ('wq-entity-1', ?, 'system', ?, 'system', 1, 'membership', 'contact_admin', 'member', ?, 'open', ?)`,
    ).run(TS, TS, T1, TS);
    db.prepare(
      `INSERT INTO media_jobs
         (id, created_at, created_by, updated_at, updated_by, version, kind, state, admin_member_id)
       VALUES ('mj-persona-1', ?, ?, ?, ?, 1, 'curator_video', 'pending_upload', ?)`,
    ).run(TS, T1, TS, T1, T1);

    // The expiry worker's reminder ledger (append-only, both guards).
    db.prepare(
      `INSERT INTO active_player_reminder_sent
         (id, created_at, created_by, updated_at, updated_by, version, member_id, expires_at, offset_label, sent_at)
       VALUES ('aprs-persona-1', ?, 'system', ?, 'system', 1, ?, ?, 'days_1', ?)`,
    ).run(TS, TS, T1, TS, TS);

    // Harness-origin switch audit row: NULL actor, persona entity. Piles up
    // one per /dev/switch unless the refresh cleans it.
    insertAuditEntry(db, {
      id: 'audit-switch-1',
      created_by: 'system',
      actor_type: 'system',
      actor_member_id: null,
      action_type: 'testkit.persona_switch',
      entity_type: 'member',
      entity_id: T1,
    });

    // The reverse direction: a NON-persona member who joined a persona club
    // and tagged a gallery with its hashtag. The persona club and tag are
    // deleted on refresh, so every row referencing them must go too, while the
    // outsider member and their gallery survive.
    const personaClub = db
      .prepare(`SELECT id, hashtag_tag_id FROM clubs WHERE id LIKE 'club-test-%' LIMIT 1`)
      .get() as { id: string; hashtag_tag_id: string };
    insertMember(db, { id: 'member-outsider-2', slug: 'outsider_2' });
    insertMemberClubAffiliation(db, 'member-outsider-2', personaClub.id, { id: 'mca-outsider-1' });
    db.prepare(
      `INSERT INTO active_player_grants
         (id, created_at, created_by, member_id, change_type, new_active_player_expires_at, reason_code, related_club_id, related_club_affiliation_id)
       VALUES ('apg-outsider-1', ?, 'system', 'member-outsider-2', 'grant', ?, 'club_join', ?, 'mca-outsider-1')`,
    ).run(TS, TS, personaClub.id);
    db.prepare(
      `INSERT INTO member_galleries
         (id, created_at, created_by, updated_at, updated_by, version, owner_member_id, name)
       VALUES ('gal-outsider-1', ?, 'system', ?, 'system', 1, 'member-outsider-2', 'Outsider Gallery')`,
    ).run(TS, TS);
    db.prepare(
      `INSERT INTO member_gallery_tags (gallery_id, tag_id, created_at, created_by)
       VALUES ('gal-outsider-1', ?, ?, 'system')`,
    ).run(personaClub.hashtag_tag_id, TS);

    // Cleanup-queue rows a tester session can mint: a persona admin's defer
    // on a real candidate (its member FK would block the member delete), a
    // defer on a persona-seeded candidate (its candidate FK would block the
    // candidate delete), the persona's claim marker on the real club, and an
    // outsider's claim on the persona club (that item is about to go).
    insertLegacyClubCandidate(db, { id: 'cand-real-keep-1', display_name: 'Real Keep Candidate', classification: 'onboarding_visible' });
    db.prepare(
      `INSERT INTO candidate_cleanup_resolutions
         (id, created_at, created_by, candidate_id, predicate_name, resolution, deferred_until, deferred_by_member_id, reason_text)
       VALUES ('cdr-persona-1', ?, 'system', 'cand-real-keep-1', 'promotable_candidate', 'deferred', ?, ?, 'persona defer')`,
    ).run(TS, TS, T1);
    const personaCandidate = db
      .prepare(
        `SELECT legacy_club_candidate_id AS id FROM legacy_person_club_affiliations
          WHERE legacy_club_candidate_id IS NOT NULL
            AND (legacy_member_id LIKE 'legmem_persona_%'
                 OR historical_person_id IN (
                   SELECT person_id FROM historical_persons
                    WHERE legacy_member_id LIKE 'legmem_persona_%'))
          LIMIT 1`,
      )
      .get() as { id: string } | undefined;
    expect(personaCandidate).toBeDefined();
    db.prepare(
      `INSERT INTO candidate_cleanup_resolutions
         (id, created_at, created_by, candidate_id, predicate_name, resolution, deferred_until, deferred_by_member_id, reason_text)
       VALUES ('cdr-personacand-1', ?, 'system', ?, 'promotable_candidate', 'deferred', ?, NULL, NULL)`,
    ).run(TS, personaCandidate!.id, TS);
    db.prepare(
      `INSERT INTO club_cleanup_claims
         (id, created_at, created_by, item_type, item_id, claimed_by_member_id, claimed_at)
       VALUES ('ccl-persona-1', ?, 'system', 'club', 'club-real-keep-1', ?, ?)`,
    ).run(TS, T1, TS);
    db.prepare(
      `INSERT INTO club_cleanup_claims
         (id, created_at, created_by, item_type, item_id, claimed_by_member_id, claimed_at)
       VALUES ('ccl-outsider-1', ?, 'system', 'club', ?, 'member-outsider-2', ?)`,
    ).run(TS, personaClub.id, TS);

    const result = refreshAllPersonas(db);
    // Uploaded media's storage keys are returned so the refresh route can delete
    // the bytes; the row itself is gone (asserted below).
    expect(result.deletedMediaKeys).toEqual(
      expect.arrayContaining(['k/thumb.jpg', 'k/display.jpg']),
    );

    // The outsider and their gallery survive; only the rows referencing the
    // deleted persona club/tag are gone.
    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = 'member-outsider-2'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM member_galleries WHERE id = 'gal-outsider-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM member_club_affiliations WHERE id = 'mca-outsider-1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM active_player_grants WHERE id = 'apg-outsider-1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM member_gallery_tags WHERE gallery_id = 'gal-outsider-1'`)).toBe(0);

    // The real club survives; the persona's rows on it do not.
    expect(count(`SELECT COUNT(*) AS n FROM clubs WHERE id = 'club-real-keep-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM club_leaders WHERE id = 'cl-real-1'`)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM club_viability_signals WHERE id = 'cvs-persona-1'`)).toBe(0);

    // The real candidate survives; the cleanup-queue rows minted around the
    // persona session do not.
    expect(count(`SELECT COUNT(*) AS n FROM legacy_club_candidates WHERE id = 'cand-real-keep-1'`)).toBe(1);

    // The real-entity work item survives with only its resolver detached.
    const wqSurvivor = db
      .prepare(`SELECT status, resolved_by_member_id FROM work_queue_items WHERE id = 'wq-resolved-1'`)
      .get() as { status: string; resolved_by_member_id: string | null } | undefined;
    expect(wqSurvivor).toBeDefined();
    expect(wqSurvivor!.status).toBe('resolved');
    expect(wqSurvivor!.resolved_by_member_id).toBeNull();

    // Every minted row is gone.
    const goneIds: Array<[string, string]> = [
      ['account_tokens', 'tok-persona-1'],
      ['account_tokens', 'tok-persona-2'],
      ['member_declared_anchors', 'anchor-persona-1'],
      ['outbox_emails', 'out-persona-1'],
      ['payments', 'pay-persona-pst-1'],
      ['payment_status_transitions', 'pst-persona-1'],
      ['media_items', 'media-persona-1'],
      ['member_galleries', 'gal-persona-1'],
      ['work_queue_items', 'wq-entity-1'],
      ['media_jobs', 'mj-persona-1'],
      ['active_player_reminder_sent', 'aprs-persona-1'],
      ['audit_entries', 'audit-switch-1'],
      ['candidate_cleanup_resolutions', 'cdr-persona-1'],
      ['candidate_cleanup_resolutions', 'cdr-personacand-1'],
      ['club_cleanup_claims', 'ccl-persona-1'],
      ['club_cleanup_claims', 'ccl-outsider-1'],
    ];
    for (const [table, id] of goneIds) {
      expect(count(`SELECT COUNT(*) AS n FROM ${table} WHERE id = ?`, id), table).toBe(0);
    }
    expect(
      count(`SELECT COUNT(*) AS n FROM audit_entries WHERE actor_member_id LIKE 'member_persona_%'`),
    ).toBe(0);

    // Whole-DB referential integrity after teardown + reseed.
    expect(db.pragma('foreign_key_check')).toEqual([]);

    // All five append-only DELETE guards restored.
    expect(
      count(
        `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger' AND name IN (
           'trg_tier_grants_no_delete','trg_active_player_grants_no_delete','trg_audit_no_delete',
           'trg_payment_transitions_no_delete','trg_active_player_reminder_sent_no_delete')`,
      ),
    ).toBe(5);
  });

  it('claim flows and actor grants converge across the persona/real boundary', () => {
    const TS = '2026-01-01T00:00:00.000Z';

    // Direction 1: a persona claimed a REAL legacy account through the normal
    // claim flow. The real row must survive refresh UNCLAIMED (claimable
    // again), never deleted.
    insertLegacyMember(db, { legacy_member_id: 'legmem_real_keep_1' });
    db.prepare(
      `UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = ?
        WHERE legacy_member_id = 'legmem_real_keep_1'`,
    ).run(T2, TS);
    db.prepare(`UPDATE members SET legacy_member_id = 'legmem_real_keep_1' WHERE id = ?`).run(T2);

    // Direction 2: a REAL member claimed a persona identity (synthetic
    // surnames are claimable). The member must survive with both identity
    // links detached so the persona HP/legacy rows can be torn down.
    insertMember(db, { id: 'member-outsider-3', slug: 'outsider_3' });
    const freeRoot = (
      db
        .prepare(
          `SELECT legacy_member_id AS id FROM legacy_members
            WHERE legacy_member_id LIKE 'legmem_persona_%'
              AND legacy_member_id NOT IN
                (SELECT legacy_member_id FROM members WHERE legacy_member_id IS NOT NULL)
            LIMIT 1`,
        )
        .get() as { id: string }
    ).id;
    const personaHp = (
      db
        .prepare(
          `SELECT person_id FROM historical_persons
            WHERE legacy_member_id LIKE 'legmem_persona_%' LIMIT 1`,
        )
        .get() as { person_id: string }
    ).person_id;
    db.prepare(
      `UPDATE legacy_members SET claimed_by_member_id = 'member-outsider-3', claimed_at = ?
        WHERE legacy_member_id = ?`,
    ).run(TS, freeRoot);
    db.prepare(
      `UPDATE members SET legacy_member_id = ?, historical_person_id = ?
        WHERE id = 'member-outsider-3'`,
    ).run(freeRoot, personaHp);

    // A persona acting as admin granted a tier on a real member: the row is
    // removed (reverting the member to pre-test state) and counted.
    insertMemberTierGrant(db, {
      id: 'mtg-actor-1',
      member_id: 'member-outsider-3',
      actor_member_id: T1,
      new_tier_status: 'tier1',
      created_at: '2026-02-01T00:00:00.000Z',
      reason_code: 'admin.correction',
    });

    const result = refreshAllPersonas(db);
    expect(result.actorGrantRowsRemoved).toBe(1);

    // The real legacy account survives, unclaimed.
    const realLegacy = db
      .prepare(
        `SELECT claimed_by_member_id, claimed_at FROM legacy_members
          WHERE legacy_member_id = 'legmem_real_keep_1'`,
      )
      .get() as { claimed_by_member_id: string | null; claimed_at: string | null } | undefined;
    expect(realLegacy).toBeDefined();
    expect(realLegacy!.claimed_by_member_id).toBeNull();
    expect(realLegacy!.claimed_at).toBeNull();

    // The real member survives with both persona identity links detached.
    const outsider = db
      .prepare(
        `SELECT legacy_member_id, historical_person_id FROM members
          WHERE id = 'member-outsider-3'`,
      )
      .get() as { legacy_member_id: string | null; historical_person_id: string | null } | undefined;
    expect(outsider).toBeDefined();
    expect(outsider!.legacy_member_id).toBeNull();
    expect(outsider!.historical_person_id).toBeNull();
    expect(count(`SELECT COUNT(*) AS n FROM member_tier_grants WHERE id = 'mtg-actor-1'`)).toBe(0);

    // Whole-DB referential integrity holds after the boundary teardown.
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('tears down a build-on-switch persona (David) by slug, releasing his claimed legacy', () => {
    const TS = '2026-01-01T00:00:00.000Z';
    const DAVID_ID = 'member-david-built-1';

    // A built David: a REAL registered member (random id, not member_persona_)
    // carrying the build-on-switch slug, who claimed a real legacy account and
    // uploaded media. Refresh must discover him by slug.
    insertMember(db, { id: DAVID_ID, slug: 'david_leberknight', display_name: 'David Leberknight' });
    insertLegacyMember(db, { legacy_member_id: 'legmem_real_david' });
    db.prepare(
      `UPDATE legacy_members SET claimed_by_member_id = ?, claimed_at = ?
        WHERE legacy_member_id = 'legmem_real_david'`,
    ).run(DAVID_ID, TS);
    db.prepare(`UPDATE members SET legacy_member_id = 'legmem_real_david' WHERE id = ?`).run(DAVID_ID);
    db.prepare(
      `INSERT INTO media_items
         (id, created_at, created_by, updated_at, updated_by, version, uploader_member_id, media_type, uploaded_at, s3_key_thumb, s3_key_display)
       VALUES ('media-david-1', ?, 'system', ?, 'system', 1, ?, 'photo', ?, 'david/thumb.jpg', 'david/display.jpg')`,
    ).run(TS, TS, DAVID_ID, TS);

    const result = refreshAllPersonas(db);

    // David's member row and media are gone; his media keys are returned for
    // byte deletion by the refresh route.
    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = ?`, DAVID_ID)).toBe(0);
    expect(count(`SELECT COUNT(*) AS n FROM media_items WHERE id = 'media-david-1'`)).toBe(0);
    expect(result.deletedMediaKeys).toEqual(
      expect.arrayContaining(['david/thumb.jpg', 'david/display.jpg']),
    );

    // His claimed REAL legacy account survives, released (claimable again), not deleted.
    const legacy = db
      .prepare(
        `SELECT claimed_by_member_id, claimed_at FROM legacy_members
          WHERE legacy_member_id = 'legmem_real_david'`,
      )
      .get() as { claimed_by_member_id: string | null; claimed_at: string | null } | undefined;
    expect(legacy).toBeDefined();
    expect(legacy!.claimed_by_member_id).toBeNull();
    expect(legacy!.claimed_at).toBeNull();

    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  it('restores the append-only DELETE guards after refresh', () => {
    expect(() =>
      db.prepare(`DELETE FROM member_tier_grants WHERE member_id = ?`).run(T1),
    ).toThrow(/append-only/);
    expect(() =>
      db.prepare(`DELETE FROM active_player_grants WHERE member_id = ?`).run('member_persona_ap_active'),
    ).toThrow(/append-only/);
    const auditId = (db.prepare(`SELECT id FROM audit_entries LIMIT 1`).get() as { id: string }).id;
    expect(() => db.prepare(`DELETE FROM audit_entries WHERE id = ?`).run(auditId)).toThrow(/immutable/);
  });

  it('rolls back fully (guards restored, data unchanged) when teardown hits a FK block', () => {
    insertMemberTierGrant(db, {
      member_id: T1,
      new_tier_status: 'tier2',
      created_at: '2026-01-01T00:00:00.000Z',
      reason_code: 'purchase.tier2',
    });
    expect(tierOf(T1)).toBe('tier2');

    // A vouch whose target is a persona member RESTRICTs the member delete mid-teardown.
    db.prepare(
      `INSERT INTO active_player_vouches
         (id, created_at, created_by, voucher_member_id, target_member_id, vouched_at)
       VALUES (?, ?, 'system', ?, ?, ?)`,
    ).run('apv-block-1', '2026-01-01T00:00:00.000Z', T2, T1, '2026-01-01T00:00:00.000Z');

    expect(() => refreshAllPersonas(db)).toThrow();

    // Guards restored by the transaction rollback (DDL is transactional in SQLite).
    const guards = count(
      `SELECT COUNT(*) AS n FROM sqlite_master WHERE type='trigger'
         AND name IN ('trg_tier_grants_no_delete','trg_active_player_grants_no_delete','trg_audit_no_delete')`,
    );
    expect(guards).toBe(3);
    // Pre-refresh state intact: the upgrade grant and the vouch both survive.
    expect(tierOf(T1)).toBe('tier2');
    expect(count(`SELECT COUNT(*) AS n FROM active_player_vouches WHERE id = 'apv-block-1'`)).toBe(1);
    expect(count(`SELECT COUNT(*) AS n FROM members WHERE id = ?`, T1)).toBe(1);
  });
});
