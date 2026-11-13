/**
 * /freestyle/sets/:slug — Set detail page.
 *
 * Pins:
 *   - 200 status on known canonical-set slugs, 404 on unknown slugs
 *     (anti-enumeration)
 *   - Every set page has the same sections in the same order: what it is, the
 *     formula, a worked example only where a teaching guide supplies one,
 *     example tricks, and related sets where the set has any
 *   - Every set page stays under 600 words and six sections
 *   - The formula shows on every set that has one, with a guide's +N sentence
 *     under it, and the pending line on a set that has none
 *   - A set without a guide lists every linked trick; a guided set leaves the
 *     full list to the dictionary's By set view and links it
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import Handlebars from 'handlebars';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  insertMember,
  insertTtLesson,
} from '../fixtures/factories';
import { CANONICAL_SETS, SET_SUBTYPE_SPECS } from '../../src/content/freestyleCanonicalSets';
import { buildSetEducationContent, hasSetEducationPage } from '../../src/services/symbolicSetEducation';

const { dbPath } = setTestEnv('3221');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const setNamed = (slug: string) => CANONICAL_SETS.find(s => s.slug === slug)!;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed one canonical trick linked to the pixie modifier so the pixie set
  // detail page renders a populated exampleTricks section in tests.
  insertFreestyleTrickModifier(db, {
    slug: 'pixie', modifier_name: 'pixie', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set', notes: '',
  });
  insertFreestyleTrick(db, {
    slug: 'pixie_mirage', canonical_name: 'pixie mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'TOE > SAME IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'pixie_mirage', 'pixie');

  // Sailing has no teaching page, so its page lists every linked trick.
  insertFreestyleTrickModifier(db, {
    slug: 'sailing', modifier_name: 'sailing', add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'set', notes: '',
  });
  insertFreestyleTrick(db, {
    slug: 'sailing_mirage', canonical_name: 'sailing mirage', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'TOE > SAME IN [DEX] > OP OUT [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'sailing_mirage', 'sailing');

  // This example trick has footage under its own slug, so the set page's
  // example row links to the gallery holding it.
  insertTtLesson(db, {
    uploader_member_id: insertMember(db, { id: 'm-setdetail1', slug: 'setdetail_uploader' }),
    ttNumber: 9,
    trickSlug: 'sailing_mirage',
    videoId: 'setexamplevid1',
  });

  // Stepping set-education page resolves progression + representative-trick
  // slugs against the dictionary for clickable links (underscore slugs, as in
  // the real DB).
  insertFreestyleTrick(db, { slug: 'butterfly',                  canonical_name: 'butterfly',                  adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'core', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'ripwalk',                    canonical_name: 'ripwalk',                    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'parkwalk',                   canonical_name: 'parkwalk',                   adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_ducking_butterfly', canonical_name: 'stepping ducking butterfly', adds: '5', base_trick: 'ducking-butterfly', trick_family: 'butterfly', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_mirage',           canonical_name: 'stepping mirage',           adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_whirl',            canonical_name: 'stepping whirl',            adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_eggbeater',        canonical_name: 'stepping eggbeater',        adds: '4', base_trick: 'eggbeater', trick_family: 'legover',   category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_symposium_mirage', canonical_name: 'stepping symposium mirage', adds: '4', base_trick: 'symposium-mirage', trick_family: 'mirage', category: 'compound', is_active: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/sets/:slug — set detail page', () => {
  it('returns 404 for an unknown slug (anti-enumeration)', async () => {
    const res = await page('/freestyle/sets/this-is-not-a-real-set');
    expect(res.status).toBe(404);
  });

  it('renders the set\'s own formula as a code block', async () => {
    // Defect caught: the formula block showing the wrong value.
    const res = await page('/freestyle/sets/blurry');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="set-detail-formula"');
    expect(res.text).toContain(Handlebars.escapeExpression(setNamed('blurry').formula));
  });

  it('shows a set without a guide its own plain explanation under What it is', async () => {
    // Defect caught: a set page without teaching content losing its plain
    // explanation, or showing another set's.
    const res = await page('/freestyle/sets/blurry');
    const section = /aria-label="What it is">([\s\S]*?)<\/section>/.exec(res.text)?.[1] ?? '';
    expect(section).toContain(Handlebars.escapeExpression(setNamed('blurry').movementExplanation));
  });

  it('lists every linked trick, without its notation, on a set page with no teaching content', async () => {
    // Defect caught: a long notation string per row running the list off a
    // phone and repeating what each trick's own page says.
    const res = await page('/freestyle/sets/sailing');
    expect(res.text).toContain('class="set-detail-trick-list"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/sailing_mirage"/);
    expect(res.text).not.toContain('set-detail-trick-notation');
    expect(res.text).not.toContain('OP IN [DEX] &gt; OP TOE [DEL]');
  });

  it('links an example trick to the gallery of its own slug', async () => {
    const res = await page('/freestyle/sets/sailing');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/media/browse?context&#x3D;sailing_mirage');
  });

  it('leaves the full trick list to the dictionary on a teaching page, and links it', async () => {
    // Defect caught: the full linked-trick list, already one link away in the
    // dictionary's By set view, returning to a teaching page.
    const res = await page('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="set-detail-trick-list"');
    expect(res.text).toContain('href="/freestyle/tricks?view=set#set-pixie">Browse This Set in the Dictionary<');
  });

  it('renders example-tricks empty state for holden-only sets with no linked tricks', async () => {
    const res = await page('/freestyle/sets/bubba');
    expect(res.text).toContain('class="empty-state"');
  });

  it('links no retired page from a set page', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.text).not.toContain('movement-system');
    // Defect caught: a set page sending the reader through a redirect to a
    // retired page instead of linking the merged one.
    expect(res.text).not.toContain('href="/freestyle/compositional-sets');
    expect(res.text).not.toContain('href="/freestyle/sets/reference');
  });

  it('uses each set\'s own subtype label as eyebrow text', async () => {
    // Defect caught: the eyebrow showing a raw subtype key, or one subtype's label on every set.
    for (const slug of ['pixie', 'blurry']) {
      const res = await page(`/freestyle/sets/${slug}`);
      const label = SET_SUBTYPE_SPECS.find(s => s.key === setNamed(slug).subtype)!.label;
      expect(res.text, slug).toContain(`<p class="hero-eyebrow">${Handlebars.escapeExpression(label)}</p>`);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S5 — Subtype-internal sibling navigation (prev/next strip)
// ─────────────────────────────────────────────────────────────────────────
//
// True-core subtype declaration order in CANONICAL_SETS:
//   toe → clipper → pixie → fairy → stepping → quantum → atomic → bubba → slapping → tapping
// First (toe): no prev, next = clipper
// Middle (stepping): prev = fairy, next = quantum
// Last (tapping): prev = slapping, no next

describe('GET /freestyle/sets/:slug — S5 sibling navigation strip', () => {
  it('first-in-subtype (toe): renders next=clipper, no previous', async () => {
    const res = await page('/freestyle/sets/toe');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-next" href="\/freestyle\/sets\/clipper">/);
    expect(res.text).not.toMatch(/<a class="set-detail-sibling-nav-prev"/);
  });

  it('middle-in-subtype (stepping): renders prev=fairy AND next=quantum', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-prev" href="\/freestyle\/sets\/fairy">/);
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-next" href="\/freestyle\/sets\/quantum">/);
    // Defect caught: the strip's links showing blank sibling names.
    const stripStart = res.text.indexOf('class="set-detail-sibling-nav"');
    const stripEnd = res.text.indexOf('</nav>', stripStart);
    const strip = res.text.slice(stripStart, stripEnd);
    expect(strip).toContain('Fairy');
    expect(strip).toContain('Quantum');
  });

  it('last-in-subtype (tapping): renders prev=slapping, no next (miraging removed)', async () => {
    const res = await page('/freestyle/sets/tapping');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-prev" href="\/freestyle\/sets\/slapping">/);
    // Tapping is now the last true-core set, so there is no next sibling and no
    // link to the removed miraging set page.
    expect(res.text).not.toMatch(/<a class="set-detail-sibling-nav-next"/);
  });
});

describe('GET /freestyle/sets/:slug — a retired non-set name is not found', () => {
  it('illusioning is not a set; its old set address gets the standard not-found page', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/illusioning').redirects(0);
    expect(res.status).toBe(404);
  });

  it('a live canonical set is never redirected', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic').redirects(0);
    expect(res.status).toBe(200);
  });
});

describe('GET /freestyle/sets/:slug — set-name distinctions', () => {
  it('renders no equivalence-reading or derived-system section; those stay curator reference data', async () => {
    // The structural readings and derived-system lists read as internal
    // reference to a casual visitor; a set page keeps its names, related
    // systems and example tricks instead.
    for (const slug of ['atomic', 'pixie', 'stepping']) {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text, slug).not.toContain('<h2>Equivalence readings</h2>');
      expect(res.text, slug).not.toContain('<h2>Derived systems</h2>');
    }
  });

  it('quantum names Miraging only to disambiguate it, never as an equivalent or related set', async () => {
    const res = await page('/freestyle/sets/quantum');
    expect(res.status).toBe(200);
    // Miraging is not a set: the quantum page must not chip-link it as a set page.
    // It may name Miraging only to disambiguate it as a distinct historical nickname,
    // exactly as the atomic page disambiguates illusioning; it is never presented as
    // an equivalent or alternate name for the quantum set.
    expect(res.text).not.toContain('href="/freestyle/sets/miraging"');
  });
});

// Under current doctrine Furious is the confirmed two-dex set page.
// Barraging and Miraging are not sets and their old set URLs redirect to their
// Freestyle Concepts terms; Illusioning redirects to its Concepts term, not to Atomic.
describe('GET /freestyle/sets/:slug — set vs non-set concepts', () => {
  it('furious renders a set detail page for the two-dex set concept', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/furious').redirects(0);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('third dex extension');
  });

  it('barraging does not render a set page; it redirects to the Furious set it names', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/barraging').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/furious');
  });

  it('miraging does not render a set page; its old set address is not found', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/miraging').redirects(0);
    expect(res.status).toBe(404);
  });
});

// The teaching guides, read from the module that registers them, so a guide
// added or retired there moves these checks with it.
const TEACHING_SLUGS = CANONICAL_SETS.map(s => s.slug).filter(hasSetEducationPage);

const sectionHeadings = (html: string): string[] =>
  [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map(m => m[1]!.replace(/<[^>]+>/g, '').trim());

describe('GET /freestyle/sets/:slug — one standard set page', () => {
  it('finds a teaching guide for some sets and not for others', () => {
    // Without both kinds, the shape checks below would cover only one branch.
    expect(TEACHING_SLUGS.length).toBeGreaterThan(0);
    expect(TEACHING_SLUGS.length).toBeLessThan(CANONICAL_SETS.length);
  });

  it('renders every set page in the same order, a worked example only where a guide supplies one', async () => {
    // Defect caught: the two kinds of set page drifting back into different
    // section lists, a guided page losing its worked example, or a page without
    // a guide inventing one.
    const app = await createApp();
    const wrong: string[] = [];
    for (const set of CANONICAL_SETS) {
      const res = await request(app).get(`/freestyle/sets/${set.slug}`);
      expect(res.status, set.slug).toBe(200);
      const guided = TEACHING_SLUGS.includes(set.slug);
      const expected = [
        'What it is',
        'Formula',
        ...(guided ? ['Progression'] : []),
        'Example tricks',
        ...(set.relatedSystems.length > 0 ? ['Related sets'] : []),
      ];
      const actual = sectionHeadings(res.text).map(h => (h.startsWith('Progression') ? 'Progression' : h));
      if (actual.join(' | ') !== expected.join(' | ')) {
        wrong.push(`${set.slug}: ${actual.join(' | ')}`);
      }
    }
    expect(wrong).toEqual([]);
  });

  it('keeps every set page under 600 words and at most six sections', async () => {
    // Defect caught: a set page regrowing into the long reference it was cut from.
    const app = await createApp();
    for (const set of CANONICAL_SETS) {
      const res = await request(app).get(`/freestyle/sets/${set.slug}`);
      const main = res.text.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';
      expect(main.match(/<h2[\s>]/g)?.length ?? 0, `${set.slug} sections`).toBeLessThanOrEqual(6);
      const words = main.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      expect(words, `${set.slug} words`).toBeLessThan(600);
    }
  });

  it.each(TEACHING_SLUGS.map(slug => [slug] as const))(
    '%s states its +N under the formula, and only there',
    async (slug) => {
      // Defect caught: a cut that drops a guided set's decomposition, or a page
      // stating it twice.
      const res = await page(`/freestyle/sets/${slug}`);
      const section = /aria-label="Formula">([\s\S]*?)<\/section>/.exec(res.text)?.[1] ?? '';
      // Handlebars escapes "=" as &#x3D;.
      const decomposition = /[a-z]+\(\+\d\) \+ [a-z]+(\([^)]*\))?\(\d\) (=|&#x3D;) \d/;
      expect(section, slug).toMatch(decomposition);
      const note = Handlebars.escapeExpression(buildSetEducationContent(slug, [])!.jobNotation);
      expect(res.text.split(note).length - 1, `${slug} notation sentence count`).toBe(1);
    },
  );

  it('shows every guided page its own guide definition under What it is', async () => {
    // Defect caught: a guided page showing the set's plain explanation instead
    // of its guide's definition, an empty definition, or another set's.
    for (const slug of TEACHING_SLUGS) {
      const { text } = await page(`/freestyle/sets/${slug}`);
      const definition = /aria-label="What it is">[\s\S]*?<p>([^<]*)<\/p>/.exec(text)?.[1]?.trim() ?? '';
      const expected = Handlebars.escapeExpression(buildSetEducationContent(slug, [])!.definition);
      expect(definition, slug).not.toBe('');
      expect(definition, slug).toBe(expected);
    }
  });
});

describe('GET /freestyle/sets/stepping — set-page educational reference implementation', () => {
  it('renders progression from butterfly, landing on its named trick (clickable underscore slugs)', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('set-step-1-butterfly');
    expect(res.text).toContain('set-step-2-ripwalk');
    expect(res.text).toContain('href="/freestyle/tricks/ripwalk"');
  });

  it('renders example tricks as clickable links', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_eggbeater"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_symposium_mirage"');
  });
});

describe('GET /freestyle/modifier/:slug — a set\'s old modifier address', () => {
  const MIGRATED = ['pixie', 'fairy', 'swirling', 'floating', 'surfing', 'warping'];

  for (const slug of MIGRATED) {
    it(`${slug} modifier route redirects to its set page`, async () => {
      const res = await page(`/freestyle/modifier/${slug}`);
      expect(res.status).toBe(301);
      expect(res.headers['location']).toBe(`/freestyle/sets/${slug}`);
    });
  }
});

describe('/freestyle/sets/:slug — formula, and what a visitor is not shown', () => {
  const formulaSection = (html: string): string | null => {
    const m = /aria-label="Formula">([\s\S]*?)<\/section>/.exec(html);
    return m ? m[1]! : null;
  };

  // Defect caught: a source line returns above the formula, naming a person or
  // an internal record on a public page.
  it('shows the formula with no source line', async () => {
    const res = await page('/freestyle/sets/blazing');
    const body = formulaSection(res.text);
    expect(body, 'formula section').not.toBeNull();
    expect(body!).not.toContain('Source:');
  });

  // Defect caught: internal reconciliation state reaches a visitor. Checked over
  // every set page, and the count of pages read keeps the absence from passing
  // on an empty loop.
  it('shows no citation or reconciliation status on any set page', async () => {
    const app = await createApp();
    const internal = /set-detail-provenance|set-detail-citation|set-card-source|set-card-audit|Holden-only|Aligned with Holden|Holden-cited only|Tracked here|Red ruling|curator-relayed/;
    const shown: string[] = [];
    let pages = 0;
    for (const set of CANONICAL_SETS) {
      const res = await request(app).get(`/freestyle/sets/${set.slug}`);
      if (res.status !== 200) continue;
      pages += 1;
      if (internal.test(res.text)) shown.push(set.slug);
    }
    expect(pages).toBeGreaterThan(0);
    expect(shown).toEqual([]);
  });

  it('does not call the blazing side relation unsettled', async () => {
    const res = await page('/freestyle/sets/blazing');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/side relation is not settled/);
  });

  it('shows every set its own formula, or the pending line where it has none', async () => {
    // Defect caught: a set page losing the notation the set encyclopedia story
    // keeps on the detail page, or a set with no formula showing an empty block.
    const app = await createApp();
    const withFormula = CANONICAL_SETS.filter(s => s.formula.trim().length > 0);
    const without = CANONICAL_SETS.filter(s => s.formula.trim().length === 0);
    expect(withFormula.length).toBeGreaterThan(0);
    expect(without.length).toBeGreaterThan(0);
    const wrong: string[] = [];
    for (const set of CANONICAL_SETS) {
      const res = await request(app).get(`/freestyle/sets/${set.slug}`);
      const body = formulaSection(res.text) ?? '';
      const hasFormula = set.formula.trim().length > 0;
      const shown = body.includes(`<code class="set-detail-formula">${Handlebars.escapeExpression(set.formula)}</code>`);
      const pending = !body.includes('set-detail-formula') && body.includes('set-detail-component-note');
      if (hasFormula ? !shown : !pending) wrong.push(set.slug);
    }
    expect(wrong).toEqual([]);
  });
});
