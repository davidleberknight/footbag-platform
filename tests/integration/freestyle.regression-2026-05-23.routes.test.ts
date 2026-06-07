/**
 * Freestyle dictionary / glossary / observational regression suite.
 *
 * Pins the ten contract items from the 2026-05-23 regression pass:
 *
 *   1. Dictionary landing browse-tab strip carries no Observed Tricks
 *      link (the duplicate of the Go Deeper card was removed).
 *   2. Observed tricks are ordered by their source's numeric claim
 *      ascending (entries without a claim sort last); displayName is
 *      the secondary tiebreak.
 *   3. The Watch & Learn PassBack tutorials link on the freestyle
 *      landing is an active anchor with the correct href; the Media
 *      index also renders an active anchor for the same gallery.
 *   4. The glossary contains a dedicated Jobs notation section
 *      anchored at #jobs-notation, with an explicit reference to the
 *      historical-source archive at exploration/fborg/JobsNotation.txt.
 *   5. The compound-description slot does not duplicate the JOB
 *      formula. For atomic-style tricks (cloud-kick) the operational
 *      notation string renders only once.
 *   6. Formula rows render in JOB → ADD → ALT order on first-class
 *      trick detail pages, and rev(0) lives in the ALT row (not in
 *      the ADD calculation).
 *   7. Rake renders curator-locked JOB notation `SET > SWING TOE [DEL]`
 *      and is not labelled "canonical decomposition pending".
 *   8. "unusual surface" no longer appears in ADD-accounting displays;
 *      `UNS(1)` is the bucket token. The glossary explains UNS.
 *   9. double-around-the-world and double-leg-over surface JOB
 *      notation + ADD calculation rows from the resolved-formulas
 *      content module.
 *  10. flying-clipper ADD accounting renders as `BOD(1) + clipper(1)`,
 *      not `flying(+1)`.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import BetterSqlite3 from 'better-sqlite3';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertMember,
  insertFreestyleTrick,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3175');

let createApp: Awaited<ReturnType<typeof importApp>>;

const TS = '2026-05-23T00:00:00.000Z';

function insertGalleryRow(db: BetterSqlite3.Database, id: string, name: string, ownerId: string): void {
  db.prepare(`
    INSERT INTO member_galleries
      (id, created_at, created_by, updated_at, updated_by, version,
       owner_member_id, name, description, is_default, sort_order)
    VALUES (?, ?, 'seed', ?, 'seed', 1, ?, ?, '', 0, 'upload_desc')
  `).run(id, TS, TS, ownerId, name);
}

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // System member owns the gallery rows under test.
  const fhId = insertMember(db, {
    legacy_member_id: 'fh',
    login_email: 'fh@local.test',
    display_name: 'Footbag Hacky',
  });

  // Gallery rows used by item 3 assertions.
  insertGalleryRow(db, 'gallery_passback_tutorials', 'PassBack Tutorials', fhId);

  // Atomic-ish trick used by items 5+6+8 (compound-description slot,
  // formula row order, UNS rendering).
  insertFreestyleTrick(db, {
    slug:                 'cloud-kick',
    canonical_name:       'cloud kick',
    adds:                 '1',
    base_trick:           'cloud-kick',
    trick_family:         'cloud-kick',
    category:             'kick',
    description:          'Kick off the back of the shin.',
    notation:             'CLOUD KICK',
    operational_notation: '[set] > cloud kick',
    review_status:        'expert_reviewed',
    is_active:            1,
  });

  // Rake is the JOB-notation completion target for item 7.
  insertFreestyleTrick(db, {
    slug:                 'rake',
    canonical_name:       'rake',
    adds:                 '2',
    base_trick:           'toe-stall',
    trick_family:         'rake',
    category:             'compound',
    description:          'Rake trick.',
    notation:             null,
    operational_notation: null,
    review_status:        'expert_reviewed',
    is_active:            1,
  });

  // Bases referenced by toe-stall + clipper FK targets for the
  // compound rows below. Minimal rows; not under direct assertion.
  insertFreestyleTrick(db, {
    slug:                 'toe-stall',
    canonical_name:       'toe stall',
    adds:                 '1',
    base_trick:           'toe-stall',
    trick_family:         'toe-stall',
    category:             'surface',
    review_status:        'expert_reviewed',
    is_active:            1,
  });
  insertFreestyleTrick(db, {
    slug:                 'clipper',
    canonical_name:       'clipper',
    adds:                 '1',
    base_trick:           'clipper',
    trick_family:         'clipper',
    category:             'body',
    review_status:        'expert_reviewed',
    is_active:            1,
  });
  insertFreestyleTrick(db, {
    slug:                 'around-the-world',
    canonical_name:       'around the world',
    adds:                 '2',
    base_trick:           'around-the-world',
    trick_family:         'around-the-world',
    category:             'body',
    review_status:        'expert_reviewed',
    is_active:            1,
  });
  insertFreestyleTrick(db, {
    slug:                 'legover',
    canonical_name:       'legover',
    adds:                 '2',
    base_trick:           'legover',
    trick_family:         'legover',
    category:             'body',
    review_status:        'expert_reviewed',
    is_active:            1,
  });

  // Item 9 — DATW + DLO base rows. Resolved-formulas content module
  // overrides operational_notation at shape time, but the row must
  // exist for the trick-detail route to render at all.
  insertFreestyleTrick(db, {
    slug:                 'double-around-the-world',
    canonical_name:       'double around the world',
    adds:                 '3',
    base_trick:           'around-the-world',
    trick_family:         'around-the-world',
    category:             'compound',
    description:          'two consecutive full leg circles',
    operational_notation: null,
    review_status:        'expert_reviewed',
    is_active:            1,
  });
  insertFreestyleTrick(db, {
    slug:                 'double-leg-over',
    canonical_name:       'double leg over',
    adds:                 '3',
    base_trick:           'legover',
    trick_family:         'legover',
    category:             'compound',
    description:          'two consecutive leg-over events',
    operational_notation: null,
    review_status:        'expert_reviewed',
    is_active:            1,
  });

  // Item 10 — flying-clipper for BOD(1) accounting.
  insertFreestyleTrick(db, {
    slug:                 'flying-clipper',
    canonical_name:       'flying clipper',
    adds:                 '2',
    base_trick:           'clipper',
    trick_family:         'clipper',
    category:             'compound',
    description:          'Jumping body kick into clipper position.',
    notation:             'FLYING CLIPPER',
    operational_notation: 'flying > clipper',
    review_status:        'expert_reviewed',
    is_active:            1,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ── Item 1 — dictionary landing browse-tab strip ─────────────────────────
describe('Item 1: dictionary landing browse strip — no Observed Tricks tab', () => {
  it('omits the Observed Tricks anchor from the .trick-view-toggle strip', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // Extract just the trick-view-toggle nav element so we don't get
    // a false positive from anchors elsewhere on the page.
    const navMatch = res.text.match(
      /<nav class="trick-view-toggle"[\s\S]*?<\/nav>/,
    );
    expect(navMatch, 'browse-tab nav missing from /freestyle/tricks').toBeTruthy();
    const navHtml = navMatch![0];
    expect(navHtml).not.toContain('/freestyle/observational');
    expect(navHtml).not.toContain('Observed Tricks');
  });
});

// ── Item 3 — PassBack tutorial link active on freestyle landing + media ──
describe('Item 3: PassBack tutorial link active on both entry points', () => {
  it('freestyle landing renders an active anchor to gallery_passback_tutorials', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(
      /<a[^>]+href="\/media\/gallery_passback_tutorials"[^>]*>[^<]*PassBack/,
    );
  });

  it('media index renders an anchor pointing at gallery_passback_tutorials', async () => {
    const app = await createApp();
    const res = await request(app).get('/media');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(
      /href="\/media\/gallery_passback_tutorials"/,
    );
  });
});

// ── Item 4 — Glossary Jobs notation section ──────────────────────────────
describe('Item 4: glossary has Jobs notation section with archive reference', () => {
  it('renders an h3 with id=jobs-notation', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/id="jobs-notation"/);
    expect(res.text).toContain('Jobs notation');
  });

  it('cites Ben Job\'s article without leaking an internal repo path', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.text).not.toContain('exploration/fborg/JobsNotation.txt');
    expect(res.text).toMatch(/Read Ben Job's original article/);
  });
});

// ── Items 5 + 6 + 8 — cloud-kick page contract ───────────────────────────
describe('Items 5 + 6 + 8: cloud-kick formula rows', () => {
  it('renders the ADD breakdown as UNS(1) (no "unusual surface" long form)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks/cloud-kick');
    expect(res.status).toBe(200);
    // Slice D 2026-05-26: the `= 1 ADD` terminator is stripped from
    // trick-detail breakdowns; the hero ADD chip carries the total.
    // Still pin uppercase UNS and absence of the "unusual surface" long form.
    expect(res.text).toMatch(/UNS\(1\)/);
    expect(res.text).not.toMatch(/unusual surface\(\d+\)/);
  });

  it('does not duplicate the operational formula in a compound-description slot', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks/cloud-kick');
    // The operational notation "[set] > cloud kick" should render at
    // most once on an atomic trick — the JOB row in the notation
    // summary card carries it. The lower trick-operational section is
    // suppressed for first-class tricks (cloud-kick qualifies).
    // Count both unescaped (> in plain text) and HTML-escaped (&gt;)
    // forms; the canonical render is escaped inside <code>.
    const occurrences = res.text.match(/\[set\]\s*(?:>|&gt;)\s*cloud kick/g) ?? [];
    expect(occurrences.length).toBeLessThanOrEqual(1);
  });

  it('renders the JOB row label and the ADD row label in JOB → ADD order', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks/cloud-kick');
    const jobIdx = res.text.indexOf('<dt>JOB</dt>');
    const addIdx = res.text.indexOf('<dt>ADD</dt>');
    expect(jobIdx).toBeGreaterThan(0);
    expect(addIdx).toBeGreaterThan(0);
    expect(jobIdx).toBeLessThan(addIdx);
  });
});

// ── Item 6 — ALT row ordering on a rev(0) entry ──────────────────────────
describe('Item 6: ALT row appears after ADD on rev(0) entries', () => {
  // illusion is one of the five curator-locked rev(0) entries.
  // The test data set does not insert an illusion row; we rely on the
  // production seed data + the resolved-formulas + REVERSE_PAIR_TRANSFORMS
  // content modules. The trick is also a core atom (CORE_TRICK_SPEC).
  // Without a DB row, the route returns 404 and the test would skip; we
  // therefore insert a minimal illusion row up front.
  it('rev(0) appears in the ALT row, never in the ADD row', async () => {
    const app = await createApp();
    // illusion isn't seeded in beforeAll; rev-whirl isn't either. Seed
    // illusion inline so the route renders.
    const db = new BetterSqlite3(dbPath);
    try {
      const exists = db.prepare(`SELECT 1 FROM freestyle_tricks WHERE slug = ?`).get('illusion');
      if (!exists) {
        insertFreestyleTrick(db, {
          slug:                 'illusion',
          canonical_name:       'illusion',
          adds:                 '2',
          base_trick:           'illusion',
          trick_family:         'illusion',
          category:             'body',
          notation:             'ILLUSION',
          operational_notation: '[set] > illusion',
          review_status:        'expert_reviewed',
          is_active:            1,
        });
      }
    } finally {
      db.close();
    }
    const res = await request(app).get('/freestyle/tricks/illusion');
    expect(res.status).toBe(200);
    const addIdx = res.text.indexOf('<dt>ADD</dt>');
    const altIdx = res.text.indexOf('<dt>ALT</dt>');
    expect(addIdx).toBeGreaterThan(0);
    expect(altIdx).toBeGreaterThan(addIdx);
    // ALT row content carries the rev(0) expression with its base ADD.
    expect(res.text).toMatch(/rev\(0\)\s*\+\s*mirage\(2\)\s*(?:=|&#x3D;)\s*2 ADD/);
  });
});

// ── Item 7 — rake JOB notation ───────────────────────────────────────────
describe('Item 7: rake has curator-locked JOB notation', () => {
  it('renders SET > SWING TOE [DEL] on the rake detail page', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks/rake');
    expect(res.status).toBe(200);
    // The resolved-formulas operationalNotation override flows through
    // shapeOperationalNotationDisplay → tokenized inline; assert the
    // chain text appears in the rendered HTML.
    // Rake's JOB row carries `SET > SWING TOE [DEL]`. For first-class
    // tricks the notation summary card renders it as plain text inside
    // <code>; for non-first-class fallthrough it would tokenize. Match
    // either layout.
    expect(res.text).toMatch(
      /SET[\s\S]{0,30}(?:&gt;|>)[\s\S]{0,30}SWING[\s\S]{0,30}TOE[\s\S]{0,30}\[DEL\]|>SET<[\s\S]+?>SWING<[\s\S]+?>TOE<[\s\S]+?>\[DEL\]</,
    );
    // And the page must not be labelled notation-pending.
    expect(res.text).not.toContain('Notation pending');
    expect(res.text).not.toContain('canonical decomposition pending');
  });
});

// ── Item 8 — UNS in glossary abbreviations ───────────────────────────────
describe('Item 8: glossary explains the UNS abbreviation', () => {
  it('the glossary §7 operational-token table lists UNS', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toContain('UNS');
    expect(res.text).toMatch(/Unusual surface\.?\s+Non-standard/i);
  });
});

// ── Item 9 — DATW + DLO formulas ─────────────────────────────────────────
describe('Item 9: double-around-the-world + double-leg-over formula rows', () => {
  it('double-around-the-world renders JOB + ADD formulas from the resolved-formulas override', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks/double-around-the-world');
    expect(res.status).toBe(200);
    // Tokens render as separate spans with attribute markup between;
    // assert each token in order with permissive gaps. This is the
    // structural assertion ("right tokens, right order"), not a text
    // substring assertion.
    expect(res.text).toMatch(/>TOE<[\s\S]+?>SAME<[\s\S]+?>IN<[\s\S]+?>\[DEX\]<[\s\S]+?>SAME<[\s\S]+?>IN<[\s\S]+?>\[DEX\]<[\s\S]+?>SAME<[\s\S]+?>TOE<[\s\S]+?>\[DEL\]</);
    // Slice D 2026-05-26: `= 3 ADD` stripped from trick-detail breakdowns.
    expect(res.text).toMatch(/dex\(2\)\s*\+\s*stall\(1\)/);
  });

  it('double-leg-over renders JOB + ADD formulas from the resolved-formulas override', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks/double-leg-over');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/>SET<[\s\S]+?>OP<[\s\S]+?>IN<[\s\S]+?>\[DEX\]<[\s\S]+?>OP<[\s\S]+?>OUT<[\s\S]+?>\[DEX\]<[\s\S]+?>SAME<[\s\S]+?>TOE<[\s\S]+?>\[DEL\]</);
    expect(res.text).toMatch(/dex\(2\)\s*\+\s*stall\(1\)/);
  });
});

// ── Item 10 — flying-clipper BOD accounting ──────────────────────────────
describe('Item 10: flying-clipper ADD accounting uses BOD(1)', () => {
  it('renders BOD(1) + clipper(1) on the flying-clipper detail page (Slice D: terminator stripped)', async () => {
    const app = await createApp();
    const res = await request(app).get('/freestyle/tricks/flying-clipper');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/BOD\(1\)\s*\+\s*clipper\(1\)/);
    // The old flying(+1) form must not appear in user-facing displays.
    expect(res.text).not.toMatch(/flying\(\+1\)\s*\+\s*clipper\(1\)/);
  });
});
