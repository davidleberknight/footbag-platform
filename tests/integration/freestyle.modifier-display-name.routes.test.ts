/**
 * A modifier page's name: the operator's own name, taken from its glossary entry
 * when no feel card names it.
 *
 * A modifier page with no feel card used to title-case its slug, so an operator
 * whose glossary entry spells the name with a hyphen or a capital (a slug "xdex"
 * whose entry reads "X-Dex") showed a misspelling of itself in the browser tab
 * and the heading. The page now takes the glossary entry whose term, or one of
 * whose aliases, is the slug's spelling, and title-cases the slug only when no
 * entry matches.
 *
 * The names below are invented for the test, so the cases read the rule rather
 * than any real entry.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrickModifier, insertFreestyleGlossaryTerm } from '../fixtures/factories';

const { dbPath } = setTestEnv('3094');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Matched through an alias: the slug's spelling is an alias of the entry.
  insertFreestyleTrickModifier(db, { slug: 'zdex' });
  insertFreestyleGlossaryTerm(db, { slug: 'zed-dexterity', term: 'Zed Dexterity', aliases: ['Zdex'] });
  // Matched through the term itself, ignoring case and punctuation.
  insertFreestyleTrickModifier(db, { slug: 'quuxdex' });
  insertFreestyleGlossaryTerm(db, { slug: 'quux-dex', term: 'Quux-Dex' });
  // No glossary entry: the slug is title-cased.
  insertFreestyleTrickModifier(db, { slug: 'plainmod' });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

function headingAndTitle(html: string): { h1: string | null; title: string | null } {
  return {
    h1:    html.match(/<h1[^>]*>\s*([^<]*?)\s*<\/h1>/)?.[1] ?? null,
    title: html.match(/<title>\s*([^<]*?)\s*<\/title>/)?.[1] ?? null,
  };
}

describe('a modifier page names its operator from the glossary when no feel card does', () => {
  // Defect caught: the page shows the title-cased slug ("Zdex") although the
  // glossary entry for that spelling gives the operator's real name.
  it('takes the name of the entry the slug is an alias of', async () => {
    const res = await page('/freestyle/modifier/zdex');
    expect(res.status).toBe(200);
    const { h1, title } = headingAndTitle(res.text);
    expect(h1).toBe('Zed Dexterity');
    expect(title).toContain('Zed Dexterity');
  });

  // Defect caught: a hyphen or capital in the entry's term defeats the match, so
  // "Quux-Dex" reads as "Quuxdex" on its own page.
  it('takes the entry whose term is the slug spelled with a hyphen', async () => {
    const res = await page('/freestyle/modifier/quuxdex');
    expect(res.status).toBe(200);
    expect(headingAndTitle(res.text).h1).toBe('Quux-Dex');
  });

  // Defect caught: an operator with no glossary entry loses its name altogether.
  it('falls back to the title-cased slug when no entry matches', async () => {
    const res = await page('/freestyle/modifier/plainmod');
    expect(res.status).toBe(200);
    expect(headingAndTitle(res.text).h1).toBe('Plainmod');
  });
});
