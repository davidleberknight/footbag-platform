/**
 * Admin freestyle-content edit page: GET and POST /admin/freestyle/tricks/:slug/edit.
 *
 * The admin-only trick edit surface. GET loads a trick row (any status) with its
 * editable scalar fields plus its attached aliases, sources, and modifier links
 * (the attached rows are display-only). POST saves the nine editable scalar fields
 * of the trick row in one transaction with a single audit entry; the attached rows
 * are never touched. This suite pins the admin gate, the scalar-field display, the
 * attached-row display, any-status loading, the persisted scalar save with its one
 * audit row and stamped updated_at, the saved-indicator redirect, and the
 * validation re-render that preserves submitted values and writes nothing.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickSource,
  insertFreestyleTrickSourceLink,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3965');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000ed01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000ed02';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

// A complete, valid scalar body for save_ok. Individual tests override a field to
// exercise a single validation or change path.
function validBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    canonicalName:     'Save OK',
    adds:              '5',
    movementNotation:  'CLIP > OP IN [DEX] move_marker',
    executionNotation: 'CLIP > OP CLIP [XBD] exec_marker [DEL]',
    family:            'whirl',
    baseTrick:         'whirl',
    category:          'compound',
    reviewStatus:      'curated',
    isActive:          'on',
    ...overrides,
  };
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fse_admin', display_name: 'FSE Admin', login_email: 'fse-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fse_member', display_name: 'FSE Member', login_email: 'fse-member@example.com' });

  insertFreestyleTrick(db, {
    slug: 'blurry_whirl',
    canonical_name: 'Blurry Whirl',
    adds: '5',
    notation: 'CLIP > OP IN [DEX] move_marker',
    operational_notation: 'CLIP > OP CLIP [XBD] exec_marker [DEL]',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'expert_reviewed',
    is_active: 1,
  });
  insertFreestyleTrickAlias(db, 'bw', 'blurry_whirl', 'BW');
  const sourceId = insertFreestyleTrickSource(db, { source_label: 'Footbag.org', source_type: 'scraped' });
  insertFreestyleTrickSourceLink(db, 'blurry_whirl', sourceId, { asserted_adds: 5 });
  insertFreestyleTrickModifier(db, { slug: 'blurry', modifier_name: 'blurry', add_bonus: 2, modifier_type: 'set' });
  insertFreestyleTrickModifierLink(db, 'blurry_whirl', 'blurry', 1);

  // A held (inactive, pending) trick with no attached rows: the edit page must
  // load it (unlike the public dictionary) and show empty attached sections.
  insertFreestyleTrick(db, {
    slug: 'held_pending',
    canonical_name: 'Held Pending',
    adds: '4',
    trick_family: null,
    category: 'compound',
    review_status: 'pending',
    is_active: 0,
  });

  // The single row the successful-save test mutates, kept apart from the display
  // rows so their assertions stay stable.
  insertFreestyleTrick(db, {
    slug: 'save_ok',
    canonical_name: 'Save OK',
    adds: '5',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'expert_reviewed',
    is_active: 1,
  });

  // The row the gate and validation-failure tests target. No test ever saves it,
  // so its scalar fields and its (zero) audit rows are invariant.
  insertFreestyleTrick(db, {
    slug: 'save_guard',
    canonical_name: 'Guard Row',
    adds: '3',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
  });

  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

async function post(path: string, cookie: string | undefined, body: Record<string, string>) {
  const req = request(await createApp()).post(path).type('form').send(body);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

const admin = () => cookieFor(ADMIN_ID, 'admin');

function trickRow(slug: string) {
  return db.prepare(
    'SELECT canonical_name, category, review_status, is_active, updated_at FROM freestyle_tricks WHERE slug = ?',
  ).get(slug) as { canonical_name: string; category: string | null; review_status: string; is_active: number; updated_at: string | null };
}

function auditRows(slug: string) {
  return db.prepare(
    `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'freestyle.trick.updated'`,
  ).all(slug) as { metadata_json: string }[];
}

describe('GET /admin/freestyle/tricks/:slug/edit — admin gate', () => {
  it('renders 200 for an admin on a real canonical slug', async () => {
    const res = await get('/admin/freestyle/tricks/blurry_whirl/edit', admin());
    expect(res.status).toBe(200);
  });

  it('redirects an unauthenticated visitor to login', async () => {
    const res = await get('/admin/freestyle/tricks/blurry_whirl/edit');
    expect(res.status).toBe(302);
  });

  it('returns 403 for a non-admin member', async () => {
    const res = await get('/admin/freestyle/tricks/blurry_whirl/edit', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await get('/admin/freestyle/tricks/nope_missing/edit', admin());
    expect(res.status).toBe(404);
  });

  it('loads an inactive, pending trick the public dictionary would hide', async () => {
    const res = await get('/admin/freestyle/tricks/held_pending/edit', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Held Pending');
    expect(res.text).toContain('No aliases.');
  });
});

describe('GET /admin/freestyle/tricks/:slug/edit — field display', () => {
  it('displays the scalar trick fields', async () => {
    const res = await get('/admin/freestyle/tricks/blurry_whirl/edit', admin());
    expect(res.text).toContain('Blurry Whirl');                    // canonical name
    expect(res.text).toContain('value="5"');                       // ADD
    expect(res.text).toContain('move_marker');                     // movement notation
    expect(res.text).toContain('exec_marker');                     // execution notation
    expect(res.text).toContain('value="whirl"');                   // family / base trick
    expect(res.text).toContain('value="compound" selected');       // category select
    expect(res.text).toContain('value="expert_reviewed" selected'); // review-status select
    expect(res.text).toContain('checked');                         // active checkbox
  });

  it('displays attached aliases, sources, and modifier links', async () => {
    const res = await get('/admin/freestyle/tricks/blurry_whirl/edit', admin());
    expect(res.text).toContain('BW');            // alias text
    expect(res.text).toContain('>bw<');          // alias slug in a <code>
    expect(res.text).toContain('Footbag.org');   // source label
    expect(res.text).toContain('(+2, order 1)'); // modifier link bonus + order
  });
});

describe('POST /admin/freestyle/tricks/:slug/edit — write gate', () => {
  it('redirects an unauthenticated visitor to login and writes nothing', async () => {
    const before = trickRow('save_guard');
    const res = await post('/admin/freestyle/tricks/save_guard/edit', undefined, validBody({ canonicalName: 'Hijacked' }));
    expect(res.status).toBe(302);
    expect(trickRow('save_guard').canonical_name).toBe(before.canonical_name);
    expect(auditRows('save_guard')).toHaveLength(0);
  });

  it('returns 403 for a non-admin member and writes nothing', async () => {
    const before = trickRow('save_guard');
    const res = await post('/admin/freestyle/tricks/save_guard/edit', cookieFor(MEMBER_ID, 'member'), validBody({ canonicalName: 'Hijacked' }));
    expect(res.status).toBe(403);
    expect(trickRow('save_guard').canonical_name).toBe(before.canonical_name);
    expect(auditRows('save_guard')).toHaveLength(0);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await post('/admin/freestyle/tricks/nope_missing/edit', admin(), validBody());
    expect(res.status).toBe(404);
  });
});

describe('POST /admin/freestyle/tricks/:slug/edit — validation', () => {
  it('rejects an empty canonical name with 422 and writes nothing', async () => {
    const before = trickRow('save_guard');
    const res = await post('/admin/freestyle/tricks/save_guard/edit', admin(), validBody({ canonicalName: '   ' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Canonical name is required.');
    expect(trickRow('save_guard').canonical_name).toBe(before.canonical_name);
    expect(auditRows('save_guard')).toHaveLength(0);
  });

  it('rejects a non-numeric ADD with 422', async () => {
    const res = await post('/admin/freestyle/tricks/save_guard/edit', admin(), validBody({ adds: 'lots' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('ADD must be');
  });

  it('rejects a category outside the existing values with 422 and preserves submitted values', async () => {
    const res = await post('/admin/freestyle/tricks/save_guard/edit', admin(), validBody({ canonicalName: 'Attempted Name', category: 'nonexistent' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Category must be');
    expect(res.text).toContain('Attempted Name'); // submitted value survives the re-render
    expect(trickRow('save_guard').canonical_name).toBe('Guard Row');
  });

  it('rejects a review status outside the admin set with 422', async () => {
    const res = await post('/admin/freestyle/tricks/save_guard/edit', admin(), validBody({ reviewStatus: 'scraped' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Review status must be');
    expect(auditRows('save_guard')).toHaveLength(0);
  });
});

describe('POST /admin/freestyle/tricks/:slug/edit — successful save', () => {
  it('persists the scalar change, writes one audit row, stamps updated_at, and redirects with a saved indicator', async () => {
    const res = await post('/admin/freestyle/tricks/save_ok/edit', admin(), validBody({ canonicalName: 'Save OK Edited', reviewStatus: 'curated' }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/save_ok/edit?saved=1');

    const row = trickRow('save_ok');
    expect(row.canonical_name).toBe('Save OK Edited');
    expect(row.review_status).toBe('curated');       // also changed from expert_reviewed
    expect(row.updated_at).toMatch(/^\d{4}-\d{2}-\d{2}T.*Z$/);

    const audits = auditRows('save_ok');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('canonical_name');
    expect(audits[0].metadata_json).toContain('review_status');
  });

  it('shows the saved banner and the new value on the follow-up GET', async () => {
    const res = await get('/admin/freestyle/tricks/save_ok/edit?saved=1', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Saved.');
    expect(res.text).toContain('Save OK Edited');
  });
});
