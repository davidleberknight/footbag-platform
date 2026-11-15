/**
 * The admin glossary editor: GET /admin/freestyle/glossary, GET
 * /admin/freestyle/glossary/new, POST /admin/freestyle/glossary, GET and POST
 * /admin/freestyle/glossary/:slug/edit, GET and POST
 * /admin/freestyle/glossary/:slug/remove.
 *
 * An admin adds an A to Z glossary term, edits one (its term, definition, aliases
 * and deeper link with its label) and removes one behind a confirm page. The slug
 * is never edited. Every change shows on the public glossary on the next read,
 * writes its committed save file first and appends one audit row.
 */
import fs from 'fs';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { seedStagedGlossary, stagedGlossaryTerm } from '../fixtures/stagedGlossary';
import { STAGED_GLOSSARY_TERMS } from '../../freestyle/inputs/curator_content/freestyleGlossaryTerms';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4398');

let createApp: Awaited<ReturnType<typeof importApp>>;
let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000000f1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000000f2';
const PERSONA_ADMIN_ID = 'member_persona_fsm_glossary';

const cookieFor = (memberId: string, role: 'admin' | 'member') =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
const admin = () => cookieFor(ADMIN_ID, 'admin');

interface TermRow {
  term: string; definition: string; aliases_json: string; more_href: string | null;
  more_label: string | null; version: number; updated_by: string;
}
function query<T>(sql: string, ...params: unknown[]): T | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try { return db.prepare(sql).get(...params) as T | undefined; } finally { db.close(); }
}
const termRow = (slug: string) => query<TermRow>(
  'SELECT term, definition, aliases_json, more_href, more_label, version, updated_by FROM freestyle_glossary_terms WHERE slug = ?',
  slug);
const termCount = () => query<{ n: number }>('SELECT COUNT(*) AS n FROM freestyle_glossary_terms')!.n;
const audits = (slug: string, action: string) => query<{ n: number }>(
  "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_type = 'freestyle_glossary_term' AND entity_id = ? AND action_type = ?",
  slug, action)!.n;
// The changed fields on a term's one audit row of this action; a caller first
// asserts there is exactly one, so no ordering decides which row is read.
const onlyAuditFields = (slug: string, action: string): string[] => {
  const row = query<{ metadata_json: string }>(
    "SELECT metadata_json FROM audit_entries WHERE entity_type = 'freestyle_glossary_term' AND entity_id = ? AND action_type = ?",
    slug, action);
  return row ? (JSON.parse(row.metadata_json) as { changedFields: string[] }).changedFields : [];
};
const saveFile = (slug: string) => path.join(process.env.CURATOR_SAVES_DIR!, 'glossary_terms', `${slug}.json`);

/** The edit form exactly as it renders for a staged term. */
function formOf(slug: string, overrides: Record<string, string> = {}): Record<string, string> {
  const t = stagedGlossaryTerm(slug);
  return {
    term:       t.term,
    definition: t.definition,
    aliases:    (t.aliases ?? []).join('\n'),
    moreHref:   t.moreHref ?? '',
    moreLabel:  t.moreLabel ?? '',
    ...overrides,
  };
}

/** An add form for a new term, as a curator fills it in. Its aliases are its own,
 *  so a case is refused only for the field it changes, never because an earlier
 *  case's term already claimed the same alias. */
function newForm(overrides: Record<string, string> = {}): Record<string, string> {
  const slug = overrides.slug ?? 'zz-new-term';
  return {
    slug, term: 'Zz New Term', definition: 'A test term added in the editor.',
    aliases: `${slug} one\n${slug} two`, moreHref: '/freestyle/concepts#section-surfaces', moreLabel: 'Contact Surfaces',
    ...overrides,
  };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fsg_admin', display_name: 'FSG Admin', login_email: 'fsg-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fsg_member', display_name: 'FSG Member', login_email: 'fsg-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fsg_persona', display_name: 'FSG Persona', login_email: 'fsg-persona@example.com', is_admin: 1 });
  seedStagedGlossary(db);
  db.close();
  createApp = await importApp();
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
});

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());
afterAll(() => cleanupTestDb(dbPath));

const app = async () => createApp();
const postEdit = async (slug: string, body: Record<string, string>, cookie = admin()) =>
  request(await app()).post(`/admin/freestyle/glossary/${slug}/edit`).set('Cookie', cookie).type('form').send(body);
const postNew = async (body: Record<string, string>, cookie = admin()) =>
  request(await app()).post('/admin/freestyle/glossary').set('Cookie', cookie).type('form').send(body);
const postRemove = async (slug: string, cookie = admin()) =>
  request(await app()).post(`/admin/freestyle/glossary/${slug}/remove`).set('Cookie', cookie).type('form').send({});
