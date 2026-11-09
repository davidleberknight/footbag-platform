/**
 * /freestyle/families/:slug — Family detail page.
 *
 * Pins:
 *   - 200 on curated first-class Family Parent slugs (whirl, osis, down)
 *   - 404 on unknown slugs, minor-lineage slugs, and raw trick_family
 *     labels (anti-enumeration; only first-class parents have a page)
 *   - Detail page renders: family name, tier label, teaching text, and the
 *     lowest-ADD example tricks with a link to the whole family
 *   - The Down family is an umbrella: its examples come from every variant;
 *     the dod raw label folds into the double-over-down variant; minor-tier
 *     variants have no page of their own
 *   - Branch parents (barfly) present as branches of Down with a link
 *   - Route ordering: the family template renders, not the trick shell
 *   - /freestyle/families (bare) has no page and answers not-found
 *   - The sitemap lists every first-class family page and no minor lineage
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';

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
const page = cachedGet(() => createApp());

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
  // A whirl family-evolution exemplar that resolves to a real trick page, so the
  // evolution block exercises both the linked and the plain-text branches.
  insertFreestyleTrick(db, {
    slug: 'blender', canonical_name: 'blender', adds: '4',
    trick_family: 'blender', category: 'compound', is_active: 1,
  });
  // Swirl family: one member so the swirl family detail page renders its card.
  insertFreestyleTrick(db, {
    slug: 'swirl', canonical_name: 'swirl', adds: '3',
    trick_family: 'swirl', category: 'core', is_active: 1,
  });

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

  // Inside-stall family: more members than the page shows, seeded with the
  // highest ADD first so a list in insertion order cannot pass the ordering case.
  for (let adds = 12; adds >= 1; adds -= 1) {
    insertFreestyleTrick(db, {
      slug: `inside_example_${adds}`, canonical_name: `inside example ${adds}`, adds: String(adds),
      trick_family: 'inside_stall', category: 'compound', is_active: 1,
    });
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/families/:slug — page budget and examples', () => {
  // Defect caught: a family page regrows into the long reference it was cut from.
  it('keeps every family page under 600 words and at most 6 sections', async () => {
    for (const slug of FIRST_CLASS_FAMILY_SLUGS) {
      const res = await page(`/freestyle/families/${slug}`);
      expect(res.status, slug).toBe(200);
      const main = res.text.match(/<main[\s\S]*<\/main>/)?.[0] ?? '';
      expect(main.match(/<h2[\s>]/g)?.length ?? 0, `${slug} sections`).toBeLessThanOrEqual(6);
      const words = main.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
      expect(words, `${slug} words`).toBeLessThan(600);
    }
  });

  // Defect caught: the example list shows every member again, or shows the
  // hardest tricks instead of where a newcomer starts.
  it('shows the eight lowest-ADD members in ADD order', async () => {
    const res = await page('/freestyle/families/inside_stall');
    const shown = [...res.text.matchAll(/<li class="set-detail-trick">\s*<a href="\/freestyle\/tricks\/inside_example_(\d+)"/g)]
      .map(m => Number(m[1]));
    expect(shown).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });

  // Defect caught: the members beyond the eighth become unreachable from the page.
  it('links to the whole family in the dictionary and counts every member', async () => {
    const res = await page('/freestyle/families/inside_stall');
    expect(res.text).toContain('href="/freestyle/tricks?view=family#family-inside_stall"');
    expect(res.text).toMatch(/<span class="section-count">12<\/span>/);
  });
});

describe('GET /freestyle/families/:slug — family detail page', () => {
  it('returns 200 for a first-class family parent (whirl)', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Whirl Family');
  });

  it('returns 200 for a first-class family parent with no seeded members (osis)', async () => {
    const res = await page('/freestyle/families/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Osis Family');
  });

  it('returns 404 for an unknown slug (anti-enumeration)', async () => {
    const res = await page('/freestyle/families/not-a-real-family');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a minor-lineage slug (eclipse)', async () => {
    const res = await page('/freestyle/families/eclipse');
    expect(res.status).toBe(404);
  });

  it('returns 404 for a raw trick_family label that is not a public family (rev_whirl)', async () => {
    const res = await page('/freestyle/families/rev_whirl');
    expect(res.status).toBe(404);
  });

  // Defect caught: the family page carries its anchor trick's bare hashtag
  // (#whirl), so the family identity reads as the single trick's tag.
  it('carries the family-role hashtag, distinct from the anchor trick\'s tag', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.status).toBe(200);
    const mediaLine = res.text.match(/<p class="media-line"[^>]*>([\s\S]*?)<\/p>/)?.[1] ?? '';
    expect(mediaLine).toContain('#family_whirl');
    expect(mediaLine).not.toMatch(/#whirl\b/);
  });

  it('renders the tier label', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.text).toContain('Family Parent');
  });

  it('renders member tricks as links to their trick-detail pages', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.text).toContain('href="/freestyle/tricks/whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/paradox_whirl"');
  });

  it('omits the example-tricks section when the dictionary holds no members yet', async () => {
    const empty = await page('/freestyle/families/pickup');
    expect(empty.status).toBe(200);
    expect(empty.text).not.toContain('aria-label="Example tricks"');
    const seeded = await page('/freestyle/families/whirl');
    expect(seeded.text).toContain('aria-label="Example tricks"');
  });
});

describe('GET /freestyle/families/down — umbrella family draws examples from every variant', () => {
  it('folds the raw dod label into the double-over-down variant', async () => {
    const res = await page('/freestyle/families/down');
    expect(res.status).toBe(200);
    expect(res.text).toContain('href="/freestyle/tricks/fusion"');
  });

  it('keeps minor-tier variant tricks reachable on the down page while their own page 404s', async () => {
    const downRes = await page('/freestyle/families/down');
    expect(downRes.text).toContain('href="/freestyle/tricks/paradon"');
    expect(downRes.text).toContain('href="/freestyle/tricks/down_double_down"');
    const paradonRes = await page('/freestyle/families/paradon');
    expect(paradonRes.status).toBe(404);
    const dddRes = await page('/freestyle/families/down_double_down');
    expect(dddRes.status).toBe(404);
  });

  it('barfly presents as a branch of the Down family, linking the down page', async () => {
    const res = await page('/freestyle/families/barfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Branch of the');
    expect(res.text).toContain('href="/freestyle/families/down"');
  });
});

describe('GET /freestyle/families/down — the teaching flow (model family page)', () => {
  it('leads the hero with the teaching hook, not the descendant count', async () => {
    const res = await page('/freestyle/families/down');
    expect(res.text).toContain('look like four different tricks. They are not.');
    expect(res.text).not.toContain('documented descendants');
  });

  it('explains what a down physically is, in plain words, before the notation', async () => {
    const res = await page('/freestyle/families/down');
    expect(res.text).toContain('What is a Down?');
    expect(res.text).toContain('A down is a finishing movement');
  });

  it('renders none of the structural-reference sections, and no observational badge', async () => {
    // The formula block, signature or model, atlas lines and observational notes
    // read as internal reference to a casual visitor.
    for (const slug of ['down', 'osis', 'pickup']) {
      const res = await page(`/freestyle/families/${slug}`);
      expect(res.status).toBe(200);
      for (const heading of ['Canonical formula', 'Structural signature', 'Structural model', 'Atlas relationship', 'Observational notes']) {
        expect(res.text, `${slug}: ${heading}`).not.toContain(`<h2>${heading}</h2>`);
      }
      expect(res.text, slug).not.toContain('glossary-layer-badge--observational');
    }
  });

  it('opens "What is a ...?" with the family\'s plain reading where the card authors one', async () => {
    const res = await page('/freestyle/families/pickup');
    const whatIs = res.text.indexOf('<h2>What is a Pickup?</h2>');
    expect(whatIs, 'the What-is section renders').toBeGreaterThan(-1);
    const reading = res.text.indexOf('One inward dexterity, caught by the dexing foot.');
    expect(reading).toBeGreaterThan(whatIs);
    expect(reading).toBeLessThan(res.text.indexOf('</section>', whatIs));
  });

  it('renders the recognition cues, distinct from execution', async () => {
    const res = await page('/freestyle/families/down');
    expect(res.text).toContain('How to recognize one');
    expect(res.text).toContain('Look for the double dex');
  });

  // Every page-worthy family now carries authored teaching, so no rendered
  // family exercises the compact-projection fallback; the {{#if content.teaching}}
  // gate stays in the template for any future sub-threshold family.
});

describe('GET /freestyle/families/illusion — the teaching flow (direction-pair page)', () => {
  it('leads the hero with the direction-is-structural hook', async () => {
    const res = await page('/freestyle/families/illusion');
    expect(res.status).toBe(200);
    expect(res.text).toContain('a direction is not a detail: it is a different trick');
  });

  it('explains what an illusion physically is, in plain words', async () => {
    const res = await page('/freestyle/families/illusion');
    expect(res.text).toContain('An Illusion is a single dexterity caught on a toe stall');
  });

  it('renders recognition cues', async () => {
    const res = await page('/freestyle/families/illusion');
    expect(res.text).toContain('How to recognize one');
  });
});

describe('GET /freestyle/families/:slug — newly authored teaching pages render the flow', () => {
  const AUTHORED: ReadonlyArray<readonly [string, string]> = [
    ['legover', 'the leg-over motion enters freestyle'],
    ['pickup', 'scoops under the bag instead of circling over the top'],
    ['torque', 'an osis with a dexterity added in front'],
    ['blender', 'another osis reached by adding a dexterity in front'],
    ['barfly', 'Barfly is one of the downs'],
    ['double_over_down', 'the one down whose name is its structure'],
    ['drifter', 'a clipper reached by adding a dexterity in front'],
    ['double_leg_over', 'a legover done twice'],
    ['eggbeater', 'the legover in its atomic form'],
    ['inside_stall', 'a catch surface of its own'],
  ];
  it.each(AUTHORED)('renders the teaching flow for %s', async (slug, hook) => {
    const res = await page(`/freestyle/families/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(hook);
    expect(res.text).toContain('How to recognize one');
  });
});

describe('GET /freestyle/families/:slug — the "What is a/an <Name>" heading uses the correct article', () => {
  it('uses "an" for a vowel-initial family name (Illusion)', async () => {
    const res = await page('/freestyle/families/illusion');
    expect(res.text).toContain('What is an Illusion?');
    expect(res.text).not.toContain('What is a Illusion?');
  });

  it('uses "an" for a vowel-initial family name (Osis)', async () => {
    const res = await page('/freestyle/families/osis');
    expect(res.text).toContain('What is an Osis?');
    expect(res.text).not.toContain('What is a Osis?');
  });

  it('uses "a" for a consonant-initial family name (Whirl)', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.text).toContain('What is a Whirl?');
  });
});

describe('GET /freestyle/families/osis — a generative-tree teaching page (contract stress test)', () => {
  it('leads with the hook and defines osis by its ending, not its entry', async () => {
    const res = await page('/freestyle/families/osis');
    expect(res.status).toBe(200);
    expect(res.text).toContain('so much of the advanced vocabulary grows out of it');
    expect(res.text).toContain('a spin that resolves into a clipper stall');
    expect(res.text).toContain('defined by that ending, not by the way the player enters it');
  });

  it('makes recognition visual and entry-independent', async () => {
    const res = await page('/freestyle/families/osis');
    expect(res.text).toContain('How to recognize one');
    expect(res.text).toContain('If removing the modifiers leaves an osis ending');
  });

});

describe('GET /freestyle/families/mirage — the reduction lesson (foundational dexterity)', () => {
  it('answers why to learn Mirage first, with a pictureable physical description', async () => {
    const res = await page('/freestyle/families/mirage');
    expect(res.status).toBe(200);
    expect(res.text).toContain('a complete dexterity movement');
    expect(res.text).toContain('the bag returns to the same toe that set it');
    expect(res.text).toContain('the circling leg performs the dexterity but does not make the catch');
    expect(res.text).toContain('Much of freestyle grows from Mirage');
  });

  it('teaches recognition by reduction', async () => {
    const res = await page('/freestyle/families/mirage');
    expect(res.text).toContain('How to recognize one');
    expect(res.text).toContain('Remove the modifiers and Mirage is what is left');
  });
});

describe('GET /freestyle/families/butterfly — the flow lesson (cultural transformation)', () => {
  it('frames Butterfly by the experience, not a universal learning-order claim', async () => {
    const res = await page('/freestyle/families/butterfly');
    expect(res.status).toBe(200);
    expect(res.text).toContain('For many players, Butterfly is the first trick that feels less like an isolated move');
  });

  it('teaches the transformation from isolated tricks to continuous movement', async () => {
    const res = await page('/freestyle/families/butterfly');
    expect(res.text).toContain('stops feeling like individual tricks and starts feeling like continuous movement');
    expect(res.text).toContain('the beginning of real freestyle');
  });
});

describe('GET /freestyle/families/whirl — the connector (why it became central)', () => {
  it('explains why whirl became the hub, not merely that it is common', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('starts and ends in the same position, a clipper');
    expect(res.text).toContain('leave the player in a position where the next trick is possible');
  });
});

describe('GET /freestyle/families/swirl — four-sibling matrix framing', () => {
  it('frames swirl as one cell of the clipper-terminal matrix, not a whirl reversal story', async () => {
    const res = await page('/freestyle/families/swirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Swirl matters because it completes a structural family');
    expect(res.text).toContain('the four cells of one clipper-terminal matrix');
    expect(res.text).not.toContain('whirl run the other way');
    expect(res.text).not.toContain('marks the moment');
  });
});

describe('GET /freestyle/families/:slug — route ordering', () => {
  it('renders the family template, not the trick shell, for a family slug', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.text).toContain('data-family-slug="whirl"');
    expect(res.text).not.toContain('trick-shell');
  });

  it('leaves the trick-detail route intact for the same slug under /freestyle/tricks', async () => {
    const res = await page('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('trick-shell');
  });
});

describe('GET /freestyle/families — bare path has no page', () => {
  it('answers not-found, with no redirect', async () => {
    // Defect caught: the bare parent path forwarding to the dictionary, a
    // second address for the family index the site does not keep.
    const res = await request(await createApp()).get('/freestyle/families').redirects(0);
    expect(res.status).toBe(404);
    expect(res.headers['location']).toBeUndefined();
  });
});

describe('sitemap — family-detail pages are enumerated', () => {
  it('lists every first-class family page', async () => {
    const res = await page('/sitemap.xml');
    expect(res.status).toBe(200);
    for (const slug of FIRST_CLASS_FAMILY_SLUGS) {
      expect(res.text, slug).toContain(`/freestyle/families/${slug}</loc>`);
    }
  });

  it('does not list minor lineages or the bare families redirect', async () => {
    const res = await page('/sitemap.xml');
    expect(res.text).not.toContain('/freestyle/families/paradon');
    expect(res.text).not.toContain('/freestyle/families/eclipse');
    expect(res.text).not.toMatch(/\/freestyle\/families<\/loc>/);
  });
});

// Family cards describe the base trick, then say the family extends that pattern
// through different entries, sets, and modifiers, rather than stating an
// over-narrow "the family is [start]-to-[finish]" claim that only fits the base.
describe('GET /freestyle/families/:slug — family cards distinguish base from family', () => {
  it('whirl card describes the base whirl with entry-generic wording and notes the family extends beyond clipper entries', async () => {
    const res = await page('/freestyle/families/whirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('It can be entered from a clipper or a toe stall');
    expect(res.text).toContain('not every whirl-family trick starts from a clipper');
    // The base is never locked to a clipper-only entry; the trick page says it
    // can start from a clipper or a toe stall.
    expect(res.text).not.toContain('clipper-to-clipper');
  });

  it('swirl card describes the base swirl with entry-generic wording and notes the family extends the ending pattern', async () => {
    const res = await page('/freestyle/families/swirl');
    expect(res.status).toBe(200);
    expect(res.text).toContain('the clipper is the terminus, not the start');
    expect(res.text).toContain('The swirl family extends that ending pattern');
    expect(res.text).not.toContain('clipper-to-clipper');
  });
});
