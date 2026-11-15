/**
 * Integration tests for Freestyle Concepts content expansion.
 *
 * Long-term contract pinned:
 *
 *   Dexterities: the in-dex / out-dex direction vocabulary keeps its term
 *      anchors.
 *
 *   Sources: names the source families with no individual contributors
 *      named inline.
 *
 *   Landing page: the "Educational pathways →" chip is removed from the
 *      Tutorials & Learning card.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';

const { dbPath } = setTestEnv('3099');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Freestyle Concepts — Direction vocabulary', () => {
  it('renders the in-dex term anchor and definition', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="term-in-dex"');
    expect(res.text).toMatch(/In-dex/);
  });

  it('renders the out-dex term anchor and definition', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="term-out-dex"');
    expect(res.text).toMatch(/Out-dex/);
  });

});

describe('Freestyle Concepts — named source families', () => {
  it('renders the source-families list', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('class="glossary-sources-list"');
  });

  it('names the five source families inline', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('footbag.org');
    expect(res.text).toContain('PassBack');
    expect(res.text).toContain('Stanford shorthand');
    expect(res.text).toContain('footbagmoves.com');
    expect(res.text).toContain('AnzTrikz');
    expect(res.text).toContain('Footbag Finland');
  });

  it('names no individual in the sources section', async () => {
    const res = await page('/freestyle/concepts');
    const start = res.text.indexOf('id="section-sources"');
    expect(start).toBeGreaterThan(-1);
    const sources = res.text.slice(start, res.text.indexOf('</section>', start));
    expect(sources).toContain('glossary-sources-list');
    for (const name of ['Ben Job', 'Matt Kemmer', 'Ben Lynn', 'Red Husted', 'Steve Goldberg', 'Chris Holden']) {
      expect(sources, name).not.toContain(name);
    }
  });
});

describe('Landing page — Watch & Learn card', () => {
  it('does not render the retired "Educational pathways" chip', async () => {
    // The Educational-pathways chip is not rendered on the landing
    // tutorials card ("Watch & Learn"); the chip must not return.
    const res = await page('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Educational pathways &rarr;');
  });

  it('routes tutorials to the Freestyle Media section instead of an inline gallery card', async () => {
    const res = await page('/freestyle');
    expect(res.text).not.toContain('<div class="card-title">Watch &amp; Learn</div>');
    expect(res.text).toContain('href="/freestyle/media"');
  });
});
