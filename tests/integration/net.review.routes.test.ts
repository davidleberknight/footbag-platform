/**
 * Integration tests for the internal net review / QC page.
 *
 * Covers:
 *   GET /internal/net/review              — unfiltered review page
 *   GET /internal/net/review?reason=...   — filtered by reason_code
 *   GET /internal/net/review?priority=... — filtered by priority
 *   GET /internal/net/review?status=...   — filtered by resolution_status
 *   GET /internal/net/review?event=...    — filtered by event_id (with context)
 *
 * Verifies:
 *   - 200 response
 *   - Summary counts render correctly
 *   - Filter controls render with correct selected values
 *   - Review items table shows filtered subset
 *   - Event context banner renders when event filter is active
 *   - Conflict / review-needed discipline mappings section renders
 *   - No forbidden public-stat language: "head-to-head", "ranking", "win/loss", "rating"
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
  insertHistoricalPerson,
  insertEvent,
  insertDiscipline,
  insertMember,
  insertResultsUpload,
  insertResultEntry,
  insertNetTeam,
  insertNetTeamMember,
  insertNetTeamAppearance,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3099');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const EVENT_2018_ID = 'event-rv-2018';
const EVENT_2014_ID = 'event-rv-2014';
const PERSON_A = 'person-rv-aa-test';
const PERSON_B = 'person-rv-bb-test';
const TEAM_AB  = 'net-team-rv-ab-001';

function setupDb(db: BetterSqlite3.Database): void {
  // Persons and a team so events can have net appearances
  insertHistoricalPerson(db, { person_id: PERSON_A, person_name: 'Review Alpha' });
  insertHistoricalPerson(db, { person_id: PERSON_B, person_name: 'Review Beta' });

  const ev2018 = insertEvent(db, {
    id: EVENT_2018_ID, title: 'Review Open 2018',
    start_date: '2018-07-01', city: 'Seattle', country: 'US',
  });
  const ev2014 = insertEvent(db, {
    id: EVENT_2014_ID, title: 'Review Cup 2014',
    start_date: '2014-06-01', city: 'Austin', country: 'US',
  });

  const disc2018 = insertDiscipline(db, ev2018, {
    id: 'disc-rv-open-2018', name: 'Open Doubles Net',
    discipline_category: 'net', team_type: 'doubles',
  });
  const disc2014 = insertDiscipline(db, ev2014, {
    id: 'disc-rv-open-2014', name: 'Open Doubles Net',
    discipline_category: 'net', team_type: 'doubles',
  });
  // Conflict discipline
  const disc2014c = insertDiscipline(db, ev2014, {
    id: 'disc-rv-conf-2014', name: 'Footbag Net: Conflict',
    discipline_category: 'net', team_type: 'doubles',
  });

  const member  = insertMember(db);
  const up2018  = insertResultsUpload(db, ev2018, member);
  const up2014  = insertResultsUpload(db, ev2014, member);

  const en1 = insertResultEntry(db, ev2018, up2018, disc2018, { id: 'entry-rv-1', placement: 1 });
  const en2 = insertResultEntry(db, ev2014, up2014, disc2014,  { id: 'entry-rv-2', placement: 2 });

  insertNetTeam(db, {
    team_id: TEAM_AB, person_id_a: PERSON_A, person_id_b: PERSON_B,
    first_year: 2014, last_year: 2018, appearance_count: 2,
  });
  insertNetTeamMember(db, { team_id: TEAM_AB, person_id: PERSON_A, position: 'a' });
  insertNetTeamMember(db, { team_id: TEAM_AB, person_id: PERSON_B, position: 'b' });
  insertNetTeamAppearance(db, { team_id: TEAM_AB, event_id: ev2018, discipline_id: disc2018, result_entry_id: en1, placement: 1, event_year: 2018 });
  insertNetTeamAppearance(db, { team_id: TEAM_AB, event_id: ev2014, discipline_id: disc2014, result_entry_id: en2, placement: 2, event_year: 2014 });

  // net_discipline_group: conflict_flag=1 for disc2014c, review_needed=1 for disc2018
  db.prepare(`
    INSERT INTO net_discipline_group
      (discipline_id, canonical_group, match_method, review_needed, conflict_flag, mapped_at, mapped_by)
    VALUES (?, 'uncategorized', 'pattern', 0, 1, '2025-01-01T00:00:00.000Z', 'test')
  `).run('disc-rv-conf-2014');

  db.prepare(`
    INSERT INTO net_discipline_group
      (discipline_id, canonical_group, match_method, review_needed, conflict_flag, mapped_at, mapped_by)
    VALUES (?, 'open_doubles', 'exact', 1, 0, '2025-01-01T00:00:00.000Z', 'test')
  `).run('disc-rv-open-2018');

  // Review queue items
  // Item 1: unknown_team, priority=2, open, ev2018
  db.prepare(`
    INSERT INTO net_review_queue
      (id, source_file, item_type, priority, event_id, discipline_id,
       check_id, severity, reason_code, message, resolution_status, imported_at)
    VALUES (?, 'test', 'qc_issue', 2, ?, ?,
            'rv-check-1', 'medium', 'unknown_team',
            'Team not resolved at 2018 event', 'open', '2025-01-01T00:00:00.000Z')
  `).run('rq-rv-1', EVENT_2018_ID, 'disc-rv-open-2018');

  // Item 2: multi_stage_result, priority=2, open, ev2018
  db.prepare(`
    INSERT INTO net_review_queue
      (id, source_file, item_type, priority, event_id, discipline_id,
       check_id, severity, reason_code, message, resolution_status, imported_at)
    VALUES (?, 'test', 'qc_issue', 2, ?, NULL,
            'rv-check-2', 'medium', 'multi_stage_result',
            'Multi-stage bracket at 2018 event', 'open', '2025-01-02T00:00:00.000Z')
  `).run('rq-rv-2', EVENT_2018_ID);

  // Item 3: discipline_team_type_mismatch, priority=3, resolved, ev2014
  db.prepare(`
    INSERT INTO net_review_queue
      (id, source_file, item_type, priority, event_id, discipline_id,
       check_id, severity, reason_code, message, resolution_status, imported_at)
    VALUES (?, 'test', 'qc_issue', 3, ?, ?,
            'rv-check-3', 'low', 'discipline_team_type_mismatch',
            'Team type mismatch at 2014 event', 'resolved', '2025-01-03T00:00:00.000Z')
  `).run('rq-rv-3', EVENT_2014_ID, 'disc-rv-conf-2014');

  // Item 4: priority=1 critical, open, no event
  db.prepare(`
    INSERT INTO net_review_queue
      (id, source_file, item_type, priority, event_id, discipline_id,
       check_id, severity, reason_code, message, resolution_status, imported_at)
    VALUES (?, 'test', 'qc_issue', 1, NULL, NULL,
            'rv-check-4', 'critical', 'unknown_team',
            'Duplicate team identity detected', 'open', '2025-01-04T00:00:00.000Z')
  `).run('rq-rv-4');
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  setupDb(db);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

// ---------------------------------------------------------------------------

describe('GET /internal/net/review', () => {
  it('returns 200', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.status).toBe(200);
  });

  it('shows the page title', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('Net Review / QC');
  });

  it('shows the operator description', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('Operator review');
    expect(res.text).toContain('Read-only');
  });

  it('shows summary counts by reason_code', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('unknown_team');
    expect(res.text).toContain('multi_stage_result');
    expect(res.text).toContain('discipline_team_type_mismatch');
  });

  it('shows summary counts by priority', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    // Priority 1 (Critical) and 2 (High) and 3 (Structural) are all present
    expect(res.text).toContain('Critical');
    expect(res.text).toContain('High');
    expect(res.text).toContain('Structural');
  });

  it('shows summary counts by status', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('open');
    expect(res.text).toContain('resolved');
  });

  it('shows total item count', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    // 4 total items
    expect(res.text).toContain('4');
  });

  it('renders all 4 review items by default', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('Team not resolved at 2018 event');
    expect(res.text).toContain('Multi-stage bracket at 2018 event');
    expect(res.text).toContain('Team type mismatch at 2014 event');
    expect(res.text).toContain('Duplicate team identity detected');
  });

  it('shows event titles in the items table', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('Review Open 2018');
  });

  it('shows discipline names in the items table', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('Open Doubles Net');
  });

  it('shows the discipline mapping section with conflict_flag entry', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('Discipline Mappings');
    expect(res.text).toContain('Footbag Net: Conflict');
  });

  it('shows review_needed entry in discipline mappings', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    // disc2018 has review_needed=1
    expect(res.text).toContain('disc-rv-open-2018');
  });

  it('renders the filter form', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    expect(res.text).toContain('name="reason"');
    expect(res.text).toContain('name="priority"');
    expect(res.text).toContain('name="status"');
    expect(res.text).toContain('name="event"');
  });

  it('does not show forbidden public-stat language', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review');
    const lower = res.text.toLowerCase();
    expect(lower).not.toContain('head-to-head');
    expect(lower).not.toContain('ranking');
    expect(lower).not.toContain('win/loss');
    expect(lower).not.toContain('rating');
  });
});

describe('GET /internal/net/review?reason=unknown_team', () => {
  it('filters items to only unknown_team reason code', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review?reason=unknown_team');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Team not resolved at 2018 event');
    expect(res.text).toContain('Duplicate team identity detected');
    // multi_stage and mismatch items must not appear
    expect(res.text).not.toContain('Multi-stage bracket at 2018 event');
    expect(res.text).not.toContain('Team type mismatch at 2014 event');
  });

  it('marks the reason dropdown as selected', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review?reason=unknown_team');
    // The option value="unknown_team" should be selected
    expect(res.text).toContain('value="unknown_team" selected');
  });
});

describe('GET /internal/net/review?priority=1', () => {
  it('filters items to only priority 1', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review?priority=1');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Duplicate team identity detected');
    expect(res.text).not.toContain('Team not resolved at 2018 event');
    expect(res.text).not.toContain('Multi-stage bracket at 2018 event');
  });
});

describe('GET /internal/net/review?status=resolved', () => {
  it('filters items to resolved only', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review?status=resolved');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Team type mismatch at 2014 event');
    expect(res.text).not.toContain('Team not resolved at 2018 event');
  });
});

describe('GET /internal/net/review?event=event-rv-2018', () => {
  it('filters items to ev2018 only', async () => {
    const app = createApp();
    const res = await request(app).get(`/internal/net/review?event=${EVENT_2018_ID}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Team not resolved at 2018 event');
    expect(res.text).toContain('Multi-stage bracket at 2018 event');
    expect(res.text).not.toContain('Team type mismatch at 2014 event');
    expect(res.text).not.toContain('Duplicate team identity detected');
  });

  it('shows event context banner when event filter is active', async () => {
    const app = createApp();
    const res = await request(app).get(`/internal/net/review?event=${EVENT_2018_ID}`);
    expect(res.text).toContain('Review Open 2018');
    expect(res.text).toContain('Seattle');
    // Link to net event page
    expect(res.text).toContain(`/net/events/${EVENT_2018_ID}`);
  });

  it('shows no event context for an unknown event_id', async () => {
    const app = createApp();
    const res = await request(app).get('/internal/net/review?event=not-a-real-event');
    expect(res.status).toBe(200);
    // No event context banner — just no items match either
    expect(res.text).not.toContain('Filtered to event:');
  });
});
