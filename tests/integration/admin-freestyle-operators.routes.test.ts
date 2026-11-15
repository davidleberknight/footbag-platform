/**
 * The admin operator editor: GET /admin/freestyle/operators, GET
 * /admin/freestyle/operators/new, POST /admin/freestyle/operators, GET and POST
 * /admin/freestyle/operators/:slug/edit.
 *
 * An admin adds a freestyle operator and edits an existing one: its name, kind,
 * definition, decomposition and its note, worked examples, source note, whether it
 * awaits a curator's confirmation, and its group and position on the operators
 * page. An operator holds no ADD, its slug is never edited and it is never
 * removed. Every change shows on the operators page and wherever a page states
 * what the operator is, writes its committed save file first and appends one
 * audit row.
 */
import fs from 'fs';
import path from 'path';
import Handlebars from 'handlebars';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertFreestyleTrickModifier, createTestSessionJwt } from '../fixtures/factories';
import { seedStagedOperators, stagedOperator } from '../fixtures/stagedOperators';
import { STAGED_OPERATORS } from '../../freestyle/inputs/curator_content/freestyleOperators';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4399');

let createApp: Awaited<ReturnType<typeof importApp>>;
let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000000o1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000000o2';
const PERSONA_ADMIN_ID = 'member_persona_fsm_operator';

const cookieFor = (memberId: string, role: 'admin' | 'member') =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
const admin = () => cookieFor(ADMIN_ID, 'admin');

interface OperatorRow {
  name: string; kind: string; definition: string; decomposition: string | null;
  worked_examples_json: string; confirmation_pending: number; page_group: string | null;
  page_order: number | null; version: number; updated_by: string;
}
function query<T>(sql: string, ...params: unknown[]): T | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try { return db.prepare(sql).get(...params) as T | undefined; } finally { db.close(); }
}
const operatorRow = (slug: string) => query<OperatorRow>(
  `SELECT name, kind, definition, decomposition, worked_examples_json, confirmation_pending,
          page_group, page_order, version, updated_by FROM freestyle_operators WHERE slug = ?`, slug);
const operatorCount = () => query<{ n: number }>('SELECT COUNT(*) AS n FROM freestyle_operators')!.n;
const audits = (slug: string, action: string) => query<{ n: number }>(
  "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_type = 'freestyle_operator' AND entity_id = ? AND action_type = ?",
  slug, action)!.n;
// The changed fields on an operator's one audit row of this action; a caller first
// asserts there is exactly one, so no ordering decides which row is read.
const onlyAuditFields = (slug: string, action: string): string[] => {
  const row = query<{ metadata_json: string }>(
    "SELECT metadata_json FROM audit_entries WHERE entity_type = 'freestyle_operator' AND entity_id = ? AND action_type = ?",
    slug, action);
  return row ? (JSON.parse(row.metadata_json) as { changedFields: string[] }).changedFields : [];
};
const saveFile = (slug: string) => path.join(process.env.CURATOR_SAVES_DIR!, 'operators', `${slug}.json`);

/** The edit form exactly as it renders for a staged operator. */
function formOf(slug: string, overrides: Record<string, string> = {}): Record<string, string> {
  const o = stagedOperator(slug);
  return {
    name:              o.name,
    kind:              o.kind,
    definition:        o.definition,
    decomposition:     o.decomposition ?? '',
    decompositionNote: o.decompositionNote ?? '',
    workedExamples:    o.workedExamples.join('\n'),
    sourceNote:        o.sourceNote ?? '',
    ...(o.confirmationPending ? { confirmationPending: '1' } : {}),
    pageGroup:         o.pageGroup ?? '',
    pageOrder:         o.pageOrder === null ? '' : String(o.pageOrder),
    ...overrides,
  };
}

/** An add form for a new operator, as a curator fills it in. */
function newForm(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    slug: 'zz_new_op', name: 'Zz New Op', kind: 'body', definition: 'A test operator added in the editor.',
    decomposition: '', decompositionNote: '', workedExamples: 'Zz Example One\nZz Example Two',
    sourceNote: '', pageGroup: 'body-rotation', pageOrder: '40',
    ...overrides,
  };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fso_admin', display_name: 'FSO Admin', login_email: 'fso-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fso_member', display_name: 'FSO Member', login_email: 'fso-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fso_persona', display_name: 'FSO Persona', login_email: 'fso-persona@example.com', is_admin: 1 });
  seedStagedOperators(db);
  // The registry rows the core operators describe, so their modifier pages resolve.
  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'paradox', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', modifier_type: 'body' });
  db.close();
  createApp = await importApp();
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
});

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());
afterAll(() => cleanupTestDb(dbPath));

