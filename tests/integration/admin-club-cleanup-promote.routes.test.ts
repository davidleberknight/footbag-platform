import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3995');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import {
  insertMember,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertClubViabilitySignal,
  createTestSessionJwt,
} from '../fixtures/factories';
import { stableClubId } from '../../src/services/clubTag';

const ADMIN_ID  = 'promote-admin-001';
const MEMBER_ID = 'promote-member-001';

// The deterministic club id derives from this key; the route test asserts
// the promoted clubs row lands on exactly that id.
const OV_KEY      = 'promote-test-austin';
const OV_CAND     = 'lcc-promote-ov';
const DORMANT_CAND = 'lcc-promote-dormant';
const JUNK_CAND    = 'lcc-promote-junk';
const BAD_URL_CAND = 'lcc-promote-bad-url';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID, role: 'member' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: ADMIN_ID,  slug: 'promote_admin',  display_name: 'Promote Admin',  login_email: 'promote-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'promote_member', display_name: 'Promote Member', login_email: 'promote-member@example.com' });

  insertLegacyClubCandidate(db, {
    id: OV_CAND,
    legacy_club_key: OV_KEY,
    display_name: 'Austin Style',
    city: 'Austin',
    region: 'TX',
    country: 'USA',
    description: 'Austin freestyle crew since the nineties.',
    classification: 'onboarding_visible',
  });
  insertLegacyPersonClubAffiliation(db, {
    id: 'lpca-promote-1',
    legacy_member_id: 'legacy-promote-1',
    legacy_club_candidate_id: OV_CAND,
    display_name: 'Imported Member One',
  });
  insertLegacyPersonClubAffiliation(db, {
    id: 'lpca-promote-2',
    legacy_member_id: 'legacy-promote-2',
    legacy_club_candidate_id: OV_CAND,
    display_name: 'Imported Member Two',
  });

  insertLegacyClubCandidate(db, {
    id: DORMANT_CAND,
    legacy_club_key: 'promote-test-memphis',
    display_name: 'Memphis Footworks',
    city: 'Memphis',
    country: 'USA',
    classification: 'dormant',
  });

  insertLegacyClubCandidate(db, {
    id: JUNK_CAND,
    legacy_club_key: 'promote-test-junk',
    display_name: 'Junk Row',
    classification: 'junk',
  });

  // A disallowed-scheme URL fails validation synchronously; promotion must
  // still complete and publish no URL.
  insertLegacyClubCandidate(db, {
    id: BAD_URL_CAND,
    legacy_club_key: 'promote-test-bad-url',
    display_name: 'Bad URL Crew',
    city: 'Lyon',
    country: 'France',
    external_url: 'javascript:alert(1)',
    classification: 'onboarding_visible',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /admin/club-cleanup promotable candidates section', () => {
  it('lists unpromoted non-junk candidates with a promote form; junk gets no promote action', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Promotable candidates');
    expect(res.text).toContain('Austin Style');
    expect(res.text).toContain('Memphis Footworks');
    expect(res.text).toContain(`/admin/club-cleanup/candidates/${OV_CAND}/promote`);
    // A junk-flagged candidate surfaces only in the junk section of this
    // admin queue (confirm the verdict or return it to dormant); it is
    // never offered the promote-to-live action.
    expect(res.text).toContain('Junk Row');
    expect(res.text).not.toContain(`/admin/club-cleanup/candidates/${JUNK_CAND}/promote`);
  });
});

