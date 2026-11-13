/**
 * The admin set editor: GET /admin/freestyle/sets, GET /admin/freestyle/sets/new,
 * POST /admin/freestyle/sets, GET and POST /admin/freestyle/sets/:slug/edit.
 *
 * An admin creates a freestyle set and edits an existing one: its name, group,
 * formula, plain explanation, related sets (each a set and an optional link
 * label) and whether it is held off the encyclopedia list. The slug is never
 * edited and a set is never deleted. A created set has its page, its encyclopedia
 * list entry and its sitemap entry on the next read. Every save writes its
 * committed save file first and appends one audit row.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertFreestyleTrick, createTestSessionJwt } from '../fixtures/factories';
import { seedStagedSets, stagedSet } from '../fixtures/stagedSets';
import { STAGED_SETS } from '../../freestyle/inputs/curator_content/freestyleSets';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4397');

let createApp: Awaited<ReturnType<typeof importApp>>;
let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000000e1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000000e2';
const PERSONA_ADMIN_ID = 'member_persona_fsm_set';

const cookieFor = (memberId: string, role: 'admin' | 'member') =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
const admin = () => cookieFor(ADMIN_ID, 'admin');

interface SetRow {
  display_name: string; set_group: string; sort_order: number; formula: string; explanation: string;
  related_sets_json: string; held_from_list: number; version: number; updated_by: string;
}
function query<T>(sql: string, ...params: unknown[]): T | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try { return db.prepare(sql).get(...params) as T | undefined; } finally { db.close(); }
}
const setRow = (slug: string) => query<SetRow>(
  'SELECT display_name, set_group, sort_order, formula, explanation, related_sets_json, held_from_list, version, updated_by FROM freestyle_sets WHERE slug = ?',
  slug);
const setCount = () => query<{ n: number }>('SELECT COUNT(*) AS n FROM freestyle_sets')!.n;
const audits = (slug: string, action: string) => query<{ n: number }>(
  "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_type = 'freestyle_set' AND entity_id = ? AND action_type = ?",
  slug, action)!.n;
// The changed fields on a set's one audit row of this action; a caller first
// asserts there is exactly one, so no ordering decides which row is read.
const onlyAuditFields = (slug: string, action: string): string[] => {
  const row = query<{ metadata_json: string }>(
    "SELECT metadata_json FROM audit_entries WHERE entity_type = 'freestyle_set' AND entity_id = ? AND action_type = ?",
    slug, action);
  return row ? (JSON.parse(row.metadata_json) as { changedFields: string[] }).changedFields : [];
};
const saveFile = (slug: string) => path.join(process.env.CURATOR_SAVES_DIR!, 'sets', `${slug}.json`);

/** The edit form exactly as it renders for a staged set. */
function formOf(slug: string, overrides: Record<string, string> = {}): Record<string, string> {
  const s = stagedSet(slug);
  return {
    displayName:  s.displayName,
    setGroup:     s.setGroup,
    formula:      s.formula,
    explanation:  s.explanation,
    relatedSets:  s.relatedSets.map((r) => (r.label ? `${r.slug} | ${r.label}` : r.slug)).join('\n'),
    ...(s.heldFromList ? { heldFromList: '1' } : {}),
    ...overrides,
  };
}

/** A create form for a new set, as a curator fills it in. */
function newForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    slug: 'zz_new_set', displayName: 'Zz New Set', setGroup: 'true-core', formula: 'TOE > SAME IN [DEX] >',
    explanation: 'A test set created in the editor. It opens from a toe set.', relatedSets: 'pixie',
    ...overrides,
  };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fss_admin', display_name: 'FSS Admin', login_email: 'fss-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fss_member', display_name: 'FSS Member', login_email: 'fss-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fss_persona', display_name: 'FSS Persona', login_email: 'fss-persona@example.com', is_admin: 1 });
  seedStagedSets(db);
  // A trick whose slug a new set may share, because a name that is both has both pages.
  insertFreestyleTrick(db, { slug: 'zz_shared', canonical_name: 'zz shared', adds: '2', base_trick: 'zz_shared', trick_family: 'mirage', category: 'dex' });
  db.close();
  createApp = await importApp();
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
});

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());
afterAll(() => cleanupTestDb(dbPath));

const app = async () => createApp();
const postEdit = async (slug: string, body: Record<string, string>, cookie = admin()) =>
  request(await app()).post(`/admin/freestyle/sets/${slug}/edit`).set('Cookie', cookie).type('form').send(body);
