/**
 * The dictionary's family view shows one family at a time.
 *
 * /freestyle/tricks?view=family opens on the first family in the stored family
 * order; ?view=family&family=<slug> is each family's own address; a family the
 * view does not render is a 404. A chip row lists every rendered family in the
 * stored order and marks the one on screen. The fixture stores an order that is
 * not alphabetical (whirl before mirage), so a default or chip order taken from
 * anything but the stored order fails.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleFamily, insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3947');

let createApp: Awaited<ReturnType<typeof importApp>>;
const getPage = cachedGet(() => createApp());

const FAMILY_VIEW = '/freestyle/tricks?view=family';
const MIRAGE_PAGE = '/freestyle/tricks?view=family&family=mirage';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleFamily(db, { slug: 'whirl', sort_order: 1 });
  insertFreestyleFamily(db, { slug: 'mirage', sort_order: 2 });
  insertFreestyleFamily(db, { slug: 'flurry', sort_order: 3, tier: 'minor_lineage' });

  const row = (slug: string, family: string, adds: string) => insertFreestyleTrick(db, {
    slug, canonical_name: slug.replace(/_/g, ' '), adds, base_trick: family, trick_family: family,
    category: slug === family ? 'dex' : 'compound', review_status: 'expert_reviewed', is_active: 1,
  });
  row('whirl', 'whirl', '3');
  row('paradox_whirl', 'whirl', '4');
  row('blurry_whirl', 'whirl', '5');
  row('mirage', 'mirage', '2');
  row('smear', 'mirage', '3');
  row('blur', 'mirage', '4');
  row('flurry', 'flurry', '4');
  row('stepping_flurry', 'flurry', '5');
  row('pixie_flurry', 'flurry', '5');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function familySections(html: string): string[] {
  return [...html.matchAll(/<section class="content-section trick-family-group" id="family-([a-z_]+)"/g)]
    .map(m => m[1]!);
}

function chips(html: string): { label: string; current: boolean; href: string | null }[] {
  const nav = html.match(/<nav class="jump-bar jump-bar--wide" aria-label="Browse by family">([\s\S]*?)<\/nav>/)?.[1] ?? '';
  return [...nav.matchAll(/<span aria-current="page"[^>]*>([^<]+)<\/span>|<a href="([^"]+)">([^<]+)<\/a>/g)]
    .map(m => (m[1] !== undefined
      ? { label: m[1], current: true, href: null }
      : { label: m[3]!, current: false, href: m[2]! }));
}

describe('the family view shows one family at a time', () => {
  // Defect caught: the bare family view renders every family on one page again,
  // or opens on a family chosen by name rather than the stored order.
  it('opens on the first family in the stored order, and only that family', async () => {
    const res = await getPage(FAMILY_VIEW);
    expect(res.status).toBe(200);
    expect(familySections(res.text)).toEqual(['whirl']);
  });

  // Defect caught: a family's own address shows the wrong family or several.
  it('shows exactly the named family at its own address', async () => {
    const res = await getPage(MIRAGE_PAGE);
    expect(res.status).toBe(200);
    expect(familySections(res.text)).toEqual(['mirage']);
    expect(res.text).toContain('href="/freestyle/tricks/smear"');
    expect(res.text).not.toContain('href="/freestyle/tricks/paradox_whirl"');
  });

  // Defect caught: a minor lineage is left without a page of its own, as it was
  // when it only had a band at the foot of the all-families page.
  it('gives a minor lineage its own page too', async () => {
    const res = await getPage('/freestyle/tricks?view=family&family=flurry');
    expect(res.status).toBe(200);
    expect(familySections(res.text)).toEqual(['flurry']);
  });

  // Defect caught: an unknown family silently shows some other family, so a
  // mistyped or stale link looks like it worked.
  it('answers 404 for a family the view does not render', async () => {
    const res = await getPage('/freestyle/tricks?view=family&family=no_such_family');
    expect(res.status).toBe(404);
  });

  // Defect caught: the selector loses a family, reorders them by name, marks no
  // family or the wrong one as current, or links a chip somewhere other than the
  // family's own address.
  it('lists every family in the stored order and marks the one on screen', async () => {
    const res = await getPage(MIRAGE_PAGE);
    expect(chips(res.text)).toEqual([
      { label: 'Whirl', current: false, href: '/freestyle/tricks?view=family&amp;family=whirl' },
      { label: 'Mirage', current: true, href: null },
      { label: 'Flurry', current: false, href: '/freestyle/tricks?view=family&amp;family=flurry' },
    ]);
  });

  // Defect caught: the family heading links to the filtered ADD dictionary
  // instead of the page the reader is on, so copying it gives the wrong page.
  it('links the family heading to the family\'s own address', async () => {
    const res = await getPage(MIRAGE_PAGE);
    expect(res.text).toMatch(/<h2><a href="\/freestyle\/tricks\?view=family&amp;family=mirage">Mirage family<\/a><\/h2>/);
  });

  // Defect caught: the cut scaffolding comes back (the in-page jump index, the
  // minor-lineages band, the curation box, the scale line, the family-anchor
  // and shared-structure lines), or the base-form band regains a heading.
  it('carries none of the removed family-view scaffolding', async () => {
    const res = await getPage(MIRAGE_PAGE);
    for (const marker of [
      'aria-label="Jump to family"', 'id="minor-lineages"', 'class="browse-view-why"',
      'class="browse-view-scale"', 'trick-family-anchor-sublabel', 'trick-family-shared-structure',
      'family-view-ordering-note',
    ]) {
      expect(res.text, marker).not.toContain(marker);
    }
    expect(res.text).not.toMatch(/<h3 class="family-rung-header">Core<\/h3>/);
  });

  // Defect caught: the family view's family parameter is read as the hashtag
  // filter, which adds the filtered-dictionary intro and its clear-filter link.
  it('does not treat the family parameter as the dictionary filter', async () => {
    const res = await getPage(MIRAGE_PAGE);
    expect(res.text).not.toContain('Clear the filter');
  });
});

describe('links into the family view open the family\'s own page', () => {
  // Defect caught: a trick page's "browse the family" link still jumps to an
  // anchor on the old all-families page, which no longer renders that family.
  it('the trick page links its family to that family\'s page', async () => {
    const res = await getPage('/freestyle/tricks/smear');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks?view=family&amp;family=mirage"');
    expect(res.text).not.toContain('view=family#family-');
  });
});
