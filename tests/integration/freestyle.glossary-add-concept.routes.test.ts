/**
 * Integration tests for the ADD Core Concept card on GET /freestyle/glossary,
 * rendered in place in the Trick Naming & Notation section.
 *
 * ADD is an insight home, and because the card sits in the notation section, its
 * bracket-count checksum reveal lands here: a Line, a "How it relates" collapsible,
 * and a "What it reveals" collapsible. The existing notation content stays intact.
 * The card comes from the static content module, so it renders independent of
 * fixture data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3565');

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

describe('Glossary — Notation section ADD concept card', () => {
  it('renders the ADD card as an insight home: line, relates, and the checksum reveal', async () => {
    const html = await glossary();
    expect(html).toContain('id="concept-add"');
    const add = card(html, 'concept-add');
    expect(add).toContain('difficulty score'); // the Line
    expect(add).toContain('<summary>How it relates</summary>');
    expect(add).toContain('<summary>What it reveals</summary>');
    expect(add).toContain('checks itself'); // the checksum reveal
  });

  it('keeps the existing notation section content intact', async () => {
    const html = await glossary();
    expect(html).toContain('id="compositional-premise"');
    expect(html).toContain('id="section-notation"');
  });
});
