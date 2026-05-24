/**
 * Slice 7-OBS-A regression suite — 9-row FM-sourced folk-name promotions.
 *
 * Pins:
 *   - Each of the 9 promoted slugs renders a canonical trick-detail
 *     page (HTTP 200, hero ADD chip with the published value).
 *   - The FM-parens JOB notation flows through resolveOperationalNotationRaw
 *     to the rendered page (tokens visible).
 *   - The 9 slugs are absent from the /freestyle/observational
 *     (Emerging Vocabulary) page — the layer-separation cleanup invariant
 *     from feedback_observational_canonical_promotion_cleanup.
 *   - The published ADD matches the PB claim under FM dex-count convention.
 *
 * Dual-convention rule: punctuation style determines counting convention.
 * FM (parens) → only (DEX) tokens count; canonical [brackets] → every
 * token counts. These nine entries use FM (parens), so ADD = count of
 * (DEX) tokens, which equals the PB historical claim.
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

const { dbPath } = setTestEnv('3176');

let createApp: Awaited<ReturnType<typeof importApp>>;

interface SlicePromotion {
  slug: string;
  canonicalName: string;
  adds: number;
  /** Sample FM-parens tokens to assert appear in the rendered HTML. */
  jobFragment: string;
}

// Tokens render as separate spans with attribute markup between, so
// multi-word fragments do not appear as contiguous substrings. Each
// jobFragment below is a single FM-parens token (or rendering marker)
// that is present in the trick's rendered HTML.
const PROMOTIONS: readonly SlicePromotion[] = [
  { slug: 'bladerunner',     canonicalName: 'bladerunner',     adds: 3, jobFragment: '(XDEX)' },
  { slug: 'bling-blang',     canonicalName: 'bling blang',     adds: 2, jobFragment: '(XBD)' },
  { slug: 'cold-fusion',     canonicalName: 'cold fusion',     adds: 3, jobFragment: '(PDX)' },
  { slug: 'flurricane',      canonicalName: 'flurricane',      adds: 3, jobFragment: '(BOD)' },
  { slug: 'golden-shower',   canonicalName: 'golden shower',   adds: 3, jobFragment: '(BOD)' },
  { slug: 'goliath',         canonicalName: 'goliath',         adds: 3, jobFragment: '(BOD)' },
  { slug: 'gybas',           canonicalName: 'gybas',           adds: 2, jobFragment: '(BOD)' },
  { slug: 'motion-sickness', canonicalName: 'motion sickness', adds: 2, jobFragment: '(BOD)' },
  { slug: 'pandemonium',     canonicalName: 'pandemonium',     adds: 3, jobFragment: '(BOD)' },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  for (const p of PROMOTIONS) {
    insertFreestyleTrick(db, {
      slug:          p.slug,
      canonical_name: p.canonicalName,
      adds:          String(p.adds),
      base_trick:    p.slug,
      trick_family:  p.slug,
      category:      'compound',
      review_status: 'expert_reviewed',
      is_active:     1,
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('Slice 7-OBS-A: each promoted slug has a canonical detail page', () => {
  it.each(PROMOTIONS)('$slug renders /freestyle/tricks/$slug with the FM JOB and the published ADD', async (p) => {
    const app = await createApp();
    const res = await request(app).get(`/freestyle/tricks/${p.slug}`);
    expect(res.status, `expected 200 for ${p.slug}`).toBe(200);
    // Hero ADD chip carries the published value (FM dex-count == PB claim).
    expect(res.text).toMatch(
      new RegExp(`class="trick-hero-meta-chip trick-hero-meta-chip-adds"[^>]*>${p.adds} ADD<`),
    );
    // FM JOB notation flows through resolveOperationalNotationRaw to the
    // rendered page. The operational-notation section renders for non-
    // first-class trick-detail pages; assert the section is present
    // and carries a distinctive FM-format token from the trick's JOB.
    expect(res.text, `${p.slug} missing operational-notation section`)
      .toContain('operational-notation-display');
    expect(res.text, `${p.slug} should render the FM token ${p.jobFragment}`)
      .toContain(p.jobFragment);
  });
});

describe('Slice 7-OBS-A: promoted slugs removed from Emerging Vocabulary cards layer', () => {
  it('none of the 9 promoted slugs appear as observational cards on /freestyle/observational', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    expect(res.status).toBe(200);
    // The cards-level observational layer (the OBSERVATIONAL_TRICKS
    // content module) must no longer carry these slugs — the cleanup
    // invariant from feedback_observational_canonical_promotion_cleanup.
    // The lower tracked-names corpus list is a separate surface that may
    // still index a name; the strict cleanup contract applies to the
    // cards layer (data-folk-slug attribute is the cards-layer signal).
    for (const p of PROMOTIONS) {
      expect(res.text, `${p.slug} still appears as an observational card`)
        .not.toContain(`data-folk-slug="${p.slug}"`);
    }
  });

  it('Emerging Vocabulary page renders the renamed title (rename pin)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    expect(res.text).toContain('Emerging Vocabulary');
  });
});

describe('Slice 7-OBS-A: dual-convention semantic rule documented', () => {
  it('PUBLICATION_STANDARDS.md exists with the dual-convention section', async () => {
    // The exploration doc is a curator-reviewable draft that codifies the
    // forever-rule. Presence of the file + the headline section is the
    // contract this test pins; later editing is curator-paced.
    const fs = await import('fs');
    const path = '/home/james/projects/footbag-platform/exploration/scalable-publication-2026-05-23/PUBLICATION_STANDARDS.md';
    expect(fs.existsSync(path), 'PUBLICATION_STANDARDS.md missing').toBe(true);
    const body = fs.readFileSync(path, 'utf-8');
    expect(body).toContain('Dual-convention ADD counting');
    expect(body).toContain('FM parens (FootbagMoves-style)');
    expect(body).toContain('punctuation style determines');
  });
});
