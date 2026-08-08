import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3974');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertClub,
  insertClubViabilitySignal,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID  = 'cleanup-admin-001';
const MEMBER_ID = 'cleanup-member-001';
const CLUB_ID   = 'cleanup-club-001';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: ADMIN_ID,  slug: 'cleanup_admin',  display_name: 'Cleanup Admin', login_email: 'cleanup-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'cleanup_member', display_name: 'Cleanup Member', login_email: 'cleanup-member@example.com' });
  insertClub(db, { id: CLUB_ID, name: 'Dirty Club' });

  insertClubViabilitySignal(db, { member_id: MEMBER_ID, club_id: CLUB_ID, activity_signal: 'not_active' });
  insertClubViabilitySignal(db, { member_id: ADMIN_ID, club_id: CLUB_ID, activity_signal: 'not_active' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /admin/club-cleanup', () => {
  it('unauthenticated -> 302', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/club-cleanup');
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin -> 200 with cleanup queue', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Dirty Club');
    expect(res.text).toContain('Club Cleanup Queue');
  });

  it('renders the add-co-leader and contact-members controls for a leaderless active club', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    // The service shapes a showLeaderlessControls boolean per item; a leaderless
    // active club's row renders the add-co-leader link and the contact-members
    // form, so the template branches on that boolean rather than the predicate.
    expect(res.text).toContain(`/admin/clubs/${CLUB_ID}/leadership`);
    expect(res.text).toContain(`/admin/club-cleanup/${CLUB_ID}/contact-members`);
  });

  it('names the members whose latest answer was negative on the queue item', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    // Negative votes are rare and admins judge them by who cast them, so
    // the crowdsource item carries the reporter names (admin-only surface).
    expect(res.text).toContain('inactive per: Cleanup Admin, Cleanup Member');
  });
});

