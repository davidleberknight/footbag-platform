/**
 * A record table shows its trick's ADD from the dictionary.
 *
 * A record's source can score its trick differently from the dictionary:
 * PassBack counts Bladerunner's atomic twice and reports 5 where the
 * dictionary, the authority on ADD, holds 4. The record keeps the figure its
 * source reported, but the records page and the trick's own page show the
 * dictionary's ADD so a reader never sees two values for one trick. A record
 * whose trick is not in the dictionary, or whose identity is under curator
 * review, shows the figure it was filed with.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertFreestyleTrick, insertFreestyleRecord } from '../fixtures/factories';

const { dbPath } = setTestEnv('3494');

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertFreestyleTrick(db, {
    slug: 'bladerunner', canonical_name: 'bladerunner', adds: '4',
    base_trick: 'eggbeater', category: 'compound',
  });
  insertFreestyleRecord(db, {
    trick_name: 'Bladerunner', adds_count: 5, display_name: 'Dictionary Holder', value_numeric: 40,
  });
  insertFreestyleRecord(db, {
    trick_name: 'Unlisted Move', adds_count: 7, display_name: 'Unlisted Holder', value_numeric: 30,
  });
  insertFreestyleRecord(db, {
    trick_name: 'Bladerunner', adds_count: 6, display_name: 'Review Holder', value_numeric: 20,
    curator_review_note: 'Which trick this run was is under review.',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

/** The ADD cell of the table row that names the given holder. */
function addsCellFor(html: string, holder: string): string | null {
  const row = html.split('<tr').find(chunk => chunk.includes(holder));
  return row?.match(/class="col-adds">\s*([^<\s]+)\s*</)?.[1] ?? null;
}

describe('record tables show the dictionary ADD', () => {
  // Defect caught: the records page lists Bladerunner at 5, the source's
  // figure, while the trick's own page says it is 4 ADD.
  it('the records page shows the trick ADD, not the source figure', async () => {
    const res = await request(createApp()).get('/freestyle/records');
    expect(res.status).toBe(200);
    expect(addsCellFor(res.text, 'Dictionary Holder')).toBe('4');
  });

  // Defect caught: the trick's own page states 4 ADD at the top and 5 in the
  // record row beneath it.
  it('the trick page shows its own ADD in its record table', async () => {
    const res = await request(createApp()).get('/freestyle/tricks/bladerunner');
    expect(res.status).toBe(200);
    expect(addsCellFor(res.text, 'Dictionary Holder')).toBe('4');
  });

  // Defect caught: a record whose trick has no dictionary row loses the only
  // ADD anyone recorded for it.
  it('keeps the filed figure when the trick is not in the dictionary', async () => {
    const res = await request(createApp()).get('/freestyle/records');
    expect(addsCellFor(res.text, 'Unlisted Holder')).toBe('7');
  });

  // Defect caught: a record whose identity is under review is shown with the
  // ADD of a trick it may turn out not to be.
  it('keeps the filed figure while the record is under curator review', async () => {
    const res = await request(createApp()).get('/freestyle/records');
    expect(addsCellFor(res.text, 'Review Holder')).toBe('6');
  });
});
