/**
 * Integration tests for the Set vs Operator and Composition Core Concept cards on
 * GET /freestyle/glossary, rendered in place at the top of the Operators &
 * Modifiers section.
 *
 * Set vs Operator is an insight home (Line + "How it relates" + "What it
 * reveals"); Composition is connective (Line + "How it relates", no reveal). The
 * section's existing modifier-ecosystem content stays intact. Cards come from the
 * static content module, so they render independent of fixture data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3564');

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

describe('Glossary — Operators & Modifiers grammar concept cards', () => {
  it('renders the Set-role vs standalone-role card as an insight home: line, relates, and a reveal', async () => {
    const html = await glossary();
    expect(html).toContain('id="concept-set-vs-operator"');
    const svo = card(html, 'concept-set-vs-operator');
    expect(svo).toContain('realized two ways'); // the Line
    // The example is the set/standalone naming split, not the trick/modifier pair.
    expect(svo).toContain('Atomic');
    expect(svo).toContain('Illusioning');
    expect(svo).not.toContain('barraging');
    expect(svo).toContain('<summary>How it relates</summary>');
    expect(svo).toContain('<summary>What it reveals</summary>');
  });

  it('renders the Composition card as connective: line and relates, no reveal', async () => {
    const html = await glossary();
    expect(html).toContain('id="concept-composition"');
    const comp = card(html, 'concept-composition');
    expect(comp).toContain('base move with operators'); // the Line
    expect(comp).toContain('<summary>How it relates</summary>');
    expect(comp).not.toContain('What it reveals');
  });

  it('keeps the section modifier-ecosystem content intact', async () => {
    const html = await glossary();
    expect(html).toContain('id="lineage-or-ecosystem"');
    expect(html).toContain('Modifiers form');
  });
});
