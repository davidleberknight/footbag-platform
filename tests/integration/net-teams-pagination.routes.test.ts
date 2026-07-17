/**
 * Server-side pagination of the Net Teams directory, filtered and unfiltered.
 * The filter is applied before pagination, the displayed total is the filtered
 * unique-team total, page nav uses the filtered universe and preserves the
 * filter, out-of-range pages clamp to the last page, empty results are a
 * controlled state, and no page ever renders more than the page size.
 *
 * Fifty-five teams are seeded into one division (open_doubles) so the page
 * boundary (50) is crossed for both the unfiltered and the filtered views.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember, insertEvent, insertDiscipline, insertResultsUpload, insertResultEntry,
  insertHistoricalPerson, insertNetTeam, insertNetTeamAppearance,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3106');
const TEAM_COUNT = 55; // > one page of 50

let createApp: Awaited<ReturnType<typeof importApp>>;

beforeAll(async () => {
  const db = createTestDb(dbPath);

  const member = insertMember(db, { id: 'net-pg-member', slug: 'net_pg_member' });
  const event = insertEvent(db, { title: 'Net Pagination Cup', status: 'published', start_date: '2012-06-01' });
  const disc = insertDiscipline(db, event, { id: 'disc-net-pg', name: 'Open Doubles Net', discipline_category: 'net', team_type: 'doubles' });
  db.prepare(`
    INSERT INTO net_discipline_group (discipline_id, canonical_group, match_method, review_needed, conflict_flag, mapped_at, mapped_by)
    VALUES (?, 'open_doubles', 'exact', 0, 0, '2025-01-01T00:00:00.000Z', 'test')
  `).run(disc);
  const upload = insertResultsUpload(db, event, member);

  for (let i = 0; i < TEAM_COUNT; i++) {
    const n = String(i).padStart(4, '0');
    const pa = insertHistoricalPerson(db, { person_id: `pg-a-${n}`, person_name: `Alpha ${n}` });
    const pb = insertHistoricalPerson(db, { person_id: `pg-b-${n}`, person_name: `Beta ${n}` });
    const team = insertNetTeam(db, { team_id: `pg-team-${n}`, person_id_a: pa, person_id_b: pb, appearance_count: 1 });
    // Distinct result-entry placement per team (unique on event+discipline+placement).
    const entry = insertResultEntry(db, event, upload, disc, { id: `pg-entry-${n}`, placement: i + 1 });
    insertNetTeamAppearance(db, { team_id: team, event_id: event, discipline_id: disc, result_entry_id: entry, placement: 2, event_year: 2012, evidence_class: 'canonical_only' });
  }

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// Count rendered team rows via the body rank cell that every row carries (the
// header uses <th class="col-rank">, so match the <td> form only).
const rowCount = (html: string): number => (html.match(/<td class="col-rank">/g) ?? []).length;

describe('GET /net/teams — unfiltered pagination', () => {
  it('page 1 shows one page of rows, the true total, and a Next link only', async () => {
    const res = await request(await createApp()).get('/net/teams');
    expect(res.status).toBe(200);
    expect(rowCount(res.text)).toBe(50);
    expect(res.text).toContain(`${TEAM_COUNT} teams`);
    expect(res.text).toContain('Page 1 of 2');
    expect(res.text).toContain('rel="next"');
    expect(res.text).not.toContain('rel="prev"');
    // Row numbers start at 1.
    expect(res.text).toMatch(/class="col-rank">1</);
  });

  it('page 2 shows the remainder with continued row numbers and a Prev link only', async () => {
    const res = await request(await createApp()).get('/net/teams?page=2');
    expect(rowCount(res.text)).toBe(TEAM_COUNT - 50);
    expect(res.text).toContain('Page 2 of 2');
    expect(res.text).toContain('rel="prev"');
    expect(res.text).not.toContain('rel="next"');
    expect(res.text).toMatch(/class="col-rank">51</); // numbering continues, not reset
  });
});

describe('GET /net/teams — filtered pagination', () => {
  it('paginates a filtered result with the filtered total and page count', async () => {
    const res = await request(await createApp()).get('/net/teams?division=open_doubles');
    expect(res.status).toBe(200);
    expect(rowCount(res.text)).toBe(50);            // never more than the page size
    expect(res.text).toContain(`${TEAM_COUNT} teams`); // filtered unique-team total
    expect(res.text).toContain('Page 1 of 2');
  });

  it('retains the division filter across page navigation', async () => {
    const res = await request(await createApp()).get('/net/teams?division=open_doubles');
    // Handlebars escapes = to &#x3D; and & to &amp; in the rendered href.
    expect(res.text).toContain('/net/teams?division&#x3D;open_doubles&amp;page&#x3D;2');
  });

  it('filtered page 2 continues numbering and links Prev back with the filter', async () => {
    const res = await request(await createApp()).get('/net/teams?division=open_doubles&page=2');
    expect(rowCount(res.text)).toBe(TEAM_COUNT - 50);
    expect(res.text).toContain('<td class="col-rank">51<');
    expect(res.text).toContain('href="/net/teams?division&#x3D;open_doubles"'); // Prev to filtered page 1
  });

  it('clamps an out-of-range filtered page to the last page', async () => {
    const res = await request(await createApp()).get('/net/teams?division=open_doubles&page=999');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Page 2 of 2');
    expect(rowCount(res.text)).toBe(TEAM_COUNT - 50);
  });

  it('returns a controlled empty state for a filter that matches nothing', async () => {
    const res = await request(await createApp()).get('/net/teams?q=zzznotarealplayer');
    expect(res.status).toBe(200);
    expect(rowCount(res.text)).toBe(0);
    expect(res.text).toContain('0 teams');
    expect(res.text).toContain('No teams found');
  });
});
