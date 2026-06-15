/**
 * Integration tests for the public welcome at GET /members and the
 * member-search affordance on the personal home at GET /members/<slug>?q=…
 * (the dashboard search was relocated to the profile when /members
 * reverted to a public welcome page).
 *
 * Port 3060 — unique to this file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createHash } from 'crypto';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3063');

const SEARCHER_ID   = 'member-searcher-001';
const SEARCHER_SLUG = 'searcher_user';

function searcherCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: SEARCHER_ID })}`;
}

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The searcher (authenticated user)
  insertMember(db, { id: SEARCHER_ID, slug: SEARCHER_SLUG, display_name: 'Searcher User', real_name: 'Searcher User' });

  // Searchable members
  insertMember(db, { display_name: 'Jane Footbag', real_name: 'Jane Footbag', country: 'US', slug: 'jane_footbag' });
  insertMember(db, { display_name: 'Janet Kicks', real_name: 'Janet Kicks', country: 'CA', slug: 'janet_kicks' });
  insertMember(db, { display_name: 'Bob Hackysack', real_name: 'Bob Hackysack', country: 'DE', slug: 'bob_hackysack' });

  // HoF member (honor badge should appear)
  insertMember(db, { display_name: 'Jane Legend', real_name: 'Jane Legend', slug: 'jane_legend', is_hof: 1 });

  // Opted-out member (searchable=0)
  insertMember(db, { display_name: 'Jane Hidden', real_name: 'Jane Hidden', slug: 'jane_hidden', searchable: 0 });

  // Deceased member
  insertMember(db, { display_name: 'Jane Departed', real_name: 'Jane Departed', slug: 'jane_departed', is_deceased: 1 });

  // Deleted member
  insertMember(db, { display_name: 'Jane Deleted', real_name: 'Jane Deleted', slug: 'jane_deleted', deleted_at: '2025-01-01T00:00:00.000Z' });

  // Unverified placeholder (email_verified_at = null)
  insertMember(db, { display_name: 'Jane Placeholder', real_name: 'Jane Placeholder', slug: 'jane_placeholder', email_verified_at: null });

  // Historical persons (legacy data)
  insertHistoricalPerson(db, { person_id: 'person-dave-001', person_name: 'Dave Mockingbird', country: 'US' });
  insertHistoricalPerson(db, { person_id: 'person-zane-001', person_name: 'Zane Footbag', country: 'CA' });

  // 21 members under a unique prefix exercise the 20-result cap + refine
  // prompt per M_Search_Members A6. The 'overflow_' prefix avoids collision
  // with the jane/bob/zane/footbag/mocking queries above.
  for (let i = 0; i < 21; i++) {
    const n = i.toString().padStart(2, '0');
    insertMember(db, {
      display_name: `Overflow Member ${n}`,
      real_name: `Overflow Member ${n}`,
      slug: `overflow_member_${n}`,
      country: 'US',
    });
  }

  // Lower the per-member search cap to 2 so a 3rd query in one test is throttled.
  // The per-IP cap stays at its default so the per-member bucket trips first.
  db.prepare(`
    INSERT INTO system_config
      (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
    VALUES (?, ?, 'member_search_rate_limit_max_per_member', '2', ?, 'Test tunable', NULL)
  `).run('test-msearch-member-rl', '2026-05-22T00:00:00.000Z', '2026-05-22T00:00:00.000Z');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── Landing page ──────────────────────────────────────────────────────────────

describe('GET /members — welcome', () => {
  it('unauthenticated → 200 with welcome page (Sign Up CTA)', async () => {
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Sign Up');
    expect(res.text).toContain('/register');
  });

  it('unauthenticated welcome tells legacy footbag.org users they need a new account', async () => {
    // Arrivals from the old site must learn up front that old credentials do
    // not carry over and that historical data is linked during setup.
    const app = createApp();
    const res = await request(app).get('/members');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Had an account on the old footbag.org?');
    expect(res.text).toContain('You will need to create a new account here first to become a member in the new system.');
    expect(res.text).toContain('link to your historical data');
  });

  it('authenticated → 200 with welcome page (no search form on /members)', async () => {
    // The Find Members search lives on the personal home now. The welcome
    // page renders the same tier explainer to everyone; only the join CTAs
    // are hidden for authenticated visitors.
    const app = createApp();
    const res = await request(app).get('/members').set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('global governing body for footbag');
    expect(res.text).not.toContain('Find Members');
  });
});

// ── Search ────────────────────────────────────────────────────────────────────

describe('GET /members/<slug>?q= — member search on personal home', () => {
  it('no search results section when no query', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${SEARCHER_SLUG}`)
      .set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Find Members');
    expect(res.text).not.toContain('No members found');
  });

  it('search feature is wrapped in a card on the dashboard', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${SEARCHER_SLUG}`)
      .set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('member-search-card');
  });

  // Member search is authenticated members only.
  // Search affordance moved from /members to /members/:slug?q=. The route is
  // protected by controller-internal logic (own-profile check), not by
  // route-level middleware; this regression test pins the auth gate so a
  // future refactor cannot silently expose member search to anonymous
  // visitors via the query parameter.
  it('unauthenticated → 302 to login, no search results leaked', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=foo`);
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login(\?|$)/);
    expect(res.text).not.toContain('Find Members');
    expect(res.text).not.toContain('search-result');
  });

  it('prefix match returns matching members', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=ja`).set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Jane Footbag');
    expect(res.text).toContain('Janet Kicks');
    expect(res.text).toContain('Jane Legend');
  });

  it('result body does not expose member emails', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=ja`).set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/@example\.com/);
  });

  it('shows country in results', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=ja`).set('Cookie', searcherCookie());
    expect(res.text).toContain('US');
    expect(res.text).toContain('CA');
  });

  it('shows honor badge for HoF member', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=jane+le`).set('Cookie', searcherCookie());
    expect(res.text).toContain('HoF');
  });

  it('links to member profile for current members', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=bob`).set('Cookie', searcherCookie());
    expect(res.text).toContain('/members/bob_hackysack');
  });

  it('no results for unknown name', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=zzzzz`).set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('No members found');
  });

  it('query too short (1 char) shows validation message', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=j`).set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('at least 2 characters');
  });

  it('excludes opted-out members (searchable=0)', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=jane`).set('Cookie', searcherCookie());
    expect(res.text).not.toContain('Jane Hidden');
  });

  it('excludes deceased members', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=jane`).set('Cookie', searcherCookie());
    expect(res.text).not.toContain('Jane Departed');
  });

  it('excludes deleted members', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=jane`).set('Cookie', searcherCookie());
    expect(res.text).not.toContain('Jane Deleted');
  });

  it('excludes unverified placeholder members', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=jane`).set('Cookie', searcherCookie());
    expect(res.text).not.toContain('Jane Placeholder');
  });

  it('matches substring anywhere in name', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=footbag`).set('Cookie', searcherCookie());
    expect(res.text).toContain('Jane Footbag');
  });

  // Decisive substring-vs-prefix assertion: "ootbag" is an interior substring
  // of "Footbag" but is not a prefix of any whole name or any word in it. A
  // prefix matcher would return no results; substring matching (the contract,
  // LIKE '%term%') returns Jane Footbag.
  it('matches an interior substring, not just a word prefix', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=ootbag`).set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Jane Footbag');
    expect(res.text).not.toContain('No members found');
  });

  it('includes historical persons in results', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=mocking`).set('Cookie', searcherCookie());
    expect(res.text).toContain('Dave Mockingbird');
    expect(res.text).toContain('/history/person-dave-001');
  });

  it('links historical person to /history/:personId', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=zane`).set('Cookie', searcherCookie());
    expect(res.text).toContain('Zane Footbag');
    expect(res.text).toContain('/history/person-zane-001');
  });

  it('resolves a historical person\'s linked-member slug through the searchable filter set', async () => {
    // The searchable flag (and the deceased / purged / unverified exclusions)
    // must hold on the historical-person path too: a linked member who is not
    // eligible for member search must not surface their slug via the
    // historical person they are linked to.
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const db = new BetterSqlite3(dbPath);
    insertHistoricalPerson(db, { person_id: 'person-quiet-001', person_name: 'Quietlink Optout', country: 'US' });
    insertMember(db, {
      id: 'mem-quiet-link', slug: 'quietlink_optout_member',
      display_name: 'Quietlink Optout', real_name: 'Quietlink Optout', searchable: 0,
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?')
      .run('person-quiet-001', 'mem-quiet-link');

    insertHistoricalPerson(db, { person_id: 'person-quiet-002', person_name: 'Quietlink Visible', country: 'US' });
    // Display name deliberately does not match the query, so any occurrence
    // of this slug in the results comes from the historical-person linkage.
    insertMember(db, {
      id: 'mem-quiet-vis', slug: 'quietlink_visible_member',
      display_name: 'Linkcontrol Visible', real_name: 'Linkcontrol Visible',
    });
    db.prepare('UPDATE members SET historical_person_id = ? WHERE id = ?')
      .run('person-quiet-002', 'mem-quiet-vis');
    db.close();

    const app = createApp();
    const res = await request(app)
      .get(`/members/${SEARCHER_SLUG}?q=quietlink`)
      .set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('/history/person-quiet-001');
    expect(res.text).not.toContain('quietlink_optout_member');
    // Control: a search-eligible linked member's slug does surface.
    expect(res.text).toContain('/members/quietlink_visible_member');
  });

  it('caps results at 20 with refine prompt when 21+ matches exist (M_Search_Members A6)', async () => {
    const app = createApp();
    const res = await request(app)
      .get(`/members/${SEARCHER_SLUG}?q=overflow`)
      .set('Cookie', searcherCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Too many results. Please refine your search.');
    expect(res.text).toMatch(/section-count[^>]*>20\+</);
  });

  it('throttles the searcher once their per-member quota is exceeded, showing a wait notice', async () => {
    const app = createApp();
    // First two queries are under the seeded cap of 2.
    for (const q of ['alpha', 'bravo']) {
      const ok = await request(app).get(`/members/${SEARCHER_SLUG}?q=${q}`).set('Cookie', searcherCookie());
      expect(ok.status).toBe(200);
      expect(ok.text).not.toContain('Too many searches');
    }
    // Third query trips the per-member bucket: the page still renders, with the
    // wait notice in place of results.
    const blocked = await request(app).get(`/members/${SEARCHER_SLUG}?q=charlie`).set('Cookie', searcherCookie());
    expect(blocked.status).toBe(200);
    expect(blocked.text).toContain('Too many searches just now. Please wait a moment and try again.');

    const adb = new (await import('better-sqlite3')).default(dbPath);
    const row = adb.prepare(
      `SELECT metadata_json FROM audit_entries
        WHERE action_type = 'member.search_rate_limited' AND actor_member_id = ?`,
    ).get(SEARCHER_ID) as { metadata_json: string } | undefined;
    adb.close();
    expect(row).toBeDefined();
    expect(JSON.parse(row!.metadata_json).scope).toBe('member');
  });

  it('writes a privacy-safe audit row per search: query hash + result count, never the IP or raw query', async () => {
    const app = createApp();
    const res = await request(app).get(`/members/${SEARCHER_SLUG}?q=Janet`).set('Cookie', searcherCookie());
    expect(res.status).toBe(200);

    const expectedHash = createHash('sha256').update('janet').digest('hex');
    const adb = new (await import('better-sqlite3')).default(dbPath);
    const row = adb.prepare(
      `SELECT entity_id, entity_type, reason_text, metadata_json FROM audit_entries
        WHERE action_type = 'member.search' AND actor_member_id = ? AND entity_id = ?`,
    ).get(SEARCHER_ID, expectedHash) as
      | { entity_id: string; entity_type: string; reason_text: string | null; metadata_json: string }
      | undefined;
    adb.close();

    expect(row).toBeDefined();
    expect(row!.entity_type).toBe('member_search');
    expect(JSON.parse(row!.metadata_json).resultCount).toBeGreaterThan(0);
    // The raw query text and the caller IP never enter the trail.
    expect(row!.metadata_json.toLowerCase()).not.toContain('janet');
    expect(row!.reason_text).toBeNull();
    expect(JSON.stringify(row)).not.toMatch(/127\.0\.0\.1|::1|::ffff/);
  });
});
