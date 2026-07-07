/**
 * Admin freestyle-content browse surface: GET /admin/freestyle/tricks.
 *
 * A read-only, admin-only page listing every freestyle trick row (active and
 * inactive, every review status), with text search over canonical name and slug
 * and filters by active flag and review status. Each row links to a placeholder
 * edit route until the in-app edit surface is built. This suite pins the admin
 * gate, the listing, search, both filters, admin visibility of inactive/pending
 * rows, the per-row edit link, and the placeholder route.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3966');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-000000000001';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-000000000002';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fs_admin', display_name: 'FS Admin', login_email: 'fs-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fs_member', display_name: 'FS Member', login_email: 'fs-member@example.com' });

  insertFreestyleTrick(db, { slug: 'solo_whirl',     canonical_name: 'Solo Whirl',     adds: '3', trick_family: 'whirl',  review_status: 'expert_reviewed', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'paradox_torque', canonical_name: 'Paradox Torque', adds: '5', trick_family: 'torque', review_status: 'curated',         is_active: 1 });
  insertFreestyleTrick(db, { slug: 'pending_move',   canonical_name: 'Pending Move',   adds: '4', trick_family: null,     review_status: 'pending',         is_active: 0 });
  insertFreestyleTrick(db, { slug: 'held_reviewed',  canonical_name: 'Held Reviewed',  adds: '6', trick_family: 'osis',   review_status: 'expert_reviewed', is_active: 0 });
  db.close();

  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function get(path: string, cookie?: string) {
  const req = request(await createApp()).get(path);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

describe('GET /admin/freestyle/tricks — admin gate', () => {
  it('renders 200 for an admin', async () => {
    const res = await get('/admin/freestyle/tricks', cookieFor(ADMIN_ID, 'admin'));
    expect(res.status).toBe(200);
  });

  it('returns 403 for a non-admin member', async () => {
    const res = await get('/admin/freestyle/tricks', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });

  it('redirects an unauthenticated visitor to login', async () => {
    const res = await get('/admin/freestyle/tricks');
    expect(res.status).toBe(302);
  });
});

describe('GET /admin/freestyle/tricks — listing, search, filters', () => {
  const admin = () => cookieFor(ADMIN_ID, 'admin');

  it('lists every row, including inactive and pending rows the public dictionary hides', async () => {
    const res = await get('/admin/freestyle/tricks', admin());
    expect(res.text).toContain('Solo Whirl');
    expect(res.text).toContain('Paradox Torque');
    expect(res.text).toContain('Pending Move');   // inactive + pending, admin-visible
    expect(res.text).toContain('Held Reviewed');  // inactive, admin-visible
  });

  it('searches by canonical name', async () => {
    const res = await get('/admin/freestyle/tricks?q=Solo', admin());
    expect(res.text).toContain('Solo Whirl');
    expect(res.text).not.toContain('Paradox Torque');
  });

  it('searches by slug', async () => {
    const res = await get('/admin/freestyle/tricks?q=paradox_torque', admin());
    expect(res.text).toContain('Paradox Torque');
    expect(res.text).not.toContain('Solo Whirl');
  });

  it('filters by active flag (inactive only)', async () => {
    const res = await get('/admin/freestyle/tricks?active=inactive', admin());
    expect(res.text).toContain('Pending Move');
    expect(res.text).toContain('Held Reviewed');
    expect(res.text).not.toContain('Solo Whirl');
    expect(res.text).not.toContain('Paradox Torque');
  });

  it('filters by review status (pending only)', async () => {
    const res = await get('/admin/freestyle/tricks?reviewStatus=pending', admin());
    expect(res.text).toContain('Pending Move');
    expect(res.text).not.toContain('Held Reviewed');
    expect(res.text).not.toContain('Solo Whirl');
  });

  it('renders a per-row link to the edit surface', async () => {
    const res = await get('/admin/freestyle/tricks', admin());
    expect(res.text).toContain('href="/admin/freestyle/tricks/solo_whirl/edit"');
  });

  it('shows an empty state when nothing matches', async () => {
    const res = await get('/admin/freestyle/tricks?q=zzz_no_such_trick', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('No freestyle tricks match');
  });
});

describe('GET /admin/freestyle/tricks/:slug/edit — edit page link target', () => {
  it('opens the edit page for a browsed row (the per-row Edit link resolves)', async () => {
    const res = await get('/admin/freestyle/tricks/solo_whirl/edit', cookieFor(ADMIN_ID, 'admin'));
    expect(res.status).toBe(200);
    expect(res.text).toContain('Solo Whirl');
  });
});
