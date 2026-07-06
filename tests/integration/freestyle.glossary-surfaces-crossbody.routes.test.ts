/**
 * Integration tests for the Cross-body Core Concept card on GET /freestyle/glossary,
 * rendered in place in the Surfaces section's "Foundational surfaces" subsection.
 *
 * Cross-body is a connective concept, so it renders as a two-layer card: a `line`
 * always visible plus a "How it relates" collapsible, and no "What it reveals".
 * The existing toe / clipper surface terms stay intact. The card comes from the
 * static content module, so it renders independent of fixture data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3563');

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

describe('Glossary — Surfaces section Cross-body concept card', () => {
  it('renders the Cross-body card: line plus a How-it-relates collapsible, no reveal', async () => {
    const html = await glossary();
    expect(html).toContain('id="concept-cross-body"');
    const crossBody = card(html, 'concept-cross-body');
    expect(crossBody).toContain('reaches across'); // the Line
    expect(crossBody).toContain('<summary>How it relates</summary>');
    // Cross-body is connective, per the sign-off
    expect(crossBody).not.toContain('What it reveals');
  });

  it('keeps the foundational surface terms in the subsection', async () => {
    const html = await glossary();
    expect(html).toContain('id="term-toe"');
    expect(html).toContain('id="term-clipper"');
  });
});
