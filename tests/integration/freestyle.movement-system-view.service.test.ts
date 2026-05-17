/**
 * Service-shape tests for Slice L1 — the Movement System view projection.
 *
 * Slice L1 is data-only — no UI is wired in this slice. These tests
 * therefore call freestyleService.getFreestyleTricksIndexPage() directly
 * and inspect the resulting `content.movementSystemView` shape.
 *
 * The UI branch (?view=movement-system) ships in Slice L2; route-level
 * integration coverage is added then.
 *
 * Scope verified:
 *   - movementSystemView exists on FreestyleTricksIndexContent
 *   - Four axes are declared and surface in canonical order when populated
 *   - Empty axes are pruned (no zero-group sections)
 *   - Pilot modifiers bucket into the correct axis
 *   - Groups carry cards shaped via the canonical dictionary-trick-card partial
 *   - Cards within a group sort ADD ascending then name
 *   - Each axis carries an axis definition + anchor id
 *   - Each group carries `anchorId = 'movement-{slug}'`
 *   - kind!=='trick' rows (modifiers/operators/surfaces) excluded
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Modifiers — one per pilot axis-modifier from the content module.
  // (Spread across body + set so the existing component-axis filter
  // routes both types into the accumulator.)
  insertFreestyleTrickModifier(db, { slug: 'pixie',     modifier_name: 'pixie',     modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'fairy',     modifier_name: 'fairy',     modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'atomic',    modifier_name: 'atomic',    modifier_type: 'set',  add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'stepping',  modifier_name: 'stepping',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'paradox',   modifier_name: 'paradox',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'spinning',  modifier_name: 'spinning',  modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'ducking',   modifier_name: 'ducking',   modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });
  insertFreestyleTrickModifier(db, { slug: 'symposium', modifier_name: 'symposium', modifier_type: 'body', add_bonus: 1, add_bonus_rotational: 1 });

  // Tricks. ADDs chosen so within-group sort is verifiable.
  // dimwalk (pixie) — set-uptime axis
  insertFreestyleTrick(db, { slug: 'dimwalk',         canonical_name: 'dimwalk',         adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', operational_notation: '[clip] > pixie > butterfly wing > ss clipper' });
  // pixie-illusion (pixie) — earlier ADD for sort assertion
  insertFreestyleTrick(db, { slug: 'pixie-illusion',  canonical_name: 'pixie illusion',  adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > pixie > hippy in dex > op toe' });
  // atom-smasher (atomic) — set-uptime axis
  insertFreestyleTrick(db, { slug: 'atom-smasher',    canonical_name: 'atom smasher',    adds: '4', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', operational_notation: '[set] > atomic > hippy in dex > op toe' });
  // paradox-whirl (paradox) — entry-topology axis
  insertFreestyleTrick(db, { slug: 'paradox-whirl',   canonical_name: 'paradox whirl',   adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > paradox > front whirl > ss clipper' });
  // spinning-whirl (spinning) — midtime-body axis
  insertFreestyleTrick(db, { slug: 'spinning-whirl',  canonical_name: 'spinning whirl',  adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > spinning > front whirl > ss clipper' });
  // ducking-whirl (ducking) — midtime-body axis
  insertFreestyleTrick(db, { slug: 'ducking-whirl',   canonical_name: 'ducking whirl',   adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', operational_notation: '[clip] > duck > front whirl > ss clipper' });
  // symposium-mirage (symposium) — no-plant-suspension axis
  insertFreestyleTrick(db, { slug: 'symposium-mirage', canonical_name: 'symposium mirage', adds: '5', base_trick: 'mirage', trick_family: 'mirage', category: 'compound', operational_notation: '[set] > symposium > hippy in dex > op toe' });

  // Modifier links — link each trick to its axis-driving modifier.
  insertFreestyleTrickModifierLink(db, 'dimwalk',         'pixie',     1);
  insertFreestyleTrickModifierLink(db, 'pixie-illusion',  'pixie',     1);
  insertFreestyleTrickModifierLink(db, 'atom-smasher',    'atomic',    1);
  insertFreestyleTrickModifierLink(db, 'paradox-whirl',   'paradox',   1);
  insertFreestyleTrickModifierLink(db, 'spinning-whirl',  'spinning',  1);
  insertFreestyleTrickModifierLink(db, 'ducking-whirl',   'ducking',   1);
  insertFreestyleTrickModifierLink(db, 'symposium-mirage', 'symposium', 1);

  db.close();
});

afterAll(() => cleanupTestDb(dbPath));

// ─────────────────────────────────────────────────────────────────────────
// Service shape — direct invocation; route-level tests deferred to Slice L2.
// ─────────────────────────────────────────────────────────────────────────

describe('Slice L1 — Movement System view shape on FreestyleTricksIndexContent', () => {
  it('surfaces movementSystemView with the curator-authored observational note + non-empty axes', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const page = freestyleService.getFreestyleTricksIndexPage();
    const view = page.content.movementSystemView;

    expect(view).toBeDefined();
    expect(typeof view.observationalNote).toBe('string');
    expect(view.observationalNote.length).toBeGreaterThan(40);
    expect(view.axes.length).toBeGreaterThan(0);
  });

  it('axes appear in canonical declaration order when populated', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;
    const axisKeys = view.axes.map(a => a.axisKey);

    // The pilot seed populates all four axes — assert full ordering.
    expect(axisKeys).toEqual([
      'set-uptime',
      'entry-topology',
      'midtime-body',
      'no-plant-suspension',
    ]);
  });

  it('each axis carries an anchor id, name, and definition', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;

    for (const axis of view.axes) {
      expect(axis.anchorId).toBe(`movement-axis-${axis.axisKey}`);
      expect(axis.axisName.length).toBeGreaterThan(0);
      expect(axis.axisDefinition.length).toBeGreaterThan(0);
    }
  });

  it('Set / Uptime axis contains pixie + atomic groups (curator-confirmed pilot)', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;
    const setUptime = view.axes.find(a => a.axisKey === 'set-uptime');

    expect(setUptime).toBeDefined();
    const modifierSlugs = setUptime!.groups.map(g => g.modifierSlug);
    expect(modifierSlugs).toContain('pixie');
    expect(modifierSlugs).toContain('atomic');
  });

  it('Entry Topologies axis contains paradox group only', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;
    const entry = view.axes.find(a => a.axisKey === 'entry-topology');

    expect(entry).toBeDefined();
    expect(entry!.groups.map(g => g.modifierSlug)).toEqual(['paradox']);
  });

  it('Midtime Body axis contains spinning + ducking groups', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;
    const midtime = view.axes.find(a => a.axisKey === 'midtime-body');

    expect(midtime).toBeDefined();
    const modifierSlugs = midtime!.groups.map(g => g.modifierSlug);
    expect(modifierSlugs).toContain('spinning');
    expect(modifierSlugs).toContain('ducking');
  });

  it('No-Plant & Suspension axis contains symposium group only', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;
    const noPlant = view.axes.find(a => a.axisKey === 'no-plant-suspension');

    expect(noPlant).toBeDefined();
    expect(noPlant!.groups.map(g => g.modifierSlug)).toEqual(['symposium']);
  });

  it('each modifier group carries anchorId = "movement-{slug}" and a memberCount that matches its cards', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;

    for (const axis of view.axes) {
      for (const group of axis.groups) {
        expect(group.anchorId).toBe(`movement-${group.modifierSlug}`);
        expect(group.cards.length).toBe(group.memberCount);
        expect(group.memberCount).toBeGreaterThan(0);
      }
    }
  });

  it('cards within a group sort ADD ascending then by name', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;
    const setUptime = view.axes.find(a => a.axisKey === 'set-uptime')!;
    const pixie = setUptime.groups.find(g => g.modifierSlug === 'pixie')!;

    // Seed: pixie-illusion (ADD 3) + dimwalk (ADD 4) — both link to pixie.
    expect(pixie.cards.length).toBe(2);
    expect(pixie.cards[0]!.slug).toBe('pixie-illusion');
    expect(pixie.cards[1]!.slug).toBe('dimwalk');
  });

  it('group bodyDefinition is populated from COMPONENT_DEFINITIONS when curator-authored', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;
    const midtime = view.axes.find(a => a.axisKey === 'midtime-body')!;
    const spinning = midtime.groups.find(g => g.modifierSlug === 'spinning')!;

    // The spinning body-mechanics definition is shared with the Component
    // view — Slice L1 reuses the same content map intentionally.
    expect(spinning.bodyDefinition).not.toBeNull();
    expect(spinning.bodyDefinition!).toMatch(/rotation/i);
  });

  it('cards conform to the canonical DictionaryTrickCard contract (kind === "trick")', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;

    for (const axis of view.axes) {
      for (const group of axis.groups) {
        for (const card of group.cards) {
          // The Slice A discriminator filter must apply uniformly across browse views.
          expect(card.kind).toBe('trick');
          // Each card must carry the canonical view-model fields the partial reads.
          expect(typeof card.slug).toBe('string');
          expect(typeof card.displayName).toBe('string');
          expect(typeof card.addsLabel).toBe('string');
        }
      }
    }
  });

  it('empty axes are pruned (axes with zero populated groups do not appear)', async () => {
    // Sanity: if MOVEMENT_SYSTEM_AXES ever grows an axis whose modifiers are
    // entirely absent from the test seed, that axis must not render. The
    // current pilot covers all four axes — this is a structural invariant
    // assertion, not a count assertion.
    const { freestyleService } = await import('../../src/services/freestyleService');
    const view = freestyleService.getFreestyleTricksIndexPage().content.movementSystemView;

    for (const axis of view.axes) {
      expect(axis.groups.length).toBeGreaterThan(0);
    }
  });
});
