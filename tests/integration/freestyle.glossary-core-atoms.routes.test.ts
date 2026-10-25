/**
 * Integration tests for the twelve foundational moves on GET /freestyle/concepts.
 *
 * Each card shows its name, ADD and a "Movement:" description, with deeper
 * teaching in titled collapsible panels. Each lesson has one home card: the
 * direction and catching-foot grid on Mirage, the clipper-ending grid on Whirl,
 * the compound-name reading on Swirl. Whirl and swirl keep their deferred
 * surface-frame reading hidden. Cards come from the static content module, so
 * they render independent of fixture data.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3561');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, { slug: 'whirl', canonical_name: 'whirl', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'dex', is_active: 1 });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function concepts(): Promise<string> {
  const res = await page('/freestyle/concepts');
  expect(res.status).toBe(200);
  return res.text;
}

function card(html: string, slug: string): string {
  const m = html.match(new RegExp(`id="atom-${slug}"[\\s\\S]*?</article>`));
  expect(m, `${slug} card`).not.toBeNull();
  return m![0];
}

const SLUGS = ['toe_stall', 'clipper_stall', 'around_the_world', 'orbit', 'mirage', 'illusion',
  'pickup', 'legover', 'butterfly', 'osis', 'whirl', 'swirl'];

describe('Freestyle Concepts — twelve foundational moves', () => {
  it('renders all twelve cards, each with an ADD value and a visible movement description', async () => {
    const html = await concepts();
    expect(html).toContain('id="core-trick-atoms"');
    expect((html.match(/class="glossary-core-atom-card"/g) ?? []).length).toBe(12);
    for (const slug of SLUGS) {
      const c = card(html, slug);
      expect(c, `${slug} ADD`).toMatch(/class="glossary-core-atom-adds">\d ADD</);
      expect(c, `${slug} movement line`).toMatch(/class="glossary-core-atom-lead">Movement: /);
    }
  });

  it('titles every panel by what it teaches, never the generic pair', async () => {
    const html = await concepts();
    for (const slug of SLUGS) {
      const c = card(html, slug);
      const titles = [...c.matchAll(/<summary>([^<]+)<\/summary>/g)].map(m => m[1]);
      expect(titles.length, `${slug} panels`).toBeGreaterThan(0);
      expect(c, slug).not.toContain('<summary>How it relates</summary>');
      expect(c, slug).not.toContain('<summary>What it reveals</summary>');
    }
  });

  it('keeps "atom" out of the chapter text, leaving Atomic as the set name', async () => {
    const html = await concepts();
    const chapter = html.slice(html.indexOf('id="chapter-movement-basics"'), html.indexOf('id="chapter-contact-surfaces"'));
    const text = chapter.replace(/<[^>]+>/g, ' ');
    expect(text).not.toMatch(/\batoms?\b/i);
    expect(text).toMatch(/Twelve foundational moves/);
  });

  it('teaches the direction and catching-foot grid once, on Mirage', async () => {
    const html = await concepts();
    const mirage = card(html, 'mirage');
    for (const name of ['Illusion', 'Pickup', 'Legover']) expect(mirage).toContain(name);
    expect(mirage).toMatch(/returns to the setting foot/);
    expect(mirage).toMatch(/caught by the dexing foot/);
    // The other three compare briefly and point to Mirage rather than restating it.
    for (const slug of ['illusion', 'pickup', 'legover']) {
      expect(card(html, slug), slug).toMatch(/Mirage/);
      expect(card(html, slug), `${slug} does not restate the whole grid`).not.toMatch(/Legover circles outward and is caught/);
    }
  });

  it('Around the World separates terminal-contact variants from direction reversal without naming a family', async () => {
    const atw = card(await concepts(), 'around_the_world');
    expect(atw).toContain('Inside Around the World');
    expect(atw).toContain('Outside Around the World');
    expect(atw).toContain('separate canonical tricks');
    expect(atw.toLowerCase()).toContain('ending contact');
    // The contact variants are explicitly not a family.
    expect(atw).toMatch(/neither branch is a family/);
  });

  it('scopes the compound-name rule rather than stating it for every name', async () => {
    const swirl = card(await concepts(), 'swirl');
    expect(swirl).toMatch(/last word names the base/);
    expect(swirl).toMatch(/do not follow this pattern/);
  });

  it('whirl and swirl keep the deferred surface-frame reading hidden', async () => {
    const html = await concepts();
    for (const slug of ['whirl', 'swirl']) {
      expect(card(html, slug).toLowerCase(), slug).not.toContain('surface frame');
      expect(card(html, slug).toLowerCase(), slug).not.toContain('surface-frame');
    }
  });
});
