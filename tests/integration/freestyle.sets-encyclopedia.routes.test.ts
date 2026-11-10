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
import Handlebars from 'handlebars';
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
  it('records both readings where Holden and the platform disagree, rather than picking one', async () => {
    // Defect caught: a documented disagreement silently normalized to one reading.
    const res = await page('/freestyle/sets');
    const { UPTIME_REINTERPRETATION_LADDERS } = await import('../../src/content/freestyleCompositionalSets');
    const disputed = UPTIME_REINTERPRETATION_LADDERS.filter(ladder => ladder.conflictNote !== null);
    expect(disputed.length).toBeGreaterThan(0);
    for (const ladder of disputed) {
      expect(res.text, ladder.setName).toContain(Handlebars.escapeExpression(ladder.conflictNote!));
    }
  });

  it('does not present the older Furious three-dex reading as current structure', async () => {
    const res = await page('/freestyle/sets');
    expect(res.text).not.toContain('Barraging-set extended with a third dex');
  });

  it('declares the compilation\'s source before its table', async () => {
    // Defect caught: the compilation shown with an empty source note.
    const res = await page('/freestyle/sets');
    const archive = res.text.slice(res.text.indexOf('id="historical-move-set-reference"'));
    const note = /<p class="source-note">[^<]+<\/p>/.exec(archive);
    expect(note, 'non-empty source note').not.toBeNull();
    expect(archive.indexOf('class="moves-table"')).toBeGreaterThan(note!.index);
  });

  it('shows a notation on every row of the compilation table', async () => {
    // Defect caught: the notation column lost, leaving a table of bare names.
    const res = await page('/freestyle/sets');
    const archive = res.text.slice(res.text.indexOf('class="moves-table"'), res.text.indexOf('</table>'));
    const rows = [...archive.matchAll(/<tr id="(move-[^"]+)">([\s\S]*?)<\/tr>/g)];
    expect(rows.length).toBeGreaterThan(0);
    for (const [, id, cells] of rows) {
      expect(cells, id).toMatch(/<td><code>[^<]+<\/code><\/td>/);
    }
  });

  it('keeps the curator audit off the public page', async () => {
    const res = await page('/freestyle/sets');
    expect(res.text).not.toMatch(/<h2[^>]*>Consistency audit<\/h2>/);
    expect(res.text).not.toContain('id="audit"');
    expect(res.text).not.toContain('curatorial transparency');
    expect(res.text).not.toContain('curator workspace');
  });
});

describe('Retired set addresses', () => {
  it('each retired set address answers not-found, with no redirect', async () => {
    // Defect caught: a retired set page of the unlaunched site still forwarding
    // to /freestyle/sets, or "reference" being read as a set slug and rendered.
    for (const from of ['/freestyle/compositional-sets', '/freestyle/sets/reference']) {
      const res = await request(createApp()).get(from).redirects(0);
      expect(res.status, from).toBe(404);
      expect(res.headers['location'], from).toBeUndefined();
    }
  });

  it('no freestyle page links to a retired set address', async () => {
    // Defect caught: an internal link that sends every reader through a redirect.
    for (const path of ['/freestyle', '/freestyle/sets', '/freestyle/sets/pixie', '/freestyle/concepts', '/freestyle/start']) {
      const res = await page(path);
      expect(res.status, path).toBe(200);
      expect(res.text, `${path} links /freestyle/compositional-sets`).not.toContain('href="/freestyle/compositional-sets');
      expect(res.text, `${path} links /freestyle/sets/reference`).not.toContain('href="/freestyle/sets/reference');
    }
  });
});
