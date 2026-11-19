/**
 * The persona journeys: after the catalog is seeded, each persona whose state
 * is reached only through an act gets it through the real entry, and a
 * refresh afterwards still tears everything down.
 *
 * Real SQLite through the application's own database singleton, which is the
 * one the journeys write through.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { refreshAllPersonas } from '../../src/testkit/personaRefreshRunner';
import { insertMember } from '../fixtures/factories';
import type { PersonaJourneyReport } from '../../src/testkit/personaJourneys';

const { dbPath } = setTestEnv('3471');

let db: BetterSqlite3.Database;
let report: PersonaJourneyReport;
let hash: (address: string) => string;

const id = (slug: string) => `member_persona_${slug}`;
const one = <T>(sql: string, ...params: unknown[]) => db.prepare(sql).get(...params) as T;

beforeAll(async () => {
  const seedDb = createTestDb(dbPath);
  refreshAllPersonas(seedDb);
  seedDb.close();
  const { runPersonaJourneys } = await import('../../src/testkit/personaJourneys');
  ({ barredEmailHash: hash } = await import('../../src/lib/barredEmailHash'));
  report = await runPersonaJourneys();
  db = new BetterSqlite3(dbPath);
});

afterAll(() => {
  db?.close();
  cleanupTestDb(dbPath);
});

describe('persona journeys', () => {
  // Defect caught: a journey fails silently, so a persona's card promises a
  // state the database does not hold.
  it('runs every journey without a failure', () => {
    expect(report.failed).toEqual([]);
    expect(report.ran).toEqual(expect.arrayContaining([
      'purged_member', 'purged_hof', 'deceased_past_revert', 'contact_cap', 'event_registrant',
      'ap_active', 'SYS_Check_Active_Player_Expiry',
    ]));
  });

  // Defect caught: an erased persona still holds personal data, or an erased
  // honoree loses the public profile the honor keeps.
  it('erases the purged personas, keeping only the honoree\'s public record', () => {
    const purged = one<{ purged: string | null; slug: string; login_email: string | null }>(
      `SELECT personal_data_purged_at AS purged, slug, login_email FROM members WHERE id = ?`, id('purged_member'),
    );
    expect(purged.purged).not.toBeNull();
    expect(purged.login_email).toBeNull();
    expect(purged.slug).not.toBe('purged_member');
    const hof = one<{ purged: string | null; slug: string }>(
      `SELECT personal_data_purged_at AS purged, slug FROM members WHERE id = ?`, id('purged_hof'),
    );
    expect(hof).toMatchObject({ slug: 'purged_hof' });
    expect(hof.purged).not.toBeNull();
    // The deceased persona past the revert window has its contact details
    // scrubbed and keeps its identity and its deceased mark.
    expect(one<{ login_email: string | null; birth_date: string | null; slug: string; is_deceased: number }>(
      `SELECT login_email, birth_date, slug, is_deceased FROM members WHERE id = ?`, id('deceased_past_revert'),
    )).toEqual({ login_email: null, birth_date: null, slug: 'deceased_past_revert', is_deceased: 1 });
    // The grace-elapsed persona is left for the scheduler: not erased.
    expect(one<{ purged: string | null }>(
      `SELECT personal_data_purged_at AS purged FROM members WHERE id = ?`, id('del_grace_elapsed'),
    ).purged).toBeNull();
  });

  // Defect caught: the cap persona holds fewer than three open requests, so
  // its fourth request goes through and the cap is never seen.
  it('files three open contact requests for the cap persona', () => {
    expect(one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM work_queue_items WHERE created_by = ? AND status = 'open'`, id('contact_cap'),
    ).n).toBe(3);
  });

  // Defect caught: the organizer persona's event has no registrants, so every
  // organizer tool shows an empty state and deleting the event is not refused.
  it('registers two personas in the organizer persona\'s event', () => {
    const rows = db.prepare(
      `SELECT member_id FROM registrations WHERE event_id = 'event-test-persona-eo_organizer' ORDER BY member_id`,
    ).all() as { member_id: string }[];
    expect(rows.map((r) => r.member_id)).toEqual([id('ap_active'), id('event_registrant')]);
  });

  // Defect caught: a refresh after the journeys rolls back on a row a journey
  // left behind, leaving every persona stuck in its acted-on state; or a
  // tester's expulsion of the discipline persona keeps its address barred.
  it('is torn down by the next refresh, a tester\'s expulsion included', async () => {
    const { memberDisciplineService } = await import('../../src/services/memberDisciplineService');
    const day = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
    await memberDisciplineService.recordDecision(id('admin_t2'), id('discipline_target'), {
      decidedBy: 'IFPA board (test)', outcome: 'expelled', noticeDate: day(-30), hearingDate: day(-20),
      decisionDate: day(-10), suspendedUntil: '', reason: 'Expelled as a tester would.',
    });
    expect(one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM barred_email_hashes WHERE email_hash = ?`, hash('discipline_target@personas.test'),
    ).n).toBe(1);

    const result = refreshAllPersonas(db, { barredEmailHash: hash });

    expect(result.deletedMembers).toBeGreaterThan(0);
    expect(one<{ deleted_at: string | null }>(`SELECT deleted_at FROM members WHERE id = ?`, id('discipline_target')).deleted_at)
      .toBeNull();
    expect(one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM work_queue_items WHERE created_by = ? AND status = 'open'`, id('contact_cap'),
    ).n).toBe(0);
    expect(one<{ n: number }>(
      `SELECT COUNT(*) AS n FROM barred_email_hashes WHERE email_hash = ?`, hash('discipline_target@personas.test'),
    ).n).toBe(0);
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });

  // Defect caught: a persistent database (staging) keeps the erasure log entry
  // from the first refresh's journey, so on the next refresh erasing the same
  // persona again collides with it and the purged personas are never rebuilt.
  it('runs every journey again cleanly after a second refresh', async () => {
    const { runPersonaJourneys } = await import('../../src/testkit/personaJourneys');
    refreshAllPersonas(db, { barredEmailHash: hash });
    const second = await runPersonaJourneys();
    expect(second.failed).toEqual([]);
    expect(one<{ purged: string | null }>(
      `SELECT personal_data_purged_at AS purged FROM members WHERE id = ?`, id('purged_member'),
    ).purged).not.toBeNull();
  });

  // Defect caught: a tester acting as the administrator persona restricts a
  // real member, and every later refresh rolls back on the reference to the
  // persona who applied it, leaving the shared site stuck in that state.
  it('keeps a real member a persona administrator restricted, and the refresh still runs', async () => {
    const { memberDisciplineService } = await import('../../src/services/memberDisciplineService');
    const realId = insertMember(db, {});
    memberDisciplineService.restrict(id('admin_t2'), realId, 'Restricted as a tester would.');
    expect(one<{ restricted_by: string | null }>(`SELECT restricted_by FROM members WHERE id = ?`, realId))
      .toEqual({ restricted_by: id('admin_t2') });

    refreshAllPersonas(db, { barredEmailHash: hash });

    expect(one<{ restricted_at: string | null; restricted_by: string | null }>(
      `SELECT restricted_at, restricted_by FROM members WHERE id = ?`, realId,
    )).toEqual({ restricted_at: expect.any(String), restricted_by: null });
    expect(db.pragma('foreign_key_check')).toEqual([]);
  });
});
