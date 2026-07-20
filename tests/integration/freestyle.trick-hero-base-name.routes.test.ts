/**
 * Hero base-name humanization: the trick-page hero surfaces (ADD-derivation
 * formula, decomposition strip, modifier-layering panel) render the base
 * trick's canonical display name, never the raw base_trick slug. A compound
 * whose base is itself a compound has an underscore slug ("ducking_legover"),
 * and the hero must read it as prose ("ducking legover"). A base with no
 * dictionary row falls back to the slug with separators read as spaces. The
 * slug itself stays the identity/lookup key (hrefs still carry it).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3201');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // The compound base itself (a dictionary row with an underscore slug).
  insertFreestyleTrick(db, {
    slug: 'ducking_legover', canonical_name: 'ducking legover', adds: '3', category: 'compound',
  });
  // A one-modifier compound on that base: hero formula + decomposition fire.
  insertFreestyleTrick(db, {
    slug: 'puck', canonical_name: 'puck', adds: '4',
    base_trick: 'ducking_legover', trick_family: 'legover', category: 'compound',
  });
  // A compound whose base slug has NO dictionary row: fallback path.
  insertFreestyleTrick(db, {
    slug: 'phantom_compound', canonical_name: 'phantom compound', adds: '4',
    base_trick: 'double_leg_over', category: 'compound',
  });
  // A three-modifier compound on the compound base: modifier layering fires.
  insertFreestyleTrick(db, {
    slug: 'stacked_compound', canonical_name: 'stacked compound', adds: '6',
    base_trick: 'ducking_legover', category: 'compound',
  });

  insertFreestyleTrickModifier(db, { slug: 'pixie', modifier_name: 'pixie', add_bonus: 1, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', add_bonus: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking', modifier_name: 'ducking', add_bonus: 1, modifier_type: 'body' });

  insertFreestyleTrickModifierLink(db, 'puck', 'pixie', 1);
  insertFreestyleTrickModifierLink(db, 'phantom_compound', 'pixie', 1);
  insertFreestyleTrickModifierLink(db, 'stacked_compound', 'pixie', 1);
  insertFreestyleTrickModifierLink(db, 'stacked_compound', 'spinning', 2);
  insertFreestyleTrickModifierLink(db, 'stacked_compound', 'ducking', 3);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('hero surfaces render the base display name, never the raw slug', () => {
  it('hero formula shows the canonical base name for a compound base', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/puck');
    expect(res.status).toBe(200);
    expect(res.text).toContain('hero-formula-core-family">ducking legover</span>');
    // The raw underscore slug must never appear as rendered token text
    // (attribute values such as hrefs may still carry the slug).
    expect(res.text).not.toContain('>ducking_legover</span>');
  });

  it('hero decomposition strip shows the canonical base name', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/puck');
    expect(res.status).toBe(200);
    expect(res.text).toContain('data-kind="base">ducking legover</span>');
  });

  it('falls back to the spaced slug when the base has no dictionary row', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/phantom_compound');
    expect(res.status).toBe(200);
    expect(res.text).toContain('>double leg over</span>');
    expect(res.text).not.toContain('>double_leg_over</span>');
  });

  it('modifier-layering panel names the base by its canonical name', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/stacked_compound');
    expect(res.status).toBe(200);
    expect(res.text).toContain('modifier-layer-name">ducking legover</span>');
    expect(res.text).not.toContain('>ducking_legover</span>');
  });
});