describe('POST /admin/club-cleanup/candidates/:candidateId/promote', () => {
  it('unauthenticated -> 302', async () => {
    const app = createApp();
    const res = await request(app).post(`/admin/club-cleanup/candidates/${OV_CAND}/promote`);
    expect(res.status).toBe(302);
  });

  it('non-admin -> 403', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/candidates/${OV_CAND}/promote`)
      .set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('unknown candidate -> 404', async () => {
    const app = createApp();
    const res = await request(app)
      .post('/admin/club-cleanup/candidates/lcc-does-not-exist/promote')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(404);
  });

  it('junk candidate -> 422 and nothing is written', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/candidates/${JUNK_CAND}/promote`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(422);

    const db = new BetterSqlite3(dbPath);
    try {
      const cand = db.prepare('SELECT mapped_club_id FROM legacy_club_candidates WHERE id = ?').get(JUNK_CAND) as Record<string, unknown>;
      expect(cand.mapped_club_id).toBeNull();
    } finally {
      db.close();
    }
  });

  it('promotes an onboarding-visible candidate: deterministic club id, live-content fields, hashtag, mapped_club_id, affiliation carry-forward, audit', async () => {
    const app = createApp();
    const expectedClubId = stableClubId(OV_KEY);

    const res = await request(app)
      .post(`/admin/club-cleanup/candidates/${OV_CAND}/promote`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reasonText: 'Confirmed real by curator review' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/club-cleanup');

    const db = new BetterSqlite3(dbPath);
    try {
      const club = db.prepare('SELECT * FROM clubs WHERE id = ?').get(expectedClubId) as Record<string, unknown>;
      expect(club).toBeTruthy();
      expect(club.name).toBe('Austin Style');
      expect(club.city).toBe('Austin');
      expect(club.region).toBe('TX');
      expect(club.country).toBe('USA');
      expect(club.description).toBe('Austin freestyle crew since the nineties.');
      expect(club.status).toBe('active');
      expect(club.external_url).toBeNull();

      const tag = db.prepare('SELECT tag_normalized FROM tags WHERE id = ?').get(club.hashtag_tag_id as string) as Record<string, unknown>;
      expect(tag.tag_normalized).toBe('#club_austin');

      const cand = db.prepare('SELECT mapped_club_id FROM legacy_club_candidates WHERE id = ?').get(OV_CAND) as Record<string, unknown>;
      expect(cand.mapped_club_id).toBe(expectedClubId);

      const lpca = db.prepare(
        'SELECT resolution_status, resolved_club_id FROM legacy_person_club_affiliations WHERE legacy_club_candidate_id = ? ORDER BY id',
      ).all(OV_CAND) as Array<Record<string, unknown>>;
      expect(lpca).toHaveLength(2);
      for (const row of lpca) {
        expect(row.resolution_status).toBe('promoted');
        expect(row.resolved_club_id).toBe(expectedClubId);
      }

      const audit = db.prepare(
        "SELECT reason_text, metadata_json FROM audit_entries WHERE action_type = 'admin.club_cleanup.promote' AND entity_id = ?",
      ).get(expectedClubId) as Record<string, unknown>;
      expect(audit).toBeTruthy();
      expect(audit.reason_text).toBe('Confirmed real by curator review');
      const metadata = JSON.parse(String(audit.metadata_json));
      expect(metadata.candidate_id).toBe(OV_CAND);
      expect(metadata.legacy_club_key).toBe(OV_KEY);
      expect(metadata.tag_normalized).toBe('#club_austin');
    } finally {
      db.close();
    }
  });

  it('re-promoting the same candidate is idempotent: one clubs row, one tag, 303', async () => {
    const app = createApp();
    const expectedClubId = stableClubId(OV_KEY);

    const res = await request(app)
      .post(`/admin/club-cleanup/candidates/${OV_CAND}/promote`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath);
    try {
      const clubCount = db.prepare('SELECT COUNT(*) AS c FROM clubs WHERE id = ?').get(expectedClubId) as { c: number };
      expect(clubCount.c).toBe(1);
      const tagCount = db.prepare("SELECT COUNT(*) AS c FROM tags WHERE tag_normalized = '#club_austin'").get() as { c: number };
      expect(tagCount.c).toBe(1);
    } finally {
      db.close();
    }
  });

  it('a promoted candidate leaves the promotable section', async () => {
    const app = createApp();
    const res = await request(app)
      .get('/admin/club-cleanup')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(`/admin/club-cleanup/candidates/${OV_CAND}/promote`);
  });

  it('promotes a dormant candidate via the admin override', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/candidates/${DORMANT_CAND}/promote`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath);
    try {
      const club = db.prepare('SELECT name, status FROM clubs WHERE id = ?').get(stableClubId('promote-test-memphis')) as Record<string, unknown>;
      expect(club.name).toBe('Memphis Footworks');
      expect(club.status).toBe('active');
    } finally {
      db.close();
    }
  });

  it('a candidate URL that fails validation publishes nothing; promotion still completes', async () => {
    const app = createApp();
    const res = await request(app)
      .post(`/admin/club-cleanup/candidates/${BAD_URL_CAND}/promote`)
      .set('Cookie', adminCookie());
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath);
    try {
      const club = db.prepare('SELECT external_url, external_url_validated_at FROM clubs WHERE id = ?')
        .get(stableClubId('promote-test-bad-url')) as Record<string, unknown>;
      expect(club.external_url).toBeNull();
      expect(club.external_url_validated_at).toBeNull();
      // The original value stays on the candidate row for later curator review.
      const cand = db.prepare('SELECT external_url FROM legacy_club_candidates WHERE id = ?').get(BAD_URL_CAND) as Record<string, unknown>;
      expect(cand.external_url).toBe('javascript:alert(1)');
    } finally {
      db.close();
    }
  });
});

describe('promotion carry-forward of candidate-keyed wizard flags', () => {
  const FLAGGED_CAND = 'lcc-promote-flagged';
  const FLAGGED_KEY  = 'promote-test-flagged';
  const VOTER_ONE    = 'promote-voter-001';
  const VOTER_TWO    = 'promote-voter-002';

  beforeAll(() => {
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id: VOTER_ONE, slug: 'promote_voter_one', display_name: 'Promote Voter One', login_email: 'promote-voter-1@example.com' });
    insertMember(db, { id: VOTER_TWO, slug: 'promote_voter_two', display_name: 'Promote Voter Two', login_email: 'promote-voter-2@example.com' });
    insertLegacyClubCandidate(db, {
      id: FLAGGED_CAND,
      legacy_club_key: FLAGGED_KEY,
      display_name: 'Flagged Promotion Club',
      city: 'Boulder',
      country: 'USA',
      classification: 'onboarding_visible',
    });
    for (const voter of [VOTER_ONE, VOTER_TWO]) {
      insertClubViabilitySignal(db, {
        member_id: voter,
        club_id: null,
        activity_signal: 'not_active',
        source_entity_type: 'legacy_club_candidate',
        source_entity_id: FLAGGED_CAND,
      });
    }
    db.close();
  });

  it('shows the candidate in the flag group before promotion', async () => {
    const res = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Wizard flags by candidate');
    expect(res.text).toContain('Flagged Promotion Club');
    expect(res.text).toContain('inactive per: Promote Voter One, Promote Voter Two');
  });

  it('admin promotion stamps the club id onto the flags, empties the flag group, and feeds the gates', async () => {
    const expectedClubId = stableClubId(FLAGGED_KEY);
    const res = await request(createApp())
      .post(`/admin/club-cleanup/candidates/${FLAGGED_CAND}/promote`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ reasonText: 'Real club; flags carry forward' });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    try {
      const rows = db.prepare(
        "SELECT club_id FROM club_viability_signals WHERE source_entity_id = ? AND source_entity_type = 'legacy_club_candidate'",
      ).all(FLAGGED_CAND) as Array<{ club_id: string | null }>;
      expect(rows).toHaveLength(2);
      for (const row of rows) {
        expect(row.club_id).toBe(expectedClubId);
      }

      const audit = db.prepare(
        "SELECT metadata_json FROM audit_entries WHERE action_type = 'admin.club_cleanup.promote' AND entity_id = ?",
      ).get(expectedClubId) as { metadata_json: string };
      expect(JSON.parse(audit.metadata_json).viability_flags_stamped).toBe(2);
    } finally {
      db.close();
    }

    // The candidate-flag group no longer carries the item; the same two
    // votes now drive the live club's gate (two inactive, no operational
    // life -> concordant inactive).
    const queue = await request(createApp())
      .get('/admin/club-cleanup?category=candidate_flag')
      .set('Cookie', adminCookie());
    expect(queue.text).not.toContain('Flagged Promotion Club');

    const { clubCleanupService } = await import('../../src/services/clubCleanupService');
    const result = clubCleanupService.evaluateClubViability(expectedClubId);
    expect(result.gate).toBe('G2_concordant_inactive');
  });
});
