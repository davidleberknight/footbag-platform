/**
 * Regression: the clubs map JSON island must HTML-escape DB-sourced strings so a
 * club country containing "</script>" cannot break out of the
 * <script type="application/json"> island and inject markup.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertClub } from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

let createApp: Awaited<ReturnType<typeof importApp>>;

// A country string that, serialized verbatim by JSON.stringify, terminates the
// island and injects an element with an inline handler.
const MALICIOUS_COUNTRY = '</script><img src=x onerror=alert(1)>';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertClub(db, { id: 'club-island-real', name: 'Island Break Club', country: MALICIOUS_COUNTRY, status: 'active', publiclyVisible: true });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /clubs — map JSON island output encoding', () => {
  it('escapes < > & so the injected country cannot break out of the island', async () => {
    const app = createApp();
    const res = await request(app).get('/clubs');

    expect(res.status).toBe(200);
    // The raw breakout sequence must never reach the document.
    expect(res.text).not.toContain('</script><img src=x onerror=alert(1)>');
    // The escaped form is present inside the island instead.
    expect(res.text).toContain('\\u003c/script\\u003e');
  });
});
