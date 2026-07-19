/**
 * Butterfly / Far Butterfly / Infinity: safe, non-pre-empting cleanup.
 *
 * - Far Butterfly is retired as a separate public canonical trick: it has no
 *   canonical row, exists only as an alias of butterfly, so its old URL
 *   301-redirects to Butterfly (the project's normal alias-redirect behavior)
 *   and it never appears as a separate browse card.
 * - Infinity is not listed on the generic Butterfly's "Also known as" alias
 *   line (governance-suppressed), but the Butterfly page surfaces it as a
 *   curator naming note explaining that Infinity is the clipper-set butterfly,
 *   so a visitor who searched the folk name learns what it points to. The
 *   historical alias is preserved in data.
 * - The stored Butterfly and Butterfly Same Side rows are unchanged. Public
 *   Butterfly defaults to the far/opposite-side form: the trick page renders the
 *   opposite-side (OP) notation, and the glossary/family card presents the same
 *   far/opposite-side formula and framing rather than a side-either "SAME/OP"
 *   marker. Butterfly Same Side stays the distinct same-side variant. The
 *   family-wide migration of the butterfly-family compound notations is
 *   separate held work and their formulas are unchanged here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickAlias } from '../fixtures/factories';
import { ROOT_TERMINAL_FAMILIES, BRANCH_FAMILIES } from '../../src/content/freestyleGlossaryFamilyCards';

const { dbPath } = setTestEnv('3618');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Base Butterfly: the side-either row (notation unchanged in this slice).
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly', adds: '3',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    operational_notation: 'SET > SAME/OP OUT [DEX] > OP CLIP [XBD] [DEL]',
    description: 'Compound dex; base for ripwalk, dimwalk, and parkwalk.',
    review_status: 'curated', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'butterfly_same_side', canonical_name: 'Butterfly Same Side', adds: '3',
    base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound',
    operational_notation: 'SET > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });

  // Infinity and far butterfly are aliases of butterfly. Far Butterfly has NO
  // canonical row of its own.
  insertFreestyleTrickAlias(db, 'infinity', 'butterfly', 'infinity');
  insertFreestyleTrickAlias(db, 'far_butterfly', 'butterfly', 'far butterfly');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tricks/:slug — Butterfly cluster after the safe cleanup', () => {
  it('far_butterfly is not a canonical page; its old link 301-redirects to butterfly', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/far_butterfly').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/tricks/butterfly');
  });

  it('butterfly surfaces Infinity as a clipper-set naming note, not as a plain alias', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    expect(res.status).toBe(200);
    // The naming note explains the folk name to a visitor who searched "infinity".
    expect(res.text).toContain('Naming &amp; interpretation');
    expect(res.text).toContain('Infinity is a community name for the clipper-set butterfly');
    // But Infinity is still not listed on the "Also known as" alias line: it
    // names the clipper-set form, not a plain alias of the general butterfly.
    const aliasLine = res.text.match(/Also known as<\/dt>\s*<dd>([\s\S]*?)<\/dd>/);
    if (aliasLine) {
      expect(aliasLine[1].toLowerCase()).not.toContain('infinity');
    }
  });

  it('the public butterfly page presents the far/opposite-side form, not a side-either marker', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly');
    // The notation renders as role tokens. Public Butterfly defaults to the
    // far/opposite-side version, so the page shows opposite-side (OP) tokens and
    // never the side-either "SAME/OP OUT" notation marker. (The bare string
    // "SAME/OP" also appears in the cross-body token's tooltip prose, so this
    // guards the notation marker specifically rather than the substring.)
    expect(res.text).toContain('operational-notation-tokens');
    expect(res.text).toContain('op-token--side');
    expect(res.text).not.toContain('SAME/OP OUT');
    expect(res.text).not.toContain('>SAME</span>');
  });

  it('butterfly_same_side remains a distinct page and renders its same-side form', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/butterfly_same_side');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Butterfly Same Side');
    // The same-side variant renders a SAME side token, distinguishing it from
    // the far/opposite-side base Butterfly.
    expect(res.text).toContain('>SAME</span>');
  });
});

describe('GET /freestyle/families/butterfly — glossary/family card reconciled to far default', () => {
  it('the butterfly family card presents the far/opposite-side formula and framing, not SAME/OP', async () => {
    const res = await request(await createApp()).get('/freestyle/families/butterfly');
    expect(res.status).toBe(200);
    // Reconciled canonical formula: opposite-side out-dex, no side-either marker.
    expect(res.text).toContain('OP OUT [DEX]');
    expect(res.text).not.toContain('SAME/OP');
    // Far-default framing prose is present.
    expect(res.text).toContain('far/opposite-side form');
    expect(res.text).toContain('far by default');
    // Butterfly Same Side is named as the separate same-side variant.
    expect(res.text).toContain('Butterfly Same Side');
  });
});

describe('freestyle glossary family cards — butterfly base reconciled, compounds untouched', () => {
  const findCard = (slug: string) =>
    [...ROOT_TERMINAL_FAMILIES, ...BRANCH_FAMILIES].find(c => c.slug === slug);

  it('the base butterfly card canonical formula is the far/opposite-side form (no SAME/OP)', () => {
    const butterfly = findCard('butterfly');
    expect(butterfly).toBeDefined();
    expect(butterfly!.canonicalFormula).toBe('SET > OP OUT [DEX] > OP CLIP [XBD] [DEL]');
    expect(butterfly!.canonicalFormula).not.toContain('SAME/OP');
    expect(butterfly!.teaching.notationIntro).not.toContain('SAME/OP');
  });

  it('the butterfly-family compound cards keep their existing notation (migration held)', () => {
    // butterfly_swirl is a butterfly-family compound; its side-either notation
    // is intentionally unchanged in this slice.
    const butterflySwirl = findCard('butterfly_swirl');
    expect(butterflySwirl).toBeDefined();
    expect(butterflySwirl!.canonicalFormula).toContain('SAME/OP OUT [DEX]');
  });
});

describe('GET /freestyle/tricks — browse no longer lists a separate Far Butterfly card', () => {
  it('the dictionary index has no far_butterfly card link', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('href="/freestyle/tricks/far_butterfly"');
    // Butterfly and Butterfly Same Side remain present.
    expect(res.text).toContain('href="/freestyle/tricks/butterfly"');
    expect(res.text).toContain('href="/freestyle/tricks/butterfly_same_side"');
  });
});
