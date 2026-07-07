/**
 * Integration tests for the flat chapter architecture on GET /freestyle/glossary.
 *
 * The glossary is a compact reference manual: a short intro, then a stack of
 * independently collapsible chapters, each a `<details class="glossary-topic">`
 * whose summary carries the chapter title and a one-line description. There is
 * no Foundations-vs-topics split, no shelf header, and no sidebar; the chapter
 * stack is the table of contents. This suite pins that contract: the chapters
 * render as peers in reading order, each with a title and a description, and the
 * removed scaffolding stays gone.
 *
 * It deliberately does NOT assert a fixed chapter count or any open/closed
 * state, so a future chapter (Doctrine & Insights, The Frontier) can join and
 * either default state is free to choose at design time.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3571');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

const CHAPTER_IDS_IN_ORDER = [
  'id="chapter-reading-the-dictionary"',
  'id="chapter-movement-basics"',
  'id="chapter-contact-surfaces"',
  'id="chapter-dexterities"',
  'id="chapter-timing-sets"',
  'id="chapter-operators-modifiers"',
  'id="chapter-family-encyclopedia"',
  'id="chapter-structural-analysis"',
  'id="chapter-runs-sequences"',
  'id="chapter-reference-history"',
];

describe('Glossary — flat chapter architecture (reference-manual table of contents)', () => {
  it('renders every major topic as an independently collapsible chapter, in reading order', async () => {
    const html = await glossary();
    let prev = -1;
    for (const id of CHAPTER_IDS_IN_ORDER) {
      const at = html.indexOf(id);
      expect(at, `${id} present`).toBeGreaterThan(-1);
      expect(at, `${id} in reading order`).toBeGreaterThan(prev);
      // each chapter id sits on a collapsible topic details
      expect(html).toContain(`<details class="glossary-topic" ${id}>`);
      prev = at;
    }
  });

  it('gives each chapter a title and a one-line description in its summary', async () => {
    const html = await glossary();
    expect(html).toContain('class="glossary-topic-card-title"');
    expect(html).toContain('class="glossary-topic-card-hook"');
    // titles
    expect(html).toContain('>Reading the Dictionary<');
    expect(html).toContain('>Movement Basics<');
    expect(html).toContain('>Structural Analysis<');
    // one-line descriptions (spot check)
    expect(html).toContain('The twelve core atoms and the vocabulary every trick is built from.');
    expect(html).toContain('How to read any trick name as a formula.');
    expect(html).toContain('How individual tricks combine into runs.');
  });

  it('keeps the Twelve Core Atoms inside Movement Basics, not a separate chapter', async () => {
    const html = await glossary();
    const basicsAt   = html.indexOf('id="section-core-concepts"');
    const atomsAt    = html.indexOf('id="core-trick-atoms"');
    const surfacesAt = html.indexOf('id="section-surfaces"');
    expect(basicsAt).toBeGreaterThan(-1);
    expect(atomsAt).toBeGreaterThan(basicsAt);
    expect(atomsAt).toBeLessThan(surfacesAt);
    // no chapter is dedicated to the atoms
    expect(html).not.toContain('id="chapter-core-atoms"');
    expect(html).not.toContain('id="chapter-twelve-core-atoms"');
  });

  it('opens with a short intro paragraph and no navigation scaffolding', async () => {
    const html = await glossary();
    expect(html).toContain('A reference for freestyle');
    expect(html).toContain('class="glossary-intro-card-lede"');
    // the removed scaffolding stays gone
    expect(html).not.toContain('glossary-topics-header');
    expect(html).not.toContain('You now know enough to read any trick');
    expect(html).not.toContain('glossary-sidebar');
    expect(html).not.toContain('glossary-section-next');
    // the old chapter-summary disclosure is retired
    expect(html).not.toContain('glossary-chapter-summary');
    expect(html).not.toContain('class="glossary-chapter"');
  });
});
