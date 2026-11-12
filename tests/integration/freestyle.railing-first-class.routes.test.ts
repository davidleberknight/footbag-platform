/**
 * Integration tests: the railing cohort renders the universal notation
 * card, carrying its stored Execution notation and the full ADD derivation.
 *
 * Contract under test:
 *   - With the railing set registered as a (+2) set-type modifier and
 *     linked, the cohort renders the Execution notation section from the
 *     trick's stored execution notation.
 *   - The ADD derivation section spells the full breakdown
 *     (railing(2) + symposium(1) + mirage(2), shooting(3) + eggbeater(3),
 *     etc.).
 *   - A trick whose curator formula carries an expanded notation shows it
 *     as an "Expanded" line inside the Execution notation section, and a
 *     trick without one shows none.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
} from '../fixtures/factories';
import { insertTrickAsRebuilt } from '../fixtures/stagedFormula';

const { dbPath } = setTestEnv('3201');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// The execution notation the rebuilt database holds for each cohort trick.
const STORED = {
  dorshanatrix: 'TOE > SAME IN [DEX] > OP OUT [DEX] >> (no plant while) OP IN [BOD] [DEX] > OP TOE [DEL]',
  flying_fish:  'TOE > SAME IN [DEX] > OP OUT [DEX] >> DUCK [BOD] > OP IN [DEX] > OP TOE [DEL]',
  rail_warrior: 'TOE > SAME IN [DEX] > OP OUT [DEX] >> DUCK [BOD] > OP OUT [DEX] > OP CLIP [XBD] [DEL]',
  redwetter:    'CLIP > OP IN [DEX] > OP OUT [PDX] [DEX] >> OP OUT [DEX] > OP OUT [DEX] > SAME TOE [DEL]',
  floatation:   'TOE > OP IN [DEX] > (no plant while) OP IN [BOD] [DEX] > SAME OUT [DEX] > OP CLIP [XBD] [DEL]',
  warp:         'SET > OP OUT [DEX] > (no plant while) OP IN [BOD] [DEX] > OP IN [DEX] > OP TOE [DEL]',
} as const;
// The cohort tricks whose curator formula carries an expanded notation.
const WITH_EXPANDED = ['dorshanatrix', 'flying_fish', 'rail_warrior', 'redwetter'] as const;

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
  insertTrickAsRebuilt(db, { slug: 'mirage', canonical_name: 'mirage', base_trick: 'mirage', adds: '2', notation: 'MIRAGE', category: 'compound', is_active: 1 });
  insertTrickAsRebuilt(db, { slug: 'butterfly', canonical_name: 'butterfly', base_trick: 'butterfly', adds: '3', notation: 'BUTTERFLY', category: 'compound', is_active: 1 });
  insertTrickAsRebuilt(db, { slug: 'eggbeater', canonical_name: 'eggbeater', base_trick: 'eggbeater', adds: '3', notation: 'EGGBEATER', category: 'compound', is_active: 1 });

  // Cohort — JOB notation backfilled (uppercase canonical name) so the
  // convergence H2 gate passes; set + body modifiers linked so the ADD
  // converges.
  insertTrickAsRebuilt(db, { slug: 'dorshanatrix', canonical_name: 'railing symposium mirage', base_trick: 'mirage', adds: '5', notation: 'RAILING SYMPOSIUM MIRAGE', category: 'compound', is_active: 1, operational_notation: STORED.dorshanatrix });
  insertFreestyleTrickModifierLink(db, 'dorshanatrix', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'dorshanatrix', 'symposium', 2);

  insertTrickAsRebuilt(db, { slug: 'flying_fish', canonical_name: 'railing ducking mirage', base_trick: 'mirage', adds: '5', notation: 'RAILING DUCKING MIRAGE', category: 'compound', is_active: 1, operational_notation: STORED.flying_fish });
  insertFreestyleTrickModifierLink(db, 'flying_fish', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'flying_fish', 'ducking', 2);

  insertTrickAsRebuilt(db, { slug: 'rail_warrior', canonical_name: 'railing ducking butterfly', base_trick: 'butterfly', adds: '6', notation: 'RAILING DUCKING BUTTERFLY', category: 'compound', is_active: 1, operational_notation: STORED.rail_warrior });
  insertFreestyleTrickModifierLink(db, 'rail_warrior', 'railing', 1);
  insertFreestyleTrickModifierLink(db, 'rail_warrior', 'ducking', 2);

  // redwetter — the shooting-set sibling of the same pattern.
  insertTrickAsRebuilt(db, { slug: 'redwetter', canonical_name: 'shooting eggbeater', base_trick: 'eggbeater', adds: '6', notation: 'SHOOTING EGGBEATER', category: 'compound', is_active: 1, operational_notation: STORED.redwetter });
  insertFreestyleTrickModifierLink(db, 'redwetter', 'shooting', 1);

  // floatation — the floating-set (quantum symposium quantum) sibling.
  insertTrickAsRebuilt(db, { slug: 'floatation', canonical_name: 'floating butterfly', base_trick: 'butterfly', adds: '6', notation: 'FLOATING BUTTERFLY', category: 'compound', is_active: 1, operational_notation: STORED.floatation });
  insertFreestyleTrickModifierLink(db, 'floatation', 'floating', 1);

  // warp — the warping-set (two-dex, second symposium) sibling (Red-unlocked).
  insertTrickAsRebuilt(db, { slug: 'warp', canonical_name: 'warping mirage', base_trick: 'mirage', adds: '5', notation: 'WARPING MIRAGE', category: 'compound', is_active: 1, operational_notation: STORED.warp });
  insertFreestyleTrickModifierLink(db, 'warp', 'warping', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function trick(slug: string): Promise<string> {
  const res = await page(`/freestyle/tricks/${slug}`);
  expect(res.status).toBe(200);
  return res.text;
}

// Extract the Execution notation section so an assertion targets only that
// region.
function executionNotation(html: string): string | null {
  const classIdx = html.indexOf('operational-notation-display');
  if (classIdx < 0) return null;
  const open = html.lastIndexOf('<section', classIdx);
  const end = html.indexOf('</section>', classIdx);
  if (open < 0 || end < 0) return null;
  return html.slice(open, end + '</section>'.length);
}

// The rendered execution notation as plain text, tokens joined by spaces.
function executionText(exec: string): string {
  const code = /<code class="operational-notation-tokens">([\s\S]*?)<\/code>/.exec(exec)?.[1] ?? '';
  return code.replace(/<[^>]+>/g, '').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
}

describe('railing cohort — universal notation card', () => {
  // Defect caught: a cohort trick's page losing its execution notation, or
  // showing something other than the trick's stored chain.
  it('renders each cohort trick\'s stored execution notation', async () => {
    for (const [slug, stored] of Object.entries(STORED)) {
      const exec = executionNotation(await trick(slug));
      expect(exec, slug).not.toBeNull();
      expect(executionText(exec!), slug).toBe(stored);
    }
  });

  // Defect caught: the ADD derivation losing the set's own weight.
  it('spells the full ADD breakdown', async () => {
    expect(await trick('dorshanatrix')).toContain('railing(2) + symposium(1) + mirage(2)');
    expect(await trick('redwetter')).toContain('shooting(3) + eggbeater(3)');
  });

  // Defect caught: the written-out form dropped from a trick whose formula
  // carries one, or shown on a trick whose formula does not.
  it('shows the Expanded line inside the Execution notation section only where the formula has one', async () => {
    for (const slug of WITH_EXPANDED) {
      const exec = executionNotation(await trick(slug));
      expect(exec!, slug).toContain('operational-notation-expanded');
      expect(exec!, slug).toContain('>Expanded<');
    }
    for (const slug of ['floatation', 'warp']) {
      expect(await trick(slug), slug).not.toContain('operational-notation-expanded');
    }
  });
});
