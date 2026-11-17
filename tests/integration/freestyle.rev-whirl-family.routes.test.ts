/**
 * Integration tests for the rev_whirl minor lineage in the public family browse.
 *
 * Three rows carry the `rev_whirl` label: rev_whirl (the canonical
 * direction-variant anchor), hatchet (SAME FRONT WHIRL [DEX] > OP CLIP [XBD])
 * and mullet (SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD]).
 *
 * rev_whirl is a minor lineage, separate from the Whirl family: its rows render
 * on the lineage's own family-view page and never fold into the Whirl section.
 * The raw trick_family data is never overwritten, so the ?family=rev_whirl
 * filter URL still returns 200 and lists the rows reachable through it.
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
import { seedStagedFamilies } from '../fixtures/stagedFamilies';

const { dbPath } = setTestEnv('3103');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);

  // Whirl-family-canonical rows that stay in whirl-family (controls).
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox_whirl', canonical_name: 'paradox whirl',
    trick_family: 'whirl', category: 'compound', adds: '4', is_active: 1,
  });
  // Chain-authored as whirl-family; stays in whirl per the
  // chain-identity-preservation policy.
  insertFreestyleTrick(db, {
    slug: 'montage', canonical_name: 'montage',
    trick_family: 'whirl', category: 'compound', adds: '7', is_active: 1,
  });
  // Ambiguous decomposition: stays in whirl per curator-deferred policy.
  insertFreestyleTrick(db, {
    slug: 'tomahawk', canonical_name: 'tomahawk',
    trick_family: 'whirl', category: 'compound', adds: '5', is_active: 1,
  });

  // Rows under the rev_whirl label, a minor lineage of its own, also reachable
  // via the raw ?family= filter.
  insertFreestyleTrick(db, {
    slug: 'rev_whirl', canonical_name: 'rev whirl',
    trick_family: 'rev_whirl', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'hatchet', canonical_name: 'hatchet',
    trick_family: 'rev_whirl', category: 'compound', adds: '4', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'mullet', canonical_name: 'mullet',
    trick_family: 'rev_whirl', category: 'compound', adds: '6', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const WHIRL_PAGE = '/freestyle/tricks?view=family&family=whirl';

describe('Family view — rev_whirl is a lineage of its own, apart from Whirl', () => {
  // Defect caught: the lineage's rows are lost from the family view, or its
  // page shows some other family's rows.
  it('the rev_whirl lineage page lists the rev_whirl, hatchet and mullet rows', async () => {
    const res = await page('/freestyle/tricks?view=family&family=rev_whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="family-rev_whirl"');
    for (const slug of ['rev_whirl', 'hatchet', 'mullet']) {
      expect(res.text, `${slug} renders on its lineage page`).toContain(`data-trick-slug="${slug}"`);
    }
    expect(res.text).not.toContain('data-trick-slug="paradox_whirl"');
  });

  it('the Whirl family does NOT absorb the rev_whirl rows', async () => {
    const res = await page(WHIRL_PAGE);
    const sectionStart = res.text.indexOf('id="family-whirl"');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    for (const slug of ['rev_whirl', 'hatchet', 'mullet']) {
      expect(
        sectionHtml,
        `${slug} must not fold into the Whirl section`,
      ).not.toContain(`data-trick-slug="${slug}"`);
    }
  });
});

describe('Family view — Whirl family renders separately', () => {
  // Defect caught: the Whirl section's heading links to another family's page.
  it('Whirl family section renders under its own "Whirl" heading', async () => {
    const res = await page(WHIRL_PAGE);
    const sectionStart = res.text.indexOf('id="family-whirl"');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toMatch(/<a href="\/freestyle\/tricks\?view=family&amp;family=whirl">Whirl family<\/a>/);
  });

  it('tomahawk STAYS in the Whirl section', async () => {
    // tomahawk remains curator-deferred in Whirl.
    const res = await page(WHIRL_PAGE);
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(
      sectionHtml,
      'tomahawk is curator-deferred and must stay in the Whirl section',
    ).toContain('data-trick-slug="tomahawk"');
  });

  it('chain-authored compound (montage) STAYS in the Whirl section', async () => {
    // Chain identity wins over mechanical execution. montage has a
    // curator-authored chain reading that places it in whirl-family
    // lineage; its FRONT WHIRL execution is a contextual detail-page note,
    // not a family-membership commitment.
    const res = await page(WHIRL_PAGE);
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toContain('data-trick-slug="montage"');
  });
});

describe('Family filter — rev_whirl rows stay reachable by raw label', () => {
  it('?family=rev_whirl returns 200 and lists its rows (raw trick_family untouched)', async () => {
    const res = await page('/freestyle/tricks?family=rev_whirl');
    expect(res.status).toBe(200);
    for (const slug of ['rev_whirl', 'hatchet', 'mullet']) {
      expect(
        res.text,
        `?family=rev_whirl should list ${slug}`,
      ).toContain(`data-trick-slug="${slug}"`);
    }
  });
});
