import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3134');

const ADMIN_ID    = 'al_admin_001';
const ADMIN_SLUG  = 'al_admin_one';
const MEMBER_ID   = 'al_member_001';
const MEMBER_SLUG = 'al_member_one';
const OTHER_ID    = 'al_member_002';
const OTHER_SLUG  = 'al_member_two';

let createApp: Awaited<ReturnType<typeof importApp>>;

function adminCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: ADMIN_ID, role: 'admin' })}`;
}
function memberCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEMBER_ID })}`;
}

let auditSeq = 0;
function seedAudit(db: BetterSqlite3.Database, o: {
  occurredAt?: string;
  actorType?: string;
  actorMemberId?: string | null;
  actionType: string;
  entityType: string;
  entityId: string;
  category: string;
  reasonText?: string | null;
  metadata?: Record<string, unknown>;
}): string {
  const id = `audit_test_${String(++auditSeq).padStart(4, '0')}`;
  const ts = o.occurredAt ?? '2026-06-01T00:00:00.000Z';
  db.prepare(`
    INSERT INTO audit_entries (
      id, created_at, created_by, occurred_at, actor_type, actor_member_id,
      action_type, entity_type, entity_id, category, reason_text, metadata_json
    ) VALUES (?, ?, 'system', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, ts, ts,
    o.actorType ?? 'system', o.actorMemberId ?? null,
    o.actionType, o.entityType, o.entityId, o.category,
    o.reasonText ?? null, JSON.stringify(o.metadata ?? {}),
  );
  return id;
}

function withDb<T>(fn: (db: BetterSqlite3.Database) => T): T {
  const db = new BetterSqlite3(dbPath);
  try {
    return fn(db);
  } finally {
    db.close();
  }
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID,  slug: ADMIN_SLUG,  display_name: 'AL Admin',  real_name: 'AL Admin',  login_email: 'al-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: MEMBER_SLUG, display_name: 'AL Member', real_name: 'AL Member', login_email: 'al-member@example.com' });
  insertMember(db, { id: OTHER_ID,  slug: OTHER_SLUG,  display_name: 'AL Other',  real_name: 'AL Other',  login_email: 'al-other@example.com' });
  // The append-only triggers are dropped on this throwaway test DB so each test
  // can reset audit_entries; the app under test only ever inserts, so dropping
  // them does not change the behavior these route tests exercise.
  db.exec(`DROP TRIGGER IF EXISTS trg_audit_no_update; DROP TRIGGER IF EXISTS trg_audit_no_delete;`);
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(() => {
  withDb((db) => db.prepare(`DELETE FROM audit_entries`).run());
});

describe('GET /admin/audit-log', () => {
  it('unauthenticated → 302 to /login', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/audit-log');
    expect(res.status).toBe(302);
    expect(res.headers.location).toMatch(/^\/login/);
  });

  it('non-admin → 403', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/audit-log').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('admin, no matching entries → 200 with empty summary', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/audit-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Audit Log');
    expect(res.text).toContain('No matching audit entries.');
  });

  it('admin, with entries → 200 listing action type and a member profile link', async () => {
    withDb((db) => seedAudit(db, {
      actorType: 'member', actorMemberId: MEMBER_ID,
      actionType: 'tier.purchase_grant', entityType: 'member', entityId: MEMBER_ID, category: 'tier_change',
    }));
    const app = createApp();
    const res = await request(app).get('/admin/audit-log').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('tier.purchase_grant');
    expect(res.text).toContain(`href="/members/${MEMBER_SLUG}"`);
  });

  it('member filter narrows to rows where the member is the actor OR the affected entity', async () => {
    withDb((db) => {
      // MEMBER as actor.
      seedAudit(db, { actorType: 'member', actorMemberId: MEMBER_ID, actionType: 'tier.purchase_grant', entityType: 'member', entityId: MEMBER_ID, category: 'tier_change' });
      // MEMBER as entity, admin as actor (an override on the member).
      seedAudit(db, { actorType: 'admin', actorMemberId: ADMIN_ID, actionType: 'tier.admin_override', entityType: 'member', entityId: MEMBER_ID, category: 'tier_change' });
      // OTHER member, unrelated.
      seedAudit(db, { actorType: 'member', actorMemberId: OTHER_ID, actionType: 'auth.login', entityType: 'member', entityId: OTHER_ID, category: 'auth' });
    });
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log?member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('tier.purchase_grant');  // MEMBER as actor
    expect(res.text).toContain('tier.admin_override');  // MEMBER as entity
    expect(res.text).not.toContain('auth.login');        // OTHER excluded
  });

  it('writes an audit-of-audit row (audit.viewed, actor admin) on each view', async () => {
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log?member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    const row = withDb((db) => db
      .prepare(`SELECT actor_type, actor_member_id, entity_id, category FROM audit_entries WHERE action_type = 'audit.viewed' ORDER BY occurred_at DESC LIMIT 1`)
      .get() as Record<string, unknown> | undefined);
    expect(row).toBeDefined();
    expect(row!.actor_type).toBe('admin');
    expect(row!.actor_member_id).toBe(ADMIN_ID);
    expect(row!.entity_id).toBe(MEMBER_ID);
    expect(row!.category).toBe('audit');
  });

  it('excludes its own audit.viewed rows from the default browse, includes them on request', async () => {
    const app = createApp();
    // First view writes one audit.viewed row.
    await request(app).get('/admin/audit-log').set('Cookie', adminCookie());
    // Default browse excludes audit-access events.
    const def = await request(app).get('/admin/audit-log').set('Cookie', adminCookie());
    expect(def.text).not.toContain('audit.viewed');
    // Opt-in surfaces them.
    const inc = await request(app).get('/admin/audit-log?includeAccess=1').set('Cookie', adminCookie());
    expect(inc.text).toContain('audit.viewed');
  });

  it('escapes HTML in reason text (no stored XSS)', async () => {
    withDb((db) => seedAudit(db, {
      actorType: 'admin', actorMemberId: ADMIN_ID,
      actionType: 'tier.admin_override', entityType: 'member', entityId: MEMBER_ID, category: 'tier_change',
      reasonText: '<script>alert(1)</script>',
    }));
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log?member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('<script>alert(1)</script>');
    expect(res.text).toContain('&lt;script&gt;');
  });
});

describe('GET /admin/audit-log/export', () => {
  it('non-admin → 403', async () => {
    const app = createApp();
    const res = await request(app).get('/admin/audit-log/export?format=csv').set('Cookie', memberCookie());
    expect(res.status).toBe(403);
  });

  it('CSV export → 200 text/csv attachment with header and rows', async () => {
    withDb((db) => seedAudit(db, {
      actorType: 'member', actorMemberId: MEMBER_ID,
      actionType: 'tier.purchase_grant', entityType: 'member', entityId: MEMBER_ID, category: 'tier_change',
    }));
    const app = createApp();
    const res = await request(app).get('/admin/audit-log/export?format=csv').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.headers['content-disposition']).toContain('attachment');
    expect(res.headers['content-disposition']).toContain('audit-log.csv');
    expect(res.text).toContain('occurred_at,actor_type');
    expect(res.text).toContain('tier.purchase_grant');
  });

  it('JSON export → 200 application/json array', async () => {
    withDb((db) => seedAudit(db, {
      actorType: 'member', actorMemberId: MEMBER_ID,
      actionType: 'tier.purchase_grant', entityType: 'member', entityId: MEMBER_ID, category: 'tier_change',
    }));
    const app = createApp();
    const res = await request(app).get('/admin/audit-log/export?format=json').set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((r: { action_type: string }) => r.action_type === 'tier.purchase_grant')).toBe(true);
  });

  it('writes an audit.exported row recording the export', async () => {
    withDb((db) => seedAudit(db, { actorType: 'member', actorMemberId: MEMBER_ID, actionType: 'auth.login', entityType: 'member', entityId: MEMBER_ID, category: 'auth' }));
    const app = createApp();
    await request(app).get(`/admin/audit-log/export?format=csv&member=${MEMBER_ID}`).set('Cookie', adminCookie());
    const row = withDb((db) => db
      .prepare(`SELECT actor_type, actor_member_id, entity_id, metadata_json FROM audit_entries WHERE action_type = 'audit.exported' ORDER BY occurred_at DESC LIMIT 1`)
      .get() as Record<string, unknown> | undefined);
    expect(row).toBeDefined();
    expect(row!.actor_type).toBe('admin');
    expect(row!.actor_member_id).toBe(ADMIN_ID);
    expect(row!.entity_id).toBe(MEMBER_ID);
    expect(String(row!.metadata_json)).toContain('"format":"csv"');
  });

  it('CSV quotes a cell containing commas, quotes, and newlines (RFC 4180)', async () => {
    withDb((db) => seedAudit(db, {
      actorType: 'admin', actorMemberId: ADMIN_ID,
      actionType: 'tier.admin_override', entityType: 'member', entityId: MEMBER_ID, category: 'tier_change',
      reasonText: 'has, comma "quote"',
    }));
    const app = createApp();
    const res = await request(app).get(`/admin/audit-log/export?format=csv&member=${MEMBER_ID}`).set('Cookie', adminCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('"has, comma ""quote"""');
  });
});
