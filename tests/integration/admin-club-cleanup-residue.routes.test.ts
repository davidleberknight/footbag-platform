/**
 * Integration tests for the admin de-list of unconfirmed legacy residue.
 *
 * The admin club-cleanup page surfaces, separately from the predicate queue,
 * every live club that still carries 'pending' legacy affiliations (residue
 * left by people who never confirmed in onboarding). A one-click de-list flips
 * a club's pending rows to 'former_only', which the roster filter excludes, so
 * they stop rendering as possible members. Demote/archive cascades the same
 * de-list. Nothing transitions on a timer; the admin decides per club.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3987');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertTag,
  insertClub,
  insertHistoricalPerson,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  completeOnboarding,
  createTestSessionJwt,
} from '../fixtures/factories';

const ADMIN_ID  = 'residue-admin-001';
const MEMBER_ID = 'residue-member-001';

const CLUB_A = 'residue-club-a'; // active: 1 confirmed + 2 pending (de-list target)
const CLUB_B = 'residue-club-b'; // active: 1 pending (cascade-via-archive target)
const CLUB_C = 'residue-club-c'; // active: 1 pending, never mutated (isolation control)

// Affiliation ids captured at seed time so tests can read back status.
const aff: Record<string, string> = {};

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}
function readStatus(affId: string): string {
  const db = new BetterSqlite3(dbPath);
  try {
    const row = db
      .prepare('SELECT resolution_status FROM legacy_person_club_affiliations WHERE id = ?')
      .get(affId) as { resolution_status: string };
    return row.resolution_status;
  } finally {
    db.close();
  }
}

function seedClub(db: BetterSqlite3.Database, clubId: string, tag: string, name: string): string {
  insertClub(db, {
    id: clubId,
    name,
    city: 'Townsville',
    country: 'USA',
    hashtag_tag_id: insertTag(db, { tag_normalized: tag, tag_display: tag, standard_type: 'club' }),
  });
  return insertLegacyClubCandidate(db, {
    legacy_club_key: `legacy_${clubId}`,
    display_name: name,
    mapped_club_id: clubId,
  });
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: ADMIN_ID, slug: 'residue_admin', display_name: 'Residue Admin', login_email: 'residue-admin@example.com', is_admin: 1 });
  completeOnboarding(db, ADMIN_ID);
  insertMember(db, { id: MEMBER_ID, slug: 'residue_member', display_name: 'Residue Member', login_email: 'residue-member@example.com' });

  // Club A: one confirmed member plus two pending residue rows.
  const candA = seedClub(db, CLUB_A, '#club_resa', 'Residue Club A');
  const confA = insertHistoricalPerson(db, { person_id: 'res-conf-a', person_name: 'Confirmed PersonA', country: 'US' });
  aff.confA = insertLegacyPersonClubAffiliation(db, { historical_person_id: confA, legacy_club_candidate_id: candA, resolution_status: 'confirmed_current', resolved_club_id: CLUB_A });
  const a1 = insertHistoricalPerson(db, { person_id: 'res-pend-a1', person_name: 'Residue PersonOne', country: 'US' });
  aff.pendA1 = insertLegacyPersonClubAffiliation(db, { historical_person_id: a1, legacy_club_candidate_id: candA, resolution_status: 'pending' });
  const a2 = insertHistoricalPerson(db, { person_id: 'res-pend-a2', person_name: 'Residue PersonTwo', country: 'US' });
  aff.pendA2 = insertLegacyPersonClubAffiliation(db, { historical_person_id: a2, legacy_club_candidate_id: candA, resolution_status: 'pending' });

  // Club B: one pending residue row (cascade-via-archive target).
  const candB = seedClub(db, CLUB_B, '#club_resb', 'Residue Club B');
  const b1 = insertHistoricalPerson(db, { person_id: 'res-pend-b1', person_name: 'Bravo Pending', country: 'US' });
  aff.pendB = insertLegacyPersonClubAffiliation(db, { historical_person_id: b1, legacy_club_candidate_id: candB, resolution_status: 'pending' });

  // Club C: one pending residue row, never mutated — isolation control.
  const candC = seedClub(db, CLUB_C, '#club_resc', 'Residue Club C');
  const c1 = insertHistoricalPerson(db, { person_id: 'res-pend-c1', person_name: 'Charlie Pending', country: 'US' });
  aff.pendC = insertLegacyPersonClubAffiliation(db, { historical_person_id: c1, legacy_club_candidate_id: candC, resolution_status: 'pending' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// The residue listing for a club is identified unambiguously by its de-list
// form action, which never collides with predicate-queue rows.
function residueFormAction(clubId: string): string {
  return `/admin/club-cleanup/${clubId}/delist-residue`;
}

describe('GET /admin/club-cleanup — unconfirmed residue listing', () => {
  it('lists every live club with pending residue, including active ones', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/club-cleanup').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Unconfirmed legacy residue');
    expect(res.text).toContain(residueFormAction(CLUB_A));
    expect(res.text).toContain(residueFormAction(CLUB_B));
    expect(res.text).toContain(residueFormAction(CLUB_C));
  });
});

describe('POST /admin/club-cleanup/:clubId/delist-residue — authorization', () => {
  it('unauthenticated -> 302 and leaves residue untouched', async () => {
    const app = createApp();
    const res = await request(app).post(residueFormAction(CLUB_A));
    expect(res.status).toBe(302);
    expect(readStatus(aff.pendA1)).toBe('pending');
  });

  it('non-admin -> 403 and leaves residue untouched', async () => {
    const app = createApp();
    const res = await request(app).post(residueFormAction(CLUB_A)).set('Cookie', memberCookie());
    expect(res.status).toBe(403);
    expect(readStatus(aff.pendA1)).toBe('pending');
  });
});

describe('POST /admin/club-cleanup/:clubId/delist-residue — happy path', () => {
  it('flips only the target club\'s pending rows to former_only', async () => {
    const app = createApp();
    const res = await request(app)
      .post(residueFormAction(CLUB_A))
      .set('Cookie', adminCookie())
      .send({ reasonText: 'Grace elapsed' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/club-cleanup');

    // Both pending rows for A retired.
    expect(readStatus(aff.pendA1)).toBe('former_only');
    expect(readStatus(aff.pendA2)).toBe('former_only');
    // Confirmed member untouched.
    expect(readStatus(aff.confA)).toBe('confirmed_current');
    // Other clubs untouched.
    expect(readStatus(aff.pendB)).toBe('pending');
    expect(readStatus(aff.pendC)).toBe('pending');
  });

  it('records a per-club audit entry with the de-listed count', async () => {
    const db = new BetterSqlite3(dbPath);
    try {
      const audit = db
        .prepare("SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'admin.club_cleanup.delist_residue'")
        .get(CLUB_A) as { metadata_json: string } | undefined;
      expect(audit).toBeTruthy();
      expect(audit!.metadata_json).toContain('delisted_count');
    } finally {
      db.close();
    }
  });

  it('is idempotent: re-running leaves the rows former_only and still redirects', async () => {
    const app = createApp();
    const res = await request(app).post(residueFormAction(CLUB_A)).set('Cookie', adminCookie());
    expect(res.status).toBe(303);
    expect(readStatus(aff.pendA1)).toBe('former_only');
  });

  it('unknown club id -> 303 with no error and no collateral change', async () => {
    const app = createApp();
    const res = await request(app).post(residueFormAction('no-such-club')).set('Cookie', adminCookie());
    expect(res.status).toBe(303);
    expect(readStatus(aff.pendC)).toBe('pending');
  });
});

describe('after de-list', () => {
  it('drops the cleared club from the residue listing but keeps the others', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/club-cleanup').set('Cookie', adminCookie());
    expect(res.text).not.toContain(residueFormAction(CLUB_A));
    expect(res.text).toContain(residueFormAction(CLUB_C));
  });

  it('removes the de-listed names from the club roster but keeps confirmed members', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_resa').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Confirmed PersonA');
    expect(res.text).not.toContain('Residue PersonOne');
    expect(res.text).not.toContain('Residue PersonTwo');
  });
});

describe('POST /admin/club-cleanup/:clubId/resolve — cascade', () => {
  it('archiving a club also retires its unconfirmed residue', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/${CLUB_B}/resolve`)
      .set('Cookie', adminCookie())
      .send({ action: 'archive', predicate: 'crowdsource_viability', reasonText: 'Defunct' });
    expect(res.status).toBe(303);

    expect(readStatus(aff.pendB)).toBe('former_only');

    const db = new BetterSqlite3(dbPath);
    try {
      const club = db.prepare('SELECT status FROM clubs WHERE id = ?').get(CLUB_B) as { status: string };
      expect(club.status).toBe('archived');
    } finally {
      db.close();
    }
  });
});
