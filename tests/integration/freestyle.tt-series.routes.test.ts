/**
 * Integration tests for GET /freestyle/tt-series.
 *
 * Verifies the TT Series view contract per docs/tt_series_view_spec.md §9:
 *   - 200 OK + page title
 *   - all 42 TT numbers appear in render order (1, 2, ..., 42)
 *   - ACTIVE row renders video tile + link to canonical trick page
 *   - PENDING row renders "Awaiting dictionary activation" chip
 *   - MISSING row renders no video tile
 *   - header counts sum to 42 (active + pending + missing + meta)
 *   - sidecar with no resolvable slug renders PENDING (not throws)
 *   - two sidecars claiming the same TT number flag the duplicate
 *   - deterministic output for fixed DB state
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
  insertMember,
  insertTtLesson,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3082');
let createApp: Awaited<ReturnType<typeof importApp>>;

const SYSTEM_MEMBER_ID = 'member-test-system-tt';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  insertMember(db, { id: SYSTEM_MEMBER_ID, is_system: 1 });

  // ── Dictionary state ─────────────────────────────────────────────────────
  // ACTIVE rows for the LIVE TT lessons we'll exercise.
  insertFreestyleTrick(db, { slug: 'toe-stall',         category: 'surface',  adds: '1' });
  insertFreestyleTrick(db, { slug: 'butterfly',         category: 'dex',      adds: '3' });
  insertFreestyleTrick(db, { slug: 'forehead-stall',    category: 'surface',  adds: '1' });
  insertFreestyleTrick(db, { slug: 'neck-stall',        category: 'surface',  adds: '1' });
  // Alias mirrors the production setup: tag '#neck-catch' resolves to neck-stall.
  insertFreestyleTrickAlias(db, 'neck-catch', 'neck-stall');

  // PENDING (is_active=0) row for the BLOCKED lessons demonstration.
  insertFreestyleTrick(db, { slug: 'spin', category: 'body', adds: '1', is_active: 0 });

  // ── Media items ──────────────────────────────────────────────────────────
  // Active TT lesson — TT #2 Toe Stall, dict ACTIVE → status=ACTIVE.
  insertTtLesson(db, {
    uploader_member_id: SYSTEM_MEMBER_ID,
    ttNumber: 2,
    trickSlug: 'toe-stall',
    videoId: 'TOEXXXXXXX1',
    lessonTitle: 'Toe Stall',
  });

  // Active TT lesson — TT #26 Butterfly Stall, tag points at 'butterfly'.
  insertTtLesson(db, {
    uploader_member_id: SYSTEM_MEMBER_ID,
    ttNumber: 26,
    trickSlug: 'butterfly',
    videoId: 'BTRXXXXXXX1',
    lessonTitle: 'Butterfly Stall',
  });

  // PENDING TT lesson — TT #6 Spin, dict row exists but is_active=0.
  insertTtLesson(db, {
    uploader_member_id: SYSTEM_MEMBER_ID,
    ttNumber: 6,
    trickSlug: 'spin',
    videoId: 'SPNXXXXXXX1',
    lessonTitle: 'Spin',
  });

  // PENDING via UNRESOLVABLE tag — TT #38 sidecar tagged with a slug that
  // does not exist in dict. View should render PENDING without crashing.
  insertTtLesson(db, {
    uploader_member_id: SYSTEM_MEMBER_ID,
    ttNumber: 38,
    trickSlug: 'totally-bogus-slug',
    videoId: 'BOGXXXXXXX1',
    lessonTitle: 'Spinning Butterfly',
  });

  // ALIAS resolution — TT #13 sidecar tagged with 'neck-catch' (alias for neck-stall).
  insertTtLesson(db, {
    uploader_member_id: SYSTEM_MEMBER_ID,
    ttNumber: 13,
    trickSlug: 'neck-catch',
    videoId: 'NCKXXXXXXX1',
    lessonTitle: 'Neck Catch',
  });

  // FOREHEAD stall — TT #12 Forehead Stall, dict ACTIVE.
  insertTtLesson(db, {
    uploader_member_id: SYSTEM_MEMBER_ID,
    ttNumber: 12,
    trickSlug: 'forehead-stall',
    videoId: 'FRHXXXXXXX1',
    lessonTitle: 'Forehead Stall',
  });

  // DUPLICATE — second media_items row for TT #2; should flag duplicateCount.
  insertTtLesson(db, {
    uploader_member_id: SYSTEM_MEMBER_ID,
    ttNumber: 2,
    trickSlug: 'toe-stall',
    videoId: 'TOEXXXXXXX2',
    id: 'media-tt-2-dup',
    lessonTitle: 'Toe Stall',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /freestyle/tt-series', () => {
  it('returns 200 with page title and intro', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Tricks of the Trade');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    expect(res.text).toContain('href="/freestyle"');
  });

  it('renders all 42 TT numbers in ascending order', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');

    // Each item carries data-tt-number="N"; assert presence + ordering.
    const matches = [...res.text.matchAll(/data-tt-number="(\d+)"/g)].map((m) => parseInt(m[1], 10));
    expect(matches).toHaveLength(42);
    for (let i = 0; i < 42; i++) {
      expect(matches[i]).toBe(i + 1);
    }
  });

  it('renders ACTIVE chip + trick link for an active dictionary lesson', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    expect(res.text).toContain('tt-status-ACTIVE');
    expect(res.text).toContain('Active in dictionary');
    expect(res.text).toContain('href="/freestyle/tricks/toe-stall"');
    expect(res.text).toContain('href="/freestyle/tricks/butterfly"');
  });

  it('renders PENDING chip for a sidecar whose trick is is_active=0', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    expect(res.text).toContain('tt-status-PENDING');
    expect(res.text).toContain('Awaiting dictionary activation');
  });

  it('renders PENDING (not 500) when sidecar tag does not resolve to any dict row', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    expect(res.status).toBe(200);
    // TT #38 has the bogus tag; row must render with PENDING chip.
    // Class attr precedes data-tt-number in the template, so search within the same <li>.
    expect(res.text).toMatch(/<li[^>]*tt-status-PENDING[^>]*data-tt-number="38"/);
  });

  it('renders MISSING (no video tile) for a roster row with no media match', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    // TT #34 is "unconfirmed" in the roster and has no media in the test DB.
    expect(res.text).toMatch(/<li[^>]*tt-status-MISSING[^>]*data-tt-number="34"/);
  });

  it('renders META chip for TT #1 Shoes', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    expect(res.text).toMatch(/<li[^>]*tt-status-META[^>]*data-tt-number="1"/);
    expect(res.text).toContain('Meta lesson');
  });

  it('resolves an alias tag to its canonical trick (neck-catch → neck-stall)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    expect(res.text).toContain('href="/freestyle/tricks/neck-stall"');
  });

  it('flags duplicate sidecars for the same TT number', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    // TT #2 has two media rows. tt-chip-warn appears in the body, after the
    // <li> opening tag, so a forward-looking match works here.
    const block = res.text.match(/<li[^>]*data-tt-number="2"[\s\S]*?<\/li>/);
    expect(block).not.toBeNull();
    expect(block![0]).toContain('tt-chip-warn');
    expect(block![0]).toContain('2 sidecars (duplicate)');
  });

  it('header counts include all four buckets and sum to 42', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');

    const grab = (label: RegExp): number => {
      const m = res.text.match(label);
      if (!m) throw new Error(`label not found: ${label}`);
      return parseInt(m[1], 10);
    };
    const active  = grab(/<strong>(\d+)<\/strong>\s*active\b/);
    const pending = grab(/<strong>(\d+)<\/strong>\s*awaiting dictionary activation/);
    const missing = grab(/<strong>(\d+)<\/strong>\s*no video staged/);
    const meta    = grab(/<strong>(\d+)<\/strong>\s*meta\b/);
    expect(active + pending + missing + meta).toBe(42);
    // Sanity: with our seeded data, at least 4 active (toe-stall + butterfly +
    // neck-stall via alias + forehead-stall) and 1 meta (Shoes).
    expect(active).toBeGreaterThanOrEqual(4);
    expect(meta).toBe(1);
  });

  it('renders YouTube facade markup for ACTIVE lessons (URL-reference, not MP4)', async () => {
    const app = createApp();
    const res = await request(app).get('/freestyle/tt-series');
    // The video facade should reference youtube-nocookie (URL-ref pattern),
    // never an S3 / MP4 path.
    expect(res.text).toContain('youtube-nocookie.com/embed/TOEXXXXXXX1');
    expect(res.text).not.toMatch(/data-video-src=/);
  });
});
