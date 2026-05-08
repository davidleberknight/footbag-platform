/**
 * Integration tests for the leader summary on /clubs/:country.
 *
 * Each club entry on the country page renders up to LEADER_SUMMARY_CAP (=2)
 * leader names; remaining leaders collapse into a "+N more" overflow count.
 * Mirrors the detail-page status filter (provisional + claimed only;
 * superseded/rejected suppressed). No N+1 — single bulk query.
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
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3093');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

// Five clubs in USA exercising every cardinality:
//   ONE_LEADER     — 1 leader (no overflow)
//   TWO_LEADERS    — 2 leaders (cap, no overflow)
//   THREE_LEADERS  — 3 leaders (overflow=1)
//   FIVE_LEADERS   — 5 leaders (overflow=3)
//   ZERO_LEADERS   — 0 leaders (no summary block)
// Plus one club in CANADA used to verify cross-country isolation.
// Plus one club in USA with suppressed-only leaders to verify status filter.

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const mkClub = (slug: string, name: string, country = 'USA'): string => {
    const tagId = insertTag(db, {
      standard_type: 'club',
      tag_normalized: `#${slug}`,
    });
    return insertClub(db, {
      hashtag_tag_id: tagId,
      name,
      city:    'Testopolis',
      country,
    });
  };

  const addLeader = (
    clubId: string,
    legacyId: string,
    personId: string,
    personName: string,
    role: 'leader' | 'co-leader' = 'leader',
    status: 'provisional' | 'claimed' | 'superseded' | 'rejected' = 'provisional',
  ) => {
    insertLegacyMember(db, { legacy_member_id: legacyId, real_name: personName });
    insertHistoricalPerson(db, {
      person_id:        personId,
      person_name:      personName,
      legacy_member_id: legacyId,
      source_scope:     'CANONICAL',
    });
    insertClubBootstrapLeader(db, {
      club_id:          clubId,
      legacy_member_id: legacyId,
      role,
      status,
    });
  };

  // ONE_LEADER — Alice
  const oneId = mkClub('club_country_one', 'Country One Leader Club');
  addLeader(oneId, 'lm-cl-one-1', 'p-cl-one-1', 'Alice OneLeader');

  // TWO_LEADERS — Bob (leader), Carol (co-leader). Filling the cap exactly.
  const twoId = mkClub('club_country_two', 'Country Two Leaders Club');
  addLeader(twoId, 'lm-cl-two-1', 'p-cl-two-1', 'Bob TwoLeader',    'leader');
  addLeader(twoId, 'lm-cl-two-2', 'p-cl-two-2', 'Carol TwoCoLead',  'co-leader');

  // THREE_LEADERS — visible: Donovan (leader) + Eleanor (co-leader); overflow: Frank (co-leader).
  // Sort: leader-role first, then alphabetical. Frank > Eleanor by name.
  const threeId = mkClub('club_country_three', 'Country Three Leaders Club');
  addLeader(threeId, 'lm-cl-three-1', 'p-cl-three-1', 'Donovan Threelead', 'leader');
  addLeader(threeId, 'lm-cl-three-2', 'p-cl-three-2', 'Eleanor Threelead', 'co-leader');
  addLeader(threeId, 'lm-cl-three-3', 'p-cl-three-3', 'Frank Threelead',   'co-leader');

  // FIVE_LEADERS — leader (G), then 4 co-leaders sorted alphabetically (H, I, J, K).
  // Visible: G + H. Overflow: I, J, K → +3.
  const fiveId = mkClub('club_country_five', 'Country Five Leaders Club');
  addLeader(fiveId, 'lm-cl-five-1', 'p-cl-five-1', 'George Fivelead',  'leader');
  addLeader(fiveId, 'lm-cl-five-2', 'p-cl-five-2', 'Hannah Fivelead',  'co-leader');
  addLeader(fiveId, 'lm-cl-five-3', 'p-cl-five-3', 'Ivan Fivelead',    'co-leader');
  addLeader(fiveId, 'lm-cl-five-4', 'p-cl-five-4', 'Judith Fivelead',  'co-leader');
  addLeader(fiveId, 'lm-cl-five-5', 'p-cl-five-5', 'Kareem Fivelead',  'co-leader');

  // ZERO_LEADERS — no leader rows attached.
  mkClub('club_country_zero', 'Country Zero Leaders Club');

  // SUPPRESSED-ONLY club: every leader row has status=superseded or rejected.
  // Status filter must hide them; no leader summary block must render.
  const suppId = mkClub('club_country_supp', 'Country Suppressed-Only Club');
  addLeader(suppId, 'lm-cl-supp-1', 'p-cl-supp-1', 'Lana Supersede', 'leader',    'superseded');
  addLeader(suppId, 'lm-cl-supp-2', 'p-cl-supp-2', 'Mike Rejected',  'co-leader', 'rejected');

  // CLAIMED-status leader: must render (not just provisional).
  const claimedId = mkClub('club_country_claimed', 'Country Claimed Leader Club');
  addLeader(claimedId, 'lm-cl-cla-1', 'p-cl-cla-1', 'Nina Claimed', 'leader', 'claimed');

  // Cross-country isolation: a Canadian club with its own leader. Visiting
  // /clubs/usa MUST NOT show this leader; /clubs/canada MUST.
  const caId = mkClub('club_country_ca', 'Canadian Isolation Club', 'Canada');
  addLeader(caId, 'lm-cl-ca-1', 'p-cl-ca-1', 'Olive CanadaLead');

  // HP-less leader club: leader's legacy_member_id has a legacy_members row
  // but no historical_persons row. Path-B contract: still renders on the
  // country card via legacy_members.real_name fallback.
  const hplessId = mkClub('club_country_hpless', 'Country HP-less Leader Club');
  insertLegacyMember(db, { legacy_member_id: 'lm-cl-hpless-1', real_name: 'Quinn NoHP' });
  // Intentionally NOT inserting a historical_persons row.
  insertClubBootstrapLeader(db, {
    club_id:          hplessId,
    legacy_member_id: 'lm-cl-hpless-1',
    role:             'leader',
    status:           'provisional',
  });

  // Mixed club: one HP-having leader + one HP-less leader on the same club.
  // Both must surface in the summary; sort uses COALESCE so they alphabetize
  // together rather than HP-less rows clumping at the end.
  const mixedId = mkClub('club_country_mixed', 'Country Mixed HP Leader Club');
  // HP-having: 'Aaron Mixed' — alphabetically first
  addLeader(mixedId, 'lm-cl-mixed-1', 'p-cl-mixed-1', 'Aaron Mixed', 'leader');
  // HP-less: 'Bella Mixed' — second alphabetically; same role
  insertLegacyMember(db, { legacy_member_id: 'lm-cl-mixed-2', real_name: 'Bella Mixed' });
  insertClubBootstrapLeader(db, {
    club_id:          mixedId,
    legacy_member_id: 'lm-cl-mixed-2',
    role:             'leader',
    status:           'provisional',
  });

  // Vitality fixtures. Helper: attach N "members" (legacy_person_club_affiliations
  // with status='confirmed_current') to a club via a legacy_club_candidates row.
  // Each affiliation needs a historical_person_id (CHECK constraint: HP-id OR
  // legacy_member_id must be non-null).
  const attachMembers = (clubId: string, n: number, prefix: string): void => {
    const lccId = insertLegacyClubCandidate(db, {
      mapped_club_id: clubId,
      classification: 'pre_populate',
    });
    for (let i = 0; i < n; i++) {
      const lmId = `lm-mem-${prefix}-${i}`;
      const hpId = `hp-mem-${prefix}-${i}`;
      insertLegacyMember(db, { legacy_member_id: lmId, real_name: `Member ${i + 1}` });
      insertHistoricalPerson(db, {
        person_id:        hpId,
        person_name:      `Member ${i + 1}`,
        legacy_member_id: lmId,
        source_scope:     'CANONICAL',
      });
      insertLegacyPersonClubAffiliation(db, {
        legacy_club_candidate_id: lccId,
        historical_person_id:     hpId,
        resolution_status:        'confirmed_current',
        display_name:             `Member ${i + 1}`,
      });
    }
  };

  // Active + leaders + members → "X leaders · Y members" (no trailing status chip).
  // (TWO_LEADERS already has 2 leaders; attach 5 historical members to it.)
  attachMembers(twoId, 5, 'two');

  // Active + no leaders + members → "No known leaders yet · 4 members".
  const memOnlyId = mkClub('club_country_members_only', 'Country Members-Only Club');
  attachMembers(memOnlyId, 4, 'memonly');

  // Inactive → "Historical club" appended even when leaders/members present.
  const histTagId = insertTag(db, { standard_type: 'club', tag_normalized: '#club_country_historical' });
  const histId = insertClub(db, {
    hashtag_tag_id: histTagId,
    name:    'Country Historical Club',
    city:    'Yesteryear',
    country: 'USA',
    status:  'inactive',
  });
  addLeader(histId, 'lm-cl-hist-1', 'p-cl-hist-1', 'Hattie History', 'leader');
  attachMembers(histId, 3, 'hist');

  // Sparse → "No known leaders yet · Needs update" (no leaders, no members).
  // ZERO_LEADERS already qualifies; reuse for sparse assertion.

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ----------------------------------------------------------------------------

describe('GET /clubs/usa — leader summary on club cards', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    expect(res.status).toBe(200);
  });

  it('renders the single leader for a 1-leader club', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    expect(res.text).toContain('Alice OneLeader');
    // No overflow when total ≤ cap.
    const cardSlice = sliceCard(res.text, 'club_country_one');
    expect(cardSlice).toContain('Alice OneLeader');
    expect(cardSlice).not.toMatch(/\+\d+ more/);
  });

  it('renders both names at exactly cap=2 with no overflow', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_two');
    expect(cardSlice).toContain('Bob TwoLeader');
    expect(cardSlice).toContain('Carol TwoCoLead');
    expect(cardSlice).not.toMatch(/\+\d+ more/);
  });

  it('caps at 2 names and shows "+1 more" for a 3-leader club', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_three');
    expect(cardSlice).toContain('Donovan Threelead');
    expect(cardSlice).toContain('Eleanor Threelead');
    expect(cardSlice).not.toContain('Frank Threelead');
    expect(cardSlice).toMatch(/\+1 more/);
  });

  it('caps at 2 names and shows "+3 more" for a 5-leader club', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_five');
    expect(cardSlice).toContain('George Fivelead');
    expect(cardSlice).toContain('Hannah Fivelead');
    expect(cardSlice).not.toContain('Ivan Fivelead');
    expect(cardSlice).not.toContain('Judith Fivelead');
    expect(cardSlice).not.toContain('Kareem Fivelead');
    expect(cardSlice).toMatch(/\+3 more/);
  });

  it('puts leader-role names before co-leader-role names in the visible cap', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_three');
    const leaderIdx   = cardSlice.indexOf('Donovan Threelead');
    const coleaderIdx = cardSlice.indexOf('Eleanor Threelead');
    expect(leaderIdx).toBeGreaterThan(0);
    expect(coleaderIdx).toBeGreaterThan(0);
    expect(leaderIdx).toBeLessThan(coleaderIdx);
  });

  it('omits the Leaders summary block entirely when a club has zero leaders', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_zero');
    expect(cardSlice).not.toContain('class="club-leaders-summary"');
    expect(cardSlice).not.toContain('Leaders:');
  });

  it('hides leaders whose status is superseded or rejected', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_supp');
    expect(cardSlice).not.toContain('Lana Supersede');
    expect(cardSlice).not.toContain('Mike Rejected');
    expect(cardSlice).not.toContain('class="club-leaders-summary"');
  });

  it('renders leaders with status=claimed (not just provisional)', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_claimed');
    expect(cardSlice).toContain('Nina Claimed');
  });

  it('does not leak Canadian leaders onto the USA country page', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    expect(res.text).not.toContain('Olive CanadaLead');
  });

  it('renders an HP-less leader using the legacy_members.real_name fallback', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_hpless');
    expect(cardSlice).toContain('Quinn NoHP');
  });

  it('renders HP-having and HP-less leaders side-by-side on the same club', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_mixed');
    expect(cardSlice).toContain('Aaron Mixed');
    expect(cardSlice).toContain('Bella Mixed');
    // COALESCE sort: Aaron (HP-having) before Bella (HP-less); same role.
    const aIdx = cardSlice.indexOf('Aaron Mixed');
    const bIdx = cardSlice.indexOf('Bella Mixed');
    expect(aIdx).toBeGreaterThan(0);
    expect(bIdx).toBeGreaterThan(aIdx);
  });
});

describe('GET /clubs/usa — vitality metadata row', () => {
  it('renders a meta-row on every club entry', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    // Six fixture clubs in USA → six meta rows.
    const rowCount = (res.text.match(/class="club-meta-row /g) ?? []).length;
    expect(rowCount).toBeGreaterThanOrEqual(6);
  });

  it('active club with leaders + members → "leaders · members" without a status chip', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_two');
    expect(cardSlice).toContain('class="club-meta-row club-meta-row--known-leaders"');
    expect(cardSlice).toContain('2 leaders');
    expect(cardSlice).toContain('5 members');
    // Status chip suppressed when implicit in the count chips.
    expect(cardSlice).not.toContain('Known leaders');
    expect(cardSlice).not.toContain('Historical club');
    expect(cardSlice).not.toContain('Needs update');
  });

  it('active club with no leaders but members → "No known leaders yet · N members"', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_members_only');
    expect(cardSlice).toContain('class="club-meta-row club-meta-row--member-activity"');
    expect(cardSlice).toContain('No known leaders yet');
    expect(cardSlice).toContain('4 members');
    expect(cardSlice).not.toContain('Member activity');  // suppressed when implicit
    expect(cardSlice).not.toContain('Needs update');
  });

  it('inactive club → "Historical club" chip appended even with leaders + members', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_historical');
    expect(cardSlice).toContain('class="club-meta-row club-meta-row--historical-club"');
    expect(cardSlice).toContain('1 leader');     // singular form
    expect(cardSlice).toContain('3 members');
    expect(cardSlice).toContain('Historical club');
  });

  it('sparse club (no leaders, no members) → "No known leaders yet · Needs update"', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    const cardSlice = sliceCard(res.text, 'club_country_zero');
    expect(cardSlice).toContain('class="club-meta-row club-meta-row--needs-update"');
    expect(cardSlice).toContain('No known leaders yet');
    expect(cardSlice).toContain('Needs update');
  });

  it('singular vs plural leader chip: "1 leader" vs "2 leaders"', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/usa');
    expect(sliceCard(res.text, 'club_country_one')).toContain('1 leader');
    expect(sliceCard(res.text, 'club_country_one')).not.toContain('1 leaders');
    expect(sliceCard(res.text, 'club_country_two')).toContain('2 leaders');
  });
});

describe('GET /clubs/canada — cross-country isolation', () => {
  it('renders the Canadian leader on the Canadian country page', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs/canada');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Olive CanadaLead');
    // And does NOT leak USA leaders.
    expect(res.text).not.toContain('Alice OneLeader');
    expect(res.text).not.toContain('George Fivelead');
  });
});

// ----------------------------------------------------------------------------
// Helper: extract the markup for a single club's <li> entry by data-club-id
// hashtag suffix. Anchors on the standard-tag prefix written into the card
// hashtag span ("#${slug}") to scope assertions to one club's slice of the
// country page.
function sliceCard(html: string, slug: string): string {
  // Each club <li> opens with `class="club-entry"` and contains the hashtag
  // span `<span class="club-hashtag">#${slug}</span>`. Find the start of the
  // <li> that contains this hashtag, then read until the next </li>.
  const tag = `#${slug}`;
  const tagIdx = html.indexOf(`>${tag}<`);
  if (tagIdx === -1) {
    throw new Error(`Card for slug "${slug}" not found in response HTML`);
  }
  // Walk back to the nearest <li class="club-entry"
  const liStart = html.lastIndexOf('<li class="club-entry"', tagIdx);
  const liEnd   = html.indexOf('</li>', tagIdx);
  if (liStart === -1 || liEnd === -1) {
    throw new Error(`Could not isolate <li> for slug "${slug}"`);
  }
  return html.slice(liStart, liEnd + 5);
}
