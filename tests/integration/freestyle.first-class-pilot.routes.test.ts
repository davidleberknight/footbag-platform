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

  it.each(PILOT_SLUGS)('Notation summary on %s carries the ADD row and the retired Compact/Official/Video rows are gone', async (slug) => {
    // 2026-05-23 regression slice: the notation-summary card was
    // reduced to the formula-only triplet JOB / ADD / ALT. Compact /
    // Official / Video rows were dropped (Compact = title duplication;
    // Official = redundant with hero ADD chip; Video = media indicator,
    // not a formula row). JOB and ALT are conditional — JOB appears
    // only when curator operational notation exists; ALT only for the
    // 5 rev(0) entries. ADD is the one always-rendered row.
    const res = await request(createApp()).get(`/freestyle/tricks/${slug}`);
    const startIdx = res.text.indexOf('class="trick-notation-summary"');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = res.text.indexOf('</section>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toMatch(/<dt>ADD<\/dt>/);
    expect(region).not.toMatch(/<dt>Compact<\/dt>/);
    expect(region).not.toMatch(/<dt>Official<\/dt>/);
    expect(region).not.toMatch(/<dt>Video<\/dt>/);
  });

  it('osis Notation summary uses "JOB" label — NOT a tautological echo of the canonical name', async () => {
    // Atomic flag-decomposition source still resolves to the JOB row
    // (uniform label across atomic / curator sources). The uppercased
    // canonical-name form ("OSIS") never appears as a tautological
    // chain value because the JOB row carries the operational chain
    // (e.g. "SET > SPIN [BOD] > OP CLIP [XBD] [DEL]").
    const res = await request(createApp()).get('/freestyle/tricks/osis');
    const startIdx = res.text.indexOf('class="trick-notation-summary"');
    const endIdx = res.text.indexOf('</section>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).toMatch(/<dt>JOB<\/dt>/);
    expect(region).toContain('SET &gt; SPIN [BOD] &gt; OP CLIP [XBD] [DEL]');
    // The legacy "Operational" / "Job" inline labels are gone.
    expect(region).not.toMatch(/<dt>Operational<\/dt>/);
    expect(region).not.toMatch(/<dt>Job<\/dt>/);
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

  it('hero ADD chip carries the curator-locked numeric value (Official row was retired)', async () => {
    // 2026-05-23: the dedicated "Official" dl row in the notation
    // summary card was retired as redundant with the hero ADD chip.
    // The hero's chip is the single source of truth for the numeric
    // total on first-class trick pages.
    const res = await request(createApp()).get('/freestyle/tricks/atomic-butterfly');
    expect(res.text).toMatch(/class="trick-hero-meta-chip trick-hero-meta-chip-adds"[^>]*>4 ADD</);
    expect(res.text).not.toMatch(/class="trick-notation-summary-official"/);
  });

  it('Compact row was retired from the notation-summary card', async () => {
    // 2026-05-23: the "Compact" dl row was retired as duplicating
    // the page title. (paradox-mirage has no curator-authored JOB
    // notation yet, so the JOB row simply does not render; the ADD
    // row carries the derivation.)
    const res = await request(createApp()).get('/freestyle/tricks/paradox-mirage');
    const startIdx = res.text.indexOf('class="trick-notation-summary"');
    expect(startIdx).toBeGreaterThan(0);
    const endIdx = res.text.indexOf('</section>', startIdx);
    const region = res.text.slice(startIdx, endIdx);
    expect(region).not.toMatch(/<dt>Compact<\/dt>/);
    expect(region).not.toMatch(/class="trick-notation-summary-compact"/);
    expect(region).toMatch(/<dt>ADD<\/dt>/);
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

describe('First-class trick pilot — two-line JOB+ADD row', () => {
  it.each(PILOT_SLUGS)('renders the line-2 JOB+ADD notation for %s in /freestyle/tricks?view=dex-count', async (slug) => {
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
    expect(res.status).toBe(200);
    // The pilot slug's row carries the line-2 notation block (JOB + ADD).
    const cardIdx = res.text.indexOf(`data-trick-slug="${slug}"`);
    expect(cardIdx, `row for ${slug} not found in dex-count view`).toBeGreaterThan(0);
    const cardEnd = res.text.indexOf('</article>', cardIdx);
    const cardRegion = res.text.slice(cardIdx, cardEnd);
    expect(cardRegion).toContain('class="dict-trick-row-notation"');
  });

  it('non-first-class rows render the SAME two-line contract (no first-class visual distinction)', async () => {
    // 2026-05-27: the two-line row dissolved the first-class secondary-row
    // visual distinction — every row (first-class or not) renders the same
    // line-2 JOB+ADD notation. mobius (non-first-class) is the control.
    const res = await request(createApp()).get('/freestyle/tricks?view=dex-count');
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
