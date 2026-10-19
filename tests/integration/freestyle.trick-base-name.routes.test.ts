/**
 * Base-name humanization: every trick-page surface that names a trick's base
 * (the difficulty derivation, the modifier-layering panel) renders the base
 * trick's canonical display name, never the raw base_trick slug. A compound
 * whose base is itself a compound has an underscore slug ("ducking_legover"),
 * and the page must read it as prose ("ducking legover"). A base with no
 * dictionary row falls back to the slug with separators read as spaces. The
 * slug itself stays the identity/lookup key (hrefs still carry it). The About
 * section's base-trick row follows the same rule, a trick based on itself shows
 * no base, and the page heading keeps a genuine compound-adjective hyphen.
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
  // A one-modifier compound on that base: the difficulty derivation fires.
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

  // A compound on the compound base with no modifier links: no build path, so
  // the About section names its base in a plain "Base trick" row.
  insertFreestyleTrick(db, {
    slug: 'linkless_compound', canonical_name: 'linkless compound', adds: '4',
    base_trick: 'ducking_legover', category: 'compound',
  });
  // A multi-word trick whose base_trick is its own slug: it is a base trick.
  insertFreestyleTrick(db, {
    slug: 'self_based_stall', canonical_name: 'self based stall', adds: '1',
    base_trick: 'self_based_stall', category: 'surface',
    aliases_json: '["own stall"]',
  });

  // A trick whose name carries a genuine compound-adjective hyphen, as the built
  // dictionary's cross_body_sole_stall row does.
  insertFreestyleTrick(db, {
    slug: 'cross_body_sole_stall', canonical_name: 'cross-body sole stall', adds: '2', category: 'surface',
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

describe('trick-page surfaces render the base display name, never the raw slug', () => {
  it('the difficulty derivation shows the canonical base name for a compound base', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/puck');
    expect(res.status).toBe(200);
    expect(res.text).toContain('pixie(+1) + ducking legover(3)');
    // The raw underscore slug must never appear inside the derivation
    // (attribute values such as hrefs may still carry the slug).
    expect(res.text).not.toContain('ducking_legover(3)');
  });

  it('falls back to the spaced slug when the base has no dictionary row', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/phantom_compound');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('>double_leg_over</span>');
    expect(res.text).not.toContain('double_leg_over(');
  });

  // Defect caught: the About "Base trick" row prints the raw base_trick slug
  // ("ducking_legover") instead of the base trick's name.
  it('the About base-trick row names and links the base by its display name', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/linkless_compound');
    expect(res.status).toBe(200);
    const about = res.text.slice(res.text.indexOf('<dt>Base trick</dt>'));
    expect(about).toMatch(/^<dt>Base trick<\/dt>\s*<dd>\s*<a href="\/freestyle\/tricks\/ducking_legover">Ducking Legover<\/a>/);
  });

  // Defect caught: a base with no active row renders its raw slug as text.
  it('an unlinked base still reads as words, never the slug', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/phantom_compound');
    expect(res.status).toBe(200);
    const about = res.text.slice(res.text.indexOf('<dt>Base trick</dt>'), res.text.indexOf('<dt>Base trick</dt>') + 120);
    expect(about).toContain('Double Leg Over');
    expect(about).not.toContain('double_leg_over');
  });

  // Defect caught: a trick whose base is itself shows itself as its own base.
  it('a trick based on itself shows no base-trick row', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/self_based_stall');
    expect(res.status).toBe(200);
    // The About section still renders (its alias row), so the absence is real.
    expect(res.text).toContain('own stall');
    expect(res.text).not.toContain('<dt>Base trick</dt>');
  });

  // Defect caught: the heading folds every hyphen to a space, so a genuine
  // compound adjective reads "Cross Body Sole Stall" instead of the approved
  // "Cross-body Sole Stall".
  it('the heading keeps a genuine compound-adjective hyphen', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/cross_body_sole_stall');
    expect(res.status).toBe(200);
    const h1 = res.text.match(/<h1[^>]*>([\s\S]*?)<\/h1>/)?.[1] ?? '';
    expect(h1).toContain('Cross-body Sole Stall');
    expect(res.text).not.toContain('Cross Body Sole Stall');
  });

  it('modifier-layering panel names the base by its canonical name', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/stacked_compound');
    expect(res.status).toBe(200);
    expect(res.text).toContain('modifier-layer-name">ducking legover</span>');
    expect(res.text).not.toContain('>ducking_legover</span>');
  });
});
