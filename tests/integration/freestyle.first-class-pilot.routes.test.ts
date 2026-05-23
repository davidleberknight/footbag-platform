/**
 * Integration tests for the first-class trick pilot (5 slugs:
 * osis / paradox-mirage / symposium-mirage / atomic-butterfly / ripwalk).
 *
 * Contract under test:
 *   - First-class trick pages render the Zone B comparative-notation row
 *     (JOB / ADD / VIDEO labels) below the hero.
 *   - Non-first-class trick pages render the existing trick-detail
 *     layout unchanged (no Zone B row).
 *   - The First-Class ADD Convergence Rule (H1-H8) correctly classifies
 *     the pilot 5 as first-class, rejects mobius (Wave 2 gyro doctrine
 *     question) and blur (no published derivation yet).
 *   - The 4-tier rendering hierarchy contract is preserved: Tier-4
 *     patterns (xbody(N), dex(N), stall(N), spin(N), = N ADD) do NOT
 *     appear on /freestyle/tricks browse / landing surfaces.
 *   - Curator-internal language (provenance, pt##, Red, Wave) never
 *     reaches the rendered HTML.
 *   - First-class tricks suppress the Phase B trick-add-analysis
 *     disclosure (Zone B supersedes it).
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
    slug: 'stepping', add_bonus: 1, add_bonus_rotational: 1, modifier_type: 'body',
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
    slug: 'paradox-mirage', canonical_name: 'paradox mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '3', is_active: 1,
    notation: 'PARADOX MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'paradox-mirage', 'paradox', 1);

  insertFreestyleTrick(db, {
    slug: 'symposium-mirage', canonical_name: 'symposium mirage', base_trick: 'mirage',
    trick_family: 'mirage', category: 'compound', adds: '3', is_active: 1,
    notation: 'SYMPOSIUM MIRAGE',
  });
  insertFreestyleTrickModifierLink(db, 'symposium-mirage', 'symposium', 1);

  insertFreestyleTrick(db, {
    slug: 'atomic-butterfly', canonical_name: 'atomic butterfly', base_trick: 'butterfly',
    trick_family: 'butterfly', category: 'compound', adds: '4', is_active: 1,
    notation: 'ATOMIC BUTTERFLY',
  });
  insertFreestyleTrickModifierLink(db, 'atomic-butterfly', 'atomic', 1);

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

  // ── Control: blur — fails H4 (not in RESOLVED_FORMULAS_SPRINT_1) ──
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
  'osis', 'paradox-mirage', 'symposium-mirage', 'atomic-butterfly', 'ripwalk',
] as const;

describe('First-class trick pilot — Notation summary card', () => {
  it.each(PILOT_SLUGS)('renders the Notation summary card on /freestyle/tricks/%s', async (slug) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-notation-summary"/);
    expect(res.text).toMatch(/class="trick-notation-summary-heading"[^>]*>\s*Notation summary\s*</);
  });

  it.each(PILOT_SLUGS)('Notation summary on %s does NOT carry a "First-class" badge', async (slug) => {
    // FC polish slice: the loud public-facing badge is retired; the
    // section heading "Notation summary" is the only first-class signal.
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).not.toMatch(/class="trick-first-class-strip-badge"/);
    expect(res.text).not.toMatch(/>\s*First-class\s*</);
  });

  it.each(PILOT_SLUGS)('Notation summary on %s does NOT carry a redundant #slug title', async (slug) => {
    // FC polish slice: the strip's #slug title row was redundant with
    // the hero h1. Dropped entirely.
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.text).not.toMatch(/class="trick-first-class-strip-title"/);
    expect(res.text).not.toMatch(new RegExp(`class="trick-notation-summary-heading"[^>]*>\\s*#${slug}<`));
  });

  it.each(PILOT_SLUGS)('Notation summary on %s carries the canonical labeled rows', async (slug) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    const startIdx = res.text.indexOf('class="trick-notation-summary"');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = res.text.indexOf('</section>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toMatch(/<dt>Compact<\/dt>/);
    expect(region).toMatch(/<dt>ADD breakdown<\/dt>/);
    expect(region).toMatch(/<dt>Official<\/dt>/);
    expect(region).toMatch(/<dt>Video<\/dt>/);
  });

  it('osis Notation summary uses "Operational" label (atomic source) — NOT "JOB: OSIS" tautology', async () => {
    // FC polish slice: when the chain comes from the atomic flag-
    // decomposition, the label is "Operational" not "Job". The
    // uppercased canonical-name form ("OSIS") never appears as a
    // tautological chain value.
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    const startIdx = res.text.indexOf('class="trick-notation-summary"');
    const endIdx = res.text.indexOf('</section>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toMatch(/<dt>Operational<\/dt>/);
    expect(region).toContain('[set] &gt; (downtime) spin &gt; ss clipper');
    // Tautological-suppression invariants:
    expect(region).not.toMatch(/<dt>Job<\/dt>[\s\S]{0,100}OSIS/);
    expect(region).not.toMatch(/>\s*OSIS\s*</);
  });

  it('osis ADD breakdown shows curator-published flag-decomposition (NOT trivial identity)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('spin(1) + xbod(1) + stall(1)');
    expect(res.text).not.toMatch(/osis\(3\)\s*&#x3D;\s*3 ADD/);
  });

  it('paradox-mirage ADD breakdown shows the Sprint 1 +1-stack derivation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).toContain('paradox(+1) + mirage(2)');
  });

  it('ripwalk ADD breakdown shows the Sprint 3 folk-name resolution', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).toContain('stepping(+1) + butterfly(3)');
  });

  it('Official row renders the curator-locked numeric value with " ADD" suffix', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/atomic-butterfly');
    expect(res.text).toMatch(/class="trick-notation-summary-official"[^>]*>4 ADD</);
  });

  it('Compact row renders the curator-authored compact form (lowercased)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).toMatch(/class="trick-notation-summary-compact"[^>]*>paradox mirage</);
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

describe('First-class trick pilot — non-first-class control slugs', () => {
  it('mobius (H6 fails: gyro+torque computed != official) does NOT render the Notation summary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-notation-summary"/);
  });

  it('blur (H4 fails: not in RESOLVED_FORMULAS_SPRINT_1) does NOT render the Notation summary', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/blur');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-notation-summary"/);
  });

  it('first-class slugs suppress the Phase B trick-add-analysis disclosure', async () => {
    const paradoxMirage = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(paradoxMirage.text).not.toMatch(/class="trick-add-analysis-disclosure"/);
  });
});

describe('First-class trick pilot — browse-card secondary row', () => {
  it.each(PILOT_SLUGS)('renders the compact secondary row for %s in /freestyle/tricks?view=add', async (slug) => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // The pilot slug's browse card carries a .dict-card-first-class-row
    const cardIdx = res.text.indexOf(`data-trick-slug="${slug}"`);
    expect(cardIdx, `card for ${slug} not found in ADD view`).toBeGreaterThan(0);
    // Slice an upper bound for the card region
    const cardEnd = res.text.indexOf('</article>', cardIdx);
    const cardRegion = res.text.slice(cardIdx, cardEnd);
    expect(cardRegion).toContain('class="dict-card-first-class-row"');
  });

  it('non-first-class slugs do NOT render the secondary row in /freestyle/tricks?view=add', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    for (const slug of ['mobius', 'blur']) {
      const cardIdx = res.text.indexOf(`data-trick-slug="${slug}"`);
      if (cardIdx < 0) continue; // not present in this test's seeded view
      const cardEnd = res.text.indexOf('</article>', cardIdx);
      const cardRegion = res.text.slice(cardIdx, cardEnd);
      expect(cardRegion, `${slug} card should NOT carry first-class secondary row`).not.toContain('class="dict-card-first-class-row"');
    }
  });
});

describe('First-class trick pilot — 4-tier hierarchy contract preservation', () => {
  it('trick-detail notation-summary section is absent from the dictionary browse view', async () => {
    // /freestyle/tricks is the By ADD ladder of registry cards; the
    // trick-detail Tier sections (notation summary) never render here.
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-notation-summary"/);
  });
});

describe('First-class trick pilot — curator-internal language suppression', () => {
  it.each(PILOT_SLUGS)('Notation summary on %s does NOT leak curator-internal provenance', async (slug) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    const startIdx = res.text.indexOf('class="trick-notation-summary"');
    const endIdx   = res.text.indexOf('</section>', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).not.toMatch(/canonical inventory/i);
    expect(region).not.toMatch(/Red pt\d/i);
    expect(region).not.toMatch(/Wave 2/i);
    expect(region).not.toMatch(/Red ruling/i);
  });
});
