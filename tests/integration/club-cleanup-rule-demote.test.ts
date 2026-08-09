import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3991');

import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import {
  createTestSessionJwt,
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertHistoricalPerson,
  insertMemberClubAffiliation,
  insertClubLeader,
  insertEvent,
  insertClubInsightNote,
  insertClubBootstrapLeader,
} from '../fixtures/factories';

const MEMBER = 'rule-mem-1';
const LEADER = 'rule-mem-2';
const ADMIN  = 'rule-admin-1';

const CLUB_DEAD        = 'rule-club-dead';
const CLUB_DEAD_VOTED  = 'rule-club-dead-voted';
const CLUB_ESTABLISHED = 'rule-club-established';
const CLUB_HOSTED      = 'rule-club-hosted';
const CLUB_HOSTED_HERE = 'rule-club-hosted-here';
const CLUB_WAITING     = 'rule-club-waiting';
const CLUB_PEOPLE      = 'rule-club-people';
const CLUB_TWO_RECORDS = 'rule-club-two-records'
const CLUB_TWO_WEAK    = 'rule-club-two-weak'
const CLUB_PARKED      = 'rule-club-parked';
const CLUB_NOTE_ONLY   = 'rule-club-note-only';
const CLUB_NOTE_VOTED  = 'rule-club-note-voted';
const CLUB_PARKED_SETTLED  = 'rule-club-parked-settled';
const CLUB_PARKED_RETURNED = 'rule-club-parked-returned';
const CLUB_DEMOTED_REVIVED = 'rule-club-demoted-revived';
const CLUB_DISMISSED_ACTIVE = 'rule-club-dismissed-active';
const CLUB_ARCHIVED_PROVISIONAL = 'rule-club-archived-provisional';
const CLUB_INACTIVE_PROVISIONAL = 'rule-club-inactive-provisional';

let createApp: Awaited<ReturnType<typeof importApp>>;