const postNew = async (body: Record<string, string>, cookie = admin()) =>
  request(await app()).post('/admin/freestyle/sets').set('Cookie', cookie).type('form').send(body);
const get = async (url: string, cookie?: string) => {
  const r = request(await app()).get(url);
  return cookie ? r.set('Cookie', cookie) : r;
};

describe('access', () => {
  // Defect caught: the editor opens to a visitor or a member, or a test persona
  // rewrites the committed set inputs.
  it('sends a visitor to log in, refuses a member and a test persona, and changes nothing', async () => {
    expect((await get('/admin/freestyle/sets')).status).toBe(302);
    expect((await get('/admin/freestyle/sets', cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
    const before = setRow('fairy');
    for (const cookie of [cookieFor(MEMBER_ID, 'member'), cookieFor(PERSONA_ADMIN_ID, 'admin')]) {
      expect((await postEdit('fairy', formOf('fairy', { displayName: 'Faerie' }), cookie)).status).toBe(403);
      expect((await postNew(newForm({ slug: 'zz_refused' }), cookie)).status).toBe(403);
    }
    expect(setRow('fairy')).toEqual(before);
    expect(setRow('zz_refused')).toBeUndefined();
    expect(audits('fairy', 'freestyle.set.updated')).toBe(0);
  });

  // Defect caught: an unknown set answers with a form that would create it.
  it('answers 404 for an unknown set on both verbs', async () => {
    expect((await get('/admin/freestyle/sets/no_such_set/edit', admin())).status).toBe(404);
    expect((await postEdit('no_such_set', formOf('fairy'))).status).toBe(404);
    expect(setRow('no_such_set')).toBeUndefined();
  });

  // Defect caught: the list omits sets, or links an edit or create form that
  // does not exist.
  it('lists every set with a link to its edit form, and links the create form', async () => {
    const res = await get('/admin/freestyle/sets', admin());
    expect(res.status).toBe(200);
    for (const s of STAGED_SETS) expect(res.text, s.slug).toContain(`href="/admin/freestyle/sets/${s.slug}/edit"`);
    expect(res.text).toContain('href="/admin/freestyle/sets/new"');
    const form = await get('/admin/freestyle/sets/new', admin());
    expect(form.status).toBe(200);
    expect(form.text).toContain('action="/admin/freestyle/sets"');
    expect(form.text).toContain('name="slug"');
    const edit = await get('/admin/freestyle/sets/pixie/edit', admin());
    expect(edit.text).toContain('action="/admin/freestyle/sets/pixie/edit"');
    // The edit form never offers the slug, and selects the set's own group.
    expect(edit.text).not.toContain('name="slug"');
    expect(edit.text).toMatch(/<option value="true-core" selected>/);
  });
});

describe('creating a set', () => {
  // Defect caught: a created set reaches only the database and is lost at the
  // next rebuild; it lands anywhere but the end of its group; or it has no page,
  // list entry or sitemap entry until a deployment.
  it('creates the set at the end of its group, writes its save file, audits it, and publishes it at once', async () => {
    const lastTrueCore = [...STAGED_SETS].filter((s) => s.setGroup === 'true-core').pop()!;
    const highestOrder = Math.max(...STAGED_SETS.map((s) => s.sortOrder));
    const before = setCount();

    const res = await postNew(newForm());
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/sets/zz_new_set/edit');
    expect(setCount()).toBe(before + 1);
    expect(setRow('zz_new_set')).toMatchObject({
      display_name: 'Zz New Set', set_group: 'true-core', sort_order: highestOrder + 10,
      formula: 'TOE > SAME IN [DEX] >', held_from_list: 0, version: 1,
    });
    expect(JSON.parse(setRow('zz_new_set')!.related_sets_json)).toEqual([{ slug: 'pixie', label: '' }]);
    const saved = JSON.parse(fs.readFileSync(saveFile('zz_new_set'), 'utf8'));
    expect(saved).toEqual({
      slug: 'zz_new_set', display_name: 'Zz New Set', set_group: 'true-core', sort_order: highestOrder + 10,
      formula: 'TOE > SAME IN [DEX] >', explanation: 'A test set created in the editor. It opens from a toe set.',
      related_sets: [{ slug: 'pixie', label: '' }], held_from_list: false,
    });
    expect(JSON.stringify(saved)).not.toContain(ADMIN_ID);
    expect(audits('zz_new_set', 'freestyle.set.created')).toBe(1);
    expect(onlyAuditFields('zz_new_set', 'freestyle.set.created').sort()).toEqual(
      ['display_name', 'explanation', 'formula', 'held_from_list', 'related_sets', 'set_group'].sort());

    const page = await get('/freestyle/sets/zz_new_set');
    expect(page.status).toBe(200);
    expect(page.text).toContain('#set_zz_new_set');
    // An empty label shows the related set's own name.
    expect(page.text).toContain(`<a href="/freestyle/sets/pixie">${stagedSet('pixie').displayName}</a>`);
    // The last true-core set now points forward to the new one.
    expect((await get(`/freestyle/sets/${lastTrueCore.slug}`)).text).toContain('href="/freestyle/sets/zz_new_set"');
    const list = await get('/freestyle/sets');
    expect(list.text).toContain('href="/freestyle/sets/zz_new_set"');
    expect((await get('/sitemap.xml')).text).toContain('/freestyle/sets/zz_new_set');
  });

  // Defect caught: a set slug that a trick already uses is refused, though a name
  // that is both a trick and a set has both pages.
  it('accepts a slug a trick already uses', async () => {
    expect((await postNew(newForm({ slug: 'zz_shared', displayName: 'Zz Shared Set' }))).status).toBe(303);
    expect(setRow('zz_shared')).toMatchObject({ display_name: 'Zz Shared Set' });
    expect((await get('/freestyle/sets/zz_shared')).status).toBe(200);
  });

  it.each([
    // Defect caught: a slug that cannot be an address or a hashtag.
    ['a slug with a hyphen', { slug: 'zz-bad' }],
    ['a slug with a capital', { slug: 'ZzBad' }],
    ['an empty slug', { slug: '' }],
    // Defect caught: a second set under an existing slug overwrites it.
    ['an existing set slug', { slug: 'pixie' }],
    // Defect caught: a set filed under a group the encyclopedia never lists.
    ['an unknown group', { slug: 'zz_bad_group', setGroup: 'no-such-group' }],
    // Defect caught: a related set that names nothing, or the set itself.
    ['a related set that does not exist', { slug: 'zz_bad_related', relatedSets: 'no_such_set' }],
    ['the set as its own related set', { slug: 'zz_self', relatedSets: 'zz_self' }],
    // Defect caught: a nameless or unexplained set.
    ['an empty display name', { slug: 'zz_no_name', displayName: '' }],
    ['an empty explanation', { slug: 'zz_no_text', explanation: '' }],
  ] as Array<[string, Record<string, string>]>)('refuses %s, writing nothing', async (_label, overrides) => {
    const before = setCount();
    const pixie = setRow('pixie');
    const res = await postNew(newForm(overrides));
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    // The create form comes back with what was typed.
    expect(res.text).toContain('action="/admin/freestyle/sets"');
    if (overrides.slug) expect(res.text).toContain(`value="${overrides.slug}"`);
    expect(setCount()).toBe(before);
    expect(setRow('pixie')).toEqual(pixie);
    if (overrides.slug) expect(fs.existsSync(saveFile(overrides.slug))).toBe(false);
  });

  // Defect caught: a refused create offers no way forward; the one correction a
  // curator would make saves.
  it('creates the refused set once the one bad field is corrected', async () => {
    expect((await postNew(newForm({ slug: 'zz_fixed', relatedSets: 'zz_fixed' }))).status).toBe(422);
    expect((await postNew(newForm({ slug: 'zz_fixed', relatedSets: 'fairy | The fairy set' }))).status).toBe(303);
    expect(JSON.parse(setRow('zz_fixed')!.related_sets_json)).toEqual([{ slug: 'fairy', label: 'The fairy set' }]);
  });
});

describe('editing a set', () => {
  // Defect caught: an edit reaches only the database, so the next rebuild loses
  // it; the audit row is missing or names the wrong fields; or the change never
  // reaches the public set page.
  it('saves every edited field, writes the save file, audits it once and shows on the set page', async () => {
    const before = setRow('fairy')!;
    const res = await postEdit('fairy', formOf('fairy', {
      displayName: 'Fairy Edited', formula: 'TOE > SAME OUT [DEX] > ?', relatedSets: 'pixie\natomic | Atomic, a sibling',
    }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/sets/fairy/edit');
    const row = setRow('fairy')!;
    expect(row).toMatchObject({
      display_name: 'Fairy Edited', formula: 'TOE > SAME OUT [DEX] > ?', sort_order: before.sort_order,
      version: before.version + 1, updated_by: ADMIN_ID,
    });
    expect(JSON.parse(row.related_sets_json)).toEqual([{ slug: 'pixie', label: '' }, { slug: 'atomic', label: 'Atomic, a sibling' }]);
    const saved = JSON.parse(fs.readFileSync(saveFile('fairy'), 'utf8'));
    expect(saved).toMatchObject({
      slug: 'fairy', display_name: 'Fairy Edited', sort_order: before.sort_order,
      related_sets: [{ slug: 'pixie', label: '' }, { slug: 'atomic', label: 'Atomic, a sibling' }],
    });
    expect(audits('fairy', 'freestyle.set.updated')).toBe(1);
    expect(onlyAuditFields('fairy', 'freestyle.set.updated').sort()).toEqual(['display_name', 'formula', 'related_sets']);

    const page = await get('/freestyle/sets/fairy');
    expect(page.text).toContain('Fairy Edited');
    expect(page.text).toContain(`<a href="/freestyle/sets/pixie">${stagedSet('pixie').displayName}</a>`);
    expect(page.text).toContain('<a href="/freestyle/sets/atomic">Atomic, a sibling</a>');
  });

  // Defect caught: a resubmit of the form as rendered writes a second audit row
  // or bumps the version for nothing.
  it('writes nothing for an unchanged submit', async () => {
    expect((await get('/admin/freestyle/sets/quantum/edit', admin())).status).toBe(200);
    const before = setRow('quantum');
    const res = await postEdit('quantum', formOf('quantum'));
    expect(res.status).toBe(303);
    expect(setRow('quantum')).toEqual(before);
    expect(audits('quantum', 'freestyle.set.updated')).toBe(0);
  });

  // Defect caught: an edit posted with a slug field renames or duplicates the set.
  it('ignores a slug posted with an edit', async () => {
    const before = setCount();
    expect((await postEdit('stepping', formOf('stepping', { slug: 'zz_renamed', displayName: 'Stepping Edited' }))).status).toBe(303);
    expect(setRow('stepping')).toMatchObject({ display_name: 'Stepping Edited' });
    expect(setRow('zz_renamed')).toBeUndefined();
    expect(setCount()).toBe(before);
  });

  // Defect caught: a set held off the list loses its page too, or stays on the
  // list. The positive control proves the list entry is there first.
  it('holds a set off the encyclopedia list while its page still resolves', async () => {
    const entry = 'class="dict-trick-row-title" href="/freestyle/sets/sailing"';
    expect((await get('/freestyle/sets')).text).toContain(entry);
    expect((await postEdit('sailing', formOf('sailing', { heldFromList: '1' }))).status).toBe(303);
    expect(setRow('sailing')!.held_from_list).toBe(1);
    expect((await get('/freestyle/sets')).text).not.toContain(entry);
    expect((await get('/freestyle/sets/sailing')).status).toBe(200);
    expect((await get('/admin/freestyle/sets/sailing/edit', admin())).text).toMatch(/name="heldFromList" value="1" checked/);
  });

  it.each([
    ['an unknown group', 'atomic', { setGroup: 'no-such-group' }],
    ['a related set that does not exist', 'atomic', { relatedSets: 'no_such_set' }],
    ['the set as its own related set', 'atomic', { relatedSets: 'atomic' }],
    // Defect caught: one related set listed twice, drawn twice on the page.
    ['a related set listed twice', 'atomic', { relatedSets: 'quantum\nquantum | Quantum again' }],
    ['an empty display name', 'atomic', { displayName: '' }],
  ] as Array<[string, string, Record<string, string>]>)('refuses %s, writing nothing', async (_label, slug, overrides) => {
    const before = setRow(slug);
    const res = await postEdit(slug, formOf(slug, overrides));
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    expect(res.text).toContain(`action="/admin/freestyle/sets/${slug}/edit"`);
    expect(setRow(slug)).toEqual(before);
    expect(audits(slug, 'freestyle.set.updated')).toBe(0);
  });

  // Defect caught: a save whose file cannot be written reaches the database only
  // and is lost at the next rebuild.
  it('refuses the save when its save file cannot be written', async () => {
    adapterModule.setCuratedAuthoringAdapterForTests({
      ...adapterModule.createDatabaseOnlyCuratedAuthoringAdapter(),
      saveItem() { throw new Error('disk full'); },
    });
    expectLoggedError(/unhandled error/);
    const before = setRow('toe');
    const res = await postEdit('toe', formOf('toe', { displayName: 'Unsaved' }));
    expect(res.status).toBe(503);
    expect(setRow('toe')).toEqual(before);
  });
});
