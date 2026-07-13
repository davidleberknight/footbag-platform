/**
 * Integration tests for the "eight closest relatives" movement-neighbor figure
 * on GET /freestyle/glossary, rendered in the Dexterities section.
 *
 * The figure shows the eight foundational one-dex toe tricks, each with the
 * three tricks one movement change away. It reads the movement-neighbor relation
 * and resolves each slug to its canonical name and detail href against the
 * active dictionary. These tests seed the eight atoms so names resolve, then
 * assert the figure renders in place, links every card and destination to its
 * trick page, and teaches the verified adjacency (mirage reaches illusion,
 * pixie, and pickup by one change, and is not one change from fairy).
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

const { dbPath } = setTestEnv('3563');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ATOMS: [string, string][] = [
  ['mirage', 'Mirage'],
  ['illusion', 'Illusion'],
  ['pixie', 'Pixie'],
  ['fairy', 'Fairy'],
  ['around_the_world', 'Around the World'],
  ['orbit', 'Orbit'],
  ['pickup', 'Pickup'],
  ['legover', 'Legover'],
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const [slug, canonical_name] of ATOMS) {
    insertFreestyleTrick(db, { slug, canonical_name, adds: '2', is_active: 1 });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

/** The rendered HTML of one trick's card, from its trick-title anchor up to the
 *  next card's title anchor (or the end). Destination links use a different
 *  class, so they never end the slice. */
function neighborCard(html: string, slug: string): string {
  const start = html.indexOf(`glossary-neighbor-card-trick" href="/freestyle/tricks/${slug}"`);
  expect(start, `${slug} card`).toBeGreaterThan(-1);
  const rest = html.slice(start + 1);
  const nextAt = rest.indexOf('glossary-neighbor-card-trick"');
  return nextAt === -1 ? rest : rest.slice(0, nextAt);
}

describe('Glossary — eight closest relatives (movement-neighbor figure)', () => {
  it('renders the figure with its heading, framing, and teaching caption in the Dexterities section', async () => {
    const html = await glossary();
    expect(html).toContain('The eight closest relatives');
    expect(html).toContain('class="glossary-neighbor-figure"');
    // Pre-figure framing: the eight are variations of one movement pattern,
    // each one movement change away from three others (the named relation).
    expect(html).toContain('variations of the same underlying movement pattern');
    expect(html).toContain('movement change away');
    // Figure caption: the reading instruction.
    expect(html).toContain('Change just one of those three choices');
    // Sits inside Dexterities, after the section opens and before Execution window.
    const dexAt = html.indexOf('id="section-dexterities"');
    const figureAt = html.indexOf('The eight closest relatives');
    const windowAt = html.indexOf('Execution window');
    expect(dexAt).toBeGreaterThan(-1);
    expect(figureAt).toBeGreaterThan(dexAt);
    expect(windowAt).toBeGreaterThan(figureAt);
  });

  it('renders all eight foundational tricks as cards linking to their trick pages', async () => {
    const html = await glossary();
    for (const [slug, name] of ATOMS) {
      expect(html, slug).toContain(`class="glossary-neighbor-card-trick" href="/freestyle/tricks/${slug}"`);
      expect(html, name).toContain(`>${name}</a>`);
    }
  });

  it('labels every move with the closed change vocabulary', async () => {
    const html = await glossary();
    expect(html).toContain('Reverse the direction the leg circles');
    expect(html).toContain('Switch the side the leg circles on');
    expect(html).toContain('Switch the side the bag comes down on');
  });

  it('teaches the verified adjacency: mirage reaches illusion, pixie, and pickup by one change', async () => {
    const html = await glossary();
    const card = neighborCard(html, 'mirage');
    expect(card).toContain('class="glossary-neighbor-dest" href="/freestyle/tricks/illusion"');
    expect(card).toContain('class="glossary-neighbor-dest" href="/freestyle/tricks/pixie"');
    expect(card).toContain('class="glossary-neighbor-dest" href="/freestyle/tricks/pickup"');
    // Fairy feels adjacent to mirage but is two changes away: never a destination.
    expect(card).not.toContain('/freestyle/tricks/fairy"');
  });

  it('gives each card exactly three moves', async () => {
    const html = await glossary();
    for (const [slug] of ATOMS) {
      const card = neighborCard(html, slug);
      const moves = card.match(/class="glossary-neighbor-move"/g) ?? [];
      expect(moves.length, slug).toBe(3);
    }
  });
});

describe('Dexterities teaching spine — mindset, counterparts, repetition', () => {
  it('opens the relatives figure with the mindset sentence, before the figure', async () => {
    const html = await glossary();
    const mindset = html.indexOf('makes the rest of freestyle much easier to learn');
    const figure = html.indexOf('class="glossary-neighbor-figure"');
    expect(mindset).toBeGreaterThan(0);
    expect(figure).toBeGreaterThan(mindset);
  });

  it('renders the clipper-counterparts table directly after the figure with all six pairs', async () => {
    const html = await glossary();
    const figure = html.indexOf('class="glossary-neighbor-figure"');
    const bridge = html.indexOf('Clipper counterparts');
    expect(bridge).toBeGreaterThan(figure);
    const pairs: Array<[string, string]> = [
      ['/freestyle/tricks/mirage', '/freestyle/tricks/whirl'],
      ['/freestyle/tricks/illusion', '/freestyle/tricks/rev_whirl'],
      ['/freestyle/tricks/pickup', '/freestyle/tricks/drifter'],
      ['/freestyle/tricks/legover', '/freestyle/tricks/reverse_drifter'],
      ['/freestyle/tricks/around_the_world', '/freestyle/tricks/rev_swirl'],
      ['/freestyle/tricks/orbit', '/freestyle/tricks/swirl'],
    ];
    const table = html.slice(bridge, html.indexOf('Repeating a movement'));
    for (const [toe, clip] of pairs) {
      expect(table).toContain(`href="${toe}"`);
      expect(table).toContain(`href="${clip}"`);
    }
    // Counterpart language only: the section never claims the movements are the same.
    expect(table).not.toMatch(/the same movement/i);
  });

  it('renders the repetition callout with its three ladders after the counterparts table', async () => {
    const html = await glossary();
    const bridge = html.indexOf('Clipper counterparts');
    const repeat = html.indexOf('One common way freestyle vocabulary grows is by repeating an existing');
    expect(repeat).toBeGreaterThan(bridge);
    for (const slug of ['ripstein', 'triple_swirl', 'double_around_the_world', 'triple_around_the_world', 'double_orbit', 'triple_orbit']) {
      expect(html).toContain(`href="/freestyle/tricks/${slug}"`);
    }
  });

  it('the compound-name table clarifies coordinated movements, not reordered sequences', async () => {
    const html = await glossary();
    expect(html).toContain('coordinated movements whose identities differ because the base');
  });
});
