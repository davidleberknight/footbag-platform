/**
 * Integration tests for the trick-kind discriminator + view filter.
 *
 * Long-term contract (Slice A of the 2026-05 dictionary/glossary
 * normalization plan):
 *
 *   freestyle_tricks mixes structural roles: true tricks, modifiers,
 *   set operators, catch surfaces. The five trick-browse surfaces
 *   (ADD / family / category / component / topology) must render
 *   ONLY rows whose `resolveTrickKind(slug)` returns 'trick'.
 *
 * Why this matters: rows like `pixie`, `atomic`, `paradox` exist in
 * freestyle_tricks but are structurally primitives (set operators /
 * body modifiers), not compound tricks. Mixing them into the
 * difficulty ladder distorts the trick browse and breaks the
 * operator/trick semantic separation the glossary §6 /
 * SEMANTIC_COMPRESSION_DOCTRINE rests on. Surfaces are distinguished
 * by the DB `category` field, not by kind: tricks that end in bag
 * contact (every stall, the Clipper Kick) stay in the ADD ladder.
 *
 * Tests verify:
 *   1. Each known modifier / operator / surface / pending-review slug
 *      is absent from each of the five views.
 *   2. A control trick (a true `kind === 'trick'` row) appears in the
 *      ADD view.
 *   3. The resolver helper itself returns the documented values.
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
  resolveTrickKind,
} from '../../src/content/freestyleTrickKindOverrides';

const { dbPath } = setTestEnv('3096');

let createApp: Awaited<ReturnType<typeof importApp>>;

// One representative slug per kind. Each must already be registered in
// src/content/freestyleTrickKindOverrides.ts; the tests below treat that
// module as the source of truth.
const MODIFIER_SAMPLE   = 'paradox';
const OPERATOR_SAMPLE   = 'pixie';
const BODY_KICK_SAMPLE  = 'clipper';        // Clipper Kick: 1-ADD body kick, NOT filtered
const PENDING_SAMPLE    = 'surging';
const TRICK_SAMPLE      = 'ripwalk';        // canonical compound trick (control)
const STALL_TRICK_SAMPLE = 'clipper-stall'; // legitimate 1-ADD stall trick (NOT filtered)

const ALL_FILTERED_SAMPLES = [
  MODIFIER_SAMPLE,
  OPERATOR_SAMPLE,
  PENDING_SAMPLE,
];

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed one row of each kind. The category column on each row reflects
  // the production DB's classification; the kind discriminator overrides
  // it. Each row's `adds` is non-null so the row would otherwise pass
  // through the (legacy) `adds !== 'modifier'` filter.
  insertFreestyleTrick(db, {
    slug:           MODIFIER_SAMPLE,
    canonical_name: 'paradox',
    category:       'modifier',
    adds:           '1',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           OPERATOR_SAMPLE,
    canonical_name: 'pixie',
    category:       'set',
    adds:           '2',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           BODY_KICK_SAMPLE,
    canonical_name: 'Clipper Kick',
    category:       'body',
    adds:           '1',
    is_active:      1,
  });

  // Stall primitive — kind='trick', NOT filtered. Sanity-anchor for the
  // contract that "all tricks must end with bag contact" is honored:
  // the clipper-stall ADD=1 row stays in the ADD ladder.
  insertFreestyleTrick(db, {
    slug:           STALL_TRICK_SAMPLE,
    canonical_name: 'Clipper Stall',
    category:       'surface',
    adds:           '1',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           PENDING_SAMPLE,
    canonical_name: 'surging',
    category:       'compound',
    adds:           '2',
    is_active:      1,
  });

  // Control: a true trick (compound, ends in bag contact, structural depth).
  insertFreestyleTrick(db, {
    slug:           TRICK_SAMPLE,
    canonical_name: 'Ripwalk',
    category:       'compound',
    trick_family:   'butterfly',
    adds:           '3',
    is_active:      1,
  });

  // Second butterfly-family trick so the family view's `length > 1`
  // display heuristic emits the butterfly section. The kind-filter
  // contract is independent of this heuristic; the second row makes the
  // surface visible so we can assert the control trick rendered.
  insertFreestyleTrick(db, {
    slug:           'dimwalk',
    canonical_name: 'Dimwalk',
    category:       'compound',
    trick_family:   'butterfly',
    adds:           '4',
    is_active:      1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('resolveTrickKind() — content module discriminator', () => {
  it('classifies a body modifier as kind=modifier', () => {
    expect(resolveTrickKind('paradox')).toBe('modifier');
    expect(resolveTrickKind('spinning')).toBe('modifier');
    expect(resolveTrickKind('ducking')).toBe('modifier');
    expect(resolveTrickKind('symposium')).toBe('modifier');
    // `spyro` (category='body' folk rotational descriptor) is modifier-only.
    expect(resolveTrickKind('spyro')).toBe('modifier');
  });

  it('classifies the bare-name spinning kicks as kind=trick (kick-doctrine dual-role)', () => {
    // #spin / #double-spin are historically-recognized bare-name kicks (kick
    // implied) and are canonical first-class tricks, findable in the browse
    // views. The spinning CONCEPT still acts as a modifier inside compounds
    // via the separate `spinning` slug (asserted above) — dual-role, not a
    // contradiction.
    expect(resolveTrickKind('spin')).toBe('trick');
    expect(resolveTrickKind('double-spin')).toBe('trick');
  });

  it('classifies set primitives as kind=operator', () => {
    expect(resolveTrickKind('pixie')).toBe('operator');
    expect(resolveTrickKind('atomic')).toBe('operator');
    expect(resolveTrickKind('fairy')).toBe('operator');
    expect(resolveTrickKind('quantum')).toBe('operator');
    // 0-ADD set primitives stay operator-kind, not 0-ADD trick.
    expect(resolveTrickKind('pogo')).toBe('operator');
    expect(resolveTrickKind('rooted')).toBe('operator');
  });

  it('hides nothing at the kind layer as a bare surface name', () => {
    // Surfaces are distinguished by the DB `category` field, not by kind.
    // `clipper` (the Clipper Kick: category='body', 1 ADD) ends in bag
    // contact and is a legitimate trick that renders in the ADD ladder.
    expect(resolveTrickKind('clipper')).toBe('trick');
  });

  it('classifies legitimate stall primitives as kind=trick (NOT surface)', () => {
    // Stall primitives end in bag contact; they pass the discriminating
    // criterion for `kind='trick'` and surface in the ADD ladder as the
    // simplest tricks. The future isSurface facet (Slice E/F) will add
    // the glossary §2 cross-link without conflating with kind.
    expect(resolveTrickKind('toe-stall')).toBe('trick');
    expect(resolveTrickKind('clipper-stall')).toBe('trick');
    expect(resolveTrickKind('cloud-stall')).toBe('trick');
    expect(resolveTrickKind('inside-stall')).toBe('trick');
  });

  it('classifies curator-flagged ambiguities as kind=pending-review', () => {
    expect(resolveTrickKind('surging')).toBe('pending-review');
  });

  it('defaults unknown slugs to kind=trick', () => {
    expect(resolveTrickKind('ripwalk')).toBe('trick');
    expect(resolveTrickKind('mobius')).toBe('trick');
    expect(resolveTrickKind('whirl')).toBe('trick');
    expect(resolveTrickKind('a-slug-that-doesnt-exist-anywhere')).toBe('trick');
  });
});

describe('Trick-browse view filter — non-trick kinds excluded', () => {
  // The five trick-browse views. Each must omit modifier/operator/surface/
  // pending-review rows. We assert by checking that each filtered slug
  // does NOT appear in the rendered HTML (since the dictionary card carries
  // `data-trick-slug="{slug}"` attribute on every card it renders).
  const views = [
    { name: 'ADD',       url: '/freestyle/tricks' },
    { name: 'family',    url: '/freestyle/tricks?view=family' },
    { name: 'category',  url: '/freestyle/tricks?view=category' },
    { name: 'component', url: '/freestyle/tricks?view=component' },
    { name: 'topology',  url: '/freestyle/tricks?view=topology' },
  ];

  for (const view of views) {
    for (const slug of ALL_FILTERED_SAMPLES) {
      it(`excludes non-trick slug '${slug}' from ${view.name} view`, async () => {
        const app = createApp();
        const res = await request(app).get(view.url);
        expect(res.status).toBe(200);
        expect(res.text).not.toContain(`data-trick-slug="${slug}"`);
      });
    }
  }
});

describe('Trick-browse view filter — true tricks preserved', () => {
  it('renders the control trick in the ADD view', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-trick-slug="${TRICK_SAMPLE}"`);
  });

  it('renders the control trick in the family view (butterfly family)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    // The control trick has trick_family='butterfly'; family-view groups by
    // family-slug. The card markup carries the trick's data-trick-slug.
    expect(res.text).toContain(`data-trick-slug="${TRICK_SAMPLE}"`);
  });

  it('renders stall primitives in the ADD view (they end in bag contact)', async () => {
    // Sanity: the kind discriminator does NOT filter legitimate stalls.
    // clipper-stall (1 ADD) is a tricks-end-in-bag-contact primitive and
    // must remain in the ADD ladder.
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-trick-slug="${STALL_TRICK_SAMPLE}"`);
  });

  it('renders the Clipper Kick in the ADD view (body kick, ends in bag contact)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).toContain(`data-trick-slug="${BODY_KICK_SAMPLE}"`);
  });
});
