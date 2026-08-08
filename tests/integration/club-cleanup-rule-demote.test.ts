import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3991');

import BetterSqlite3 from 'better-sqlite3';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertHistoricalPerson,
  insertMemberClubAffiliation,
  insertClubLeader,
} from '../fixtures/factories';

const MEMBER = 'rule-mem-1';
const LEADER = 'rule-mem-2';

const CLUB_DEAD        = 'rule-club-dead';
const CLUB_DEAD_VOTED  = 'rule-club-dead-voted';
const CLUB_ESTABLISHED = 'rule-club-established';
const CLUB_HOSTED      = 'rule-club-hosted';
const CLUB_WAITING     = 'rule-club-waiting';
const CLUB_PEOPLE      = 'rule-club-people';
const CLUB_PARKED      = 'rule-club-parked';

let createApp: Awaited<ReturnType<typeof importApp>>;

function statusOf(clubId: string): string {
  const db = new BetterSqlite3(dbPath);
  try {
    return (db.prepare('SELECT status FROM clubs WHERE id = ?').get(clubId) as { status: string }).status;
  } finally {
    db.close();
  }
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

  // The pipeline marked it for members to confirm and nobody has answered yet.
  insertClub(db, { id: CLUB_WAITING, name: 'Waiting Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_WAITING, classification: 'onboarding_visible' });

  // Current people outrank everything else.
  insertClub(db, { id: CLUB_PEOPLE, name: 'People Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_PEOPLE, classification: 'dormant' });
  insertMemberClubAffiliation(db, MEMBER, CLUB_PEOPLE);
  insertClubLeader(db, { club_id: CLUB_PEOPLE, member_id: LEADER });

  // An admin already said "not now" about this one.
  insertClub(db, { id: CLUB_PARKED, name: 'Parked Club' });
  insertLegacyClubCandidate(db, { mapped_club_id: CLUB_PARKED, classification: 'dormant' });
  db.prepare(`
    INSERT INTO club_cleanup_resolutions (
      id, created_at, created_by, club_id, predicate_name, resolution,
      parked_by_member_id, reason_text
    ) VALUES (?, '2026-01-01T00:00:00.000Z', ?, ?, 'crowdsource_viability', 'parked', ?, 'Revisit later')
  `).run('ccr-rule-parked', MEMBER, CLUB_PARKED, MEMBER);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the cleanup rules demote the clubs they settle', () => {
  it('leaves every club untouched until an admin opens the queue', () => {
    expect(statusOf(CLUB_DEAD)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_DEAD)).toBe(0);
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

  it('leaves a club waiting on member answers alone', () => {
    expect(statusOf(CLUB_WAITING)).toBe('active');
    expect(autoDemoteAuditCount(CLUB_WAITING)).toBe(0);
  });

  it('never demotes a club someone leads or belongs to', () => {
    expect(statusOf(CLUB_PEOPLE)).toBe('active');
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
    expect(reviewed).toEqual([CLUB_ESTABLISHED, CLUB_HOSTED].sort());
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
    const archived = db.prepare("SELECT COUNT(*) AS c FROM clubs WHERE status = 'archived'").get() as { c: number };
    db.close();
    expect(archived.c).toBe(0);
  });
});
