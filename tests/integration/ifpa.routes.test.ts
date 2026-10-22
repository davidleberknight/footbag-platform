import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3115');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /ifpa — IFPA governance hub', () => {
  it('renders every governance doc card with hrefs', async () => {
    const res = await page('/ifpa');
    expect(res.status).toBe(200);
    expect(res.text).toContain('IFPA Membership Rules');
    expect(res.text).toContain('IFPA Bylaws');
    expect(res.text).toContain('Articles of Incorporation');
    expect(res.text).toContain('Requirements and Guidelines for IFPA Event Sanctioning');
    expect(res.text).toContain('href="/ifpa/membership-structure"');
    expect(res.text).toContain('href="/ifpa/bylaws"');
    expect(res.text).toContain('href="/ifpa/articles"');
    expect(res.text).toContain('href="/ifpa/sanctioning-guidelines"');
  });

  // Worlds host bids are taken off the platform on a form IFPA maintains; without
  // this link a would-be host has no way to find it.
  it('links to the Worlds host-bid template', async () => {
    const res = await page('/ifpa');
    expect(res.text).toMatch(/<a href="https:\/\/docs\.google\.com\/document\/d\/[^"]+"[^>]*class="external-link btn btn-outline">Worlds Host-bid Template<\/a>/);
  });

  it('highlights the IFPA nav entry as active', async () => {
    const res = await page('/ifpa');
    expect(res.text).toMatch(/<a href="\/ifpa" class="active">IFPA<\/a>/);
  });
});

describe('GET /ifpa/membership-structure', () => {
  it('renders the markdown body with at least one h2 anchor', async () => {
    const res = await page('/ifpa/membership-structure');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<h2 id="[^"]+">/);
  });

  it('contains the canonical tier names', async () => {
    const res = await page('/ifpa/membership-structure');
    expect(res.text).toContain('Tier 0');
    expect(res.text).toContain('IFPA Director');
  });

  it('renders a TOC whose entries each target an h2 anchor on the page', async () => {
    const res = await page('/ifpa/membership-structure');
    const toc = res.text.match(/<nav class="rules-toc"[\s\S]*?<\/nav>/)?.[0] ?? '';
    const targets = [...toc.matchAll(/href="#([^"]+)"/g)].map((m) => m[1]);
    expect(targets.length).toBeGreaterThan(0);
    for (const id of targets) expect(res.text, id).toContain(`<h2 id="${id}">`);
  });
});

describe('GET /ifpa/bylaws', () => {
  it('returns 200 and renders the IFPA name', async () => {
    const res = await page('/ifpa/bylaws');
    expect(res.status).toBe(200);
    expect(res.text).toContain('International Footbag Players');
  });
});

describe('GET /ifpa/articles', () => {
  it('returns 200 and renders incorporation language', async () => {
    const res = await page('/ifpa/articles');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Articles of Incorporation');
  });
});

describe('GET /ifpa/sanctioning-guidelines', () => {
  // Every organizer requesting sanctioning attests to these guidelines; without
  // this page they would be agreeing to terms they cannot read.
  it('renders the guidelines an organizer attests to, with the after-event deadline', async () => {
    const res = await page('/ifpa/sanctioning-guidelines');
    expect(res.status).toBe(200);
    expect(res.text.match(/<h1[\s>]/g)?.length).toBe(1);
    const article = res.text.match(/<article class="markdown-body">[\s\S]*?<\/article>/)?.[0] ?? '';
    expect(article).toContain('What you agree to.');
    expect(article).toContain('Within 20 days of the event&#39;s last day');
    expect(article).toContain('sanctioning@footbag.org');
  });

  // The guidelines promise the IFPA logo "available to download from this page"
  // at print quality; a link to a file that is not served breaks that promise.
  it('offers the IFPA logo as a vector PDF and every logo link resolves to the file', async () => {
    const res = await page('/ifpa/sanctioning-guidelines');
    const article = res.text.match(/<article class="markdown-body">[\s\S]*?<\/article>/)?.[0] ?? '';
    const hrefs = [...article.matchAll(/href="(\/img\/[^"]+)"/g)].map((m) => m[1]!);
    expect(hrefs.some((h) => h.endsWith('.pdf'))).toBe(true);
    for (const href of hrefs) {
      const file = await page(href);
      expect(file.status, href).toBe(200);
      expect(file.headers['content-type'], href).toMatch(/^(application\/pdf|image\/png)/);
    }
  });
});

describe('governance document pages carry a search description', () => {
  // Without one, a search result shows whatever text the engine scrapes from the
  // document body, which for the bylaws is a run of capitalised article headings.
  it('renders a non-empty meta description on every governance document', async () => {
    for (const path of ['/ifpa/membership-structure', '/ifpa/bylaws', '/ifpa/articles', '/ifpa/sanctioning-guidelines']) {
      const res = await page(path);
      expect(res.text, path).toMatch(/<meta name="description" content="[^"]{20,}" \/>/);
    }
  });
});

describe('governance document pages carry one page subject', () => {
  // Each document's markdown opens with its own top-level heading. Rendered as a
  // second h1 beside the page title, a screen reader announces two page
  // subjects; the document heading keeps its text but ranks below the title.
  const docs: Array<{ path: string; ownHeading: string }> = [
    { path: '/ifpa/membership-structure', ownHeading: 'IFPA Membership Rules' },
    { path: '/ifpa/bylaws', ownHeading: "INTERNATIONAL FOOTBAG PLAYERS' ASSOCIATION, INC." },
    { path: '/ifpa/articles', ownHeading: 'Articles of Incorporation' },
  ];

  it('renders exactly one h1 and keeps the document heading as an h2', async () => {
    for (const { path, ownHeading } of docs) {
      const res = await page(path);
      expect(res.status, path).toBe(200);
      expect(res.text.match(/<h1[\s>]/g)?.length, path).toBe(1);
      const article = res.text.match(/<article class="markdown-body">[\s\S]*?<\/article>/)?.[0] ?? '';
      expect(article, path).toMatch(new RegExp(`<h2[^>]*>${ownHeading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}</h2>`));
    }
  });

  it('keeps the demoted document heading out of the page table of contents', async () => {
    // The table of contents lists the document's sections; the document's own
    // title is not one of them, so demoting it must not add a TOC entry.
    const res = await page('/ifpa/membership-structure');
    const toc = res.text.match(/<nav class="rules-toc"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(toc).not.toContain('IFPA Membership Rules');
  });
});

describe('GET /ifpa/:unknown', () => {
  it('returns 404 for an unknown doc slug', async () => {
    const res = await page('/ifpa/nonexistent-doc');
    expect(res.status).toBe(404);
  });
});
