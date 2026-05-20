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

describe('First-class trick pilot — metadata strip', () => {
  it.each(PILOT_SLUGS)('renders the first-class strip on /freestyle/tricks/%s', async (slug) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-first-class-strip"/);
    expect(res.text).toMatch(/class="trick-first-class-strip-badge"[^>]*>\s*First-class\s*</);
  });

  it.each(PILOT_SLUGS)('strip on %s carries all six labeled fields', async (slug) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    // Strip title row shows the slug-tag
    expect(res.text).toMatch(new RegExp(`class="trick-first-class-strip-title"[^>]*>#${slug}<`));
    // Five labeled metadata rows
    expect(res.text).toMatch(/class="trick-first-class-strip-label"[^>]*>\s*Compact notation\s*</);
    expect(res.text).toMatch(/class="trick-first-class-strip-label"[^>]*>\s*Job notation\s*</);
    expect(res.text).toMatch(/class="trick-first-class-strip-label"[^>]*>\s*ADD derivation\s*</);
    expect(res.text).toMatch(/class="trick-first-class-strip-label"[^>]*>\s*Official ADD\s*</);
    expect(res.text).toMatch(/class="trick-first-class-strip-label"[^>]*>\s*Video\s*</);
  });

  it('osis ADD derivation shows curator-published flag-decomposition (NOT trivial identity)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toContain('spin(1) + xbod(1) + stall(1)');
    expect(res.text).not.toMatch(/osis\(3\)\s*&#x3D;\s*3 ADD/);
  });

  it('paradox-mirage ADD derivation shows the Sprint 1 +1-stack derivation', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(res.text).toContain('paradox(+1) + mirage(2)');
  });

  it('ripwalk ADD derivation shows the Sprint 3 folk-name resolution', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/ripwalk');
    expect(res.text).toContain('stepping(+1) + butterfly(3)');
  });

  it('Video row shows "No" when no curated media is tagged', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    expect(res.text).toMatch(/class="trick-first-class-strip-value trick-first-class-strip-value--none-yet"[^>]*>No</);
  });

  it('Official ADD row renders the curator-locked numeric value', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/atomic-butterfly');
    // atomic-butterfly: official ADD = 4
    expect(res.text).toMatch(/class="trick-first-class-strip-value trick-first-class-strip-value--official-add"[^>]*>4</);
  });

  it('Compact notation row renders the curator-authored compact form (lowercased)', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    // DB stores 'PARADOX MIRAGE'; strip displays lowercased
    expect(res.text).toMatch(/class="trick-first-class-strip-value"[^>]*>paradox mirage</);
  });
});

describe('First-class trick pilot — non-first-class control slugs', () => {
  it('mobius (H6 fails: gyro+torque computed != official) does NOT render the strip', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/mobius');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-first-class-strip"/);
  });

  it('blur (H4 fails: not in RESOLVED_FORMULAS_SPRINT_1) does NOT render the strip', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/blur');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-first-class-strip"/);
  });

  it('first-class slugs suppress the Phase B trick-add-analysis disclosure', async () => {
    // For first-class slugs the comparativeNotation strip supersedes the
    // Phase B collapsed disclosure (avoiding double ADD-row render).
    const paradoxMirage = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    expect(paradoxMirage.text).not.toMatch(/class="trick-add-analysis-disclosure"/);
  });
});

describe('First-class trick pilot — 4-tier hierarchy contract preservation', () => {
  it('first-class strip absent from /freestyle/tricks landing', async () => {
    const res = await request(createApp()).get('/freestyle/tricks');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-first-class-strip"/);
    // No flag-decomposition patterns
    expect(res.text).not.toMatch(/spin\(1\) \+ xbod\(1\)/);
    // No +1-stack patterns on landing
    expect(res.text).not.toMatch(/paradox\(\+1\) \+ mirage\(2\)/);
  });

  it('Tier-4 ADD breakdown patterns absent from /freestyle/tricks?view=add browse', async () => {
    const res = await request(createApp()).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    expect(res.text).not.toMatch(/class="trick-first-class-strip"/);
    expect(res.text).not.toMatch(/spin\(1\) \+ xbod\(1\)/);
  });
});

describe('First-class trick pilot — curator-internal language suppression', () => {
  it.each(PILOT_SLUGS)('strip on %s does NOT leak curator-internal provenance', async (slug) => {
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    // Adversarial: provenance strings from RESOLVED_FORMULAS_SPRINT_1
    // (e.g. "canonical inventory", "Red", "pt6", "Wave 2") must NEVER
    // appear on the rendered page.
    const startIdx = res.text.indexOf('class="trick-first-class-strip"');
    const endIdx   = res.text.indexOf('</section>', startIdx);
    expect(startIdx).toBeGreaterThan(0);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).not.toMatch(/canonical inventory/i);
    expect(region).not.toMatch(/Red pt\d/i);
    expect(region).not.toMatch(/Wave 2/i);
    expect(region).not.toMatch(/Red ruling/i);
  });
});
