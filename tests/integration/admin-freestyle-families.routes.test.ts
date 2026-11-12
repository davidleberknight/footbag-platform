/**
 * The admin family editor: GET /admin/freestyle/families, GET and POST
 * /admin/freestyle/families/:slug/edit.
 *
 * An admin edits a freestyle family: its name, parent, tier, display order, the
 * teaching text its page shows, its related families, its shared-structure line,
 * its trick-page note and the trick family labels that fold into it. Families
 * are edited, never created. Every save keeps the roster two levels deep, keeps a
 * catch surface off the family-parent tier, writes its committed save file first,
 * and appends one audit row; a family moved to minor lineage loses its page,
 * its sitemap entry, its search result and every link to it.
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
  insertFreestyleFamily,
  createTestSessionJwt,
} from '../fixtures/factories';
import { seedStagedFamilies, stagedFamily } from '../fixtures/stagedFamilies';
import { STAGED_FAMILY_SUBLABELS } from '../../freestyle/inputs/curator_content/freestyleFamilies';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4396');

let createApp: Awaited<ReturnType<typeof importApp>>;
let adapterModule: typeof import('../../src/adapters/curatedAuthoringAdapter');

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-0000000000f1';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-0000000000f2';
const PERSONA_ADMIN_ID = 'member_persona_fsm_family';

const cookieFor = (memberId: string, role: 'admin' | 'member') =>
  `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
const admin = () => cookieFor(ADMIN_ID, 'admin');

function query<T>(sql: string, ...params: unknown[]): T | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try { return db.prepare(sql).get(...params) as T | undefined; } finally { db.close(); }
}
const family = (slug: string) => query<{
  display_name: string; parent_slug: string | null; tier: string; sort_order: number; hook: string | null;
  how_to_recognize_json: string; related_family_slugs_json: string; version: number; updated_by: string;
}>('SELECT display_name, parent_slug, tier, sort_order, hook, how_to_recognize_json, related_family_slugs_json, version, updated_by FROM freestyle_families WHERE slug = ?', slug);
const labelsOf = (slug: string) => {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare('SELECT label FROM freestyle_family_sublabels WHERE family_slug = ? ORDER BY label')
      .all(slug) as { label: string }[]).map(r => r.label);
  } finally { db.close(); }
};
const audits = (slug: string) => query<{ n: number }>(
  "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_type = 'freestyle_family' AND entity_id = ? AND action_type = 'freestyle.family.updated'",
  slug)!.n;
// The changed fields on a family's one audit row; a caller first asserts there is
// exactly one, so no ordering decides which row is read.
const onlyAuditFields = (slug: string): string[] => {
  const row = query<{ metadata_json: string }>(
    "SELECT metadata_json FROM audit_entries WHERE entity_type = 'freestyle_family' AND entity_id = ? AND action_type = 'freestyle.family.updated'",
    slug);
  return row ? (JSON.parse(row.metadata_json) as { changedFields: string[] }).changedFields : [];
};
const saveFile = (slug: string) => path.join(process.env.CURATOR_SAVES_DIR!, 'families', `${slug}.json`);

/** The edit form exactly as it renders for a staged family. */
function formOf(slug: string, overrides: Record<string, string> = {}): Record<string, string> {
  const f = stagedFamily(slug);
  return {
    displayName:          f.displayName,
    parentSlug:           f.parentSlug ?? '',
    tier:                 f.tier,
    sortOrder:            String(f.sortOrder),
    hook:                 f.hook ?? '',
    description:          f.description ?? '',
    plainLanguageReading: f.plainLanguageReading ?? '',
    importance:           f.importance ?? '',
    howToRecognize:       f.howToRecognize.join('\n'),
    relatedFamilySlugs:   f.relatedFamilySlugs.join('\n'),
    sharedStructure:      f.sharedStructure ?? '',
    trickPageNote:        f.trickPageNote ?? '',
    foldedLabels:         [...STAGED_FAMILY_SUBLABELS].filter(([, fam]) => fam === slug).map(([l]) => l).sort().join('\n'),
    ...overrides,
  };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'fsf_admin', display_name: 'FSF Admin', login_email: 'fsf-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'fsf_member', display_name: 'FSF Member', login_email: 'fsf-member@example.com' });
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'fsf_persona', display_name: 'FSF Persona', login_email: 'fsf-persona@example.com', is_admin: 1 });
  seedStagedFamilies(db);
  // A catch surface held as a minor lineage, to try promoting.
  insertFreestyleFamily(db, { slug: 'toe_stall', tier: 'minor_lineage', sort_order: 999 });
  // Tricks for the pages that link the butterfly family, and the labels a fold names.
  insertFreestyleTrick(db, { slug: 'butterfly', canonical_name: 'butterfly', adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'dex' });
  insertFreestyleTrick(db, { slug: 'ripwalk', canonical_name: 'ripwalk', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk', canonical_name: 'dimwalk', adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'swirl', canonical_name: 'swirl', adds: '3', base_trick: 'swirl', trick_family: 'swirl', category: 'dex' });
  insertFreestyleTrick(db, { slug: 'swirly_x', canonical_name: 'swirly x', adds: '4', base_trick: 'swirl', trick_family: 'swirly_label', category: 'compound' });
  db.close();
  createApp = await importApp();
  adapterModule = await import('../../src/adapters/curatedAuthoringAdapter');
});

