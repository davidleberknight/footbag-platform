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
