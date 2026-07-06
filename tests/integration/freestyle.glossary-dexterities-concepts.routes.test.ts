/**
 * Integration tests for the Direction and Side Core Concept cards on
 * GET /freestyle/glossary, rendered in place in the Dexterities section.
 *
 * Each concept renders as a three-layer card: a `line` always visible plus a
 * "How it relates" collapsible, and (for the insight-home Side concept) a "What
 * it reveals" collapsible. Direction is connective and carries no reveal. The
 * existing notation term glossaries in those subsections stay intact. Cards come
 * from the static content module, so they render independent of fixture data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3562');

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

function card(html: string, anchorId: string): string {
  const m = html.match(new RegExp(`id="${anchorId}"[\\s\\S]*?</div>`));
  expect(m, `${anchorId} concept card`).not.toBeNull();
  return m![0];
}

describe('Glossary — Dexterities section Core Concept cards', () => {
  it('renders the Direction concept card: line plus a How-it-relates collapsible, no reveal', async () => {
    const html = await glossary();
    expect(html).toContain('id="concept-direction"');
    const direction = card(html, 'concept-direction');
    expect(direction).toContain('inward or outward'); // the Line
    expect(direction).toContain('<summary>How it relates</summary>');
    // Direction is connective, per the sign-off
    expect(direction).not.toContain('What it reveals');
  });

  it('renders the Side concept card: line, How-it-relates, and a What-it-reveals collapsible', async () => {
    const html = await glossary();
    expect(html).toContain('id="concept-side"');
    const side = card(html, 'concept-side');
    expect(side).toContain('your own side'); // the Line
    expect(side).toContain('<summary>How it relates</summary>');
    // Side is an insight home
    expect(side).toContain('<summary>What it reveals</summary>');
    expect(side).toContain('full structural axis'); // the Reveal
  });

  it('keeps the existing notation term glossaries in both subsections', async () => {
    const html = await glossary();
    // Direction subsection term anchors
    expect(html).toContain('id="term-in-dex"');
    expect(html).toContain('id="term-out-dex"');
    // Relative-side subsection term anchors
    expect(html).toContain('id="term-same-side"');
    expect(html).toContain('id="term-opposite-side"');
  });
});
