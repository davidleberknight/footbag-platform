/**
 * Admin freestyle trick-tip moderation: GET /admin/freestyle/tips plus the four
 * per-tip POSTs (edit text, hide, restore, remap).
 *
 * The admin-only moderation surface for the imported community tips. The index
 * lists every tip regardless of status (published, hidden, unresolved) with a
 * free-text search; the public trick page shows only published tips for an active
 * trick. Each write goes through one transaction with a single audit entry and the
 * pre-go-live persona guard. This suite pins the admin gate, the cross-status
 * listing and search, each write path with its audit row and status/mapping
 * effect, the validation rejections (empty/oversized text, already-hidden,
 * restore-only-hidden, and a remap target that is missing, non-canonical,
 * inactive, or unchanged), the restore-status derivation, the remap provenance
 * captured in the audit trail, the persona refusal on all four writes, and that a
 * hidden or remapped tip changes what the public trick page renders.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickTip,
  createTestSessionJwt,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3971');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000000t1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000000t2';
const PERSONA_ADMIN_ID = 'member_persona_fst_tips';

// Distinct tip ids captured at seed time; each mutating test owns one row so its
// assertions stay stable, and the guard/public-control rows are never mutated.
let tipEdit: number;
let tipHide: number;
let tipPublicStays: number;
let tipRestoreActive: number;
let tipRestoreUnresolved: number;
let tipRestoreInactive: number;
let tipRemap: number;
let tipFutureNet: number;
let tipGuard: number;
let tipAlreadyHidden: number;

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fst_admin', display_name: 'FST Admin', login_email: 'fst-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fst_member', display_name: 'FST Member', login_email: 'fst-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fst_persona', display_name: 'FST Persona', login_email: 'fst-persona@example.com', is_admin: 1 });

  // Active canonical tricks: whirl is the public page and remap target; blurry_whirl
  // is a second active trick; retired_trick is inactive (a remap must refuse it and
  // a restore must derive 'unresolved' for it).
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'Whirl', adds: '2',
    trick_family: 'whirl', base_trick: 'whirl', category: 'dex',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'blurry_whirl', canonical_name: 'Blurry Whirl', adds: '5',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'retired_trick', canonical_name: 'Retired Trick', adds: '3',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'pending', is_active: 0,
  });
  // An alias slug has no canonical freestyle_tricks row, so a remap targeting it
  // must be rejected as not-a-canonical-trick.
  insertFreestyleTrickAlias(db, 'rev_whirl', 'whirl', 'Reverse Whirl');

  tipEdit           = insertFreestyleTrickTip(db, { trick_slug: 'whirl', tip_text: 'SENTINEL_EDIT original advice.', status: 'published', display_order: 1 });
  tipHide           = insertFreestyleTrickTip(db, { trick_slug: 'whirl', tip_text: 'SENTINEL_HIDE will vanish from public.', status: 'published', display_order: 2 });
  tipPublicStays    = insertFreestyleTrickTip(db, { trick_slug: 'whirl', tip_text: 'SENTINEL_STAYS visible advice.', status: 'published', display_order: 3 });
  tipRestoreActive  = insertFreestyleTrickTip(db, { trick_slug: 'whirl', tip_text: 'SENTINEL_RESTORE_ACTIVE.', status: 'hidden', display_order: 4 });
  tipRestoreUnresolved = insertFreestyleTrickTip(db, { trick_slug: 'unresolved:Old Whirly Name', tip_text: 'SENTINEL_RESTORE_UNRESOLVED.', status: 'hidden', display_order: 5 });
  tipRestoreInactive = insertFreestyleTrickTip(db, { trick_slug: 'retired_trick', tip_text: 'SENTINEL_RESTORE_INACTIVE.', status: 'hidden', display_order: 6 });
  tipRemap          = insertFreestyleTrickTip(db, { trick_slug: 'unresolved:Mystery Move', tip_text: 'SENTINEL_REMAP advice text.', status: 'unresolved_freestyle', display_order: 7 });
  tipFutureNet      = insertFreestyleTrickTip(db, { trick_slug: 'unresolved:net:Side Axe', tip_text: 'SENTINEL_FUTURE_NET.', status: 'future_net', display_order: 8 });
  tipGuard          = insertFreestyleTrickTip(db, { trick_slug: 'whirl', tip_text: 'SENTINEL_GUARD untouched.', status: 'published', display_order: 9 });
  tipAlreadyHidden  = insertFreestyleTrickTip(db, { trick_slug: 'whirl', tip_text: 'SENTINEL_ALREADY_HIDDEN.', status: 'hidden', display_order: 10 });

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

async function post(path: string, cookie: string | undefined, body: Record<string, string> = {}) {
  const req = request(await createApp()).post(path).type('form').send(body);
  if (cookie) req.set('Cookie', cookie);
  return req;
}

function tipRow(id: number) {
  return db.prepare(
    'SELECT trick_slug, tip_text, status FROM freestyle_trick_tips WHERE id = ?',
  ).get(id) as { trick_slug: string; tip_text: string; status: string };
}

function auditByAction(entityId: string, actionType: string) {
  return db.prepare(
    'SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ?',
  ).all(entityId, actionType) as { metadata_json: string }[];
}

describe('GET /admin/freestyle/tips — admin gate and listing', () => {
  it('renders 200 for an admin', async () => {
    const res = await get('/admin/freestyle/tips', admin());
    expect(res.status).toBe(200);
  });

  it('redirects an unauthenticated visitor to login', async () => {
    const res = await get('/admin/freestyle/tips');
    expect(res.status).toBe(302);
  });

  it('returns 403 for a non-admin member', async () => {
    const res = await get('/admin/freestyle/tips', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });

  it('lists tips of every status, including hidden and each unresolved bucket', async () => {
    const res = await get('/admin/freestyle/tips', admin());
    expect(res.text).toContain('SENTINEL_STAYS');            // published
    expect(res.text).toContain('SENTINEL_ALREADY_HIDDEN');   // hidden
    expect(res.text).toContain('SENTINEL_REMAP');            // unresolved_freestyle
    expect(res.text).toContain('SENTINEL_FUTURE_NET');       // future_net
    expect(res.text).toContain('Mystery Move');              // unresolved name surfaced
  });

  it('labels the granular unresolved statuses in plain words', async () => {
    const res = await get('/admin/freestyle/tips', admin());
    expect(res.text).toContain('Unresolved (freestyle)');    // unresolved_freestyle label
    expect(res.text).toContain('Future net');                // future_net label
  });

  it('search filters by tip text', async () => {
    const res = await get('/admin/freestyle/tips?q=SENTINEL_REMAP', admin());
    expect(res.text).toContain('SENTINEL_REMAP');
    expect(res.text).not.toContain('SENTINEL_STAYS');
  });

  it('search filters by slug', async () => {
    const res = await get('/admin/freestyle/tips?q=Mystery', admin());
    expect(res.text).toContain('SENTINEL_REMAP');
    expect(res.text).not.toContain('SENTINEL_GUARD');
  });
});

describe('POST /admin/freestyle/tips/:id/edit — edit text', () => {
  it('edits the tip text, writes one audit row, and redirects', async () => {
    const res = await post(`/admin/freestyle/tips/${tipEdit}/edit`, admin(), { tipText: 'SENTINEL_EDIT rewritten advice.' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tips');
    expect(tipRow(tipEdit).tip_text).toBe('SENTINEL_EDIT rewritten advice.');

    const audits = auditByAction(String(tipEdit), 'freestyle.trick_tip.edited');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('whirl');
  });

  it('preserves the search query in the redirect target', async () => {
    const res = await post(`/admin/freestyle/tips/${tipEdit}/edit`, admin(), { tipText: 'SENTINEL_EDIT rewritten again.', q: 'whirl' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tips?q=whirl');
  });

  it('rejects empty text with 422 and writes nothing', async () => {
    const before = tipRow(tipGuard);
    const res = await post(`/admin/freestyle/tips/${tipGuard}/edit`, admin(), { tipText: '   ' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Tip text is required.');
    expect(tipRow(tipGuard).tip_text).toBe(before.tip_text);
    expect(auditByAction(String(tipGuard), 'freestyle.trick_tip.edited')).toHaveLength(0);
  });

  it('rejects oversized text with 422 and writes nothing', async () => {
    const before = tipRow(tipGuard);
    const res = await post(`/admin/freestyle/tips/${tipGuard}/edit`, admin(), { tipText: 'x'.repeat(4001) });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Tip text must be');
    expect(tipRow(tipGuard).tip_text).toBe(before.tip_text);
  });

  it('returns 404 for an unknown tip id', async () => {
    const res = await post('/admin/freestyle/tips/99999/edit', admin(), { tipText: 'Nope.' });
    expect(res.status).toBe(404);
  });

  it('returns 404 for a non-numeric id', async () => {
    const res = await post('/admin/freestyle/tips/abc/edit', admin(), { tipText: 'Nope.' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin and 302 for an anonymous visitor, writing nothing', async () => {
    const before = tipRow(tipGuard);
    const member = await post(`/admin/freestyle/tips/${tipGuard}/edit`, cookieFor(MEMBER_ID, 'member'), { tipText: 'Hijacked.' });
    expect(member.status).toBe(403);
    const anon = await post(`/admin/freestyle/tips/${tipGuard}/edit`, undefined, { tipText: 'Hijacked.' });
    expect(anon.status).toBe(302);
    expect(tipRow(tipGuard).tip_text).toBe(before.tip_text);
  });
});

describe('POST /admin/freestyle/tips/:id/hide — hide', () => {
  it('hides a published tip, records the prior status, and redirects', async () => {
    const res = await post(`/admin/freestyle/tips/${tipHide}/hide`, admin());
    expect(res.status).toBe(303);
    expect(tipRow(tipHide).status).toBe('hidden');

    const audits = auditByAction(String(tipHide), 'freestyle.trick_tip.hidden');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('published'); // fromStatus captured
  });

  it('removes the hidden tip from the public trick page while a published one stays', async () => {
    const res = await get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('SENTINEL_STAYS');   // still published
    expect(res.text).not.toContain('SENTINEL_HIDE'); // now hidden
  });

  it('rejects hiding an already-hidden tip with 422', async () => {
    const res = await post(`/admin/freestyle/tips/${tipAlreadyHidden}/hide`, admin());
    expect(res.status).toBe(422);
    expect(res.text).toContain('Only a published tip can be hidden.');
    expect(tipRow(tipAlreadyHidden).status).toBe('hidden');
  });

  it('rejects hiding an unresolved tip with 422 (it is not public)', async () => {
    const res = await post(`/admin/freestyle/tips/${tipFutureNet}/hide`, admin());
    expect(res.status).toBe(422);
    expect(res.text).toContain('Only a published tip can be hidden.');
    expect(tipRow(tipFutureNet).status).toBe('future_net');
  });

  it('returns 403 for a non-admin and 302 for an anonymous visitor, writing nothing', async () => {
    const member = await post(`/admin/freestyle/tips/${tipGuard}/hide`, cookieFor(MEMBER_ID, 'member'));
    expect(member.status).toBe(403);
    const anon = await post(`/admin/freestyle/tips/${tipGuard}/hide`, undefined);
    expect(anon.status).toBe(302);
    expect(tipRow(tipGuard).status).toBe('published');
  });
});

describe('POST /admin/freestyle/tips/:id/restore — restore', () => {
  it('restores a hidden tip on an active trick to published', async () => {
    const res = await post(`/admin/freestyle/tips/${tipRestoreActive}/restore`, admin());
    expect(res.status).toBe(303);
    expect(tipRow(tipRestoreActive).status).toBe('published');

    const audits = auditByAction(String(tipRestoreActive), 'freestyle.trick_tip.restored');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('published'); // toStatus derived
  });

  it('refuses to restore a hidden tip with an unresolved slug (must be remapped first) and writes nothing', async () => {
    const res = await post(`/admin/freestyle/tips/${tipRestoreUnresolved}/restore`, admin());
    expect(res.status).toBe(422);
    expect(res.text).toContain('Remap it to an active trick instead.');
    expect(tipRow(tipRestoreUnresolved).status).toBe('hidden');
  });

  it('refuses to restore a hidden tip pointing at an inactive trick and writes nothing', async () => {
    const res = await post(`/admin/freestyle/tips/${tipRestoreInactive}/restore`, admin());
    expect(res.status).toBe(422);
    expect(res.text).toContain('Remap it to an active trick instead.');
    expect(tipRow(tipRestoreInactive).status).toBe('hidden');
  });

  it('rejects restoring a tip that is not hidden with 422', async () => {
    const res = await post(`/admin/freestyle/tips/${tipGuard}/restore`, admin());
    expect(res.status).toBe(422);
    expect(res.text).toContain('Only a hidden tip can be restored.');
    expect(tipRow(tipGuard).status).toBe('published');
  });
});

describe('POST /admin/freestyle/tips/:id/remap — remap to an active canonical trick', () => {
  it('remaps an unresolved tip to an active trick, publishes it, and preserves the original slug as provenance', async () => {
    const res = await post(`/admin/freestyle/tips/${tipRemap}/remap`, admin(), { targetSlug: 'whirl' });
    expect(res.status).toBe(303);

    const row = tipRow(tipRemap);
    expect(row.trick_slug).toBe('whirl');
    expect(row.status).toBe('published');

    const audits = auditByAction(String(tipRemap), 'freestyle.trick_tip.remapped');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('unresolved:Mystery Move'); // original preserved
    expect(audits[0].metadata_json).toContain('whirl');
  });

  it('renders the remapped tip on the target trick public page', async () => {
    const res = await get('/freestyle/tricks/whirl');
    expect(res.text).toContain('SENTINEL_REMAP');
  });

  it('rejects an empty target with 422', async () => {
    const res = await post(`/admin/freestyle/tips/${tipGuard}/remap`, admin(), { targetSlug: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a trick');
  });

  it('rejects a missing (non-existent) target slug with 422', async () => {
    const before = tipRow(tipGuard);
    const res = await post(`/admin/freestyle/tips/${tipGuard}/remap`, admin(), { targetSlug: 'ghost_trick' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('not a canonical trick slug');
    expect(tipRow(tipGuard).trick_slug).toBe(before.trick_slug);
  });

  it('rejects an alias slug (not a canonical trick) with 422', async () => {
    const res = await post(`/admin/freestyle/tips/${tipGuard}/remap`, admin(), { targetSlug: 'rev_whirl' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('not a canonical trick slug');
  });

  it('rejects an inactive target with 422', async () => {
    const res = await post(`/admin/freestyle/tips/${tipGuard}/remap`, admin(), { targetSlug: 'retired_trick' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('not an active trick');
  });

  it('rejects remapping to the trick the tip already points at with 422', async () => {
    const res = await post(`/admin/freestyle/tips/${tipGuard}/remap`, admin(), { targetSlug: 'whirl' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('already mapped');
  });

  it('returns 403 for a non-admin and 302 for an anonymous visitor, writing nothing', async () => {
    const before = tipRow(tipGuard);
    const member = await post(`/admin/freestyle/tips/${tipGuard}/remap`, cookieFor(MEMBER_ID, 'member'), { targetSlug: 'blurry_whirl' });
    expect(member.status).toBe(403);
    const anon = await post(`/admin/freestyle/tips/${tipGuard}/remap`, undefined, { targetSlug: 'blurry_whirl' });
    expect(anon.status).toBe(302);
    expect(tipRow(tipGuard).trick_slug).toBe(before.trick_slug);
  });
});

// The pre-go-live persona guard must refuse a seeded-persona admin (a real admin
// by role, but a test persona whose writes would touch the committed pre-go-live
// source of truth) on every tip write path. The integration fixture runs with the
// guard flag on.
describe('freestyle tip write paths — seeded-persona admin is refused (403)', () => {
  const persona = () => cookieFor(PERSONA_ADMIN_ID, 'admin');

  it('refuses an edit', async () => {
    const before = tipRow(tipGuard);
    const res = await post(`/admin/freestyle/tips/${tipGuard}/edit`, persona(), { tipText: 'Persona edit.' });
    expect(res.status).toBe(403);
    expect(tipRow(tipGuard).tip_text).toBe(before.tip_text);
  });

  it('refuses a hide', async () => {
    const res = await post(`/admin/freestyle/tips/${tipGuard}/hide`, persona());
    expect(res.status).toBe(403);
    expect(tipRow(tipGuard).status).toBe('published');
  });

  it('refuses a restore', async () => {
    const res = await post(`/admin/freestyle/tips/${tipAlreadyHidden}/restore`, persona());
    expect(res.status).toBe(403);
    expect(tipRow(tipAlreadyHidden).status).toBe('hidden');
  });

  it('refuses a remap', async () => {
    const before = tipRow(tipGuard);
    const res = await post(`/admin/freestyle/tips/${tipGuard}/remap`, persona(), { targetSlug: 'blurry_whirl' });
    expect(res.status).toBe(403);
    expect(tipRow(tipGuard).trick_slug).toBe(before.trick_slug);
  });
});
