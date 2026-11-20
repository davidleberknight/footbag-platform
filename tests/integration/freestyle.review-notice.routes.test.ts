/**
 * The trick page's "Definition under review" notice.
 *
 * A trick whose definition has one open question carries the aspect that
 * question could change: its ADD accounting, its canonical identity, its
 * positional interpretation or its exact notation. Its detail page shows a
 * notice first under the hero naming that one aspect, and every settled fact
 * on the page renders unchanged. A settled trick shows no notice, and no
 * browse row ever carries one.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import { insertTrickAsRebuilt } from '../fixtures/stagedFormula';

const { dbPath } = setTestEnv('4237');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());
let lines: Readonly<Record<string, string>>;

const NOTATION = 'SET > OP IN [DEX] > OP TOE [DEL]';
const ASPECTS = ['add', 'identity', 'positional', 'notation'] as const;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  insertTrickAsRebuilt(db, {
    slug: 'mirage', canonical_name: 'Mirage', adds: '2',
    base_trick: 'mirage', trick_family: 'mirage', category: 'dex',
    operational_notation: NOTATION, description: 'A settled base trick.',
    review_status: 'curated', is_active: 1,
  });
  for (const aspect of ASPECTS) {
    insertTrickAsRebuilt(db, {
      slug: `held_${aspect}`, canonical_name: `Held ${aspect}`, adds: '2',
      base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
      operational_notation: NOTATION, description: 'A trick with one open question.',
      review_status: 'curated', is_active: 1, review_aspect: aspect,
    });
  }
  db.close();
  createApp = await importApp();
  ({ REVIEW_NOTICE_LINES: lines } = await import('../../src/services/freestyleService'));
});

afterAll(() => cleanupTestDb(dbPath));

function noticeOf(html: string): string | null {
  const match = html.match(/<p class="notice-card notice-card--info" data-review-notice>([\s\S]*?)<\/p>/);
  return match ? match[1] : null;
}

describe('GET /freestyle/tricks/:slug — the definition-under-review notice', () => {
  // Defect caught: a trick with an open question reads as settled reference
  // data, or names the wrong aspect, so a visitor trusts the part in doubt.
  it('names the one open aspect on each held trick', async () => {
    const seen = new Set<string>();
    for (const aspect of ASPECTS) {
      const res = await page(`/freestyle/tricks/held_${aspect}`);
      expect(res.status, aspect).toBe(200);
      const notice = noticeOf(res.text);
      expect(notice, `${aspect}: no notice`).not.toBeNull();
      expect(notice, aspect).toContain(lines[aspect]);
      seen.add(notice!);
    }
    // Four aspects, four different lines: none falls back to a shared one.
    expect(seen.size).toBe(ASPECTS.length);
  });

  // Defect caught: the notice sits below the opening, where a reader has
  // already taken the trick's definition as settled.
  it('places the notice before the opening', async () => {
    const res = await page('/freestyle/tricks/held_add');
    // The opening is the page's own description paragraph, not the copy of the
    // same text in the head's meta description.
    const noticeAt = res.text.indexOf('data-review-notice');
    const openingAt = res.text.indexOf('<p class="trick-description">A trick with one open question.');
    expect(noticeAt).toBeGreaterThan(-1);
    expect(openingAt).toBeGreaterThan(noticeAt);
  });

  // Defect caught: flagging one aspect hides the settled facts, so the page
  // loses its notation and ADD instead of only naming the open point.
  it('keeps the settled notation and ADD on a held trick', async () => {
    const res = await page('/freestyle/tricks/held_notation');
    expect(res.text).toContain('[DEX]');
    expect(res.text).toMatch(/\b2\s*ADD\b/);
  });

  // Defect caught: a settled trick reads as under review.
  it('shows no notice on a settled trick', async () => {
    const res = await page('/freestyle/tricks/mirage');
    expect(res.status).toBe(200);
    expect(noticeOf(res.text)).toBeNull();
  });

  // Defect caught: an authoring-status marker leaks onto the browse rows,
  // which the dictionary keeps to what a visitor needs to recognise a trick.
  it('puts no notice on any browse row', async () => {
    const res = await page('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/freestyle/tricks/held_add');
    expect(res.text).not.toContain('data-review-notice');
  });
});
