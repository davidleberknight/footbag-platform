/**
 * Integration tests for the twelve core trick atoms band on GET /freestyle/glossary.
 *
 * The band renders the curator-authored CORE_ATOM_EDUCATIONAL entries as
 * three-layer cards: a `line` always visible, a "How it relates" collapsible on
 * every atom, and a "What it reveals" collapsible only on the four insight-home
 * atoms (toe stall, clipper stall, mirage, butterfly). Connective atoms carry no
 * reveal; whirl and swirl are connective, with their surface-frame reveal
 * deferred. This suite locks that structure. Cards come from the static content
 * module, so they render independent of fixture data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3561');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

function card(html: string, slug: string): string {
  const m = html.match(new RegExp(`id="atom-${slug}"[\\s\\S]*?</article>`));
  expect(m, `${slug} atom card`).not.toBeNull();
  return m![0];
}

describe('Glossary — core trick atoms band', () => {
  it('renders the core trick atoms band with atom anchors', async () => {
    const html = await glossary();
    expect(html).toContain('id="core-trick-atoms"');
    expect(html).toContain('id="atom-toe_stall"');
    expect(html).toContain('id="atom-osis"');
  });

  it('renders each atom as a three-layer card: line visible, relates collapsible', async () => {
    const html = await glossary();
    const cardCount    = (html.match(/class="glossary-core-atom-card"/g) ?? []).length;
    const lineCount    = (html.match(/class="glossary-core-atom-lead"/g) ?? []).length;
    const relatesCount = (html.match(/<summary>How it relates<\/summary>/g) ?? []).length;
    expect(cardCount).toBe(12);
    // every atom's Line is present (always visible) and every atom has a
    // How-it-relates collapsible wired through
    expect(lineCount).toBe(cardCount);
    expect(relatesCount).toBe(cardCount);
  });

  it('carries a Reveal only on the four insight-home atoms, not the connective ones', async () => {
    const html = await glossary();
    const revealCount = (html.match(/<summary>What it reveals<\/summary>/g) ?? []).length;
    expect(revealCount).toBe(4); // toe stall, clipper stall, mirage, butterfly

    // insight-home atom carries the reveal
    expect(card(html, 'toe_stall')).toContain('What it reveals');
    expect(card(html, 'butterfly')).toContain('What it reveals');

    // connective atoms do not; whirl and swirl are connective per the sign-off
    // (their surface-frame reveal is deferred)
    expect(card(html, 'osis')).not.toContain('What it reveals');
    expect(card(html, 'whirl')).not.toContain('What it reveals');
    expect(card(html, 'swirl')).not.toContain('What it reveals');
  });
});
