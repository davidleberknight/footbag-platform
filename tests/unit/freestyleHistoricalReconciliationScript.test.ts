/**
 * The one-time script that repairs the ten historical rulings.
 *
 * The service validates any pair it is handed; only this script knows which ten
 * pairs are the ones. That list is the repair's subject rather than a rule about
 * how reconciliation works, which is why it lives in the script and is checked
 * here as data.
 *
 * Read as text rather than imported, because the file runs its work on import.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SCRIPT = readFileSync(
  join(process.cwd(), 'freestyle/scripts/reconcile_historical_publications.ts'), 'utf8');

/** The ten promoted in the August change, by ruling and by the trick it produced. */
const EXPECTED: Record<string, string> = {
  'ev-3233574d09cba239': 'drifter_swirl',
  'ev-668be8854e7c66fe': 'nemesis_swirl',
  'ev-0a3228b1e762a6c5': 'ripwalk_swirl',
  'ev-c71200f21f5072b7': 'sidewalk_swirl',
  'ev-4221e5696d208548': 'butterfly_reverse_swirl',
  'ev-cb534a88b0b6e9cb': 'barfly_reverse_swirl',
  'ev-bdd9820dbfaea6d5': 'paradon_reverse_swirl',
  'ev-d79742b9ee375ab2': 'stepping_butterfly_reverse_swirl',
  'ev-2f9675dc69e02f79': 'butterfly_flapper',
  'ev-bfc45c5cbfd8cb99': 'symposium_whirling_flapper',
};

function pairs(): Record<string, string> {
  const found: Record<string, string> = {};
  const re = /candidateId: '([^']+)', slug: '([^']+)'/g;
  for (const m of SCRIPT.matchAll(re)) found[m[1]!] = m[2]!;
  return found;
}

describe('the ten pairs', () => {
  it('are exactly the ten historical promotions', () => {
    expect(pairs()).toEqual(EXPECTED);
  });

  it('name each trick once, and each ruling once', () => {
    const found = pairs();
    expect(Object.keys(found)).toHaveLength(10);
    expect(new Set(Object.values(found)).size).toBe(10);
  });

  it('does not include atomic reverse swirl, promoted separately', () => {
    expect(Object.values(pairs())).not.toContain('atomic_reverse_swirl');
  });
});

describe('the script checks the ground before it writes', () => {
  it('preflights every pair before reconciling any of them', () => {
    // Reconciling five and then finding the sixth had drifted would leave the
    // record in a state nobody chose.
    const preflightEnds = SCRIPT.indexOf('if (problems.length > 0)');
    const firstWrite = SCRIPT.indexOf('reconcileHistoricalPublication(');
    expect(preflightEnds).toBeGreaterThan(-1);
    expect(firstWrite).toBeGreaterThan(preflightEnds);
  });

  it('requires each target to still be the committed-input row it was', () => {
    for (const check of ['no such trick', 'not active', 'expected ${EXPECTED_OWNER}',
                         'already recorded against']) {
      expect(SCRIPT).toContain(check);
    }
    expect(SCRIPT).toContain("const EXPECTED_OWNER = 'expert-additions'");
  });

  it('aborts the batch rather than writing part of it', () => {
    expect(SCRIPT).toContain('nothing was written');
  });
});

describe('who the repair is recorded against', () => {
  it('is supplied by the operator, never baked in', () => {
    expect(SCRIPT).toContain('--actor');
    // No member id literal anywhere: the audit trail names a real person, chosen
    // at the time, not whoever happened to write the script.
    expect(SCRIPT).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}/);
    expect(SCRIPT.toLowerCase()).not.toContain('system-actor');
  });

  it('refuses to run without one', () => {
    expect(SCRIPT).toContain('Supply the curator this repair is recorded against');
  });

  it('checks the actor is an active administrator first', () => {
    expect(SCRIPT).toContain('account.getIsAdmin');
    expect(SCRIPT.indexOf('account.getIsAdmin'))
      .toBeLessThan(SCRIPT.indexOf('reconcileHistoricalPublication('));
  });
});

describe('what the script must not do', () => {
  it('never publishes', () => {
    expect(SCRIPT).not.toContain('publishCanonicalTrick');
  });

  it('never writes a trick row itself', () => {
    for (const forbidden of ['INSERT INTO freestyle_tricks', 'UPDATE freestyle_tricks',
                             'DELETE FROM freestyle_tricks', 'trick_origin_producer =']) {
      expect(SCRIPT).not.toContain(forbidden);
    }
  });

  it('offers a dry run, so the batch can be seen before it is made', () => {
    expect(SCRIPT).toContain('--dry-run');
  });
});
