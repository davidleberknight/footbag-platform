/**
 * Regression: public event detail must not surface a soft-deleted member's
 * slug as a participant profile link.
 *
 * Pre-fix, the m_linked JOIN in listPublicResultRowsByEventId (src/db/db.ts)
 * had no deleted_at filter, while the parallel m_via_hp JOIN did. That
 * asymmetry let a soft-deleted member's slug surface in COALESCE(m_linked.slug,
 * m_via_hp.slug) and render as /members/<deleted-slug>, producing a broken
 * profile link (the profile route filters via members_active and 404s).
 *
 * The slug itself is identity that a soft-deleted member is entitled to
 * have hidden from public surfaces.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import {
  insertMember,
  insertTag,
  insertEvent,
  insertDiscipline,
  insertResultsUpload,
  insertResultEntry,
  insertResultParticipant,
} from '../fixtures/factories';

const { dbPath } = setTestEnv('3062');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let createApp: Awaited<ReturnType<typeof importApp>>;

const EVENT_KEY         = 'event_2025_softdelete_test';
const ACTIVE_MEMBER_ID  = 'event-active-member';
const ACTIVE_SLUG       = 'active_event_member';
const DELETED_MEMBER_ID = 'event-deleted-member';
const DELETED_SLUG      = 'deleted_event_member';

beforeAll(async () => {
  const db = createTestDb(dbPath);

  // Upload-owner FK target
  const uploaderId = insertMember(db, { id: 'upload-owner-001', slug: 'upload_owner' });

  insertMember(db, {
    id: ACTIVE_MEMBER_ID,
    slug: ACTIVE_SLUG,
    display_name: 'Active Event Participant',
  });

  insertMember(db, {
    id: DELETED_MEMBER_ID,
    slug: DELETED_SLUG,
    display_name: 'Deleted Event Participant',
    deleted_at: '2025-08-01T00:00:00.000Z',
  });

  const tagId = insertTag(db, {
    tag_normalized: `#${EVENT_KEY}`,
    tag_display:    '#Event_2025_Softdelete_Test',
  });
  const eventId = insertEvent(db, {
    hashtag_tag_id:      tagId,
    title:               '2025 Soft-Delete Regression Event',
    status:              'completed',
    start_date:          '2025-08-10',
    end_date:            '2025-08-12',
    city:                'Testville',
    country:             'US',
    registration_status: 'closed',
  });
  const discId   = insertDiscipline(db, eventId, { name: 'Freestyle', sort_order: 1 });
  const uploadId = insertResultsUpload(db, eventId, uploaderId);

  const entryActive = insertResultEntry(db, eventId, uploadId, discId, { placement: 1 });
  insertResultParticipant(db, entryActive, 'Active Event Participant', {
    participant_order: 1,
    member_id:         ACTIVE_MEMBER_ID,
  });

  const entryDeleted = insertResultEntry(db, eventId, uploadId, discId, { placement: 2 });
  insertResultParticipant(db, entryDeleted, 'Deleted Event Participant', {
    participant_order: 1,
    member_id:         DELETED_MEMBER_ID,
  });

  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('GET /events/:eventKey — soft-deleted result participants', () => {
  it('does not surface a soft-deleted member slug as a profile link', async () => {
    const app = createApp();
    const res = await request(app).get(`/events/${EVENT_KEY}`);
    expect(res.status).toBe(200);
    expect(res.text).not.toContain(`/members/${DELETED_SLUG}`);
  });

  it('still surfaces the active member slug as a profile link', async () => {
    const app = createApp();
    const res = await request(app).get(`/events/${EVENT_KEY}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain(`/members/${ACTIVE_SLUG}`);
  });

  it('still shows the display name recorded on the soft-deleted participant row', async () => {
    // The participant_display_name on the result row is set at result-upload
    // time and is independent of the member's current state. Hiding the link
    // does not hide the recorded name.
    const app = createApp();
    const res = await request(app).get(`/events/${EVENT_KEY}`);
    expect(res.text).toContain('Deleted Event Participant');
  });
});
