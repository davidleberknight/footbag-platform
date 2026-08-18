/**
 * The three freestyle reference resources and how they are told apart:
 *
 *   - GET /freestyle/tricks    finds tricks, and folds "Reading the Dictionary"
 *                              in as a closed disclosure above the browse controls
 *   - GET /freestyle/glossary  looks up terminology: one alphabetical A to Z list
 *                              of terms with short definitions
 *   - GET /freestyle/concepts  explains concepts in depth: the chapter-based
 *                              reference, which no longer carries "Reading the
 *                              Dictionary" and never calls itself a glossary
 *
 * Also pins the deep-link contract: every Concepts anchor a Glossary entry
 * points at exists on the rendered Concepts page, and the cross-links between
 * the three resources land on the semantically right destination.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';
import type { GlossaryTerm } from '../../src/content/freestyleGlossaryTerms';

const { dbPath } = setTestEnv('4044');

let createApp: Awaited<ReturnType<typeof importApp>>;
// src/ modules are imported after setTestEnv so the config singleton sees the
// test database path.
let GLOSSARY_TERMS: readonly GlossaryTerm[];
let GLOSSARY_CROSS_REFERENCES: typeof import('../../src/content/freestyleGlossaryTerms').GLOSSARY_CROSS_REFERENCES;
let shapeGlossaryLetterGroups: typeof import('../../src/services/freestyleService').shapeGlossaryLetterGroups;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // The twelve foundational atoms the Glossary's trick-detail "more" links
  // point at (they are the same slugs the core-atom registry names).
  for (const [slug, adds] of [
    ['toe_stall', '1'], ['clipper_stall', '1'], ['around_the_world', '2'], ['orbit', '2'],
    ['legover', '2'], ['pickup', '2'], ['mirage', '2'], ['illusion', '2'],
    ['butterfly', '3'], ['osis', '3'], ['whirl', '3'], ['swirl', '3'],
  ] as const) {
    insertFreestyleTrick(db, { slug, canonical_name: slug.replace(/_/g, ' '), adds, base_trick: slug, trick_family: slug, category: 'dex', is_active: 1 });
  }
  db.close();
  createApp = await importApp();
  ({ GLOSSARY_TERMS, GLOSSARY_CROSS_REFERENCES } = await import('../../src/content/freestyleGlossaryTerms'));
  ({ shapeGlossaryLetterGroups } = await import('../../src/services/freestyleService'));
});

afterAll(() => cleanupTestDb(dbPath));

async function get(path: string): Promise<string> {
  const res = await request(await createApp()).get(path);
  expect(res.status, path).toBe(200);
  return res.text;
}

function ids(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]!));
}

describe('GET /freestyle/glossary — the A to Z Glossary', () => {
  it('renders the Glossary identity, not the chapter-based reference', async () => {
    const html = await get('/freestyle/glossary');
    expect(html).toContain('<h1>Freestyle Glossary</h1>');
    expect(html).toContain('<title>Footbag Freestyle Glossary</title>');
    // Chapter tiles belong to Concepts, not here.
    expect(html).not.toContain('id="chapter-movement-basics"');
    expect(html).not.toContain('Reading the Dictionary');
  });

  it('renders every term once, as term + definition, in one alphabetical list', async () => {
    const html = await get('/freestyle/glossary');
    for (const t of GLOSSARY_TERMS) {
      const occurrences = html.split(`id="term-${t.slug}"`).length - 1;
      expect(occurrences, `entry ${t.term} rendered once`).toBe(1);
      const escaped = t.term.replace(/&/g, '&amp;').replace(/'/g, '&#x27;');
      expect(html).toMatch(new RegExp(`<dt>${escaped.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(<\\/dt>| <span class="glossary-az-aliases">)`));
    }
    expect(html).toContain(`${GLOSSARY_TERMS.length} terms,`);
  });

  it('renders aliases inline on the term line, never as entries of their own', async () => {
    const html = await get('/freestyle/glossary');
    const withAliases = GLOSSARY_TERMS.filter(t => (t.aliases?.length ?? 0) > 0);
    expect(withAliases.length).toBeGreaterThan(10);
    for (const t of withAliases) {
      const entryStart = html.indexOf(`id="term-${t.slug}"`);
      const slice = html.slice(entryStart, entryStart + 600);
      expect(slice, t.term).toContain(`also: ${t.aliases!.join(', ').replace(/&/g, '&amp;').replace(/'/g, '&#x27;')}`);
    }
    // No alias appears as a canonical defined <dt> term (case-insensitive)
    // except a case variant of its own entry; an alias may appear only as a
    // "see" cross-reference line.
    const definedDts = [...html.matchAll(/<div class="glossary-az-entry" id="term-[^"]+">\s*<dt>([^<]+?)(?:<\/dt>| <span)/g)].map(m => m[1]!.toLowerCase());
    expect(definedDts.length).toBe(GLOSSARY_TERMS.length);
    for (const t of GLOSSARY_TERMS) {
      for (const a of t.aliases ?? []) {
        if (a.toLowerCase() === t.term.toLowerCase()) continue;
        expect(definedDts, `alias ${a} of ${t.term}`).not.toContain(a.toLowerCase());
      }
    }
  });

  it('alias integrity: every alias belongs to exactly one entry, is not another entry\'s term, and every "see" pointer restates an alias of its target', () => {
    const termKeys = new Map(GLOSSARY_TERMS.map(t => [t.term.toLowerCase(), t]));
    const aliasOwner = new Map<string, string>();
    for (const t of GLOSSARY_TERMS) {
      for (const a of t.aliases ?? []) {
        const key = a.toLowerCase();
        if (key !== t.term.toLowerCase()) {
          expect(termKeys.has(key), `alias "${a}" of ${t.term} is also a defined term`).toBe(false);
        }
        expect(aliasOwner.get(key) ?? t.term, `alias "${a}" claimed twice`).toBe(t.term);
        aliasOwner.set(key, t.term);
      }
    }
    const bySlug = new Map(GLOSSARY_TERMS.map(t => [t.slug, t]));
    for (const x of GLOSSARY_CROSS_REFERENCES) {
      const target = bySlug.get(x.seeSlug)!;
      expect(target, `${x.term} target`).toBeDefined();
      expect(termKeys.has(x.term.toLowerCase()), `pointer "${x.term}" is also a defined term`).toBe(false);
      expect(aliasOwner.get(x.term.toLowerCase()), `pointer "${x.term}" is an alias of ${target.term}`).toBe(target.term);
    }
  });

  it('renders each cross-reference as a one-line "see" pointer to a defined entry, never as a definition', async () => {
    const html = await get('/freestyle/glossary');
    expect(GLOSSARY_CROSS_REFERENCES.length).toBeGreaterThan(5);
    const bySlug = new Map(GLOSSARY_TERMS.map(t => [t.slug, t]));
    for (const x of GLOSSARY_CROSS_REFERENCES) {
      const target = bySlug.get(x.seeSlug)!;
      expect(target, `${x.term} target`).toBeDefined();
      const start = html.indexOf(`id="see-${x.slug}"`);
      expect(start, `${x.term} rendered`).toBeGreaterThan(-1);
      const slice = html.slice(start, html.indexOf('</div>', start));
      expect(slice).toContain(`<dt>${x.term.replace(/'/g, '&#x27;')}</dt>`);
      expect(slice).toContain(`see <a href="#term-${target.slug}">${target.term.replace(/'/g, '&#x27;')}</a>`);
      expect(slice).not.toContain('also:');
      // The pointer's own id is never a term- anchor, so it can't be mistaken for a definition.
      expect(html.split(`id="term-${x.slug}"`).length - 1).toBe(0);
    }
    expect(html).toContain(`${GLOSSARY_TERMS.length} terms, ${GLOSSARY_CROSS_REFERENCES.length} cross-references.`);
  });

  it('renders terms in deterministic case-insensitive alphabetical order, grouped by letter', async () => {
    const html = await get('/freestyle/glossary');
    // Definitions and "see" pointers share one alphabetical sequence.
    const renderedTerms = [...html.matchAll(/<dt>([^<]+?)(?:<\/dt>| <span class="glossary-az-aliases">)/g)].map(m => m[1]!);
    expect(renderedTerms.length).toBe(GLOSSARY_TERMS.length + GLOSSARY_CROSS_REFERENCES.length);
    const sorted = [...renderedTerms].sort((a, b) =>
      a.localeCompare(b, 'en', { sensitivity: 'base', numeric: true }));
    expect(renderedTerms).toEqual(sorted);

    // Letter groups appear in A→Z order and every letter heading has an entry under it.
    const letters = [...html.matchAll(/id="letter-([A-Z])"/g)].map(m => m[1]!);
    expect(letters).toEqual([...letters].sort());
    expect(new Set(letters).size).toBe(letters.length);
    for (const letter of letters) {
      expect(html).toContain(`href="#letter-${letter}"`);
    }
  });

  it('shapeGlossaryLetterGroups is deterministic and tiebreaks on slug', () => {
    const a = shapeGlossaryLetterGroups(GLOSSARY_TERMS, GLOSSARY_CROSS_REFERENCES);
    const b = shapeGlossaryLetterGroups([...GLOSSARY_TERMS].reverse(), [...GLOSSARY_CROSS_REFERENCES].reverse());
    expect(a).toEqual(b);
    // A pointer sorts by its own word, and lands under that word's letter.
    const stringLine = a.find(g => g.letter === 'S')!.entries.find(e => e.term === 'String')!;
    expect(stringLine.isSee).toBe(true);
    expect(stringLine.seeHref).toBe('#term-run');
    const tie = shapeGlossaryLetterGroups([
      { term: 'Zeta', slug: 'zeta-b', definition: 'x' },
      { term: 'zeta', slug: 'zeta-a', definition: 'y' },
      { term: 'Alpha', slug: 'alpha', definition: 'z' },
    ]);
    expect(tie.map(g => g.letter)).toEqual(['A', 'Z']);
    expect(tie[1]!.entries.map(e => e.anchorId)).toEqual(['term-zeta-a', 'term-zeta-b']);
  });

  it('cross-links to the Trick Dictionary and Freestyle Concepts so a newcomer can tell the three apart', async () => {
    const html = await get('/freestyle/glossary');
    expect(html).toMatch(/<a href="\/freestyle\/tricks">Trick Dictionary<\/a>/);
    expect(html).toMatch(/<a href="\/freestyle\/concepts">Freestyle Concepts<\/a>/);
  });

  it('every entry "more" link with a fragment lands on an anchor that exists on its page', async () => {
    const pageIds = new Map<string, Set<string>>();
    for (const t of GLOSSARY_TERMS) {
      if (!t.moreHref?.includes('#')) continue;
      const [path, anchor] = t.moreHref.split('#') as [string, string];
      if (!pageIds.has(path)) pageIds.set(path, ids(await get(path)));
      expect(pageIds.get(path)!.has(anchor), `${t.term} -> ${path}#${anchor}`).toBe(true);
    }
    // The Concepts page is the main deep-link home and must be among them.
    expect(pageIds.has('/freestyle/concepts')).toBe(true);
  });

  it('every entry "more" link that targets another freestyle page resolves 200', async () => {
    const app = await createApp();
    const paths = new Set(
      GLOSSARY_TERMS
        .map(t => t.moreHref)
        .filter((h): h is string => typeof h === 'string' && !h.startsWith('/freestyle/concepts'))
        .map(h => h.split('#')[0]!),
    );
    for (const p of paths) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(200);
    }
  });
});

describe('GET /freestyle/concepts — Freestyle Concepts', () => {
  it('renders the renamed chapter-based resource', async () => {
    const html = await get('/freestyle/concepts');
    expect(html).toContain('<h1>Freestyle Concepts</h1>');
    expect(html).toContain('<title>Footbag Freestyle Concepts</title>');
    expect(html).toContain('id="chapter-movement-basics"');
    expect(html).toContain('id="chapter-add-accounting"');
    expect(html).toContain('id="section-notation"');
  });

  it('no longer carries "Reading the Dictionary" as its first chapter, and links out to it instead', async () => {
    const html = await get('/freestyle/concepts');
    expect(html).not.toContain('id="chapter-reading-the-dictionary"');
    expect(html).not.toContain('id="section-reading-the-dictionary"');
    expect(html).not.toMatch(/dict-tile-title">Reading the Dictionary</);
    const firstChapter = html.match(/<details class="dict-tile" id="chapter-([a-z-]+)"/);
    expect(firstChapter?.[1]).toBe('movement-basics');
    expect(html).toContain('href="/freestyle/tricks#reading-the-dictionary"');
  });

  it('carries no audience-level sublabels on chapters or sections (no Beginner / Intermediate / Advanced badges)', async () => {
    const html = await get('/freestyle/concepts');
    expect(html).not.toContain('glossary-tier-badge');
    expect(html).not.toMatch(/>\s*Beginner\s*<\/span>/);
    expect(html).not.toMatch(/>\s*Intermediate\s*<\/span>/);
    expect(html).not.toMatch(/>\s*Advanced Reference\s*<\/span>/);
    // The chapter summaries are title + hint only.
    const summaries = [...html.matchAll(/<summary class="dict-tile-summary">([\s\S]*?)<\/summary>/g)].map(m => m[1]!);
    expect(summaries.length).toBeGreaterThan(5);
    for (const s of summaries) expect(s).not.toMatch(/badge/);
  });

  it('never calls itself a glossary in rendered prose, and points readers at the real Glossary', async () => {
    const html = await get('/freestyle/concepts');
    const prose = html
      .replace(/<[^>]+>/g, ' ')            // drop tags (class names may keep the old vocabulary)
      .replace(/\s+/g, ' ');
    expect(prose).not.toMatch(/\b[Tt]his glossary\b/);
    expect(prose).not.toMatch(/\b[Tt]he glossary\b/);
    expect(prose).not.toMatch(/Freestyle Glossary/);
    expect(html).toMatch(/<a href="\/freestyle\/glossary">Glossary<\/a>/);
    // Breadcrumb names the resource by its new identity.
    expect(html).toMatch(/<span>Freestyle Concepts<\/span>/);
  });
});

describe('GET /freestyle/tricks — Reading the Dictionary disclosure', () => {
  it('contains the disclosure, collapsed by default, above the browse controls', async () => {
    const html = await get('/freestyle/tricks');
    const m = html.match(/<details class="dict-tile" id="reading-the-dictionary"[^>]*>/);
    expect(m, 'disclosure present').not.toBeNull();
    expect(m![0]).not.toContain(' open');
    expect(html).toMatch(/dict-tile-title">Reading the Dictionary<\/h2>/);
    expect(html).toContain('id="section-reading-the-dictionary"');
    // Ordering: search card, then the disclosure, then the browse-navigation card.
    const search = html.indexOf('id="dictionary-top"');
    const reading = html.indexOf('id="reading-the-dictionary"');
    const nav = html.indexOf('class="card dict-nav-card"');
    expect(search).toBeGreaterThan(-1);
    expect(reading).toBeGreaterThan(search);
    expect(nav).toBeGreaterThan(reading);
  });

  it('keeps the moved chapter content and its headings, with deep links now targeting Concepts', async () => {
    const html = await get('/freestyle/tricks');
    expect(html).toContain('The trick row');
    expect(html).toContain('The browse views');
    expect(html).toContain('Six kinds of object');
    expect(html).toContain('Reading a compound name');
    expect(html).toContain('href="/freestyle/concepts#section-notation"');
    expect(html).toContain('href="/freestyle/concepts#section-add-accounting"');
    expect(html).toContain('href="/freestyle/concepts#section-families"');
    // No dangling in-page anchors that only existed on the old chaptered page.
    expect(html).not.toMatch(/href="#section-(notation|add-accounting|families|modifiers|dexterities|media-claim-scope)"/);
  });

  it('renders the disclosure on secondary views and the family filter too', async () => {
    for (const path of ['/freestyle/tricks?view=family', '/freestyle/tricks?view=set', '/freestyle/tricks?family=whirl']) {
      const html = await get(path);
      expect(html, path).toContain('id="reading-the-dictionary"');
    }
  });

  it('browse behaviour is unchanged: views, deep links, and detail routes still resolve', async () => {
    const app = await createApp();
    for (const p of ['/freestyle/tricks?view=add', '/freestyle/tricks?view=modifier', '/freestyle/tricks?view=dex-count', '/freestyle/tricks/whirl']) {
      const res = await request(app).get(p);
      expect(res.status, p).toBe(200);
    }
    const html = await get('/freestyle/tricks');
    expect(html).toContain('href="/freestyle/tricks?view=family"');
    expect(html).toContain('/freestyle/tricks/whirl');
  });

  it('the onboarding tile links point at the semantically right destinations', async () => {
    const html = await get('/freestyle/tricks');
    expect(html).toContain('href="/freestyle/tricks#reading-the-dictionary">How to Read the Dictionary.');
    expect(html).toContain('href="/freestyle/concepts#section-add-accounting">What Is an ADD?');
    expect(html).toContain('href="/freestyle/glossary">Look Up a Term in the Glossary.');
    expect(html).not.toContain('/freestyle/glossary#');
  });
});

describe('Cross-surface links land on the right resource', () => {
  it('the freestyle landing offers all three resources as distinct tiles', async () => {
    const html = await get('/freestyle');
    expect(html).toMatch(/href="\/freestyle\/tricks">\s*<span class="banner-tile-title">Trick Dictionary/);
    expect(html).toMatch(/href="\/freestyle\/glossary">\s*<span class="banner-tile-title">Glossary/);
    expect(html).toMatch(/href="\/freestyle\/concepts">\s*<span class="banner-tile-title">Freestyle Concepts/);
  });

  it('deep links from other pages point at Concepts, not the A to Z Glossary', async () => {
    const trick = await get('/freestyle/tricks/whirl');
    expect(trick).toContain('href="/freestyle/concepts#section-notation"');
    expect(trick).not.toContain('/freestyle/glossary#');
    const article = await get('/freestyle/notation-article');
    expect(article).toContain('href="/freestyle/concepts#jobs-notation"');
    expect(article).toContain('Back to Freestyle Concepts');
    const sitemap = await request(await createApp()).get('/sitemap.xml');
    expect(sitemap.text).toContain('/freestyle/concepts');
    expect(sitemap.text).toContain('/freestyle/glossary');
  });
});
