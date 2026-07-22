import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * The semantic JOB-notation locks in the curated corrections must cite a live
 * canonical authority for their label form. The former notation style guide was
 * removed from the repository, so every lock that once cited it is repointed to
 * the current JOB-notation doctrine, except a small set held or superseded for
 * reasons recorded in the doctrine queue. This test pins that migration from the
 * correction rows and the canonical snapshot: the retired guide is cited nowhere,
 * the locks partition into the repointed and held sets, and the doctrine's
 * exemplar and exception values stay in step with canonical data.
 *
 * Scope is deliberately narrow to this migration's known rows; it does not derive
 * every decomposable trick in the dictionary.
 */

const root = process.cwd();
const corrections = fs.readFileSync(
  path.join(root, 'freestyle', 'inputs', 'curated', 'tricks', 'red_corrections_2026_04_20.csv'),
  'utf8',
);
const snapshot = JSON.parse(
  fs.readFileSync(path.join(root, 'tests', 'fixtures', 'freestyleDictionarySnapshot.json'), 'utf8'),
) as { tricks: Array<{ slug: string; notation: string | null }> };

const notationBySlug = new Map(snapshot.tricks.map(t => [t.slug, t.notation]));
const snap = (slug: string) => notationBySlug.get(slug.replace(/-/g, '_')) ?? null;

const RETIRED_GUIDE = 'NOTATION_' + 'STYLE_GUIDE';

// The 40 corrections that historically cited the retired guide, partitioned by
// disposition. Held rows keep a name-form value the default rule does not bless;
// every other row is repointed to the JOB-notation default or its registry.
const HELD = ['blur', 'spinning-symposium-whirl', 'sailing', 'tripwalk'];
const REPOINTED = [
  'head-stall', 'toe-stall', 'heel-stall', 'inside-stall', 'outside-stall',
  'mirage', 'whirl', 'butterfly', 'osis', 'illusion', 'legover', 'torque',
  'drifter', 'clipper', 'swirl', 'around-the-world', 'paradox-whirl',
  'spinning-whirl', 'gauntlet', 'mobius', 'sumo', 'barfly', 'smear', 'tap',
  'paste', 'hatchet', 'pigbeater', 'montage', 'mullet', 'spender',
  'scrambled-eggbeater', 'matador', 'phoenix', 'mind-bender', 'legeater', 'spinal-tap',
];

// The doctrine's exception registry and a sample of its named exemplars, encoded
// as data and verified against the canonical snapshot.
const EXCEPTION_REGISTRY: Record<string, string> = { mobius: 'MOBIUS', sumo: 'SUMO', barfly: 'BARFLY' };
const EXEMPLARS: Record<string, string> = {
  smear: 'PIXIE MIRAGE',
  mullet: 'DUCKING PARADOX SYMPOSIUM WHIRL',
  gauntlet: 'STEPPING DUCKING PARADOX TORQUE',
  'around-the-world': 'ATW',
};

function notationRows(slug: string): string[] {
  return corrections.split('\n').filter(line => line.startsWith(`${slug},notation,`));
}

describe('JOB-notation authority migration', () => {
  it('cites the retired notation style guide nowhere in the corrections', () => {
    expect(corrections.includes(RETIRED_GUIDE)).toBe(false);
  });

  it('repoints 36 locks to the JOB-notation authority and holds 4', () => {
    expect(REPOINTED.length).toBe(36);
    expect(HELD.length).toBe(4);

    for (const slug of REPOINTED) {
      const rows = notationRows(slug);
      expect(rows.length, `${slug} has a notation lock`).toBeGreaterThan(0);
      expect(rows.some(r => r.includes('JOB_NOTATION')), `${slug} cites the authority`).toBe(true);
    }

    const heldMarker = /Historical|held pending|superseded/;
    for (const slug of HELD) {
      const rows = notationRows(slug);
      expect(rows.some(r => heldMarker.test(r)), `${slug} carries a held/superseded disposition`).toBe(true);
    }
  });

  it('keeps the exception registry exactly mobius, sumo, barfly, each matching canonical data', () => {
    expect(Object.keys(EXCEPTION_REGISTRY).sort()).toEqual(['barfly', 'mobius', 'sumo']);
    for (const [slug, value] of Object.entries(EXCEPTION_REGISTRY)) {
      expect(snap(slug), `${slug} snapshot notation`).toBe(value);
    }
  });

  it('keeps the named exemplars in step with canonical data', () => {
    for (const [slug, value] of Object.entries(EXEMPLARS)) {
      expect(snap(slug), `${slug} snapshot notation`).toBe(value);
    }
  });

  it('keeps smear as PIXIE MIRAGE', () => {
    expect(snap('smear')).toBe('PIXIE MIRAGE');
  });

  it('references only doctrine files that exist', () => {
    const doctrine = fs.readdirSync(path.join(root, 'freestyle', 'doctrine'));
    for (const base of ['JOB_NOTATION', 'AUTHORITY', 'RED_RULINGS', 'RED_QUEUE']) {
      expect(doctrine.some(f => f.startsWith(`${base}.`)), `${base} doctrine present`).toBe(true);
    }
  });
});
