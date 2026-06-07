import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3976');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertLegacyClubCandidate,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID     = 'cand-admin-001';
const MEMBER_ID    = 'cand-member-001';
const CANDIDATE_ID = 'cand-defer-001';
const ARCHIVED_ID  = 'cand-archived-001';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: 'cand_admin',  display_name: 'Candidate Admin', login_email: 'cand-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'cand_member', display_name: 'Candidate Member', login_email: 'cand-member@example.com' });
  insertLegacyClubCandidate(db, { id: CANDIDATE_ID, display_name: 'Defer Candidate', classification: 'onboarding_visible' });
  insertLegacyClubCandidate(db, { id: ARCHIVED_ID, display_name: 'Archived Candidate', classification: 'dormant', lifecycle_state: 'archived' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('promotable-candidate list and lifecycle exclusion', () => {
  it('lists live candidates and excludes terminal lifecycle states', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Defer Candidate');
    expect(res.text).not.toContain('Archived Candidate');
  });
});

describe('POST /admin/club-cleanup/candidates/:candidateId/resolve', () => {
  it('unauthenticated -> 302', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
      .send({ action: 'defer_90' });
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
      .set('Cookie', memberCookie())
      .send({ action: 'defer_90' });
    expect(res.status).toBe(403);
  });

  it('invalid action -> 422 (dismiss is not a candidate action)', async () => {
    for (const action of ['dismiss', 'bogus']) {
      const res = await request(createApp())
        .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
        .set('Cookie', adminCookie())
        .send({ action });
      expect(res.status).toBe(422);
    }
  });

  it('unknown candidate -> 404', async () => {
    const res = await request(createApp())
      .post('/admin/club-cleanup/candidates/no-such-candidate/resolve')
      .set('Cookie', adminCookie())
      .send({ action: 'defer_90' });
    expect(res.status).toBe(404);
  });

  it('defer_90 hides the candidate, records the resolution, and writes an audit row', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'defer_90', reasonText: 'Waiting on member confirmations' });
    expect(res.status).toBe(303);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Defer Candidate');

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const row = db.prepare(
        'SELECT * FROM candidate_cleanup_resolutions WHERE candidate_id = ?',
      ).get(CANDIDATE_ID) as Record<string, unknown>;
      expect(row.resolution).toBe('deferred');
      expect(row.deferred_until).toBeTruthy();
      expect(row.deferred_by_member_id).toBe(ADMIN_ID);
      expect(row.reason_text).toBe('Waiting on member confirmations');

      const audit = db.prepare(
        "SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'admin.club_cleanup.candidate_defer'",
      ).get(CANDIDATE_ID) as Record<string, unknown>;
      expect(audit).toBeTruthy();
      expect(audit.actor_type).toBe('admin');
      expect(audit.actor_member_id).toBe(ADMIN_ID);
    } finally {
      db.close();
    }
  });

  it('a second defer upserts the same resolution row instead of stacking', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'defer_30', reasonText: 'Shorter window' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const rows = db.prepare(
        'SELECT reason_text FROM candidate_cleanup_resolutions WHERE candidate_id = ?',
      ).all(CANDIDATE_ID) as Array<{ reason_text: string }>;
      expect(rows).toHaveLength(1);
      expect(rows[0].reason_text).toBe('Shorter window');
    } finally {
      db.close();
    }
  });

  it('an expired defer re-surfaces the candidate with the deferred-by annotation', async () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare(`
      UPDATE candidate_cleanup_resolutions
         SET deferred_until = '2020-01-01T00:00:00.000Z'
       WHERE candidate_id = ?
    `).run(CANDIDATE_ID);
    db.close();

    const res = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Defer Candidate');
    expect(res.text).toContain('previously deferred by Candidate Admin, reason: Shorter window');
  });
});

function getCandidate(id: string): Record<string, unknown> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT classification, lifecycle_state FROM legacy_club_candidates WHERE id = ?')
      .get(id) as Record<string, unknown>;
  } finally {
    db.close();
  }
}

