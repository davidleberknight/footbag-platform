import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3986');

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { cachedGet } from '../fixtures/cachedGet';

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  createTestDb(dbPath);
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
});

describe('freestyle landing reference banners', () => {
  it('embeds no foundations mosaic: the clips live in their own gallery', async () => {
    const res = await page('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="tricks-mosaic"');
    expect(res.text).not.toContain('tricks-mosaic-cell');
    expect(res.text).not.toContain('See All Foundations');
  });

  it('renders the two reference banners and retires Start Here / Go Deeper', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('The Language of Freestyle');
    expect(res.text).toContain('Analysis &amp; Competition');
    // The retired cards were headed "Start Here" and "Go Deeper". Anchored on
    // a heading rather than the bare strings, because the beginner on-ramp is
    // a button reading "Start Here" and that control is not a portal card.
    expect(res.text).not.toMatch(/<h[1-6][^>]*>\s*Start Here\s*<\/h[1-6]>/);
    expect(res.text).not.toMatch(/<h[1-6][^>]*>\s*Go Deeper\s*<\/h[1-6]>/);
    expect(res.text).toContain('Freestyle Media');
    expect(res.text).toContain('href="/freestyle/media"');
  });

  it('Freestyle Media section is a single invite into the consolidated media page', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('Browse Freestyle Media');
    expect(res.text).toContain('href="/freestyle/media"');
    // The per-collection sub-tiles live on /freestyle/media; the landing does
    // not list them separately, which would duplicate that section.
    expect(res.text).not.toContain('Freestyle Records Videos');
    expect(res.text).not.toContain('Individual Shred Videos');
  });

  it('links to Freestyle by the Numbers and embeds none of it', async () => {
    // The histograms and their shared denominator note live on that page; the
    // landing links into it rather than embedding it.
    const landing = await page('/freestyle');
    expect(landing.text).toContain('href="/freestyle/by-the-numbers"');
    expect(landing.text).not.toContain('by-numbers-grid');
    expect(landing.text).not.toContain('Counts cover');
  });
});

describe('freestyle landing destinations', () => {
  it('still links every destination its story requires', async () => {
    // Defect caught: a cut taking away a link the landing must carry. The
    // dictionary and records tiles render only once their tables hold rows;
    // the portal suite seeds those and checks both links.
    const res = await page('/freestyle');
    for (const href of [
      '/freestyle/start',
      '/freestyle/glossary',
      '/freestyle/concepts',
      '/freestyle/sets',
      '/freestyle/operators',
      '/freestyle/media',
      '/freestyle/competition',
      '/freestyle/history',
      '/rules/freestyle/footbag-freestyle',
      '/equipment#freestyle',
    ]) {
      expect(res.text, `landing link to ${href}`).toContain(`href="${href}"`);
    }
  });

  it('keeps every page without a landing tile one click from a page the landing links', async () => {
    // Defect caught: a page dropped from the landing left with no link to it
    // anywhere, reachable only by typing its address.
    const reachedFrom: Array<[string, string]> = [
      ['/freestyle/start', '/freestyle/about'],
      ['/freestyle/start', '/freestyle/by-the-numbers'],
      ['/freestyle/start', '/freestyle/observational'],
      ['/freestyle/competition', '/freestyle/partnerships'],
    ];
    const landing = await page('/freestyle');
    for (const [from, to] of reachedFrom) {
      expect(landing.text, `landing links ${from}`).toContain(`href="${from}"`);
      const res = await page(from);
      expect(res.status).toBe(200);
      expect(res.text, `${from} links ${to}`).toContain(`href="${to}"`);
    }
  });
});

describe('freestyle landing beginner on-ramp', () => {
  it('funnels newcomers to the getting-started page, below the intro prose', async () => {
    const res = await request(createApp()).get('/freestyle');
    expect(res.status).toBe(200);
    // The on-ramp is a plain line and a standard outline button. It carries no
    // callout panel: a one-line pointer does not need chrome around it to be
    // seen.
    expect(res.text).toMatch(/New to freestyle\?/i);
    expect(res.text).toMatch(/<a class="btn btn-outline" href="\/freestyle\/start">/);
    const introAt   = res.text.indexOf('What is Freestyle Footbag?');
    const pointerAt = res.text.indexOf('href="/freestyle/start"');
    const bannerAt  = res.text.indexOf('>The Language of Freestyle<');
    expect(introAt).toBeGreaterThan(-1);
    expect(pointerAt).toBeGreaterThan(introAt);
    expect(bannerAt).toBeGreaterThan(pointerAt);
  });
});
