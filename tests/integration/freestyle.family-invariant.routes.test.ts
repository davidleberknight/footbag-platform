/**
 * Integration tests for Slice I — family-level shared-terminal-structure
 * invariant (Whirl pilot, 2026-05-16).
 *
 * Long-term contract:
 *
 *   Curator-authored family invariants surface as a small subdued line
 *   between the family-view section heading and the card stack. They
 *   teach the conserved terminal mechanic shared by every family
 *   member.
 *
 *   - The invariant lives at the FAMILY level, NOT inside individual
 *     cards. Card rendering is unchanged from the
 *     PRESENTATION_UNIFICATION_SLICE contract.
 *   - Curator-authored only (TypeScript content module). Absence = no
 *     line rendered. No auto-derivation.
 *   - Whirl pilot is the only family with an entry today. Other
 *     families (butterfly / mirage / osis / torque / legover / etc.)
 *     render WITHOUT the invariant line.
 *
 * Per the curator's terminal-vs-entry-topology distinction, only TRUE
 * terminal families (whirl, butterfly, mirage, osis, swirl) are
 * candidates for invariant entries. Entry/topology/modifier systems
 * (paradox, symposium, spinning, ducking, stepping, pixie/fairy/atomic)
 * are NOT.
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
  getFamilyInvariant,
} from '../../src/content/freestyleFamilyInvariants';

const { dbPath } = setTestEnv('3102');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Two whirl-family rows so the family-view length>1 heuristic admits
  // the section.
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl',
    trick_family: 'whirl', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox-whirl', canonical_name: 'paradox whirl',
    trick_family: 'whirl', category: 'compound', adds: '4', is_active: 1,
  });

  // Two butterfly-family rows (no curator invariant — section should
  // render WITHOUT the invariant line).
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly',
    trick_family: 'butterfly', category: 'dex', adds: '3', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'ripwalk', canonical_name: 'ripwalk',
    trick_family: 'butterfly', category: 'compound', adds: '4', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Family invariant — content module', () => {
  it('returns the Whirl invariant text exactly', () => {
    expect(getFamilyInvariant('whirl')).toBe('leggy in dex > ss clipper');
  });

  it('returns the Butterfly invariant text exactly', () => {
    expect(getFamilyInvariant('butterfly')).toBe('hippy out dex > ss clipper');
  });

  it('returns null for families that remain without a curator entry', () => {
    // Slice-I + Dictionary Pedagogy Phase 1 cover the six curator-named
    // terminal-family candidates (whirl, rev-whirl, butterfly, mirage,
    // osis, swirl). Non-terminal families and branch families remain
    // without invariants and return null.
    expect(getFamilyInvariant('torque')).toBeNull();
    expect(getFamilyInvariant('drifter')).toBeNull();
  });

  it('returns null for unknown family slugs', () => {
    expect(getFamilyInvariant('not-a-family-slug')).toBeNull();
  });

  it('returns null for entry/topology/modifier systems that are NOT terminal families', () => {
    // Paradox, symposium, spinning, ducking are entry/topology/modifier
    // systems — not terminal families. The curator distinction says these
    // do NOT belong here. Verify each returns null.
    for (const nonTerminalSlug of [
      'paradox', 'symposium', 'spinning', 'ducking', 'stepping',
      'pixie', 'fairy', 'atomic',
    ]) {
      expect(
        getFamilyInvariant(nonTerminalSlug),
        `family invariant must NOT exist for non-terminal '${nonTerminalSlug}'`,
      ).toBeNull();
    }
  });
});

describe('Family invariant — rendered on Family View', () => {
  it('renders the Whirl family invariant line on /freestyle/tricks?view=family', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).toContain('class="trick-family-shared-structure"');
    expect(res.text).toMatch(
      /Shared terminal structure: <code>leggy in dex &gt; ss clipper<\/code>/,
    );
  });

  it('positions the invariant BETWEEN section heading and card stack on Whirl family', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    // Slice the rendered HTML scoped to the whirl family section.
    const sectionStart = res.text.indexOf('id="family-whirl"');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);

    const headingIdx   = sectionHtml.indexOf('class="section-heading"');
    const invariantIdx = sectionHtml.indexOf('class="trick-family-shared-structure"');
    const stackIdx     = sectionHtml.indexOf('class="dict-trick-row-stack');

    expect(headingIdx).toBeGreaterThan(-1);
    expect(invariantIdx).toBeGreaterThan(headingIdx);
    expect(stackIdx).toBeGreaterThan(invariantIdx);
  });

  it('renders the Butterfly family invariant line', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-butterfly"');
    expect(sectionStart).toBeGreaterThan(-1);
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    expect(sectionHtml).toContain('class="trick-family-shared-structure"');
    expect(sectionHtml).toMatch(
      /Shared terminal structure: <code>hippy out dex &gt; ss clipper<\/code>/,
    );
  });
});

describe('Family invariant — does NOT destabilize card rendering', () => {
  it('Whirl family rows render with the two-line dict-trick-row contract', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    const sectionStart = res.text.indexOf('id="family-whirl"');
    const sectionEnd = res.text.indexOf('</section>', sectionStart);
    const sectionHtml = res.text.slice(sectionStart, sectionEnd);
    // Family view rows use the generalized two-line dict-trick-row, not the
    // shared dict-card.
    expect(sectionHtml).toContain('class="dict-trick-row');
    expect(sectionHtml).not.toContain('class="dict-card dict-card--registry');
    // The rows do NOT carry the invariant line — invariant is family-level only.
    const cardStart = sectionHtml.indexOf('data-trick-slug="paradox-whirl"');
    expect(cardStart).toBeGreaterThan(-1);
    const cardEnd = sectionHtml.indexOf('</article>', cardStart);
    const cardHtml = sectionHtml.slice(cardStart, cardEnd);
    expect(cardHtml).not.toContain('Shared terminal structure');
    expect(cardHtml).not.toContain('trick-family-shared-structure');
  });
});