function statusOf(clubId: string): string {
  const db = new BetterSqlite3(dbPath);
  try {
    return (db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string }).status;
  } finally {
    db.close();
  }
}

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN, role: 'admin' })}`;
}

function autoDemoteAuditCount(clubId: string): number {
  const db = new BetterSqlite3(dbPath);
  try {
    return (db.prepare(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'club.auto_demoted' AND entity_id = ?",
    ).get(clubId) as { c: number }).c;
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: MEMBER, slug: 'rule_mem_1', display_name: 'Rule Member', login_email: 'rule1@example.com' });
  insertMember(db, { id: LEADER, slug: 'rule_mem_2', display_name: 'Rule Leader', login_email: 'rule2@example.com' });
  insertMember(db, { id: ADMIN, slug: 'rule_admin_1', display_name: 'Rule Admin', login_email: 'rule-admin@example.com', is_admin: 1 });

  // Nothing on any side says this club exists: the pipeline judged it not an
  // established club, it never hosted an event, nobody leads or belongs to it,
  // and no member has spoken. It also carries unconfirmed legacy residue, which
  // should follow it down.
  insertClub(db, { id: CLUB_DEAD, name: 'Dead Club' });
  const deadCand = insertLegacyClubCandidate(db, { mapped_club_id: CLUB_DEAD, classification: 'dormant' });
  const ghost = insertHistoricalPerson(db, { person_id: 'rule-ghost-1', person_name: 'Ghost Person', country: 'US' });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id: ghost,
    legacy_club_candidate_id: deadCand,
    resolution_status: 'pending',
  });

  // Same, plus a member who wrote it off. The write-off is corroborated.
  insertClub(db, { id: CLUB_DEAD_VOTED, name: 'Dead Voted Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_DEAD_VOTED, classification: 'junk' });
  insertClubViabilitySignal(db, { member_id: MEMBER, club_id: CLUB_DEAD_VOTED, activity_signal: 'not_active' });

  // Established at import. A write-off does not settle this one.
  insertClub(db, { id: CLUB_ESTABLISHED, name: 'Established Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_ESTABLISHED, classification: 'pre_populate' });
  insertClubViabilitySignal(db, { member_id: MEMBER, club_id: CLUB_ESTABLISHED, activity_signal: 'not_active' });

  // Hosted an event once. A write-off does not settle this one either.
  insertClub(db, { id: CLUB_HOSTED, name: 'Hosted Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_HOSTED, classification: 'dormant', ever_hosted: 1 });
  insertClubViabilitySignal(db, { member_id: MEMBER, club_id: CLUB_HOSTED, activity_signal: 'not_active' });

  // The same fact from the other source: an event this platform records as
  // hosted by the club, rather than the mirror-derived flag above. The rule
  // reads either, and only this limb exercises the events table.
  insertClub(db, { id: CLUB_HOSTED_HERE, name: 'Hosted Here Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_HOSTED_HERE, classification: 'dormant' });
  insertEvent(db, { host_club_id: CLUB_HOSTED_HERE, title: 'Hosted Here Open' });
  insertClubViabilitySignal(db, { member_id: MEMBER, club_id: CLUB_HOSTED_HERE, activity_signal: 'not_active' });

  // The pipeline marked it for members to confirm and nobody has answered yet.
  insertClub(db, { id: CLUB_WAITING, name: 'Waiting Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_WAITING, classification: 'onboarding_visible' });

  // Current people outrank everything else.
  insertClub(db, { id: CLUB_PEOPLE, name: 'People Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_PEOPLE, classification: 'dormant' });
  insertMemberClubAffiliation(db, MEMBER, CLUB_PEOPLE);
  insertClubLeader(db, { club_id: CLUB_PEOPLE, member_id: LEADER });

  // A junk record from the legacy dump landed on this real club alongside its
  // good one. Junk says nothing about the club it landed on, so the established
  // record governs and the club stays alive.
  insertClub(db, { id: CLUB_TWO_RECORDS, name: 'Two Records Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_TWO_RECORDS, classification: 'junk' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_TWO_RECORDS, classification: 'pre_populate' });

  // Same shape one step weaker: nothing says established, but one record marks
  // it for members to confirm, so it waits for an answer instead of going.
  insertClub(db, { id: CLUB_TWO_WEAK, name: 'Two Weak Records Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_TWO_WEAK, classification: 'dormant' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_TWO_WEAK, classification: 'onboarding_visible' });

  // Nobody voted and the record is as empty as the dead club above, except
  // that a member wrote something about it. The rules cannot read a sentence,
  // so this one goes to a person instead of being written off unread.
  insertClub(db, { id: CLUB_NOTE_ONLY, name: 'Note Only Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_NOTE_ONLY, classification: 'dormant' });
  insertClubInsightNote(db, {
    member_id: MEMBER,
    club_id: CLUB_NOTE_ONLY,
    note_text: 'It merged into the club across town and still meets on Tuesdays.',
  });

  // A member wrote it off and another wrote about it. The sentence is the only
  // thing standing between the club and an automatic demotion.
  insertClub(db, { id: CLUB_NOTE_VOTED, name: 'Note Voted Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_NOTE_VOTED, classification: 'dormant' });
  insertClubViabilitySignal(db, { member_id: MEMBER, club_id: CLUB_NOTE_VOTED, activity_signal: 'not_active' });
  insertClubInsightNote(db, {
    member_id: LEADER,
    club_id: CLUB_NOTE_VOTED,
    note_text: 'They stopped meeting in the park but still run the winter session.',
  });

  // An admin already said "not now" about this one.
  insertClub(db, { id: CLUB_PARKED, name: 'Parked Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_PARKED, classification: 'dormant' });
  db.prepare(`
    INSERT INTO club_cleanup_resolutions (
      id, created_at, created_by, club_id, predicate_name, resolution,
      parked_by_member_id, reason_text
    ) VALUES (?, '2026-01-01T00:00:00.000Z', ?, ?, 'crowdsource_viability', 'parked', ?, 'Revisit later')
  `).run('ccr-rule-parked', MEMBER, CLUB_PARKED, MEMBER);

  // Parked, then a member said something afterwards. The rules can settle this
  // one, so it never rejoins the working queue: parking promised it would not
  // be lost, and the parked listing is the only place that promise can be kept.
  insertClub(db, { id: CLUB_PARKED_SETTLED, name: 'Parked Settled Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_PARKED_SETTLED, classification: 'dormant' });
  db.prepare(`
    INSERT INTO club_cleanup_resolutions (
      id, created_at, created_by, club_id, predicate_name, resolution,
      parked_by_member_id, reason_text
    ) VALUES (?, '2026-01-01T00:00:00.000Z', ?, ?, 'crowdsource_viability', 'parked', ?, 'Revisit later')
  `).run('ccr-rule-parked-settled', MEMBER, CLUB_PARKED_SETTLED, MEMBER);
  insertClubViabilitySignal(db, {
    member_id: MEMBER,
    club_id: CLUB_PARKED_SETTLED,
    activity_signal: 'not_active',
    created_at: '2026-02-01T00:00:00.000Z',
  });

  // Same shape, but this club's own record contradicts the member, so the
  // working queue really does take it back and the parked listing lets it go.
  insertClub(db, { id: CLUB_PARKED_RETURNED, name: 'Parked Returned Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_PARKED_RETURNED, classification: 'pre_populate' });
  db.prepare(`
    INSERT INTO club_cleanup_resolutions (
      id, created_at, created_by, club_id, predicate_name, resolution,
      parked_by_member_id, reason_text
    ) VALUES (?, '2026-01-01T00:00:00.000Z', ?, ?, 'crowdsource_viability', 'parked', ?, 'Revisit later')
  `).run('ccr-rule-parked-returned', MEMBER, CLUB_PARKED_RETURNED, MEMBER);
  insertClubViabilitySignal(db, {
    member_id: MEMBER,
    club_id: CLUB_PARKED_RETURNED,
    activity_signal: 'not_active',
    created_at: '2026-02-01T00:00:00.000Z',
  });

  // Demoted once, then revived by a member and left to go quiet again. The
  // club being active contradicts the demotion outright, so the verdict stops
  // speaking for it and the rules judge it afresh.
  insertClub(db, { id: CLUB_DEMOTED_REVIVED, name: 'Demoted Revived Club', status: 'active' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_DEMOTED_REVIVED, classification: 'dormant' });
  db.prepare(`
    INSERT INTO club_cleanup_resolutions (
      id, created_at, created_by, club_id, predicate_name, resolution, reason_text
    ) VALUES (?, '2026-01-01T00:00:00.000Z', ?, ?, 'crowdsource_viability', 'demoted', 'Looked finished')
  `).run('ccr-rule-demoted-revived', ADMIN, CLUB_DEMOTED_REVIVED);

  // A dismissal is a judgment about the flags, not about whether the club is
  // alive, so it is not released the same way.
  insertClub(db, { id: CLUB_DISMISSED_ACTIVE, name: 'Dismissed Active Club', status: 'active' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_DISMISSED_ACTIVE, classification: 'dormant' });
  db.prepare(`
    INSERT INTO club_cleanup_resolutions (
      id, created_at, created_by, club_id, predicate_name, resolution, reason_text
    ) VALUES (?, '2026-01-01T00:00:00.000Z', ?, ?, 'crowdsource_viability', 'dismissed', 'Reports not credible')
  `).run('ccr-rule-dismissed-active', ADMIN, CLUB_DISMISSED_ACTIVE);

  // Archiving is terminal, and archiving does not clear a club's provisional
  // bootstrap rows. Without excluding archived clubs the stale-provisional
  // group offers Demote on one, which would move it back to inactive.
  insertClub(db, { id: CLUB_ARCHIVED_PROVISIONAL, name: 'Archived Provisional Club', status: 'archived' });
  insertClubBootstrapLeader(db, {
    club_id: CLUB_ARCHIVED_PROVISIONAL,
    legacy_member_id: 'rule-legacy-provisional',
    status: 'provisional',
  });
  insertClub(db, { id: CLUB_INACTIVE_PROVISIONAL, name: 'Inactive Provisional Club', status: 'inactive' });
  insertClubBootstrapLeader(db, {
    club_id: CLUB_INACTIVE_PROVISIONAL,
    legacy_member_id: 'rule-legacy-provisional',
    status: 'provisional',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the cleanup rules demote the clubs they settle', () => {
  // Opening the queue is the only trigger there is. The surfaces that read the
  // same club data must leave every status alone, including the admin home,
  // whose backlog badge counts the very clubs the rules would settle.
  it('no surface other than the queue demotes a club', async () => {
    const app = createApp();

    const home = await request(app).get('/admin').set('Cookie', adminCookie());
    expect(home.status).toBe(200);
    const clubs = await request(app).get('/clubs');
    expect(clubs.status).toBe(200);

    for (const clubId of [CLUB_DEAD, CLUB_DEAD_VOTED, CLUB_WAITING, CLUB_PARKED]) {
      expect(statusOf(clubId)).toBe('active');
      expect(autoDemoteAuditCount(clubId)).toBe(0);
    }
  });

  it('demotes a club whose record says nothing on any side, and retires its residue', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    clubCleanupService.getCleanupQueuePage();

    expect(statusOf(CLUB_DEAD)).toBe('inactive');
    expect(autoDemoteAuditCount(CLUB_DEAD)).toBe(1);

    const db = new BetterSqlite3(dbPath);
    const pending = db.prepare(
      "SELECT COUNT(*) AS c FROM legacy_person_club_affiliations WHERE resolution_status = 'pending'",
    ).get() as { c: number };
    db.close();
    expect(pending.c).toBe(0);
  });

  it('demotes a club a member wrote off when its own record agrees', () => {
    expect(statusOf(CLUB_DEAD_VOTED)).toBe('inactive');
    expect(autoDemoteAuditCount(CLUB_DEAD_VOTED)).toBe(1);
  });

  it('never demotes an established club, even when a member writes it off', () => {
    expect(statusOf(CLUB_ESTABLISHED)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_ESTABLISHED)).toBe(0);
  });

  it('never demotes a club that hosted an event, even when a member writes it off', () => {
    expect(statusOf(CLUB_HOSTED)).toBe('active');
  });

  it('never demotes a club that hosted an event on the platform, even when a member writes it off', () => {
    expect(statusOf(CLUB_HOSTED_HERE)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_HOSTED_HERE)).toBe(0);
  });

  it('leaves a club waiting on member answers alone', () => {
    expect(statusOf(CLUB_WAITING)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_WAITING)).toBe(0);
  });

  it('sends a club carrying a member note to a person rather than demoting it unread', async () => {
    expect(statusOf(CLUB_NOTE_ONLY)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_NOTE_ONLY)).toBe(0);

    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const row = clubCleanupService.getCleanupQueuePage().content.itemGroups
      .flatMap((g) => g.items)
      .find((i) => i.clubId === CLUB_NOTE_ONLY && i.predicate === 'crowdsource_viability');
    expect(row?.detail).toBe('A member left a note about this club');
    expect(row?.insightNotes.map((n) => n.text)).toEqual([
      'It merged into the club across town and still meets on Tuesdays.',
    ]);
  });

  it('a member note outweighs another member writing the club off', () => {
    expect(statusOf(CLUB_NOTE_VOTED)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_NOTE_VOTED)).toBe(0);
  });

  it('never demotes a club someone leads or belongs to', () => {
    expect(statusOf(CLUB_PEOPLE)).toBe('active');
  });

  it('judges a club by its strongest legacy record, not by a junk one', () => {
    // Letting the junk record speak would demote a club the dump elsewhere
    // records as established.
    expect(statusOf(CLUB_TWO_RECORDS)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_TWO_RECORDS)).toBe(0);
  });

  it('still asks members about a club one record marks for confirmation', () => {
    expect(statusOf(CLUB_TWO_WEAK)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_TWO_WEAK)).toBe(0);
  });

  it('counts a club with two legacy records once, never demoting it twice', () => {
    const db = new BetterSqlite3(dbPath);
    const rows = db.prepare(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = 'club.auto_demoted'",
    ).get() as { c: number };
    const clubs = db.prepare(
      "SELECT COUNT(DISTINCT entity_id) AS c FROM audit_entries WHERE action_type = 'club.auto_demoted'",
    ).get() as { c: number };
    db.close();
    expect(rows.c).toBe(clubs.c);
  });

  it('never overrides an admin who parked the club', () => {
    expect(statusOf(CLUB_PARKED)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_PARKED)).toBe(0);
  });

  it('surfaces only the contradictions for a human to judge', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();
    const reviewed = vm.content.itemGroups
      .flatMap((g) => g.items)
      .filter((i) => i.predicate === 'crowdsource_viability')
      .map((i) => i.clubId)
      .sort();
    expect(reviewed).toEqual(
      [CLUB_ESTABLISHED, CLUB_HOSTED, CLUB_HOSTED_HERE, CLUB_NOTE_ONLY, CLUB_NOTE_VOTED, CLUB_PARKED_RETURNED].sort(),
    );
  });

  // Parking promises the club is never lost. A parked club leaves the parked
  // listing only when the working queue has actually taken it back, so a club
  // the rules can settle stays listed rather than falling between the two.
  it('keeps a parked club listed when the working queue cannot take it back', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();

    const parkedIds = vm.content.parked.map((p) => p.clubId);
    expect(parkedIds).toContain(CLUB_PARKED_SETTLED);

    // The question it was parked on is the one that has to stay visible
    // somewhere; the club may still carry unrelated queue rows of its own.
    const reviewIds = vm.content.itemGroups
      .flatMap((g) => g.items)
      .filter((i) => i.predicate === 'crowdsource_viability')
      .map((i) => i.clubId);
    expect(reviewIds).not.toContain(CLUB_PARKED_SETTLED);
    expect(statusOf(CLUB_PARKED_SETTLED)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_PARKED_SETTLED)).toBe(0);
  });

  // A demote says a club looked finished. A member reviving it says the
  // opposite, and the queue evaluates its predicates fresh against current
  // data, so the old verdict cannot go on silencing the club for good.
  it('re-evaluates a demoted club that a member has since revived', () => {
    expect(statusOf(CLUB_DEMOTED_REVIVED)).toBe('inactive');
    expect(autoDemoteAuditCount(CLUB_DEMOTED_REVIVED)).toBe(1);
  });

  it('leaves a dismissed verdict standing on an active club', () => {
    expect(statusOf(CLUB_DISMISSED_ACTIVE)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_DISMISSED_ACTIVE)).toBe(0);
  });

  // Archiving is terminal. An archived club carrying leftover provisional rows
  // must not reach a group whose actions would move it back to inactive.
  it('keeps an archived club out of the stale-provisional group', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();

    const staleIds = vm.content.itemGroups
      .flatMap((g) => g.items)
      .filter((i) => i.predicate === 'stale_provisional')
      .map((i) => i.clubId);
    expect(staleIds).not.toContain(CLUB_ARCHIVED_PROVISIONAL);
    expect(staleIds).toContain(CLUB_INACTIVE_PROVISIONAL);
    expect(statusOf(CLUB_ARCHIVED_PROVISIONAL)).toBe('archived');
  });

  it('shows a stale-provisional row the club\'s real status rather than a fixed one', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();

    const row = vm.content.itemGroups
      .flatMap((g) => g.items)
      .find((i) => i.predicate === 'stale_provisional' && i.clubId === CLUB_INACTIVE_PROVISIONAL);
    expect(row?.clubStatus).toBe('inactive');
  });

  it('drops a parked club from the listing once the working queue has it back', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const vm = clubCleanupService.getCleanupQueuePage();

    expect(vm.content.parked.map((p) => p.clubId)).not.toContain(CLUB_PARKED_RETURNED);
    expect(vm.content.itemGroups.flatMap((g) => g.items).map((i) => i.clubId))
      .toContain(CLUB_PARKED_RETURNED);
  });

  // The audit row is the only record of a decision no human made, so it has to
  // carry who decided and the evidence that decided it, not merely exist.
  it('records the system as the actor and the evidence behind the demotion', () => {
    const db = new BetterSqlite3(dbPath);
    let row: { actor_type: string; actor_member_id: string | null; metadata_json: string };
    try {
      row = db.prepare(
        "SELECT actor_type, actor_member_id, metadata_json FROM audit_entries WHERE action_type = 'club.auto_demoted' AND entity_id = ?",
      ).get(CLUB_DEAD_VOTED) as typeof row;
    } finally {
      db.close();
    }

    expect(row.actor_type).toBe('system');
    expect(row.actor_member_id).toBeNull();

    const metadata = JSON.parse(row.metadata_json);
    expect(metadata.club_name).toBe('Dead Voted Club');
    expect(metadata.was_established).toBe(false);
    expect(metadata.ever_hosted_event).toBe(false);
    expect(metadata.leader_count).toBe(0);
    expect(metadata.current_member_count).toBe(0);
    expect(metadata.inactive_votes).toBe(1);
    expect(metadata.active_votes).toBe(0);
  });

  it('a second open demotes nothing further and writes no second audit row', async () => {
    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    clubCleanupService.getCleanupQueuePage();
    clubCleanupService.getCleanupQueuePage();

    expect(autoDemoteAuditCount(CLUB_DEAD)).toBe(1);
    expect(autoDemoteAuditCount(CLUB_DEAD_VOTED)).toBe(1);
  });

  it('never archives a club: demotion keeps it listed and revivable', () => {
    const db = new BetterSqlite3(dbPath);
    const archived = db.prepare(
      "SELECT id FROM clubs WHERE status = 'archived' ORDER BY id",
    ).all() as Array<{ id: string }>;
    db.close();
    // The only archived club is the one seeded that way; the rules archived none.
    expect(archived.map((r) => r.id)).toEqual([CLUB_ARCHIVED_PROVISIONAL]);
  });
});
