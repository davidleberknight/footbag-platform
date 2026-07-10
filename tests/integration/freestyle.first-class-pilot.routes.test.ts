/**
 * Integration tests for the first-class trick pilot (5 slugs:
 * osis / paradox-mirage / symposium-mirage / atomic-butterfly / ripwalk).
 *
 * Every trick-detail page renders one universal notation card: Movement
 * notation, then Execution notation, then the ADD derivation. The card is
 * identical for bases and derivatives; "first-class" no longer grants a
 * special summary card.
 *
 * Contract under test:
 *   - First-class trick pages render the universal notation card: the
 *     Execution notation section (the operational / JOB chain) and the
 *     ADD derivation section.
 *   - The ADD derivation surfaces the curator-published breakdown
 *     (e.g. osis -> spin(1) + xbod(1) + stall(1), paradox-mirage ->
 *     paradox(+1) + mirage(2)) and never a tautological self-identity.
 *   - The 4-tier rendering hierarchy contract is preserved: Tier-4
 *     patterns (xbody(N), dex(N), stall(N), spin(N), = N ADD) do NOT
 *     appear on /freestyle/tricks browse / landing surfaces.
 *   - Curator-internal language (provenance, source citations) never
 *     reaches the rendered HTML.
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

const { dbPath } = setTestEnv('3150');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // ── Modifier table — covers all modifiers referenced by pilot 5 ──
  insertFreestyleTrickModifier(db, {
    slug: 'paradox', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'symposium', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'atomic', add_bonus: 1, add_bonus_rotational: 2, modifier_type: 'set',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'stepping', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'gyro', add_bonus: 2, add_bonus_rotational: 2, modifier_type: 'body',
  });
  insertFreestyleTrickModifier(db, {
    slug: 'blurry', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'set',
  });

  // ── Base atoms ──
  insertFreestyleTrick(db, {
    slug: 'mirage', canonical_name: 'mirage',
    trick_family: 'mirage', category: 'dex', adds: '2', is_active: 1,
    notation: 'MIRAGE',
  });
  insertFreestyleTrick(db, {
    slug: 'butterfly', canonical_name: 'butterfly',
    trick_family: 'butterfly', category: 'dex', adds: '3', is_active: 1,
    notation: 'BUTTERFLY',
  });
  insertFreestyleTrick(db, {
    slug: 'torque', canonical_name: 'torque',
    trick_family: 'torque', category: 'dex', adds: '4', is_active: 1,
    notation: 'TORQUE',
  });

  // ── Pilot atomic singleton: osis (has ATOMIC_FLAG_DECOMPOSITIONS entry) ──
  insertFreestyleTrick(db, {
    slug: 'osis', canonical_name: 'osis', base_trick: 'osis',
    trick_family: 'osis', category: 'bod', adds: '3', is_active: 1,
    notation: 'OSIS',
  });

  // ── Pilot compounds (Sprint 1 + Sprint 3 published derivations) ──
  insertFreestyleTrick(db, {
    slug: 'paradox_mirage', canonical_name: 'paradox mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '3', is_active: 1,
    notation: 'PARADOX MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'paradox_mirage', 'paradox', 1);

  insertFreestyleTrick(db, {
    slug: 'symposium_mirage', canonical_name: 'symposium mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '3', is_active: 1,
    notation: 'SYMPOSIUM MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'symposium_mirage', 'symposium', 1);

  insertFreestyleTrick(db, {
    slug: 'atomic_butterfly', canonical_name: 'atomic butterfly', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'compound', adds: '4', is_active: 1,
    notation: 'ATOMIC BUTTERFLY',
  });
  insertFreestyleTrickModifierLink(db, 'atomic_butterfly', 'atomic', 1);

  insertFreestyleTrick(db, {
    slug: 'ripwalk', canonical_name: 'ripwalk', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'compound', adds: '4', is_active: 1,
    notation: 'STEPPING BUTTERFLY',
  });
  insertFreestyleTrickModifierLink(db, 'ripwalk', 'stepping', 1);

  // ── Control: mobius — fails H6 convergence (gyro(+2) + torque(4) = 6
  // computed != 5 official; the gyro-on-rotational doctrine question) ──
  insertFreestyleTrick(db, {
    slug: 'mobius', canonical_name: 'mobius', base_trick: 'torque',
    trick_family: 'torque', category: 'compound', adds: '5', is_active: 1,
    notation: 'MOBIUS',
  });
  insertFreestyleTrickModifierLink(db, 'mobius', 'gyro', 1);

  // ── Control: blur — fails H4 (not in RESOLVED_ADD_FORMULAS) ──
  insertFreestyleTrick(db, {
    slug: 'blur', canonical_name: 'blur', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '4', is_active: 1,
    notation: 'STEPPING PARADOX MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'blur', 'blurry', 1);

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

const PILOT_SLUGS = [
  'osis', 'paradox_mirage', 'symposium_mirage', 'atomic_butterfly', 'ripwalk',
] as const;

// Slice out a single <section> by a class on its opening tag, so an
// assertion targets only that region of the page. Anchored on the section
// class (unique) rather than aria-label, because the hero ADD chip reuses
// the "ADD derivation" aria-label.
function sectionByClass(html: string, sectionClass: string): string | null {
  const classIdx = html.indexOf(sectionClass);
  if (classIdx < 0) return null;
  const sectionOpen = html.lastIndexOf('<section', classIdx);
  const endIdx = html.indexOf('</section>', classIdx);
  if (sectionOpen < 0 || endIdx < 0) return null;
  return html.slice(sectionOpen, endIdx + '</section>'.length);
}

describe('First-class trick pilot — universal notation card', () => {
  it.each(PILOT_SLUGS)('renders the ADD derivation section on /freestyle/tricks/%s', async (slug) => {
    // The ADD derivation is the always-present structural row of the
    // universal notation card; every first-class trick carries a
    // curator-published derivation.
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.status).toBe(200);
    const region = sectionByClass(res.text, 'trick-add-analysis');
    expect(region).not.toBeNull();
    expect(region!).toMatch(/<dt>ADD<\/dt>/);
  });

  it.each(PILOT_SLUGS)('notation card on %s does NOT carry a "First-class" badge', async (slug) => {
    // The notation card is the same for bases and derivatives; no loud
    // public-facing first-class badge is rendered.
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).not.toMatch(/class="trick-first-class-strip-badge"/);
    expect(res.text).not.toMatch(/>\s*First-class\s*</);
  });

  it.each(PILOT_SLUGS)('notation card on %s does NOT carry a redundant #slug title', async (slug) => {
    // The hero h1 is the page title; the notation card adds no separate
    // #slug title row.
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).not.toMatch(/class="trick-first-class-strip-title"/);
    expect(res.text).not.toMatch(/class="trick-notation-summary-heading"/);
  });

  it('osis renders the Execution notation as the operational JOB chain — NOT a tautological echo of the canonical name', async () => {
    // The operational chain (SET > SPIN [BOD] > OP CLIP [XBD] [DEL])
    // renders as role-classified op-tokens in the Execution notation
    // section. The uppercased canonical-name form ("OSIS") never appears
    // as a tautological chain value.
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    const region = sectionByClass(res.text, 'operational-notation-display');
    expect(region).not.toBeNull();
    expect(region!).toMatch(/<h2>Execution notation<\/h2>/);
    // Operational chain tokens render in order inside the section.
    expect(region!).toMatch(
      />SET<[\s\S]+?>SPIN<[\s\S]+?>\[BOD\]<[\s\S]+?>OP<[\s\S]+?>CLIP<[\s\S]+?>\[XBD\]<[\s\S]+?>\[DEL\]</,
    );
    // The canonical-name token is never the chain value.
    expect(region!).not.toMatch(/>\s*OSIS\s*</);
  });

  it('osis ADD breakdown shows curator-published flag-decomposition (NOT trivial identity)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('spin(1) + xbod(1) + stall(1)');
    expect(res.text).not.toMatch(/osis\(3\)\s*&#x3D;\s*3 ADD/);
  });

  it('paradox-mirage ADD breakdown shows the +1-stack derivation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox_mirage');
    expect(res.text).toContain('paradox(+1) + mirage(2)');
  });

  it('ripwalk ADD breakdown shows the folk-name resolution', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).toContain('stepping(+1) + butterfly(3)');
  });

  it('hero ADD chip carries the curator-locked numeric value', async () => {
    // The hero's ADD chip is the single source of truth for the numeric
    // total; the notation card carries the structural derivation, not a
    // duplicate total row.
    const res = await request(createApp()).get('/freestyle/tricks/atomic_butterfly');
    expect(res.text).toMatch(/class="trick-hero-meta-chip trick-hero-meta-chip-adds"[^>]*>4 ADD</);
  });

  it('paradox-mirage with no operational notation still renders the ADD derivation', async () => {
    // paradox-mirage has no curator-authored operational notation, so
    // the Execution notation section does not render; the ADD derivation
    // section still carries the structural breakdown.
    const res = await request(createApp()).get('/freestyle/tricks/paradox_mirage');
    expect(res.text).not.toMatch(/operational-notation-display/);
    const region = sectionByClass(res.text, 'trick-add-analysis');
    expect(region).not.toBeNull();
    expect(region!).toMatch(/<dt>ADD<\/dt>/);
    expect(region!).toContain('paradox(+1) + mirage(2)');
  });
});

describe('First-class trick pilot — hero record-chip removal', () => {
  it.each(PILOT_SLUGS)('hero on %s does NOT render the "N kicks · record" chip', async (slug) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).not.toMatch(/class="trick-hero-meta-chip-record"/);
    expect(res.text).not.toMatch(/kicks\s*·\s*record/i);
    expect(res.text).not.toMatch(/kicks\s*&middot;\s*record/i);
  });
});

describe('First-class trick pilot — notation card is universal', () => {
  it('the separate "Notation summary" card was removed app-wide (mobius, a non-first-class control)', async () => {
    // The special first-class summary card no longer exists for any
    // trick; this guards against its reintroduction.
    const res = await request(createApp()).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/trick-notation-summary/);
    expect(res.text).not.toMatch(/Notation summary/);
  });

  it('the separate "Notation summary" card was removed app-wide (blur, a non-first-class control)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/blur');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/trick-notation-summary/);
    expect(res.text).not.toMatch(/Notation summary/);
  });

  it('first-class slugs DO render the ADD derivation section (the card is universal)', async () => {
    // The ADD derivation is now rendered for first-class tricks too; it
    // is the structural row of the one universal notation card.
    const paradoxMirage = await request(createApp()).get('/freestyle/tricks/paradox_mirage');
    const region = sectionByClass(paradoxMirage.text, 'trick-add-analysis');
    expect(region).not.toBeNull();
    expect(region!).toMatch(/<dt>ADD<\/dt>/);
  });
});

describe('First-class trick pilot — two-line JOB+ADD row', () => {
  it.each(PILOT_SLUGS)('renders the line-2 JOB+ADD notation for %s in the dictionary browse', async (slug) => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // The pilot slug's row carries the line-2 notation block (JOB + ADD).
    const cardIdx = res.text.indexOf(`data-trick-slug="${slug}"`);
    expect(cardIdx, `row for ${slug} not found in the ADD view`).toBeGreaterThan(0);
    const cardEnd = res.text.indexOf('</article>', cardIdx);
    const cardRegion = res.text.slice(cardIdx, cardEnd);
    expect(cardRegion).toContain('class="dict-trick-row-notation"');
  });

  it('non-first-class rows render the SAME two-line contract (no first-class visual distinction)', async () => {
    // Every row (first-class or not) renders the same line-2 JOB+ADD
    // notation. mobius (non-first-class) is the control.
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    const cardIdx = res.text.indexOf('data-trick-slug="mobius"');
    expect(cardIdx).toBeGreaterThan(0);
    const cardEnd = res.text.indexOf('</article>', cardIdx);
    const cardRegion = res.text.slice(cardIdx, cardEnd);
    expect(cardRegion).toContain('class="dict-trick-row-notation"');
    expect(cardRegion).toMatch(/class="dict-trick-row-label">JOB</);
    expect(cardRegion).toMatch(/class="dict-trick-row-label">ADD</);
  });
});

describe('First-class trick pilot — 4-tier hierarchy contract preservation', () => {
  it('trick-detail ADD-derivation section is absent from the dictionary browse view', async () => {
    // /freestyle/tricks is the By ADD ladder of registry cards; the
    // trick-detail notation card (Execution notation, ADD derivation)
    // never renders here.
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/trick-add-analysis/);
  });
});

describe('First-class trick pilot — curator-internal language suppression', () => {
  it.each(PILOT_SLUGS)('the notation card on %s does NOT leak curator-internal provenance', async (slug) => {
    // Provenance is curator-internal metadata, never rendered on the
    // public page. Scan the whole page: the source-note line and any
    // source citation must be absent.
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).not.toMatch(/operational-notation-source-note/);
    expect(res.text).not.toMatch(/Source:/i);
    expect(res.text).not.toMatch(/footbag\.org/i);
    expect(res.text).not.toMatch(/Stanford shorthand/i);
    expect(res.text).not.toMatch(/FootbagMoves/i);
    expect(res.text).not.toMatch(/PassBack/i);
    expect(res.text).not.toMatch(/canonical_db/i);
  });
});