describe('POST /admin/club-cleanup/:clubId/resolve', () => {
  it('demote_inactive changes club status to inactive', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'demote_inactive', predicate: 'crowdsource_viability', reasonText: 'Test demotion' });
    expect(res.status).toBe(303);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const club = testDb.prepare('SELECT status FROM clubs WHERE id = ?').get(CLUB_ID) as Record<string, unknown>;
      expect(club.status).toBe('inactive');

      const audit = testDb.prepare("SELECT * FROM audit_entries WHERE entity_id = ? AND action_type = 'admin.club_cleanup.demote_inactive'").get(CLUB_ID) as Record<string, unknown>;
      expect(audit).toBeTruthy();
    } finally {
      testDb.close();
    }
  });

  it('invalid action -> 422', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'invalid_action' });
    expect(res.status).toBe(422);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', memberCookie())
      .send({ action: 'dismiss' });
    expect(res.status).toBe(403);
  });

  it('park records the resolution with no deadline, naming who parked it and why', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'park', predicate: 'crowdsource_viability', reasonText: 'Check back later' });
    expect(res.status).toBe(303);

    const testDb = new BetterSqlite3(dbPath);
    try {
      const resolution = testDb.prepare(
        'SELECT * FROM club_cleanup_resolutions WHERE club_id = ? AND predicate_name = ?',
      ).get(CLUB_ID, 'crowdsource_viability') as Record<string, unknown>;
      expect(resolution.resolution).toBe('parked');
      expect(resolution.parked_by_member_id).toBe(ADMIN_ID);
      expect(resolution.reason_text).toBe('Check back later');
    } finally {
      testDb.close();
    }
  });

  it('rejects a deadline-style action, so no caller can reintroduce a timed park', async () => {
    const res = await request(createApp())
      .post(`/admin/club-cleanup/${CLUB_ID}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'defer_30', predicate: 'crowdsource_viability' });
    expect(res.status).toBe(422);
  });
});

describe('stale-provisional predicate surfaces unresolved bootstrap rows', () => {
  it('a club whose only leadership is a provisional bootstrap row appears in the queue', async () => {
    const db = new BetterSqlite3(dbPath);
    const { insertClub: mkClub, insertClubBootstrapLeader: mkBootstrap } = await import('../fixtures/factories');
    const clubId = mkClub(db, { id: 'cleanup-stale-club', name: 'Stale Provisional Club' });
    mkBootstrap(db, { club_id: clubId, legacy_member_id: 'lm-stale-1', role: 'leader', status: 'provisional' });
    db.close();

    const res = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Stale Provisional Club');
    expect(res.text.toLowerCase()).toContain('provisional');
  });
});

describe('parking takes a club off the working queue without losing it', () => {
  it('a parked club leaves the working queue, stays listed as parked, and returns when a member says something new', async () => {
    const db = new BetterSqlite3(dbPath);
    const { insertClub: mkClub, insertClubViabilitySignal: mkSignal, insertMember: mkMember } = await import('../fixtures/factories');
    const clubId = mkClub(db, { id: 'cleanup-parked-club', name: 'Parked Club' });
    mkMember(db, { id: 'cleanup-sig-1', slug: 'cleanup_sig_1', login_email: 'sig1@example.com' });
    mkMember(db, { id: 'cleanup-sig-2', slug: 'cleanup_sig_2', login_email: 'sig2@example.com' });
    mkSignal(db, { member_id: 'cleanup-sig-1', club_id: clubId, activity_signal: 'not_active' });
    mkSignal(db, { member_id: 'cleanup-sig-2', club_id: clubId, activity_signal: 'not_active' });
    db.close();

    // A concordant-inactive club is also active and leaderless, so it carries
    // two queue items; park both to take it fully off the working queue.
    for (const predicate of ['crowdsource_viability', 'leaderless_active']) {
      const parkRes = await request(createApp())
        .post(`/admin/club-cleanup/${clubId}/resolve`)
        .set('Cookie', adminCookie())
        .send({ action: 'park', predicate, reasonText: 'Revisit later' });
      expect(parkRes.status).toBe(303);
    }

    // Parked, not lost: absent from the working tables, present in the parked
    // listing with who parked it and why.
    const parked = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(parked.text).toContain('Revisit later');
    expect(parked.text).toContain('Parked Club');
    // The working row's recommendation is the tell that the item is live; a
    // parked club shows only in the parked listing.
    expect(parked.text).not.toContain('Demote to inactive');

    // A third member answering after the park is new evidence, so the club
    // rejoins the working queue on its own with no window to wait out.
    const db2 = new BetterSqlite3(dbPath);
    const { insertClubViabilitySignal: mkSignal2, insertMember: mkMember2 } = await import('../fixtures/factories');
    mkMember2(db2, { id: 'cleanup-sig-3', slug: 'cleanup_sig_3', login_email: 'sig3@example.com' });
    // Stamped after the park, which is what makes it new evidence: the factory
    // otherwise dates every row to the same fixed timestamp.
    mkSignal2(db2, {
      member_id: 'cleanup-sig-3',
      club_id: clubId,
      activity_signal: 'not_active',
      created_at: new Date(Date.now() + 60_000).toISOString(),
    });
    db2.close();

    const after = await request(createApp())
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(after.text).toContain('Parked Club');
    expect(after.text).toContain('Demote to inactive');
  });
});

describe('queue filter and sort query params', () => {
  // By this point in the file the queue holds predicate items for the stale
  // provisional club and the re-surfaced parked club, and no residue or
  // candidates; the filters below pivot on that state.
  it('category filter hides items from other categories', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup?category=stale_provisional')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Stale Provisional Club');
    // The parked listing is deliberately unfiltered, so the filter is proved by
    // the absence of the other category's working row, not of the club name.
    expect(res.text).not.toContain('Demote to inactive');
  });

  it('category=residue empties the predicate table', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup?category=residue')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Stale Provisional Club');
  });

  it('region filter matches region or country case-insensitively', async () => {
    const match = await request(createApp())
      .get('/admin/club-cleanup?region=usa')
      .set('Cookie', adminCookie());
    expect(match.status).toBe(200);
    expect(match.text).toContain('Stale Provisional Club');

    const noMatch = await request(createApp())
      .get('/admin/club-cleanup?region=nowhere')
      .set('Cookie', adminCookie());
    expect(noMatch.status).toBe(200);
    expect(noMatch.text).not.toContain('Stale Provisional Club');
  });

  it('sort=age renders the queue without error', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup?sort=age')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Stale Provisional Club');
  });

  it('unknown filter and sort values fall back to the unfiltered queue', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup?category=bogus&sort=bogus&region=')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Stale Provisional Club');
    expect(res.text).toContain('Parked Club');
  });
});

describe('demote cascade retires pending legacy residue', () => {
  it('demoting a club transitions its pending affiliations to former_only', async () => {
    const db = new BetterSqlite3(dbPath);
    const {
      insertClub: mkClub,
      insertClubViabilitySignal: mkSignal,
      insertLegacyClubCandidate: mkCandidate,
      insertLegacyPersonClubAffiliation: mkAffiliation,
    } = await import('../fixtures/factories');
    const clubId = mkClub(db, { id: 'cleanup-residue-club', name: 'Residue Club' });
    const candidateId = mkCandidate(db, { mapped_club_id: clubId, classification: 'pre_populate' });
    const affId = mkAffiliation(db, {
      legacy_club_candidate_id: candidateId,
      legacy_member_id: 'lm-residue-1',
      resolution_status: 'pending',
    });
    mkSignal(db, { member_id: 'cleanup-sig-1', club_id: clubId, activity_signal: 'not_active' });
    mkSignal(db, { member_id: 'cleanup-sig-2', club_id: clubId, activity_signal: 'not_active' });
    db.close();

    const res = await request(createApp())
      .post(`/admin/club-cleanup/${clubId}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'demote_inactive', predicate: 'crowdsource_viability', reasonText: 'Concordant inactive' });
    expect(res.status).toBe(303);

    const db2 = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const aff = db2.prepare('SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?')
        .get(affId) as { resolution_status: string };
      expect(aff.resolution_status).toBe('former_only');
    } finally {
      db2.close();
    }
  });
});
