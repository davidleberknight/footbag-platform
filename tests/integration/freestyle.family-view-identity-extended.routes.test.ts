/**
 * Integration tests for Slice A3 of the 2026-05 dictionary/glossary
 * normalization plan — Family View formula-chain extension to butterfly,
 * mirage, and torque/osis pilot families.
 *
 * Contract pinned: same as Slice A2 (see family-view-identity.routes.test.ts)
 * but extended to three additional pilot families. The cross-view identity
 * invariant — first-reading tokens identical across ADD View and Family
 * View — is the load-bearing assertion. Slice A3 adds curator-authored
 * chains for 17 trivially-named or doctrine-locked compounds; this file
 * pins the rendering of the cohort.
 *
 * What this file does NOT assert (intentional):
 *   - parkwalk, blur, witchdoctor, fury, spinal-tap rendering (folk-name
 *     compounds deliberately deferred to curator review).
 *   - Multi-family memberships (Slice D scope).
 *   - Category-view changes (Slice D scope).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3098');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Each pilot lists slug, canonical name, ADD value, family slug,
// and the FIRST reading the chain emits. The test asserts both
// the trick appears in the family view AND the first reading
// renders identically in ADD view + Family view.
interface Pilot {
  slug:        string;
  name:        string;
  adds:        string;
  family:      string;
  firstReadingTokens: string[];   // each token must appear with the sem-token class
}

const BUTTERFLY_PILOTS: Pilot[] = [
  { slug: 'butterfly',          name: 'butterfly',          adds: '3', family: 'butterfly',
    firstReadingTokens: [] },   // base — no chain expected
  { slug: 'atomic-butterfly',   name: 'atomic butterfly',   adds: '4', family: 'butterfly',
    firstReadingTokens: ['atomic', 'butterfly'] },
  { slug: 'ducking-butterfly',  name: 'ducking butterfly',  adds: '4', family: 'butterfly',
    firstReadingTokens: ['ducking', 'butterfly'] },
  { slug: 'spinning-butterfly', name: 'spinning butterfly', adds: '4', family: 'butterfly',
    firstReadingTokens: ['spinning', 'butterfly'] },
  { slug: 'tripwalk',           name: 'tripwalk',           adds: '4', family: 'butterfly',
    firstReadingTokens: ['stepping', 'quantum', 'butterfly'] },
  { slug: 'sidewalk',           name: 'sidewalk',           adds: '4', family: 'butterfly',
    firstReadingTokens: ['stepping', 'near', 'butterfly'] },
];

const MIRAGE_PILOTS: Pilot[] = [
  { slug: 'mirage',           name: 'mirage',           adds: '2', family: 'mirage',
    firstReadingTokens: [] },   // base — no chain expected
  { slug: 'paradox-mirage',   name: 'paradox mirage',   adds: '3', family: 'mirage',
    firstReadingTokens: ['paradox', 'mirage'] },
  { slug: 'symposium-mirage', name: 'symposium mirage', adds: '3', family: 'mirage',
    firstReadingTokens: ['symposium', 'mirage'] },
  { slug: 'smear',            name: 'smear',            adds: '3', family: 'mirage',
    firstReadingTokens: ['pixie', 'mirage'] },
  { slug: 'tap',              name: 'tap',              adds: '3', family: 'mirage',
    firstReadingTokens: ['atomic', 'near', 'mirage'] },
  { slug: 'sumo',             name: 'sumo',             adds: '5', family: 'mirage',
    firstReadingTokens: ['nuclear', 'mirage'] },
];

const OSIS_PILOTS: Pilot[] = [
  { slug: 'osis',          name: 'osis',          adds: '3', family: 'osis',
    firstReadingTokens: [] },   // base
  { slug: 'ducking-osis',  name: 'ducking osis',  adds: '4', family: 'osis',
    firstReadingTokens: ['ducking', 'osis'] },
  { slug: 'spinning-osis', name: 'spinning osis', adds: '4', family: 'osis',
    firstReadingTokens: ['spinning', 'osis'] },
  { slug: 'stepping-osis', name: 'stepping osis', adds: '4', family: 'osis',
    firstReadingTokens: ['stepping', 'osis'] },
];

const TORQUE_PILOTS: Pilot[] = [
  { slug: 'torque',          name: 'torque',          adds: '4', family: 'torque',
    firstReadingTokens: ['miraging', 'osis'] },   // existing pt11-locked chain
  { slug: 'paradox-torque',  name: 'paradox torque',  adds: '5', family: 'torque',
    firstReadingTokens: ['paradox', 'torque'] },
  { slug: 'spinning-torque', name: 'spinning torque', adds: '5', family: 'torque',
    firstReadingTokens: ['spinning', 'torque'] },
  { slug: 'blurry-torque',   name: 'blurry torque',   adds: '6', family: 'torque',
    firstReadingTokens: ['blurry', 'torque'] },   // first reading; second is "stepping paradox torque"
];

const ALL_PILOTS = [...BUTTERFLY_PILOTS, ...MIRAGE_PILOTS, ...OSIS_PILOTS, ...TORQUE_PILOTS];
const PILOTS_WITH_CHAINS = ALL_PILOTS.filter(p => p.firstReadingTokens.length > 0);

beforeAll(async () => {
  const db = createTestDb(dbPath);

  for (const pilot of ALL_PILOTS) {
    insertFreestyleTrick(db, {
      slug:           pilot.slug,
      canonical_name: pilot.name,
      trick_family:   pilot.family,
      category:       pilot.firstReadingTokens.length === 0 ? 'dex' : 'compound',
      adds:           pilot.adds,
      is_active:      1,
    });
  }

  // Non-trick guard rows. They share the target family slugs so the
  // Slice A filter is exercised against the same buckets.
  insertFreestyleTrick(db, {
    slug:           'paradox',
    canonical_name: 'paradox',
    trick_family:   'mirage',
    category:       'modifier',
    adds:           '1',
    is_active:      1,
  });
  insertFreestyleTrick(db, {
    slug:           'pixie',
    canonical_name: 'pixie',
    trick_family:   'butterfly',
    category:       'set',
    adds:           '2',
    is_active:      1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Family View — butterfly / mirage / osis / torque pilot families render', () => {
  const familySections = [
    { family: 'butterfly', pilots: BUTTERFLY_PILOTS },
    { family: 'mirage',    pilots: MIRAGE_PILOTS    },
    { family: 'osis',      pilots: OSIS_PILOTS      },
    { family: 'torque',    pilots: TORQUE_PILOTS    },
  ];

  for (const section of familySections) {
    it(`renders the ${section.family} family section with all pilots`, async () => {
      const app = createApp();
      const res = await request(app).get('/freestyle/tricks?view=family');
      expect(res.status).toBe(200);
      expect(res.text).toContain(`id="family-${section.family}"`);
      for (const pilot of section.pilots) {
        expect(res.text).toContain(`data-trick-slug="${pilot.slug}"`);
      }
    });
  }
});

describe('Family View — Slice A3 chain entries surface as visible formulas', () => {
  it('renders the first-reading tokens for each chained pilot', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);

    for (const pilot of PILOTS_WITH_CHAINS) {
      const cardRegion = res.text.match(
        new RegExp(`data-trick-slug="${pilot.slug}"[\\s\\S]*?<\\/article>`),
      );
      expect(cardRegion, `card region not found for ${pilot.slug}`).not.toBeNull();

      for (const token of pilot.firstReadingTokens) {
        const pattern = new RegExp(`sem-token[^>]*>${token}<`);
        expect(
          cardRegion![0],
          `card for ${pilot.slug} missing token '${token}' in family view`,
        ).toMatch(pattern);
      }
    }
  });

  it('does NOT render "Notation pending" for any chained pilot', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);

    for (const pilot of PILOTS_WITH_CHAINS) {
      const cardRegion = res.text.match(
        new RegExp(`data-trick-slug="${pilot.slug}"[\\s\\S]*?<\\/article>`),
      );
      expect(cardRegion, `card region not found for ${pilot.slug}`).not.toBeNull();
      expect(
        cardRegion![0],
        `card for ${pilot.slug} still shows "Notation pending" — chain missing or unrendered`,
      ).not.toMatch(/Notation pending/);
    }
  });
});

describe('Cross-view identity — ADD View and Family View render identical first reading', () => {
  // One representative pilot per family. The full identity contract
  // (same canonical name + ADD chip + first-reading tokens across views)
  // must hold for each.
  const IDENTITY_PILOTS = [
    'tripwalk',         // butterfly family, "stepping quantum butterfly" — 3-token reading
    'sidewalk',         // butterfly family, "stepping near butterfly" — uses SIDE_POSITIONAL token
    'tap',              // mirage family, "atomic near mirage" — uses SIDE_POSITIONAL token
    'sumo',             // mirage family, "nuclear mirage" — pure modifier+base
    'paradox-torque',   // torque family
  ];

  for (const slug of IDENTITY_PILOTS) {
    it(`renders identical canonical identity for '${slug}' in ADD and Family views`, async () => {
      const pilot = ALL_PILOTS.find(p => p.slug === slug)!;
      const app = createApp();
      const addView    = await request(app).get('/freestyle/tricks?view=add');
      const familyView = await request(app).get('/freestyle/tricks?view=family');
      expect(addView.status).toBe(200);
      expect(familyView.status).toBe(200);

      // Both views carry the data-trick-slug attribute on the card.
      expect(addView.text).toContain(`data-trick-slug="${slug}"`);
      expect(familyView.text).toContain(`data-trick-slug="${slug}"`);

      const addRegion = addView.text.match(
        new RegExp(`data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
      );
      const familyRegion = familyView.text.match(
        new RegExp(`data-trick-slug="${slug}"[\\s\\S]*?<\\/article>`),
      );
      expect(addRegion, `ADD card region not found for ${slug}`).not.toBeNull();
      expect(familyRegion, `Family card region not found for ${slug}`).not.toBeNull();

      // Canonical-name link present in both views.
      const hrefPattern = new RegExp(
        `<a class="dict-card-title" href="/freestyle/tricks/${slug}">${pilot.name}<\\/a>`,
      );
      expect(addRegion![0]).toMatch(hrefPattern);
      expect(familyRegion![0]).toMatch(hrefPattern);

      // ADD label present in both views.
      const addsLabel = `${pilot.adds} ADD`;
      expect(addRegion![0]).toContain(addsLabel);
      expect(familyRegion![0]).toContain(addsLabel);

      // First-reading tokens identical across views.
      for (const token of pilot.firstReadingTokens) {
        const tokenPattern = new RegExp(`sem-token[^>]*>${token}<`);
        expect(
          addRegion![0],
          `ADD view missing first-reading token '${token}' for ${slug}`,
        ).toMatch(tokenPattern);
        expect(
          familyRegion![0],
          `Family view missing first-reading token '${token}' for ${slug}`,
        ).toMatch(tokenPattern);
      }
    });
  }
});

describe('Family View — non-trick filter regression guard (Slice A still works)', () => {
  // After Slice A3 cohort expansion, modifier / operator rows must
  // still be filtered from family-view buckets.
  it('paradox (modifier) does NOT appear in family view even with trick_family=mirage', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-trick-slug="paradox"');
  });

  it('pixie (operator) does NOT appear in family view even with trick_family=butterfly', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tricks?view=family');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('data-trick-slug="pixie"');
  });
});
