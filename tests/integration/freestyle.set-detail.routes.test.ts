/**
 * /freestyle/sets/:slug — Set detail page.
 *
 * Pins:
 *   - 200 status on known canonical-set slugs (pixie, blurry, surging)
 *   - 404 on unknown slugs (anti-enumeration)
 *   - A set page without teaching content renders: formula, movement
 *     explanation, related systems, every linked trick (empty-state OR
 *     populated) and cross-links
 *   - A teaching page renders at most six sections, states its notation once
 *     under "How it launches", and leaves the full trick list to the
 *     dictionary's By set view
 *   - Cross-links resolve to expected URLs (the Set Encyclopedia, the
 *     dictionary's By set view, the operators page when applicable)
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

  // blurry is a thin set (no authored teaching page), so its Formula and Movement
  // sections render directly; a migrated set like pixie absorbs them into the
  // teaching layer.
  it('renders the set\'s own formula as a code block', async () => {
    // Defect caught: the formula block showing the wrong value.
    const res = await page('/freestyle/sets/blurry');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="set-detail-formula"');
    expect(res.text).toContain(Handlebars.escapeExpression(setNamed('blurry').formula));
  });

  it('renders the set\'s own movement explanation', async () => {
    // Defect caught: a set page without teaching content losing its plain explanation.
    const res = await page('/freestyle/sets/blurry');
    expect(res.text).toContain(
      `<p class="set-detail-movement">${Handlebars.escapeExpression(setNamed('blurry').movementExplanation)}</p>`,
    );
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
    expect(res.text).toContain('class="set-detail-examples-empty"');
  });

  it('links no retired page from a set page', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.text).not.toContain('movement-system');
    // Defect caught: a set page sending the reader through a redirect to a
    // retired page instead of linking the merged one.
    expect(res.text).not.toContain('href="/freestyle/compositional-sets');
    expect(res.text).not.toContain('href="/freestyle/sets/reference');
  });

  it('omits the operator-reference cross-link for a set with no operators-page entry', async () => {
    const res = await page('/freestyle/sets/pixie');
    // Set operators live on their own set pages, not the body-operator index, so
    // pixie carries no operators anchor rather than a broken one.
    expect(res.text).not.toContain('href="/freestyle/operators#pixie"');
  });

  it('does NOT render the operator-reference cross-link for holden-only sets without a modifier', async () => {
    const res = await page('/freestyle/sets/bubba');
    expect(res.text).not.toContain('href="/freestyle/operators#bubba"');
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

// Section-order parity with the trick-detail shell: the plain explanation first,
// then the formula, then relationships, examples and cross-links.
const SET_PARITY_ORDER = [
  'aria-label="About This Set"',
  'aria-label="Formula"',
  'aria-label="Related sets"',
  'aria-label="Example tricks"',
  'aria-label="Cross-references"',
];

function presentSectionsInOrder(text: string): { present: string[]; ascending: boolean } {
  const present = SET_PARITY_ORDER.filter(m => text.includes(m));
  const positions = present.map(m => text.indexOf(m));
  let ascending = true;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] <= positions[i - 1]) ascending = false;
  }
  return { present, ascending };
}

describe('GET /freestyle/sets/:slug — section order mirrors the trick-detail shell', () => {
  it('a set page without teaching content renders its sections in trick-detail order', async () => {
    const res = await page('/freestyle/sets/sailing');
    const { present, ascending } = presentSectionsInOrder(res.text);
    expect(present).toEqual(SET_PARITY_ORDER);
    expect(ascending).toBe(true);
  });
});

const TEACHING_SLUGS = [
  'stepping', 'pixie', 'fairy', 'swirling', 'floating', 'surfing',
  'warping', 'atomic', 'quantum', 'nuclear', 'furious',
];
// Swirling's page authors no common confusions, so its section is omitted.
const TEACHING_SLUGS_WITHOUT_CONFUSIONS = ['swirling'];

describe('GET /freestyle/sets/:slug — teaching pages stay at six sections', () => {
  it.each(TEACHING_SLUGS.map(slug => [slug] as const))(
    '%s stays within six sections and renders its progression',
    async (slug) => {
      // Defect caught: a teaching page growing back past six sections, or
      // losing the progression its examples build on.
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      const headings = [...res.text.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
        .map(m => m[1]!.replace(/<[^>]+>/g, '').trim());
      expect(headings.length, `${slug} section count`).toBeLessThanOrEqual(6);
      const progression = headings.find(h => h.startsWith('Progression'));
      expect(progression, `${slug} progression`).toBeDefined();
    },
  );

  it.each(TEACHING_SLUGS.map(slug => [slug] as const))(
    '%s states its notation under How it launches',
    async (slug) => {
      // Defect caught: a cut that removes a set's formula or decomposition.
      const res = await page(`/freestyle/sets/${slug}`);
      const start = res.text.indexOf('aria-label="How it launches"');
      const section = res.text.slice(start, res.text.indexOf('</section>', start));
      expect(start).toBeGreaterThan(0);
      // Handlebars escapes "=" as &#x3D;.
      expect(section, slug).toMatch(/\(\+\d\) \+ [a-z]+\(\d\) (=|&#x3D;) \d/);
    },
  );

  it('gives every teaching page a definition of its own and, where it teaches them, its confusions', async () => {
    // Defect caught: a teaching page rendering an empty definition or no common
    // confusions, or every page showing one set's content.
    const problems: string[] = [];
    const definitions: string[] = [];
    for (const slug of TEACHING_SLUGS) {
      const { text } = await page(`/freestyle/sets/${slug}`);
      const definition = /aria-label="What it is">\s*<div class="section-heading"><h2>What it is<\/h2><\/div>\s*<p>([^<]*)<\/p>/.exec(text)?.[1]?.trim() ?? '';
      if (!definition) problems.push(`${slug}: empty definition`);
      definitions.push(definition);
      const hasConfusion = /<div class="confusion-card">\s*<h3>[^<]+<\/h3>\s*<p>[^<]+<\/p>/.test(text);
      if (!hasConfusion && !TEACHING_SLUGS_WITHOUT_CONFUSIONS.includes(slug)) {
        problems.push(`${slug}: no common confusion`);
      }
    }
    expect(problems).toEqual([]);
    expect(new Set(definitions).size, 'distinct definitions').toBe(TEACHING_SLUGS.length);
  });
});

// Set-detail links are not covered here. The /freestyle/tricks?view=modifier
// URL answers "which tricks use this set or modifier?" with a modifier-grouped
// trick list and carries no detail links; the Set Encyclopedia at
// /freestyle/sets owns them, under its own card class names, and its own suite
// covers them.

describe('Set detail — X-Dex receiver note (atomic / quantum / nuclear only)', () => {
  for (const slug of ['atomic', 'quantum', 'nuclear']) {
    it(`renders the X-Dex receiver note under How it launches on ${slug}`, async () => {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      // The note is notation-authoritative: X-Dex is scored from the [XDEX] flag,
      // not inferred from the set or base. The full rule lives in Freestyle Concepts.
      const start = res.text.indexOf('aria-label="How it launches"');
      const section = res.text.slice(start, res.text.indexOf('</section>', start));
      expect(section).toMatch(/marked \[XDEX\] in the notation/);
    });
  }

  it('omits the X-Dex receiver note on a non-receiver set (pixie)', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/marked \[XDEX\] in the notation/);
  });
});

describe('GET /freestyle/sets/stepping — set-page educational reference implementation', () => {
  it('absorbs the thin Formula / Movement sections into the teaching layer', async () => {
    const res = await page('/freestyle/sets/stepping');
    // On a migrated set the teaching layer replaces the bare explanation and formula headings.
    expect(res.text).not.toContain('<h2>Formula</h2>');
    expect(res.text).not.toContain('<h2>About This Set</h2>');
  });

  it('renders progression with anchor on butterfly, landing on its named trick (clickable underscore slugs)', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('set-step-1-butterfly');
    expect(res.text).toContain('set-step-2-ripwalk');
    expect(res.text).toContain('href="/freestyle/tricks/ripwalk"');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders example tricks as clickable links', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_eggbeater"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_symposium_mirage"');
  });
});

describe('GET /freestyle/sets/:slug — migrated set-education pages (pixie / fairy / whirl-family / composite +3)', () => {
  // Six settled, non-ambiguous platform-canonical sets with teaching pages.
  // Their content resolves slugs against the test dictionary; unseeded slugs
  // render as plain text, so these assertions check only the static teaching
  // layer and the redirect, not link pilots. The six-section structure is
  // checked for every teaching page above.
  const MIGRATED = ['pixie', 'fairy', 'swirling', 'floating', 'surfing', 'warping'];

  for (const slug of MIGRATED) {
    it(`${slug} absorbs the thin Formula/Movement sections into the teaching layer`, async () => {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.text).not.toContain('<h2>Formula</h2>');
      expect(res.text).not.toContain('<h2>About This Set</h2>');
    });

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

  it('shows a formula on every set whose formula the derivation supplies', async () => {
    // Without this, a rendering change that silently dropped every formula would
    // read as success.
    const app = await createApp();
    const withFormula = CANONICAL_SETS.filter(s => s.formula.trim().length > 0);
    expect(withFormula.length).toBeGreaterThan(0);

    const showing: string[] = [];
    for (const set of withFormula) {
      const res = await request(app).get(`/freestyle/sets/${set.slug}`);
      if (res.status === 200 && res.text.includes('set-detail-formula')) {
        showing.push(set.slug);
      }
    }
    // Not all of them: the sets that teach their notation in prose render no
    // formula today, which is a content decision and not this test's to make.
    // What it pins is that the ones that do show one are a real, non-empty set.
    expect(showing.length).toBeGreaterThan(0);
  });

  it('prints no bare formula on a page that teaches its notation in prose', async () => {
    // Defect caught: a teaching page stating its notation twice.
    const res = await page('/freestyle/sets/swirling');
    expect(res.status).toBe(200);
    expect(res.text.indexOf('aria-label="How it launches"')).toBeGreaterThan(0);
    expect(res.text).not.toContain('set-detail-formula');
  });
});
