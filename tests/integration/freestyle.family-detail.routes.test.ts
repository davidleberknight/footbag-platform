/**
 * /freestyle/families/:slug — Family detail page.
 *
 * Pins:
 *   - 200 on curated first-class Family Parent slugs (whirl, osis, down)
 *   - 404 on unknown slugs, minor-lineage slugs, and raw trick_family
 *     labels (anti-enumeration; only first-class parents have a page)
 *   - Detail page renders: family name, tier label, shared-structure
 *     invariant, member-trick links, glossary-card overview fields
 *   - Optional sections (evolution narrative, observational notes) are
 *     omitted when no source entry exists, never rendered empty
 *   - The Down family is an umbrella: members group by variant (barfly /
 *     double-over-down / paradon / down-double-down); the dod raw label
 *     folds into the double-over-down variant; minor-tier variants have
 *     no page of their own but their tricks render on the down page
 *   - Branch parents (barfly) present as branches of Down with a link
 *   - Route ordering: the family template renders, not the trick shell
 *   - /freestyle/families (bare) redirects to the By-family browse
 *   - The sitemap lists every first-class family page and no minor lineage
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

const { dbPath } = setTestEnv('4021');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Every first-class Family Parent: the curated roster slugs whose detail
// page must render and appear in the sitemap.
const FIRST_CLASS_FAMILY_SLUGS = [
  'mirage', 'illusion', 'butterfly', 'legover', 'pickup', 'whirl', 'osis',
  'drifter', 'down', 'swirl', 'inside_stall', 'torque', 'blender',
  'double_leg_over', 'eggbeater', 'barfly', 'double_over_down',
];

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Whirl family: anchor trick plus a one-operator compound, so the member
  // list spans two operator-rung bands.
  insertFreestyleTrick(db, {
    slug: 'whirl', canonical_name: 'whirl', adds: '3',
    trick_family: 'whirl', category: 'core', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradox_whirl', canonical_name: 'paradox whirl', adds: '4',
    base_trick: 'whirl', trick_family: 'whirl', category: 'compound', is_active: 1,
  });
  insertFreestyleTrickModifier(db, {
    slug: 'paradox', modifier_name: 'paradox', add_bonus: 1,
    add_bonus_rotational: 1, modifier_type: 'body', notes: '',
  });
  insertFreestyleTrickModifierLink(db, 'paradox_whirl', 'paradox');

  // Down family: one trick per variant cell. fusion carries the raw 'dod'
  // label, which folds into the double-over-down variant at display time.
  insertFreestyleTrick(db, {
    slug: 'barfly', canonical_name: 'barfly', adds: '4',
    trick_family: 'barfly', category: 'core', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'fusion', canonical_name: 'fusion', adds: '5',
    trick_family: 'dod', category: 'compound', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'paradon', canonical_name: 'paradon', adds: '4',
    trick_family: 'paradon', category: 'compound', is_active: 1,
  });
  insertFreestyleTrick(db, {
    slug: 'down_double_down', canonical_name: 'down double-down', adds: '4',
    trick_family: 'down_double_down', category: 'compound', is_active: 1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/families/:slug — family detail page', () => {
  it('returns 200 for a first-class family parent (whirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Whirl Family');
  });

  it('returns 200 for a first-class family parent with no seeded members (osis)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Osis Family');
  });

  it('returns 404 for an unknown slug (anti-enumeration)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/not-a-real-family');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a minor-lineage slug (eclipse)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/eclipse');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a raw trick_family label that is not a public family (rev_whirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/rev_whirl');
    expect(res.status).toBe(404);
  });

  it('renders the tier label and the shared-structure invariant', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('Family Parent');
    expect(res.text).toContain('Shared terminal structure');
    expect(res.text).toContain('leggy in dex &gt; ss clipper');
  });

  it('renders member tricks as links to their trick-detail pages, banded by operator depth', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('href="/freestyle/tricks/whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox_whirl"');
    // Two rung bands (Core + 1 operator) mean band headers render.
    expect(res.text).toContain('>Core<');
    expect(res.text).toContain('>1 operator<');
  });

  it('renders the glossary-card overview fields (canonical formula + anchor ADD)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('Canonical formula');
    expect(res.text).toContain('CLIP &gt; OP IN [DEX] &gt; OP CLIP [XBD] [DEL]');
    expect(res.text).toContain('3 ADD');
  });

  it('renders the evolution narrative for a family that has one (whirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('How it branches');
  });

  it('omits the evolution section cleanly for a family without an entry (swirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/swirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('How it branches');
  });

  it('omits the member-tricks section when the dictionary holds no members yet', async () => {
    const res = await request(await createApp()).get('/freestyle/families/pickup');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Member tricks');
  });
});

describe('GET /freestyle/families/down — umbrella family groups members by variant', () => {
  it('returns 200 and renders all four variant groups', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.status).toBe(200);
    expect(res.text).toContain('id="variant-barfly"');
    expect(res.text).toContain('id="variant-double_over_down"');
    expect(res.text).toContain('id="variant-paradon"');
    expect(res.text).toContain('id="variant-down_double_down"');
  });

  it('folds the raw dod label into the double-over-down variant', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    const dodStart = res.text.indexOf('id="variant-double_over_down"');
    const dodEnd   = res.text.indexOf('id="variant-paradon"');
    const dodBlock = res.text.slice(dodStart, dodEnd);
    expect(dodBlock).toContain('href="/freestyle/tricks/fusion"');
  });

  it('keeps minor-tier variant tricks reachable on the down page while their own page 404s', async () => {
    const downRes = await request(await createApp()).get('/freestyle/families/down');
    expect(downRes.text).toContain('href="/freestyle/tricks/paradon"');
    expect(downRes.text).toContain('href="/freestyle/tricks/down_double_down"');
    const paradonRes = await request(await createApp()).get('/freestyle/families/paradon');
    expect(paradonRes.status).toBe(404);
    const dddRes = await request(await createApp()).get('/freestyle/families/down_double_down');
    expect(dddRes.status).toBe(404);
  });

  it('links the first-class variants to their own family pages', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('href="/freestyle/families/barfly"');
    expect(res.text).toContain('href="/freestyle/families/double_over_down"');
  });

  it('barfly presents as a branch of the Down family, linking the down page', async () => {
    const res = await request(await createApp()).get('/freestyle/families/barfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Branch of the');
    expect(res.text).toContain('href="/freestyle/families/down"');
  });
});

describe('GET /freestyle/families/down — the teaching flow (model family page)', () => {
  it('leads the hero with the teaching hook, not the descendant count', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('look like four different tricks. They are not.');
    expect(res.text).not.toContain('documented descendants');
  });

  it('explains what a down physically is, in plain words, before the notation', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('What is a Down?');
    expect(res.text).toContain('A down is a finishing movement');
    const physicalAt = res.text.indexOf('A down is a finishing movement');
    const notationAt = res.text.indexOf('Notation reference');
    expect(physicalAt).toBeGreaterThan(-1);
    expect(notationAt).toBeGreaterThan(physicalAt);
  });

  it('states the one-family ruling as prose, not inside an observational badge', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('By expert ruling the downs are a single structural decomposition');
    expect(res.text).not.toContain('One decomposition, four variants');
    expect(res.text).not.toContain('glossary-layer-badge--observational');
  });

  it('renders the four-variant grid under the structural-model section', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('Structural model');
    expect(res.text).toContain('Toe set, setting-side leg');
    expect(res.text).toContain('Clipper set, other leg');
  });

  it('renders the recognition cues, distinct from execution', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('How to recognize one');
    expect(res.text).toContain('Look for the double dex');
  });

  it('renders the common misconceptions, including the finish-not-start lesson', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('Common misconceptions');
    expect(res.text).toContain('named for how the trick finishes, not how it starts');
  });

  it('links famous compounds that build on the family and drops ones with no live trick', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('Common descendants');
    expect(res.text).toContain('href="/freestyle/tricks/fusion"');
    expect(res.text).not.toContain('href="/freestyle/tricks/dolomite"');
  });

  it('closes with the memorable takeaway', async () => {
    const res = await request(await createApp()).get('/freestyle/families/down');
    expect(res.text).toContain('stop seeing four different tricks and start seeing one family');
  });

  it('does not leak the teaching sections onto a family without authored teaching (whirl)', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).not.toContain('Notation reference');
    expect(res.text).not.toContain('Common misconceptions');
    expect(res.text).toContain('Overview');
  });
});

describe('GET /freestyle/families/osis — a generative-tree teaching page (contract stress test)', () => {
  it('leads with the hook and defines osis by its ending, not its entry', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('so much of the advanced vocabulary grows out of it');
    expect(res.text).toContain('a spin that resolves into a clipper stall');
    expect(res.text).toContain('defined by that ending, not by the way the player enters it');
  });

  it('renders the structural model as a generative tree: prose, no variant grid', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.text).toContain('Structural model');
    expect(res.text).toContain('Osis is a destination');
    expect(res.text).toContain('why osis is called a base');
  });

  it('makes recognition visual and entry-independent', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.text).toContain('How to recognize one');
    expect(res.text).toContain('If removing the modifiers leaves an osis ending');
  });

  it('keeps misconceptions timeless and confines the doctrine gap to the notation reference', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.text).toContain('defined by its terminal movement, not by a particular entry');
    const misconStart  = res.text.indexOf('Common misconceptions');
    const notationStart = res.text.indexOf('Notation reference');
    expect(misconStart).toBeGreaterThan(-1);
    expect(notationStart).toBeGreaterThan(misconStart);
    expect(res.text.slice(misconStart, notationStart)).not.toContain('has not been ruled');
    expect(res.text.slice(notationStart)).toContain('has not been ruled');
  });

  it('closes with the tightened takeaway', async () => {
    const res = await request(await createApp()).get('/freestyle/families/osis');
    expect(res.text).toContain('begin recognizing an entire branch of advanced freestyle');
  });
});

describe('GET /freestyle/families/mirage — the reduction lesson (foundational dexterity)', () => {
  it('answers why to learn Mirage first, with a pictureable physical description', async () => {
    const res = await request(await createApp()).get('/freestyle/families/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('the simplest complete dexterity movement');
    expect(res.text).toContain('One leg circles the bag once before it is caught on a toe stall');
    expect(res.text).toContain('Much of freestyle grows from Mirage');
  });

  it('teaches recognition by reduction', async () => {
    const res = await request(await createApp()).get('/freestyle/families/mirage');
    expect(res.text).toContain('How to recognize one');
    expect(res.text).toContain('Remove the modifiers and Mirage is what is left');
    expect(res.text).toContain('Naming the mirage underneath a trick is usually most of the work');
  });

  it('corrects the beginner-trick misconception and closes on the connected-system takeaway', async () => {
    const res = await request(await createApp()).get('/freestyle/families/mirage');
    expect(res.text).toContain('not just a beginner trick');
    expect(res.text).toContain('one connected system instead of hundreds of unrelated names');
  });
});

describe('GET /freestyle/families/butterfly — the flow lesson (cultural transformation)', () => {
  it('frames Butterfly by the experience, not a universal learning-order claim', async () => {
    const res = await request(await createApp()).get('/freestyle/families/butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('For many players, Butterfly is the first trick that feels less like an isolated move');
  });

  it('teaches the transformation from isolated tricks to continuous movement', async () => {
    const res = await request(await createApp()).get('/freestyle/families/butterfly');
    expect(res.text).toContain('stops feeling like individual tricks and starts feeling like continuous movement');
    expect(res.text).toContain('the beginning of real freestyle');
  });

  it('closes on the link-movement takeaway', async () => {
    const res = await request(await createApp()).get('/freestyle/families/butterfly');
    expect(res.text).toContain('starts being movement you can link together');
  });
});

describe('GET /freestyle/families/:slug — route ordering', () => {
  it('renders the family template, not the trick shell, for a family slug', async () => {
    const res = await request(await createApp()).get('/freestyle/families/whirl');
    expect(res.text).toContain('data-family-slug="whirl"');
    expect(res.text).not.toContain('trick-shell');
  });

  it('leaves the trick-detail route intact for the same slug under /freestyle/tricks', async () => {
    const res = await request(await createApp()).get('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('trick-shell');
  });
});

describe('GET /freestyle/families — bare path redirects to the By-family browse', () => {
  it('redirects to /freestyle/tricks?view=family', async () => {
    const res = await request(await createApp()).get('/freestyle/families').redirects(0);
    expect(res.status).toBe(302);
    expect(res.headers['location']).toBe('/freestyle/tricks?view=family');
  });
});

describe('sitemap — family-detail pages are enumerated', () => {
  it('lists every first-class family page', async () => {
    const res = await request(await createApp()).get('/sitemap.xml');
    expect(res.status).toBe(200);
    for (const slug of FIRST_CLASS_FAMILY_SLUGS) {
      expect(res.text, slug).toContain(`/freestyle/families/${slug}</loc>`);
    }
  });

  it('does not list minor lineages or the bare families redirect', async () => {
    const res = await request(await createApp()).get('/sitemap.xml');
    expect(res.text).not.toContain('/freestyle/families/paradon');
    expect(res.text).not.toContain('/freestyle/families/eclipse');
    expect(res.text).not.toMatch(/\/freestyle\/families<\/loc>/);
  });
});
