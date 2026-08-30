/**
 * What a reader sees of the Reverse Swirl family.
 *
 * The swirl and reverse-swirl movements are distinct terminal identities, ruled
 * so and corrected in the data: six active tricks carry the reverse-swirl family
 * and none of them is in the swirl family. Until now the browse showed that group
 * nowhere, and a reader who followed a family chip landed on a page headed with
 * the abbreviation the row is keyed by rather than the family's name.
 *
 * A Minor Lineage, exactly as Reverse Whirl is: a chip in the compact band with a
 * live count, and nothing more. It is not first-class, so it is not searchable as
 * a family and heads no section as "Family"; those follow from a separate roster
 * this change does not touch.
 *
 * The fixture carries the six real members plus enough of the swirl family to
 * prove the two do not bleed into each other.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3121');

let createApp: Awaited<ReturnType<typeof importApp>>;

/** The reverse-swirl lineage as the corrected data carries it. */
const REV_SWIRL_FAMILY = [
  { slug: 'rev_swirl', name: 'rev swirl', adds: '3', base: 'swirl' },
  { slug: 'atomic_reverse_swirl', name: 'atomic reverse swirl', adds: '4', base: 'rev_swirl' },
  { slug: 'butterfly_reverse_swirl', name: 'butterfly reverse swirl', adds: '4', base: 'rev_swirl' },
  { slug: 'barfly_reverse_swirl', name: 'barfly reverse swirl', adds: '5', base: 'rev_swirl' },
  { slug: 'paradon_reverse_swirl', name: 'paradon reverse swirl', adds: '5', base: 'rev_swirl' },
  { slug: 'stepping_butterfly_reverse_swirl', name: 'stepping butterfly reverse swirl',
    adds: '5', base: 'rev_swirl' },
];

/** Enough of the swirl family to show the two stay separate.
 *
 *  Deliberately not butterfly-swirl, barfly-swirl or paradon-swirl: each of those
 *  is a browse family in its own right and would render under its own heading
 *  rather than under Swirl, which would prove nothing here.
 */
const SWIRL_FAMILY = [
  { slug: 'swirl', name: 'swirl', adds: '3', base: 'swirl' },
  { slug: 'nemesis_swirl', name: 'nemesis swirl', adds: '7', base: 'swirl' },
  { slug: 'hop_over_swirl', name: 'hop over swirl', adds: '4', base: 'swirl' },
  { slug: 'montage_swirl', name: 'montage swirl', adds: '5', base: 'swirl' },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  REV_SWIRL_FAMILY.forEach((t, i) => insertFreestyleTrick(db, {
    slug: t.slug, canonical_name: t.name, adds: t.adds, base_trick: t.base,
    trick_family: 'rev_swirl', category: 'compound', sort_order: 10 + i,
    operational_notation: 'CLIP > OP IN [DEX] > SAME CLIP [XBD] [DEL]',
  }));
  SWIRL_FAMILY.forEach((t, i) => insertFreestyleTrick(db, {
    slug: t.slug, canonical_name: t.name, adds: t.adds, base_trick: t.base,
    trick_family: 'swirl', category: 'compound', sort_order: 40 + i,
    operational_notation: 'CLIP > SAME BACK SWIRL [DEX] > SAME CLIP [XBD] [DEL]',
  }));
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function familyView(): Promise<string> {
  const res = await request(createApp()).get('/freestyle/tricks?view=family');
  expect(res.status).toBe(200);
  return res.text;
}

describe('the By Family browse', () => {
  it('shows Reverse Swirl as its own group', async () => {
    expect(await familyView()).toContain('Reverse Swirl');
  });

  it('names it as a family rather than as the slug it is keyed by', async () => {
    const html = await familyView();
    expect(html).not.toContain('Rev swirl');
    expect(html).not.toContain('Rev Swirl');
  });

  it('counts its six members', async () => {
    const html = await familyView();
    // The chip carries the live membership; six is what the corrected data holds.
    const near = html.slice(html.indexOf('Reverse Swirl'), html.indexOf('Reverse Swirl') + 400);
    expect(near).toMatch(/\b6\b/);
  });

  it('still shows Swirl, and none of the reverse-swirl six inside it', async () => {
    const html = await familyView();
    expect(html).toContain('id="family-swirl"');
    // Bounded by the next family section rather than by a guessed length, so the
    // claim is about this section and not about however much happens to follow.
    const start = html.indexOf('id="family-swirl"');
    const next = html.indexOf('id="family-', start + 1);
    const section = html.slice(start, next === -1 ? undefined : next);
    for (const t of REV_SWIRL_FAMILY.filter(m => m.slug !== 'rev_swirl')) {
      expect(section).not.toContain(t.name);
    }
  });
});

describe('the raw family filter', () => {
  it('heads the reverse-swirl filter with the family name', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?family=rev_swirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('The Reverse Swirl family');
    expect(res.text).not.toContain('The Rev swirl family');
  });

  it('lists exactly the six members', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?family=rev_swirl');
    for (const t of REV_SWIRL_FAMILY) {
      expect(res.text).toContain(t.name);
    }
    for (const t of SWIRL_FAMILY.filter(s => s.slug !== 'swirl')) {
      expect(res.text).not.toContain(t.name);
    }
  });
});

describe('what the browse entry does not change', () => {
  it('leaves every trick in the family the data gives it', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?family=swirl');
    expect(res.status).toBe(200);
    for (const t of SWIRL_FAMILY) {
      expect(res.text).toContain(t.name);
    }
    // The reverse-swirl six were never in this family; the registry entry does
    // not move a single row either way.
    expect(res.text).not.toContain('barfly reverse swirl');
  });

  it('leaves the ladder on a member detail page as it was', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/barfly_reverse_swirl');
    expect(res.status).toBe(200);
    // Driven by trick_family, not by the registry: the same six, before and after.
    for (const t of REV_SWIRL_FAMILY.filter(m => m.slug !== 'barfly_reverse_swirl')) {
      expect(res.text).toContain(t.name);
    }
  });

  it('heads that page Related rather than Family, because it stays a Minor Lineage', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/barfly_reverse_swirl');
    expect(res.text).toContain('Related');
  });
});
