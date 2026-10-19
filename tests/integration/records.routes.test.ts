/**
 * Integration tests for the consecutive kicks records public route.
 *
 * Covers:
 *   GET /records — consecutive kicks records page
 *
 * Verifies:
 *   - world records section renders
 *   - highest scores section renders with grouped subsections
 *   - progression section renders
 *   - milestone section renders
 *   - player names and scores appear correctly
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
import { insertConsecutiveKicksRecord, insertFreestyleRecord } from '../fixtures/factories';
import { recordCuratorReviewNote } from '../../src/content/freestyleRecordCuratorReview';

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

  // Passback records, one per shape the passback table renders differently: a
  // name under curator review beside one that is not, and an achieved date at
  // each precision plus a pre-1970 placeholder.
  insertFreestyleRecord(db, { display_name: 'Review Holder', trick_name: 'Double Whip', achieved_date: '2015-03-03' });
  insertFreestyleRecord(db, { display_name: 'Day Holder', trick_name: 'Day Trick', achieved_date: '2009-04-12', date_precision: 'day' });
  insertFreestyleRecord(db, { display_name: 'Month Holder', trick_name: 'Month Trick', achieved_date: '2010-06-01', date_precision: 'month' });
  insertFreestyleRecord(db, { display_name: 'Year Holder', trick_name: 'Year Trick', achieved_date: '2011-01-01', date_precision: 'year' });
  insertFreestyleRecord(db, { display_name: 'Approx Holder', trick_name: 'Approx Trick', achieved_date: '2012-08-15', date_precision: 'approximate' });
  insertFreestyleRecord(db, { display_name: 'Placeholder Holder', trick_name: 'Placeholder Trick', achieved_date: '1905-07-03' });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The one table row naming this holder, so an assertion reads that record alone. */
function passbackRow(html: string, holder: string): string {
  const rows = html.match(/<tr>[\s\S]*?<\/tr>/g) ?? [];
  const matching = rows.filter((r) => r.includes(holder));
  expect(matching, `exactly one row for ${holder}`).toHaveLength(1);
  return matching[0];
}

// ---------------------------------------------------------------------------

describe('GET /records', () => {
  it('shows Ted Martin world record with score', async () => {
    const res = await page('/records');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Ted Martin');
    expect(res.text).toContain('63,326');
  });

  it('shows doubles holders joined with &', async () => {
    const res = await page('/records');
    expect(res.text).toContain('Gary Lautt');
    expect(res.text).toContain('Tricia George');
    expect(res.text).toContain('132,011');
  });

  // The world-records table has no note column, so this cell can only come from
  // the row's discipline; a blank cell means the stored discipline never reached
  // the view.
  it('shows each world record row with its discipline', async () => {
    const res = await page('/records');
    expect(res.text).toContain('<td>Open Doubles</td>');
  });

  it('renders a multi-day event date as a human-readable range, not the raw value', async () => {
    const res = await page('/records');
    // The doubles WR spans two days (stored raw as "1998-03-21/1998-03-22").
    expect(res.text).toContain('21–22 March 1998');
    expect(res.text).not.toContain('1998-03-21/1998-03-22');
  });

  it('renders a legacy slash date unambiguously, so the table has one date convention', async () => {
    const res = await page('/records');
    // The singles WR is stored as "14/6/1997", which a reader cannot tell from a
    // month-first date; the page states the month instead.
    expect(res.text).toContain('14 June 1997');
    expect(res.text).not.toContain('14/6/1997');
  });

  it('shows Highest Official Scores section', async () => {
    const res = await page('/records');
    expect(res.text).toContain('Singles Consecutive 20000+ Club');
  });

  it('shows Constance Constable in scores list', async () => {
    const res = await page('/records');
    expect(res.text).toContain('Constance Constable');
    expect(res.text).toContain('24,713');
  });

  it('shows World Record Progression section', async () => {
    const res = await page('/records');
    expect(res.text).toContain('Open Singles Consecutive');
  });

  // The year also appears in the event name and the full date elsewhere on
  // the page, so the assertion is on the year cell itself.
  it('shows year column in progression table', async () => {
    const res = await page('/records');
    expect(res.text).toContain('<td class="col-year">1997</td>');
  });

  it('shows Milestone Firsts section', async () => {
    const res = await page('/records');
    expect(res.text).toContain('Singles milestone first');
  });

  // Defect caught: a passback record whose name is under curator review reads on
  // /records as settled, though the freestyle records page flags it.
  it('flags a passback record under curator review with its note, and only that record', async () => {
    const res = await page('/records');
    const reviewed = passbackRow(res.text, 'Review Holder');
    expect(reviewed).toContain('Needs curator review');
    expect(reviewed).toContain(recordCuratorReviewNote('Double Whip'));
    expect(passbackRow(res.text, 'Day Holder')).not.toContain('Needs curator review');
    // The flag is explained once above the table whenever a flagged record is listed.
    expect(res.text).toContain('are valid historical records whose name does not yet map');
  });

  // Defect caught: a date known only to the month or year is shown with a day
  // nobody recorded, an estimate loses its marker, or a placeholder year before
  // footbag existed is shown as a real date.
  it('shows each achieved date only as precisely as it is known', async () => {
    const res = await page('/records');
    expect(passbackRow(res.text, 'Day Holder')).toContain('12 April 2009');
    const month = passbackRow(res.text, 'Month Holder');
    expect(month).toContain('June 2010');
    expect(month).not.toContain('1 June 2010');
    expect(month).not.toContain('approx.');
    const year = passbackRow(res.text, 'Year Holder');
    expect(year).toMatch(/<td>\s*2011\s*<\/td>/);
    expect(year).not.toContain('approx.');
    expect(passbackRow(res.text, 'Approx Holder')).toContain('15 August 2012 <em>(approx.)</em>');
    const placeholder = passbackRow(res.text, 'Placeholder Holder');
    expect(placeholder).not.toContain('1905');
    expect(placeholder).toContain('&mdash;');
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
      const res = await request(createApp()).get('/records');
      expect(res.status).toBe(503);
      // Contention clears on its own, so the response tells a caller when to retry.
      expect(res.headers['retry-after']).toBe('30');
    } finally {
      spy.mockRestore();
    }
  });
});
