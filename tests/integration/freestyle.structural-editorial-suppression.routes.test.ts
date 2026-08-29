/**
 * The trick-detail structural panel's "Editorial context" prose passes through
 * the same description suppression the About block applies. A description that
 * is a structural-placeholder backfill (ADD-arithmetic shorthand, JOB notation,
 * bracket tokens) never resurfaces as editorial context; genuine curator prose
 * still shows. The suppression treats a description as one unit, exactly as the
 * About block does, so a description that mixes prose with suppressible
 * shorthand is dropped whole rather than leaking the shorthand.
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
  insertFreestyleTrick,
  insertMember,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3780');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MAINTAINER_ID = 'aaaaaaaa-0000-0000-0000-00000000supp';

/** The structural panel is a maintainer surface, so the suppression it applies
 *  is observed as a maintainer. That the panel reaches nobody else is held in
 *  freestyle.trick-detail-diagnostics.routes.test.ts. */
function asMaintainer(app: Parameters<typeof request>[0]) {
  const cookie = `__Host-footbag_session=${createTestSessionJwt({ memberId: MAINTAINER_ID, role: 'admin' })}`;
  return {
    get: (path: string) => request(app).get(path).set('Cookie', cookie),
  };
}

// A present (even empty-object) structural parse enables the notation-grammar
// panel that carries the "Editorial context" block; without it the panel, and
// the bypass under test, never render.
const PARSE = '{}';

// Distinctive markers so an assertion can prove a specific description string
// did or did not reach the rendered page.
const PLACEHOLDER = 'Suppressmarker drills the (+9) shorthand.';
const ORDINARY    = 'This trick reads as a clean rolling motion under the bag.';
const MIXED       = 'Mixedmarker prose sits here. ADD = 4.';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: MAINTAINER_ID, slug: 'supp_maintainer', display_name: 'Supp Maintainer',
    login_email: 'supp-maintainer@example.com', is_admin: 1,
  });

  insertFreestyleTrick(db, {
    slug: 'placeholder_desc', canonical_name: 'placeholder desc', adds: '3',
    base_trick: 'placeholder_desc', trick_family: 'placeholder_desc',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
    description: PLACEHOLDER, structural_parse_json: PARSE,
  });
  insertFreestyleTrick(db, {
    slug: 'ordinary_desc', canonical_name: 'ordinary desc', adds: '3',
    base_trick: 'ordinary_desc', trick_family: 'ordinary_desc',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
    description: ORDINARY, structural_parse_json: PARSE,
  });
  insertFreestyleTrick(db, {
    slug: 'mixed_desc', canonical_name: 'mixed desc', adds: '3',
    base_trick: 'mixed_desc', trick_family: 'mixed_desc',
    category: 'compound', review_status: 'expert_reviewed', is_active: 1,
    operational_notation: 'SET > OP IN [DEX] > SAME TOE [DEL]',
    description: MIXED, structural_parse_json: PARSE,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — structural editorial context suppression', () => {
  it('a structural-placeholder description produces no editorial context', async () => {
    const res = await asMaintainer(await createApp()).get('/freestyle/tricks/placeholder_desc');
    expect(res.status).toBe(200);
    // The placeholder shorthand appears nowhere on the page: neither the About
    // block nor the structural panel leaks it.
    expect(res.text).not.toContain('Suppressmarker');
    expect(res.text).not.toContain('(+9)');
  });

  it('a genuine prose description renders as editorial context', async () => {
    const res = await asMaintainer(await createApp()).get('/freestyle/tricks/ordinary_desc');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Editorial context');
    expect(res.text).toContain('clean rolling motion under the bag');
  });

  it('a description mixing prose with ADD shorthand is dropped whole, leaking no shorthand', async () => {
    const res = await asMaintainer(await createApp()).get('/freestyle/tricks/mixed_desc');
    expect(res.status).toBe(200);
    // The shared filter classifies the whole description as a placeholder, so
    // both the prose marker and the shorthand are suppressed together — matching
    // the About block, and never surfacing the ADD shorthand as editorial text.
    expect(res.text).not.toContain('Mixedmarker');
    expect(res.text).not.toContain('ADD = 4');
  });
});
