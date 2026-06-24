/**
 * Integration tests for the rev_whirl content override and rev_whirl's
 * route-out from the public family browse.
 *
 * Two reversible TypeScript content layers compose here:
 *
 *   1. The rev_whirl override re-buckets three whirl-family rows under the
 *      intermediate `rev_whirl` label:
 *        - rev_whirl (the canonical direction-variant anchor)
 *        - hatchet (SAME FRONT WHIRL [DEX] > OP CLIP [XBD])
 *        - mullet  (SAME FRONT WHIRL [DEX] [PDX] > OP CLIP [XBD])
 *      The override also carries the "Rev Whirl" display name and the
 *      rev_whirl shared-structure invariant text. These content-module
 *      facts are unchanged and still asserted below.
 *
 *   2. rev_whirl is NOT a public display family: its lineage is too sparse to
 *      clear the family floor, so the public family browse routes it out. In
 *      the rendered family view there is no id="family-rev_whirl" section and
 *      the rev_whirl / hatchet / mullet rows do not appear at all. The raw
 *      trick_family data is never overwritten, so the ?family=rev_whirl filter
 *      URL still returns 200 and lists the rows reachable through it.
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
    slug: 'rev_up', canonical_name: 'rev up',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'tomahawk', canonical_name: 'tomahawk',
    trick_family: 'whirl', category: 'compound', adds: '5', is_active: 1,
  });

  // Rows the content override re-buckets under the rev_whirl label. Their
  // DB trick_family remains 'whirl'; the override re-labels them at render
  // time, but rev_whirl is a route-out family, so they drop from the
  // family view while staying reachable via the raw ?family= filter.
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

describe('Family override — content module', () => {
  it('resolves rev_whirl, hatchet, mullet to the rev_whirl label', () => {
    expect(resolveFamilyOverride('rev_whirl')).toBe('rev_whirl');
    expect(resolveFamilyOverride('hatchet')).toBe('rev_whirl');
    expect(resolveFamilyOverride('mullet')).toBe('rev_whirl');
  });

  it('returns null for whirl-family rows not in the override (canonical Whirl members)', () => {
    expect(resolveFamilyOverride('whirl')).toBeNull();
    expect(resolveFamilyOverride('paradox_whirl')).toBeNull();
  });

  it('overrides rev_up into a self-named singleton but preserves tomahawk deferral', () => {
    // rev_up gets a self-bucket override ('rev_up' → 'rev_up') so the
    // family-view length>1 filter drops it; rev_up still surfaces on the
    // ADD view (canonical row active) and carries the pendingDecomposition
    // pill via UNRESOLVED_COMPOUNDS. tomahawk remains curator-deferred.
    expect(resolveFamilyOverride('rev_up')).toBe('rev_up');
    expect(resolveFamilyOverride('tomahawk')).toBeNull();
  });

  it('does NOT override the chain-authored compounds (surreal, montage)', () => {
    // Chain-authored compositional reading wins over op-notation mechanics
    // for family membership.
    expect(resolveFamilyOverride('surreal')).toBeNull();
    expect(resolveFamilyOverride('montage')).toBeNull();
  });

  it('emits the curator display name for rev_whirl', () => {
    // The default capitalize-first-char would yield "Rev-whirl"; the
    // curator override renders "Rev Whirl" instead.
    expect(resolveFamilyDisplayName('rev_whirl')).toBe('Rev Whirl');
  });

  it('returns null for families without a display-name override', () => {
    expect(resolveFamilyDisplayName('whirl')).toBeNull();
    expect(resolveFamilyDisplayName('butterfly')).toBeNull();
  });

  it('exposes the rev_whirl shared-structure invariant text (mirror form)', () => {
    // The invariant reads as the mirror of the whirl entry so the pairing
    // is legible:
    //   Whirl:     leggy in  dex > ss clipper
    //   Rev-Whirl: leggy out dex > ss clipper
    expect(getFamilyInvariant('rev_whirl')).toBe('leggy out dex > ss clipper');
  });
});

describe('Family view — rev_whirl is a route-out, not a family', () => {
  it('does NOT render a rev_whirl family section', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // rev_whirl has too sparse a lineage to be a public family: no
    // top-level section, no "Rev Whirl family" heading.
    expect(res.text).not.toContain('id="family-rev_whirl"');
    expect(res.text).not.toMatch(/Rev Whirl family<\/a>/);
  });

  it('the rev_whirl, hatchet, mullet rows are absent from the family view entirely', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    for (const slug of ['rev_whirl', 'hatchet', 'mullet']) {
      expect(
        res.text,
        `${slug} routes out of the family view`,
      ).not.toContain(`data-trick-slug="${slug}"`);
    }
  });

  it('the Whirl family does NOT absorb the rev_whirl rows', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
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
  it('Whirl family section renders under its own "Whirl" heading + invariant', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.text).toMatch(/<a href="\/freestyle\/tricks\?family=whirl">Whirl family<\/a>/);
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toMatch(/Shared terminal structure: <code>leggy in dex &gt; ss clipper<\/code>/);
  });

  it('tomahawk STAYS in the Whirl section; rev_up is dropped by its self-bucket override', async () => {
    // rev_up moved into a self-bucket singleton family that the length>1
    // filter drops from family view. tomahawk remains curator-deferred in
    // Whirl.
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
      'rev_up was pulled from Whirl family by its self-bucket override',
    ).not.toContain('data-trick-slug="rev_up"');
  });

  it('chain-authored compound (montage) STAYS in the Whirl section', async () => {
    // Chain identity wins over mechanical execution. montage has a
    // curator-authored chain reading that places it in whirl-family
    // lineage; its FRONT WHIRL execution is a contextual detail-page note,
    // not a family-membership commitment.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toContain('data-trick-slug="montage"');
  });
});

describe('Family filter — rev_whirl rows stay reachable by raw label', () => {
  it('?family=rev_whirl returns 200 and lists its rows (raw trick_family untouched)', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks?family=rev_whirl');
    expect(res.status).toBe(200);
    for (const slug of ['rev_whirl', 'hatchet', 'mullet']) {
      expect(
        res.text,
        `?family=rev_whirl should list ${slug}`,
      ).toContain(`data-trick-slug="${slug}"`);
    }
  });
});
