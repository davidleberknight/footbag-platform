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
 * validation re-render that preserves submitted values and writes nothing. The
 * save path also enforces scoring-bracket parity: when the ADD is numeric and the
 * execution notation carries scoring brackets, their count must equal the ADD;
 * rows with no scoring brackets or a non-numeric ADD skip the check and save.
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

// A complete, valid scalar body for a save. The execution notation carries two
// scoring brackets ([XBD] [DEL]), so ADD is 2 to satisfy bracket-count parity.
// Individual tests override a field to exercise a single validation or change path.
function validBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    canonicalName:     'Save OK',
    adds:              '2',
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

  // The row the bracket-parity skip tests save (once each, with distinct names):
  // a numeric ADD with no scoring brackets, and a non-numeric ADD with brackets.
  // Both bypass the parity check and must persist.
  insertFreestyleTrick(db, {
    slug: 'save_skip',
    canonical_name: 'Skip Row',
    adds: '2',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
  });

  // The trick the alias add/remove tests write against, plus a seeded alias for
  // the remove path. Kept apart from the display rows so their assertions stay
  // stable.
  insertFreestyleTrick(db, {
    slug: 'alias_host',
    canonical_name: 'Alias Host',
    adds: '3',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
  });
  insertFreestyleTrickAlias(db, 'rm_me', 'alias_host', 'Remove Me');

  // Two known registry sources for the source-link attach/detach tests, plus the
  // tricks they write against: source_host (pre-linked to src_a), source_host2
  // (no links), and detach_host (pre-linked to src_b).
  insertFreestyleTrickSource(db, { id: 'src_a', source_label: 'Source A', source_type: 'curated' });
  insertFreestyleTrickSource(db, { id: 'src_b', source_label: 'Source B', source_type: 'expert' });
  for (const s of ['source_host', 'source_host2', 'detach_host']) {
    insertFreestyleTrick(db, {
      slug: s,
      canonical_name: s,
      adds: '3',
      trick_family: 'whirl',
      base_trick: 'whirl',
      category: 'compound',
      review_status: 'curated',
      is_active: 1,
    });
  }
  insertFreestyleTrickSourceLink(db, 'source_host', 'src_a', {});
  insertFreestyleTrickSourceLink(db, 'detach_host', 'src_b', {});

  // Registry modifiers ('blurry' is already registered by the blurry_whirl seed)
  // and the trick the modifier-link tests write against. mod_host starts with one
  // seeded link (ducking at apply order 2) for the detach and same-modifier-other-
  // order paths.
  insertFreestyleTrickModifier(db, { slug: 'ducking', modifier_name: 'ducking', add_bonus: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', add_bonus: 1, modifier_type: 'body' });
  insertFreestyleTrick(db, {
    slug: 'mod_host',
    canonical_name: 'Mod Host',
    adds: '3',
    trick_family: 'whirl',
    base_trick: 'whirl',
    category: 'compound',
    review_status: 'curated',
    is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'mod_host', 'ducking', 2);

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

function auditByAction(entityId: string, actionType: string) {
  return db.prepare(
    'SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = ?',
  ).all(entityId, actionType) as { metadata_json: string }[];
}

function aliasRow(aliasSlug: string) {
  return db.prepare(
    'SELECT alias_slug, alias_text, alias_type, trick_slug FROM freestyle_trick_aliases WHERE alias_slug = ?',
  ).get(aliasSlug) as { alias_slug: string; alias_text: string; alias_type: string; trick_slug: string } | undefined;
}

function sourceLink(trickSlug: string, sourceId: string) {
  return db.prepare(
    'SELECT trick_slug, source_id, external_url, asserted_adds FROM freestyle_trick_source_links WHERE trick_slug = ? AND source_id = ?',
  ).get(trickSlug, sourceId) as { external_url: string | null; asserted_adds: number | null } | undefined;
}

function modifierLink(trickSlug: string, modifierSlug: string, applyOrder: number) {
  return db.prepare(
    'SELECT trick_slug, modifier_slug, apply_order FROM freestyle_trick_modifier_links WHERE trick_slug = ? AND modifier_slug = ? AND apply_order = ?',
  ).get(trickSlug, modifierSlug, applyOrder) as { apply_order: number } | undefined;
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

describe('POST /admin/freestyle/tricks/:slug/edit — scoring-bracket parity', () => {
  it('rejects a numeric ADD that disagrees with the scoring-bracket count and writes nothing', async () => {
    // Execution notation has two scoring brackets but ADD says four.
    const res = await post('/admin/freestyle/tricks/save_guard/edit', admin(),
      validBody({ canonicalName: 'Attempted Name', adds: '4', executionNotation: 'OP IN [DEX] > OP TOE [DEL]' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('scoring');
    expect(res.text).toContain('Attempted Name');        // submitted value survives
    expect(trickRow('save_guard').canonical_name).toBe('Guard Row');
    expect(auditRows('save_guard')).toHaveLength(0);
  });

  it('saves when the ADD is numeric but the execution notation has no scoring brackets', async () => {
    const res = await post('/admin/freestyle/tricks/save_skip/edit', admin(),
      validBody({ canonicalName: 'Skip Blank Notation', adds: '2', executionNotation: '' }));
    expect(res.status).toBe(303);
    expect(trickRow('save_skip').canonical_name).toBe('Skip Blank Notation');
  });

  it('saves when the execution notation has scoring brackets but the ADD is non-numeric', async () => {
    const res = await post('/admin/freestyle/tricks/save_skip/edit', admin(),
      validBody({ canonicalName: 'Skip Blank Add', adds: '', executionNotation: 'OP IN [DEX] [DEL]' }));
    expect(res.status).toBe(303);
    expect(trickRow('save_skip').canonical_name).toBe('Skip Blank Add');
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

describe('POST /admin/freestyle/tricks/:slug/aliases — add', () => {
  it('adds an alias, derives its lowercase-underscore slug, writes one audit row, and redirects', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'Side Walk', aliasType: 'common' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/alias_host/edit');

    const row = aliasRow('side_walk');
    expect(row).toBeDefined();
    expect(row!.trick_slug).toBe('alias_host');
    expect(row!.alias_text).toBe('Side Walk');
    expect(row!.alias_type).toBe('common');

    const audits = auditByAction('side_walk', 'freestyle.trick_alias.created');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('alias_host');
    expect(audits[0].metadata_json).toContain('Side Walk');

    const shown = await get('/admin/freestyle/tricks/alias_host/edit', admin());
    expect(shown.text).toContain('>side_walk<');
  });

  it('rejects an alias whose slug equals a canonical trick slug (any status) and writes nothing', async () => {
    // "Held Pending" derives to held_pending, an inactive/pending canonical slug.
    const res = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'Held Pending', aliasType: 'common' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('canonical trick slug');
    expect(aliasRow('held_pending')).toBeUndefined();
    expect(auditByAction('held_pending', 'freestyle.trick_alias.created')).toHaveLength(0);
  });

  it('rejects a slug already used by another trick, distinctly from a duplicate', async () => {
    // 'bw' already aliases blurry_whirl.
    const res = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'BW', aliasType: 'common' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('another trick');
    expect(aliasRow('bw')!.trick_slug).toBe('blurry_whirl'); // unchanged
  });

  it('rejects a duplicate alias on the same trick', async () => {
    const first = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'Dup Word', aliasType: 'common' });
    expect(first.status).toBe(303);
    const second = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'Dup Word', aliasType: 'common' });
    expect(second.status).toBe(422);
    expect(second.text).toContain('already an alias of this trick');
    expect(auditByAction('dup_word', 'freestyle.trick_alias.created')).toHaveLength(1); // only the first
  });

  it('rejects empty alias text with 422 and preserves nothing', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: '   ', aliasType: 'common' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Alias text is required.');
  });

  it('rejects an unrecognized alias type with 422 and preserves the submitted text', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'Keep This Text', aliasType: 'bogus' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Keep This Text'); // submitted value survives the re-render
    expect(aliasRow('keep_this_text')).toBeUndefined();
  });

  it('returns 404 adding to an unknown trick', async () => {
    const res = await post('/admin/freestyle/tricks/nope_missing/aliases', admin(),
      { aliasText: 'Whatever', aliasType: 'common' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, writing nothing', async () => {
    const member = await post('/admin/freestyle/tricks/alias_host/aliases', cookieFor(MEMBER_ID, 'member'),
      { aliasText: 'Blocked A', aliasType: 'common' });
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/tricks/alias_host/aliases', undefined,
      { aliasText: 'Blocked B', aliasType: 'common' });
    expect(anon.status).toBe(302);
    expect(aliasRow('blocked_a')).toBeUndefined();
    expect(aliasRow('blocked_b')).toBeUndefined();
  });
});

describe('POST /admin/freestyle/tricks/:slug/aliases/:aliasSlug/delete — remove', () => {
  it('removes an alias scoped to its trick, writes one audit row, and redirects', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/rm_me/delete', admin(), {});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/alias_host/edit');
    expect(aliasRow('rm_me')).toBeUndefined();

    const audits = auditByAction('rm_me', 'freestyle.trick_alias.deleted');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('Remove Me'); // captured text for recovery
    expect(audits[0].metadata_json).toContain('alias_host');
  });

  it('returns 404 removing an alias that belongs to a different trick, leaving it intact', async () => {
    // 'bw' belongs to blurry_whirl, not alias_host.
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/bw/delete', admin(), {});
    expect(res.status).toBe(404);
    expect(aliasRow('bw')).toBeDefined();
  });

  it('returns 404 removing an unknown alias', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/no_such_alias/delete', admin(), {});
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, deleting nothing', async () => {
    const member = await post('/admin/freestyle/tricks/blurry_whirl/aliases/bw/delete', cookieFor(MEMBER_ID, 'member'), {});
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/tricks/blurry_whirl/aliases/bw/delete', undefined, {});
    expect(anon.status).toBe(302);
    expect(aliasRow('bw')).toBeDefined(); // still there
  });
});

describe('POST /admin/freestyle/tricks/:slug/sources — attach', () => {
  it('offers only registry sources not already linked to the trick', async () => {
    // source_host is linked to src_a, so the attach select offers src_b but not src_a.
    const res = await get('/admin/freestyle/tricks/source_host/edit', admin());
    expect(res.text).toContain('value="src_b"');
    expect(res.text).not.toContain('<option value="src_a"');
  });

  it('attaches a registry source with its optional fields, writes one audit row, and redirects', async () => {
    const res = await post('/admin/freestyle/tricks/source_host2/sources', admin(),
      { sourceId: 'src_a', externalUrl: 'http://example.test/x', assertedAdds: '4' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/source_host2/edit');

    const link = sourceLink('source_host2', 'src_a');
    expect(link).toBeDefined();
    expect(link!.external_url).toBe('http://example.test/x');
    expect(link!.asserted_adds).toBe(4);

    const audits = auditByAction('source_host2:src_a', 'freestyle.trick_source_link.created');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('source_host2');
    expect(audits[0].metadata_json).toContain('http://example.test/x');

    const shown = await get('/admin/freestyle/tricks/source_host2/edit', admin());
    expect(shown.text).toContain('Source A');
  });

  it('rejects a duplicate link on the same trick and writes nothing', async () => {
    const res = await post('/admin/freestyle/tricks/source_host/sources', admin(),
      { sourceId: 'src_a' }); // already linked
    expect(res.status).toBe(422);
    expect(res.text).toContain('already linked');
    expect(auditByAction('source_host:src_a', 'freestyle.trick_source_link.created')).toHaveLength(0);
  });

  it('rejects a source id that is not in the registry', async () => {
    const res = await post('/admin/freestyle/tricks/source_host2/sources', admin(),
      { sourceId: 'ghost_source' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a source from the list.');
  });

  it('rejects an empty source selection', async () => {
    const res = await post('/admin/freestyle/tricks/source_host2/sources', admin(),
      { sourceId: '' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a source from the list.');
  });

  it('rejects a non-numeric asserted ADD and writes nothing', async () => {
    const res = await post('/admin/freestyle/tricks/source_host/sources', admin(),
      { sourceId: 'src_b', assertedAdds: 'lots' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Asserted ADD must be');
    expect(sourceLink('source_host', 'src_b')).toBeUndefined();
  });

  it('returns 404 attaching to an unknown trick', async () => {
    const res = await post('/admin/freestyle/tricks/nope_missing/sources', admin(),
      { sourceId: 'src_a' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, writing nothing', async () => {
    const member = await post('/admin/freestyle/tricks/source_host2/sources', cookieFor(MEMBER_ID, 'member'),
      { sourceId: 'src_b' });
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/tricks/source_host2/sources', undefined,
      { sourceId: 'src_b' });
    expect(anon.status).toBe(302);
    expect(sourceLink('source_host2', 'src_b')).toBeUndefined();
  });
});

describe('POST /admin/freestyle/tricks/:slug/sources/:sourceId/delete — detach', () => {
  it('returns 404 detaching a link that belongs to a different trick, leaving it intact', async () => {
    // (source_host, src_a) exists; detach_host is not linked to src_a.
    const res = await post('/admin/freestyle/tricks/detach_host/sources/src_a/delete', admin(), {});
    expect(res.status).toBe(404);
    expect(sourceLink('source_host', 'src_a')).toBeDefined();
  });

  it('detaches a source link scoped to its trick, writes one audit row, and redirects', async () => {
    const res = await post('/admin/freestyle/tricks/source_host/sources/src_a/delete', admin(), {});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/source_host/edit');
    expect(sourceLink('source_host', 'src_a')).toBeUndefined();

    const audits = auditByAction('source_host:src_a', 'freestyle.trick_source_link.deleted');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('src_a');
  });

  it('returns 404 detaching a link the trick does not have', async () => {
    const res = await post('/admin/freestyle/tricks/source_host2/sources/src_b/delete', admin(), {});
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, deleting nothing', async () => {
    const member = await post('/admin/freestyle/tricks/detach_host/sources/src_b/delete', cookieFor(MEMBER_ID, 'member'), {});
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/tricks/detach_host/sources/src_b/delete', undefined, {});
    expect(anon.status).toBe(302);
    expect(sourceLink('detach_host', 'src_b')).toBeDefined(); // still there
  });
});

describe('POST /admin/freestyle/tricks/:slug/modifiers — attach', () => {
  it('attaches a modifier at an explicit apply order, writes one audit row, and redirects', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: 'spinning', applyOrder: '1' });
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/mod_host/edit');
    expect(modifierLink('mod_host', 'spinning', 1)).toBeDefined();

    const audits = auditByAction('mod_host:spinning:1', 'freestyle.trick_modifier_link.created');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('spinning');

    const shown = await get('/admin/freestyle/tricks/mod_host/edit', admin());
    expect(shown.text).toContain('spinning');
  });

  it('defaults a blank apply order to 1 and records the resolved value in the audit', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: 'blurry', applyOrder: '' });
    expect(res.status).toBe(303);
    expect(modifierLink('mod_host', 'blurry', 1)).toBeDefined();

    const audits = auditByAction('mod_host:blurry:1', 'freestyle.trick_modifier_link.created');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('"applyOrder":1'); // resolved, not blank
  });

  it('allows the same modifier at a different apply order', async () => {
    // mod_host already has ducking at apply order 2 (seeded).
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: 'ducking', applyOrder: '3' });
    expect(res.status).toBe(303);
    expect(modifierLink('mod_host', 'ducking', 3)).toBeDefined();
    expect(modifierLink('mod_host', 'ducking', 2)).toBeDefined(); // original untouched
  });

  it('rejects the exact (trick, modifier, apply order) triple already linked and writes nothing', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: 'ducking', applyOrder: '2' }); // already linked
    expect(res.status).toBe(422);
    expect(res.text).toContain('already linked at apply order 2');
    expect(auditByAction('mod_host:ducking:2', 'freestyle.trick_modifier_link.created')).toHaveLength(0);
  });

  it('rejects a modifier slug that is not in the registry', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: 'ghost_mod', applyOrder: '1' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a modifier from the list.');
  });

  it('rejects an empty modifier selection', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: '', applyOrder: '1' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose a modifier from the list.');
  });

  it('rejects a non-numeric or below-one apply order and preserves the submitted value', async () => {
    const nonNumeric = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: 'spinning', applyOrder: 'abc' });
    expect(nonNumeric.status).toBe(422);
    expect(nonNumeric.text).toContain('Apply order must be');
    expect(nonNumeric.text).toContain('abc'); // submitted value survives the re-render

    const zero = await post('/admin/freestyle/tricks/mod_host/modifiers', admin(),
      { modifierSlug: 'spinning', applyOrder: '0' });
    expect(zero.status).toBe(422);
    expect(modifierLink('mod_host', 'spinning', 0)).toBeUndefined();
  });

  it('returns 404 attaching to an unknown trick', async () => {
    const res = await post('/admin/freestyle/tricks/nope_missing/modifiers', admin(),
      { modifierSlug: 'spinning', applyOrder: '1' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, writing nothing', async () => {
    const member = await post('/admin/freestyle/tricks/mod_host/modifiers', cookieFor(MEMBER_ID, 'member'),
      { modifierSlug: 'spinning', applyOrder: '5' });
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/tricks/mod_host/modifiers', undefined,
      { modifierSlug: 'spinning', applyOrder: '5' });
    expect(anon.status).toBe(302);
    expect(modifierLink('mod_host', 'spinning', 5)).toBeUndefined();
  });
});

