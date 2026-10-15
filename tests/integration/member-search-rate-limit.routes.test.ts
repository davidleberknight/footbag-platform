/**
 * Member search throttles by caller IP independently of the per-member quota:
 * once the per-IP bucket is exceeded, further queries render the personal home
 * with a wait notice in place of results, and a warning log line records the
 * IP scope without the query or the IP. Own DB + own file so the process-global rate-limit
 * bucket and the low per-IP cap are not perturbed by the broader member-search
 * suite.
 *
 * Port 3064 — unique to this file.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt, insertSystemConfig } from '../fixtures/factories';

const { dbPath } = setTestEnv('3064');

const SEARCHER_ID   = 'ip-searcher-001';
const SEARCHER_SLUG = 'ip_searcher';

function searcherCookie(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: SEARCHER_ID })}`;
}

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: SEARCHER_ID, slug: SEARCHER_SLUG, display_name: 'IP Searcher', real_name: 'IP Searcher' });
  insertMember(db, { display_name: 'Jane Target', real_name: 'Jane Target', slug: 'jane_target' });

  // Lower the per-IP cap to 2; the per-member cap stays at its default so the
  // IP bucket is the one that trips for a single member's burst of queries.
  insertSystemConfig(db, {
    config_key: 'member_search_rate_limit_max_per_ip',
    value_json: '2',
  });

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
    const { logger } = await import('../../src/config/logger');
    const warn = vi.spyOn(logger, 'warn');
    try {
      const blocked = await request(app).get(`/members/${SEARCHER_SLUG}?q=charlie`).set('Cookie', searcherCookie());
      expect(blocked.status).toBe(200);
      expect(blocked.text).toContain('Too many searches just now. Please wait a moment and try again.');

      const lines = warn.mock.calls.filter(([msg]) => msg === 'member search rate limited');
      expect(lines).toHaveLength(1);
      expect(lines[0][1]).toEqual({ actorMemberId: SEARCHER_ID, scope: 'ip' });
      // The query text never reaches the log line.
      expect(JSON.stringify(lines[0])).not.toContain('charlie');
    } finally {
      warn.mockRestore();
    }

    const adb = new (await import('better-sqlite3')).default(dbPath);
    const audit = adb.prepare('SELECT COUNT(*) AS c FROM audit_entries').get() as { c: number };
    adb.close();
    expect(audit.c).toBe(0);
  });
});
