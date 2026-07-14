/**
 * Internal Emerging Vocabulary workbench (/internal/freestyle/emerging-vocabulary).
 *
 * Admin-gated like every /internal route. Renders the curator decision packet
 * (the compact decision groups with question, recommendation, alternatives,
 * evidence, and consequences — presented for decision, never auto-applied) and
 * the full-dimension row table with query-param filters. Diagnostics (parser
 * confidence, failure class, ledger provenance) are internal-only and render
 * here, never on the public page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { EMERGING_DECISION_GROUPS } from '../../src/content/freestyleObservationalUniverse';

const { dbPath } = setTestEnv('3223');
let createApp: Awaited<ReturnType<typeof importApp>>;

const MEMBER_ID = 'member-ev-workbench';
const ADMIN_ID  = 'admin-ev-workbench';
const MEMBER_COOKIE = `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
const ADMIN_COOKIE  = `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID })}`;
const PATH = '/internal/freestyle/emerging-vocabulary';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: MEMBER_ID, slug: 'member-ev-workbench', display_name: 'Member' });
  insertMember(db, { id: ADMIN_ID,  slug: 'admin-ev-workbench',  display_name: 'Admin', is_admin: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('workbench access gate', () => {
  it('redirects unauthenticated requests to /login', async () => {
    const res = await request(createApp()).get(PATH);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toMatch(/^\/login\?returnTo=/);
  });

  it('returns 403 for non-admin members', async () => {
    const res = await request(createApp()).get(PATH).set('Cookie', MEMBER_COOKIE);
    expect(res.status).toBe(403);
  });

  it('serves the workbench for admins', async () => {
    const res = await request(createApp()).get(PATH).set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
  });
});

describe('workbench content', () => {
  it('renders every populated decision group with its packet fields', async () => {
    const res = await request(createApp()).get(PATH).set('Cookie', ADMIN_COOKIE);
    for (const g of EMERGING_DECISION_GROUPS) {
      if (g.memberCount > 0) {
        expect(res.text, `decision group ${g.id} missing`).toContain(`id="decision-${g.id}"`);
        expect(res.text).toContain(g.title);
      }
    }
    expect(res.text).toContain('Recommended');
    expect(res.text).toContain('Alternatives');
    expect(res.text).toContain('Consequence');
  });

  it('renders the full-dimension table with internal diagnostics', async () => {
    const res = await request(createApp()).get(PATH).set('Cookie', ADMIN_COOKIE);
    for (const col of ['Object', 'Evidence', 'Blocker', 'Owner', 'Publication', 'Section', 'Parser', 'Ledger']) {
      expect(res.text).toContain(`<th>${col}</th>`);
    }
  });

  it('filters the table by an exact dimension value', async () => {
    const res = await request(createApp())
      .get(`${PATH}?dimension=blockerId&value=D1`)
      .set('Cookie', ADMIN_COOKIE);
    expect(res.status).toBe(200);
    // The table narrows to the one held D1 row (the decision packet above the
    // table still lists every group's members, so assert via the shown count).
    expect(res.text).toContain('Pixie near Double Down');
    expect(res.text).toMatch(/>1 shown</);
  });
});
