/**
 * GET /freestyle/start — the novice entry page — and the landing CTA that
 * points to it.
 *
 * Contract pinned here:
 *   - The landing "New to freestyle? Start here" CTA links to /freestyle/start,
 *     not to the educational-pathways index.
 *   - The novice page defines stall, set, catch, and dexterity in plain words
 *     before the first named trick (Mirage) relies on them.
 *   - No operator abbreviations or scoring notation appear on the novice page.
 *   - Clipper is introduced as a distinct cross-body use of the inside surface,
 *     never as a synonym for an ordinary inside kick.
 *   - Butterfly is gated behind clipper control and never described as two
 *     dexterities.
 *   - The page hands off to the dictionary, the glossary, and Freestyle Concepts,
 *     and ends with the six next-step lessons in reading order.
 *   - The retired /freestyle/learn redirects permanently to those lessons.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3663');

let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(path: string): Promise<string> {
  const res = await getPage(path);
  expect(res.status).toBe(200);
  return res.text;
}

describe('landing CTA', () => {
  it('points "Start here" at the novice page, not the pathways index', async () => {
    const html = await page('/freestyle');
    // Anchored on the pairing the visitor relies on, the control's visible
    // label and where it resolves to, so restyling the control cannot quietly
    // repoint it. Attribute order and presentation classes are deliberately
    // not pinned.
    expect(html).toMatch(/New to freestyle\?/);
    expect(html).toMatch(/<a[^>]*href="\/freestyle\/start"[^>]*>\s*Start Here\s*<\/a>/i);
  });
});

describe('GET /freestyle/start — novice page contract', () => {
  it('renders with the getting-started identity', async () => {
    const html = await page('/freestyle/start');
    expect(html).toContain('Getting Started with Freestyle');
  });

  it('carries no demo video: the clip renders on the freestyle landing alone', async () => {
    const html = await page('/freestyle/start');
    expect(html).not.toContain('demo-video');
    expect(html).not.toContain('<video');
  });

  it('defines stall, set, catch, and dexterity before the Mirage section', async () => {
    const html = await page('/freestyle/start');
    const mirageAt = html.indexOf('Your first named trick');
    expect(mirageAt).toBeGreaterThan(0);
    const beforeMirage = html.slice(0, mirageAt);
    for (const definition of [
      /<strong>stall<\/strong>/,
      /<strong>set<\/strong>/,
      /<strong>catch<\/strong>/,
      /<strong>dexterity<\/strong>/,
    ]) {
      expect(beforeMirage).toMatch(definition);
    }
  });

  it('carries no operator abbreviations or scoring notation', async () => {
    const html = await page('/freestyle/start');
    for (const token of ['PDX', 'XBODY', 'SYMP', '+1 ADD', '[DEX]', '[XBD]', 'XDEX']) {
      expect(html, token).not.toContain(token);
    }
  });

  it('introduces clipper as a distinct cross-body use of the inside surface', async () => {
    const html = await page('/freestyle/start');
    expect(html).toMatch(/clipper<\/strong> is a particular use of the\s+inside surface/);
    expect(html).toContain('not another word for an ordinary inside kick');
  });

  it('gates Butterfly behind clipper control and never calls it two dexterities', async () => {
    const html = await page('/freestyle/start');
    expect(html).toContain('Clipper control, then Butterfly');
    expect(html).not.toMatch(/two dexterities/i);
  });

  it('hands off to the dictionary, the glossary, and Freestyle Concepts, never the retired learning index', async () => {
    const html = await page('/freestyle/start');
    expect(html).toContain('href="/freestyle/tricks"');
    expect(html).toContain('href="/freestyle/glossary"');
    expect(html).toContain('href="/freestyle/concepts"');
    expect(html).toContain('href="/freestyle/families/mirage"');
    expect(html).not.toContain('href="/freestyle/learn"');
  });
});

/** The page from its next-steps section to the end of the main content. */
function nextSteps(html: string): string {
  const start = html.indexOf('id="next-steps"');
  expect(start, 'next-steps section').toBeGreaterThan(-1);
  return html.slice(start, html.indexOf('</main>', start));
}

describe('GET /freestyle/start — ends with the six next-step lessons', () => {
  it('closes the page with the six lessons, each linked, in reading order', async () => {
    const html = await page('/freestyle/start');
    const section = nextSteps(html);
    // The lessons are the last section, after the page's other hand-offs.
    expect(html.indexOf('id="next-steps"')).toBeGreaterThan(html.indexOf('href="/freestyle/concepts"'));
    expect(section).toContain('Six short lessons, in order. Start with the first.');
    // Dexterity, complete trick, catch structure, family, set, modifier.
    const order = [
      '/freestyle/tricks/around_the_world',
      '/freestyle/tricks/mirage',
      '/freestyle/families/butterfly',
      '/freestyle/families/whirl',
      '/freestyle/sets/pixie',
      '/freestyle/modifier/spinning',
    ];
    let last = -1;
    for (const href of order) {
      const at = section.indexOf(`href="${href}"`);
      expect(at, href).toBeGreaterThan(last);
      last = at;
    }
    expect((section.match(/<li>/g) ?? []).length).toBe(order.length);
  });

  it('never describes Butterfly as two dexterities', async () => {
    expect(nextSteps(await page('/freestyle/start'))).not.toMatch(/two dexterities/i);
  });
});

describe('GET /freestyle/learn — retired, redirects to the lessons', () => {
  it('redirects permanently to the next-steps section of the getting-started page', async () => {
    const res = await getPage('/freestyle/learn');
    expect(res.status).toBe(301);
    expect(res.headers.location).toBe('/freestyle/start#next-steps');
  });
});
