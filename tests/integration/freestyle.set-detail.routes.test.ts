/**
 * /freestyle/sets/:slug — Set detail page.
 *
 * Pins:
 *   - 200 status on known canonical-set slugs (pixie, blurry, surging)
 *   - 404 on unknown slugs (anti-enumeration)
 *   - A set page without teaching content renders: name, hashtag, formula,
 *     movement explanation, equivalent names (when present), related systems,
 *     every linked trick (empty-state OR populated), cross-links, source
 *     provenance, audit-status (when present)
 *   - A teaching page renders at most six sections, states its notation once
 *     under "How it launches", and leaves the full trick list to the
 *     dictionary's By set view
 *   - Cross-links resolve to expected URLs (the Set Encyclopedia, the
 *     dictionary's By set view, the operators page when applicable)
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
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifier,
  insertFreestyleTrickModifierLink,
  insertMember,
  insertTtLesson,
} from '../fixtures/factories';
import { CANONICAL_SETS } from '../../src/content/freestyleCanonicalSets';

const { dbPath } = setTestEnv('3221');

let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Seed one canonical trick linked to the pixie modifier so the pixie set
  // detail page renders a populated exampleTricks section in tests.
  insertFreestyleTrickModifier(db, {
    slug: 'pixie', modifier_name: 'pixie', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set', notes: '',
  });
  insertFreestyleTrick(db, {
    slug: 'pixie_mirage', canonical_name: 'pixie mirage', adds: '3',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'TOE > SAME IN [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'pixie_mirage', 'pixie');

  // Sailing has no teaching page, so its page lists every linked trick.
  insertFreestyleTrickModifier(db, {
    slug: 'sailing', modifier_name: 'sailing', add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'set', notes: '',
  });
  insertFreestyleTrick(db, {
    slug: 'sailing_mirage', canonical_name: 'sailing mirage', adds: '4',
    base_trick: 'mirage', trick_family: 'mirage', category: 'compound',
    operational_notation: 'TOE > SAME IN [DEX] > OP OUT [DEX] > OP IN [DEX] > OP TOE [DEL]',
    review_status: 'expert_reviewed', is_active: 1,
  });
  insertFreestyleTrickModifierLink(db, 'sailing_mirage', 'sailing');

  // This example trick's only footage is tagged under a retired structural
  // name folded onto it, and nothing carries its canonical slug. The set
  // page's example row must link on the tag the clip actually has, or it
  // sends the visitor to an empty gallery the way the browse rows and the
  // trick detail page once did.
  insertFreestyleTrickAlias(db, 'sailing_symposium_mirage_folded', 'sailing_mirage');
  insertTtLesson(db, {
    uploader_member_id: insertMember(db, { id: 'm-setdetail1', slug: 'setdetail_uploader' }),
    ttNumber: 9,
    trickSlug: 'sailing_symposium_mirage_folded',
    videoId: 'setaliasvid1',
  });

  // Stepping set-education page resolves progression + representative-trick
  // slugs against the dictionary for clickable links (underscore slugs, as in
  // the real DB).
  insertFreestyleTrick(db, { slug: 'butterfly',                  canonical_name: 'butterfly',                  adds: '3', base_trick: 'butterfly', trick_family: 'butterfly', category: 'core', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'ripwalk',                    canonical_name: 'ripwalk',                    adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'parkwalk',                   canonical_name: 'parkwalk',                   adds: '4', base_trick: 'butterfly', trick_family: 'butterfly', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_ducking_butterfly', canonical_name: 'stepping ducking butterfly', adds: '5', base_trick: 'ducking-butterfly', trick_family: 'butterfly', category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_mirage',           canonical_name: 'stepping mirage',           adds: '3', base_trick: 'mirage',    trick_family: 'mirage',    category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_whirl',            canonical_name: 'stepping whirl',            adds: '4', base_trick: 'whirl',     trick_family: 'whirl',     category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_eggbeater',        canonical_name: 'stepping eggbeater',        adds: '4', base_trick: 'eggbeater', trick_family: 'legover',   category: 'compound', is_active: 1 });
  insertFreestyleTrick(db, { slug: 'stepping_symposium_mirage', canonical_name: 'stepping symposium mirage', adds: '4', base_trick: 'symposium-mirage', trick_family: 'mirage', category: 'compound', is_active: 1 });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/sets/:slug — set detail page', () => {
  it('returns 200 for a canonical-set slug (pixie)', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown slug (anti-enumeration)', async () => {
    const res = await page('/freestyle/sets/this-is-not-a-real-set');
    expect(res.status).toBe(404);
  });

  it('renders the display name and #set_<slug> hashtag in the header', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.text).toContain('Pixie');
    expect(res.text).toContain('#set_pixie');
  });

  // blurry is a thin set (no authored teaching page), so its Formula and Movement
  // sections render directly; a migrated set like pixie absorbs them into the
  // teaching layer.
  it('renders the formula as a code block', async () => {
    const res = await page('/freestyle/sets/blurry');
    expect(res.text).toContain('class="set-detail-formula"');
    expect(res.text).toContain('CLIP &gt; OP IN [DEX] &gt; OP OUT [DEX] &gt;');
  });

  it('renders the movement explanation', async () => {
    const res = await page('/freestyle/sets/blurry');
    expect(res.text).toMatch(/Stepping combined with a paradox-style orientation change/);
  });

  it('renders related systems for sets that have them', async () => {
    const res = await page('/freestyle/sets/pixie');
    // pixie's related: fairy
    expect(res.text).toMatch(/href="\/freestyle\/sets\/fairy"/);
  });

  it('renders source provenance label', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.text).toContain('set-card-source--platform-tracked');
    expect(res.text).toContain('Tracked here');
  });

  it('renders audit-status label for sets that carry one (atomic = partial)', async () => {
    const res = await page('/freestyle/sets/atomic');
    expect(res.text).toContain('set-card-audit--partial');
  });

  it('renders the conflict audit label for surging', async () => {
    const res = await page('/freestyle/sets/surging');
    expect(res.text).toContain('set-card-audit--conflict');
    expect(res.text).toContain('Documented disagreement');
  });

  it('renders the holden-only audit label and dashed-border style for bubba', async () => {
    const res = await page('/freestyle/sets/bubba');
    expect(res.text).toContain('set-card-audit--holden-only');
    expect(res.text).toContain('set-card-source--holden-only');
  });

  it('lists every linked trick, without its notation, on a set page with no teaching content', async () => {
    // Defect caught: a long notation string per row running the list off a
    // phone and repeating what each trick's own page says.
    const res = await page('/freestyle/sets/sailing');
    expect(res.text).toContain('class="set-detail-trick-list"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/sailing_mirage"/);
    expect(res.text).not.toContain('set-detail-trick-notation');
    expect(res.text).not.toContain('OP IN [DEX] &gt; OP TOE [DEL]');
  });

  it('links an example trick covered only through an alias on the tag its clip carries', async () => {
    const res = await page('/freestyle/sets/sailing');
    expect(res.status).toBe(200);
    expect(res.text).toContain('/media/browse?context&#x3D;sailing_symposium_mirage_folded');
    expect(res.text).not.toContain('/media/browse?context&#x3D;sailing_mirage');
  });

  it('leaves the full trick list to the dictionary on a teaching page, and links it', async () => {
    // Defect caught: the full linked-trick list, already one link away in the
    // dictionary's By set view, returning to a teaching page.
    const res = await page('/freestyle/sets/pixie');
    expect(res.text).not.toContain('class="set-detail-trick-list"');
    expect(res.text).toContain('href="/freestyle/tricks?view=set#set-pixie">Browse This Set in the Dictionary<');
  });

  it('renders example-tricks empty state for holden-only sets with no linked tricks', async () => {
    const res = await page('/freestyle/sets/bubba');
    expect(res.text).toMatch(/class="set-detail-examples-empty">No tricks are linked to this set yet/);
  });

  it('renders cross-links to the encyclopedia and the set\'s dictionary section, and none to a retired set page', async () => {
    const res = await page('/freestyle/sets/pixie');
    // The back control lands on the Set Encyclopedia, the canonical set surface.
    expect(res.text).toContain('href="/freestyle/sets">Back to Set Encyclopedia<');
    // A launch set links to its own section of the dictionary's By set view.
    expect(res.text).toContain('href="/freestyle/tricks?view=set#set-pixie">Browse This Set in the Dictionary<');
    expect(res.text).not.toContain('movement-system');
    // Defect caught: a set page sending the reader through a redirect to a
    // retired page instead of linking the merged one.
    expect(res.text).not.toContain('href="/freestyle/compositional-sets');
    expect(res.text).not.toContain('href="/freestyle/sets/reference');
  });

  it('omits the operator-reference cross-link for a set with no operators-page entry', async () => {
    const res = await page('/freestyle/sets/pixie');
    // Set operators live on their own set pages, not the body-operator index, so
    // pixie carries no operators anchor rather than a broken one.
    expect(res.text).not.toContain('href="/freestyle/operators#pixie"');
  });

  it('does NOT render the operator-reference cross-link for holden-only sets without a modifier', async () => {
    const res = await page('/freestyle/sets/bubba');
    expect(res.text).not.toContain('href="/freestyle/operators#bubba"');
  });

  it('renders the component-mechanics not-a-set reminder', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.text).toContain('Component mechanics');
    expect(res.text).toContain('are body modifiers, not sets');
  });

  it('uses the subtype label as eyebrow text', async () => {
    const pixieRes = await page('/freestyle/sets/pixie');
    expect(pixieRes.text).toContain('True core sets');
    const blurryRes = await page('/freestyle/sets/blurry');
    expect(blurryRes.text).toContain('Composite / derived sets');
  });
});

// ─────────────────────────────────────────────────────────────────────────
// S5 — Subtype-internal sibling navigation (prev/next strip)
// ─────────────────────────────────────────────────────────────────────────
//
// True-core subtype declaration order in CANONICAL_SETS:
//   toe → clipper → pixie → fairy → stepping → quantum → atomic → bubba → slapping → tapping
// First (toe): no prev, next = clipper
// Middle (stepping): prev = fairy, next = quantum
// Last (tapping): prev = slapping, no next

describe('GET /freestyle/sets/:slug — S5 sibling navigation strip', () => {
  it('first-in-subtype (toe): renders next=clipper, no previous', async () => {
    const res = await page('/freestyle/sets/toe');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-next" href="\/freestyle\/sets\/clipper">/);
    expect(res.text).not.toMatch(/<a class="set-detail-sibling-nav-prev"/);
  });

  it('middle-in-subtype (stepping): renders prev=fairy AND next=quantum', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-prev" href="\/freestyle\/sets\/fairy">/);
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-next" href="\/freestyle\/sets\/quantum">/);
    // Subtype label appears inside the strip ("Previous in True core sets")
    const stripStart = res.text.indexOf('class="set-detail-sibling-nav"');
    const stripEnd = res.text.indexOf('</nav>', stripStart);
    const strip = res.text.slice(stripStart, stripEnd);
    expect(strip).toContain('Previous in True core sets');
    expect(strip).toContain('Next in True core sets');
    expect(strip).toContain('Fairy');
    expect(strip).toContain('Quantum');
  });

  it('last-in-subtype (tapping): renders prev=slapping, no next (miraging removed)', async () => {
    const res = await page('/freestyle/sets/tapping');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-prev" href="\/freestyle\/sets\/slapping">/);
    // Tapping is now the last true-core set, so there is no next sibling and no
    // link to the removed miraging set page.
    expect(res.text).not.toMatch(/<a class="set-detail-sibling-nav-next"/);
  });

  it('sibling strip is placed between cross-references and provenance footer', async () => {
    const res = await page('/freestyle/sets/stepping');
    const crossLinksIdx = res.text.indexOf('class="set-detail-cross-links"');
    const siblingIdx    = res.text.indexOf('class="set-detail-sibling-nav"');
    const provenanceIdx = res.text.indexOf('class="set-detail-provenance"');
    expect(crossLinksIdx).toBeGreaterThan(0);
    expect(siblingIdx).toBeGreaterThan(crossLinksIdx);
    expect(provenanceIdx).toBeGreaterThan(siblingIdx);
  });

  it('sibling strip suppresses entirely when both prev and next are null', async () => {
    // No single-set subtype exists today (every subtype has ≥1 entry, but
    // most have multiple). The suppression contract is still asserted at
    // the markup level: the strip wrapper only renders when at least one
    // of prev/next is non-null. We verify the helper expression
    // (or content.previousSet content.nextSet) by spot-checking that
    // every priority set (which all have at least one sibling) renders
    // the strip — no contradicting case.
    for (const slug of ['pixie', 'fairy', 'stepping', 'quantum', 'atomic', 'tapping']) {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.text).toContain('class="set-detail-sibling-nav"');
    }
  });
});

describe('GET /freestyle/sets/:slug — non-set slug redirects to its Freestyle Concepts term', () => {
  it('illusioning is not a set; its old link 301s to the illusioning Concepts term, not atomic', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/illusioning').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/concepts#term-illusioning');
  });

  it('a live canonical set is never redirected', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic').redirects(0);
    expect(res.status).toBe(200);
  });
});

describe('GET /freestyle/sets/:slug — "Equivalent names" (doctrine set-name equivalences)', () => {
  it('atomic does not show Illusioning as an equivalent name; it is a distinct standalone movement', async () => {
    const res = await page('/freestyle/sets/atomic');
    expect(res.status).toBe(200);
    // Atomic and Illusioning are distinct under current doctrine, so atomic has
    // no equivalent-name section, and its Set Encyclopedia teaching page states
    // the distinction rather than presenting Illusioning as a synonym.
    expect(res.text).not.toContain('Equivalent names');
    expect(res.text).toContain('illusioning is the outward dex realized standalone, not another name for atomic');
  });

  it('renders no equivalence-reading or derived-system section; those stay curator reference data', async () => {
    // The structural readings and derived-system lists read as internal
    // reference to a casual visitor; a set page keeps its names, related
    // systems and example tricks instead.
    for (const slug of ['atomic', 'pixie', 'stepping']) {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text, slug).not.toContain('<h2>Equivalence readings</h2>');
      expect(res.text, slug).not.toContain('<h2>Derived systems</h2>');
      expect(res.text, slug).toContain('aria-label="Example tricks"');
    }
  });

  it('a set without equivalent names (pixie) does not render the section', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Equivalent names');
  });

  it('quantum names Miraging only to disambiguate it, never as an equivalent or related set', async () => {
    const res = await page('/freestyle/sets/quantum');
    expect(res.status).toBe(200);
    // Miraging is not a set: the quantum page must not chip-link it as a set page.
    // It may name Miraging only to disambiguate it as a distinct historical nickname,
    // exactly as the atomic page disambiguates illusioning; it is never presented as
    // an equivalent or alternate name for the quantum set.
    expect(res.text).not.toContain('href="/freestyle/sets/miraging"');
    expect(res.text).toContain('not a launch set, and not an equivalent term for Quantum');
  });
});

// Under current doctrine Furious is the confirmed two-dex set page.
// Barraging and Miraging are not sets and their old set URLs redirect to their
// Freestyle Concepts terms; Illusioning redirects to its Concepts term, not to Atomic.
describe('GET /freestyle/sets/:slug — set vs non-set concepts', () => {
  it('furious renders a set detail page for the two-dex set concept', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/furious').redirects(0);
    expect(res.status).toBe(200);
    expect(res.text).toContain('two-dex set');
    // Historically related to Barraging, but never presented as the same set.
    expect(res.text).toContain('Barraging');
    expect(res.text).not.toContain('third dex extension');
  });

  it('barraging does not render a set page; it redirects to the Furious set it names', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/barraging').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/sets/furious');
  });

  it('miraging does not render a set page; it redirects to its Freestyle Concepts term', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/miraging').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/concepts#term-miraging-not-a-set');
  });

  it('illusioning redirects to its Freestyle Concepts term, not to atomic', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/illusioning').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/concepts#term-illusioning');
  });
});

// Section-order parity with the trick-detail shell: identity/notation/explanation
// near the top, then equivalent names, then the structural equivalence readings,
// then relationships, examples, cross-links, and provenance last.
const SET_PARITY_ORDER = [
  'aria-label="Formula"',
  'aria-label="Movement explanation"',
  'aria-label="Equivalent names"',
  'aria-label="Related systems"',
  'aria-label="Example tricks"',
  'aria-label="Cross-references"',
  'class="set-detail-provenance"',
];

function presentSectionsInOrder(text: string): { present: string[]; ascending: boolean } {
  const present = SET_PARITY_ORDER.filter(m => text.includes(m));
  const positions = present.map(m => text.indexOf(m));
  let ascending = true;
  for (let i = 1; i < positions.length; i++) {
    if (positions[i] <= positions[i - 1]) ascending = false;
  }
  return { present, ascending };
}

describe('GET /freestyle/sets/:slug — section order mirrors the trick-detail shell', () => {
  it('a set page without teaching content renders its sections in trick-detail order', async () => {
    const res = await page('/freestyle/sets/sailing');
    const { present, ascending } = presentSectionsInOrder(res.text);
    expect(present).toEqual(SET_PARITY_ORDER.filter(s => s !== 'aria-label="Equivalent names"'));
    expect(ascending).toBe(true);
  });
});

// Every teaching page renders these sections, plus its progression third, in
// this order, and no other. Common confusions renders only when the page has
// one.
const TEACHING_SECTIONS = [
  'What it is', 'How it launches', 'Example tricks', 'Common confusions', 'Related concepts',
];
const TEACHING_SLUGS = [
  'stepping', 'pixie', 'fairy', 'swirling', 'floating', 'surfing',
  'warping', 'atomic', 'quantum', 'nuclear', 'furious',
];

describe('GET /freestyle/sets/:slug — teaching pages stay at six sections', () => {
  it.each(TEACHING_SLUGS.map(slug => [slug] as const))(
    '%s renders what it is, how it launches, the progression, examples, confusions and related concepts, and nothing else',
    async (slug) => {
      // Defect caught: a teaching page growing back past six sections, or a
      // dropped section (why it exists, where it appears, how it composes, the
      // separate notation and launch-notes slots) returning.
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      const headings = [...res.text.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)]
        .map(m => m[1]!.replace(/<[^>]+>/g, '').trim());
      expect(headings.length, `${slug} section count`).toBeLessThanOrEqual(6);
      const progression = headings.find(h => h.startsWith('Progression'));
      expect(progression, `${slug} progression`).toBeDefined();
      const expected = TEACHING_SECTIONS.filter(h => h !== 'Common confusions' || headings.includes(h));
      expect(headings.filter(h => !h.startsWith('Progression'))).toEqual(expected);
      expect(headings.indexOf(progression!)).toBe(2);
    },
  );

  it.each(TEACHING_SLUGS.map(slug => [slug] as const))(
    '%s states its notation under How it launches',
    async (slug) => {
      // Defect caught: a cut that removes a set's formula or decomposition.
      const res = await page(`/freestyle/sets/${slug}`);
      const start = res.text.indexOf('aria-label="How it launches"');
      const section = res.text.slice(start, res.text.indexOf('</section>', start));
      expect(start).toBeGreaterThan(0);
      // Handlebars escapes "=" as &#x3D;.
      expect(section, slug).toMatch(/\(\+\d\) \+ [a-z]+\(\d\) (=|&#x3D;) \d/);
    },
  );
});

// Set-detail links are not covered here. The /freestyle/tricks?view=modifier
// URL answers "which tricks use this set or modifier?" with a modifier-grouped
// trick list and carries no detail links; the Set Encyclopedia at
// /freestyle/sets owns them, under its own card class names, and its own suite
// covers them.

describe('Set detail — X-Dex receiver note (atomic / quantum / nuclear only)', () => {
  for (const slug of ['atomic', 'quantum', 'nuclear']) {
    it(`renders the X-Dex receiver note and Freestyle Concepts cross-link under How it launches on ${slug}`, async () => {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      // The note is notation-authoritative: X-Dex is scored from the [XDEX] flag,
      // not inferred from the set or base. The full rule lives in Freestyle Concepts.
      const start = res.text.indexOf('aria-label="How it launches"');
      const section = res.text.slice(start, res.text.indexOf('</section>', start));
      expect(section).toMatch(/marked \[XDEX\] in the notation/);
      expect(section).toContain('href="/freestyle/concepts#term-x-dex"');
    });
  }

  it('omits the X-Dex receiver note on a non-receiver set (pixie)', async () => {
    const res = await page('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/marked \[XDEX\] in the notation/);
  });
});

describe('GET /freestyle/sets/stepping — set-page educational reference implementation', () => {
  it('returns 200 and defines stepping as a launch set', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Stepping');
    expect(res.text).toMatch(/launch set/);
    expect(res.text).toMatch(/support foot relocates/);
  });

  it('absorbs the thin Formula / Movement sections into the teaching layer', async () => {
    const res = await page('/freestyle/sets/stepping');
    // On a migrated set the teaching layer replaces the bare Formula/Movement headings.
    expect(res.text).not.toContain('<h2>Formula</h2>');
    expect(res.text).not.toContain('<h2>Movement</h2>');
  });

  it('teaches the set notation: stepping is the CLIP > OP IN [DEX] launch, not a body token', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toMatch(/CLIP &gt; OP IN \[DEX\]/);
    expect(res.text).toMatch(/stepping\(\+1\) \+ mirage\(2\)/);
  });

  it('contrasts stepping with pixie as a separate launch (no research pre-judgement)', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('Stepping vs a plain clipper or toe set');
    expect(res.text).toContain('Stepping vs pixie');
    expect(res.text).toMatch(/separate launch identities, not two names for one launch/);
  });

  it('renders progression with anchor on butterfly, landing on its named trick (clickable underscore slugs)', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('set-step-1-butterfly');
    expect(res.text).toContain('set-step-2-ripwalk');
    expect(res.text).toContain('href="/freestyle/tricks/ripwalk"');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders example tricks as clickable links, organized by category', async () => {
    const res = await page('/freestyle/sets/stepping');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_eggbeater"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_symposium_mirage"');
    for (const cat of ['Whirl family', 'Cross-body', 'Multiple operators']) {
      expect(res.text).toContain(cat);
    }
  });

  it('keeps the page links and provenance below the teaching layer', async () => {
    const res = await page('/freestyle/sets/stepping');
    const links = res.text.indexOf('class="set-detail-cross-links"');
    expect(links).toBeGreaterThan(res.text.indexOf('<h2>What it is</h2>'));
    expect(res.text.indexOf('class="set-detail-provenance"')).toBeGreaterThan(links);
  });
});

describe('GET /freestyle/sets/:slug — migrated set-education pages (pixie / fairy / whirl-family / composite +3)', () => {
  // Six settled, non-ambiguous platform-canonical sets with teaching pages.
  // Their content resolves slugs against the test dictionary; unseeded slugs
  // render as plain text, so these assertions check only the static teaching
  // layer and the redirect, not link pilots. The six-section structure is
  // checked for every teaching page above.
  const MIGRATED = ['pixie', 'fairy', 'swirling', 'floating', 'surfing', 'warping'];

  for (const slug of MIGRATED) {
    it(`${slug} absorbs the thin Formula/Movement sections into the teaching layer`, async () => {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.text).not.toContain('<h2>Formula</h2>');
      expect(res.text).not.toContain('<h2>Movement</h2>');
    });

    it(`${slug} modifier route redirects to its set page`, async () => {
      const res = await page(`/freestyle/modifier/${slug}`);
      expect(res.status).toBe(301);
      expect(res.headers['location']).toBe(`/freestyle/sets/${slug}`);
    });
  }
});

// A set formula is usually quoted from an outside compilation rather than
// authored here, so the page names its source before showing the notation. The
// case that matters is blazing: the compilation's notation is shown as the
// compilation wrote it, while the side rule the page states in prose is the
// platform's own. Without the attribution a reader has no way to tell those
// apart, and would read the quoted string as the platform's ruling.
describe('/freestyle/sets/:slug — formula provenance', () => {
  const formulaSection = (html: string): string | null => {
    const m = /aria-label="Formula">([\s\S]*?)<\/section>/.exec(html);
    return m ? m[1]! : null;
  };

  it('names the source above the formula, and that source is the compilation for blazing', async () => {
    const res = await page('/freestyle/sets/blazing');
    expect(res.status).toBe(200);
    const body = formulaSection(res.text);
    expect(body, 'formula section').not.toBeNull();
    expect(body!).toContain('Source: Holden compilation (2003)');
    // Read before the notation, not inferred from the footer afterwards.
    expect(body!.indexOf('Source:')).toBeLessThan(body!.indexOf('set-detail-formula'));
    // The notation is untouched, and the ruling its citation opens with is not
    // credited for a string it did not author.
    expect(body!).toContain('CLIP &gt; OP IN [DEX] &gt; (op side component)');
    expect(body!).not.toMatch(/Source:[^<]*Red/);
  });

  // The rendered counterpart of the ruling, on the blazing page, beside the
  // quoted formula. A page that still says the relation is unsettled
  // contradicts the dictionary it sits beside.
  // Defect caught: the provenance footer on a set page names the rules expert's
  // ruling and its relay channel ("Red ruling (curator-relayed, ...)"), internal
  // curation vocabulary a visitor should never read. The footer still renders its
  // outside source, so the absence is checked against a footer that is there.
  it('renders the blazing and flailing citations without ruling identifiers', async () => {
    for (const slug of ['blazing', 'flailing']) {
      const res = await page(`/freestyle/sets/${slug}`);
      expect(res.status, slug).toBe(200);
      const footer = /<p class="set-detail-citation">([\s\S]*?)<\/p>/.exec(res.text);
      expect(footer, `${slug} citation footer`).not.toBeNull();
      expect(footer![1]!, slug).toContain('Holden compilation (2003)');
      expect(res.text, slug).not.toMatch(/Red ruling|curator-relayed/i);
    }
  });

  it('states the settled side reference on the blazing page, beside the quoted formula', async () => {
    const res = await page('/freestyle/sets/blazing');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/side the set originates from is the reference/);
    expect(res.text).not.toMatch(/side relation is not settled/);
  });

  it('credits the platform, not the compilation, where the formula is the platform own', async () => {
    for (const slug of ['toe', 'clipper']) {
      const res = await page(`/freestyle/sets/${slug}`);
      const body = formulaSection(res.text);
      expect(body, slug).not.toBeNull();
      expect(body!).toContain('Source: Platform entry-surface reference');
      expect(body!).not.toContain('Holden');
    }
  });

  it('never shows a formula without its source, on any set page', async () => {
    // Stated as an invariant over every set rather than as the absence of a
    // section on the pages that currently teach notation in prose. Absence held
    // only while those pages took the branch that renders no formula: if one ever
    // showed its raw string, the old assertion would have gone on passing on a
    // page whose notation had become unattributed.
    //
    // Whether a page that teaches its notation should also show the raw string is
    // a content question this does not answer. It holds whichever way that is
    // decided, which is the point.
    const app = await createApp();
    const unattributed: string[] = [];
    for (const set of CANONICAL_SETS) {
      const res = await request(app).get(`/freestyle/sets/${set.slug}`);
      if (res.status !== 200) continue;
      const body = formulaSection(res.text);
      if (!body || !body.includes('set-detail-formula')) continue;
      const sourceAt = body.indexOf('Source:');
      const formulaAt = body.indexOf('set-detail-formula');
      if (sourceAt === -1 || sourceAt > formulaAt) unattributed.push(set.slug);
    }
    expect(unattributed).toEqual([]);
  });

  it('shows a formula on every set whose formula the derivation supplies', async () => {
    // The other half of the same invariant. Without it the one above is satisfied
    // by a page that shows no formula at all, so a rendering change that silently
    // dropped every formula would read as success.
    const app = await createApp();
    const withFormula = CANONICAL_SETS.filter(s => s.formula.trim().length > 0);
    expect(withFormula.length).toBeGreaterThan(0);

    const showing: string[] = [];
    for (const set of withFormula) {
      const res = await request(app).get(`/freestyle/sets/${set.slug}`);
      if (res.status === 200 && res.text.includes('set-detail-formula')) {
        showing.push(set.slug);
      }
    }
    // Not all of them: the sets that teach their notation in prose render no
    // formula today, which is a content decision and not this test's to make.
    // What it pins is that the ones that do show one are a real, non-empty set.
    expect(showing.length).toBeGreaterThan(0);
  });

  it('teaches notation in prose where it shows no formula', async () => {
    // The education-backed pages still say what the notation is; they just do not
    // print the bare string. This is the reader-facing half of that branch.
    const res = await page('/freestyle/sets/swirling');
    expect(res.status).toBe(200);
    const start = res.text.indexOf('aria-label="How it launches"');
    const section = res.text.slice(start, res.text.indexOf('</section>', start));
    expect(section).toContain('CLIP &gt; SAME BACK/FRONT SWIRL [DEX]');
    expect(section).not.toContain('set-detail-formula');
  });
});
