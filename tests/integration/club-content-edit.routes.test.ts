/**
 * Club content editing contract: club leaders edit the description and
 * external URL directly with no approval gate; external URLs are verified
 * before the live row changes and a failing URL changes nothing; members
 * who are not leaders cannot edit club content; every applied edit is
 * audit-logged with before/after values.
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
  createApp = await importApp();
});

afterAll(() => {
  db.close();
  cleanupTestDb(dbPath);
});

const cookieFor = (id: string) => `footbag_session=${createTestSessionJwt({ memberId: id })}`;

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
  insertMember(db, { id: memberId, slug: `ccl_member_${_n}`, login_email: `${memberId}@example.com` });
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
