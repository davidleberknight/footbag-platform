/**
 * Integration tests for the rev-whirl override + its place under the
 * parent-family skeleton.
 *
 * Two reversible TypeScript content layers compose here:
 *
 *   1. The rev-whirl override (freestyleFamilyOverrides.ts) re-buckets three
 *      whirl-family rows under the intermediate `rev-whirl` label:
 *        - rev-whirl (the canonical direction-variant anchor)
 *        - hatchet (SAME FRONT WHIRL [DEX] > OP CLIP [XBD])
 *        - mullet  (SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD])
 *      The override also carries the "Rev Whirl" display name and the
 *      rev-whirl shared-structure invariant text. These content-module
 *      facts are unchanged and still asserted below.
 *
 *   2. The parent-family skeleton (freestyleParentFamilies.ts) then folds the
 *      `rev-whirl` label INTO the Whirl / Swirl parent. So in the rendered
 *      Family view, rev-whirl/hatchet/mullet are subordinate rows under the
 *      Whirl / Swirl section — there is no top-level "Rev Whirl" section.
 *
 *   Deferred / hybrid rows (tomahawk, surreal, montage) stay in whirl-family;
 *   rev-up is dropped from family view by its self-bucket singleton override.
 *
 *   No database `trick_family` column is updated; both layers are reversible
 *   TypeScript content.
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

  it('overrides rev-up into a self-named singleton (emergency 2026-05-19) but preserves tomahawk deferral', () => {
    // Emergency public-readiness slice 2026-05-19: rev-up gets a
    // self-bucket override ('rev-up' → 'rev-up') so the family-view
    // length>1 filter drops it from the Whirl section. No new family
    // is created; rev-up still surfaces on ADD view (canonical row
    // active) and carries the pendingDecomposition pill via
    // UNRESOLVED_COMPOUNDS. tomahawk remains deferred per Slice J.
    expect(resolveFamilyOverride('rev-up')).toBe('rev-up');
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

describe('Family View — rev-whirl folds into the Whirl / Swirl parent', () => {
  it('does NOT render a top-level Rev-Whirl family section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // rev-whirl is now a child label of the Whirl / Swirl parent: no
    // top-level section, no "Rev Whirl family" heading.
    expect(res.text).not.toContain('id="family-rev-whirl"');
    expect(res.text).not.toMatch(/Rev Whirl family<\/a>/);
  });

  it('renders rev-whirl, hatchet, mullet INSIDE the Whirl / Swirl section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    for (const slug of ['rev-whirl', 'hatchet', 'mullet']) {
      expect(
        sectionHtml,
        `${slug} should fold into the Whirl / Swirl parent section`,
      ).toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('renders the combined "Whirl / Swirl" display name on the parent', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\?family=whirl">Whirl \/ Swirl family<\/a>/);
  });
});

describe('Whirl / Swirl Family — invariant + folded children', () => {
  it('Whirl / Swirl family section still renders the whirl invariant', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toMatch(/Shared terminal structure: <code>leggy in dex &gt; ss clipper<\/code>/);
  });

  it('rev-whirl, hatchet, mullet appear in the Whirl / Swirl section (folded in)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    for (const slug of ['rev-whirl', 'hatchet', 'mullet']) {
      expect(
        sectionHtml,
        `${slug} should fold into the Whirl / Swirl parent section`,
      ).toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('tomahawk STAYS in the Whirl section; rev-up was pulled out by the 2026-05-19 emergency slice', async () => {
    // Emergency public-readiness slice 2026-05-19: rev-up moved into
    // a self-bucket singleton family that the length>1 filter drops
    // from family view. tomahawk remains deferred in Whirl per Slice J.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(
      sectionHtml,
      'tomahawk is curator-deferred and must stay in the Whirl section',
    ).toContain('data-trick-slug="tomahawk"');
    expect(
      sectionHtml,
      'rev-up was pulled from Whirl family by the emergency 2026-05-19 slice',
    ).not.toContain('data-trick-slug="rev-up"');
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
  });
});
