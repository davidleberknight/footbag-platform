/**
 * A trick page's ADD breakdown adds up to the trick's stored ADD.
 *
 * A compound's modifier links follow one of two conventions. Some list the
 * whole composition from the root, so a compound built on Paradox Mirage
 * keeps the paradox link its base already carries, and the breakdown would
 * count paradox twice. Others list only what is added on top of the base, so a
 * second atomic on an eggbeater that already carries one is a real part. The
 * stored ADD decides which: the breakdown drops a modifier the base carries
 * only when that is what makes the parts sum to the total. The links
 * themselves are untouched, so browsing by modifier still finds the trick.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3492');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrickModifier(db, { slug: 'paradox', modifier_name: 'paradox', add_bonus: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'spinning', add_bonus: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'atomic', modifier_name: 'atomic', add_bonus: 1, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'pixie', modifier_name: 'pixie', add_bonus: 1, modifier_type: 'set' });

  // Whole-composition links: the base carries paradox and so does the compound.
  insertFreestyleTrick(db, {
    slug: 'paradox_mirage', canonical_name: 'paradox mirage', adds: '3',
    base_trick: 'mirage', category: 'compound',
  });
  insertFreestyleTrickModifierLink(db, 'paradox_mirage', 'paradox', 1);
  insertFreestyleTrick(db, {
    slug: 'spinning_paradox_mirage', canonical_name: 'spinning paradox mirage', adds: '4',
    base_trick: 'paradox_mirage', category: 'compound',
  });
  insertFreestyleTrickModifierLink(db, 'spinning_paradox_mirage', 'spinning', 1);
  insertFreestyleTrickModifierLink(db, 'spinning_paradox_mirage', 'paradox', 2);

  // Added-on-top links: a second atomic on a base that already carries one.
  insertFreestyleTrick(db, {
    slug: 'eggbeater', canonical_name: 'eggbeater', adds: '3',
    base_trick: 'legover', category: 'compound',
  });
  insertFreestyleTrickModifierLink(db, 'eggbeater', 'atomic', 1);
  insertFreestyleTrick(db, {
    slug: 'bladerunner', canonical_name: 'bladerunner', adds: '4',
    base_trick: 'eggbeater', category: 'compound',
  });
  insertFreestyleTrickModifierLink(db, 'bladerunner', 'atomic', 1);

  // Neither reading sums to the stored ADD: the breakdown is left as stored.
  insertFreestyleTrick(db, {
    slug: 'unbalanced_compound', canonical_name: 'unbalanced compound', adds: '6',
    base_trick: 'paradox_mirage', category: 'compound',
  });
  insertFreestyleTrickModifierLink(db, 'unbalanced_compound', 'pixie', 1);
  insertFreestyleTrickModifierLink(db, 'unbalanced_compound', 'paradox', 2);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the ADD breakdown sums to the stored ADD', () => {
  // Defect caught: a visitor reads spinning(+1) + paradox(+1) + paradox
  // mirage(3), parts that add to 5, on a trick the page says is 4 ADD.
  it('does not count again a modifier the base already carries', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/spinning_paradox_mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('spinning(+1) + paradox mirage(3)');
    expect(res.text).not.toContain('paradox(+1) + paradox mirage(3)');
  });

  // Defect caught: a second atomic is dropped because the base also has one,
  // and the page shows eggbeater(3) alone for a 4 ADD trick.
  it('keeps a modifier the trick adds again on top of a base that carries it', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/bladerunner');
    expect(res.status).toBe(200);
    expect(res.text).toContain('atomic(+1) + eggbeater(3)');
  });

  // Defect caught: the breakdown drops the carried modifier even when that
  // still does not reach the stored total, so the page's shaped breakdown
  // becomes a second wrong sum (pixie + paradox mirage on a 6 ADD trick) and
  // the stored inconsistency is hidden instead of left visible to fix.
  it('does not rewrite a trick whose parts add up under neither reading', async () => {
    const { freestyleService } = await import('../../src/services/freestyleService');
    const page = await freestyleService.getTrickDetailPage('unbalanced_compound');
    const parts = (page?.content?.heroFormula ?? [])
      .filter(token => !token.isOperator)
      .map(token => `${token.text}${token.weight ?? ''}`);
    expect(parts).toEqual(['pixie(+1)', 'paradox(+1)', 'paradox mirage(3)']);
  });

  // Defect caught: fixing the breakdown by deleting the link would drop the
  // trick from the Paradox group when browsing by modifier.
  it('still lists the compound under its paradox modifier when browsing', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=modifier&modifier=paradox');
    expect(res.status).toBe(200);
    const at = res.text.indexOf('id="modifier-paradox"');
    expect(at, 'the Paradox group renders').toBeGreaterThanOrEqual(0);
    expect(res.text.slice(at)).toContain('data-trick-slug="spinning_paradox_mirage"');
  });
});
