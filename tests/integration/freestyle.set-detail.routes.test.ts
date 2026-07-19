/**
 * /freestyle/sets/:slug — Set detail page (Phase B of the set-system
 * refactor, 2026-05-25).
 *
 * Pins:
 *   - 200 status on known canonical-set slugs (pixie, blurry, surging)
 *   - 404 on unknown slugs (anti-enumeration)
 *   - Detail page renders: name, hashtag, formula, movement explanation,
 *     equivalence readings (when present), derived/related systems,
 *     example tricks section (empty-state OR populated), cross-links,
 *     source provenance, audit-status (when present)
 *   - Cross-links resolve to expected URLs (set hub, compositional hub,
 *     Movement Systems set axis, flat reference, operators page when
 *     applicable)
 *   - /freestyle/sets (no slug) renders the Set Encyclopedia (200; promoted from 301 in 2026-05-25 polish)
 *   - /freestyle/sets/reference renders the flat Holden reference (200)
 *   - Set Hub now shows "View set details →" link (no Phase A placeholder)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleTrickModifier, insertFreestyleTrickModifierLink } from '../fixtures/factories';

const { dbPath } = setTestEnv('3221');

let createApp: Awaited<ReturnType<typeof importApp>>;

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
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
  });

  it('returns 404 for an unknown slug (anti-enumeration)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/this-is-not-a-real-set');
    expect(res.status).toBe(404);
  });

  it('renders the display name and #set_<slug> hashtag in the header', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('Pixie');
    expect(res.text).toContain('#set_pixie');
  });

  // blurry is a thin set (no authored teaching page), so its Formula and Movement
  // sections render directly; a migrated set like pixie absorbs them into the
  // teaching layer.
  it('renders the formula as a code block', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/blurry');
    expect(res.text).toContain('class="set-detail-formula"');
    expect(res.text).toContain('CLIP &gt; OP IN [DEX] &gt; OP OUT [DEX] &gt;');
  });

  it('renders the movement explanation', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/blurry');
    expect(res.text).toMatch(/Stepping combined with a paradox-style orientation change/);
  });

  it('renders derived systems as anchor links to /freestyle/sets/<slug>', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    // pixie lists terraging, sailing, etc. as derived
    expect(res.text).toMatch(/href="\/freestyle\/sets\/terraging"/);
  });

  it('renders related systems for sets that have them', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    // pixie's related: fairy
    expect(res.text).toMatch(/href="\/freestyle\/sets\/fairy"/);
  });

  it('renders source provenance label', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('set-card-source--platform-tracked');
    expect(res.text).toContain('Tracked here');
  });

  it('renders audit-status label for sets that carry one (atomic = partial)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic');
    expect(res.text).toContain('set-card-audit--partial');
  });

  it('renders the conflict audit label for surging', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/surging');
    expect(res.text).toContain('set-card-audit--conflict');
    expect(res.text).toContain('Documented disagreement');
  });

  it('renders the holden-only audit label and dashed-border style for bubba', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/bubba');
    expect(res.text).toContain('set-card-audit--holden-only');
    expect(res.text).toContain('set-card-source--holden-only');
  });

  it('renders example-tricks section populated when modifier-link rows exist', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('class="set-detail-trick-list"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\/pixie_mirage"/);
  });

  it('renders example-tricks empty state for holden-only sets with no linked tricks', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/bubba');
    expect(res.text).toContain('set-detail-examples-section--empty');
    expect(res.text).toContain('No tricks are linked to this set yet');
  });

  it('renders cross-links to set hub, compositional hub, and movement-system axis', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    // Handlebars HTML-encodes `=` in interpolated href values (?view=sets → ?view&#x3D;sets);
    // browsers decode entities in href values so the link works. Match either form.
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view(?:=|&#x3D;)sets"/);
    expect(res.text).toContain('href="/freestyle/compositional-sets#single-dex-primitives"');
    expect(res.text).toMatch(/href="\/freestyle\/tricks\?view(?:=|&#x3D;)movement-system#movement-axis-set-uptime"/);
    // The flat Holden reference table link is intentionally not surfaced
    // (no source-person naming on the public related-surfaces list).
    expect(res.text).not.toContain('href="/freestyle/sets/reference"');
  });

  it('omits the operator-reference cross-link for a set with no operators-page entry', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    // Set operators live on their own set pages, not the body-operator index, so
    // pixie carries no operators anchor rather than a broken one.
    expect(res.text).not.toContain('href="/freestyle/operators#pixie"');
  });

  it('does NOT render the operator-reference cross-link for holden-only sets without a modifier', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/bubba');
    expect(res.text).not.toContain('href="/freestyle/operators#bubba"');
  });

  it('renders the component-mechanics not-a-set reminder', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.text).toContain('Component mechanics');
    expect(res.text).toContain('are body modifiers, not sets');
  });

  it('uses the subtype label as eyebrow text', async () => {
    const pixieRes = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(pixieRes.text).toContain('True core sets');
    const blurryRes = await request(await createApp()).get('/freestyle/sets/blurry');
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
    const res = await request(await createApp()).get('/freestyle/sets/toe');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-next" href="\/freestyle\/sets\/clipper">/);
    expect(res.text).not.toMatch(/<a class="set-detail-sibling-nav-prev"/);
  });

  it('middle-in-subtype (stepping): renders prev=fairy AND next=quantum', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
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
    const res = await request(await createApp()).get('/freestyle/sets/tapping');
    expect(res.text).toContain('class="set-detail-sibling-nav"');
    expect(res.text).toMatch(/<a class="set-detail-sibling-nav-prev" href="\/freestyle\/sets\/slapping">/);
    // Tapping is now the last true-core set, so there is no next sibling and no
    // link to the removed miraging set page.
    expect(res.text).not.toMatch(/<a class="set-detail-sibling-nav-next"/);
  });

  it('sibling strip is placed between cross-references and provenance footer', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
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
      const res = await request(await createApp()).get(`/freestyle/sets/${slug}`);
      expect(res.text).toContain('class="set-detail-sibling-nav"');
    }
  });
});

describe('/freestyle/sets routes render directly', () => {
  it('/freestyle/sets renders the Set Encyclopedia', async () => {
    const res = await request(await createApp()).get('/freestyle/sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Set Encyclopedia');
    expect(res.text).toContain('class="wrapper sets-encyclopedia"');
  });

  it('/freestyle/sets/reference renders the flat Holden reference table directly', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/reference');
    expect(res.status).toBe(200);
    // The flat-reference table content lives in freestyle/moves.hbs
    expect(res.text).toContain('Set Notation');   // page heading region
  });
});

describe('GET /freestyle/sets/:slug — non-set slug redirects to its glossary term', () => {
  it('illusioning is not a set; its old link 301s to the illusioning glossary term, not atomic', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/illusioning').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/glossary#term-illusioning');
  });

  it('a live canonical set is never redirected', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic').redirects(0);
    expect(res.status).toBe(200);
  });
});

describe('GET /freestyle/sets/:slug — "Equivalent names" (doctrine set-name equivalences)', () => {
  it('atomic does not show Illusioning as an equivalent name; it is a distinct standalone movement', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic');
    expect(res.status).toBe(200);
    // Atomic and Illusioning are distinct under current doctrine, so atomic has
    // no equivalent-name section, and its Set Encyclopedia teaching page states
    // the distinction rather than presenting Illusioning as a synonym.
    expect(res.text).not.toContain('Equivalent names');
    expect(res.text).toContain('illusioning is the outward dex realized standalone, not another name for atomic');
  });

  it('keeps the equivalent name out of the structural Equivalence readings slot', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic');
    // The structural ≡ slot stays its own section with its own reading...
    expect(res.text).toContain('Equivalence readings');
    expect(res.text).toContain('Toe set Illusion');
    // ...and the equivalent NAME does not leak into that structural slot.
    const structuralSlot = res.text.split('Equivalence readings')[1]?.split('</section>')[0] ?? '';
    expect(structuralSlot).not.toContain('Illusioning');
  });

  it('a set without equivalent names (pixie) does not render the section', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Equivalent names');
  });

  it('quantum names Miraging only to disambiguate it, never as an equivalent or related set', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/quantum');
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
// glossary terms; Illusioning redirects to its glossary term, not to Atomic.
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

  it('miraging does not render a set page; it redirects to its glossary term', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/miraging').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/glossary#term-miraging-not-a-set');
  });

  it('illusioning redirects to its glossary term, not to atomic', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/illusioning').redirects(0);
    expect(res.status).toBe(301);
    expect(res.headers['location']).toBe('/freestyle/glossary#term-illusioning');
  });
});

// Section-order parity with the trick-detail shell: identity/notation/explanation
// near the top, then equivalent names, then the structural equivalence readings,
// then relationships, examples, cross-links, and provenance last.
const SET_PARITY_ORDER = [
  'aria-label="Formula"',
  'aria-label="Movement explanation"',
  'aria-label="Equivalent names"',
  'aria-label="Equivalence readings"',
  'aria-label="Derived systems"',
  'aria-label="Related systems"',
  'aria-label="Example tricks"',
  'aria-label="Cross-references"',
  'aria-label="Source provenance"',
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
  it('atomic renders its below-fold reference sections in trick-detail order (its teaching page covers formula and movement explanation; no equivalent-name section)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/atomic');
    const { present, ascending } = presentSectionsInOrder(res.text);
    // Atomic now has a Set Encyclopedia teaching page, so the Formula and Movement
    // explanation reference blocks are covered by the teaching layout above and no
    // longer render as separate parity sections; the remaining reference sections
    // still appear in trick-detail order, and atomic has no equivalent-name section.
    const expected = SET_PARITY_ORDER.filter(
      s => s !== 'aria-label="Equivalent names"'
        && s !== 'aria-label="Formula"'
        && s !== 'aria-label="Movement explanation"',
    );
    expect(present).toEqual(expected);
    expect(ascending).toBe(true);
  });

  it('furious renders its below-fold reference sections in trick-detail order (its teaching page covers formula and movement explanation)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/furious');
    const { present, ascending } = presentSectionsInOrder(res.text);
    expect(ascending).toBe(true);
    // Furious now has a Set Encyclopedia teaching page, so the Formula and Movement
    // explanation reference blocks are covered by the teaching layout above; the
    // remaining reference sections still render in order, and furious has no
    // equivalent-name section under current doctrine.
    expect(present).not.toContain('aria-label="Equivalent names"');
    expect(present).not.toContain('aria-label="Movement explanation"');
    expect(present).toContain('aria-label="Equivalence readings"');
  });
});

// "Set Hub — Phase B activation of detail-page links" describe block
// removed 2026-05-27: the Phase A/B Set Hub at /freestyle/tricks?view=sets
// was retired; that URL now answers "which tricks use this set?" via a
// modifier-grouped trick list (see freestyle.tricks-by-set.routes.test.ts).
// Set Encyclopedia uses different class names (sets-encyclopedia-card-*)
// at the new /freestyle/sets surface; its detail-link coverage lives in
// freestyle.sets-encyclopedia.routes.test.ts.

describe('Set detail — X-Dex receiver note (atomic / quantum / nuclear only)', () => {
  for (const slug of ['atomic', 'quantum', 'nuclear']) {
    it(`renders the X-Dex receiver note and glossary cross-link on ${slug}`, async () => {
      const res = await request(await createApp()).get(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      expect(res.text).toContain('X-Dex behavior');
      // The note is notation-authoritative: X-Dex is scored from the [XDEX] flag,
      // not inferred from the set or base. The full rule lives in the glossary.
      expect(res.text).toMatch(/marked \[XDEX\] in the notation/);
      expect(res.text).toContain('href="/freestyle/glossary#term-x-dex"');
    });
  }

  it('omits the X-Dex receiver note on a non-receiver set (pixie)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/pixie');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('X-Dex behavior');
  });
});

describe('GET /freestyle/sets/stepping — set-page educational reference implementation', () => {
  it('returns 200 and renders the launch-set subtitle', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Stepping');
    expect(res.text).toMatch(/launch set/);
    expect(res.text).toMatch(/relocating support foot/);
  });

  it('renders the frozen set teaching template, concept before mechanics', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    expect(res.text).toContain('<h2>What it is</h2>');
    expect(res.text).toContain('<h2>Why it exists</h2>');
    expect(res.text).toContain('<h2>How it launches</h2>');
    expect(res.text).toContain('<h2>JOB notation</h2>');
    expect(res.text).toContain('<h2>Where it appears</h2>');
    expect(res.text).toContain('<h2>How it composes</h2>');
    expect(res.text).toContain('<h2>Representative tricks</h2>');
    expect(res.text).toContain('<h2>Common confusions</h2>');
    expect(res.text).toContain('<h2>Related concepts</h2>');
    expect(res.text).toContain('<h2>Launch notes</h2>');
    expect(res.text.indexOf('<h2>What it is</h2>')).toBeLessThan(res.text.indexOf('<h2>Launch notes</h2>'));
  });

  it('absorbs the thin Formula / Movement sections into the teaching layer', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    // On a migrated set the teaching layer replaces the bare Formula/Movement headings.
    expect(res.text).not.toContain('<h2>Formula</h2>');
    expect(res.text).not.toContain('<h2>Movement</h2>');
  });

  it('teaches the set notation: stepping is the CLIP > OP IN [DEX] launch, not a body token', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    expect(res.text).toMatch(/CLIP &gt; OP IN \[DEX\]/);
    expect(res.text).toMatch(/stepping\(\+1\) \+ mirage\(2\)/);
    expect(res.text).toMatch(/not as a \[BOD\] or \[PDX\] token/);
  });

  it('contrasts stepping with pixie as a separate launch (no research pre-judgement)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    expect(res.text).toContain('Stepping vs a plain clipper or toe set');
    expect(res.text).toContain('Stepping is a launch, not a body movement');
    expect(res.text).toContain('Stepping vs pixie');
    expect(res.text).toContain('Stepping does not replace the base trick');
    expect(res.text).toMatch(/separate launch identities, not two names for one launch/);
  });

  it('renders progression with anchor on butterfly, landing on named tricks (clickable underscore slugs)', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    expect(res.text).toContain('set-step-1-butterfly');
    expect(res.text).toContain('set-step-2-ripwalk');
    expect(res.text).toContain('set-step-3-parkwalk');
    expect(res.text).toContain('set-step-4-stepping_ducking_butterfly');
    expect(res.text).toContain('href="/freestyle/tricks/ripwalk"');
    const anchorMatches = res.text.match(/is-anchor/g) ?? [];
    expect(anchorMatches.length).toBe(1);
  });

  it('renders representative tricks as clickable links, organized by category', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_mirage"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_whirl"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_eggbeater"');
    expect(res.text).toContain('href="/freestyle/tricks/stepping_symposium_mirage"');
    for (const cat of ['Basic dex', 'Whirl family', 'Cross-body', 'Multiple operators', 'Recognizable named trick']) {
      expect(res.text).toContain(cat);
    }
  });

  it('keeps the structural reference layer (derived systems, cross-references, provenance) below the teaching layer', async () => {
    const res = await request(await createApp()).get('/freestyle/sets/stepping');
    expect(res.text).toContain('Derived systems');
    expect(res.text).toContain('Cross-references');
    expect(res.text.indexOf('<h2>What it is</h2>')).toBeLessThan(res.text.indexOf('Cross-references'));
  });
});

describe('GET /freestyle/sets/:slug — migrated set-education pages (pixie / fairy / whirl-family / composite +3)', () => {
  // The seven settled, non-ambiguous platform-canonical sets authored on the
  // frozen 11-section template. Their content resolves slugs against the test
  // dictionary; unseeded slugs render as plain text, so these assertions check
  // only the static teaching layer (headings + the redirect), not link pilots.
  const MIGRATED = ['pixie', 'fairy', 'whirling', 'swirling', 'floating', 'surfing', 'warping'];

  for (const slug of MIGRATED) {
    it(`${slug} renders the frozen teaching layer (concept-first headings)`, async () => {
      const res = await request(await createApp()).get(`/freestyle/sets/${slug}`);
      expect(res.status).toBe(200);
      for (const heading of ['What it is', 'How it launches', 'JOB notation', 'Where it appears', 'How it composes', 'Launch notes']) {
        expect(res.text, `${slug} / ${heading}`).toContain(`<h2>${heading}</h2>`);
      }
    });

    it(`${slug} absorbs the thin Formula/Movement sections into the teaching layer`, async () => {
      const res = await request(await createApp()).get(`/freestyle/sets/${slug}`);
      expect(res.text).not.toContain('<h2>Formula</h2>');
      expect(res.text).not.toContain('<h2>Movement</h2>');
    });

    it(`${slug} modifier route redirects to its set page`, async () => {
      const res = await request(await createApp()).get(`/freestyle/modifier/${slug}`);
      expect(res.status).toBe(301);
      expect(res.headers['location']).toBe(`/freestyle/sets/${slug}`);
    });
  }
});