const get = async (url: string, cookie?: string) => {
  const r = request(await app()).get(url);
  return cookie ? r.set('Cookie', cookie) : r;
};

describe('access', () => {
  // Defect caught: the editor opens to a visitor or a member, or a test persona
  // rewrites or removes the committed glossary.
  it('sends a visitor to log in, refuses a member and a test persona, and changes nothing', async () => {
    expect((await get('/admin/freestyle/glossary')).status).toBe(302);
    expect((await get('/admin/freestyle/glossary', cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
    const before = termRow('fill');
    const count = termCount();
    for (const cookie of [cookieFor(MEMBER_ID, 'member'), cookieFor(PERSONA_ADMIN_ID, 'admin')]) {
      expect((await postEdit('fill', formOf('fill', { definition: 'Changed.' }), cookie)).status).toBe(403);
      expect((await postNew(newForm({ slug: 'zz-refused' }), cookie)).status).toBe(403);
      expect((await postRemove('fill', cookie)).status).toBe(403);
    }
    expect(termRow('fill')).toEqual(before);
    expect(termCount()).toBe(count);
    expect(fs.existsSync(saveFile('fill'))).toBe(false);
  });

  // Defect caught: an unknown term answers with a form that would create it, or a
  // removal of nothing reports success.
  it('answers 404 for an unknown term on every verb', async () => {
    expect((await get('/admin/freestyle/glossary/no-such-term/edit', admin())).status).toBe(404);
    expect((await postEdit('no-such-term', formOf('fill'))).status).toBe(404);
    expect((await get('/admin/freestyle/glossary/no-such-term/remove', admin())).status).toBe(404);
    expect((await postRemove('no-such-term')).status).toBe(404);
    expect(termRow('no-such-term')).toBeUndefined();
  });

  // Defect caught: the list omits terms, or links an edit or add form that does
  // not exist; the edit form offers the permanent slug.
  it('lists every term with a link to its edit form, and links the add form', async () => {
    const res = await get('/admin/freestyle/glossary', admin());
    expect(res.status).toBe(200);
    for (const t of STAGED_GLOSSARY_TERMS) {
      expect(res.text, t.slug).toContain(`href="/admin/freestyle/glossary/${t.slug}/edit"`);
    }
    expect(res.text).toContain('href="/admin/freestyle/glossary/new"');
    const form = await get('/admin/freestyle/glossary/new', admin());
    expect(form.status).toBe(200);
    expect(form.text).toContain('action="/admin/freestyle/glossary"');
    expect(form.text).toContain('name="slug"');
    const edit = await get('/admin/freestyle/glossary/fill/edit', admin());
    expect(edit.text).toContain('action="/admin/freestyle/glossary/fill/edit"');
    expect(edit.text).not.toContain('name="slug"');
    expect(edit.text).toContain('href="/admin/freestyle/glossary/fill/remove"');
  });
});

describe('adding a term', () => {
  // Defect caught: an added term reaches only the database and is lost at the
  // next rebuild, or does not show on the public glossary until a deployment.
  it('adds the term, writes its save file, audits it, and shows it on the glossary at once', async () => {
    const before = termCount();
    const res = await postNew(newForm());
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/glossary/zz-new-term/edit');
    expect(termCount()).toBe(before + 1);
    expect(termRow('zz-new-term')).toMatchObject({
      term: 'Zz New Term', definition: 'A test term added in the editor.',
      more_href: '/freestyle/concepts#section-surfaces', more_label: 'Contact Surfaces', version: 1,
    });
    expect(JSON.parse(termRow('zz-new-term')!.aliases_json)).toEqual(['zz-new-term one', 'zz-new-term two']);
    const saved = JSON.parse(fs.readFileSync(saveFile('zz-new-term'), 'utf8'));
    expect(saved).toEqual({
      slug: 'zz-new-term', term: 'Zz New Term', definition: 'A test term added in the editor.',
      aliases: ['zz-new-term one', 'zz-new-term two'], more_href: '/freestyle/concepts#section-surfaces', more_label: 'Contact Surfaces',
    });
    expect(JSON.stringify(saved)).not.toContain(ADMIN_ID);
    expect(audits('zz-new-term', 'freestyle.glossary_term.created')).toBe(1);
    expect(onlyAuditFields('zz-new-term', 'freestyle.glossary_term.created').sort()).toEqual(
      ['aliases', 'definition', 'more_href', 'more_label', 'term']);

    const page = await get('/freestyle/glossary');
    const at = page.text.indexOf('id="term-zz-new-term"');
    expect(at).toBeGreaterThan(-1);
    const entry = page.text.slice(at, at + 600);
    expect(entry).toContain('Zz New Term');
    expect(entry).toContain('A test term added in the editor.');
    expect(entry).toContain('href="/freestyle/concepts#section-surfaces"');
    // Placed under its letter, after the letter heading for Z.
    expect(at).toBeGreaterThan(page.text.indexOf('id="letter-Z"'));
  });

  // Defect caught: a term with no deeper link stores an empty link the page
  // then draws as a link to nowhere.
  it('stores no link when both link fields are left empty', async () => {
    expect((await postNew(newForm({ slug: 'zz-no-link', term: 'Zz No Link', aliases: '', moreHref: '', moreLabel: '' }))).status).toBe(303);
    expect(termRow('zz-no-link')).toMatchObject({ more_href: null, more_label: null, aliases_json: '[]' });
  });

  it.each([
    // Defect caught: a slug that cannot be the entry's anchor.
    ['a slug with an underscore', { slug: 'zz_bad' }],
    ['a slug with a capital', { slug: 'ZzBad' }],
    ['an empty slug', { slug: '' }],
    // Defect caught: a second entry under an existing slug overwrites it.
    ['an existing slug', { slug: 'fill' }],
    // Defect caught: one word listed as two entries.
    ['an existing term in other capitals', { slug: 'zz-dup-term', term: stagedGlossaryTerm('fill').term.toUpperCase() }],
    ['an alias that is another entry\'s term', { slug: 'zz-alias-clash', aliases: stagedGlossaryTerm('trick').term }],
    // Defect caught: a link drawn with no label, or a label with no link.
    ['a link without its label', { slug: 'zz-no-label', moreLabel: '' }],
    ['a label without its link', { slug: 'zz-no-href', moreHref: '' }],
    // Defect caught: a deeper link that leaves the site.
    ['a link to another site', { slug: 'zz-external', moreHref: 'https://example.com/x' }],
    ['a protocol-relative link', { slug: 'zz-protocol', moreHref: '//example.com/x' }],
    // Defect caught: an entry with nothing to show.
    ['an empty term', { slug: 'zz-no-term', term: '' }],
    ['an empty definition', { slug: 'zz-no-def', definition: '' }],
  ] as Array<[string, Record<string, string>]>)('refuses %s, writing nothing', async (_label, overrides) => {
    const before = termCount();
    const fill = termRow('fill');
    const res = await postNew(newForm(overrides));
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    // The add form comes back with what was typed.
    expect(res.text).toContain('action="/admin/freestyle/glossary"');
    if (overrides.slug) expect(res.text).toContain(`value="${overrides.slug}"`);
    expect(termCount()).toBe(before);
    expect(termRow('fill')).toEqual(fill);
    if (overrides.slug && overrides.slug !== 'fill') expect(fs.existsSync(saveFile(overrides.slug))).toBe(false);
  });

  // Defect caught: a refused add offers no way forward; the one correction a
  // curator would make saves.
  it('adds the refused term once the one bad field is corrected', async () => {
    expect((await postNew(newForm({ slug: 'zz-fixed', term: 'Zz Fixed', moreHref: 'https://example.com' }))).status).toBe(422);
    expect((await postNew(newForm({ slug: 'zz-fixed', term: 'Zz Fixed', moreHref: '/freestyle/concepts' }))).status).toBe(303);
    expect(termRow('zz-fixed')).toMatchObject({ more_href: '/freestyle/concepts' });
  });
});

describe('editing a term', () => {
  // Defect caught: an edit reaches only the database, so the next rebuild loses
  // it; the audit row names the wrong fields; or the change never reaches the
  // public glossary.
  it('saves every edited field, writes the save file, audits it once and shows on the glossary', async () => {
    const before = termRow('mods')!;
    const res = await postEdit('mods', formOf('mods', {
      definition: 'Edited definition of mods.', aliases: 'shoe mods',
    }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/glossary/mods/edit');
    const row = termRow('mods')!;
    expect(row).toMatchObject({ definition: 'Edited definition of mods.', version: before.version + 1, updated_by: ADMIN_ID });
    expect(JSON.parse(row.aliases_json)).toEqual(['shoe mods']);
    expect(JSON.parse(fs.readFileSync(saveFile('mods'), 'utf8'))).toMatchObject({
      slug: 'mods', definition: 'Edited definition of mods.', aliases: ['shoe mods'],
    });
    expect(audits('mods', 'freestyle.glossary_term.updated')).toBe(1);
    expect(onlyAuditFields('mods', 'freestyle.glossary_term.updated').sort()).toEqual(['aliases', 'definition']);

    const page = await get('/freestyle/glossary');
    const at = page.text.indexOf('id="term-mods"');
    expect(page.text.slice(at, at + 600)).toContain('Edited definition of mods.');
  });

  // Defect caught: a resubmit of the form as rendered writes a second audit row
  // or bumps the version for nothing.
  it('writes nothing for an unchanged submit', async () => {
    expect((await get('/admin/freestyle/glossary/trick/edit', admin())).status).toBe(200);
    const before = termRow('trick');
    expect((await postEdit('trick', formOf('trick'))).status).toBe(303);
    expect(termRow('trick')).toEqual(before);
    expect(audits('trick', 'freestyle.glossary_term.updated')).toBe(0);
    expect(fs.existsSync(saveFile('trick'))).toBe(false);
  });

  // Defect caught: an edit posted with a slug field renames or duplicates the term.
  it('ignores a slug posted with an edit', async () => {
    const before = termCount();
    expect((await postEdit('broken-in', formOf('broken-in', { slug: 'zz-renamed', definition: 'Edited broken-in.' }))).status).toBe(303);
    expect(termRow('broken-in')).toMatchObject({ definition: 'Edited broken-in.' });
    expect(termRow('zz-renamed')).toBeUndefined();
    expect(termCount()).toBe(before);
  });

  it.each([
    ['an alias that is another entry\'s term', { aliases: stagedGlossaryTerm('trick').term }],
    ['a term another entry already uses', { term: stagedGlossaryTerm('trick').term }],
    ['a link to another site', { moreHref: 'https://example.com', moreLabel: 'Elsewhere' }],
    ['an empty definition', { definition: '' }],
  ] as Array<[string, Record<string, string>]>)('refuses %s, writing nothing', async (_label, overrides) => {
    const before = termRow('component');
    const res = await postEdit('component', formOf('component', overrides));
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    expect(res.text).toContain('action="/admin/freestyle/glossary/component/edit"');
    expect(termRow('component')).toEqual(before);
    expect(audits('component', 'freestyle.glossary_term.updated')).toBe(0);
  });

  // Defect caught: a save whose file cannot be written reaches the database only
  // and is lost at the next rebuild.
  it('refuses the save when its save file cannot be written', async () => {
    adapterModule.setCuratedAuthoringAdapterForTests({
      ...adapterModule.createDatabaseOnlyCuratedAuthoringAdapter(),
      saveItem() { throw new Error('disk full'); },
    });
    expectLoggedError(/unhandled error/);
    const before = termRow('contact');
    const res = await postEdit('contact', formOf('contact', { definition: 'Unsaved.' }));
    expect(res.status).toBe(503);
    expect(termRow('contact')).toEqual(before);
  });
});

describe('removing a term', () => {
  // Defect caught: the confirm page posts somewhere other than the removal, or
  // does not name the anchor that stops working.
  it('shows a confirm page that names the term and its anchor and posts the removal', async () => {
    const res = await get('/admin/freestyle/glossary/fill/remove', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/glossary#term-fill');
    expect(res.text).toContain('action="/admin/freestyle/glossary/fill/remove"');
    expect(res.text).toContain('class="notice notice-warn"');
    // The GET changes nothing.
    expect(termRow('fill')).toBeDefined();
  });

  // Defect caught: a removed term stays on the public glossary, comes back at the
  // next rebuild for want of a save file, or leaves no audit trail; a second
  // removal records a second removal.
  it('removes the term, records the removal in its save file, audits it once, and takes it off the glossary', async () => {
    expect((await get('/freestyle/glossary')).text).toContain('id="term-fill"');
    const before = termCount();
    const res = await postRemove('fill');
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/glossary');
    expect(termRow('fill')).toBeUndefined();
    expect(termCount()).toBe(before - 1);
    expect(JSON.parse(fs.readFileSync(saveFile('fill'), 'utf8'))).toEqual({ slug: 'fill', removed: true });
    expect(audits('fill', 'freestyle.glossary_term.removed')).toBe(1);
    expect((await get('/freestyle/glossary')).text).not.toContain('id="term-fill"');
    expect((await get('/admin/freestyle/glossary/fill/edit', admin())).status).toBe(404);

    expect((await postRemove('fill')).status).toBe(404);
    expect(audits('fill', 'freestyle.glossary_term.removed')).toBe(1);
  });

  // Defect caught: a removal whose file cannot be written reaches the database
  // only, so the term comes back at the next rebuild.
  it('refuses the removal when its save file cannot be written', async () => {
    adapterModule.setCuratedAuthoringAdapterForTests({
      ...adapterModule.createDatabaseOnlyCuratedAuthoringAdapter(),
      saveItem() { throw new Error('disk full'); },
    });
    expectLoggedError(/unhandled error/);
    const res = await postRemove('run');
    expect(res.status).toBe(503);
    expect(termRow('run')).toBeDefined();
    expect(audits('run', 'freestyle.glossary_term.removed')).toBe(0);
  });
});