const app = async () => createApp();
const postEdit = async (slug: string, body: Record<string, string>, cookie = admin()) =>
  request(await app()).post(`/admin/freestyle/operators/${slug}/edit`).set('Cookie', cookie).type('form').send(body);
const postNew = async (body: Record<string, string>, cookie = admin()) =>
  request(await app()).post('/admin/freestyle/operators').set('Cookie', cookie).type('form').send(body);
const get = async (url: string, cookie?: string) => {
  const r = request(await app()).get(url);
  return cookie ? r.set('Cookie', cookie) : r;
};

describe('access', () => {
  // Defect caught: the editor opens to a visitor or a member, or a test persona
  // rewrites the committed operator inputs.
  it('sends a visitor to log in, refuses a member and a test persona, and changes nothing', async () => {
    expect((await get('/admin/freestyle/operators')).status).toBe(302);
    expect((await get('/admin/freestyle/operators', cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
    const before = operatorRow('gyro');
    for (const cookie of [cookieFor(MEMBER_ID, 'member'), cookieFor(PERSONA_ADMIN_ID, 'admin')]) {
      expect((await postEdit('gyro', formOf('gyro', { name: 'Gyro Changed' }), cookie)).status).toBe(403);
      expect((await postNew(newForm({ slug: 'zz_refused' }), cookie)).status).toBe(403);
    }
    expect(operatorRow('gyro')).toEqual(before);
    expect(operatorRow('zz_refused')).toBeUndefined();
    expect(fs.existsSync(saveFile('gyro'))).toBe(false);
  });

  // Defect caught: an unknown operator answers with a form that would create it.
  it('answers 404 for an unknown operator on both verbs', async () => {
    expect((await get('/admin/freestyle/operators/no_such_op/edit', admin())).status).toBe(404);
    expect((await postEdit('no_such_op', formOf('gyro'))).status).toBe(404);
    expect(operatorRow('no_such_op')).toBeUndefined();
  });

  // Defect caught: the list omits operators, or links an edit or add form that
  // does not exist; the edit form offers the permanent slug.
  it('lists every operator with a link to its edit form, and links the add form', async () => {
    const res = await get('/admin/freestyle/operators', admin());
    expect(res.status).toBe(200);
    for (const o of STAGED_OPERATORS) expect(res.text, o.slug).toContain(`href="/admin/freestyle/operators/${o.slug}/edit"`);
    expect(res.text).toContain('href="/admin/freestyle/operators/new"');
    const form = await get('/admin/freestyle/operators/new', admin());
    expect(form.text).toContain('action="/admin/freestyle/operators"');
    expect(form.text).toContain('name="slug"');
    const edit = await get('/admin/freestyle/operators/double/edit', admin());
    expect(edit.text).toContain('action="/admin/freestyle/operators/double/edit"');
    expect(edit.text).not.toContain('name="slug"');
    // The stored kind and the pending flag come back selected and checked.
    expect(edit.text).toMatch(/<option value="quantifier" selected>/);
    expect(edit.text).toMatch(/name="confirmationPending" value="1" checked/);
  });
});

describe('adding an operator', () => {
  // Defect caught: an added operator reaches only the database and is lost at the
  // next rebuild, or does not show on the operators page until a deployment.
  it('adds the operator, writes its save file, audits it, and lists it on the operators page at once', async () => {
    const before = operatorCount();
    const res = await postNew(newForm());
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/operators/zz_new_op/edit');
    expect(operatorCount()).toBe(before + 1);
    expect(operatorRow('zz_new_op')).toMatchObject({
      name: 'Zz New Op', kind: 'body', definition: 'A test operator added in the editor.',
      decomposition: null, confirmation_pending: 0, page_group: 'body-rotation', page_order: 40, version: 1,
    });
    expect(JSON.parse(operatorRow('zz_new_op')!.worked_examples_json)).toEqual(['Zz Example One', 'Zz Example Two']);
    const saved = JSON.parse(fs.readFileSync(saveFile('zz_new_op'), 'utf8'));
    expect(saved).toEqual({
      slug: 'zz_new_op', name: 'Zz New Op', kind: 'body', definition: 'A test operator added in the editor.',
      decomposition: null, decomposition_note: null, worked_examples: ['Zz Example One', 'Zz Example Two'],
      source_note: null, confirmation_pending: false, page_group: 'body-rotation', page_order: 40,
    });
    expect(JSON.stringify(saved)).not.toContain(ADMIN_ID);
    expect(audits('zz_new_op', 'freestyle.operator.created')).toBe(1);
    expect(onlyAuditFields('zz_new_op', 'freestyle.operator.created')).toHaveLength(10);

    // Listed on the operators page after the three body-rotation operators placed
    // before it, with its definition, and its own page resolves.
    const page = (await get('/freestyle/operators')).text;
    const at = page.indexOf('/freestyle/modifier/zz_new_op');
    expect(at).toBeGreaterThan(page.indexOf('/freestyle/modifier/inspinning'));
    expect(page).toContain('A test operator added in the editor.');
    expect((await get('/freestyle/modifier/zz_new_op')).status).toBe(200);
  });

  // Defect caught: an operator outside any group is listed anyway.
  it('lists an operator in no group nowhere on the operators page', async () => {
    expect((await postNew(newForm({ slug: 'zz_unlisted', name: 'Zz Unlisted', pageGroup: '', pageOrder: '' }))).status).toBe(303);
    expect(operatorRow('zz_unlisted')).toMatchObject({ page_group: null, page_order: null });
    expect((await get('/freestyle/operators')).text).not.toContain('/freestyle/modifier/zz_unlisted"');
  });

  it.each([
    // Defect caught: a slug that cannot be a page address.
    ['a slug with a hyphen', { slug: 'zz-bad' }],
    ['a slug with a capital', { slug: 'ZzBad' }],
    ['an empty slug', { slug: '' }],
    // Defect caught: a second operator under an existing slug overwrites it.
    ['an existing slug', { slug: 'gyro' }],
    // Defect caught: an operator with nothing to say what it is.
    ['an empty name', { slug: 'zz_no_name', name: '' }],
    ['an empty definition', { slug: 'zz_no_def', definition: '' }],
    // Defect caught: an operator filed under a kind or group no page knows.
    ['an unknown kind', { slug: 'zz_bad_kind', kind: 'no-such-kind' }],
    ['an unknown group', { slug: 'zz_bad_group', pageGroup: 'no-such-group' }],
    // Defect caught: a group with no position, or a position with no group.
    ['a group with no position', { slug: 'zz_no_order', pageOrder: '' }],
    ['a position with no group', { slug: 'zz_no_group', pageGroup: '' }],
    ['a position that is not a whole number', { slug: 'zz_bad_order', pageOrder: 'first' }],
  ] as Array<[string, Record<string, string>]>)('refuses %s, writing nothing', async (_label, overrides) => {
    const before = operatorCount();
    const gyro = operatorRow('gyro');
    const res = await postNew(newForm(overrides));
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    expect(res.text).toContain('action="/admin/freestyle/operators"');
    if (overrides.slug) expect(res.text).toContain(`value="${overrides.slug}"`);
    expect(operatorCount()).toBe(before);
    expect(operatorRow('gyro')).toEqual(gyro);
    if (overrides.slug && overrides.slug !== 'gyro') expect(fs.existsSync(saveFile(overrides.slug))).toBe(false);
  });

  // Defect caught: a refused add offers no way forward; the one correction a
  // curator would make saves.
  it('adds the refused operator once the one bad field is corrected', async () => {
    expect((await postNew(newForm({ slug: 'zz_fixed', pageOrder: '' }))).status).toBe(422);
    expect((await postNew(newForm({ slug: 'zz_fixed', pageOrder: '50' }))).status).toBe(303);
    expect(operatorRow('zz_fixed')).toMatchObject({ page_order: 50 });
  });
});

describe('editing an operator', () => {
  // Defect caught: an edit reaches only the database, so the next rebuild loses
  // it; the audit row names the wrong fields; or the change never reaches the
  // pages that state what the operator is.
  it('saves a core operator\'s definition, writes the save file, audits it once, and shows it where the operator is defined', async () => {
    const before = operatorRow('paradox')!;
    const edited = 'Paradox is an edited test definition: the body switches sides around one dex.';
    const res = await postEdit('paradox', formOf('paradox', { definition: edited }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/operators/paradox/edit');
    expect(operatorRow('paradox')).toMatchObject({ definition: edited, version: before.version + 1, updated_by: ADMIN_ID });
    expect(JSON.parse(fs.readFileSync(saveFile('paradox'), 'utf8'))).toMatchObject({ slug: 'paradox', definition: edited });
    expect(audits('paradox', 'freestyle.operator.updated')).toBe(1);
    expect(onlyAuditFields('paradox', 'freestyle.operator.updated')).toEqual(['definition']);

    const escaped = Handlebars.escapeExpression(edited);
    expect((await get('/freestyle/operators')).text).toContain(escaped);
    expect((await get('/freestyle/modifier/paradox')).text).toContain(escaped);
  });

  // Defect caught: a reference entry's decomposition and worked examples edited in
  // the app never reach the operator's own page.
  it('shows an edited decomposition and worked examples on the operator\'s page', async () => {
    const res = await postEdit('double', formOf('double', {
      decomposition: 'zz edited decomposition', workedExamples: 'Zz Edited Example',
    }));
    expect(res.status).toBe(303);
    const page = (await get('/freestyle/modifier/double')).text;
    expect(page).toContain('zz edited decomposition');
    expect(page).toContain('Zz Edited Example');
  });

  // Defect caught: taking an operator out of its group leaves it listed.
  it('takes an operator off the operators page when it leaves its group', async () => {
    expect((await get('/freestyle/operators')).text).toContain('/freestyle/modifier/spinning"');
    expect((await postEdit('spinning', formOf('spinning', { pageGroup: '', pageOrder: '' }))).status).toBe(303);
    expect((await get('/freestyle/operators')).text).not.toContain('/freestyle/modifier/spinning"');
  });

  // Defect caught: a resubmit of the form as rendered writes a second audit row
  // or bumps the version for nothing.
  it('writes nothing for an unchanged submit', async () => {
    expect((await get('/admin/freestyle/operators/whirling/edit', admin())).status).toBe(200);
    const before = operatorRow('whirling');
    expect((await postEdit('whirling', formOf('whirling'))).status).toBe(303);
    expect(operatorRow('whirling')).toEqual(before);
    expect(audits('whirling', 'freestyle.operator.updated')).toBe(0);
    expect(fs.existsSync(saveFile('whirling'))).toBe(false);
  });

  // Defect caught: an edit posted with a slug field renames or duplicates the operator.
  it('ignores a slug posted with an edit', async () => {
    const before = operatorCount();
    expect((await postEdit('muted', formOf('muted', { slug: 'zz_renamed', name: 'Muted Edited' }))).status).toBe(303);
    expect(operatorRow('muted')).toMatchObject({ name: 'Muted Edited' });
    expect(operatorRow('zz_renamed')).toBeUndefined();
    expect(operatorCount()).toBe(before);
  });

  it.each([
    ['an empty definition', { definition: '' }],
    ['an unknown kind', { kind: 'no-such-kind' }],
    ['a group with no position', { pageGroup: 'body-rotation', pageOrder: '' }],
  ] as Array<[string, Record<string, string>]>)('refuses %s, writing nothing', async (_label, overrides) => {
    const before = operatorRow('nuclear');
    const res = await postEdit('nuclear', formOf('nuclear', overrides));
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    expect(res.text).toContain('action="/admin/freestyle/operators/nuclear/edit"');
    expect(operatorRow('nuclear')).toEqual(before);
    expect(audits('nuclear', 'freestyle.operator.updated')).toBe(0);
  });

  // Defect caught: a save whose file cannot be written reaches the database only
  // and is lost at the next rebuild.
  it('refuses the save when its save file cannot be written', async () => {
    adapterModule.setCuratedAuthoringAdapterForTests({
      ...adapterModule.createDatabaseOnlyCuratedAuthoringAdapter(),
      saveItem() { throw new Error('disk full'); },
    });
    expectLoggedError(/unhandled error/);
    const before = operatorRow('quantum');
    const res = await postEdit('quantum', formOf('quantum', { name: 'Unsaved' }));
    expect(res.status).toBe(503);
    expect(operatorRow('quantum')).toEqual(before);
  });
});
