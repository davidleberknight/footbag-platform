/**
 * Integration tests: the railing cohort renders as genuine first-class
 * tricks, with the named-set shorthand AND its full spelled-out expansion.
 *
 * Contract under test:
 *   - With the railing set registered as a (+2) set-type modifier and
 *     linked, the cohort passes the first-class convergence rule
 *     (base + modifiers == official ADD) and renders the Notation summary
 *     card. railing(2) + symposium(1) + mirage(2) = 5, etc.
 *   - The summary card carries BOTH the compact JOB shorthand
 *     ('(railing set) >>') and an EXPANDED row spelling the set out
 *     ('... OP OUT [DEX] (rooted) ...').
 *   - A trick whose JOB notation is already fully expanded (no shorthand)
 *     gets no EXPANDED row.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrick,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3201');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Set + body modifiers the cohort composes from.
  insertFreestyleTrickModifier(db, { slug: 'railing', add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'symposium', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'shooting', add_bonus: 3, add_bonus_rotational: 3, modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'floating', add_bonus: 3, add_bonus_rotational: 3, modifier_type: 'set' });

  // Bases.
  insertFreestyleTrick(db, { slug: 'mirage', canonical_name: 'mirage', base_trick: 'mirage', adds: '2', notation: 'MIRAGE', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'butterfly', canonical_name: 'butterfly', base_trick: 'butterfly', adds: '3', notation: 'BUTTERFLY', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'eggbeater', canonical_name: 'eggbeater', base_trick: 'eggbeater', adds: '3', notation: 'EGGBEATER', category: 'compound', is_active: 1 });

  // Cohort — JOB notation backfilled (uppercase canonical name) so the
  // convergence H2 gate passes; set + body modifiers linked so the ADD
  // converges.
  insertFreestyleTrick(db, { slug: 'dorshanatrix', canonical_name: 'railing symposium mirage', base_trick: 'mirage', adds: '5', notation: 'RAILING SYMPOSIUM MIRAGE', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'dorshanatrix', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'dorshanatrix', 'symposium', 2);

  insertFreestyleTrick(db, { slug: 'flying-fish', canonical_name: 'railing ducking mirage', base_trick: 'mirage', adds: '5', notation: 'RAILING DUCKING MIRAGE', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'flying-fish', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'flying-fish', 'ducking', 2);

  insertFreestyleTrick(db, { slug: 'rail-warrior', canonical_name: 'railing ducking butterfly', base_trick: 'butterfly', adds: '6', notation: 'RAILING DUCKING BUTTERFLY', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'rail-warrior', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'rail-warrior', 'ducking', 2);

  // redwetter — the shooting-set sibling of the same pattern.
  insertFreestyleTrick(db, { slug: 'redwetter', canonical_name: 'shooting eggbeater', base_trick: 'eggbeater', adds: '6', notation: 'SHOOTING EGGBEATER', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'redwetter', 'shooting', 1);

  // floatation — the floating-set (quantum symposium quantum) sibling.
  insertFreestyleTrick(db, { slug: 'floatation', canonical_name: 'floating butterfly', base_trick: 'butterfly', adds: '6', notation: 'FLOATING BUTTERFLY', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'floatation', 'floating', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function trick(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

describe('railing cohort — genuine first-class rendering', () => {
  it('dorshanatrix renders the first-class Notation summary with shorthand + EXPANDED', async () => {
    const html = await trick('dorshanatrix');
    expect(html).toContain('Notation summary');
    // Compact shorthand stays in the JOB row.
    expect(html).toContain('(railing set)');
    // EXPANDED row spells the railing set out (rooted sailing spine).
    expect(html).toMatch(/>EXPANDED</);
    expect(html).toContain('OP OUT [DEX] (rooted)');
  });

  it('flying-fish and rail-warrior also render first-class with the EXPANDED row', async () => {
    for (const slug of ['flying-fish', 'rail-warrior']) {
      const html = await trick(slug);
      expect(html).toContain('Notation summary');
      expect(html).toMatch(/>EXPANDED</);
      expect(html).toContain('(rooted)');
    }
  });

  it('redwetter (shooting set) renders first-class with shorthand + EXPANDED', async () => {
    const html = await trick('redwetter');
    expect(html).toContain('Notation summary');
    expect(html).toContain('(shooting set)');
    expect(html).toMatch(/>EXPANDED</);
    expect(html).toContain('OP OUT [PDX] [DEX]');
  });

  it('floatation (floating set) renders first-class with the shorthand', async () => {
    const html = await trick('floatation');
    expect(html).toContain('Notation summary');
    expect(html).toContain('(floating set)');
  });

  it('a base trick with no set shorthand renders no EXPANDED row', async () => {
    const html = await trick('mirage');
    expect(html).not.toMatch(/>EXPANDED</);
  });
});
