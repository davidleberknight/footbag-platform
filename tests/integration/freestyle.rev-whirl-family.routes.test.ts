/**
 * Integration tests for Slice J — Rev-Whirl sibling terminal family
 * (Stage A, 2026-05-16).
 *
 * Long-term contract pinned:
 *
 *   The Rev-Whirl family is a TRUE sibling terminal family of Whirl,
 *   not a related-subgroup or topology. It has its own conserved
 *   ending mechanic (front whirl > op clipper [XBD]). Three rows
 *   move out of whirl-family by curator override:
 *
 *     - rev-whirl (the canonical direction-variant anchor)
 *     - hatchet (mechanics-confirmed: SAME FRONT WHIRL [DEX] > OP CLIP [XBD])
 *     - mullet  (mechanics-confirmed: SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD])
 *
 *   Explicitly deferred (stay in whirl-family pending curator decision):
 *
 *     - rev-up    — folk-name direction variant; no op-notation
 *     - tomahawk  — folk-name compound; structural decomposition uncertain
 *     - surreal   — hybrid: chain says whirl-family; op-notation says
 *                   front-whirl. Stays in whirl-family by chain identity.
 *     - montage   — same hybrid pattern.
 *
 *   Slice J's contract:
 *
 *   1. Curator override module produces the right family mapping.
 *   2. Family-view section renders a "Rev Whirl family" heading.
 *   3. The three migrated rows appear under the new section, NOT
 *      under the Whirl family.
 *   4. Deferred rows (rev-up, tomahawk, surreal, montage) stay in
 *      whirl-family.
 *   5. Rev-Whirl family section carries its own shared-structure
 *      invariant line.
 *   6. Whirl family invariant line still renders.
 *   7. NO database `trick_family` column UPDATE. Override is
 *      reversible TypeScript content.
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
import {
  resolveFamilyOverride,
  resolveFamilyDisplayName,
} from '../../src/content/freestyleFamilyOverrides';
import {
  getFamilyInvariant,
} from '../../src/content/freestyleFamilyInvariants';

const { dbPath } = setTestEnv('3103');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Whirl-family-canonical rows that stay in whirl-family (controls).
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox-whirl', canonical_name: 'paradox whirl',
    trick_family: 'whirl', category: 'compound', adds: '4', is_active: 1,
  });
  // Hybrid: chain-authored as whirl-family per Slice A2. Stays in whirl
  // per the hybrid-preservation policy.
  insertFreestyleTrick(db, {
    slug: 'montage', canonical_name: 'montage',
    trick_family: 'whirl', category: 'compound', adds: '7', is_active: 1,
  });
  // Deferred ambiguous case: stays in whirl per curator-deferred policy.
  insertFreestyleTrick(db, {
    slug: 'rev-up', canonical_name: 'rev up',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'tomahawk', canonical_name: 'tomahawk',
    trick_family: 'whirl', category: 'compound', adds: '5', is_active: 1,
  });

  // Rows that move to the rev-whirl family via the Stage A override.
  // Their DB trick_family remains 'whirl' — the service-side override
  // re-buckets them at family-view render time.
  insertFreestyleTrick(db, {
    slug: 'rev-whirl', canonical_name: 'rev whirl',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'hatchet', canonical_name: 'hatchet',
    trick_family: 'whirl', category: 'compound', adds: '4', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'mullet', canonical_name: 'mullet',
    trick_family: 'whirl', category: 'compound', adds: '6', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Family override — content module', () => {
  it('resolves rev-whirl, hatchet, mullet to the rev-whirl family', () => {
    expect(resolveFamilyOverride('rev-whirl')).toBe('rev-whirl');
    expect(resolveFamilyOverride('hatchet')).toBe('rev-whirl');
    expect(resolveFamilyOverride('mullet')).toBe('rev-whirl');
  });

  it('returns null for whirl-family rows not in the override (canonical Whirl members)', () => {
    expect(resolveFamilyOverride('whirl')).toBeNull();
    expect(resolveFamilyOverride('paradox-whirl')).toBeNull();
  });

  it('does NOT override the deferred ambiguous cases (rev-up, tomahawk)', () => {
    // rev-up and tomahawk are curator-deferred per Slice J Stage A —
    // they MUST stay in whirl-family (DB trick_family='whirl') until
    // an explicit curator decision moves them.
    expect(resolveFamilyOverride('rev-up')).toBeNull();
    expect(resolveFamilyOverride('tomahawk')).toBeNull();
  });

  it('does NOT override the hybrid compounds (surreal, montage)', () => {
    // Per the hybrid-preservation policy: chain-authored compositional
    // reading wins over op-notation mechanics for family membership.
    expect(resolveFamilyOverride('surreal')).toBeNull();
    expect(resolveFamilyOverride('montage')).toBeNull();
  });

  it('emits the curator display name for rev-whirl', () => {
    // The default capitalize-first-char would yield "Rev-whirl"; the
    // curator override renders "Rev Whirl" instead.
    expect(resolveFamilyDisplayName('rev-whirl')).toBe('Rev Whirl');
  });

  it('returns null for families without a display-name override', () => {
    expect(resolveFamilyDisplayName('whirl')).toBeNull();
    expect(resolveFamilyDisplayName('butterfly')).toBeNull();
  });

  it('exposes the Rev-Whirl family invariant text (mirror form, Slice L-polish)', () => {
    // Slice J introduced the entry with op-notation-derived text
    // ("front whirl > op clipper [XBD]"). Slice L-polish (same day,
    // 2026-05-16) updated to the pedagogical mirror form so the
    // sibling-family relationship to Whirl reads symmetrically:
    //   Whirl:     leggy in  dex > ss clipper
    //   Rev-Whirl: leggy out dex > ss clipper
    expect(getFamilyInvariant('rev-whirl')).toBe('leggy out dex > ss clipper');
  });
});

describe('Family View — Rev-Whirl section renders', () => {
  it('renders a Rev Whirl family section with the curator display name', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="family-rev-whirl"');
    // Display name uses the curator override, not the default capitalize.
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\?family=rev-whirl">Rev Whirl family<\/a>/);
  });

  it('renders the Rev-Whirl invariant line inside the new section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-rev-whirl"');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toContain('class="trick-family-shared-structure"');
    expect(sectionHtml).toMatch(/Shared terminal structure: <code>leggy out dex &gt; ss clipper<\/code>/);
  });

  it('renders rev-whirl, hatchet, mullet INSIDE the Rev-Whirl section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-rev-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    for (const slug of ['rev-whirl', 'hatchet', 'mullet']) {
      expect(
        sectionHtml,
        `${slug} should appear inside the Rev-Whirl family section`,
      ).toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('Rev-Whirl family section sits immediately after Whirl in FAMILY_ORDER', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const whirlIdx    = res.text.indexOf('id="family-whirl"');
    const revWhirlIdx = res.text.indexOf('id="family-rev-whirl"');
    expect(whirlIdx).toBeGreaterThan(-1);
    expect(revWhirlIdx).toBeGreaterThan(whirlIdx);
  });
});

describe('Whirl Family — preserves invariant + drops the migrated rows', () => {
  it('Whirl family section still renders with the Slice I invariant', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toMatch(/Shared terminal structure: <code>leggy in dex &gt; ss clipper<\/code>/);
  });

  it('rev-whirl, hatchet, mullet do NOT appear in the Whirl section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    for (const slug of ['rev-whirl', 'hatchet', 'mullet']) {
      expect(
        sectionHtml,
        `${slug} should NOT appear in the Whirl section after Slice J Stage A`,
      ).not.toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('deferred rows (rev-up, tomahawk) STAY in the Whirl section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    for (const slug of ['rev-up', 'tomahawk']) {
      expect(
        sectionHtml,
        `${slug} is curator-deferred and must stay in the Whirl section`,
      ).toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('hybrid compound (montage) STAYS in the Whirl section', async () => {
    // Hybrid-preservation policy: chain identity wins over mechanical
    // execution. montage has a curator-authored chain reading
    // `spinning ducking paradox symposium whirl`; that places it in
    // whirl-family lineage. Its FRONT WHIRL execution is a contextual
    // detail-page note, not a family-membership commitment.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toContain('data-trick-slug="montage"');
    // And NOT in the Rev-Whirl section.
    const revWhirlStart = res.text.indexOf('id="family-rev-whirl"');
    const revWhirlEnd = res.text.indexOf('</section>', revWhirlStart);
    const revWhirlHtml = res.text.slice(revWhirlStart, revWhirlEnd);
    expect(revWhirlHtml).not.toContain('data-trick-slug="montage"');
  });
});
