/**
 * Integration tests for the Leaders section on /clubs/:key.
 *
 * Leader identities on the club detail page are member-visible: names
 * render to authenticated viewers only; anonymous responses carry no
 * leader names. Bootstrap leaders are pipeline-derived
 * (status='provisional') and render with a "Provisional leader" badge
 * and an "imported from historical records" note. Contact email is
 * gated and MUST NOT appear in HTML for provisional rows.
 *
 * Other status values (claimed, verified) share the same ClubLeader
 * shape; only the service mapping varies by status.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertTag,
  insertClub,
  insertHistoricalPerson,
  insertLegacyMember,
  insertClubBootstrapLeader,
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertMember,
  createTestSessionJwt,
  completeOnboarding,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3092');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

function authCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: 'leaders-test-user', role: 'member' })}`;
}

const CLUB_TAG_NORMALIZED = '#club_test_leaders';
const CLUB_KEY            = 'club_test_leaders';
const LEADER_LEGACY_ID    = 'legacy-leader-001';
const COLEADER_LEGACY_ID  = 'legacy-coleader-002';
const LEADER_PERSON_ID    = 'person-leader-001';
const COLEADER_PERSON_ID  = 'person-coleader-002';
let CLUB_ID = '';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Authenticated viewer for the member-visible leaders section.
  insertMember(db, {
    id: 'leaders-test-user',
    slug: 'leaders_test_user',
    login_email: 'leaders-test-user@example.com',
    display_name: 'Leaders Test User',
  });
  completeOnboarding(db, 'leaders-test-user');

  const tagId = insertTag(db, {
    standard_type: 'club',
    tag_normalized: CLUB_TAG_NORMALIZED,
  });
  CLUB_ID = insertClub(db, {
    hashtag_tag_id: tagId,
    name:           'Test Leaders Club',
    city:           'Testopolis',
    country:        'USA',
  });

  // Two leaders: one as 'leader' (Zelda — would sort last alphabetically)
  // and one as 'co-leader' (Anna — would sort first alphabetically). The
  // service must put 'leader' before 'co-leader' regardless of name order;
  // this fixture intentionally inverts the alphabetical order to verify it.
  insertLegacyMember(db, {
    legacy_member_id: LEADER_LEGACY_ID,
    real_name: 'Zelda Headleader',
  });
  insertHistoricalPerson(db, {
    person_id:        LEADER_PERSON_ID,
    person_name:      'Zelda Headleader',
    legacy_member_id: LEADER_LEGACY_ID,
    source_scope:     'CANONICAL',
  });
  insertLegacyMember(db, {
    legacy_member_id: COLEADER_LEGACY_ID,
    real_name: 'Anna Sidekick',
  });
  insertHistoricalPerson(db, {
    person_id:        COLEADER_PERSON_ID,
    person_name:      'Anna Sidekick',
    legacy_member_id: COLEADER_LEGACY_ID,
    source_scope:     'CANONICAL',
  });

  insertClubBootstrapLeader(db, {
    club_id:          CLUB_ID,
    legacy_member_id: LEADER_LEGACY_ID,
    role:             'leader',
    status:           'provisional',
  });
  insertClubBootstrapLeader(db, {
    club_id:          CLUB_ID,
    legacy_member_id: COLEADER_LEGACY_ID,
    role:             'co-leader',
    status:           'provisional',
  });

  // Empty-leaders sibling club: no bootstrap_leaders rows. Used to verify
  // the Leaders section is hidden when none exist.
  const emptyTagId = insertTag(db, {
    standard_type: 'club',
    tag_normalized: '#club_test_no_leaders',
  });
  insertClub(db, {
    hashtag_tag_id: emptyTagId,
    name:           'Empty Leaders Club',
    city:           'Nowhere',
    country:        'USA',
  });

  // Suppression-status leaders on a third club: superseded + rejected
  // rows MUST NOT render publicly.
  const suppTagId = insertTag(db, {
    standard_type: 'club',
    tag_normalized: '#club_test_suppressed',
  });
  const suppClubId = insertClub(db, {
    hashtag_tag_id: suppTagId,
    name:           'Suppressed Leaders Club',
    city:           'Suppressville',
    country:        'USA',
  });
  insertLegacyMember(db, { legacy_member_id: 'legacy-supersede-003', real_name: 'Old Leader' });
  insertHistoricalPerson(db, {
    person_id:        'person-supersede-003',
    person_name:      'Old Leader',
    legacy_member_id: 'legacy-supersede-003',
    source_scope:     'CANONICAL',
  });
  insertClubBootstrapLeader(db, {
    club_id:          suppClubId,
    legacy_member_id: 'legacy-supersede-003',
    role:             'leader',
    status:           'superseded',
  });
  insertLegacyMember(db, { legacy_member_id: 'legacy-rejected-004', real_name: 'Rejected Person' });
  insertHistoricalPerson(db, {
    person_id:        'person-rejected-004',
    person_name:      'Rejected Person',
    legacy_member_id: 'legacy-rejected-004',
    source_scope:     'CANONICAL',
  });
  insertClubBootstrapLeader(db, {
    club_id:          suppClubId,
    legacy_member_id: 'legacy-rejected-004',
    role:             'co-leader',
    status:           'rejected',
  });

  // Attach 4 historical members to CLUB_TAG_NORMALIZED via legacy affiliations.
  // Drives the "4 members" snapshot count. Each LPCA needs a historical_person_id
  // (CHECK constraint: HP-id OR legacy_member_id must be non-null).
  const mainLcc = insertLegacyClubCandidate(db, {
    mapped_club_id: CLUB_ID,
    classification: 'pre_populate',
  });
  for (let i = 0; i < 4; i++) {
    const lmId = `lm-snap-${i}`;
    const hpId = `hp-snap-${i}`;
    insertLegacyMember(db, { legacy_member_id: lmId, real_name: `Snap Member ${i + 1}` });
    insertHistoricalPerson(db, {
      person_id:        hpId,
      person_name:      `Snap Member ${i + 1}`,
      legacy_member_id: lmId,
      source_scope:     'CANONICAL',
    });
    insertLegacyPersonClubAffiliation(db, {
      legacy_club_candidate_id: mainLcc,
      historical_person_id:     hpId,
      resolution_status:        'confirmed_current',
      resolved_club_id:         CLUB_ID,
      display_name:             `Snap Member ${i + 1}`,
    });
  }

  // Sparse historical club for snapshot status='Historical club' assertion.
  const histTagId = insertTag(db, { standard_type: 'club', tag_normalized: '#club_test_historical' });
  insertClub(db, {
    hashtag_tag_id: histTagId,
    name:    'Historical Test Club',
    city:    'Yesteryear',
    country: 'USA',
    status:  'inactive',
  });

  // HP-less leader club: legacy_members row exists, but NO historical_persons
  // row. Path-B contract: still renders, name from legacy_members.real_name,
  // no /history/<id> link (template branches on personId).
  const hplessTagId = insertTag(db, {
    standard_type: 'club',
    tag_normalized: '#club_test_hpless',
  });
  const hplessClubId = insertClub(db, {
    hashtag_tag_id: hplessTagId,
    name:           'HP-less Leader Club',
    city:           'Limboville',
    country:        'USA',
  });
  insertLegacyMember(db, {
    legacy_member_id: 'legacy-hpless-005',
    real_name: 'Mira NoHistorical',
  });
  // Intentionally NOT inserting a historical_persons row for legacy-hpless-005.
  insertClubBootstrapLeader(db, {
    club_id:          hplessClubId,
    legacy_member_id: 'legacy-hpless-005',
    role:             'leader',
    status:           'provisional',
  });

  // Solo co-leader club: the only known leader entry is a co-leader. The page
  // must present it as Leader (a lone co-leader reads as a contradiction).
  const soloTagId = insertTag(db, {
    standard_type: 'club',
    tag_normalized: '#club_test_solo_coleader',
  });
  const soloClubId = insertClub(db, {
    hashtag_tag_id: soloTagId,
    name:           'Solo Co-leader Club',
    city:           'Singleton',
    country:        'USA',
  });
  insertLegacyMember(db, { legacy_member_id: 'legacy-solo-006', real_name: 'Solo Wingman' });
  insertHistoricalPerson(db, {
    person_id:        'person-solo-006',
    person_name:      'Solo Wingman',
    legacy_member_id: 'legacy-solo-006',
    source_scope:     'CANONICAL',
  });
  insertClubBootstrapLeader(db, {
    club_id:          soloClubId,
    legacy_member_id: 'legacy-solo-006',
    role:             'co-leader',
    status:           'provisional',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ----------------------------------------------------------------------------

describe(`GET /clubs/${CLUB_KEY} — Leaders section (authenticated)`, () => {
  it('returns 200 and renders the Leaders section', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('>Leaders<');
  });

  it('renders both leader display names', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    expect(res.text).toContain('Zelda Headleader');
    expect(res.text).toContain('Anna Sidekick');
  });

  it('renders the Provisional leader badge wording', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    expect(res.text).toContain('Provisional leader');
  });

  it('renders the "imported from historical records" note', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    expect(res.text).toContain('imported from historical records');
  });

  it('renders explicit role labels (Leader / Co-leader)', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    expect(res.text).toMatch(/Zelda Headleader[\s\S]{0,80}Leader/);
    expect(res.text).toContain('Co-leader');
  });

  it('sorts leader before co-leader regardless of alphabetical order', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    const leaderIdx   = res.text.indexOf('Zelda Headleader');
    const coleaderIdx = res.text.indexOf('Anna Sidekick');
    expect(leaderIdx).toBeGreaterThan(0);
    expect(coleaderIdx).toBeGreaterThan(0);
    expect(leaderIdx).toBeLessThan(coleaderIdx);
  });

  it('links leader name to /history/:personId when personId is set', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    expect(res.text).toContain(`href="/history/${LEADER_PERSON_ID}"`);
    expect(res.text).toContain(`href="/history/${COLEADER_PERSON_ID}"`);
  });

  it('PRIVACY GATE: does not expose contact email for provisional leaders', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`).set('Cookie', authCookie());
    expect(res.text).not.toMatch(/href="mailto:[^"]*"/);
    expect(res.text).not.toContain('class="club-leader-email"');
  });
});

describe(`GET /clubs/${CLUB_KEY} — Leaders hidden from anonymous visitors`, () => {
  it('PRIVACY GATE: renders no Leaders section and no leader names unauthenticated', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('>Leaders<');
    expect(res.text).not.toContain('Zelda Headleader');
    expect(res.text).not.toContain('Anna Sidekick');
    // The members login gate still shows.
    expect(res.text).toContain('club-members-gate');
  });
});

describe('GET /clubs/club_test_no_leaders — empty leaders case', () => {
  it('does NOT render the Leaders section when no bootstrap leaders exist', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_test_no_leaders').set('Cookie', authCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('>Leaders<');
  });
});

describe('GET /clubs/club_test_suppressed — suppression filter', () => {
  it('does NOT render leaders with status=superseded or rejected', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_test_suppressed').set('Cookie', authCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Old Leader');
    expect(res.text).not.toContain('Rejected Person');
    expect(res.text).not.toContain('>Leaders<');
  });
});

describe('GET /clubs/club_test_solo_coleader — lone co-leader presents as Leader', () => {
  it('labels the only leader entry "(Leader)" even though the stored role is co-leader', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_test_solo_coleader').set('Cookie', authCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Solo Wingman');
    expect(res.text).toMatch(/Solo Wingman[\s\S]{0,120}\(Leader\)/);
    expect(res.text).not.toContain('(Co-leader)');
  });
});

// Vitality chips render only inside the auth-gated curator diagnostic panel;
// the public detail page carries no at-a-glance card. Chip shaping itself is
// covered by the country-page leader-summary tests and the curator-panel tests.
describe(`GET /clubs/${CLUB_KEY} — no public at-a-glance card`, () => {
  it('renders no at-a-glance card or vitality chips to unauthenticated visitors', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${CLUB_KEY}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('aria-label="At a glance"');
    expect(res.text).not.toMatch(/2 leaders/);
    expect(res.text).not.toMatch(/4 members/);
  });
});

describe('GET /clubs/club_test_no_leaders — no vitality surface without classification evidence', () => {
  it('renders no vitality chips when the club has no candidate row', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_test_no_leaders');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('aria-label="At a glance"');
    expect(res.text).not.toContain('No known leaders yet');
    expect(res.text).not.toContain('Needs update');
  });
});

describe('GET /clubs/club_test_hpless — leader without historical_persons row', () => {
  it('renders the leader using the legacy_members.real_name fallback', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_test_hpless').set('Cookie', authCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('>Leaders<');
    expect(res.text).toContain('Mira NoHistorical');
  });

  it('does NOT link the leader name to /history/:personId when no HP row exists', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_test_hpless').set('Cookie', authCookie());
    // No anchor wrapping the name (template branches on personId presence).
    expect(res.text).toMatch(/<span class="club-leader-name">Mira NoHistorical<\/span>/);
    expect(res.text).not.toMatch(/<a [^>]+href="\/history\/[^"]+"[^>]*>Mira NoHistorical<\/a>/);
  });

  it('still surfaces the Provisional leader badge for an HP-less leader', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/club_test_hpless').set('Cookie', authCookie());
    expect(res.text).toContain('Provisional leader');
  });
});
