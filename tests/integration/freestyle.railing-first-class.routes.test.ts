/**
 * Integration tests: the railing cohort renders the universal notation
 * card, carrying the named-set shorthand in its Execution notation and the
 * full ADD derivation.
 *
 * Contract under test:
 *   - With the railing set registered as a (+2) set-type modifier and
 *     linked, the cohort renders the Execution notation section carrying
 *     the compact named-set shorthand ('(railing set)') as a pre-state
 *     token.
 *   - The ADD derivation section spells the full breakdown
 *     (railing(2) + symposium(1) + mirage(2), shooting(3) + eggbeater(3),
 *     etc.).
 *   - A base trick with no named-set shorthand renders no such shorthand
 *     token (its Execution notation is the plain operational chain).
 *
 * The named-set shorthand lives in the Execution notation and the ADD
 * derivation carries the structural total. The spelled-out form is resurfaced
 * as an "Expanded" line directly below the shorthand tokens.
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
  insertFreestyleTrickModifier(db, { slug: 'warping', add_bonus: 3, add_bonus_rotational: 3, modifier_type: 'set' });

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

  insertFreestyleTrick(db, { slug: 'flying_fish', canonical_name: 'railing ducking mirage', base_trick: 'mirage', adds: '5', notation: 'RAILING DUCKING MIRAGE', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'flying_fish', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'flying_fish', 'ducking', 2);

  insertFreestyleTrick(db, { slug: 'rail_warrior', canonical_name: 'railing ducking butterfly', base_trick: 'butterfly', adds: '6', notation: 'RAILING DUCKING BUTTERFLY', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'rail_warrior', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'rail_warrior', 'ducking', 2);

  // redwetter — the shooting-set sibling of the same pattern.
  insertFreestyleTrick(db, { slug: 'redwetter', canonical_name: 'shooting eggbeater', base_trick: 'eggbeater', adds: '6', notation: 'SHOOTING EGGBEATER', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'redwetter', 'shooting', 1);

  // floatation — the floating-set (quantum symposium quantum) sibling.
  insertFreestyleTrick(db, { slug: 'floatation', canonical_name: 'floating butterfly', base_trick: 'butterfly', adds: '6', notation: 'FLOATING BUTTERFLY', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'floatation', 'floating', 1);

  // warp — the warping-set (two-dex, second symposium) sibling (Red-unlocked).
  insertFreestyleTrick(db, { slug: 'warp', canonical_name: 'warping mirage', base_trick: 'mirage', adds: '5', notation: 'WARPING MIRAGE', category: 'compound', is_active: 1 });
  insertFreestyleTrickModifierLink(db, 'warp', 'warping', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function trick(slug: string): Promise<string> {
  const res = await request(await createApp()).get(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

// Extract the Execution notation section so a shorthand-token assertion
// targets only that region.
function executionNotation(html: string): string | null {
  const classIdx = html.indexOf('operational-notation-display');
  if (classIdx < 0) return null;
  const open = html.lastIndexOf('<section', classIdx);
  const end = html.indexOf('</section>', classIdx);
  if (open < 0 || end < 0) return null;
  return html.slice(open, end + '</section>'.length);
}

describe('railing cohort — universal notation card', () => {
  it('dorshanatrix renders the named-set shorthand in Execution notation and the full ADD derivation', async () => {
    const html = await trick('dorshanatrix');
    // Compact named-set shorthand renders as a pre-state token in the
    // Execution notation section.
    const exec = executionNotation(html);
    expect(exec).not.toBeNull();
    expect(exec!).toContain('(railing set)');
    // The ADD derivation carries the full structural breakdown.
    expect(html).toContain('railing(2) + symposium(1) + mirage(2)');
    // The spelled-out form is resurfaced as an "Expanded" line below the
    // shorthand tokens, inside the Execution notation section.
    expect(exec!).toContain('operational-notation-expanded');
    expect(exec!).toContain('>Expanded<');
  });

  it('flying_fish and rail_warrior also render the named-set shorthand in Execution notation', async () => {
    for (const slug of ['flying_fish', 'rail_warrior']) {
      const html = await trick(slug);
      const exec = executionNotation(html);
      expect(exec).not.toBeNull();
      expect(exec!).toContain('(railing set)');
      // The spelled-out EXPANDED row was retired with the summary card.
      expect(html).not.toMatch(/>EXPANDED</);
    }
  });

  it('redwetter (shooting set) renders the named-set shorthand in Execution notation', async () => {
    const html = await trick('redwetter');
    const exec = executionNotation(html);
    expect(exec).not.toBeNull();
    expect(exec!).toContain('(shooting set)');
    expect(html).toContain('shooting(3) + eggbeater(3)');
    expect(html).not.toMatch(/>EXPANDED</);
  });

  it('floatation (floating set) renders the named-set shorthand', async () => {
    const html = await trick('floatation');
    const exec = executionNotation(html);
    expect(exec).not.toBeNull();
    expect(exec!).toContain('(floating set)');
  });

  it('warp (warping set) renders the named-set shorthand', async () => {
    const html = await trick('warp');
    const exec = executionNotation(html);
    expect(exec).not.toBeNull();
    expect(exec!).toContain('(warping set)');
  });

  it('a base trick renders no named-set shorthand token', async () => {
    // mirage is a base with no named-set; its Execution notation is the
    // plain operational chain. (The EXPANDED row is retired app-wide.)
    const html = await trick('mirage');
    expect(html).not.toMatch(/>EXPANDED</);
    const exec = executionNotation(html);
    if (exec !== null) {
      expect(exec).not.toMatch(/\([a-z]+ set\)/);
    }
  });
});
