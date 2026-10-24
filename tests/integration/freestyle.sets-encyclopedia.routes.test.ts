/**
 * GET /freestyle/sets — Set Encyclopedia, the one set page.
 *
 * Contract: the set list comes first, each set listed once as its name
 * linking to its detail page plus one line saying what it is, with no
 * notation in the list. Below it: how sets are built, the uptime
 * reinterpretation ladders, Holden's compilation reproduced as an archive,
 * and the sources. The two retired set addresses redirect permanently to
 * their sections here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3159');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// Priority sets that must render their own set page. Furious is the confirmed
// two-dex uptime set page under current doctrine; Barraging and Miraging are not
// sets and redirect to their glossary terms, so they are not priority set pages.
const PRIORITY_SETS = [
  'pixie', 'fairy', 'stepping', 'atomic', 'quantum', 'nuclear',
  'furious', 'blurry', 'surging', 'tapping',
] as const;

const SUBTYPE_KEYS = [
  'true-core', 'composite-derived', 'rotational',
  'whirl-swirl', 'uns', 'rooted-antisymposium',
] as const;

beforeAll(async () => {
  // The set list reads from the CANONICAL_SETS content module, not from
  // freestyle_tricks, so an empty database renders the whole page.
  createTestDb(dbPath).close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// The set list runs from the first subtype section to the first section below
// it, so list-only assertions read just that slice.
function setListOf(html: string): string {
  const start = html.indexOf('id="set-subtype-true-core"');
  const end   = html.indexOf('id="how-sets-are-built"');
  expect(start).toBeGreaterThan(0);
  expect(end).toBeGreaterThan(start);
  return html.slice(start, end);
}

describe('GET /freestyle/sets — the set list', () => {
  it.each(PRIORITY_SETS.map(slug => [slug] as const))(
    '%s is listed by name, linking to its detail page, with one line saying what it is',
    async (slug) => {
      const res = await page('/freestyle/sets');
      expect(res.status).toBe(200);
      const rowStart = res.text.indexOf(`id="enc-set-${slug}"`);
      expect(rowStart).toBeGreaterThan(0);
      const row = res.text.slice(rowStart, res.text.indexOf('</article>', rowStart));
      expect(row).toMatch(new RegExp(`<a class="dict-trick-row-title" href="/freestyle/sets/${slug}">`));
      expect(row).toMatch(/<p class="sets-encyclopedia-card-movement">[^<]+<\/p>/);
    },
  );

  it('carries no notation: the long formulas live on the set detail pages', async () => {
    // Defect caught: a long formula back in the list, running a row off a
    // phone screen and repeating what the detail page says.
    const list = setListOf((await page('/freestyle/sets')).text);
    expect(list).toContain('id="enc-set-pixie"');
    expect(list).not.toContain('<code');
    expect(list).not.toContain('[DEX]');
    const detail = await page('/freestyle/sets/pixie');
    expect(detail.text).toContain('TOE &gt; SAME IN [DEX]');
  });

  it('lists each set exactly once, and nowhere else on the page as a second list', async () => {
    // Defect caught: the retired compositional family cards coming back as a
    // second inventory of the same sets.
    const res = await page('/freestyle/sets');
    const ids = res.text.match(/id="enc-set-[a-z_]+"/g) ?? [];
    expect(ids.length).toBeGreaterThan(0);
    expect(new Set(ids).size).toBe(ids.length);
    expect(res.text).not.toContain('compositional-set-card');
  });

  it('groups the sets by the six subtypes', async () => {
    const res = await page('/freestyle/sets');
    for (const key of SUBTYPE_KEYS) {
      expect(res.text, `subtype section ${key}`).toContain(`id="set-subtype-${key}"`);
    }
  });

  it.each(PRIORITY_SETS.map(slug => [slug] as const))(
    'the detail link for %s resolves to a page, not a 404 or a redirect',
    async (slug) => {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
    },
  );

  it('lists Furious and Blazing, and no Miraging, Barraging or Whirling set', async () => {
    const res = await page('/freestyle/sets');
    expect(res.text).toContain('id="enc-set-furious"');
    expect(res.text).toContain('id="enc-set-blazing"');
    expect(res.text).not.toContain('id="enc-set-miraging"');
    expect(res.text).not.toContain('id="enc-set-barraging"');
    expect(res.text).not.toContain('id="enc-set-whirling"');
    expect(res.text).not.toContain('#set_whirling');
  });

  it('the set sitemap includes furious and blazing and excludes miraging, barraging and whirling', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const slugs = freestyleService.listSitemapSetSlugs();
    expect(slugs).toContain('furious');
    expect(slugs).toContain('blazing');
    expect(slugs).not.toContain('miraging');
    expect(slugs).not.toContain('barraging');
    expect(slugs).not.toContain('whirling');
  });

  it('links the dictionary\'s By set view once, for which tricks use a set', async () => {
    const res = await page('/freestyle/sets');
    // `=` is HTML-escaped to `&#x3D;` in Handlebars output.
    const links = res.text.match(/href="\/freestyle\/tricks\?view(=|&#x3D;)set"/g) ?? [];
    expect(links.length).toBe(1);
  });
});

describe('GET /freestyle/sets — page order and contents', () => {
  it('puts the set list first, then how sets are built, the ladders, the compilation and the sources', async () => {
    const res = await page('/freestyle/sets');
    const order = [
      'id="set-subtype-true-core"',
      'id="how-sets-are-built"',
      'id="uptime-reinterpretation"',
      'id="historical-move-set-reference"',
      'id="sources"',
    ].map(marker => res.text.indexOf(marker));
    for (const at of order) expect(at).toBeGreaterThan(0);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  it('the contents bar links every section on the page, and every target exists', async () => {
    // Defect caught: a contents entry that jumps nowhere.
    const res = await page('/freestyle/sets');
    const tocStart = res.text.indexOf('class="glossary-mini-toc"');
    const toc = res.text.slice(tocStart, res.text.indexOf('</nav>', tocStart));
    const targets = [...toc.matchAll(/href="#([^"]+)"/g)].map(m => m[1]);
    expect(targets).toEqual([
      ...SUBTYPE_KEYS.map(key => `set-subtype-${key}`),
      'how-sets-are-built', 'uptime-reinterpretation', 'historical-move-set-reference', 'sources',
    ]);
    for (const id of targets) expect(res.text, `section ${id}`).toContain(`id="${id}"`);
  });

  it('points each subtype forward to the next, and the last subtype to nothing', async () => {
    const res = await page('/freestyle/sets');
    const footers = res.text.match(/class="glossary-section-next"/g) ?? [];
    expect(footers.length).toBe(SUBTYPE_KEYS.length - 1);
    const lastStart = res.text.indexOf('id="set-subtype-rooted-antisymposium"');
    const last = res.text.slice(lastStart, res.text.indexOf('</section>', lastStart));
    expect(last).not.toContain('glossary-section-next');
  });
});

describe('GET /freestyle/sets — the sections below the list', () => {
  it('how sets are built gives the grammar\'s base shape once', async () => {
    const res = await page('/freestyle/sets');
    const section = res.text.slice(res.text.indexOf('id="how-sets-are-built"'), res.text.indexOf('id="uptime-reinterpretation"'));
    expect(section).toContain('(toe | clip) &gt; [(same | op)(in | out) dexterity]* &gt; (same | op)(toe | clip)');
    expect(section).toContain('Example: <code>Pixie = TOE &gt; SAME IN [DEX] &gt;</code>');
  });

  it('records both readings where Holden and the platform disagree, rather than picking one', async () => {
    // Defect caught: a documented disagreement silently normalized to one reading.
    const res = await page('/freestyle/sets');
    expect(res.text).toMatch(/spinning miraging/);
    expect(res.text).toMatch(/spinning stepping/);
    expect(res.text).toContain('compositional-ladder--conflict');
    expect(res.text).toMatch(/documented disagreement, not normalized/);
  });

  it('presents the older Furious three-dex reading as superseded, not as current structure', async () => {
    const res = await page('/freestyle/sets');
    expect(res.text).toMatch(/superseded/i);
    expect(res.text).not.toContain('Barraging-set extended with a third dex');
  });

  it('declares the compilation\'s source before its table', async () => {
    const res = await page('/freestyle/sets');
    const provenance = res.text.indexOf('Set notation sourced from the freestyle discussion archive');
    const table = res.text.indexOf('class="moves-table"');
    expect(provenance).toBeGreaterThan(-1);
    expect(table).toBeGreaterThan(provenance);
    expect(res.text).toContain('may differ from current platform doctrine');
  });

  it('reproduces the compilation untouched, including names and formulas the platform does not use', async () => {
    // Defect caught: the archive edited to match current doctrine.
    const res = await page('/freestyle/sets');
    const archive = res.text.slice(res.text.indexOf('id="historical-move-set-reference"'), res.text.indexOf('id="sources"'));
    expect(archive).toMatch(/Miraging/);
    expect(archive).toMatch(/Barraging/);
    expect(archive).toContain('SET &gt; OP IN [DEX] &gt;');
    expect(archive).toContain('SET &gt; (no plant while) OP OUT [BOD] [DEX] &gt;');
    expect(archive).toContain('CLIP &gt; OP IN [DEX] &gt; SAME IN [DEX] &gt; OP IN [DEX] &gt;');
  });

  it('keeps the curator audit off the public page', async () => {
    const res = await page('/freestyle/sets');
    expect(res.text).not.toMatch(/<h2[^>]*>Consistency audit<\/h2>/);
    expect(res.text).not.toContain('id="audit"');
    expect(res.text).not.toContain('curatorial transparency');
    expect(res.text).not.toContain('curator workspace');
  });

  it('credits the notation grammar and the compilation in the sources section', async () => {
    const res = await page('/freestyle/sets');
    const sources = res.text.slice(res.text.indexOf('id="sources"'));
    expect(sources).toContain('Ben Job');
    expect(sources).toContain('Chris Holden');
    expect(sources).toContain('href="#historical-move-set-reference"');
  });
});

describe('Retired set addresses', () => {
  it.each([
    ['/freestyle/compositional-sets', '/freestyle/sets#how-sets-are-built'],
    ['/freestyle/sets/reference',     '/freestyle/sets#historical-move-set-reference'],
  ])('%s redirects permanently to its section of /freestyle/sets', async (from, to) => {
    // Defect caught: an old bookmark or outside link dead-ending, or landing
    // at the top of the page instead of the section it was for.
    const res = await request(createApp()).get(from).redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe(to);
    const target = await page('/freestyle/sets');
    expect(target.text).toContain(`id="${to.split('#')[1]}"`);
  });

  it('no freestyle page links to a retired set address', async () => {
    // Defect caught: an internal link that sends every reader through a redirect.
    for (const path of ['/freestyle', '/freestyle/sets', '/freestyle/sets/pixie', '/freestyle/concepts', '/freestyle/learn']) {
      const res = await page(path);
      expect(res.status, path).toBe(200);
      expect(res.text, `${path} links /freestyle/compositional-sets`).not.toContain('href="/freestyle/compositional-sets');
      expect(res.text, `${path} links /freestyle/sets/reference`).not.toContain('href="/freestyle/sets/reference');
    }
  });
});

describe('Cross-link presence on sibling pages', () => {
  it('freestyle landing renders a "Set Encyclopedia" card linking to /freestyle/sets', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('Set Encyclopedia');
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
  });

  it('glossary links to the Set Encyclopedia', async () => {
    const res = await page('/freestyle/glossary');
    expect(res.text).toMatch(/href="\/freestyle\/sets"/);
  });
});
