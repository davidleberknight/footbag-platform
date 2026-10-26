/**
 * Integration tests for the Consecutives section page, which carries the
 * official IFPA consecutive kicks records.
 *
 * Covers:
 *   GET /consecutives — what consecutives is, its competitions, and the records
 *
 * Verifies:
 *   - orientation prose comes before the first records table
 *   - world records section renders
 *   - highest scores section renders with grouped subsections
 *   - progression section renders
 *   - milestone section renders
 *   - player names and scores appear correctly
 *   - notes are said once under a table, not in a mostly empty column
 *   - freestyle passback records are neither shown nor linked
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import request from 'supertest';
import { cachedGet } from '../fixtures/cachedGet';

import {
  setTestEnv,
  createTestDb,
  cleanupTestDb,
  importApp,
} from '../fixtures/testDb';
import {
  insertConsecutiveKicksRecord,
  insertCuratorVideo,
  insertFreestyleRecord,
  insertMember,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3090');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;
const page = cachedGet(() => createApp());

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Official World Record row
  insertConsecutiveKicksRecord(db, {
    sort_order: 402,
    section:    'Official World Records',
    subsection: 'Current Official World Records',
    discipline: 'Open Singles',
    player_1:   'Ted Martin',
    player_2:   null,
    score:      63326,
    note:       'Open Singles World Record',
    event_date: '14/6/1997',
    event_name: '1997 Midwest Regional Footbag Championships',
    location:   'Lions Park, Mount Prospect, Illinois',
  });

  // Official World Record — doubles
  insertConsecutiveKicksRecord(db, {
    sort_order: 406,
    section:    'Official World Records',
    subsection: 'Current Official World Records',
    discipline: 'Open Doubles',
    player_1:   'Gary Lautt',
    player_2:   'Tricia George',
    score:      132011,
    note:       'Open Doubles World Record',
    event_date: '1998-03-21/1998-03-22',
    event_name: '1998 Chico Challenge',
    location:   'Lia Way Rec Center, Chico, California',
  });

  // A world record with no event, date or place recorded.
  insertConsecutiveKicksRecord(db, {
    sort_order: 408,
    section:    'Official World Records',
    subsection: 'Current Official World Records',
    discipline: 'Open Doubles One-Pass',
    player_1:   'Andy Linder',
    player_2:   'Ted Martin',
    score:      1001,
  });

  // Highest Official Score row
  insertConsecutiveKicksRecord(db, {
    sort_order: 101,
    section:    'Highest Official Scores',
    subsection: 'Singles Consecutive 20000+ Club',
    discipline: 'Open Singles',
    rank:       1,
    player_1:   'Ted Martin',
    player_2:   null,
    score:      63326,
    note:       'Open World Record',
  });

  // Another highest score (different player, Women's)
  insertConsecutiveKicksRecord(db, {
    sort_order: 105,
    section:    'Highest Official Scores',
    subsection: 'Singles Consecutive 20000+ Club',
    discipline: "Women's Singles",
    rank:       5,
    player_1:   'Constance Constable',
    player_2:   null,
    score:      24713,
    note:       "Women's World Record",
  });

  // Progression row
  insertConsecutiveKicksRecord(db, {
    sort_order: 518,
    section:    'World Record Progression',
    subsection: 'Open Singles Consecutive',
    discipline: 'Open Singles',
    year:       '1997',
    player_1:   'Ted Martin',
    player_2:   null,
    score:      63326,
  });

  // Milestone row
  insertConsecutiveKicksRecord(db, {
    sort_order: 1307,
    section:    'Milestone Firsts',
    subsection: 'Singles milestone first',
    discipline: 'Open Singles',
    player_1:   'Ted Martin',
    player_2:   null,
    score:      40000,
  });

  // A progression where two runs were ended on purpose and one was not: the
  // real data carries that fact as a note on six of 77 progression rows.
  insertConsecutiveKicksRecord(db, {
    sort_order: 601, section: 'World Record Progression', subsection: 'Open Doubles Consecutive',
    discipline: 'Open Doubles', year: '1985', player_1: 'Jim Caveney', player_2: 'Gary Lautt',
    score: 33333, note: 'Intentionally ended on that number',
  });
  insertConsecutiveKicksRecord(db, {
    sort_order: 602, section: 'World Record Progression', subsection: 'Open Doubles Consecutive',
    discipline: 'Open Doubles', year: '1987', player_1: 'Ted Martin', player_2: 'Andy Linder',
    score: 64792,
  });
  insertConsecutiveKicksRecord(db, {
    sort_order: 603, section: 'World Record Progression', subsection: 'Open Doubles Consecutive',
    discipline: 'Open Doubles', year: '1988', player_1: 'Jim Caveney', player_2: 'Gary Lautt',
    score: 75000, note: 'Intentionally ended on that number',
  });

  // A milestone row with no count: the real data's one such row exists only to
  // carry its note.
  insertConsecutiveKicksRecord(db, {
    sort_order: 1310, section: 'Milestone Firsts', subsection: 'Singles milestone first',
    discipline: "Women's Singles", player_1: 'Tricia George', player_2: null, score: null,
    note: 'Tricia George was the first woman to reach each singles milestone through 20000',
  });

  // A public passback record: a freestyle record, not an official IFPA record.
  insertFreestyleRecord(db, { display_name: 'Passback Holder', trick_name: 'Passback Trick', achieved_date: '2009-04-12' });

  // The featured clip, seeded the way the curator seed loads a site media slot.
  const fhId = insertMember(db, { is_system: 1, slug: 'fh-consecutives' });
  insertCuratorVideo(db, {
    uploaderMemberId: fhId,
    sourceFilename: 'demo-consecutives.mp4',
    slotTag: '#demo_consecutives',
    caption: 'Demonstration of timed consecutives',
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /consecutives', () => {
  it('shows Ted Martin world record with score', async () => {
    const res = await page('/consecutives');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ted Martin');
    expect(res.text).toContain('63,326');
  });

  // Defect caught: a newcomer meets a wall of tables before being told what
  // consecutives is.
  it('explains what consecutives is before the first records table', async () => {
    const res = await page('/consecutives');
    const explainer = res.text.indexOf('id="what-are-consecutives"');
    const firstTable = res.text.indexOf('<table');
    expect(explainer).toBeGreaterThan(-1);
    expect(firstTable).toBeGreaterThan(explainer);
  });

  // Defect caught: the featured clip goes missing, drifts back up into the
  // explainer instead of sitting just above the world records, or the upright
  // clip is forced into the landscape frame and cropped to a strip.
  it('shows the featured clip in a portrait frame just above the world records', async () => {
    const res = await page('/consecutives');
    const competitions = res.text.match(/<section class="content-section" id="competitions">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(competitions).toContain('<figure class="demo-video demo-video--portrait">');
    expect(competitions).toMatch(/\/media-store\/[^"]+-video\.mp4/);
    expect(competitions).toContain('<figcaption>Demonstration of timed consecutives</figcaption>');
    const explainer = res.text.match(/<section class="content-section" id="what-are-consecutives">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(explainer).toContain('<h2>');
    expect(explainer).not.toContain('class="demo-video');
    const clip = res.text.indexOf('class="demo-video');
    const worldRecords = res.text.indexOf('id="world-records"');
    expect(worldRecords).toBeGreaterThan(clip);
  });

  // Defect caught: the section's artwork goes missing from the hero, where the
  // net, freestyle and other sport section landings carry theirs.
  it('carries the consecutives mascot in the hero', async () => {
    const res = await page('/consecutives');
    const hero = res.text.slice(res.text.indexOf('<div class="hero hero-sm hero-with-mascot">'), res.text.indexOf('id="what-are-consecutives"'));
    expect(hero).toContain('class="hero-mascot" src="/img/consecutives-mascot.svg');
    // And beside the explainer heading, as the other sport section pages show theirs.
    const explainer = res.text.match(/<section class="content-section" id="what-are-consecutives">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(explainer).toMatch(/<img class="sport-section-icon" src="\/img\/consecutives-mascot\.svg/);
  });

  // Defect caught: the world records go back to a six-column table that runs
  // wide on a laptop and scrolls sideways on a phone, instead of one card per
  // record carrying its record type, holder, count and where and when.
  it('shows each world record as a card', async () => {
    const res = await page('/consecutives');
    const section = res.text.match(/<section class="content-section" id="world-records">[\s\S]*?<\/section>/)?.[0] ?? '';
    expect(section).not.toContain('<table');
    const cards = section.match(/<div class="card card-static" role="listitem">[\s\S]*?<\/div>\s*<\/div>/g) ?? [];
    expect(cards).toHaveLength(3);
    const singles = cards.find((c) => c.includes('<h3 class="card-title">Open Singles</h3>')) ?? '';
    expect(singles).toContain('Ted Martin');
    expect(singles).toContain('<p class="fw-600">63,326 kicks</p>');
    expect(singles).toContain('<span>1997 Midwest Regional Footbag Championships</span>');
    expect(singles).toContain('<span>Lions Park, Mount Prospect, Illinois</span>');
  });

  // Defect caught: a record with no event, date or place still draws an empty
  // metadata line, leaving a gap at the foot of its card.
  it('draws no where-and-when line for a record that has none', async () => {
    const res = await page('/consecutives');
    const section = res.text.match(/<section class="content-section" id="world-records">[\s\S]*?<\/section>/)?.[0] ?? '';
    const onePass = section.match(/<h3 class="card-title">Open Doubles One-Pass<\/h3>[\s\S]*?<\/div>/)?.[0] ?? '';
    expect(onePass).toContain('1,001 kicks');
    expect(onePass).not.toContain('card-meta');
  });

  it('highlights the Consecutives entry in the main nav as active', async () => {
    const res = await page('/consecutives');
    expect(res.text).toMatch(/<a href="\/consecutives" class="active">Consecutives<\/a>/);
  });

  // Defect caught: a sanctioning claim with no source in the records data
  // returns to the page, naming a body nobody has confirmed sanctioned them.
  it('makes no sanctioning claim the records data does not support', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('Ted Martin');
    expect(res.text).not.toMatch(/sanctioned by/i);
  });

  it('shows doubles holders joined with &', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('Gary Lautt');
    expect(res.text).toContain('Tricia George');
    expect(res.text).toContain('132,011');
  });

  // The card title can only come from the record's type; a blank title
  // means the stored record type never reached the view.
  it('titles each world record card with its record type', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('<h3 class="card-title">Open Doubles</h3>');
  });

  it('renders a multi-day event date as a human-readable range, not the raw value', async () => {
    const res = await page('/consecutives');
    // The doubles WR spans two days (stored raw as "1998-03-21/1998-03-22").
    expect(res.text).toContain('21–22 March 1998');
    expect(res.text).not.toContain('1998-03-21/1998-03-22');
  });

  it('renders a legacy slash date unambiguously, so the table has one date convention', async () => {
    const res = await page('/consecutives');
    // The singles WR is stored as "14/6/1997", which a reader cannot tell from a
    // month-first date; the page states the month instead.
    expect(res.text).toContain('14 June 1997');
    expect(res.text).not.toContain('14/6/1997');
  });

  it('shows Highest Official Scores section', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('Singles Consecutive 20000+ Club');
  });

  it('shows Constance Constable in scores list', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('Constance Constable');
    expect(res.text).toContain('24,713');
  });

  it('shows World Record Progression section', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('Open Singles Consecutive');
  });

  // The year also appears in the event name and the full date elsewhere on
  // the page, so the assertion is on the year cell itself.
  it('shows year column in progression table', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('<td class="col-year">1997</td>');
  });

  it('shows Milestone Firsts section', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain('Singles milestone first');
  });

  // Defect caught: a note column empty in most rows comes back, or the fact it
  // carried for a few rows is lost when the column goes.
  it('names the runs ended on purpose once under their progression, with no note column', async () => {
    const res = await page('/consecutives');
    expect(res.text).not.toContain('<th>Note</th>');
    expect(res.text).toContain('<p class="mt-2">The runs of 33,333 and 75,000 were stopped on purpose.</p>');
    // The run that was not ended on purpose stays out of the sentence.
    expect(res.text).not.toMatch(/64,792[^<]*stopped on purpose/);
  });

  // Defect caught: a milestone row with no count renders as an empty-milestone
  // row, or its note disappears with the note column.
  it('turns a milestone row with no count into a sentence under the milestones', async () => {
    const res = await page('/consecutives');
    expect(res.text).toContain(
      '<p class="mt-2">Tricia George was the first woman to reach each singles milestone through 20000.</p>',
    );
    expect(res.text).not.toContain('<td class="col-num">—</td>');
  });

  // Defect caught: freestyle passback records, which are not official IFPA
  // records, reappear on the official records page or are pointed at from it.
  it('neither shows nor links the freestyle passback records', async () => {
    const res = await page('/consecutives');
    expect(res.text).not.toContain('Passback Holder');
    expect(res.text).not.toContain('href="/freestyle/records"');
  });

  it('returns 503 (not 500) when a records read hits database contention', async () => {
    // Every read on this page maps SQLITE_BUSY/LOCKED to the 503 page via
    // runSqliteRead, so the alarm classifies contention as unavailability
    // rather than an application fault.
    const dbMod = await import('../../src/db/db');
    const spy = vi.spyOn(dbMod.consecutiveKicksRecords, 'listWorldRecords', 'get').mockReturnValue({
      all: () => {
        const e = new Error('database is locked') as Error & { code?: string };
        e.code = 'SQLITE_BUSY';
        throw e;
      },
    } as never);
    try {
      const res = await request(createApp()).get('/consecutives');
      expect(res.status).toBe(503);
      // Contention clears on its own, so the response tells a caller when to retry.
      expect(res.headers['retry-after']).toBe('30');
    } finally {
      spy.mockRestore();
    }
  });
});
