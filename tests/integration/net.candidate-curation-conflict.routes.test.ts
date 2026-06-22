/**
 * Internal net QC candidate curation conflict handling.
 *
 * Approving or rejecting a candidate that has already been curated is a
 * conflict, not a missing resource: the response carries a 409 status and the
 * conflict page (whose visible code matches the status), while a genuinely
 * unknown candidate still resolves to the 404 not-found page.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertNetRawFragment,
  insertNetCandidateMatch,
  insertNetCuratedMatch,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3171');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const VIEWER_ID    = 'viewer-net-curation-conflict';
const COOKIE       = `footbag_session=${createTestSessionJwt({ memberId: VIEWER_ID })}`;
const CURATED_CAND = 'cand-already-curated';

function internalPost(app: ReturnType<typeof createApp>, path: string) {
  return request(app).post(path).set('Cookie', COOKIE);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id:           VIEWER_ID,
    slug:         'viewer-net-curation-conflict',
    display_name: 'Viewer',
    is_admin:     1,
  });
  const frag = insertNetRawFragment(db, {
    id:          'frag-curation-conflict',
    source_file: 'RESULTS.txt',
    raw_text:    'Alpha def. Bravo 11-5',
  });
  insertNetCandidateMatch(db, {
    candidate_id:      CURATED_CAND,
    fragment_id:       frag,
    raw_text:          'Alpha def. Bravo 11-5',
    player_a_raw_name: 'Alpha',
    player_b_raw_name: 'Bravo',
    confidence_score:  0.80,
    review_status:     'accepted',
  });
  insertNetCuratedMatch(db, {
    candidate_id:   CURATED_CAND,
    curated_status: 'approved',
    raw_text:       'Alpha def. Bravo 11-5',
    curated_by:     'operator',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('POST /internal/net/candidates/:id/approve on an already-curated candidate', () => {
  it('returns 409 and renders the conflict page, not the not-found page', async () => {
    const app = createApp();
    const res = await internalPost(app, `/internal/net/candidates/${CURATED_CAND}/approve`).send({});
    expect(res.status).toBe(409);
    expect(res.text).toContain('conflicts with the current state');
    expect(res.text).not.toContain("doesn't exist");
  });
});

describe('POST /internal/net/candidates/:id/reject on an already-curated candidate', () => {
  it('returns 409 and renders the conflict page, not the not-found page', async () => {
    const app = createApp();
    const res = await internalPost(app, `/internal/net/candidates/${CURATED_CAND}/reject`).send({});
    expect(res.status).toBe(409);
    expect(res.text).toContain('conflicts with the current state');
    expect(res.text).not.toContain("doesn't exist");
  });
});

describe('POST /internal/net/candidates/:id/approve for an unknown candidate', () => {
  it('returns 404 with the not-found page', async () => {
    const app = createApp();
    const res = await internalPost(app, '/internal/net/candidates/does-not-exist/approve').send({});
    expect(res.status).toBe(404);
    expect(res.text).toContain("doesn't exist");
  });
});