function countAudits(entityId: string, actionType: string): number {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    const row = db.prepare('SELECT COUNT(*) AS c FROM audit_entries WHERE entity_id = ? AND action_type = ?')
      .get(entityId, actionType) as { c: number };
    return row.c;
  } finally {
    db.close();
  }
}

describe('candidate demote and archive', () => {
  it('demote moves an onboarding-visible candidate to dormant and audits', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'demote', reasonText: 'Not enough activity' });
    expect(res.status).toBe(303);
    expect(getCandidate(CANDIDATE_ID).classification).toBe('dormant');
    expect(countAudits(CANDIDATE_ID, 'admin.club_cleanup.candidate_demote')).toBe(1);
  });

  it('a repeat demote is a guarded no-op with no second audit row', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'demote' });
    expect(res.status).toBe(303);
    expect(getCandidate(CANDIDATE_ID).classification).toBe('dormant');
    expect(countAudits(CANDIDATE_ID, 'admin.club_cleanup.candidate_demote')).toBe(1);
  });

  it('archive sets the terminal lifecycle state, audits, and removes the candidate from the queue', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${CANDIDATE_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'archive', reasonText: 'No path to a live club' });
    expect(res.status).toBe(303);
    expect(getCandidate(CANDIDATE_ID).lifecycle_state).toBe('archived');
    expect(countAudits(CANDIDATE_ID, 'admin.club_cleanup.candidate_archive')).toBe(1);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Defer Candidate');
  });
});

describe('junk-flagged candidate handling', () => {
  const JUNK_ONE = 'cand-junk-001';
  const JUNK_TWO = 'cand-junk-002';

  beforeAll(() => {
    const db = new BetterSqlite3(dbPath);
    insertLegacyClubCandidate(db, { id: JUNK_ONE, display_name: 'Junk Candidate One', classification: 'junk' });
    insertLegacyClubCandidate(db, { id: JUNK_TWO, display_name: 'Junk Candidate Two', classification: 'junk' });
    db.close();
  });

  it('junk candidates surface in their own queue section', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Junk Candidate One');
    expect(res.text).toContain('Junk Candidate Two');
  });

  it('confirm_junk records the terminal verdict and removes the item', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${JUNK_ONE}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'confirm_junk', reasonText: 'Spam entry' });
    expect(res.status).toBe(303);
    expect(getCandidate(JUNK_ONE).lifecycle_state).toBe('junk_confirmed');
    expect(countAudits(JUNK_ONE, 'admin.club_cleanup.candidate_confirm_junk')).toBe(1);

    const queue = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Junk Candidate One');
  });

  it('promote_dormant returns a junk candidate to the promotable list', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${JUNK_TWO}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'promote_dormant', reasonText: 'Looks like a real club' });
    expect(res.status).toBe(303);
    expect(getCandidate(JUNK_TWO).classification).toBe('dormant');
    expect(getCandidate(JUNK_TWO).lifecycle_state).toBeNull();
    expect(countAudits(JUNK_TWO, 'admin.club_cleanup.candidate_promote_dormant')).toBe(1);

    const queue = await request(createApp())
      .get('/admin/club-cleanup?category=candidate')
      .set('Cookie', adminCookie());
    expect(queue.text).toContain('Junk Candidate Two');
  });

  it('confirm_junk on a non-junk candidate is a guarded no-op', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${JUNK_TWO}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'confirm_junk' });
    expect(res.status).toBe(303);
    expect(getCandidate(JUNK_TWO).lifecycle_state).toBeNull();
    expect(countAudits(JUNK_TWO, 'admin.club_cleanup.candidate_confirm_junk')).toBe(0);
  });

  it('the admin-home badge counts the remaining open candidate', async () => {
    const res = await request(createApp())
      .get('/admin')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('1 open');
  });
});
