/**
 * Integration tests for the twelve core trick atoms band on GET /freestyle/glossary.
 *
 * The band renders the curator-authored CORE_ATOM_EDUCATIONAL entries as
 * three-layer cards: a `line` always visible, a "How it relates" collapsible on
 * every atom, and a "What it reveals" collapsible now on every atom. Whirl and
 * swirl teach a conserved-terminal reveal and a name-order reveal; their deeper
 * surface-frame reading stays deferred and must not surface here. This suite
 * locks that structure. Cards come from the static content module, so they
 * render independent of fixture data.
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

// Scope collapsible counts to the atoms band. Other glossary sections (the
// Dexterities Core Concept cards) reuse the same "How it relates" / "What it
// reveals" summaries, so a page-wide count would include them.
function atomsBand(html: string): string {
  const start = html.indexOf('id="core-trick-atoms"');
  const end = html.indexOf('id="section-surfaces"');
  expect(start, 'core-trick-atoms band start').toBeGreaterThan(-1);
  expect(end, 'section-surfaces boundary').toBeGreaterThan(start);
  return html.slice(start, end);
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
    const band = atomsBand(html);
    const cardCount    = (html.match(/class="glossary-core-atom-card"/g) ?? []).length;
    const lineCount    = (html.match(/class="glossary-core-atom-lead"/g) ?? []).length;
    const relatesCount = (band.match(/<summary>How it relates<\/summary>/g) ?? []).length;
    expect(cardCount).toBe(12);
    // every atom's Line is present (always visible) and every atom has a
    // How-it-relates collapsible wired through
    expect(lineCount).toBe(cardCount);
    expect(relatesCount).toBe(cardCount);
  });

  it('carries a Reveal on every one of the twelve atoms', async () => {
    const html = await glossary();
    const revealCount = (atomsBand(html).match(/<summary>What it reveals<\/summary>/g) ?? []).length;
    expect(revealCount).toBe(12);

    // insight-home atoms keep their reveal
    expect(card(html, 'toe_stall')).toContain('What it reveals');
    expect(card(html, 'butterfly')).toContain('What it reveals');

    // the eight formerly-connective atoms now carry one too
    for (const slug of ['around_the_world', 'orbit', 'legover', 'pickup', 'illusion', 'osis', 'whirl', 'swirl']) {
      expect(card(html, slug), `${slug} reveal`).toContain('What it reveals');
    }
  });

  it('ATW reveal separates terminal-contact variants from direction reversal without naming a family', async () => {
    const atw = card(await glossary(), 'around_the_world');
    expect(atw).toContain('Inside ATW');
    expect(atw).toContain('Outside ATW');
    expect(atw).toContain('separate canonical tricks');
    expect(atw.toLowerCase()).toContain('ending contact');
    // The contact variants are explicitly not a family.
    expect(atw).toMatch(/without either branch being a family/);
  });

  it('whirl and swirl reveals keep the deferred surface-frame reading hidden', async () => {
    const html = await glossary();
    for (const slug of ['whirl', 'swirl']) {
      expect(card(html, slug).toLowerCase(), `${slug} reveal`).not.toContain('surface frame');
      expect(card(html, slug).toLowerCase(), `${slug} reveal`).not.toContain('surface-frame');
    }
  });
});
