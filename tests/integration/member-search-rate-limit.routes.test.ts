/**
 * Member search throttles by caller IP independently of the per-member quota:
 * once the per-IP bucket is exceeded, further queries render the personal home
 * with a wait notice in place of results, and a privacy-safe rate-limit audit
 * row records the IP scope. Own DB + own file so the process-global rate-limit
 * bucket and the low per-IP cap are not perturbed by the broader member-search
 * suite.
 *
 * Port 3064 — unique to this file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3064');

const SEARCHER_ID   = 'ip-searcher-001';
const SEARCHER_SLUG = 'ip_searcher';

function searcherCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: SEARCHER_ID })}`;
}

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SEARCHER_ID, slug: SEARCHER_SLUG, display_name: 'IP Searcher', real_name: 'IP Searcher' });
  insertMember(db, { display_name: 'Jane Target', real_name: 'Jane Target', slug: 'jane_target' });

  // Lower the per-IP cap to 2; the per-member cap stays at its default so the
  // IP bucket is the one that trips for a single member's burst of queries.
  db.prepare(`
    INSERT INTO system_config
      (id, created_at, config_key, value_json, effective_start_at, reason_text, changed_by_member_id)
    VALUES (?, ?, 'member_search_rate_limit_max_per_ip', '2', ?, 'Test tunable', NULL)
  `).run('test-msearch-ip-rl', '2026-05-22T00:00:00.000Z', '2026-05-22T00:00:00.000Z');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /members/<slug>?q= — per-IP search throttle', () => {
  it('blocks once the per-IP cap is exceeded, showing the wait notice and an ip-scoped audit', async () => {
    const app = createApp();
    // First two queries are under the seeded per-IP cap of 2.
    for (const q of ['alpha', 'bravo']) {
      const ok = await request(app).get(`/members/${SEARCHER_SLUG}?q=${q}`).set('Cookie', searcherCookie());
      expect(ok.status).toBe(200);
      expect(ok.text).not.toContain('Too many searches');
    }
    // Third query trips the per-IP bucket before the member bucket.
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
    expect(JSON.parse(row!.metadata_json).scope).toBe('ip');
  });
});
