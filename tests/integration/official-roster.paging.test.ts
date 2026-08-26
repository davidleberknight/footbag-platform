/**
 * Paging contract for the Official IFPA Roster, at a roster larger than one page.
 *
 * The rest of the roster suite runs against a handful of members, so it never
 * crosses a page boundary: `hasPaging`, `previousHref`, `nextHref`, the
 * second-page slice, and the rendered pager controls all go unexercised there.
 * This file seeds past `PAGE_SIZE` so those branches run, and so the boundary
 * itself is checked: a reader who walks every page must see each roster member
 * exactly once, with no row dropped or repeated where the pages meet.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertMemberTierGrant, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('4131');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let ors: typeof import('../../src/services/officialRosterService');
let createApp: Awaited<ReturnType<typeof importApp>>;

/** Mirrors PAGE_SIZE in the service; the cohort below must exceed it. */
const PAGE_SIZE = 50;
const TIER1_COUNT = 55;
const TIER2_COUNT = 3;

const ADMIN_ID = 'rp_admin';

/** Zero-padded so display-name order and seeded order are the same order. */
function pagerName(n: number): string {
  return `Pager Member ${String(n).padStart(3, '0')}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The reader. Tier 2 is what the roster route requires, and what the platform
  // requires of an administrator.
  insertMember(db, {
    // Deliberately not named "Pager": the search cases below count the seeded
    // cohort, and a reader who matches the term would be an extra row.
    id: ADMIN_ID, slug: 'rp_admin', display_name: 'Rota Reader',
    real_name: 'Rota Reader', login_email: 'rp-admin@example.com', is_admin: 1,
  });
  insertMemberTierGrant(db, {
    member_id: ADMIN_ID, new_tier_status: 'tier2', reason_code: 'purchase.tier2',
  });

  for (let n = 1; n <= TIER1_COUNT; n += 1) {
    const id = `rp_t1_${String(n).padStart(3, '0')}`;
    insertMember(db, {
      id, slug: id, display_name: pagerName(n), real_name: pagerName(n),
      login_email: `${id}@example.com`,
    });
    insertMemberTierGrant(db, {
      member_id: id, new_tier_status: 'tier1', reason_code: 'purchase.tier1',
    });
  }

  // A second tier, so a tier-filtered walk is narrower than the whole roster
  // and the filter is proved to ride along with the page links.
  for (let n = 1; n <= TIER2_COUNT; n += 1) {
    const id = `rp_t2_${String(n).padStart(3, '0')}`;
    insertMember(db, {
      id, slug: id, display_name: `Zed Organizer ${n}`, real_name: `Zed Organizer ${n}`,
      login_email: `${id}@example.com`,
    });
    insertMemberTierGrant(db, {
      member_id: id, new_tier_status: 'tier2', reason_code: 'purchase.tier2',
    });
  }

  db.close();
  ors = await import('../../src/services/officialRosterService');
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const ROSTER_TOTAL = TIER1_COUNT + TIER2_COUNT + 1; // the admin is on the roster too

function cookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}

describe('roster paging across a page boundary', () => {
  it('fills the first page and offers a way forward but not back', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID);
    expect(vm.content.matchCount).toBe(ROSTER_TOTAL);
    expect(vm.content.members).toHaveLength(PAGE_SIZE);
    expect(vm.content.pageCount).toBe(2);
    expect(vm.content.page).toBe(1);
    expect(vm.content.hasPaging).toBe(true);
    expect(vm.content.previousHref).toBeNull();
    expect(vm.content.nextHref).toBe('/ifpa/roster?page=2');
    expect(vm.content.rangeLabel).toBe(`Showing 1 to ${PAGE_SIZE} of ${ROSTER_TOTAL}`);
  });

  it('carries the remainder on the last page and offers a way back but not forward', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { page: 2 });
    expect(vm.content.page).toBe(2);
    expect(vm.content.members).toHaveLength(ROSTER_TOTAL - PAGE_SIZE);
    expect(vm.content.previousHref).toBe('/ifpa/roster');
    expect(vm.content.nextHref).toBeNull();
    expect(vm.content.rangeLabel).toBe(
      `Showing ${PAGE_SIZE + 1} to ${ROSTER_TOTAL} of ${ROSTER_TOTAL}`,
    );
  });

  it('shows every roster member exactly once across the pages, with none lost at the seam', () => {
    const first = ors.getOfficialRosterPage(ADMIN_ID).content.members;
    const second = ors.getOfficialRosterPage(ADMIN_ID, { page: 2 }).content.members;
    const walked = [...first, ...second].map((m) => m.displayName);
    expect(walked).toHaveLength(ROSTER_TOTAL);
    expect(new Set(walked).size).toBe(ROSTER_TOTAL);
    // The seam itself: the last name on page one and the first on page two are
    // consecutive in the roster's own order, so nothing fell between them.
    expect(first[first.length - 1].displayName).toBe(pagerName(PAGE_SIZE));
    expect(second[0].displayName).toBe(pagerName(PAGE_SIZE + 1));
  });

  it('keeps the tier filter on the page link, so paging a filtered roster stays filtered', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { tier: ['tier1'] });
    expect(vm.content.matchCount).toBe(TIER1_COUNT);
    expect(vm.content.pageCount).toBe(2);
    expect(vm.content.nextHref).toBe('/ifpa/roster?tier=tier1&page=2');
  });

  it('keeps the search term on the page link, so paging a search stays searched', () => {
    const vm = ors.getOfficialRosterPage(ADMIN_ID, { q: 'Pager' });
    expect(vm.content.matchCount).toBe(TIER1_COUNT);
    expect(vm.content.nextHref).toBe('/ifpa/roster?q=Pager&page=2');
  });
});

/**
 * The target of the pager control labelled `label`, as a browser would resolve
 * it. Handlebars escapes a query string's `=` and `&` on the way into the
 * attribute, which the HTML parser decodes again, so the assertion compares the
 * decoded address rather than the escaped bytes.
 */
function pagerHref(html: string, label: string): string | null {
  const match = new RegExp(`<a href="([^"]*)"[^>]*>${label}</a>`).exec(html);
  if (!match) return null;
  return match[1].replace(/&#x3D;/g, '=').replace(/&amp;/g, '&');
}

describe('GET /ifpa/roster renders the pager it has', () => {
  it('offers Next and no Previous on the first page', async () => {
    const res = await request(createApp()).get('/ifpa/roster').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(pagerHref(res.text, 'Next')).toBe('/ifpa/roster?page=2');
    expect(pagerHref(res.text, 'Previous')).toBeNull();
  });

  it('offers Previous and no Next on the last page, and shows the remainder', async () => {
    const res = await request(createApp()).get('/ifpa/roster?page=2').set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(pagerHref(res.text, 'Previous')).toBe('/ifpa/roster');
    expect(pagerHref(res.text, 'Next')).toBeNull();
    expect(res.text).toContain(pagerName(PAGE_SIZE + 1));
    expect(res.text).not.toContain(pagerName(1));
  });

  it('keeps a tier-filtered walk filtered when the reader follows Next', async () => {
    const res = await request(createApp())
      .get('/ifpa/roster?tier=tier1')
      .set('Cookie', cookie());
    expect(res.status).toBe(200);
    expect(pagerHref(res.text, 'Next')).toBe('/ifpa/roster?tier=tier1&page=2');
  });
});