afterEach(() => adapterModule.resetCuratedAuthoringAdapterForTests());
afterAll(() => cleanupTestDb(dbPath));

const app = async () => createApp();
const post = async (slug: string, body: Record<string, string>, cookie = admin()) =>
  request(await app()).post(`/admin/freestyle/families/${slug}/edit`).set('Cookie', cookie).type('form').send(body);
const get = async (url: string, cookie?: string) => {
  const r = request(await app()).get(url);
  return cookie ? r.set('Cookie', cookie) : r;
};

describe('access', () => {
  // Defect caught: the editor opens to a visitor or a member, or a test persona
  // rewrites the committed family inputs.
  it('sends a visitor to log in, refuses a member and a test persona, and changes nothing', async () => {
    expect((await get('/admin/freestyle/families')).status).toBe(302);
    expect((await get('/admin/freestyle/families', cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
    const before = family('swirl');
    expect((await post('swirl', formOf('swirl', { displayName: 'Swirly' }), cookieFor(MEMBER_ID, 'member'))).status).toBe(403);
    expect((await post('swirl', formOf('swirl', { displayName: 'Swirly' }), cookieFor(PERSONA_ADMIN_ID, 'admin'))).status).toBe(403);
    expect(family('swirl')).toEqual(before);
    expect(audits('swirl')).toBe(0);
  });

  // Defect caught: an unknown family answers with a form that would create it.
  it('answers 404 for an unknown family on both verbs', async () => {
    expect((await get('/admin/freestyle/families/no_such_family/edit', admin())).status).toBe(404);
    expect((await post('no_such_family', formOf('swirl'))).status).toBe(404);
    expect(family('no_such_family')).toBeUndefined();
  });

  // Defect caught: the roster page omits families, or links an edit form that
  // does not exist.
  it('lists every family with a link to its edit form', async () => {
    const res = await get('/admin/freestyle/families', admin());
    expect(res.status).toBe(200);
    for (const slug of ['osis', 'torque', 'eclipse', 'swirl']) {
      expect(res.text).toContain(`href="/admin/freestyle/families/${slug}/edit"`);
    }
    const form = await get('/admin/freestyle/families/torque/edit', admin());
    expect(form.status).toBe(200);
    expect(form.text).toContain('action="/admin/freestyle/families/torque/edit"');
    // The parent list offers only root family parents: osis, not the branch torque itself.
    expect(form.text).toMatch(/<option value="osis" selected>/);
    expect(form.text).not.toContain('<option value="torque"');
    expect(form.text).not.toContain('<option value="eclipse"');
  });
});

describe('saving', () => {
  // Defect caught: an edit reaches only the database, so the next rebuild loses
  // it; or the audit row is missing or names the wrong fields.
  it('saves every edited field and folded label, writes the save file and audits it once', async () => {
    const res = await post('swirl', formOf('swirl', {
      displayName: 'Swirl Family', sortOrder: '175', hook: 'A new hook.',
      howToRecognize: 'First cue.\nSecond cue.', relatedFamilySlugs: 'osis\nwhirl', foldedLabels: 'whirling_swirl\nswirly_label',
    }));
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/freestyle/families/swirl/edit');
    const row = family('swirl')!;
    expect(row).toMatchObject({ display_name: 'Swirl Family', sort_order: 175, hook: 'A new hook.', version: 2, updated_by: ADMIN_ID });
    expect(JSON.parse(row.how_to_recognize_json)).toEqual(['First cue.', 'Second cue.']);
    expect(JSON.parse(row.related_family_slugs_json)).toEqual(['osis', 'whirl']);
    expect(labelsOf('swirl')).toEqual(['swirly_label', 'whirling_swirl']);
    const saved = JSON.parse(fs.readFileSync(saveFile('swirl'), 'utf8'));
    expect(saved).toMatchObject({
      slug: 'swirl', display_name: 'Swirl Family', sort_order: 175,
      how_to_recognize: ['First cue.', 'Second cue.'], related_family_slugs: ['osis', 'whirl'],
      folded_labels: ['swirly_label', 'whirling_swirl'],
    });
    expect(JSON.stringify(saved)).not.toContain(ADMIN_ID);
    expect(audits('swirl')).toBe(1);
    expect(onlyAuditFields('swirl').sort()).toEqual(
      ['display_name', 'folded_labels', 'hook', 'how_to_recognize', 'related_family_slugs', 'sort_order'].sort());
  });

  // Defect caught: the saved edit never reaches the public family page.
  it('shows the saved hook on the family page at once, with the saved banner on the form', async () => {
    const page = await get('/freestyle/families/swirl');
    expect(page.text).toContain('A new hook.');
    expect(page.text).toContain('href="/freestyle/tricks/swirly_x"');
  });

  // Defect caught: a resubmit of the form as rendered writes a second audit row
  // or bumps the version for nothing.
  it('writes nothing for an unchanged submit', async () => {
    const formPage = await get('/admin/freestyle/families/torque/edit', admin());
    expect(formPage.status).toBe(200);
    const before = family('torque');
    const res = await post('torque', formOf('torque'));
    expect(res.status).toBe(303);
    expect(family('torque')).toEqual(before);
    expect(audits('torque')).toBe(0);
  });

  // Defect caught: a save whose file cannot be written reaches the database only
  // and is lost at the next rebuild.
  it('refuses the save when its save file cannot be written', async () => {
    adapterModule.setCuratedAuthoringAdapterForTests({
      ...adapterModule.createDatabaseOnlyCuratedAuthoringAdapter(),
      saveItem() { throw new Error('disk full'); },
    });
    expectLoggedError(/unhandled error/);
    const before = family('pickup');
    const res = await post('pickup', formOf('pickup', { displayName: 'Unsaved' }));
    expect(res.status).toBe(503);
    expect(family('pickup')).toEqual(before);
  });
});

describe('refusals keep the roster sound and the submitted values', () => {
  it.each([
    // Defect caught: a branch under a branch, which the display draws wrongly.
    ['a branch as parent', 'eclipse', { parentSlug: 'torque' }],
    // Defect caught: a branch whose "Branch of" link points at no page.
    ['a minor lineage as parent', 'dyno', { parentSlug: 'eclipse' }],
    // Defect caught: a family parent demoted under its branches.
    ['demoting a family parent that has branches', 'osis', { tier: 'minor_lineage' }],
    // Defect caught: a universal catch surface given its own page.
    ['a catch surface as a family parent', 'toe_stall', { tier: 'family_parent' }],
    // Defect caught: a related family that is itself or names nothing.
    ['the family as its own related family', 'whirl', { relatedFamilySlugs: 'whirl' }],
    ['an unknown related family', 'whirl', { relatedFamilySlugs: 'blur' }],
    // Defect caught: a family's own slug folded into another family.
    ['a family slug as a folded label', 'whirl', { foldedLabels: 'swirl' }],
    // Defect caught: one label folded into two families.
    ['a label another family folds', 'whirl', { foldedLabels: 'whirling_swirl' }],
    // Defect caught: a folded label no trick carries, which folds nothing.
    ['a label no trick carries', 'whirl', { foldedLabels: 'no_trick_label' }],
    // Defect caught: a display order the browse cannot sort by.
    ['a fractional display order', 'whirl', { sortOrder: '1.5' }],
    // Defect caught: a nameless family.
    ['an empty display name', 'whirl', { displayName: '' }],
  ] as Array<[string, string, Record<string, string>]>)('refuses %s, writing nothing', async (_label, slug, overrides) => {
    const isStaged = slug !== 'toe_stall';
    const base = isStaged ? formOf(slug) : {
      displayName: 'Toe stall', parentSlug: '', tier: 'minor_lineage', sortOrder: '999', hook: '', description: '',
      plainLanguageReading: '', importance: '', howToRecognize: '', relatedFamilySlugs: '', sharedStructure: '',
      trickPageNote: '', foldedLabels: '',
    };
    const before = family(slug);
    const beforeLabels = labelsOf(slug);
    const res = await post(slug, { ...base, ...overrides });
    expect(res.status).toBe(422);
    expect(res.text).toContain('class="form-error-banner"');
    // The form comes back with what was typed.
    if (overrides.displayName) expect(res.text).toContain(`value="${overrides.displayName}"`);
    if (overrides.sortOrder) expect(res.text).toContain(`value="${overrides.sortOrder}"`);
    expect(family(slug)).toEqual(before);
    expect(labelsOf(slug)).toEqual(beforeLabels);
    expect(audits(slug)).toBe(0);
  });

  // Defect caught: a refused form offers no way forward; the one correction a
  // curator would make saves.
  it('saves the refused form once the one bad field is corrected', async () => {
    const refused = await post('flail', formOf('flail', { relatedFamilySlugs: 'flail' }));
    expect(refused.status).toBe(422);
    const fixed = await post('flail', formOf('flail', { relatedFamilySlugs: 'mirage' }));
    expect(fixed.status).toBe(303);
    expect(JSON.parse(family('flail')!.related_family_slugs_json)).toEqual(['mirage']);
  });
});

describe('a family moved to minor lineage loses its page and every link', () => {
  const linksToButterfly = (html: string) => html.includes('href="/freestyle/families/butterfly"');
  const pages = ['/freestyle/start', '/freestyle/concepts', '/freestyle/tricks/ripwalk', '/freestyle/tricks?view=family'];

  // Defect caught: a demoted family keeps a page, a sitemap entry, a search
  // result or a link from any page. The positive control proves each is present
  // first, so the absences are not true by construction.
  it('has the page, sitemap entry, search result and links before, and none after', async () => {
    expect((await get('/freestyle/families/butterfly')).status).toBe(200);
    expect((await get('/sitemap.xml')).text).toContain('/freestyle/families/butterfly');
    expect((await get('/freestyle/search?q=butterfly')).text).toContain('href="/freestyle/families/butterfly"');
    for (const url of pages) expect(linksToButterfly((await get(url)).text), url).toBe(true);

    const res = await post('butterfly', formOf('butterfly', { tier: 'minor_lineage' }));
    expect(res.status).toBe(303);

    expect((await get('/freestyle/families/butterfly')).status).toBe(404);
    expect((await get('/sitemap.xml')).text).not.toContain('/freestyle/families/butterfly');
    expect((await get('/freestyle/search?q=butterfly')).text).not.toContain('href="/freestyle/families/butterfly"');
    for (const url of pages) expect(linksToButterfly((await get(url)).text), url).toBe(false);
  });
});
