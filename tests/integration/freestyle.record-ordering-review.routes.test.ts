/**
 * GET /freestyle/records — alphabetical ordering, record-to-canonical linking,
 * and the curator-review status.
 *
 * Contract pinned here:
 *   - Records render alphabetically by their public name within each group,
 *     case-insensitively, not by record count.
 *   - A record whose name matches a canonical trick links to that trick.
 *   - A record on the curator-review list shows a "Needs curator review" status
 *     with its open question, and never links to a canonical trick, even when its
 *     name would otherwise resolve to one.
 *   - The three non-trick record categories stay in their own groups and are not
 *     treated as curator-review.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleRecord, insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3651');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Canonical tricks a record can resolve to.
  insertFreestyleTrick(db, { slug: 'blink', canonical_name: 'Blink', adds: '2', base_trick: null, trick_family: null, category: 'compound' });
  // An active trick whose slug matches a curator-review record name: the review
  // suppression must still win over resolvability.
  insertFreestyleTrick(db, { slug: 'double_dyno', canonical_name: 'Double Dyno', adds: '5' });

  // Ordinary trick records (record_type trick_consecutive). Counts are chosen so
  // count-descending order (Zebra, Mango, Apple) differs from alphabetical.
  insertFreestyleRecord(db, { trick_name: 'Zebra Trick', value_numeric: 99, display_name: 'P1' });
  insertFreestyleRecord(db, { trick_name: 'Apple Trick', value_numeric: 1,  display_name: 'P2' });
  insertFreestyleRecord(db, { trick_name: 'Mango Trick', value_numeric: 50, display_name: 'P3' });

  // Blink links to its now-canonical trick.
  insertFreestyleRecord(db, { trick_name: 'Blink', value_numeric: 10, adds_count: 2, sort_name: 'Swirling Toe (op) (rev)', display_name: 'Nick Polini' });

  // Double Dyno is on the curator-review list: it must not link even though a
  // 'double_dyno' trick exists in this fixture.
  insertFreestyleRecord(db, { trick_name: 'Double Dyno', value_numeric: 5, adds_count: 5, display_name: 'Pawel Nowak' });

  // A non-trick record category in its own group.
  insertFreestyleRecord(db, { record_type: 'trick_consecutive_dex', trick_name: 'Unique Fearless', value_numeric: 25, adds_count: 5, display_name: 'Jim Penske' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function recordsHtml(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/records');
  expect(res.status).toBe(200);
  return res.text;
}

describe('GET /freestyle/records — alphabetical ordering by public name', () => {
  it('orders records by name, not by record count', async () => {
    const html = await recordsHtml();
    const apple = html.indexOf('Apple Trick');
    const mango = html.indexOf('Mango Trick');
    const zebra = html.indexOf('Zebra Trick');
    expect(apple).toBeGreaterThan(-1);
    // Zebra has the highest count but sorts last; Apple the lowest but sorts first.
    expect(apple).toBeLessThan(mango);
    expect(mango).toBeLessThan(zebra);
  });
});

describe('GET /freestyle/records — record-to-canonical linking', () => {
  it('links Blink to its canonical trick page', async () => {
    const html = await recordsHtml();
    expect(html).toContain('href="/freestyle/tricks/blink"');
  });
});

describe('GET /freestyle/records — curator-review status', () => {
  it('flags Double Dyno for curator review with its open question and no trick link', async () => {
    const html = await recordsHtml();
    expect(html).toContain('Needs curator review');
    expect(html).toContain('reversed Blender / Dyno structure');
    // The review record never links, even though a matching trick slug exists.
    expect(html).not.toContain('href="/freestyle/tricks/double_dyno"');
  });

  it('renders the explanatory note that reviewed records keep their name but stay unlinked', async () => {
    const html = await recordsHtml();
    expect(html).toMatch(/valid historical records whose name does not yet map/i);
  });

  it('does not treat a non-trick record category (Unique Fearless) as curator review', async () => {
    const html = await recordsHtml();
    // Unique Fearless renders in its own group, without a review flag on its row.
    expect(html).toContain('Unique Fearless');
    expect(html).toContain('Consecutive Completions (Dex)');
    // Its name never appears as a curator-review reason.
    expect(html).not.toMatch(/Unique Fearless[\s\S]{0,120}Needs curator review/);
  });
});
