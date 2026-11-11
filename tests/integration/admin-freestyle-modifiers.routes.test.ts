/**
 * The admin modifier registry: GET and POST /admin/freestyle/modifiers, GET and
 * POST /admin/freestyle/modifiers/:slug/edit.
 *
 * An admin creates a freestyle modifier and edits one. A new slug may not be a
 * modifier, trick or alias slug, nor a word notation already reads as something
 * else. A change to a modifier's ADD saves only from a confirm page that lists
 * every linked trick whose stored ADD would stop matching its computed ADD, and
 * never rewrites a trick's own ADD. Each save writes its committed save file
 * first, refuses when that file cannot be written, and appends one audit row.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  createTestSessionJwt,
} from '../fixtures/factories';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4395');

let createApp: Awaited<ReturnType<typeof importApp>>;
let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000000m1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000000m2';
const PERSONA_ADMIN_ID = 'member_persona_fsm_mod';

const cookieFor = (memberId: string, role: 'admin' | 'member') =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
const admin = () => cookieFor(ADMIN_ID, 'admin');

function createBody(overrides: Record<string, string> = {}): Record<string, string> {
  return { slug: 'new_mod', modifierName: 'New Mod', addBonus: '1', modifierType: 'body', notes: '', ...overrides };
}

function query<T>(sql: string, ...params: unknown[]): T | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try { return db.prepare(sql).get(...params) as T | undefined; } finally { db.close(); }
}
const modifier = (slug: string) => query<{ add_bonus: number; add_bonus_rotational: number; modifier_name: string; notes: string | null }>(
  'SELECT add_bonus, add_bonus_rotational, modifier_name, notes FROM freestyle_trick_modifiers WHERE slug = ?', slug);
const audits = (slug: string, action: string) => query<{ n: number }>(
  "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_type = 'freestyle_modifier' AND entity_id = ? AND action_type = ?",
  slug, action)!.n;
const saveFile = (slug: string) => path.join(process.env.CURATOR_SAVES_DIR!, 'modifiers', `${slug}.json`);

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fsm_admin', display_name: 'FSM Admin', login_email: 'fsm-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fsm_member', display_name: 'FSM Member', login_email: 'fsm-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fsm_persona', display_name: 'FSM Persona', login_email: 'fsm-persona@example.com', is_admin: 1 });

  // whirl (3) plus the edited modifier (1) makes 4, matching wb_match's stored ADD;
  // wb_mismatch already disagrees, so an ADD change does not put it out of step.
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex' });
  insertFreestyleTrickModifier(db, { slug: 'edited_mod', modifier_name: 'Edited Mod', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrick(db, { slug: 'wb_match', canonical_name: 'wb match', adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'wb_mismatch', canonical_name: 'wb mismatch', adds: '7', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrickModifierLink(db, 'wb_match', 'edited_mod');
  insertFreestyleTrickModifierLink(db, 'wb_mismatch', 'edited_mod');
  insertFreestyleTrickAlias(db, 'taken_alias', 'whirl');
  db.close();
  createApp = await importApp();
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
});

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());
afterAll(() => cleanupTestDb(dbPath));

const app = async () => createApp();

describe('POST /admin/freestyle/modifiers (create)', () => {
  // Defect caught: a created modifier reaches only the database, so the next
  // rebuild loses it, or carries a rotational bonus that disagrees with its ADD.
  it('creates the modifier, writes its save file and audits it once', async () => {
    const res = await request(await app()).post('/admin/freestyle/modifiers').set('Cookie', admin())
      .type('form').send(createBody({ slug: 'created_mod', addBonus: '2' }));
    expect(res.status).toBe(303);
    expect(modifier('created_mod')).toMatchObject({ add_bonus: 2, add_bonus_rotational: 2 });
    expect(JSON.parse(fs.readFileSync(saveFile('created_mod'), 'utf8'))).toMatchObject({ slug: 'created_mod', add_bonus: 2 });
    expect(audits('created_mod', 'freestyle.modifier.created')).toBe(1);
  });

  // Defect caught: a new modifier takes a slug that already names a trick, an
  // alias or a modifier, or a word notation always reads as something else, so
  // pages resolve it to the wrong thing or never show it as a modifier.
  it.each([
    ['a trick slug', 'whirl'],
    ['an alias slug', 'taken_alias'],
    ['an existing modifier', 'edited_mod'],
    ['a fixed notation word', 'toe'],
  ])('refuses %s as the slug, creating nothing', async (_label, slug) => {
    const before = modifier(slug);
    const res = await request(await app()).post('/admin/freestyle/modifiers').set('Cookie', admin())
      .type('form').send(createBody({ slug }));
    expect(res.status).toBe(422);
    expect(modifier(slug)).toEqual(before);
    expect(audits(slug, 'freestyle.modifier.created')).toBe(0);
  });

  // Defect caught: an ADD that is not a whole number, or a type the registry does
  // not carry, is saved and breaks every computed ADD that reads it.
  it.each([
    ['a fractional ADD', { slug: 'frac_mod', addBonus: '1.5' }],
    ['an unknown type', { slug: 'type_mod', modifierType: 'flying' }],
  ])('refuses %s, keeping what was typed', async (_label, overrides) => {
    const res = await request(await app()).post('/admin/freestyle/modifiers').set('Cookie', admin())
      .type('form').send(createBody(overrides));
    expect(res.status).toBe(422);
    expect(res.text).toContain(`value="${overrides.slug}"`);
    expect(modifier(overrides.slug)).toBeUndefined();
  });

  // Defect caught: a test persona rewrites the committed modifier inputs.
  it('refuses a test persona and a non-admin member', async () => {
    const persona = await request(await app()).post('/admin/freestyle/modifiers')
      .set('Cookie', cookieFor(PERSONA_ADMIN_ID, 'admin')).type('form').send(createBody({ slug: 'persona_mod' }));
    expect(persona.status).toBe(403);
    const member = await request(await app()).post('/admin/freestyle/modifiers')
      .set('Cookie', cookieFor(MEMBER_ID, 'member')).type('form').send(createBody({ slug: 'member_mod' }));
    expect(member.status).toBe(403);
    expect(modifier('persona_mod')).toBeUndefined();
    expect(modifier('member_mod')).toBeUndefined();
  });

  // Defect caught: a save whose file cannot be written reaches the database
  // only and is lost at the next rebuild.
  it('refuses the create when its save file cannot be written', async () => {
    adapterModule.setCuratedAuthoringAdapterForTests({
      ...adapterModule.createDatabaseOnlyCuratedAuthoringAdapter(),
      saveItem() { throw new Error('disk full'); },
    });
    expectLoggedError(/unhandled error/);
    const res = await request(await app()).post('/admin/freestyle/modifiers').set('Cookie', admin())
      .type('form').send(createBody({ slug: 'unsaved_mod' }));
    expect(res.status).toBe(503);
    expect(modifier('unsaved_mod')).toBeUndefined();
  });
});

describe('POST /admin/freestyle/modifiers/:slug/edit', () => {
  const edit = async (body: Record<string, string>) => request(await app())
    .post('/admin/freestyle/modifiers/edited_mod/edit').set('Cookie', admin()).type('form').send(body);
  const fields = (overrides: Record<string, string> = {}) =>
    ({ modifierName: 'Edited Mod', addBonus: '1', modifierType: 'body', notes: '', ...overrides });

  // Defect caught: an ADD change saves on the first submit, so a curator never
  // sees which tricks it puts out of step, or the preview writes the change.
  it('shows the confirm page for an ADD change, listing only the trick it puts out of step, and saves nothing', async () => {
    const res = await edit(fields({ addBonus: '2' }));
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/admin/freestyle/tricks/wb_match/edit"');
    expect(res.text).not.toContain('/admin/freestyle/tricks/wb_mismatch/edit');
    expect(res.text).toContain('name="confirm" value="1"');
    expect(modifier('edited_mod')!.add_bonus).toBe(1);
    expect(audits('edited_mod', 'freestyle.modifier.updated')).toBe(0);
  });

  // Defect caught: a confirmed ADD change rewrites a trick's own stored ADD, or
  // leaves the rotational bonus behind.
  it('saves a confirmed ADD change without touching any trick\'s stored ADD', async () => {
    const res = await edit({ ...fields({ addBonus: '2' }), confirm: '1' });
    expect(res.status).toBe(303);
    expect(modifier('edited_mod')).toMatchObject({ add_bonus: 2, add_bonus_rotational: 2 });
    expect(query<{ adds: string }>('SELECT adds FROM freestyle_tricks WHERE slug = ?', 'wb_match')!.adds).toBe('4');
    expect(audits('edited_mod', 'freestyle.modifier.updated')).toBe(1);
  });

  // Defect caught: a change that leaves the ADD alone is held behind the confirm
  // page, so a name or notes fix needs a pointless second step.
  it('saves a change that leaves the ADD alone on the first submit', async () => {
    const res = await edit(fields({ addBonus: '2', notes: 'A curator note.' }));
    expect(res.status).toBe(303);
    expect(modifier('edited_mod')!.notes).toBe('A curator note.');
  });

  // Defect caught: a beginner note or gloss edit reaching the database only, so the
  // next rebuild puts the seeded text back, or the audit row not naming it.
  it('saves the beginner note and composition gloss to the row, its save file and the audit row', async () => {
    const res = await edit(fields({
      addBonus: '2', notes: 'A curator note.', beginnerNote: 'A beginner note.', compositionGloss: 'A gloss.',
    }));
    expect(res.status).toBe(303);
    expect(query<{ beginner_note: string; composition_gloss: string }>(
      'SELECT beginner_note, composition_gloss FROM freestyle_trick_modifiers WHERE slug = ?', 'edited_mod',
    )).toEqual({ beginner_note: 'A beginner note.', composition_gloss: 'A gloss.' });
    expect(JSON.parse(fs.readFileSync(saveFile('edited_mod'), 'utf8')))
      .toMatchObject({ beginner_note: 'A beginner note.', composition_gloss: 'A gloss.' });
    const latest = query<{ metadata_json: string }>(
      "SELECT metadata_json FROM audit_entries WHERE entity_id = 'edited_mod' AND action_type = 'freestyle.modifier.updated' ORDER BY rowid DESC LIMIT 1")!;
    expect(JSON.parse(latest.metadata_json).changedFields).toEqual(['beginner_note', 'composition_gloss']);
    // The edit form shows the saved values back.
    const page = await request(await app()).get('/admin/freestyle/modifiers/edited_mod/edit').set('Cookie', admin());
    expect(page.text).toContain('name="beginnerNote" value="A beginner note."');
    expect(page.text).toContain('name="compositionGloss" value="A gloss."');
  });

  // Defect caught: confirming an ADD change drops the notes submitted with it.
  it('carries the notes through the ADD confirm page', async () => {
    const res = await edit(fields({ addBonus: '3', beginnerNote: 'Kept through confirm.', compositionGloss: 'A gloss.' }));
    expect(res.status).toBe(200);
    expect(res.text).toContain('name="beginnerNote" value="Kept through confirm."');
    expect(res.text).toContain('name="compositionGloss" value="A gloss."');
  });

  // Defect caught: a paragraph pasted into a one-line note breaks the trick page
  // layout, or the limit refuses a note of the allowed length.
  it('accepts a beginner note at the length limit and refuses one past it', async () => {
    const atLimit = await edit(fields({ addBonus: '2', notes: 'A curator note.', beginnerNote: 'n'.repeat(400) }));
    expect(atLimit.status).toBe(303);
    const past = await edit(fields({ addBonus: '2', notes: 'A curator note.', beginnerNote: 'n'.repeat(401) }));
    expect(past.status).toBe(422);
    expect(query<{ beginner_note: string }>(
      'SELECT beginner_note FROM freestyle_trick_modifiers WHERE slug = ?', 'edited_mod')!.beginner_note).toHaveLength(400);
  });

  // Defect caught: an unknown modifier renders an empty form or a server error.
  it('returns 404 for an unknown modifier', async () => {
    const get = await request(await app()).get('/admin/freestyle/modifiers/no_such_mod/edit').set('Cookie', admin());
    expect(get.status).toBe(404);
    const post = await request(await app()).post('/admin/freestyle/modifiers/no_such_mod/edit')
      .set('Cookie', admin()).type('form').send(fields());
    expect(post.status).toBe(404);
  });
});

describe('the trick editor', () => {
  // Defect caught: the trick editor lets a modifier row's own ADD be changed,
  // so the dictionary row and the registry disagree.
  it('still refuses to change a modifier row\'s own ADD', async () => {
    const db = new BetterSqlite3(dbPath);
    insertFreestyleTrick(db, { slug: 'modrow', canonical_name: 'modrow', adds: 'modifier', category: 'modifier' });
    db.close();
    const res = await request(await app()).post('/admin/freestyle/tricks/modrow/edit').set('Cookie', admin())
      .type('form').send({ canonicalName: 'modrow', adds: '3', category: 'modifier', reviewStatus: 'curated' });
    expect(res.status).toBe(422);
    expect(query<{ adds: string }>('SELECT adds FROM freestyle_tricks WHERE slug = ?', 'modrow')!.adds).toBe('modifier');
  });
});
