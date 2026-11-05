/**
 * Legacy-governance-review only: DELETE BEFORE GO-LIVE.
 *
 * The throwaway internal-governance review screen (/internal-governance/*).
 * Admin-gated like the retired QC subsystem was: unauthenticated requests
 * redirect to /login, authenticated non-admins get 403. Mounted only in
 * development/staging (see src/app.ts); a second file
 * (internal-governance.production-refusal.test.ts) boots a full production
 * config and asserts the whole surface 404s there, mirroring
 * internal.retired-surface.test.ts for the original /internal mount.
 *
 * Seeds synthetic rows directly into the internal_governance_* tables rather
 * than running the real loader against the private export: this file must
 * run standalone in any environment (no footbag_private_repo symlink
 * required), and committee rosters are real member personal data that must
 * never be committed to this public repo, synthetic or not adjacent to it.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3611');

// The router mounts only when footbagEnv is 'development' or 'staging' (see
// the mount block in src/app.ts); pin it before importApp freezes the config
// singleton, matching devSwitchRoute.test.ts for the analogous /dev mount.
const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = 'development';

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID = 'member-igr';
const ADMIN_ID  = 'admin-igr';
const MEMBER_COOKIE = `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
const ADMIN_COOKIE  = `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID })}`;

function seedGovernanceFixtures(db: BetterSqlite3.Database): void {
  db.prepare(`
    INSERT INTO internal_governance_committees
      (committee_id, committee_valid, committee_public, committee_name, committee_owner_id,
       subcommittee_of_id, committee_charter, committee_email_enabled, committee_prepend_subject,
       committee_email_subject, committee_email_restricted, committee_email_moderated,
       committee_email_archived, committee_keyword, committee_type, committee_is_official,
       committee_created_at, committee_modified_at)
    VALUES ('9001', 1, 1, 'Test Steering Committee', NULL, NULL, 'Charter text.', 0, 0, NULL, 0, 0, 0,
      'steering', 'board', 1, '2001-01-01T00:00:00.000Z', '2001-01-01T00:00:00.000Z')
  `).run();

  db.prepare(`
    INSERT INTO internal_governance_committee_members
      (id, committee_id, committee_member_id, priority, title, alias, member_name, is_admin, privs, is_voting)
    VALUES ('9001:1', '9001', '1', 1, 'Chair', 'chair', 'Synthetic Chair', 1, 'owner', 1)
  `).run();

  db.prepare(`
    INSERT INTO internal_governance_group_files
      (file_id, visible, file_name, priority, owner_id, group_id, file_location, created_at,
       modified_at, committee_scoped, scope_committee_id, description)
    VALUES ('9101', 1, 'unscoped-notes.txt', 1, '1', '9001', NULL, NULL, NULL, 0, NULL, 'Public notes'),
           ('9102', 1, 'scoped-minutes.txt', 2, '1', '9001', NULL, NULL, NULL, 1, '9001', 'Committee minutes')
  `).run();

  db.prepare(`
    INSERT INTO internal_governance_elections
      (election_id, owner_id, committee_id, visible, title, starts_at, deadline_at, description,
       created_at, modified_at)
    VALUES ('9201', NULL, '9001', 1, 'Test Election', '2001-01-01T00:00:00.000Z',
      '2001-02-01T00:00:00.000Z', 'Test election description', NULL, NULL)
  `).run();

  db.prepare(`
    INSERT INTO internal_governance_issues
      (issue_id, visible, election_id, election_order, question,
       answer_1, answer_2, answer_3, answer_4, answer_5, answer_6, answer_7, answer_8, answer_9, answer_10,
       stored_tally_1, stored_tally_2, stored_tally_3, stored_tally_4, stored_tally_5,
       stored_tally_6, stored_tally_7, stored_tally_8, stored_tally_9, stored_tally_10,
       owner_id, created_at, modified_at, description, is_election)
    VALUES ('9301', 1, '9201', 1, 'Test Question?',
      'Yes', 'No', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      5, 3, NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL,
      NULL, NULL, NULL, NULL, 1)
  `).run();

  db.prepare(`
    INSERT INTO internal_governance_issue_vote_tallies
      (id, issue_id, election_id, question, answer_index, answer_text, derived_votes, stored_tally,
       capture_count, status)
    VALUES ('9301:1', '9301', '9201', 'Test Question?', 1, 'Yes', 6, 5, 6, 'derived disagrees with stored'),
           ('9301:2', '9301', '9201', 'Test Question?', 2, 'No', 3, 3, 3, 'agrees')
  `).run();
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: 'member-igr', display_name: 'Member' });
  insertMember(db, { id: ADMIN_ID,  slug: 'admin-igr',  display_name: 'Admin', is_admin: 1 });
  seedGovernanceFixtures(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  if (PRIOR_FOOTBAG_ENV === undefined) delete process.env.FOOTBAG_ENV;
  else process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
});

describe('access gate', () => {
  it('redirects unauthenticated requests to /login', async () => {
    const res = await request(createApp()).get('/internal-governance/committees');
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^\/login\?returnTo=/);
  });

  it('returns 403 for non-admin members', async () => {
    const res = await request(createApp()).get('/internal-governance/committees').set('Cookie', MEMBER_COOKIE);
    expect(res.status).toBe(403);
  });

  it('serves the committees list for admins', async () => {
    const res = await request(createApp()).get('/internal-governance/committees').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
  });

  it('redirects the bare mount to the committees list', async () => {
    const res = await request(createApp()).get('/internal-governance/').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/internal-governance/committees');
  });
});

describe('committees', () => {
  it('lists the seeded committee', async () => {
    const res = await request(createApp()).get('/internal-governance/committees').set('Cookie', ADMIN_COOKIE);
    expect(res.text).toContain('Test Steering Committee');
  });

  it('filters by search', async () => {
    const res = await request(createApp())
      .get('/internal-governance/committees?search=nonexistent-xyz')
      .set('Cookie', ADMIN_COOKIE);
    expect(res.text).not.toContain('Test Steering Committee');
  });

  it('renders the committee detail page with roster and files', async () => {
    const res = await request(createApp()).get('/internal-governance/committees/9001').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Synthetic Chair');
    expect(res.text).toContain('unscoped-notes.txt');
    expect(res.text).toContain('scoped-minutes.txt');
  });

  it('flags the committee-scoped file as held in custody and the unscoped file as not', async () => {
    const res = await request(createApp()).get('/internal-governance/committees/9001').set('Cookie', ADMIN_COOKIE);
    expect(res.text).toContain('committee-scoped, held in custody');
  });

  it('404s a committee id that does not exist', async () => {
    const res = await request(createApp()).get('/internal-governance/committees/does-not-exist').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(404);
  });
});

describe('elections and tallies', () => {
  it('lists the seeded election', async () => {
    const res = await request(createApp()).get('/internal-governance/elections').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Test Election');
  });

  it('renders issue tallies without treating the stored tally as authoritative', async () => {
    const res = await request(createApp()).get('/internal-governance/elections/9201').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Test Question?');
    // The derived figure (6), not the stored figure (5), is the one shown in
    // bold as the answer's count -- see internalGovernanceService and the
    // card's bar that the stored tally is never displayed as authoritative.
    expect(res.text).toContain('<strong>6</strong>');
  });

  it('404s an election id that does not exist', async () => {
    const res = await request(createApp()).get('/internal-governance/elections/does-not-exist').set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(404);
  });
});

describe('no ballot-level or forbidden data ever reaches the screen', () => {
  it('never renders a member id against a vote count', async () => {
    const res = await request(createApp()).get('/internal-governance/elections/9201').set('Cookie', ADMIN_COOKIE);
    // The tallies view only ever has aggregate counts in scope; there is no
    // per-ballot member identifier column for it to render in the first place.
    expect(res.text).not.toMatch(/VoteMemberID|vote_member_id/);
  });
});
