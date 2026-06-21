/**
 * Legacy-URL forwarding contract, validated by replaying a stored sample of
 * legacy footbag.org URL patterns against the app:
 *  - /members/profile/<legacy id> resolves in three branches: 301 to the
 *    live member's slug URL; a soft-landing claim page for an unclaimed
 *    legacy account (generic message; display name only for signed-in
 *    visitors); friendly not-routable 404 otherwise;
 *  - legacy forum thread URLs 301 to the archive mirror, path preserved;
 *  - a legacy /clubs/<slug> whose club did not survive normalization
 *    forwards to the archive mirror; surviving club and country URLs are
 *    untouched.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertLegacyClubCandidate, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3084');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db: BetterSqlite3.Database = createTestDb(dbPath);

  // Branch (a): claimed by a live member.
  insertLegacyMember(db, {
    legacy_member_id: 'LM-1001', legacy_email: 'lm1001@old.example.com',
    real_name: 'Linked Member', display_name: 'Linked Member',
  });
  insertMember(db, {
    id: 'mem-linked', slug: 'mem_linked', login_email: 'linked@example.com',
    real_name: 'Linked Member', display_name: 'Linked Member',
    legacy_member_id: 'LM-1001',
  });
  db.prepare(`UPDATE legacy_members SET claimed_by_member_id = 'mem-linked', claimed_at = '2026-01-01T00:00:00.000Z' WHERE legacy_member_id = 'LM-1001'`).run();

  // Branch (b): unclaimed legacy account.
  insertLegacyMember(db, {
    legacy_member_id: 'LM-2002', legacy_email: 'lm2002@old.example.com',
    real_name: 'Unclaimed Person', display_name: 'Unclaimed Person',
  });

  // Viewer account for authenticated branch-(b) assertions, with onboarding
  // settled so the router-wide wizard gate lets the page render.
  insertMember(db, { id: 'mem-viewer', slug: 'mem_viewer', login_email: 'viewer@example.com' });
  for (const [i, taskType] of ['personal_details', 'legacy_claim', 'club_affiliations'].entries()) {
    db.prepare(`
      INSERT INTO member_onboarding_tasks
        (id, created_at, created_by, updated_at, updated_by, member_id, task_type, state, completed_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', 'mem-viewer', ?, 'completed', '2026-01-01T00:00:00.000Z')
    `).run(`mot-viewer-${i}`, taskType);
  }

  // Club that did not survive normalization: candidate without mapped club.
  insertLegacyClubCandidate(db, { legacy_club_key: 'defunct_club_1999', mapped_club_id: null });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('stored-sample replay', () => {
  // The sample mirrors the URL shapes old emails carry.
  const SAMPLE = [
    { url: '/members/profile/LM-1001', expect: 'live_member' },
    { url: '/members/profile/LM-2002', expect: 'claimable' },
    { url: '/members/profile/LM-9999', expect: 'not_routable' },
    { url: '/forum/viewtopic.php?t=12345', expect: 'forum_archive' },
    { url: '/forums/freestyle/thread-99', expect: 'forum_archive' },
    { url: '/clubs/defunct_club_1999', expect: 'club_archive' },
  ] as const;

  it('every sampled URL lands per contract', async () => {
    for (const sample of SAMPLE) {
      const res = await request(createApp()).get(sample.url);
      switch (sample.expect) {
        case 'live_member':
          expect(res.status, sample.url).toBe(301);
          expect(res.headers.location).toBe('/members/mem_linked');
          break;
        case 'claimable':
          expect(res.status, sample.url).toBe(200);
          expect(res.text).toContain('legacy footbag.org account');
          break;
        case 'not_routable':
          expect(res.status, sample.url).toBe(404);
          expect(res.text).toContain('no longer routable');
          break;
        case 'forum_archive':
          expect(res.status, sample.url).toBe(301);
          expect(res.headers.location).toBe(`https://archive.footbag.org${sample.url}`);
          break;
        case 'club_archive':
          expect(res.status, sample.url).toBe(302);
          expect(res.headers.location).toBe('https://archive.footbag.org/clubs/defunct_club_1999');
          break;
      }
    }
  });

  it('the unclaimed soft landing hides the display name from unauthenticated visitors', async () => {
    const res = await request(createApp()).get('/members/profile/LM-2002');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Unclaimed Person');
    expect(res.text).toContain('Create an Account');
  });

  it('the unclaimed soft landing shows the display name and claim CTA to signed-in visitors', async () => {
    const res = await request(createApp())
      .get('/members/profile/LM-2002')
      .set('Cookie', `footbag_session=${createTestSessionJwt({ memberId: 'mem-viewer' })}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Unclaimed Person');
    expect(res.text).toContain('Claim Your footbag.org History');
  });
});
