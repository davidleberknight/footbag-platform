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
 *   - The page hands off to Learn, the dictionary, and the glossary.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('3663');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function page(path: string): Promise<string> {
  const res = await request(await createApp()).get(path);
  expect(res.status).toBe(200);
  return res.text;
}

describe('landing CTA', () => {
  it('points "Start here" at the novice page, not the pathways index', async () => {
    const html = await page('/freestyle');
    expect(html).toMatch(/New to freestyle\?\s*<a href="\/freestyle\/start">/);
  });
});

describe('GET /freestyle/start — novice page contract', () => {
  it('renders with the getting-started identity', async () => {
    const html = await page('/freestyle/start');
    expect(html).toContain('Getting Started with Freestyle');
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

  it('hands off to Learn, the dictionary, and the glossary', async () => {
    const html = await page('/freestyle/start');
    expect(html).toContain('href="/freestyle/learn"');
    expect(html).toContain('href="/freestyle/tricks"');
    expect(html).toContain('href="/freestyle/glossary"');
    expect(html).toContain('href="/freestyle/families/mirage"');
  });
});

describe('GET /freestyle/learn — reframed as the pathways index', () => {
  it('presents the six lessons as a vocabulary tour, not a physical beginner curriculum', async () => {
    const html = await page('/freestyle/learn');
    expect(html).toContain('Six lessons: how the vocabulary fits together');
    expect(html).not.toContain('shortest path from your first dexterity');
  });

  it('never describes Butterfly as two dexterities', async () => {
    const html = await page('/freestyle/learn');
    expect(html).not.toMatch(/two dexterities/i);
  });

  it('does not claim the operator board must be learned first, and does not miscount it', async () => {
    const html = await page('/freestyle/learn');
    expect(html).not.toContain('Learn these fourteen primitives first');
    expect(html).not.toContain('fourteen primitives');
    expect(html).toContain('Explore the movement-language index');
  });

  it('renders the lessons before the operator board', async () => {
    const html = await page('/freestyle/learn');
    const lessons = html.indexOf('Six lessons: how the vocabulary fits together');
    const board = html.indexOf('Explore the movement-language index');
    const progressions = html.indexOf('Progressions');
    expect(lessons).toBeGreaterThan(0);
    expect(progressions).toBeGreaterThan(lessons);
    expect(board).toBeGreaterThan(progressions);
  });
});
