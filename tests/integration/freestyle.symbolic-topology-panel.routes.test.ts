/**
 * Trick pages carry no observational topology panel.
 *
 * The symbolic-grammar topology groups still exist as data, and a trick can
 * still belong to one, but a trick page no longer lists "Related topology
 * tricks" with an observational badge and a non-canonical disclaimer: that was
 * internal taxonomy on a public page, and the page's related-trick lists already
 * do the job. The educational links the same memberships drive (a trick to its
 * teaching page) stay.
 *
 * The dictionary keys tricks by the underscore canonical slug (spinning_whirl)
 * while the symbolic-grammar CSVs key by hyphenated slug (spinning-whirl), so
 * these tests seed underscore slugs the way production does, with enough
 * topology-group members that the old panel would have rendered on every
 * flagship page listed here.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick } from '../fixtures/factories';

const { dbPath } = setTestEnv('3091');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

// The flagship slugs the panel used to render on, plus enough members of their
// butterfly-wing and whirl-rotational topology groups that the panel would have
// had tricks to list.
beforeAll(async () => {
  const db = createTestDb(dbPath);

  // butterfly-wing-topology members (per symbolic_group_membership.csv)
  insertFreestyleTrick(db, { slug: 'butterfly',  canonical_name: 'butterfly',   adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ripwalk',    canonical_name: 'ripwalk',     adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'sidewalk',   canonical_name: 'sidewalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dimwalk',    canonical_name: 'dimwalk',     adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'parkwalk',   canonical_name: 'parkwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'bigwalk',    canonical_name: 'bigwalk',     adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'tripwalk',   canonical_name: 'tripwalk',    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'matador',    canonical_name: 'matador',     adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'phoenix',    canonical_name: 'phoenix',     adds: '5', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'dada_curve', canonical_name: 'dada curve',  adds: '4', base_trick: null,        trick_family: 'dada_curve', category: 'compound' });

  // whirl-rotational-topology members
  insertFreestyleTrick(db, { slug: 'whirl',                    canonical_name: 'whirl',                    adds: '3', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'spinning_whirl',           canonical_name: 'spinning whirl',           adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'paradox_whirl',            canonical_name: 'paradox whirl',            adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'ducking_whirl',            canonical_name: 'ducking whirl',            adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'stepping_whirl',           canonical_name: 'stepping whirl',           adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'symposium_whirl',          canonical_name: 'symposium whirl',          adds: '4', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'mullet',                   canonical_name: 'mullet',                   adds: '6', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });
  insertFreestyleTrick(db, { slug: 'montage',                  canonical_name: 'montage',                  adds: '7', base_trick: 'whirl', trick_family: 'whirl', category: 'compound' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const FORMER_FLAGSHIPS = [
  'matador', 'phoenix', 'ripwalk', 'dimwalk', 'sidewalk', 'dada_curve', 'spinning_whirl', 'montage',
];

describe('trick pages carry no observational topology panel', () => {
  it('no former flagship page lists related topology tricks or carries the observational disclaimer', async () => {
    for (const slug of FORMER_FLAGSHIPS) {
      const res = await page(`/freestyle/tricks/${slug}`);
      expect(res.status, slug).toBe(200);
      expect(res.text, `${slug} lists topology tricks`).not.toMatch(/Related topology tricks/i);
      expect(res.text, `${slug} carries the observational badge`).not.toContain('symbolic-layer-badge');
      expect(res.text, `${slug} carries the non-canonical footer`).not.toContain('symbolic-layer-footer');
    }
  });

  it('keeps the educational links the same memberships drive', async () => {
    // Removing the panel took only the panel: ripwalk sits in the butterfly-wing
    // group and still links to the walking-family progression, and montage sits
    // in the spinning family and still links to the spinning modifier page.
    const ripwalk = await page('/freestyle/tricks/ripwalk');
    expect(ripwalk.text).toContain('href="/freestyle/progression/walking-family"');
    const montage = await page('/freestyle/tricks/montage');
    expect(montage.text).toContain('href="/freestyle/modifier/spinning"');
  });
});
