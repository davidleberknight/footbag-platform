/**
 * Integration tests for freestyle public routes.
 *
 * Covers:
 *   GET /freestyle         — landing page
 *   GET /freestyle/records — records page
 *
 * Public filter contract verified:
 *   - only 'probable' and 'verified' confidence rows appear
 *   - superseded rows (superseded_by IS NOT NULL) do not appear
 *   - rows with neither person_id nor display_name cannot exist (DB CHECK)
 *
 * Person-link contract:
 *   - resolved person_id renders as /history/:personId link
 *   - unresolved (display_name only) renders as plain text
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import { seedStagedOperatorsAndModifiers } from '../fixtures/stagedOperators';
import { seedStagedFamilies } from '../fixtures/stagedFamilies';
import {
  insertHistoricalPerson,
  insertFreestyleRecord,
  insertMember,
  insertFreestyleTrick,
  insertFreestyleTrickAlias,
  insertFreestyleTrickModifierLink,
  insertTtLesson,
  insertCuratorUrlReference,
} from '../fixtures/factories';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { FREESTYLE_ADD_ANALYSIS_CONTENT } from '../../src/content/freestyleAddAnalysisContent';
import { SITE_MEDIA_SLOTS } from '../../src/content/siteMedia';

const { dbPath } = setTestEnv('3080');

let curatedRoot: string;

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

const PERSON_ID          = 'person-freestyle-test-001';
const FREESTYLE_PLAYER_ID = 'person-freestyle-player-001';

beforeAll(async () => {
  const db = createTestDb(dbPath);
  seedStagedFamilies(db);
  // A canonical person whose records should link to /history/:personId
  insertHistoricalPerson(db, {
    person_id:    PERSON_ID,
    person_name:  'Alice Shredder',
    source_scope: 'CANONICAL',
  });

  // Public record — linked to canonical person
  insertFreestyleRecord(db, {
    id:           'fr-public-linked',
    person_id:    PERSON_ID,
    display_name: 'Alice Shredder',
    trick_name:   'Torque',
    sort_name:    'Gyro Whirl (op)',
    value_numeric: 42,
    confidence:   'probable',
    video_url:    'https://youtu.be/abc123defgh',
  });

  // Public record — display_name only (no person_id)
  insertFreestyleRecord(db, {
    id:           'fr-public-unlinked',
    person_id:    null,
    display_name: 'Unknown Player',
    trick_name:   'Whirl',
    value_numeric: 17,
    confidence:   'probable',
  });

  // Provisional record — must NOT appear on public page
  insertFreestyleRecord(db, {
    id:           'fr-provisional',
    display_name: 'Hidden Player',
    trick_name:   'Secret Trick',
    value_numeric: 99,
    confidence:   'provisional',
  });

  // Superseded record — must NOT appear on public page
  insertFreestyleRecord(db, {
    id:             'fr-old',
    display_name:   'Old Record Holder',
    trick_name:     'Torque',
    value_numeric:  30,
    confidence:     'probable',
    superseded_by:  'fr-public-linked',
  });

  // Player with their own freestyle records — HoF so page is publicly accessible
  insertHistoricalPerson(db, {
    person_id:    FREESTYLE_PLAYER_ID,
    person_name:  'Bob Freestyler',
    source_scope: 'CANONICAL',
    hof_member:   1,
  });
  insertFreestyleRecord(db, {
    id:            'fr-bob-1',
    person_id:     FREESTYLE_PLAYER_ID,
    display_name:  'Bob Freestyler',
    trick_name:    'Pixie',
    value_numeric: 55,
    confidence:    'probable',
    video_url:     'https://youtu.be/pixie123abc',
    video_timecode: '0:42',
  });
  insertFreestyleRecord(db, {
    id:            'fr-bob-provisional',
    person_id:     FREESTYLE_PLAYER_ID,
    display_name:  'Bob Freestyler',
    trick_name:    'Hidden Trick',
    value_numeric: 99,
    confidence:    'provisional',  // must NOT appear on player page
  });

  // A second current record each for Alice and Bob, so they tie as the
  // holders of the most records; Bob's provisional record does not count.
  insertFreestyleRecord(db, {
    id: 'fr-alice-2', person_id: PERSON_ID, display_name: 'Alice Shredder', trick_name: 'Mobius',
    value_numeric: 5, confidence: 'probable',
  });
  insertFreestyleRecord(db, {
    id: 'fr-bob-2', person_id: FREESTYLE_PLAYER_ID, display_name: 'Bob Freestyler', trick_name: 'Blender',
    value_numeric: 7, confidence: 'probable',
  });

  // The Unique Fearless record over time: a provisional early step, a
  // superseded step, the standing record, and a disputed claim that is no step.
  insertFreestyleRecord(db, {
    id: 'fr-fearless-standing', display_name: 'Fearless Standing', trick_name: 'Unique Fearless',
    value_numeric: 25, confidence: 'probable', achieved_date: '2023-07-23',
  });
  insertFreestyleRecord(db, {
    id: 'fr-fearless-early', display_name: 'Fearless Early', trick_name: 'Unique Fearless',
    value_numeric: 19, confidence: 'provisional', achieved_date: '2005-06-01', date_precision: 'month',
  });
  insertFreestyleRecord(db, {
    id: 'fr-fearless-beaten', display_name: 'Fearless Beaten', trick_name: 'Unique Fearless',
    value_numeric: 22, confidence: 'probable', achieved_date: '2017-02-01',
    superseded_by: 'fr-fearless-standing',
  });
  insertFreestyleRecord(db, {
    id: 'fr-fearless-disputed', display_name: 'Fearless Disputed', trick_name: 'Unique Fearless',
    value_numeric: 30, confidence: 'disputed', achieved_date: '2020-01-01',
  });

  // ── Reference Media filter fixtures (trick page) ───────────────────────
  // Two media items tagged #ref-media-audit: one tutorial-tier
  // (source_id=tt_youtube), one record-tier (source_id=passback_records).
  // The service-layer filter must hide the record clip from Reference
  // Media; the tutorial must still render.
  const refMediaUploader = insertMember(db, { slug: 'ref-media-audit-uploader' });
  insertFreestyleTrick(db, {
    slug: 'ref-media-audit',
    canonical_name: 'Ref Media Audit',
    adds: '3',
  });
  insertTtLesson(db, {
    uploader_member_id: refMediaUploader,
    ttNumber: 901,
    trickSlug: 'ref-media-audit',
    videoId: 'audittutvid1',
    lessonTitle: 'Ref Media Audit Tutorial',
    source_id: 'tt_youtube',
    caption: 'REF_MEDIA_TUTORIAL_MARKER',
  });
  insertTtLesson(db, {
    uploader_member_id: refMediaUploader,
    ttNumber: 902,
    trickSlug: 'ref-media-audit',
    videoId: 'auditrecvid1',
    lessonTitle: 'Ref Media Audit Record',
    source_id: 'passback_records',
    caption: 'REF_MEDIA_RECORD_MARKER',
  });

  // ── Seeds for /freestyle/sets cross-link tests ─────────────────────────
  // The moves page resolves trick links by slugifying the displayed label
  // and matching strictly against freestyle_tricks.slug. Seed enough trick
  // slugs to cover at least one matching label per section, plus 'terraging'
  // to verify that compound labels (e.g. "Terraging (Double Pixie)") still
  // render as plain text — slugify yields "terraging-double-pixie", which
  // does NOT equal the seeded 'terraging' slug.
  for (const slug of [
    'pixie', 'fairy', 'stepping',                 // basic-set links
    'surging',                                    // spinning-variant link
    'blazing', 'pogo',                            // whirl/swirl link
    'ducking', 'spinning', 'gyro',                // components link
    'terraging',                                  // exists, but compound label stays plain
  ]) {
    insertFreestyleTrick(db, { slug, canonical_name: slug, adds: '3' });
  }

  // ── Seeds for O1a/O1b/O1c/O1d operational-notation rendering tests ────
  // Three tricks:
  //   - op-notation-seeded:        operational_notation populated; no source-note
  //   - op-notation-with-source:   operational_notation + source-note populated (O1d)
  //   - op-notation-empty:         neither populated (section must omit)
  // Op-notation string mirrors the post-normalization operational-notation
  // shape.
  insertFreestyleTrick(db, {
    slug: 'op-notation-seeded',
    canonical_name: 'op-notation-seeded',
    adds: '4',
    operational_notation: 'CLIP >> SAME OUT [DEX] > SAME OUT [DEX] > OP CLIP [DEL] [XBD]',
    // operational_notation_source intentionally omitted → null → source-note <p> must NOT render
  });
  insertFreestyleTrick(db, {
    slug: 'op-notation-with-source',
    canonical_name: 'op-notation-with-source',
    adds: '4',
    operational_notation: 'CLIP > OP IN [DEX] >> OP IN [DEX] [PDX] > OP TOE [DEL]',
    operational_notation_source: 'Source: FootbagMoves.com (curator-reviewed 2026-05-10). Demo source-note for O1d.',
  });
  insertFreestyleTrick(db, {
    slug: 'op-notation-empty',
    canonical_name: 'op-notation-empty',
    adds: '3',
    // operational_notation omitted → defaults to NULL → section must omit
  });

  // ── Seeds for the semantic-notation ladder tests ───────────────────────
  // Mobius has a curated equivalence chain (3 readings) AND curator notation.
  // Its notation names the structure rather than repeating the trick's own
  // name, which is the condition under which the notation block renders at
  // all; both layers then coexist on the page.
  insertFreestyleTrick(db, {
    slug: 'mobius',
    canonical_name: 'mobius',
    adds: '5',
    notation: 'GYRO TORQUE',
  });
  // Mirage is a core atom; needed for paradox-mirage's base lookup.
  insertFreestyleTrick(db, {
    slug: 'mirage',
    canonical_name: 'mirage',
    adds: '2',
  });
  // Butterfly is a core atom; tests Layer 4 silence (no semantic block).
  insertFreestyleTrick(db, {
    slug: 'butterfly',
    canonical_name: 'butterfly',
    adds: '2',
  });
  // paradox-mirage is non-core with a resolvable base; surfaces both a
  // chain reading AND the base_trick lineage.
  insertFreestyleTrick(db, {
    slug: 'paradox-mirage',
    canonical_name: 'paradox mirage',
    adds: '3',
    base_trick: 'mirage',
  });
  // ── Seeds for CANONICAL-SURFACE-REALIGNMENT-1 S2 + S3 tests ──────────
  // S2: canon-locked compound rows for ≡ chain readings (torque, blender,
  //     drifter all in freestyleSymbolicEquivalences.ts after S2).
  // S3: around-the-world + its 'atw' shorthand, held out of display as the
  //     committed alias overrides hold it (a technical alias, search only).
  insertFreestyleTrick(db, { slug: 'torque',   canonical_name: 'torque',   adds: '4', notation: 'TORQUE'   });
  insertFreestyleTrick(db, { slug: 'blender',  canonical_name: 'blender',  adds: '4', notation: 'BLENDER'  });
  insertFreestyleTrick(db, { slug: 'drifter',  canonical_name: 'drifter',  adds: '3', notation: 'DRIFTER'  });
  insertFreestyleTrick(db, { slug: 'around_the_world', canonical_name: 'around the world', adds: '2', notation: 'ATW' });
  insertFreestyleTrickAlias(db, 'atw', 'around_the_world', 'atw', { alias_type: 'technical', alias_display: 0 });

  // The operators and the placed modifiers the pages link, as the rebuild seeds them.
  seedStagedOperatorsAndModifiers(db);
  // paradox-mirage uses paradox, so Paradox has a page in the modifier view.
  insertFreestyleTrickModifierLink(db, 'paradox-mirage', 'paradox');

  // The landing's featured YouTube videos, stored as curated media under the
  // slots the featured strip reads.
  curatedRoot = createScratchDir('freestyle-routes-curated');
  const curatorId = insertMember(db, { is_system: 1, slug: 'fh-freestyle-routes' });
  for (const slot of [
    SITE_MEDIA_SLOTS.freestyle_circle,
    SITE_MEDIA_SLOTS.freestyle_sick_3,
    SITE_MEDIA_SLOTS.freestyle_shred_30,
    SITE_MEDIA_SLOTS.freestyle_reese_1988,
    SITE_MEDIA_SLOTS.freestyle_conlon_1998,
    SITE_MEDIA_SLOTS.freestyle_worlds_2023_team,
    SITE_MEDIA_SLOTS.freestyle_san_marino_2026,
  ]) {
    insertCuratorUrlReference(db, {
      uploaderMemberId: curatorId,
      curatedRoot,
      category: 'site_videos',
      primarySlug: 'featured',
      videoUrl: slot.videoUrl,
      videoPlatform: 'youtube',
      videoId: new URL(slot.videoUrl).searchParams.get('v')!,
      tags: ['#freestyle'],
    });
  }
  db.close();
  createApp = await importApp();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  removeScratch(curatedRoot);
});

// ---------------------------------------------------------------------------

describe('GET /freestyle', () => {
  it('returns 200 with page title', async () => {
    const res = await page('/freestyle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle Footbag');
  });

  it('contains a link to /freestyle/records', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('/freestyle/records');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/records', () => {
  // Defect caught: a row shows its stored timecode after the play symbol, so some
  // rows read as a bare number no visitor can interpret, or a screen reader gets
  // the symbol's name and no idea what the link opens.
  it('draws every Video cell as the play symbol alone, with a spoken form', async () => {
    const res = await page('/freestyle/records');
    const link = res.text.match(/<a href="https:\/\/youtu\.be\/pixie123abc"[^>]*>(.*?)<\/a>/s);
    expect(link).not.toBeNull();
    expect(link![1]).not.toContain('0:42');
    expect(link![1]).toMatch(/<span aria-hidden="true">▶<\/span>/);
    expect(link![1]).toMatch(/<span class="visually-hidden">[^<]*Bob Freestyler[^<]*Pixie[^<]*<\/span>/);
  });

  it('shows public probable records', async () => {
    const res = await page('/freestyle/records');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Torque');
    expect(res.text).toContain('Whirl');
  });

  it('shows the records without the recorded-versus-canonical ADD caveat', async () => {
    // The table carries an ADD column; the paragraph ranking that value
    // against the canonical ADD is page furniture.
    const res = await page('/freestyle/records');
    expect(res.text).toContain('<th class="col-adds">ADD</th>');
    expect(res.text).not.toContain('the canonical ADD is authoritative');
    expect(res.text).not.toContain('the recording source assigned');
  });

  // Defect caught: the pages that list freestyle records drift apart again,
  // one table ordering or naming its columns differently from another, so a
  // reader moving between them has to re-learn each table.
  it('draws every freestyle record table in one column order with one set of headers', async () => {
    const ORDER = ['Trick', 'Holder', 'Count', 'ADD', 'Date', 'Video', 'Status'];
    const headersOf = (html: string) => {
      const table = html.match(/<table class="data-table records-by-trick">\s*<thead>([\s\S]*?)<\/thead>/);
      expect(table, 'a freestyle record table').not.toBeNull();
      return [...table![1].matchAll(/<th[^>]*>([^<]+)<\/th>/g)].map(m => m[1]);
    };
    const pages = {
      records: headersOf((await page('/freestyle/records')).text),
      history: headersOf((await page(`/history/${PERSON_ID}`)).text),
      trick:   headersOf((await page('/freestyle/tricks/torque')).text),
    };
    expect(pages.records).toEqual(['Trick', 'Holder', 'Count', 'ADD', 'Date', 'Video']);
    expect(pages.history).toEqual(['Trick', 'Count', 'ADD', 'Date', 'Video']);
    expect(pages.trick).toEqual(['Holder', 'Count', 'Date', 'Video', 'Status']);
    for (const headers of Object.values(pages)) {
      expect(headers).toEqual(ORDER.filter(h => headers.includes(h)));
    }
  });

  it('links resolved person_id to /history/:personId', async () => {
    const res = await page('/freestyle/records');
    expect(res.text).toContain(`/history/${PERSON_ID}`);
    expect(res.text).toContain('Alice Shredder');
  });

  // The records table is wider than a phone; unless its scroll box takes keyboard
  // focus and has a name, a keyboard or screen-reader visitor cannot reach the
  // right-hand columns.
  it("puts a holder's freestyle records on their history page in a labelled, focusable scroll box", async () => {
    const res = await page(`/history/${PERSON_ID}`);
    expect(res.status).toBe(200);
    const box = res.text.match(/<div class="records-table-wrap" tabindex="0" role="region" aria-label="Freestyle Records">([\s\S]*?)<\/div>/);
    expect(box, 'labelled scroll box around the records table').not.toBeNull();
    expect(box![1]).toContain('Torque');
  });

  it('renders display_name as plain text when no person_id', async () => {
    const res = await page('/freestyle/records');
    expect(res.text).toContain('Unknown Player');
    // Should not be wrapped in an /history link
    expect(res.text).not.toContain('/history/null');
    expect(res.text).not.toContain('href="/history/"');
  });

  // Defect caught: a visitor on the freestyle records page has no way to reach
  // the official IFPA records, or the page carries a second intro line in the hero.
  it('opens with a link to the official records, ahead of the tables, and no hero subtitle', async () => {
    // The site navigation also links /consecutives, so look in the body's own
    // first paragraph, the one ahead of the record tables.
    const res = await page('/freestyle/records');
    const opening = res.text.match(/<div class="wrapper">\s*<p>([\s\S]*?)<\/p>/);
    expect(opening, 'the body opens with a paragraph').not.toBeNull();
    expect(opening![1]).toMatch(/<a href="\/consecutives">[^<]+<\/a>/);
    expect(res.text.indexOf(opening![0])).toBeLessThan(res.text.indexOf('<table'));
    expect(res.text).not.toContain('class="hero-subtitle"');
  });

  // Defect caught: the records page names the wrong leader, drops one of two
  // tied leaders, counts a provisional or superseded record, or leaves a link
  // to the leaders page the line replaces.
  it('names every holder tied for the most current records, linked, with their count', async () => {
    const res = await page('/freestyle/records');
    const line = res.text.match(/<p>([^<]*<a href="\/history\/[^"]+">[\s\S]*?)<\/p>/);
    expect(line, 'the leaders line').not.toBeNull();
    expect(line![1]).toContain(`<a href="/history/${PERSON_ID}">Alice Shredder</a>`);
    expect(line![1]).toContain(`<a href="/history/${FREESTYLE_PLAYER_ID}">Bob Freestyler</a>`);
    expect(line![1]).toMatch(/\b2\b/);
    expect(line![1]).not.toContain('Unknown Player');
    expect(line![1]).not.toContain('Hidden Player');
    expect(res.text).not.toContain('href="/freestyle/leaders"');
  });

  // Defect caught: the Fearless progression drops a step, reorders the years,
  // presents an unconfirmed step as a confirmed record, or counts a disputed
  // claim as a step; while the record table keeps showing only the standing one.
  it('shows the Fearless record over time, oldest first, each step labelled by its status', async () => {
    const res = await page('/freestyle/records');
    const section = res.text.match(/<section class="records-group">\s*<h2 class="section-heading">Unique Fearless Over the Years<\/h2>([\s\S]*?)<\/section>/);
    expect(section, 'the progression section').not.toBeNull();
    const steps = [...section![1].matchAll(/<li>([\s\S]*?)<\/li>/g)].map(m => m[1].trim());
    expect(steps).toEqual([
      '19 · Fearless Early · 2005 (provisional)',
      '22 · Fearless Beaten · 2017',
      '25 · Fearless Standing · 2023 (current record)',
    ]);
    const table = res.text.slice(0, res.text.indexOf(section![0]));
    expect(table).toContain('Fearless Standing');
    expect(table).not.toContain('Fearless Early');
    expect(table).not.toContain('Fearless Beaten');
    expect(res.text).not.toContain('Fearless Disputed');
  });

  // Defect caught: a record row shows its structured sort name, notation a
  // visitor cannot read, or an unresolved trick name becomes a broken link.
  it('shows each trick by its recorded name only, linking only a name that resolves', async () => {
    const res = await page('/freestyle/records');
    expect(res.text).toContain('href="/freestyle/tricks/torque"');
    expect(res.text).not.toContain('Gyro Whirl (op)');
    expect(res.text).toContain('<span class="trick-name">Whirl</span>');
    expect(res.text).not.toContain('href="/freestyle/tricks/whirl"');
  });

  it('does not show provisional records', async () => {
    const res = await page('/freestyle/records');
    expect(res.text).not.toContain('Hidden Player');
    expect(res.text).not.toContain('Secret Trick');
  });

  it('does not show superseded records', async () => {
    const res = await page('/freestyle/records');
    expect(res.text).not.toContain('Old Record Holder');
    // Value 30 could appear in other records, so check via holder name
  });

  it('shows video link when video_url is present', async () => {
    const res = await page('/freestyle/records');
    expect(res.text).toContain('https://youtu.be/abc123defgh');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/leaders', () => {
  // Defect caught: the retired leaders address still serves a page, or
  // redirects, when a retired route of this site gets the not-found page.
  it('is not found, and the records page that replaced it is', async () => {
    const res = await page('/freestyle/leaders');
    expect(res.status).toBe(404);
    expect((await page('/freestyle/records')).status).toBe(200);
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle — enriched landing page', () => {
  it('surfaces the records page', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('/freestyle/records');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/about', () => {
  it('returns 200 with page title', async () => {
    const res = await page('/freestyle/about');
    expect(res.status).toBe(200);
    expect(res.text).toContain('About Freestyle');
  });

  it('contains competition format content', async () => {
    const res = await page('/freestyle/about');
    expect(res.text).toContain('Routines');
    expect(res.text).toContain('30 Second Shred');
    expect(res.text).toContain('Sick 3');
    expect(res.text).toContain('Circle Contest');
    expect(res.text).toContain('a variety phase');
    expect(res.text).toContain('a density phase');
  });

  it('names the four routine judging axes as the rules score them, with variety inside composition', async () => {
    const res = await page('/freestyle/about');
    expect(res.text).toContain('composition (the variety and breadth of distinct');
    expect(res.text).not.toContain('variety (breadth of tricks');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/sets — the Historical Move-Set Reference section (Holden table)', () => {
  // ── cross-link moves → dictionary ───────────────────────────────
  // Strict rule: slugify(label) must exactly equal a public freestyle_tricks
  // slug. Compound labels and modifier-only matches stay plain text. Every
  // row carries a stable id="move-<slug>" anchor for future backlinking.

  it('renders trick-matched basic-set labels as anchors to /freestyle/tricks/:slug', async () => {
    const res = await page('/freestyle/sets');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<a href="/freestyle/tricks/pixie">Pixie</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/fairy">Fairy</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/stepping">Stepping</a>');
  });

  it('renders unmatched basic-set labels as plain text (no anchor)', async () => {
    const res = await page('/freestyle/sets');
    // Slapping, Bubba, Frantic, Flailing, Infracting are in the table but
    // not seeded as trick slugs — should render without /freestyle/tricks/ links.
    expect(res.text).not.toContain('/freestyle/tricks/slapping');
    expect(res.text).not.toContain('/freestyle/tricks/bubba');
    expect(res.text).not.toContain('/freestyle/tricks/frantic');
    expect(res.text).not.toContain('/freestyle/tricks/flailing');
  });

  it('keeps compound-label rows plain even when the bare slug exists', async () => {
    // 'terraging' IS seeded as a trick slug, but the row label is
    // "Terraging (Double Pixie)". slugify yields "terraging-double-pixie",
    // which does not match 'terraging' — so the row stays plain text under
    // the strict-match rule. No representative-link guess.
    const res = await page('/freestyle/sets');
    expect(res.text).toContain('Terraging (Double Pixie)');
    expect(res.text).not.toContain('/freestyle/tricks/terraging_double_pixie');
    expect(res.text).not.toMatch(/<a[^>]+href="\/freestyle\/tricks\/terraging"[^>]*>Terraging \(Double Pixie\)/);
  });

  it('keeps modifier-only labels plain (no link to hidden modifier surface)', async () => {
    const res = await page('/freestyle/sets');
    // Nuclear, Miraging, Blurry, Swirling, Whirling, Diving slugify to
    // freestyle_trick_modifiers slugs but NOT to freestyle_tricks slugs;
    // they must not render as /freestyle/tricks/* links and must not
    // expose any /freestyle/modifiers/* surface either.
    expect(res.text).not.toContain('/freestyle/tricks/nuclear');
    expect(res.text).not.toContain('/freestyle/tricks/miraging');
    expect(res.text).not.toContain('/freestyle/tricks/blurry');
    expect(res.text).not.toContain('/freestyle/tricks/swirling');
    expect(res.text).not.toContain('/freestyle/tricks/whirling');
    expect(res.text).not.toContain('/freestyle/tricks/diving');
    expect(res.text).not.toContain('/freestyle/modifiers/');
  });

  it('cross-links variant-tag list items where the label matches', async () => {
    const res = await page('/freestyle/sets');
    expect(res.text).toContain('<a href="/freestyle/tricks/surging">Surging</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/blazing">Blazing</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/pogo">Pogo</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/ducking">Ducking</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/spinning">Spinning</a>');
    expect(res.text).toContain('<a href="/freestyle/tricks/gyro">Gyro</a>');
  });

  it('emits stable move-<slug> anchor ids on every row and tag', async () => {
    const res = await page('/freestyle/sets');
    // Anchor-id derives from slugify(label) regardless of whether the row
    // links anywhere; this gives future trick-detail backlinking a stable
    // target without requiring a re-author pass on the moves page.
    expect(res.text).toContain('id="move-pixie"');
    expect(res.text).toContain('id="move-terraging_double_pixie"');
    expect(res.text).toContain('id="move-rooting_rooted"');
    expect(res.text).toContain('id="move-fairy_atomic"');
    expect(res.text).toContain('id="move-gogo"');
  });
});

// ---------------------------------------------------------------------------

describe('Freestyle landing — operators stay on their own page', () => {
  it('embeds no operator board on the landing', async () => {
    const res = await page('/freestyle');
    expect(res.text).not.toContain('class="operator-board ');
    expect(res.text).not.toContain('class="operator-board-footer-link"');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/operators — compact modifier index + advanced reference', () => {
  // The operators page is a compact, browseable index of the modifier
  // vocabulary (in the shared dict-trick-row idiom) with the advanced
  // decomposition reference retained below it via a shared sub-partial. No
  // modifier feel cards render on it.

  it('renders no feel cards or per-modifier reference on the compact index', async () => {
    const res = await page('/freestyle/operators');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('class="glossary-modifier-card"');
    // The per-modifier reference dl/grid does not render on the operators page.
    expect(res.text).not.toContain('id="intermediate-operators"');
    expect(res.text).not.toContain('id="set-modifiers-tier-1"');
    expect(res.text).not.toContain('class="glossary-intermediate-operators"');
  });

  // Defect caught: an operator's browse link points at an address the modifier
  // view does not render, so a reader following it lands on a 404 or on some
  // other modifier's page.
  it('cross-links a modifier to its own page in the dictionary modifier view', async () => {
    const res = await page('/freestyle/operators');
    expect(res.text).toContain('href="/freestyle/tricks?view=modifier&amp;modifier=paradox"');
    const target = await page('/freestyle/tricks?view=modifier&modifier=paradox');
    expect(target.status).toBe(200);
    const at = target.text.indexOf('id="modifier-paradox"');
    expect(at, 'the Paradox group renders').toBeGreaterThanOrEqual(0);
    expect(target.text.slice(at)).toContain('data-trick-slug="paradox-mirage"');
  });
});

describe('GET /freestyle/observational — observational-layer trick entries', () => {
  // Layer separation contract: observational entries never cross into
  // canonical surfaces; they surface only on this route. Cards are
  // visually distinct (no hashtag, no trick-detail link, observational
  // badge).

  it('returns 200 with page title', async () => {
    const res = await page('/freestyle/observational');
    expect(res.status).toBe(200);
    // The public label for the observational layer is "Emerging Vocabulary".
    expect(res.text).toContain('Emerging Vocabulary');
  });

  it('offers a back link to /freestyle', async () => {
    const res = await page('/freestyle/observational');
    expect(res.text).toContain('<a href="/freestyle" class="action-link">');
  });

  it('renders the observational layer note + canonical references', async () => {
    const res = await page('/freestyle/observational');
    expect(res.text).toContain('class="observational-layer-note"');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
  });

  it('canonical entries (assassin / big-apple / mantis) do NOT appear in the observational layer', async () => {
    // Layer-coexistence regression: these three slugs are canonical
    // (freestyle_tricks.slug), and their observational entries must
    // stay removed — the canonical-promotion process documented in the
    // content module's JSDoc says "move the row to inputs/
    // curated/tricks/<slug>.txt + re-run loader + REMOVE the
    // observational entry", and that third step is the easy one to skip.
    //
    // Layer separation contract requires:
    //   observational.folkSlug != canonical freestyle_tricks.slug
    //
    // This test fails if any future PR re-adds these entries to the
    // observational module.
    const res = await page('/freestyle/observational');
    // Check the card-name <h3> elements specifically, not the full
    // card region — observational readings legitimately reference
    // canonical tricks by name (e.g. Big Orange has reading
    // 'Rev. Big Apple'). The forever-invariant is that no card
    // *title* matches a canonicalized name.
    for (const canonicalized of ['Assassin', 'Big Apple', 'Mantis']) {
      const titlePattern = new RegExp(
        `class="observed-card-name"[^>]*>\\s*${canonicalized}\\s*<`,
        'i',
      );
      expect(res.text, `${canonicalized} card title appears in observational layer (should be canonical-only)`)
        .not.toMatch(titlePattern);
    }
  });

  // Defect caught: a card names its source by an internal code a visitor
  // cannot decode, or loses the per-source colour that tells sources apart.
  it('every card names its source in words and keeps its per-source badge class', async () => {
    const res = await page('/freestyle/observational');
    const badges = [...res.text.matchAll(
      /class="observed-card-source-badge observed-card-source-badge--(PB|FM|SG|FF|FB|MULTI|IFPA)"[^>]*>([^<]*)</g,
    )];
    expect(badges.length).toBeGreaterThanOrEqual(1);
    for (const [, code, text] of badges) {
      expect(text, `badge for ${code} shows the code`).not.toBe(code);
      expect(text!.trim().length, `badge for ${code} is empty`).toBeGreaterThan(2);
    }
    expect(res.text).toMatch(/observed-card-source-badge--PB/);
  });

  it('observational cards have NO hashtag chip (canonical-only convention)', async () => {
    // Identity-layer forever-invariant: observational entries never get
    // #-tag chips.
    const res = await page('/freestyle/observational');
    expect(res.text).not.toMatch(/<span[^>]*class="[^"]*hashtag[^"]*"[^>]*>#/);
  });

  it('observational cards have NO trick-detail href (no /freestyle/tricks/{folkSlug})', async () => {
    // Forever-invariant: observational entries never get a
    // /freestyle/tricks/{slug} route.
    const res = await page('/freestyle/observational');
    // Pull the observational card region (first observed-card-grid through
    // the observational-footer). Multiple grids exist (one per ADD
    // bucket); slicing from the first to the footer captures them all.
    const cardsStart = res.text.indexOf('class="observed-card-grid"');
    const footerStart = res.text.indexOf('class="observational-footer"');
    expect(cardsStart).toBeGreaterThan(0);
    const cardsRegion = res.text.slice(cardsStart, footerStart);
    // Inside the card region, no card links to /freestyle/tricks/blizzard
    // or any other folk slug. Sample covers seeds + Batch B expansion
    // (apostrophe-derived slugs, all-caps acronyms, multi-word).
    // Note: assassin / big-apple / mantis are NOT in this iteration —
    // they are canonical-only and absent from the observational module.
    for (const folkSlug of [
      'blizzard', 'blaze', 'bedwetter', 'sole-survivor',
      'anonymous', 'bladerunner', 'gdlo', 'gybas',
      'pandora-s-box', 'scorpion-s-tail', 'your-mom',
    ]) {
      expect(cardsRegion, `forbidden detail-page link for observational ${folkSlug}`)
        .not.toContain(`/freestyle/tricks/${folkSlug}`);
    }
  });

  it('observational entries do NOT appear on canonical /freestyle/tricks index', async () => {
    // The single most important forever-invariant: no canonical
    // cross-contamination. Folk slugs from the observational content
    // module must NEVER surface on /freestyle/tricks.
    const res = await page('/freestyle/tricks?view=add');
    expect(res.status).toBe(200);
    // None of the observational folk names appear as cards on the
    // canonical trick dictionary index. Sample drawn from original
    // seeds + Batch B expansion.
    for (const name of [
      // Observational-only names that must NOT appear on canonical surfaces.
      // 'Assassin' / 'Big Apple' / 'Mantis' are NOT in this list — they are
      // canonical and legitimately appear on those pages.
      'Blizzard', 'Blaze', 'Bedwetter', 'Sole Survivor',
      'Anonymous', 'Bladerunner', 'Flurricane', 'Locomotion', 'Your Mom',
    ]) {
      // Use a card-region match to avoid false positives from
      // descriptions / footnotes that happen to mention the word.
      const dictMatch = new RegExp(`class="dict-card[^"]*"[^>]*>[\\s\\S]{0,500}${name}`, 'i');
      expect(res.text, `observational ${name} leaked onto canonical /freestyle/tricks`)
        .not.toMatch(dictMatch);
    }
  });

  it('observational entries do NOT appear on /freestyle/operators', async () => {
    const res = await page('/freestyle/operators');
    for (const name of [
      // Observational-only names that must NOT appear on canonical surfaces.
      // 'Assassin' / 'Big Apple' / 'Mantis' are NOT in this list — they are
      // canonical and legitimately appear on those pages.
      'Blizzard', 'Blaze', 'Bedwetter', 'Sole Survivor',
      'Anonymous', 'Bladerunner', 'Flurricane', 'Locomotion', 'Your Mom',
    ]) {
      expect(res.text, `observational ${name} leaked onto /freestyle/operators`)
        .not.toContain(name);
    }
  });

  it('observational entries do NOT appear on landing /freestyle', async () => {
    const res = await page('/freestyle');
    for (const name of [
      // Observational-only names that must NOT appear on canonical surfaces.
      // 'Assassin' / 'Big Apple' / 'Mantis' are NOT in this list — they are
      // canonical and legitimately appear on those pages.
      'Blizzard', 'Blaze', 'Bedwetter', 'Sole Survivor',
      'Anonymous', 'Bladerunner', 'Flurricane', 'Locomotion', 'Your Mom',
    ]) {
      expect(res.text, `observational ${name} leaked onto landing`)
        .not.toContain(name);
    }
  });

  it('expansion-cohort entries with null proposedAddFormula render without the formula block', async () => {
    // Expansion-cohort contract: the 65 Batch B expansion entries set
    // proposedAddFormula=null. The template's {{#if proposedAddFormula}}
    // guard means the formula <code> block does not render for these
    // entries. Cards still render the proposedAddTotal where present.
    const res = await page('/freestyle/observational');
    // The expansion cohort still renders cards (count assertion in
    // earlier test). For null-formula entries, the formula <code>
    // block must NOT carry a placeholder marker like "null" or "TBD".
    expect(res.text).not.toMatch(/<code>null<\/code>/);
    expect(res.text).not.toMatch(/<code>undefined<\/code>/);
  });

  it('expansion-cohort entries with null proposedAddTotal omit the external-claim label entirely', async () => {
    // Entries with null proposedAddTotal (Ghost, Id, Johnny Vodka, Kiwi,
    // Monster, Rotor, Wauxspin, Bladerunner's merged form) have no
    // numeric claim from PassBack. After the ADD-bucket refactor the
    // external-claim label is null and the span simply does not render
    // (the template's {{#if externalClaimLabel}} guard suppresses it).
    const res = await page('/freestyle/observational');
    // No literal null leaks through
    expect(res.text).not.toMatch(/class="observed-card-external-claim"[^>]*>\s*null/);
    // No em-dash framing
    expect(res.text).not.toMatch(/—\s*ADD/);
  });

  it('a folk-layer entry is documented by name in the Folk / Unresolved archive', async () => {
    // The page is driven by the generated observational universe: folk
    // entries whose structure is not yet understood (Leaning Jowler) render
    // by name in the Folk / Unresolved full list. Proposed readings are
    // not rendered on this surface; they stay curator-internal until a
    // structural reading is adjudicated.
    const res = await page('/freestyle/observational');
    expect(res.text).toContain('Leaning Jowler');
  });
});

describe('GET /freestyle/operators — orientation lede', () => {
  it('links no dictionary view the dictionary does not offer', async () => {
    const res = await page('/freestyle/operators');
    expect(res.text).not.toMatch(/\/freestyle\/tricks\?view=(movement-system|topology|dex-count|component|category)/);
  });
});

describe('GET /freestyle/concepts — the operators page is the per-operator reference', () => {
  it('the Operators and Modifiers section sends readers to the operators page instead of restating each entry', async () => {
    const res = await page('/freestyle/concepts');
    const start = res.text.indexOf('id="section-modifiers"');
    const end = res.text.indexOf('id="section-notation"');
    expect(start).toBeGreaterThan(0);
    expect(end).toBeGreaterThan(start);
    const section = res.text.slice(start, end);
    expect(section).toContain('class="btn btn-outline" href="/freestyle/operators"');
    // No per-operator entry is rendered on Concepts any more.
    expect(res.text).not.toContain('id="intermediate-operators"');
    expect(res.text).not.toContain('class="glossary-modifier-card"');
  });
});

describe('GET /freestyle/glossary (A-to-Z term list)', () => {
  it('returns 200 with the Freestyle Glossary heading', async () => {
    const res = await page('/freestyle/glossary');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/<h1[^>]*>\s*Freestyle Glossary\s*<\/h1>/);
  });
});

describe('GET /freestyle/concepts', () => {
  it('returns 200 with page title', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle Concepts');
  });

  it('renders breadcrumb back to /freestyle', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('href="/freestyle"');
  });

  it('contains run-quality floor labels', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('Guiltless');
    expect(res.text).toContain('Fearless');
    expect(res.text).toContain('Tiltless');
    expect(res.text).toContain('Tripless');
  });

  it('contains run / combo / style vocabulary', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('Connector Trick');
    expect(res.text).toContain('Shred Circle');
    expect(res.text).toContain('Density');
  });

  it('does not expose review-status or source-discussion content', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).not.toContain('Pending Red');
    expect(res.text).not.toContain('Community-only');
    expect(res.text).not.toContain('review_status');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle — glossary link', () => {
  it('links to /freestyle/glossary on the landing page', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('/freestyle/glossary');
  });
});

// ---------------------------------------------------------------------------

describe('GET /freestyle/tricks/:slug', () => {
  it('returns 200 for a known trick slug', async () => {
    // 'Torque' was inserted in beforeAll with slug 'torque'
    const res = await page('/freestyle/tricks/torque');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Torque');
    expect(res.text).toContain('Alice Shredder');
  });

  it('links holder to /history/:personId', async () => {
    const res = await page('/freestyle/tricks/torque');
    expect(res.text).toContain(`/history/${PERSON_ID}`);
  });

  it('returns 404 for an unknown slug', async () => {
    const res = await page('/freestyle/tricks/not-a-real-trick');
    expect(res.status).toBe(404);
  });

  it('shows video link when present', async () => {
    const res = await page('/freestyle/tricks/torque');
    expect(res.text).toContain('https://youtu.be/abc123defgh');
  });

  // Defect caught: the trick page draws its records twice, the current record
  // in one table and again in a second, or lists a beaten record first or as
  // if it still stood.
  it('lists the records in one table, the current one first, a beaten one after it labelled earlier', async () => {
    // Torque: Alice Shredder's 42 stands; Old Record Holder's 30 was beaten by it.
    const res = await page('/freestyle/tricks/torque');
    expect(res.text.match(/<table class="data-table[" ]/g) ?? []).toHaveLength(1);
    const rows = [...res.text.matchAll(/<tr>\s*<td class="col-holder">([\s\S]*?)<\/tr>/g)].map(m => m[1]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toContain('Alice Shredder');
    expect(rows[0]).toMatch(/<td><\/td>\s*$/);
    expect(rows[1]).toContain('Old Record Holder');
    expect(rows[1]).toMatch(/<td>Earlier record<\/td>\s*$/);
  });

  // Defect caught: a trick whose only record still stands shows an earlier
  // label or a second table.
  it('labels nothing earlier for a trick whose only record stands', async () => {
    const res = await page('/freestyle/tricks/whirl');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('Earlier record');
    expect(res.text.match(/<table class="data-table[" ]/g) ?? []).toHaveLength(1);
  });

  it('shows records without the authority caveat, and ends the page on the two links alone', async () => {
    // Torque has records, so the records section renders. Its table carries the
    // recorded ADD column; the paragraph ranking that value against the canonical
    // ADD, and the footer's provenance and approximate-date sentences, are page
    // furniture the tables already convey.
    const res = await page('/freestyle/tricks/torque');
    expect(res.text).toContain('<h2>Consecutive Records</h2>');
    expect(res.text).not.toContain('the canonical ADD is authoritative');
    expect(res.text).not.toContain('Records sourced from documented freestyle video archives');
    expect(res.text).not.toContain('are confirmed only to the month or year');
    expect(res.text).toMatch(
      /<p class="source-note">\s*<a href="\/freestyle\/records">View all records<\/a>\s*&middot;\s*<a href="\/freestyle\/tricks">Trick Dictionary<\/a>\s*<\/p>/,
    );
  });
});

// ---------------------------------------------------------------------------

describe('records page trick links', () => {
  it('links trick names to /freestyle/tricks/:slug on records page', async () => {
    const res = await page('/freestyle/records');
    expect(res.text).toContain('/freestyle/tricks/torque');
  });
});

// ---------------------------------------------------------------------------

describe('GET /history/:personId — freestyle records section', () => {
  it('shows freestyle records section for a player with records', async () => {
    const res = await page(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Freestyle Records');
    expect(res.text).toContain('Pixie');
    expect(res.text).toContain('55');
  });

  // Defect caught: the player page shows a timecode the records page dropped, so
  // one record's video link reads differently depending on the page.
  it('shows the video link on the player freestyle section without its timecode', async () => {
    const res = await page(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.text).toContain('https://youtu.be/pixie123abc');
    expect(res.text).not.toContain('0:42');
  });

  it('does not show provisional records on player page', async () => {
    const res = await page(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.text).not.toContain('Hidden Trick');
  });

  it('includes link to /freestyle/records from player freestyle section', async () => {
    const res = await page(`/history/${FREESTYLE_PLAYER_ID}`);
    expect(res.text).toContain('/freestyle/records');
  });
});

// ---------------------------------------------------------------------------
// Reference Media filter — passback_records source must NOT render in the
// trick page's Reference Media section. Records still render via the records
// table (separate surface). Filter lives in freestyleService.getFreestyleTrickPage.

describe('GET /freestyle/tricks/:slug — Reference Media filter', () => {
  it('renders a Media section that links to the trick gallery, not inline clips', async () => {
    const res = await page('/freestyle/tricks/ref-media-audit');
    expect(res.status).toBe(200);
    // The gallery link beside the hashtag opens the trick's full gallery
    // (locked-context convention).
    expect(res.text).toContain('<a class="action-link" href="/media/browse?context&#x3D;ref-media-audit">');
    // No reference media is embedded on the trick page anymore: neither
    // tutorial- nor record-tier clips, and no Tutorials/Demonstrations subsections.
    expect(res.text).not.toContain('REF_MEDIA_TUTORIAL_MARKER');
    expect(res.text).not.toContain('REF_MEDIA_RECORD_MARKER');
    expect(res.text).not.toContain('reference-media-subsection');
    expect(res.text).not.toMatch(/<h3 class="reference-media-subheading">/);
  });

});

// ─────────────────────────────────────────────────────────────────────────
// O1a — operational notation rendering surface on trick-detail.
// New "Set notation (operational)" section between semantic Notation and the
// Notation grammar diagnostic. Section is conditional on the trick row's
// freestyle_tricks.operational_notation column being non-empty. O1a renders
// the string verbatim inside <code> with no token highlighting (deferred to
// O1b).
// ─────────────────────────────────────────────────────────────────────────

describe('GET /freestyle/tricks/:slug — operational notation block (O1a)', () => {
  it('renders the section with role-classified token spans (O1b/O1c — refined per-token tooltips)', async () => {
    const res = await page('/freestyle/tricks/op-notation-seeded');
    expect(res.status).toBe(200);
    // Operational tokens render in their own Execution notation section
    // (operational-notation-display class preserved), only for non-first-class
    // tricks (the trick-notation-summary card carries the compact JOB row on
    // first-class pages). This fixture has notation=null, so only the Execution
    // notation section renders (no Movement notation section).
    expect(res.text).toContain('operational-notation-display');
    expect(res.text).toContain('<h2>Execution notation</h2>');
    // O1b: each token rendered as a span with role class. O1c refined the
    // per-token tooltips (e.g. CLIP gets "Clipper-stall surface (...)" not
    // the generic "Plant or landing surface").
    expect(res.text).toMatch(/<span class="op-token op-token--surface" data-role="surface" title="CLIP: clipper set position \(start of trick\)">CLIP<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--sequence-op-major" data-role="sequence_op"[^>]*>&gt;&gt;<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side"[^>]*>SAME<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--direction" data-role="direction"[^>]*>OUT<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--component-flag component-flag-dex" data-role="component_flag" title="Dexterity component \(bag-foot interaction\)">\[DEX\]<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--component-flag component-flag-xbd" data-role="component_flag"[^>]*>\[XBD\]<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--component-flag component-flag-del" data-role="component_flag"[^>]*>\[DEL\]<\/span>/);
  });

  it('omits the section entirely when operational_notation is null', async () => {
    const res = await page('/freestyle/tricks/op-notation-empty');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('operational-notation-display');
    expect(res.text).not.toContain('JOB notation');
  });

  it('places the operational section between Notation and the structural-decomposition diagnostic', async () => {
    const res = await page('/freestyle/tricks/op-notation-seeded');
    // Find the indices in the rendered HTML; assert ordering Notation < operational < diagnostic.
    // The semantic Notation section may not render for this fixture (notation column
    // is null), so we use the operational section's position relative to a known later
    // section ("Editorial decomposition" / "Structural decomposition") as the lower bound.
    const opIdx     = res.text.indexOf('operational-notation-display');
    const editIdx   = res.text.indexOf('editorial-decomposition');
    const structIdx = res.text.indexOf('notation-grammar-panel');
    // Operational MUST appear; at least one of editorial/structural may follow.
    expect(opIdx).toBeGreaterThan(-1);
    if (editIdx > -1) expect(opIdx).toBeLessThan(editIdx);
    if (structIdx > -1) expect(opIdx).toBeLessThan(structIdx);
  });

  it('renders the notation Concepts deeplink below the notation block', async () => {
    const res = await page('/freestyle/tricks/op-notation-seeded');
    expect(res.text).toContain('class="notation-glossary-link"');
    // Anchored on the pairing a visitor relies on, the control's visible label
    // and where it resolves to. The deeplink targets the Freestyle Concepts
    // notation section anchor, which must exist on that page (a missing anchor
    // lands at the page top).
    expect(res.text).toMatch(
      /<a[^>]*href="\/freestyle\/concepts#section-notation"[^>]*>\s*How to read this notation\s*<\/a>/,
    );
  });

  it('uses the refined per-token tooltip for OP (O1c)', async () => {
    const res = await page('/freestyle/tricks/op-notation-seeded');
    // The per-token tooltip states the component-relative SAME/OP meaning:
    // each side reads against the most recent side-bearing component, not a
    // fixed plant foot.
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side" title="OP \(operational\): opposite leg from the most recent side-bearing component">OP<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--side" data-role="side" title="SAME \(operational\): same leg as the most recent side-bearing component">SAME<\/span>/);
    expect(res.text).toMatch(/<span class="op-token op-token--surface" data-role="surface" title="CLIP: clipper set position \(start of trick\)">CLIP<\/span>/);
  });

  it('never renders source-provenance prose, even when operational_notation_source is populated', async () => {
    // Source provenance is curator-internal metadata, not public detail-card
    // copy: the Execution notation block must never surface it.
    const res = await page('/freestyle/tricks/op-notation-with-source');
    expect(res.status).toBe(200);
    // The operational/Execution notation block still renders its tokens.
    expect(res.text).toContain('operational-notation-display');
    // But the provenance line and its text never reach the page.
    expect(res.text).not.toContain('class="operational-notation-source-note"');
    expect(res.text).not.toContain('Source: FootbagMoves.com');
  });

  it('omits the source-note element when operational_notation_source is null', async () => {
    const res = await page('/freestyle/tricks/op-notation-seeded');
    expect(res.status).toBe(200);
    expect(res.text).toContain('operational-notation-display');
    expect(res.text).not.toContain('class="operational-notation-source-note"');
  });

  it('places the Token-reference link directly after the token block (no source-note between)', async () => {
    const res = await page('/freestyle/tricks/op-notation-with-source');
    const tokensIdx  = res.text.indexOf('class="operational-notation-tokens"');
    const linkIdx    = res.text.indexOf('class="notation-glossary-link"');
    expect(tokensIdx).toBeGreaterThan(-1);
    expect(linkIdx).toBeGreaterThan(tokensIdx);
    expect(res.text).not.toContain('class="operational-notation-source-note"');
  });
});

describe('Freestyle Concepts and history — anchor preservation + cross-link contracts', () => {
  it('keeps the ADD-accounting and run-quality anchors other pages link into', async () => {
    // The ADD Analysis page, the trick dictionary and the history narrative
    // link #section-add-accounting; the run-quality ladder keeps #run-quality.
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('id="section-add-accounting"');
    expect(res.text).toContain('id="run-quality"');
  });

  it('ADD Accounting section cross-links to combo-analysis for run-level vocabulary', async () => {
    // ADD Accounting is §8 with
    // dedicated subsections + worked examples. The cross-link to
    // combo-analysis for run-quality / format vocabulary is preserved
    // at the section footer.
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('href="/freestyle/combo-analysis"');
    // §10 Run Architecture is the explicit anchor section for run-
    // level material; its cross-link to combo-analysis must also exist.
    expect(res.text).toContain('id="section-run-architecture"');
  });

  it('history page links to the ADD analysis page as its difficulty evidence', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/add-analysis"');
    // The narrative history page does not route readers through a run-quality anchor.
    expect(res.text).not.toContain('/freestyle/combo-analysis#run-quality');
    expect(res.text).not.toContain('/freestyle/glossary#run-quality');
    expect(res.text).not.toContain('/freestyle/concepts#run-quality');
  });

  it('history page links to the whirl family page and the operators reference', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/families/whirl"');
    expect(res.text).toContain('href="/freestyle/operators"');
    expect(res.text).not.toContain('href="/freestyle/tricks?view=movement-system"');
  });

  it('Concepts source-families list keeps the legacy citations as prose, never a live footbag.org hyperlink', async () => {
    // The legacy footbag.org site goes dark at cutover, so the sources list
    // names it as a citation without linking to it; the surviving outbound
    // reference site stays hyperlinked.
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('<strong>Footbag.org</strong>');
    expect(res.text).toContain('historical per-trick move list');
    expect(res.text).not.toContain('href="https://www.footbag.org');
    expect(res.text).toContain('href="https://www.footbagmoves.com/"');
  });

  it('Concepts surviving outbound links carry rel="noopener noreferrer" + target="_blank"', async () => {
    const res = await page('/freestyle/concepts');
    // Each verified outbound URL should appear with both attributes.
    const checks = [
      'https://www.footbagmoves.com/',
    ];
    for (const url of checks) {
      const idx = res.text.indexOf(`href="${url}"`);
      expect(idx, `Missing outbound link: ${url}`).toBeGreaterThan(0);
      // Read 200 chars around the anchor opening; both attributes must be present.
      const slice = res.text.slice(Math.max(0, idx - 100), idx + 200);
      expect(slice).toMatch(/target="_blank"/);
      expect(slice).toMatch(/rel="noopener noreferrer"/);
    }
  });

  it('a request for the removed category view renders the default ADD view', async () => {
    // The category view is gone; an inbound link to it still returns 200 and
    // lands on the default view rather than a retirement notice.
    const res = await page('/freestyle/tricks?view=category');
    expect(res.status).toBe(200);
    expect(res.text).toMatch(/class="trick-view-toggle-active">By ADD</);
    expect(res.text).not.toContain('retirement-notice');
    expect(res.text).not.toMatch(/This view is being retired/);
    expect(res.text).not.toMatch(/Grouped by grammatical role/);
  });
});

describe('Freestyle Concepts framing paragraphs + history page contracts', () => {
  // The Concepts chapters carry framing prose that must keep rendering:
  //   §6 compositional layering opening + evolved-ADD-value annotation
  //   §5 whirl network-attractor note
  //   §10 anchor IDs (Sick3 / Shred:30 / BOP and run-quality tiers)
  //   §10 additive-structural-accounting framing
  //   §7 operator-notation framing paragraph
  //   §12 "About this reference" closing
  //
  // The history assertions here now cover the narrative History page (thesis,
  // the composition and structure sections, the institutions, and the onward
  // links); the earlier condensed-history assertions were retired with that page.

  it('neither Concepts nor History claims new tricks stopped appearing after the vocabulary matured', async () => {
    for (const path of ['/freestyle/concepts', '/freestyle/history']) {
      const res = await page(path);
      expect(res.status, path).toBe(200);
      expect(res.text, path).not.toMatch(/no (genuinely )?new base tricks/i);
      expect(res.text, path).not.toMatch(/vocabulary stabilized/i);
    }
  });

  it('whirl family card does not present an unsupported network / most-documented claim', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).not.toMatch(/most documented two-trick/);
    expect(res.text).not.toMatch(/22 years of Sick3/);
    expect(res.text).not.toMatch(/most common opening element/);
  });

  it('Concepts keeps internal/developer jargon out of user-facing prose', async () => {
    // Public-facing prose hygiene: registry names, sprint/ruling refs, and
    // internal tooling words must not leak onto the rendered Concepts page.
    const res = await page('/freestyle/concepts');
    expect(res.text).not.toMatch(/MODIFIER_COMPOSITIONS/);
    expect(res.text).not.toMatch(/\bpt8\b/);
    expect(res.text).not.toMatch(/Red pt\d/);
    expect(res.text).not.toMatch(/[Ww]orkbook/);
  });

  it('Concepts §7 carries the operator-notation framing paragraph', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('glossary-operator-notation-framing');
    expect(res.text).toMatch(/compact symbolic shorthand for trick\s+composition/);
    // Worked paradox example with op-tokens.
    expect(res.text).toMatch(/CLIP/);
    expect(res.text).toMatch(/OP IN/);
  });

  it('combo-analysis page carries anchor IDs on each run-quality tier + format term', async () => {
    // /freestyle/combo-analysis is the canonical home for run-level
    // vocabulary, so these anchors live there rather than on the
    // Concepts page. The combo-analysis route-test file also covers these;
    // the assertion here pins the canonical-home contract.
    const res = await page('/freestyle/combo-analysis');
    const ids = [
      'run-quality-tiltless', 'run-quality-guiltless', 'run-quality-tripless',
      'run-quality-fearless', 'run-quality-beastly', 'run-quality-godly',
      'run-quality-genuine', 'run-quality-bop',
      'format-sick3', 'format-shred-30',
    ];
    for (const id of ids) {
      expect(res.text, `Missing anchor id: ${id}`).toContain(`id="${id}"`);
    }
  });

  it('Concepts §14 Sources carries the "About this reference" framing paragraph', async () => {
    // The framing is a single sentence. The .glossary-about-framing
    // hook + the "footbag community built informally" attribution are
    // preserved for inbound deep-links + community-attribution semantics.
    const res = await page('/freestyle/concepts');
    expect(res.text).toContain('glossary-about-framing');
    expect(res.text).toMatch(/footbag community built informally/);
  });

  it('history page opens with the thesis and the language framing', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('class="history-thesis"');
    expect(res.text).toMatch(/expanded the shared vocabulary/);
    expect(res.text).toMatch(/Freestyle footbag is a language/);
    // The prior two-phase framing is fully replaced by the narrative page.
    expect(res.text).not.toContain('The Two-Phase Story');
  });

  it('history page frames difficulty as a moving ceiling counted in ADD, never equating ADD with execution difficulty', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('id="difficulty"');
    expect(res.text).toMatch(/Difficulty became a moving ceiling/);
    expect(res.text).toMatch(/counts recognized trick components in ADD/);
    expect(res.text).toMatch(/equal ADD does not imply equal execution difficulty/);
    expect(res.text).not.toContain('history-add-system-decomposition-note');
  });

  it('history page explains the vocabulary expanding by composition', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('id="vocabulary"');
    expect(res.text).toMatch(/expanded by composition/);
    expect(res.text).toMatch(/the most productive operators/);
    expect(res.text).not.toContain('history-combo-architecture-note');
  });

  it('history page ends on the naming to notation to classification arc', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('id="this-encyclopedia"');
    expect(res.text).toMatch(/This encyclopedia is the latest step/);
    const vocabIdx = res.text.indexOf('id="vocabulary"');
    const endIdx   = res.text.indexOf('id="this-encyclopedia"');
    expect(vocabIdx).toBeGreaterThan(0);
    expect(endIdx).toBeGreaterThan(vocabIdx);
    expect(res.text).not.toContain('Movement Language as the Modern Vocabulary');
  });

  it('history page links onward to the learning path, dictionary, glossary, and Freestyle Concepts', async () => {
    const res = await page('/freestyle/history');
    expect(res.text).toContain('href="/freestyle/start#next-steps"');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('href="/freestyle/concepts"');
  });
});

describe('Formula accountability contracts', () => {
  // Five related contracts:
  //   1. Landing Core Tricks carry editorial atom readings (see portal test)
  //   2. Dictionary cleanup — spyro filtered, illusion alias suppressed, ATW atom-labeled
  //   3. ADD Analysis derivation lines
  //   4. Paradox formula visibility — §3 + connective panel + ADD Analysis
  //   5. Worlds 2023 Team Freestyle attribution

  it('dictionary surface does NOT include spyro (Formula Accountability retire)', async () => {
    // spyro's stored kind is modifier, so it is filtered out of every browse
    // view regardless of which 1-ADD rows the test fixture happens to seed.
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/data-trick-slug="spyro"/);
    expect(res.text).not.toContain('href="/freestyle/tricks/spyro"');
  });

  it('dictionary does NOT surface the "outside-in mirage" misleading reading anywhere', async () => {
    // surfaceOnBrowse:false on the illusion alias-governance entry
    // suppresses the misleading reading from compact browse cards.
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/outside-in mirage/);
  });

  it('foundational atom cards on the dictionary surface render silently when no chain/notation present', async () => {
    // 2-tier notation hierarchy contract: tier 1 (tokenized equivalences)
    // or tier 2 (op-notation) render the formula slot; otherwise the slot
    // is silent. The card carries title + ADD chip (and any side affordances
    // like media chip / pending-decomposition pill); no "core atom — X"
    // prose, no .dict-card-equivalence--core-atom class. The pendingDecomposition
    // pill (curator-authored via freestyleUnresolvedCompounds.ts) is the only
    // honest "pending" surface; "core atom" implementation language never
    // leaks to public.
    const res = await page('/freestyle/tricks?view=add');
    for (const slug of ['mirage', 'butterfly']) {
      const idx = res.text.indexOf(`data-trick-slug="${slug}"`);
      expect(idx, `${slug} card not found in dictionary`).toBeGreaterThan(0);
      const cardEnd = res.text.indexOf('</article>', idx);
      const card = res.text.slice(idx, cardEnd);
      // Two-line row still renders; title + line-2 ADD slot present.
      expect(card).toContain('dict-trick-row-title');
      expect(card).toContain('dict-trick-row-add');
      // "core atom" prose + class do NOT render to public surfaces.
      expect(card, `${slug} card must not render "core atom" prose`).not.toMatch(/core atom/);
      expect(card).not.toContain('dict-card-equivalence--core-atom');
    }
  });

  it('ADD Analysis worked examples render a Derivation line on every entry', async () => {
    // Handlebars escapes `=` to `&#x3D;` by default, so regex patterns
    // accept either form across the derivation strings.
    //
    // The foundational examples use the explicit primitive-decomposition
    // style (stall / dex / xbody), so spot-checks assert the primitive
    // forms, not shorthand like "mirage(2) = 2 ADD".
    const eq = '(?:=|&#x3D;)';
    const res = await page('/freestyle/add-analysis');
    expect(res.status).toBe(200);
    const derivationMatches = res.text.match(/class="add-analysis-derivation-line"/g) ?? [];
    expect(derivationMatches.length).toBe(FREESTYLE_ADD_ANALYSIS_CONTENT.workedExamples.length);
    // Spot-check the formulaic content (entity-tolerant).
    expect(res.text).toMatch(new RegExp(`stall\\(1\\)\\s*${eq}\\s*1 ADD`));         // toe-stall
    expect(res.text).toMatch(new RegExp(`dex\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*2 ADD`));    // mirage
    expect(res.text).toMatch(new RegExp(`xbody\\(1\\)\\s*\\+\\s*dex\\(1\\)\\s*\\+\\s*stall\\(1\\)\\s*${eq}\\s*3 ADD`)); // whirl
    expect(res.text).toMatch(new RegExp(`atomic\\(\\+1\\)\\s*\\+\\s*mirage\\(2\\)\\s*\\+\\s*xdex\\(\\+1\\)\\s*${eq}\\s*4 ADD`));
    expect(res.text).toMatch(new RegExp(`gyro\\(\\+1\\)\\s*\\+\\s*torque\\(4\\)\\s*${eq}\\s*5 ADD`));
  });

  it('ADD Analysis surfaces paradox notation as the entry-topology case', async () => {
    const res = await page('/freestyle/add-analysis');
    // CLIP > OP IN [DEX] is still surfaced, but framed as paradox's entry case
    // (a side-switch that can also occur mid-trick), not paradox in every form.
    expect(res.text).toMatch(/as an entry it reads CLIP &gt; OP IN \[DEX\]/);
    expect(res.text).toMatch(/later mid-trick \[PDX\] dex/);
    expect(res.text).not.toContain('Paradox itself reads as PDX');
  });

  it('Worlds 2023 Team Freestyle featured caption carries Scott Davidson + Tuan Vu attribution', async () => {
    const res = await page('/freestyle');
    const captionMatch = res.text.match(/<p class="featured-caption[^"]*">[^<]*<\/p>/g) ?? [];
    const worldsCaption = captionMatch.find(c => /Scott Davidson|Tuan Vu/.test(c));
    expect(worldsCaption, 'Worlds 2023 caption attribution missing').toBeDefined();
    expect(worldsCaption).toMatch(/Scott Davidson/);
    expect(worldsCaption).toMatch(/Tuan Vu/);
  });

  it('landing core-trick equivalences use NONE of the retired misleading aliases', async () => {
    // ATW (uppercase shorthand) and "outside-in mirage" stay forbidden
    // — both follow the retired misleading-alias
    // pattern. The "reverse around-the-world" string is a
    // legitimate orbit-card reading (curator-confirmed alias mapping)
    // and is not
    // guarded out here; that single use case is asserted positively in
    // the foundational-formula test below.
    const res = await page('/freestyle');
    const gridStart = res.text.indexOf('class="freestyle-core-trick-grid"');
    const gridEnd   = res.text.indexOf('core-trick-footnote', gridStart);
    const slice = res.text.slice(gridStart, gridEnd);
    expect(slice).not.toMatch(/<p class="core-trick-equivalence">[\s\S]{0,100}ATW/);
    expect(slice).not.toMatch(/<p class="core-trick-equivalence">[\s\S]{0,100}outside-in mirage/);
  });
});

// ---------------------------------------------------------------------------
// Landing + Freestyle Concepts stabilization invariants

describe('Freestyle IA realignment — landing and Concepts contract', () => {
  it('landing retires the "Glossary, Dictionary, and Notation — three layers" framing', async () => {
    const res = await page('/freestyle');
    expect(res.text).not.toContain('Glossary, Dictionary, and Notation');
    expect(res.text).not.toContain('Three reference layers');
    expect(res.text).not.toContain('The Freestyle Reference');
  });

  it('landing surfaces Trick Dictionary + Glossary + Freestyle Concepts + Set Encyclopedia via the Language banner', async () => {
    const res = await page('/freestyle');
    // The retired top-reference-jump band must be gone.
    expect(res.text).not.toContain('class="freestyle-top-reference-jump"');
    expect(res.text).not.toMatch(/<a class="freestyle-top-reference-link"/);
    // Reachable via the Language banner tiles.
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).toContain('href="/freestyle/glossary"');
    expect(res.text).toContain('href="/freestyle/concepts"');
    expect(res.text).toContain('href="/freestyle/sets"');
    expect(res.text).not.toContain('Where to go next');
  });

  it('landing surfaces a single dictionary link, not multiple browse CTAs', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('href="/freestyle/tricks"');
    expect(res.text).not.toMatch(/Browse by component\s*&rarr;/);
    expect(res.text).not.toMatch(/>Browse tricks\s*&rarr;/);
  });

  it('Concepts retires the "Glossary, Dictionary, and Notation — three layers" heading', async () => {
    const res = await page('/freestyle/concepts');
    expect(res.text).not.toContain('Glossary, Dictionary, and Notation');
    expect(res.text).not.toContain('three complementary layers');
  });

  it('the family sentence links the dictionary family view', async () => {
    const res = await page('/freestyle/concepts');
    const familiesAt = res.text.indexOf('id="section-families"');
    expect(familiesAt).toBeGreaterThan(0);
    expect(res.text.slice(familiesAt, familiesAt + 300)).toContain('href="/freestyle/tricks?view=family"');
  });
});

// ---------------------------------------------------------------------------
// Landing-page "Language of Freestyle Footbag" structure invariants

describe('Freestyle landing — portal IA', () => {
  it('exposes the freestyle-portal-lede intro content-section', async () => {
    // Structural invariant: the landing renders the lede surface with the
    // documented class hooks. Copy is not pinned by this test.
    const res = await page('/freestyle');
    expect(res.text).toMatch(/class="content-section freestyle-portal-lede"/);
    expect(res.text).toMatch(/class="freestyle-portal-lede-paragraph"/);
  });

  it('retires the legacy single-featured-video block in favor of the Demonstrations strip', async () => {
    // The standalone `freestyle-featured-video` block was retired; San Marino
    // is one of two hardcoded curated entries inside the demonstrations grid.
    // The legacy class must stay gone.
    const res = await page('/freestyle');
    expect(res.text).not.toContain('class="freestyle-featured-video"');
  });
});

// Basic Components + Core Tricks landing-grid contracts
// retired. The rich grids do not render on /freestyle; the two-band
// landing carries Start Here / Go Deeper portal
// cards. The component + core-trick content lives canonically on the
// Freestyle Concepts page and the trick dictionary.

describe('Landing — legacy landing grids retired', () => {
  it('Basic Components grid does NOT render on /freestyle', async () => {
    const res = await page('/freestyle');
    expect(res.text).not.toContain('class="freestyle-basic-components-grid"');
    expect(res.text).not.toContain('class="freestyle-component-card"');
    expect(res.text).not.toContain('id="component-dex"');
  });

  it('Core Tricks grid does NOT render on /freestyle', async () => {
    const res = await page('/freestyle');
    expect(res.text).not.toContain('class="freestyle-core-trick-grid"');
    expect(res.text).not.toContain('class="core-trick-object"');
    expect(res.text).not.toContain('id="core-trick-whirl"');
    expect(res.text).not.toContain('id="core-trick-mirage"');
  });
});

describe('Freestyle landing — Featured strip', () => {
  // Competition Formats +
  // Demonstrations render as one compact `Featured` strip. Format names
  // (Circle / Sick 3 / Shred 30) are the card titles; curated
  // demonstrations follow as exemplars. Empty array hides section content.
  it('renders the Featured heading + grid', async () => {
    const res = await page('/freestyle');
    expect(res.text).toMatch(/class="[^"]*\bfreestyle-featured\b/);
    expect(res.text).toMatch(/class="freestyle-featured-grid"/);
  });

  it('renders every competition-format name as a card title', async () => {
    const res = await page('/freestyle');
    expect(res.text).toMatch(/>Circle</);
    expect(res.text).toMatch(/>Sick 3</);
    expect(res.text).toMatch(/>Shred 30</);
  });

  it('renders both curated demonstration entries (Conlon 1998 + San Marino 2026)', async () => {
    const res = await page('/freestyle');
    expect(res.text).toContain('id="featured-conlon-1998"');
    expect(res.text).toContain('id="featured-san-marino-2026"');
  });

  it('drops the retired five-slot demonstration scaffolding and pending copy', async () => {
    const res = await page('/freestyle');
    for (const key of ['sam-conlon', 'classic-circle', 'artistic-routine', 'modern-technical-shred', 'educationally-readable-run']) {
      expect(res.text).not.toContain(`id="demonstration-${key}"`);
    }
    expect(res.text).not.toContain('Curated demonstration pending');
    // The retired separate sections must not survive.
    expect(res.text).not.toContain('class="freestyle-demonstrations-grid"');
    expect(res.text).not.toContain('>Competition Formats<');
  });
});

describe('Freestyle dictionary — ADD view two-line row styling', () => {
  it('dict-trick-row-title elements render on the ADD view', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/class="dict-trick-row-title"/);
  });

  it('dict-trick-row-add (line-2 ADD slot) elements render on the ADD view', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/class="dict-trick-row-add"/);
  });

  it('the ADD view renders the dict-trick-row wrapper (not the shared card)', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).toMatch(/class="dict-trick-row[^"]*"/);
    expect(res.text).not.toContain('dict-card-stack');
  });
});

// ---------------------------------------------------------------------------
// CANONICAL-SURFACE-REALIGNMENT-1 — S1 + S3 + S2

describe('Freestyle dictionary — S1+S3: ≡ equivalence rendering on dict cards', () => {
  it('legacy "aliases:" row is retired across the dictionary surface', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).not.toMatch(/class="dict-card-aliases"/);
    expect(res.text).not.toMatch(/<span class="dict-card-aliases-label">/);
  });

  it('no browse row carries a ≡ chain reading', async () => {
    const res = await page('/freestyle/tricks/4');
    expect(res.text).toContain('data-trick-slug="torque"');
    expect(res.text).not.toMatch(/class="dict-trick-row-interpretation"/);
    expect(res.text).not.toMatch(/class="core-trick-equiv-sigil"/);
  });
});

describe('Freestyle dictionary — S2: held chain readings (drifter)', () => {
  it('holds drifter\'s decomposition: no miraging reading rendered', async () => {
    // "miraging clipper" is legacy mirage-family shorthand held for curator
    // review; drifter renders no ≡ reading rather than teach the nickname.
    const res = await page('/freestyle/tricks/3');
    const idx = res.text.indexOf('data-trick-slug="drifter"');
    expect(idx).toBeGreaterThan(-1);
    const next = res.text.indexOf('data-trick-slug=', idx + 1);
    const win = res.text.substring(idx, next > -1 ? next : idx + 4000);
    expect(win).not.toMatch(/miraging/);
  });
});

describe('Freestyle dictionary — S3: alias-governance allow-list filtering', () => {
  it('filters out orthographic-only alias rows (legover ≡ leg-over hidden)', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('leg over');
  });

  it('filters out alias rows suppressed pending doctrine resolution (osis ≡ frigidosis hidden)', async () => {
    const res = await page('/freestyle/tricks?view=add');
    expect(res.text).not.toContain('frigidosis');
  });

  it('filters out different-trick alias rows (swirl ≡ reverse swirl hidden)', async () => {
    const res = await page('/freestyle/tricks?view=add');
    // 'reverse swirl' as an alias of swirl should NOT appear as an ≡ reading.
    // (If reverse-swirl exists as its own canonical row, that's a different
    // surface; this assertion only checks the alias-row pathway.)
    expect(res.text).not.toMatch(/class="core-trick-equivalence[^"]*"[^>]*>[\s\S]{0,40}reverse swirl/);
  });

  it('atom dictionary rows surface curator-authored op-notation via the two-line JOB slot', async () => {
    // Atoms (first-class) carry their curator JOB chain on line 2 of the
    // two-line row (dict-trick-row-notation-value), sourced from firstClassChainValue,
    // including the (midtime) marker. No shared-card op-notation chip.
    const res = await page('/freestyle/tricks?view=add');
    const atwIdx = res.text.indexOf('data-trick-slug="around_the_world"');
    expect(atwIdx).toBeGreaterThan(0);
    const atwCardEnd = res.text.indexOf('</article>', atwIdx);
    const atwCard = res.text.slice(atwIdx, atwCardEnd);
    // No shared-card op-notation chip.
    expect(atwCard).not.toMatch(/<code class="dict-card-notation/);
    // Line-2 JOB slot carries the resolved symbolic chain.
    expect(atwCard).toMatch(/class="dict-trick-row-notation-value"/);
    expect(atwCard).toMatch(/class="dict-trick-row-notation-value">[\s\S]*?TOE[\s\S]*?\[DEX\]/);
  });
});
