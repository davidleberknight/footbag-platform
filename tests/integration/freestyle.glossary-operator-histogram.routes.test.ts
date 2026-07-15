/**
 * The Operators & Modifiers histogram on GET /freestyle/glossary.
 *
 * This histogram is a second rendering surface for the one shared model the
 * Freestyle landing band computes (buildFreestyleByNumbers): the same public
 * trick universe, the same explicit-modifier-link counts, the same operator vs
 * set-system classification. This suite locks that it reuses that model rather
 * than reimplementing a glossary-only aggregate, that it counts only public
 * canonical tricks with explicit modifier links (no aliases, no inactive rows,
 * no modifier stubs), that the two object-type groups render separately in
 * descending order, and that the coverage caveat and accessible labels are
 * present. Counts are seeded, so the expected values are exact.
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
  insertFreestyleTrickAlias,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3097');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Pull the numeric count rendered beside a histogram <dt> label, scoped to the
// operator-histogram section of the page.
function sectionSlice(html: string): string {
  const start = html.indexOf('id="how-widely-systems-appear"');
  const end = html.indexOf('id="lineage-or-ecosystem"');
  expect(start, 'operator histogram section present').toBeGreaterThan(-1);
  expect(end, 'section boundary present').toBeGreaterThan(start);
  return html.slice(start, end);
}
function countFor(slice: string, label: string): number | null {
  // <dt>{label}</dt> ... <span class="gloss-bar-count">{n}</span>
  const re = new RegExp(`<dt>${label}</dt>[\\s\\S]*?gloss-bar-count">(\\d+)<`);
  const m = slice.match(re);
  return m ? Number(m[1]) : null;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Registered modifiers (the link query inner-joins these). spinning/ducking/gyro
  // are movement operators; pixie/paradox are set-system-classified slugs.
  insertFreestyleTrickModifier(db, { slug: 'spinning', modifier_name: 'Spinning', modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'ducking',  modifier_name: 'Ducking',  modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'gyro',     modifier_name: 'Gyro',     modifier_type: 'body' });
  insertFreestyleTrickModifier(db, { slug: 'pixie',    modifier_name: 'Pixie',    modifier_type: 'set' });
  insertFreestyleTrickModifier(db, { slug: 'paradox',  modifier_name: 'Paradox',  modifier_type: 'body' });

  // Four public canonical tricks (arbitrary non-operator slugs, so resolveTrickKind
  // returns 'trick' for each).
  for (const slug of ['ophist_a', 'ophist_b', 'ophist_c', 'ophist_d']) {
    insertFreestyleTrick(db, { slug, canonical_name: slug, adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 1 });
  }
  // An inactive trick and a modifier-category stub: their links must NOT count.
  insertFreestyleTrick(db, { slug: 'ophist_inactive', canonical_name: 'ophist inactive', adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 0 });
  insertFreestyleTrick(db, { slug: 'ophist_modstub',  canonical_name: 'ophist modstub',  adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'modifier', is_active: 1 });
  // An alias of a real trick: aliases are not tricks and never add to a count.
  insertFreestyleTrickAlias(db, 'ophist_alias_1', 'ophist_a', 'ophist alias one');

  // Explicit links. spinning: a,b,c (3). ducking: a,b (2). gyro: a (1).
  // pixie: a,b (2). paradox: a (1).
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_b', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_c', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'ducking');
  insertFreestyleTrickModifierLink(db, 'ophist_b', 'ducking');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'gyro');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'pixie');
  insertFreestyleTrickModifierLink(db, 'ophist_b', 'pixie');
  insertFreestyleTrickModifierLink(db, 'ophist_a', 'paradox');
  // Inactive trick and modifier stub link spinning: must be excluded.
  insertFreestyleTrickModifierLink(db, 'ophist_inactive', 'spinning');
  insertFreestyleTrickModifierLink(db, 'ophist_modstub', 'spinning');

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function glossary(): Promise<string> {
  const res = await request(await createApp()).get('/freestyle/glossary');
  expect(res.status).toBe(200);
  return res.text;
}

describe('Glossary — Operators & Modifiers histogram (shared landing-band model)', () => {
  it('renders the section once, in the Operators & Modifiers chapter, with two separated groups', async () => {
    const html = await glossary();
    expect((html.match(/id="how-widely-systems-appear"/g) ?? []).length).toBe(1);
    const slice = sectionSlice(html);
    expect(slice).toContain('Body and movement operators');
    expect(slice).toContain('Entry, launch, and support systems');
    // Two distinct histogram lists (one per group).
    expect((slice.match(/class="gloss-histogram"/g) ?? []).length).toBe(2);
  });

  it('counts only public canonical tricks with explicit modifier links (no aliases, inactive, or modifier stubs)', async () => {
    const slice = sectionSlice(await glossary());
    // spinning links a,b,c = 3; the inactive trick and the modifier stub also
    // link spinning but are excluded, so the count is 3, not 5.
    expect(countFor(slice, 'spinning')).toBe(3);
    expect(countFor(slice, 'ducking')).toBe(2);
    expect(countFor(slice, 'gyro')).toBe(1);
    expect(countFor(slice, 'pixie')).toBe(2);
    expect(countFor(slice, 'paradox')).toBe(1);
  });

  it('places movement operators and set-system-classified slugs in the correct groups', async () => {
    const slice = sectionSlice(await glossary());
    const opStart = slice.indexOf('Body and movement operators');
    const setStart = slice.indexOf('Entry, launch, and support systems');
    const opGroup = slice.slice(opStart, setStart);
    const setGroup = slice.slice(setStart);
    // Movement operators in group one.
    for (const label of ['spinning', 'ducking', 'gyro']) {
      expect(opGroup).toContain(`<dt>${label}</dt>`);
      expect(setGroup).not.toContain(`<dt>${label}</dt>`);
    }
    // Set-system-classified slugs (incl. paradox) in group two.
    for (const label of ['pixie', 'paradox']) {
      expect(setGroup).toContain(`<dt>${label}</dt>`);
      expect(opGroup).not.toContain(`<dt>${label}</dt>`);
    }
  });

  it('orders each group by descending count', async () => {
    const slice = sectionSlice(await glossary());
    const opStart = slice.indexOf('Body and movement operators');
    const setStart = slice.indexOf('Entry, launch, and support systems');
    const opGroup = slice.slice(opStart, setStart);
    const setGroup = slice.slice(setStart);
    const counts = (region: string): number[] =>
      [...region.matchAll(/gloss-bar-count">(\d+)</g)].map(m => Number(m[1]));
    const opCounts = counts(opGroup);
    const setCounts = counts(setGroup);
    expect(opCounts).toEqual([...opCounts].sort((a, b) => b - a));
    expect(setCounts).toEqual([...setCounts].sort((a, b) => b - a));
  });

  it('carries the documented-coverage caveat and accessible labels', async () => {
    const slice = sectionSlice(await glossary());
    const flat = slice.replace(/\s+/g, ' ');   // collapse HTML line-wrapping
    expect(flat).toMatch(/documented decomposition coverage across the public canonical vocabulary/i);
    expect(flat).toMatch(/explicit editorial decomposition links/i);
    expect(flat).toMatch(/documented coverage rather than every possible occurrence/i);
    expect(slice).toContain('aria-label="Body and movement operators by number of documented tricks"');
    expect(slice).toContain('aria-label="Entry, launch, and support systems by number of documented tricks"');
  });

  it('does not render a modifier-depth histogram', async () => {
    const html = await glossary();
    expect(html.toLowerCase()).not.toContain('modifier depth');
    expect(html.toLowerCase()).not.toContain('modifier-depth');
  });

  it('renders the same operator counts as the Freestyle landing band (one shared model)', async () => {
    const glossSlice = sectionSlice(await glossary());
    const landing = await request(await createApp()).get('/freestyle');
    expect(landing.status).toBe(200);
    // The landing "Body movements" card and the glossary operator group read the
    // same shared aggregation, so a movement operator's count matches on both.
    const landingSpinning = landing.text.match(/spinning[\s\S]{0,200}?by-numbers-bar-count">(\d+)</i);
    expect(landingSpinning, 'landing renders a spinning count').not.toBeNull();
    expect(Number(landingSpinning![1])).toBe(countFor(glossSlice, 'spinning'));
  });
});
