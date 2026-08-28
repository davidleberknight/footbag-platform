/**
 * Admin freestyle-content edit page: GET and POST /admin/freestyle/tricks/:slug/edit.
 *
 * The admin-only trick edit surface. GET loads a trick row (any status) with its
 * editable scalar fields plus its attached aliases, sources, and modifier links
 * (the attached rows are display-only). POST saves the editable row fields, the
 * structural fields plus the editorial prose fields, in one transaction with a
 * single audit entry; the attached rows are never touched. This suite pins the admin gate, the scalar-field display, the
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
const PERSONA_ADMIN_ID = 'member_persona_fse_edit';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
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
  // A seeded-persona admin (id carries the persona prefix): a real admin by role,
  // but the pre-go-live guard must refuse it from every freestyle write path.
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fse_persona', display_name: 'FSE Persona', login_email: 'fse-persona@example.com', is_admin: 1 });

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
  // A displayed nickname and a hidden decomposition, for the reclassify tests.
  insertFreestyleTrickAlias(db, 'retype_me', 'alias_host', 'Retype Me',
    { alias_type: 'common', alias_display: 1 });
  insertFreestyleTrickAlias(db, 'hidden_structural', 'alias_host', 'Hidden Structural',
    { alias_type: 'structural', alias_display: 0 });

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

  // Editorial-prose edit coverage: prose_host is seeded with values (the display
  // test), prose_save is the write target, and prose_clear is seeded with a
  // description to prove an empty submit clears it to null.
  insertFreestyleTrick(db, {
    slug: 'prose_host',
    canonical_name: 'Prose Host',
    adds: '3', trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
    description: 'Seed description text.',
    short_description: 'Seed short desc.',
    execution_summary: 'Seed execution summary.',
    learning_notes: 'Seed learning notes.',
    prerequisite_notes: 'Seed prereq notes.',
    pronunciation: 'proas-host',
    operational_notation_source: 'Seed source note.',
  });
  insertFreestyleTrick(db, {
    slug: 'prose_save',
    canonical_name: 'Prose Save',
    adds: '2', trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
    description: 'Old description.',
  });
  insertFreestyleTrick(db, {
    slug: 'prose_clear',
    canonical_name: 'Prose Clear',
    adds: '2', trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
    description: 'Clear me.',
  });

  // Rows for the core-primitive marker and the browse sort position. The display
  // row carries both set to a non-default value; the save rows are separate so
  // their mutations never disturb the display assertions.
  insertFreestyleTrick(db, {
    slug: 'core_host',
    canonical_name: 'Core Host',
    adds: '1', trick_family: 'whirl', base_trick: 'whirl', category: 'dex',
    review_status: 'curated', is_active: 1, is_core: 1, sort_order: 42,
  });
  insertFreestyleTrick(db, {
    slug: 'core_set',
    canonical_name: 'Core Set',
    adds: '2', trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1, is_core: 0, sort_order: 0,
  });
  insertFreestyleTrick(db, {
    slug: 'core_clear',
    canonical_name: 'Core Clear',
    adds: '2', trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1, is_core: 1, sort_order: 7,
  });
  // Never saved successfully: the rejection tests assert it is untouched.
  insertFreestyleTrick(db, {
    slug: 'core_guard',
    canonical_name: 'Core Guard',
    adds: '2', trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1, is_core: 1, sort_order: 9,
  });

  // Derived-parse rows: each carries a stored notation parse, so a save can be
  // shown to drop it when it changes what the parse was taken from, and to keep
  // it when it does not. One row per case, because the first save that clears the
  // parse would otherwise leave nothing for the next assertion to observe.
  const seededParse = {
    slug: 'parse_seed',
    canonical_name: 'Parse Seed',
    adds: '2',
    notation: 'CLIP > OP IN [DEX] move_marker',
    operational_notation: 'CLIP > OP CLIP [XBD] exec_marker [DEL]',
    trick_family: 'whirl', base_trick: 'whirl', category: 'compound',
    review_status: 'curated', is_active: 1,
    structural_parse_json: '{"core_family":"whirl","parse_warnings":[]}',
    computed_add_formula: 'whirl(2) = 2',
    computed_adds: 2,
    add_formula_status: 'exact_self_atom',
  };
  insertFreestyleTrick(db, { ...seededParse, slug: 'parse_movement', canonical_name: 'Parse Movement' });
  insertFreestyleTrick(db, { ...seededParse, slug: 'parse_execution', canonical_name: 'Parse Execution' });
  // Bracket-free execution notation, so the ADD can be changed on its own without
  // the scoring-bracket parity check rejecting the save.
  insertFreestyleTrick(db, {
    ...seededParse, slug: 'parse_adds', canonical_name: 'Parse Adds',
    operational_notation: 'CLIP > OP CLIP no_brackets',
  });
  insertFreestyleTrick(db, { ...seededParse, slug: 'parse_prose', canonical_name: 'Parse Prose' });
  insertFreestyleTrick(db, { ...seededParse, slug: 'parse_noop', canonical_name: 'Parse Noop' });

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

function coreRow(slug: string) {
  return db.prepare(
    'SELECT is_core, sort_order FROM freestyle_tricks WHERE slug = ?',
  ).get(slug) as { is_core: number; sort_order: number };
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
    'SELECT alias_slug, alias_text, alias_type, alias_display, trick_slug, notes FROM freestyle_trick_aliases WHERE alias_slug = ?',
  ).get(aliasSlug) as {
    alias_slug: string; alias_text: string; alias_type: string;
    alias_display: number; trick_slug: string; notes: string | null;
  } | undefined;
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

function parseRow(slug: string) {
  return db.prepare(
    `SELECT structural_parse_json, computed_add_formula, computed_adds, add_formula_status
     FROM freestyle_tricks WHERE slug = ?`,
  ).get(slug) as {
    structural_parse_json: string | null; computed_add_formula: string | null;
    computed_adds: number | null; add_formula_status: string | null;
  };
}

function proseRow(slug: string) {
  return db.prepare(
    `SELECT description, short_description, execution_summary, learning_notes,
            prerequisite_notes, pronunciation, operational_notation_source
     FROM freestyle_tricks WHERE slug = ?`,
  ).get(slug) as {
    description: string | null; short_description: string | null;
    execution_summary: string | null; learning_notes: string | null;
    prerequisite_notes: string | null; pronunciation: string | null;
    operational_notation_source: string | null;
  };
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

// The stored notation parse is produced by the content pipeline from the two
// notation fields and graded against the asserted ADD. The application cannot
// re-derive it, so a save that changes any of those three drops it rather than
// leaving the public grammar panel describing notation the row no longer carries.
describe('POST /admin/freestyle/tricks/:slug/edit — derived notation parse', () => {
  it('clears the stored parse when the movement notation changes', async () => {
    const before = parseRow('parse_movement');
    expect(before.structural_parse_json).not.toBeNull();

    const res = await post('/admin/freestyle/tricks/parse_movement/edit', admin(),
      validBody({ movementNotation: 'CLIP > OP IN [DEX] different_marker' }));
    expect(res.status).toBe(303);

    const after = parseRow('parse_movement');
    expect(after.structural_parse_json).toBeNull();
    expect(after.computed_add_formula).toBeNull();
    expect(after.computed_adds).toBeNull();
    expect(after.add_formula_status).toBeNull();
  });

  it('clears the stored parse when the execution notation changes', async () => {
    const res = await post('/admin/freestyle/tricks/parse_execution/edit', admin(),
      validBody({ executionNotation: 'CLIP > OP CLIP [XBD] different_marker [DEL]' }));
    expect(res.status).toBe(303);

    const after = parseRow('parse_execution');
    expect(after.structural_parse_json).toBeNull();
    expect(after.computed_adds).toBeNull();
  });

  it('clears the stored parse when the asserted ADD changes, since the parse is graded against it', async () => {
    const res = await post('/admin/freestyle/tricks/parse_adds/edit', admin(),
      validBody({ adds: '5', executionNotation: 'CLIP > OP CLIP no_brackets' }));
    expect(res.status).toBe(303);
    expect(trickRow('parse_adds').canonical_name).toBe('Save OK'); // the save really landed

    const after = parseRow('parse_adds');
    expect(after.structural_parse_json).toBeNull();
    expect(after.add_formula_status).toBeNull();
  });

  it('keeps the stored parse when the save changes neither notation nor the ADD', async () => {
    const res = await post('/admin/freestyle/tricks/parse_prose/edit', admin(),
      validBody({ description: 'Fresh editorial prose.' }));
    expect(res.status).toBe(303);
    expect(proseRow('parse_prose').description).toBe('Fresh editorial prose.');

    const after = parseRow('parse_prose');
    expect(after.structural_parse_json).toBe('{"core_family":"whirl","parse_warnings":[]}');
    expect(after.computed_add_formula).toBe('whirl(2) = 2');
    expect(after.computed_adds).toBe(2);
    expect(after.add_formula_status).toBe('exact_self_atom');
  });

  it('keeps the stored parse when the submitted values are identical to the stored row', async () => {
    const res = await post('/admin/freestyle/tricks/parse_noop/edit', admin(),
      validBody({ canonicalName: 'Parse Noop' }));
    expect(res.status).toBe(303);
    expect(parseRow('parse_noop').structural_parse_json).not.toBeNull();
  });

  it('records on the audit entry whether the parse was cleared', async () => {
    const cleared = auditRows('parse_movement').map((r) => JSON.parse(r.metadata_json));
    expect(cleared).toHaveLength(1);
    expect(cleared[0].derivedParseCleared).toBe(true);
    expect(cleared[0].changedFields).toContain('notation');

    const kept = auditRows('parse_prose').map((r) => JSON.parse(r.metadata_json));
    expect(kept).toHaveLength(1);
    expect(kept[0].derivedParseCleared).toBe(false);
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

describe('POST/GET /admin/freestyle/tricks/:slug/edit — editorial prose fields', () => {
  it('displays all seven prose fields for editing', async () => {
    const res = await get('/admin/freestyle/tricks/prose_host/edit', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Seed description text.');
    expect(res.text).toContain('Seed short desc.');
    expect(res.text).toContain('Seed execution summary.');
    expect(res.text).toContain('Seed learning notes.');
    expect(res.text).toContain('Seed prereq notes.');
    expect(res.text).toContain('value="proas-host"');   // pronunciation input
    expect(res.text).toContain('Seed source note.');     // execution-notation source
  });

  it('persists all seven prose fields and records them in the audit metadata', async () => {
    const res = await post('/admin/freestyle/tricks/prose_save/edit', admin(), validBody({
      canonicalName: 'Prose Save',
      description: 'New description.',
      shortDescription: 'New short.',
      executionSummary: 'New exec summary.',
      learningNotes: 'New learning.',
      prerequisiteNotes: 'New prereq.',
      pronunciation: 'new-pron',
      operationalNotationSource: 'New source.',
    }));
    expect(res.status).toBe(303);

    const row = proseRow('prose_save');
    expect(row.description).toBe('New description.');
    expect(row.short_description).toBe('New short.');
    expect(row.execution_summary).toBe('New exec summary.');
    expect(row.learning_notes).toBe('New learning.');
    expect(row.prerequisite_notes).toBe('New prereq.');
    expect(row.pronunciation).toBe('new-pron');
    expect(row.operational_notation_source).toBe('New source.');

    const audits = auditRows('prose_save');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('description');
    expect(audits[0].metadata_json).toContain('operational_notation_source');
  });

  it('clears a prose field to null when submitted empty', async () => {
    const res = await post('/admin/freestyle/tricks/prose_clear/edit', admin(),
      validBody({ canonicalName: 'Prose Clear', description: '' }));
    expect(res.status).toBe(303);
    expect(proseRow('prose_clear').description).toBeNull();
  });

  it('rejects an oversized prose field with 422 and writes nothing', async () => {
    const before = proseRow('save_guard');
    const huge = 'x'.repeat(4001);
    const res = await post('/admin/freestyle/tricks/save_guard/edit', admin(),
      validBody({ canonicalName: 'Attempted Name', description: huge }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Description must be');
    expect(proseRow('save_guard').description).toBe(before.description);
    expect(auditRows('save_guard')).toHaveLength(0);
  });
});

// The core-primitive marker and the browse sort position are the two row fields
// the retiring content pipeline used to own. They need an in-app write path
// because nothing else maintains them once the live database is the source of
// truth for freestyle content.
describe('POST/GET /admin/freestyle/tricks/:slug/edit — core marker and sort position', () => {
  it('displays the stored core marker and sort position for editing', async () => {
    const res = await get('/admin/freestyle/tricks/core_host/edit', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="isCore"');
    expect(res.text).toMatch(/name="isCore"[^>]*checked/);
    expect(res.text).toContain('value="42"');           // sort position input
  });

  it('leaves the core checkbox unchecked for a row that is not a core primitive', async () => {
    const res = await get('/admin/freestyle/tricks/core_set/edit', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="isCore"');
    expect(res.text).not.toMatch(/name="isCore"[^>]*checked/);
  });

  it('sets the core marker and the sort position, and names both in the audit metadata', async () => {
    const res = await post('/admin/freestyle/tricks/core_set/edit', admin(),
      validBody({ canonicalName: 'Core Set', isCore: 'on', sortOrder: '17' }));
    expect(res.status).toBe(303);

    const row = coreRow('core_set');
    expect(row.is_core).toBe(1);
    expect(row.sort_order).toBe(17);

    const audits = auditRows('core_set');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('is_core');
    expect(audits[0].metadata_json).toContain('sort_order');
  });

  it('clears the core marker when the checkbox is absent, and stores zero for a cleared sort position', async () => {
    const res = await post('/admin/freestyle/tricks/core_clear/edit', admin(),
      validBody({ canonicalName: 'Core Clear', sortOrder: '' }));
    expect(res.status).toBe(303);

    const row = coreRow('core_clear');
    expect(row.is_core).toBe(0);
    expect(row.sort_order).toBe(0);
  });

  it('rejects a non-numeric sort position and persists nothing', async () => {
    const before = coreRow('core_guard');
    const res = await post('/admin/freestyle/tricks/core_guard/edit', admin(),
      validBody({ canonicalName: 'Attempted Name', sortOrder: 'first' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Sort position must be a whole number');

    const after = coreRow('core_guard');
    expect(after.sort_order).toBe(before.sort_order);
    expect(after.is_core).toBe(before.is_core);
    expect(auditRows('core_guard')).toHaveLength(0);
  });

  it('rejects a negative sort position rather than coercing it', async () => {
    const before = coreRow('core_guard');
    const res = await post('/admin/freestyle/tricks/core_guard/edit', admin(),
      validBody({ canonicalName: 'Attempted Name', sortOrder: '-3' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Sort position must be a whole number');
    expect(coreRow('core_guard').sort_order).toBe(before.sort_order);
    expect(auditRows('core_guard')).toHaveLength(0);
  });

  it('rejects a fractional sort position rather than truncating it', async () => {
    const before = coreRow('core_guard');
    const res = await post('/admin/freestyle/tricks/core_guard/edit', admin(),
      validBody({ canonicalName: 'Attempted Name', sortOrder: '2.5' }));
    expect(res.status).toBe(422);
    expect(coreRow('core_guard').sort_order).toBe(before.sort_order);
    expect(auditRows('core_guard')).toHaveLength(0);
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

describe('POST /admin/freestyle/tricks/:slug/aliases — the class decides the display state', () => {
  it('adds a nickname displayed and any other class search-only', async () => {
    const nickname = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'Nick Name', aliasType: 'common' });
    expect(nickname.status).toBe(303);
    expect(aliasRow('nick_name')!.alias_display).toBe(1);

    const abbreviation = await post('/admin/freestyle/tricks/alias_host/aliases', admin(),
      { aliasText: 'Abbrev Form', aliasType: 'technical' });
    expect(abbreviation.status).toBe(303);
    expect(aliasRow('abbrev_form')!.alias_display).toBe(0);
  });

  it('offers the whole stored class vocabulary, not a narrower list', async () => {
    const res = await get('/admin/freestyle/tricks/alias_host/edit', admin());
    for (const type of ['common', 'historical', 'technical', 'structural',
      'positional', 'typo', 'suppressed', 'ambiguous']) {
      expect(res.text).toContain(`value="${type}"`);
    }
  });
});

describe('POST /admin/freestyle/tricks/:slug/aliases/:aliasSlug — reclassify', () => {
  it('sets the class and hides the alias, writes one audit row carrying the previous values, and redirects', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/retype_me', admin(),
      { aliasType: 'technical' });   // no aliasDisplay: an unchecked box submits nothing
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/tricks/alias_host/edit');

    const row = aliasRow('retype_me')!;
    expect(row.alias_type).toBe('technical');
    expect(row.alias_display).toBe(0);

    const audits = auditByAction('retype_me', 'freestyle.trick_alias.updated');
    expect(audits).toHaveLength(1);
    expect(audits[0].metadata_json).toContain('"previousAliasType":"common"');
    expect(audits[0].metadata_json).toContain('"previousAliasDisplay":1');
  });

  it('displays a non-nickname class when a curator sets it deliberately and says why', async () => {
    // Publishing a class the default would hide is allowed, and now has to carry
    // the judgement the class cannot record. The reason is stored on the row, so
    // a later reader finds the exception explained rather than bare.
    const reason = 'the orbit page is poorer without the reading that names the trick';
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural', aliasDisplay: 'on', divergenceReason: reason });
    expect(res.status).toBe(303);

    const row = aliasRow('hidden_structural')!;
    expect(row.alias_type).toBe('structural');
    expect(row.alias_display).toBe(1);
    expect(row.notes).toBe(reason);
  });

  // An alias whose publication state follows its class needs no defending. One
  // set against it records a judgement the class cannot hold, and after cutover
  // this surface is the only writer, so an unexplained exception here would be
  // indistinguishable from a mistake for good.
  it('refuses to publish against the class with no reason, and writes nothing', async () => {
    // Put the row back to what its class implies first, which clears any reason
    // an earlier case left standing. Without this the fallback to the standing
    // reason would carry the save, and the test would depend on file order.
    await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural' });

    const before = aliasRow('hidden_structural')!;
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural', aliasDisplay: 'on' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('needs a reason');

    const after = aliasRow('hidden_structural')!;
    expect(after.alias_display).toBe(before.alias_display);
    expect(after.alias_type).toBe(before.alias_type);
  });

  it('refuses to hold back a nickname with no reason, the other direction of the same rule', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/retype_me', admin(),
      { aliasType: 'common' });   // nickname class, unchecked box: hidden against the default
    expect(res.status).toBe(422);
    expect(res.text).toContain('needs a reason');
  });

  it('rejects a reason too short to carry a judgement', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural', aliasDisplay: 'on', divergenceReason: 'because' });
    expect(res.status).toBe(422);
  });

  it('needs no reason when the publication state follows the class', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/retype_me', admin(),
      { aliasType: 'technical' });
    expect(res.status).toBe(303);
    expect(aliasRow('retype_me')!.notes).toBeNull();
  });

  it('surfaces a standing reason on the edit page so a curator sees it before changing it', async () => {
    const reason = 'held back as a name a reader can reconstruct from the canonical one';
    await post('/admin/freestyle/tricks/alias_host/aliases/abbrev_form', admin(),
      { aliasType: 'common', divergenceReason: reason });
    const res = await get('/admin/freestyle/tricks/alias_host/edit', admin());
    expect(res.text).toContain(reason);
    expect(res.text).toContain('required');
  });

  it('keeps a standing reason when an unrelated edit leaves the field empty', async () => {
    // The field is not a re-confirmation. An edit that does not touch it must not
    // erase the explanation that is still true.
    const reason = 'the page needs the reading that names this trick beside it';
    await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural', aliasDisplay: 'on', divergenceReason: reason });
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural', aliasDisplay: 'on' });
    expect(res.status).toBe(303);
    expect(aliasRow('hidden_structural')!.notes).toBe(reason);
  });

  it('clears the reason when the exception it explained is withdrawn', async () => {
    // A stale explanation outliving its exception is worse than none: it would
    // describe a state the row no longer holds.
    await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural', aliasDisplay: 'on', divergenceReason: 'published on purpose for now' });
    await post('/admin/freestyle/tricks/alias_host/aliases/hidden_structural', admin(),
      { aliasType: 'structural' });   // back to what the class implies
    expect(aliasRow('hidden_structural')!.notes).toBeNull();
  });

  it('rejects an unrecognized class with 422 and writes nothing', async () => {
    const before = aliasRow('rm_me')!;
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/rm_me', admin(),
      { aliasType: 'nickname', aliasDisplay: 'on' });
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose an alias type.');

    const after = aliasRow('rm_me')!;
    expect(after.alias_type).toBe(before.alias_type);
    expect(after.alias_display).toBe(before.alias_display);
    expect(auditByAction('rm_me', 'freestyle.trick_alias.updated')).toHaveLength(0);
  });

  it('returns 404 reclassifying an alias that belongs to a different trick, leaving it intact', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/bw', admin(),
      { aliasType: 'typo' });
    expect(res.status).toBe(404);
    expect(aliasRow('bw')!.alias_type).not.toBe('typo');
  });

  it('returns 404 reclassifying an unknown alias', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases/no_such_alias', admin(),
      { aliasType: 'common' });
    expect(res.status).toBe(404);
  });

  it('returns 403 for a non-admin and 302 for an unauthenticated visitor, changing nothing', async () => {
    const before = aliasRow('bw')!;
    const member = await post('/admin/freestyle/tricks/blurry_whirl/aliases/bw', cookieFor(MEMBER_ID, 'member'),
      { aliasType: 'typo' });
    expect(member.status).toBe(403);
    const anon = await post('/admin/freestyle/tricks/blurry_whirl/aliases/bw', undefined,
      { aliasType: 'typo' });
    expect(anon.status).toBe(302);

    const after = aliasRow('bw')!;
    expect(after.alias_type).toBe(before.alias_type);
    expect(after.alias_display).toBe(before.alias_display);
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

// The pre-go-live persona guard must refuse a seeded-persona admin on EVERY
// freestyle write path (the flag is on in the integration fixture). Each case
// asserts 403 and, where checkable, that nothing was written.
describe('freestyle write paths — seeded-persona admin is refused (403) on all seven', () => {
  const persona = () => cookieFor(PERSONA_ADMIN_ID, 'admin');

  it('refuses the scalar trick save', async () => {
    const res = await post('/admin/freestyle/tricks/save_ok/edit', persona(),
      validBody({ canonicalName: 'Persona Should Not Save' }));
    expect(res.status).toBe(403);
    expect(trickRow('save_ok').canonical_name).not.toBe('Persona Should Not Save');
  });

  it('refuses an alias add', async () => {
    const res = await post('/admin/freestyle/tricks/alias_host/aliases', persona(),
      { aliasText: 'Persona Alias', aliasType: 'common' });
    expect(res.status).toBe(403);
    expect(aliasRow('persona_alias')).toBeUndefined();
  });

  it('refuses an alias remove', async () => {
    const res = await post('/admin/freestyle/tricks/blurry_whirl/aliases/bw/delete', persona(), {});
    expect(res.status).toBe(403);
    expect(aliasRow('bw')).toBeDefined();
  });

  it('refuses a source attach', async () => {
    const res = await post('/admin/freestyle/tricks/source_host2/sources', persona(),
      { sourceId: 'src_b' });
    expect(res.status).toBe(403);
    expect(sourceLink('source_host2', 'src_b')).toBeUndefined();
  });

  it('refuses a source detach', async () => {
    const res = await post('/admin/freestyle/tricks/detach_host/sources/src_b/delete', persona(), {});
    expect(res.status).toBe(403);
    expect(sourceLink('detach_host', 'src_b')).toBeDefined();
  });

  it('refuses a modifier attach', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers', persona(),
      { modifierSlug: 'ducking', applyOrder: '5' });
    expect(res.status).toBe(403);
    expect(modifierLink('mod_host', 'ducking', 5)).toBeUndefined();
  });

  it('refuses a modifier detach', async () => {
    const res = await post('/admin/freestyle/tricks/mod_host/modifiers/ducking/3/delete', persona(), {});
    expect(res.status).toBe(403);
    expect(modifierLink('mod_host', 'ducking', 3)).toBeDefined();
  });
});
