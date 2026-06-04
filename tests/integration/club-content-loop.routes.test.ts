/**
 * Club content-validation loop contract: leaders edit description and
 * external URL directly with no approval gate (URLs verified before the
 * live row changes; a failing URL changes nothing); non-leader members
 * cannot edit directly but can file suggestions into the club's review
 * queue; a leader or admin approves (value applies; URL suggestions verify
 * first and a failure rejects back to the suggester with the error as the
 * reason) or rejects with a mandatory reason; every outcome is
 * audit-logged; suggestion submission is rate-limited.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertClub, insertTag, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3080');

let createApp: Awaited<ReturnType<typeof importApp>>;
let db: BetterSqlite3.Database;

function settleOnboarding(memberId: string): void {
  for (const [i, taskType] of ['personal_details', 'legacy_claim', 'club_affiliations'].entries()) {
    db.prepare(`
      INSERT INTO member_onboarding_tasks
        (id, created_at, created_by, updated_at, updated_by, member_id, task_type, state, completed_at)
      VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'completed', '2026-01-01T00:00:00.000Z')
    `).run(`ccl-mot-${memberId}-${i}`, memberId, taskType);
  }
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'ccl-admin', slug: 'ccl_admin', login_email: 'ccl-admin@example.com', is_admin: 1 });
  settleOnboarding('ccl-admin');
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;
const adminCookie = () => `footbag_session=${createTestSessionJwt({ memberId: 'ccl-admin', role: 'admin' })}`;

let _n = 0;
function seedClubWithLeader(): { clubId: string; clubKey: string; leaderId: string; memberId: string } {
  _n += 1;
  const clubId = `ccl-club-${_n}`;
  const leaderId = `ccl-leader-${_n}`;
  const memberId = `ccl-member-${_n}`;
  // The public club key is the stored hashtag minus '#': tag '#club_ccl_<n>'
  // serves at /clubs/club_ccl_<n>.
  const tagId = insertTag(db, { tag_normalized: `#club_ccl_${_n}`, tag_display: `#club_ccl_${_n}`, is_standard: 1, standard_type: 'club' });
  insertClub(db, { id: clubId, name: `CCL Club ${_n}`, hashtag_tag_id: tagId });
  db.prepare("UPDATE clubs SET description = 'Old description.' WHERE id = ?").run(clubId);
  insertMember(db, { id: leaderId, slug: `ccl_leader_${_n}`, login_email: `${leaderId}@example.com` });
  insertMember(db, { id: memberId, slug: `ccl_member_${_n}`, login_email: `${memberId}@example.com`, display_name: `Suggester ${_n}` });
  db.prepare(`
    INSERT INTO club_leaders (id, created_at, created_by, updated_at, updated_by, club_id, member_id, role, added_at)
    VALUES (?, '2026-01-01T00:00:00.000Z', 'test', '2026-01-01T00:00:00.000Z', 'test', ?, ?, 'leader', '2026-01-01T00:00:00.000Z')
  `).run(`ccl-cl-${_n}`, clubId, leaderId);
  settleOnboarding(leaderId);
  settleOnboarding(memberId);
  return { clubId, clubKey: `club_ccl_${_n}`, leaderId, memberId };
}

function clubRow(clubId: string): Record<string, unknown> {
  return db.prepare('SELECT description, external_url, external_url_validated_at FROM clubs WHERE id = ?').get(clubId) as Record<string, unknown>;
}

function suggestions(clubId: string): Array<Record<string, unknown>> {
  return db.prepare('SELECT * FROM club_content_suggestions WHERE club_id = ? ORDER BY created_at, id').all(clubId) as Array<Record<string, unknown>>;
}

describe('direct edit (authoritative editors)', () => {
  it('a leader edits the description directly with an audit row; non-leaders are refused', async () => {
    const { clubId, clubKey, leaderId, memberId } = seedClubWithLeader();

    const refused = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ description: 'Hijacked.' });
    expect(refused.status).toBe(422);
    expect(clubRow(clubId).description).toBe('Old description.');

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send({ description: 'Fresh description.' });
    expect(res.status).toBe(303);
    expect(clubRow(clubId).description).toBe('Fresh description.');

    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE action_type = 'club.content_edited' AND entity_id = ?`,
    ).get(clubId) as { metadata_json: string };
    const changes = JSON.parse(audit.metadata_json).changes as Record<string, { before: unknown; after: unknown }>;
    expect(changes.description.before).toBe('Old description.');
    expect(changes.description.after).toBe('Fresh description.');
  });

  it('a leader-supplied URL that fails verification changes nothing', async () => {
    const { clubId, clubKey, leaderId } = seedClubWithLeader();
    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/edit`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send({ external_url: 'javascript:alert(1)' });
    expect(res.status).toBe(422);
    expect(clubRow(clubId).external_url).toBeNull();
  });
});

describe('suggestion queue', () => {
  it('a member files a suggestion; the leader approves and the value applies with audits', async () => {
    const { clubId, clubKey, leaderId, memberId } = seedClubWithLeader();

    const submit = await request(createApp())
      .post(`/clubs/${clubKey}/content/suggest`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ field: 'description', proposed_value: 'Community-corrected text.', note: 'The old text names a defunct venue.' });
    expect(submit.status).toBe(303);

    const open = suggestions(clubId);
    expect(open).toHaveLength(1);
    expect(open[0].status).toBe('open');

    // The leader sees the queue on the club page.
    const page = await request(createApp())
      .get(`/clubs/${clubKey}`)
      .set('Cookie', cookieFor(leaderId));
    expect(page.text).toContain('Suggested edits awaiting review');
    expect(page.text).toContain('Community-corrected text.');

    const review = await request(createApp())
      .post(`/clubs/${clubKey}/content/suggestions/${open[0].id}/review`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send({ decision: 'approve' });
    expect(review.status).toBe(303);

    expect(clubRow(clubId).description).toBe('Community-corrected text.');
    expect(suggestions(clubId)[0].status).toBe('approved');
    const audits = db.prepare(
      `SELECT action_type FROM audit_entries WHERE entity_id = ? AND action_type LIKE 'club.content_suggestion%' ORDER BY created_at`,
    ).all(clubId) as Array<{ action_type: string }>;
    expect(audits.map((a) => a.action_type)).toEqual([
      'club.content_suggestion_submitted',
      'club.content_suggestion_approved',
    ]);
  });

  it('rejection requires a reason; an admin can also review', async () => {
    const { clubId, clubKey, memberId } = seedClubWithLeader();
    await request(createApp())
      .post(`/clubs/${clubKey}/content/suggest`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ field: 'description', proposed_value: 'Spammy text.' });
    const open = suggestions(clubId);

    const noReason = await request(createApp())
      .post(`/clubs/${clubKey}/content/suggestions/${open[0].id}/review`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ decision: 'reject', reason: ' ' });
    expect(noReason.status).toBe(422);

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/suggestions/${open[0].id}/review`)
      .set('Cookie', adminCookie())
      .type('form')
      .send({ decision: 'reject', reason: 'Not accurate.' });
    expect(res.status).toBe(303);
    expect(suggestions(clubId)[0].status).toBe('rejected');
    expect(clubRow(clubId).description).toBe('Old description.');
  });

  it('an approved URL suggestion that fails verification is rejected back to the suggester with the error', async () => {
    const { clubId, clubKey, leaderId, memberId } = seedClubWithLeader();
    await request(createApp())
      .post(`/clubs/${clubKey}/content/suggest`)
      .set('Cookie', cookieFor(memberId))
      .type('form')
      .send({ field: 'external_url', proposed_value: 'http://127.0.0.1/internal' });
    const open = suggestions(clubId);

    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/suggestions/${open[0].id}/review`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send({ decision: 'approve' });
    expect(res.status).toBe(303);

    const after = suggestions(clubId)[0];
    expect(after.status).toBe('rejected');
    expect(String(after.resolution_reason)).toContain('URL verification failed');
    expect(clubRow(clubId).external_url).toBeNull();
  });

  it('leaders cannot use the suggestion queue (they edit directly)', async () => {
    const { clubKey, leaderId } = seedClubWithLeader();
    const res = await request(createApp())
      .post(`/clubs/${clubKey}/content/suggest`)
      .set('Cookie', cookieFor(leaderId))
      .type('form')
      .send({ field: 'description', proposed_value: 'Should be refused.' });
    expect(res.status).toBe(422);
  });
});
