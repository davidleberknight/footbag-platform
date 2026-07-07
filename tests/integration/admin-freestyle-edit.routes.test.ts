/**
 * Admin freestyle-content edit page (read-only): GET /admin/freestyle/tricks/:slug/edit.
 *
 * The first half of the trick edit surface: an admin-only page that loads a trick
 * row (any status) and its attached aliases, sources, and modifier links, and
 * shows the editable scalar fields as disabled controls. There is no write path
 * yet: no POST route, a disabled Save button, and a deferred-save notice. This
 * suite pins the admin gate, the scalar-field display, the attached-row display,
 * any-status loading, and the absence of a write path.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

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

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000ed01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000ed02';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
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

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

const admin = () => cookieFor(ADMIN_ID, 'admin');

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

describe('GET /admin/freestyle/tricks/:slug/edit — no write path', () => {
  it('shows the deferred-save notice and a disabled Save button', async () => {
    const res = await get('/admin/freestyle/tricks/blurry_whirl/edit', admin());
    expect(res.text).toContain('read-only for now');
    expect(res.text).toContain('type="submit" disabled');
  });

  it('rejects a POST to the edit URL (no write route exists)', async () => {
    const res = await request(await createApp())
      .post('/admin/freestyle/tricks/blurry_whirl/edit')
      .set('Cookie', admin());
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(res.status).not.toBe(200);
    expect(res.status).not.toBe(302);
  });
});
