/**
 * Integration tests for the "Reading a compound name" decoder on
 * GET /freestyle/glossary, rendered in the Reading the Dictionary chapter.
 *
 * The decoder teaches that a compound trick name is read from the end: the last
 * word is the base trick and its family, and the leading words are modifiers. It
 * uses the Whirling Swirl / Swirling Whirl minimal pair, where the same two
 * words in the opposite order name a swirl and a whirl (two different families).
 * The copy is static, so it renders independent of fixture data.
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

/** The <tr> row whose compound-name cell links to the given trick slug. */
function row(html: string, nameSlug: string): string {
  const anchor = `/freestyle/tricks/${nameSlug}"`;
  const at = html.indexOf(anchor);
  expect(at, nameSlug).toBeGreaterThan(-1);
  const start = html.lastIndexOf('<tr>', at);
  const end = html.indexOf('</tr>', at);
  return html.slice(start, end);
}

describe('Glossary — reading a compound name (read from the end)', () => {
  it('renders the decoder heading and the read-from-the-end rule in the Reading the Dictionary chapter', async () => {
    const html = await glossary();
    expect(html).toContain('Reading a compound name');
    expect(html).toContain('read from the end');
    expect(html).toContain('The <strong>last word</strong>');
    // Sits inside Reading the Dictionary, before Movement Basics.
    const readingAt = html.indexOf('id="section-reading-the-dictionary"');
    const decoderAt = html.indexOf('Reading a compound name');
    const basicsAt = html.indexOf('id="chapter-movement-basics"');
    expect(readingAt).toBeGreaterThan(-1);
    expect(decoderAt).toBeGreaterThan(readingAt);
    expect(basicsAt).toBeGreaterThan(decoderAt);
  });

  it('shows the minimal pair, each linked to its trick page', async () => {
    const html = await glossary();
    expect(html).toContain('>Whirling Swirl</a>');
    expect(html).toContain('>Swirling Whirl</a>');
    expect(html).toContain('href="/freestyle/tricks/whirling_swirl"');
    expect(html).toContain('href="/freestyle/tricks/swirling_whirl"');
  });

  it('attributes each compound to the base named by its last word', async () => {
    const html = await glossary();
    // Whirling Swirl reads as a swirl (base = swirl), not a whirl.
    const whirlingSwirl = row(html, 'whirling_swirl');
    expect(whirlingSwirl).toContain('href="/freestyle/tricks/swirl"');
    expect(whirlingSwirl).not.toContain('href="/freestyle/tricks/whirl"');
    // Swirling Whirl reads as a whirl (base = whirl), not a swirl.
    const swirlingWhirl = row(html, 'swirling_whirl');
    expect(swirlingWhirl).toContain('href="/freestyle/tricks/whirl"');
    expect(swirlingWhirl).not.toContain('href="/freestyle/tricks/swirl"');
  });
});
