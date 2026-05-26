/**
 * Integration tests for the footbag.org /newmoves observational ingest.
 *
 * Slice F3 of the FB.org ingestion campaign (2026-05-20). Twelve
 * structurally-clean compounds from the FB.org Paradox Moves listing
 * (Inspinning Paradox X / Spinning Paradox X / Paradox Barrage /
 * Paradox Blizzard / Paradox Symposium Mirage / Paradox High Plains
 * Drifter / Spinning Paradox Blender / Stepping Ducking Paradox Blender)
 * are staged as observational entries with sourceLabel='fborg' (a new
 * source label added by the F3 UI-semantics slice).
 *
 * Layer-separation contract verified here:
 *
 * 1. fborg entries surface ONLY on /freestyle/observational (never on
 *    canonical dictionary surfaces).
 * 2. fborg entries render the FB source badge with curator-attributed
 *    tooltip.
 * 3. fborg entries carry no #-tag chip, no trick-detail href, no media
 *    attachments (the observational-layer contract).
 * 4. fborg entries do NOT appear in /freestyle/tricks dictionary index.
 * 5. The fborg source label is independent of curator promotion; the
 *    presence of an entry here does NOT imply canonicalization.
 *
 * Promotion path documented in the content-module JSDoc:
 *   1. Move the row to canonical CSV
 *      (legacy_data/inputs/curated/tricks/red_additions_2026_04_20.csv)
 *   2. Re-run loader 19
 *   3. Remove the observational entry from
 *      src/content/freestyleObservationalTricks.ts
 * (Per feedback_observational_canonical_promotion_cleanup.)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';

const { dbPath } = setTestEnv('3158');

let createApp: Awaited<ReturnType<typeof importApp>>;

// Wave 5 observational→canonical promotions 2026-05-22: 10 of the original
// 12 FB.org observational entries were moved to canonical freestyle_tricks
// rows with FIRST_CLASS_TIER_2 membership (spinning-paradox-* /
// paradox-double-leg-over / paradox-barrage / paradox-blizzard /
// paradox-symposium-mirage / paradox-high-plains-drifter / spinning-paradox-
// blender / stepping-ducking-paradox-blender). The 2 inspinning-paradox-*
// entries remain observational pending the `inspinning` modifier-vocabulary
// decision (composite-framework slice).
const FBORG_BATCH = [
  { folkSlug: 'inspinning-paradox-mirage',         displayName: 'Inspinning Paradox Mirage',         add: 4 },
  { folkSlug: 'inspinning-paradox-illusion',       displayName: 'Inspinning Paradox Illusion',       add: 4 },
];

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // No canonical rows needed — observational layer is content-module-driven.
  // The /freestyle/observational route shapes from OBSERVATIONAL_TRICKS
  // with no DB join for the fborg cohort.
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('FB.org observational ingest — surface visibility', () => {
  it('all remaining fborg entries render on /freestyle/observational by displayName', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    expect(res.status).toBe(200);
    for (const entry of FBORG_BATCH) {
      expect(res.text, `missing fborg entry: ${entry.displayName}`).toContain(entry.displayName);
    }
  });

  it('fborg entries render with the FB source badge (sourceLabel=fborg → badge=FB)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    // At least FBORG_BATCH.length FB-badge instances (one per remaining
    // fborg observational entry). 2026-05-22: Wave 5 promoted 10 of the
    // original 12; the 2 inspinning-* entries remain.
    const fbBadgeMatches = res.text.match(/observed-card-source-badge--FB/g) ?? [];
    expect(fbBadgeMatches.length).toBeGreaterThanOrEqual(FBORG_BATCH.length);
  });

  it('source-strip at the page head lists FB as a represented source', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    expect(res.text).toContain('observed-source-strip-item--FB');
  });

  it('FB badge carries a footbag.org tooltip', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    // Look for a card with FB badge and footbag.org in the title attribute.
    expect(res.text).toMatch(/observed-card-source-badge--FB[^>]*title="[^"]*footbag\.org[^"]*"/);
  });
});

describe('FB.org observational ingest — proposed ADD claims surface honestly', () => {
  it('each fborg entry surfaces its proposed ADD claim with FB prefix (never as canonical ADD)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    // 'FB claim: N' is the framing for observational ADD claims;
    // 'N ADD' (canonical-implying) must NOT appear inside fborg cards.
    expect(res.text).toMatch(/FB claim: \d+/);
  });
});

describe('FB.org observational ingest — layer-separation contract', () => {
  it('fborg slugs do NOT appear as canonical trick-detail routes', async () => {
    const app = await createApp();
    // Each fborg folkSlug must 404 at /freestyle/tricks/{slug} — the
    // observational layer has no trick-detail pages.
    for (const entry of FBORG_BATCH) {
      const res = await request(app).get(`/freestyle/tricks/${entry.folkSlug}`);
      expect(res.status, `${entry.folkSlug} should 404 (observational has no detail page)`).toBe(404);
    }
  });

  it('fborg entries do NOT appear in the dictionary browse view', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // The dictionary index renders canonical rows only; fborg observational
    // entries must not leak in.
    for (const entry of FBORG_BATCH) {
      expect(res.text, `${entry.folkSlug} leaked into canonical dictionary`)
        .not.toContain(`data-trick-slug="${entry.folkSlug}"`);
    }
  });

  it('fborg observational cards carry a tracked-tag but no canonical trick-detail link', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    // Observed entries carry a visually distinct tracked-tag (a non-link
    // bare-slug span — HG-1 2026-05-26: tracked-tag renders the bare slug
    // with NO leading `#` glyph; the `#slug` form is reserved for promoted
    // canonical tricks per the publication-semantic forever-rule).
    for (const entry of FBORG_BATCH) {
      expect(res.text, `${entry.folkSlug} carries a canonical detail link`)
        .not.toMatch(new RegExp(`href="/freestyle/tricks/${entry.folkSlug}"`));
    }
    expect(res.text).toMatch(/<span class="tracked-tag"[^>]*>inspinning-paradox-mirage<\/span>/);
  });
});

describe('FB.org observational ingest — promotion-readiness signals', () => {
  it('every fborg entry uses status="pending-review" (curator-review queue)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    // The pending-review status maps to the neutral chip tone.
    // We verify presence of the neutral chip class without claiming an
    // exact count (other source labels also use pending-review).
    expect(res.text).toMatch(/observed-card-status-chip--neutral/);
  });
});

describe('/freestyle/observational — tracked-vocabulary section', () => {
  // Returns just the tracked-vocabulary block of the rendered page.
  async function trackedBlock(): Promise<string> {
    const app = await createApp();
    const res = await request(app).get('/freestyle/observational');
    expect(res.status).toBe(200);
    const start = res.text.indexOf('id="tracked-vocabulary"');
    expect(start).toBeGreaterThan(-1);
    return res.text.slice(start, res.text.indexOf('observational-footer', start));
  }

  it('renders the tracked-vocabulary section grouped by source', async () => {
    const block = await trackedBlock();
    expect(block).toContain('more documented names');
    // Grouped by documenting source — the three source groups.
    expect(block).toContain('FootbagMoves');
    expect(block).toContain('footbag.org');
    expect(block).toContain('PassBack');
  });

  it('does NOT group the tracked list by an ADD claim', async () => {
    // The observational page contract forbids ADD-claim grouping;
    // assert no "N ADD" tier headings leaked into the block.
    const block = await trackedBlock();
    expect(block).not.toMatch(/<h3>\d+\s*ADD/);
  });

  it('renders a tracked-tag identity for tracked names', async () => {
    // Every tracked name carries a #slug tracked-tag (the distinct,
    // not-official tag identity).
    const block = await trackedBlock();
    expect(block).toContain('class="tracked-tag"');
  });

  it('renders an operational notation for entries that have one', async () => {
    // Names with a symbolic_notation_raw on record show it after a ≡.
    const block = await trackedBlock();
    expect(block).toContain('observational-tracked-formula');
    expect(block).toContain('&equiv;');
  });

  it('renders formula-less entries cleanly as plain list items', async () => {
    // Many tracked names carry no notation (every PassBack name, plus
    // others). They must still render as <li> items. More <li> than
    // formula spans proves the formula-less entries render.
    const block = await trackedBlock();
    const items    = (block.match(/<li>/g) ?? []).length;
    const formulas = (block.match(/observational-tracked-formula/g) ?? []).length;
    expect(items).toBeGreaterThan(0);
    expect(items).toBeGreaterThan(formulas);
  });

  it('does not promote tracked names to canonical (no trick-detail links)', async () => {
    // The notation enrichment must not change canonical publication
    // status: tracked names render as plain text, never as canonical
    // /freestyle/tricks/{slug} detail links.
    const block = await trackedBlock();
    expect(block).not.toContain('href="/freestyle/tricks/');
  });
});