describe('POST /admin/freestyle/tricks/:slug/modifiers/:modifierSlug/:applyOrder/delete — detach', () => {
  it('returns 404 detaching a link that belongs to a different trick, leaving it intact', async () => {
    // (mod_host, ducking, 2) exists; detach_host has no such link.
    const res = await post('/admin/freestyle/tricks/detach_host/modifiers/ducking/2/delete', admin(), {});
    expect(res.status).toBe(404);
    expect(modifierLink('mod_host', 'ducking', 2)).toBeDefined();
  });

  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, deleting nothing', async () => {
    const member = await post('/admin/freestyle/tricks/mod_host/modifiers/ducking/2/delete', cookieFor(MEMBER_ID, 'member'), {});
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/tricks/mod_host/modifiers/ducking/2/delete', undefined, {});
    expect(anon.status).toBe(302);
    expect(modifierLink('mod_host', 'ducking', 2)).toBeDefined(); // still there
  });

  it('returns 404 detaching an apply order the trick does not have', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers/ducking/9/delete', admin(), {});
    expect(res.status).toBe(404);
  });

  it('returns 404 when the apply-order segment is not a number', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers/ducking/abc/delete', admin(), {});
    expect(res.status).toBe(404);
  });

  it('detaches a modifier link scoped to the full triple, writes one audit row, and redirects', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers/ducking/2/delete', admin(), {});
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/mod_host/edit');
    expect(modifierLink('mod_host', 'ducking', 2)).toBeUndefined();
    expect(modifierLink('mod_host', 'ducking', 3)).toBeDefined(); // the other-order link stays

    const audits = auditByAction('mod_host:ducking:2', 'freestyle.trick_modifier_link.deleted');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('ducking');
  });
});
