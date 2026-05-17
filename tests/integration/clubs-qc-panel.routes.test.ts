/**
 * TEMP-DEVIATION: QC panel tests.
 * Current: tests for the dev+staging club-classification QC panel on
 *   /clubs/:key, plus the affiliation-derived leader fallback for
 *   non-pre_populate clubs. The QC panel is a temporary authoring aid;
 *   it is not a permanent public feature.
 * Target: delete this file and the QC panel rendering when the
 *   A_Review_Club_Cleanup_Signals admin queue is live.
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
  insertLegacyClubCandidate,
  insertLegacyPersonClubAffiliation,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

function authCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: 'qc-test-user', role: 'member' })}`;
}

const PRE_POPULATE_KEY = 'club_qc_prepop';
const ONBOARDING_KEY   = 'club_qc_onboarding';
const NO_EVIDENCE_KEY  = 'club_qc_no_evidence';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Test user the authCookie() above refers to.
  insertMember(db, {
    id: 'qc-test-user',
    slug: 'qc_test_user',
    login_email: 'qc-test-user@example.com',
    display_name: 'QC Test User',
  });

  // ── Club A: pre_populate with R1 + R3 firing and contact substitute applied.
  const prepopTag = insertTag(db, { standard_type: 'club', tag_normalized: `#${PRE_POPULATE_KEY}` });
  const prepopClubId = insertClub(db, {
    hashtag_tag_id: prepopTag,
    name: 'Pre-populate QC Club',
    city: 'QC City',
    country: 'USA',
  });
  insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_qc_prepop',
    display_name:    'Pre-populate QC Club',
    mapped_club_id:  prepopClubId,
    classification:  'pre_populate',
    confidence_score: 0.92,
    bootstrap_eligible: 1,
    r1: 1, r3: 1,
    contact_signal_substitute_applied: 1,
    last_hosted_year: 2023,
    contact_member_last_year: 2022,
    last_updated_year: 2021,
    created_year: 2014,
    ever_hosted: 1,
    unique_member_names: 8,
    linkable_member_count: 4,
  });

  // ── Club B: onboarding_visible with affiliation-derived leader + contact +
  // member. Used to prove the role split + dedup + role labels.
  const obvTag = insertTag(db, { standard_type: 'club', tag_normalized: `#${ONBOARDING_KEY}` });
  const obvClubId = insertClub(db, {
    hashtag_tag_id: obvTag,
    name: 'Onboarding QC Club',
    city: 'QC Town',
    country: 'USA',
  });
  const obvLcc = insertLegacyClubCandidate(db, {
    legacy_club_key: 'legacy_qc_onboarding',
    display_name:    'Onboarding QC Club',
    mapped_club_id:  obvClubId,
    classification:  'onboarding_visible',
    confidence_score: 0.55,
    bootstrap_eligible: 0,
    r8: 1,
    r10: 1,
    max_affiliated_member_last_year: 2021,
    unique_member_names: 12,
    linkable_member_count: 5,
  });
  // Affiliation-derived leader (no bootstrap_leaders row exists; service must
  // fall back to surfacing this person as a provisional leader).
  const obvLeaderHp = insertHistoricalPerson(db, {
    person_id:  'person-qc-leader-001',
    person_name: 'Qc Leader Person',
    country:    'US',
  });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id:     obvLeaderHp,
    legacy_club_candidate_id: obvLcc,
    inferred_role:            'leader',
    resolution_status:        'pending',
    display_name:             'Qc Leader Person',
  });
  // Affiliation-derived contact (separate person; renders with 'Contact' role label).
  const obvContactHp = insertHistoricalPerson(db, {
    person_id:   'person-qc-contact-001',
    person_name: 'Qc Contact Person',
    country:     'US',
  });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id:     obvContactHp,
    legacy_club_candidate_id: obvLcc,
    inferred_role:            'contact',
    resolution_status:        'pending',
    display_name:             'Qc Contact Person',
  });
  // Pure member: must NOT appear in leaders section.
  const obvMemberHp = insertHistoricalPerson(db, {
    person_id:   'person-qc-member-001',
    person_name: 'Qc Member Person',
    country:     'US',
  });
  insertLegacyPersonClubAffiliation(db, {
    historical_person_id:     obvMemberHp,
    legacy_club_candidate_id: obvLcc,
    inferred_role:            'member',
    resolution_status:        'pending',
    display_name:             'Qc Member Person',
  });

  // ── Club C: clubs row exists but no candidate row. QC panel must be absent
  // (service tolerates missing evidence row).
  const noEvTag = insertTag(db, { standard_type: 'club', tag_normalized: `#${NO_EVIDENCE_KEY}` });
  insertClub(db, {
    hashtag_tag_id: noEvTag,
    name: 'No Evidence Club',
    city: 'Vacuum',
    country: 'USA',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe(`GET /clubs/${PRE_POPULATE_KEY} — at-a-glance card (visible to all)`, () => {
  it('renders the at-a-glance section with category chip and confidence', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${PRE_POPULATE_KEY}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="club-at-a-glance');
    expect(res.text).toContain('Pre-populate');
    expect(res.text).toContain('Confidence 0.92');
  });

  it('renders the most-recent member-activity year inline', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${PRE_POPULATE_KEY}`);
    // Fixture sets no max_affiliated_member_last_year on this club, so the
    // 'members active through' phrase only appears when present. The pre_populate
    // tagline is always rendered.
    expect(res.text).toContain('Strong signals of recent activity');
  });

  it('does NOT render the full diagnostic panel to unauthenticated visitors', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${PRE_POPULATE_KEY}`);
    expect(res.text).not.toContain('class="club-qc-panel');
    expect(res.text).not.toContain('Why this category?');
    expect(res.text).not.toContain('Rule firings');
  });
});

describe(`GET /clubs/${PRE_POPULATE_KEY} — full diagnostic (authenticated only)`, () => {
  it('renders the full diagnostic panel to authenticated members', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${PRE_POPULATE_KEY}`)
      .set('Cookie', authCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="club-qc-panel');
    expect(res.text).toContain('Why this category?');
  });

  it('renders the plain-English narrative naming the firing rules', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${PRE_POPULATE_KEY}`)
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/Pre-populate because [^.]*\(R1\)/);
    expect(res.text).toMatch(/\(R3\)/);
  });

  it('marks R1 and R3 as fired in the rule table', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${PRE_POPULATE_KEY}`)
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/club-qc-rule club-qc-rule--fired[\s\S]{0,200}>R1:/);
    expect(res.text).toMatch(/club-qc-rule club-qc-rule--fired[\s\S]{0,200}>R3:/);
    expect(res.text).toMatch(/club-qc-rule club-qc-rule--not-fired[\s\S]{0,200}>R2:/);
  });

  it('renders the contact-substitute warning when applied', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${PRE_POPULATE_KEY}`)
      .set('Cookie', authCookie());
    expect(res.text).toContain('Contact substitute');
    expect(res.text).toContain('any-member-active predicate');
  });

  it('renders the rule inputs block with human-readable labels', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${PRE_POPULATE_KEY}`)
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/Last hosted an event<\/dt>\s*<dd>2023<\/dd>/);
    expect(res.text).toMatch(/Has ever hosted<\/dt>\s*<dd>yes<\/dd>/);
  });
});

describe(`GET /clubs/${ONBOARDING_KEY} — affiliation-derived leader fallback`, () => {
  it('renders the Leaders section using affiliation rows (no bootstrap_leaders present)', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${ONBOARDING_KEY}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="club-leaders-heading"');
    expect(res.text).toContain('Qc Leader Person');
  });

  it('renders the Contact role label for inferred_role=contact', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${ONBOARDING_KEY}`);
    expect(res.text).toContain('Qc Contact Person');
    expect(res.text).toMatch(/Qc Contact Person[\s\S]{0,200}Contact/);
  });

  it('does NOT render members in the Leaders section', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${ONBOARDING_KEY}`);
    // Member name should not appear (auth-gated; unauthenticated request).
    expect(res.text).not.toContain('Qc Member Person');
  });

  it('PRIVACY GATE: no email-shaped strings on the affiliation-derived path', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${ONBOARDING_KEY}`);
    // The affiliation fixture has no contact_email, but assert no mailto: leaks anyway.
    expect(res.text).not.toMatch(/mailto:/);
  });

  it('renders the onboarding_visible category label in the visitor summary', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${ONBOARDING_KEY}`);
    expect(res.text).toContain('Onboarding-visible');
  });

  it('shows the R8 + R10 narrative in the authenticated diagnostic', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${ONBOARDING_KEY}`)
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/Onboarding-visible because [^.]*\(R8\)/);
    expect(res.text).toMatch(/\(R10\)/);
  });
});

describe(`GET /clubs/${NO_EVIDENCE_KEY} — QC panel absent when no candidate row`, () => {
  it('renders the at-a-glance section without classifier chip or diagnostic (unauthenticated)', async () => {
    const app = createApp();
    const res = await request(app).get(`/clubs/${NO_EVIDENCE_KEY}`);
    expect(res.status).toBe(200);
    // At-a-glance is always rendered (vitality fields are independent of qcPanel)
    expect(res.text).toContain('class="club-at-a-glance');
    // Classifier chip + diagnostic are absent when qcPanel is undefined
    expect(res.text).not.toContain('club-qc-category-chip');
    expect(res.text).not.toContain('class="club-qc-panel');
    expect(res.text).not.toContain('Why this category?');
  });

  it('renders the at-a-glance without diagnostic (authenticated)', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${NO_EVIDENCE_KEY}`)
      .set('Cookie', authCookie());
    expect(res.text).toContain('class="club-at-a-glance');
    expect(res.text).not.toContain('club-qc-category-chip');
    expect(res.text).not.toContain('class="club-qc-panel');
  });
});

describe(`GET /clubs/${ONBOARDING_KEY} — member links to /history/{personId}`, () => {
  it('links member names to /history/{personId} when historical_person_id is set', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/clubs/${ONBOARDING_KEY}`)
      .set('Cookie', authCookie());
    expect(res.text).toMatch(/<a class="club-member-name" href="\/history\/person-qc-member-001">Qc Member Person<\/a>/);
  });
});
