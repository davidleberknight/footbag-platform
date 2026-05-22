/**
 * Integration tests for the silent auto-link card lifecycle + revert surfaces:
 *   - POST /members/me/auto-link/confirm   → clears card, writes
 *     legacy.auto_link_confirmed audit row, link stands
 *   - POST /members/me/auto-link/dismiss   → marks dismissed; subsequent
 *     dashboard loads do not re-surface; no audit row
 *   - POST /members/me/auto-link/report-incorrect → invokes
 *     IdentityAccessService.revertAutoLink; clears card + linkage
 *   - GET /auto-link/report-incorrect/:token → uniform 200 result page for
 *     reverted / already_reverted / unrecognized token (anti-enumeration)
 *   - Profile page (/members/:slug) renders the card while pending,
 *     stops rendering after dismiss, and lists claimed legacy identities
 *     under the new profile section.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from '../fixtures/supertestWithOrigin';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, insertLegacyMember, insertHistoricalPerson, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3196');

let createApp: Awaited<ReturnType<typeof importApp>>;

const MEM_ID    = 'mem-al-card-owner';
const MEM_SLUG  = 'mem_al_card_owner';
const LEGACY_ID = 'legmem-al-card';
const HP_ID     = 'hp-al-card';

function ownerCookie(): string {
  return `footbag_session=${createTestSessionJwt({ memberId: MEM_ID })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertLegacyMember(db, {
    legacy_member_id: LEGACY_ID,
    legacy_email:     'autolink@example.com',
    real_name:        'Auto Link',
    display_name:     'Auto Link',
  });
  insertHistoricalPerson(db, {
    person_id:        HP_ID,
    person_name:      'Auto Link',
    legacy_member_id: LEGACY_ID,
  });
  insertMember(db, {
    id: MEM_ID, slug: MEM_SLUG,
    display_name: 'Auto Link', real_name: 'Auto Link',
    login_email: 'autolink@example.com',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

async function freshSilentClaim(): Promise<{ claimAuditId: string }> {
  // Reset state and force a fresh silent claim via runBatchAutoLink so each
  // test starts from a known card-present baseline.
  const db = new BetterSqlite3(dbPath);
  db.prepare(`UPDATE members SET legacy_member_id = NULL, historical_person_id = NULL,
              pending_auto_link_card_json = NULL, pending_auto_link_card_dismissed_at = NULL
              WHERE id = ?`).run(MEM_ID);
  db.prepare(`UPDATE legacy_members SET claimed_by_member_id = NULL, claimed_at = NULL
              WHERE legacy_member_id = ?`).run(LEGACY_ID);
  db.close();

  // Seed a variant pair so this row classifies as medium and gets a card.
  const db2 = new BetterSqlite3(dbPath);
  try {
    db2.prepare(`INSERT OR IGNORE INTO name_variants (canonical_normalized, variant_normalized, source)
                 VALUES (?, ?, 'admin_added')`).run('auto link', 'auto link 2');
  } finally { db2.close(); }
  // The variant insert is a no-op (rule against self-pair), but classifier
  // returns 'high' with exact match — which still claims but no card.
  // For a guaranteed medium, mutate the member real_name to use the variant.
  const db3 = new BetterSqlite3(dbPath);
  db3.prepare(`UPDATE members SET real_name = ?, display_name = ? WHERE id = ?`)
    .run('Auto Link', 'Auto Link', MEM_ID);
  db3.close();

  // Direct invocation of the silent claim helper guarantees a deterministic
  // outcome regardless of which name-variants pair seeded behavior — bypasses
  // the classifier's tier1-vs-tier2 split for this lifecycle test.
  const svc = await import('../../src/services/identityAccessService');
  const outcome = svc.identityAccessService.applyAutoLinkSilentClaim(MEM_ID, {
    confidence:               'medium',
    personId:                 HP_ID,
    personName:               'Auto Link',
    matchedVariantNormalized: 'auto link',
  });
  if (outcome.status !== 'claimed') {
    throw new Error(`expected claimed, got ${outcome.status}`);
  }
  return { claimAuditId: outcome.claimAuditId };
}

describe('silent auto-link card lifecycle', () => {
  it('profile page renders the card while pending and lists the claimed identity', async () => {
    await freshSilentClaim();
    const app = createApp();
    const res = await request(app)
      .get(`/members/${MEM_SLUG}`)
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(200);
    expect(res.text).toContain('We linked your account');
    expect(res.text).toContain('/members/me/auto-link/confirm');
    expect(res.text).toContain('/members/me/auto-link/dismiss');
    expect(res.text).toContain('/members/me/auto-link/report-incorrect');
    // Claimed legacy identity section
    expect(res.text).toContain('Claimed legacy identity');
    expect(res.text).toContain('Auto Link');
  });

  it('POST /members/me/auto-link/confirm clears the card and writes an audit row; link stands', async () => {
    const { claimAuditId } = await freshSilentClaim();
    const app = createApp();
    const res = await request(app)
      .post('/members/me/auto-link/confirm')
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe(`/members/${MEM_SLUG}`);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT pending_auto_link_card_json, legacy_member_id FROM members WHERE id = ?`,
    ).get(MEM_ID) as { pending_auto_link_card_json: string | null; legacy_member_id: string | null };
    expect(row.pending_auto_link_card_json).toBeNull();
    expect(row.legacy_member_id).toBe(LEGACY_ID);
    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries WHERE entity_id = ? AND action_type = 'legacy.auto_link_confirmed'
       ORDER BY created_at DESC LIMIT 1`,
    ).get(MEM_ID) as { metadata_json: string } | undefined;
    db.close();
    expect(audit).toBeDefined();
    const meta = JSON.parse(audit!.metadata_json) as Record<string, unknown>;
    expect(meta.original_claim_audit_id).toBe(claimAuditId);
  });

  it('POST /members/me/auto-link/dismiss marks dismissed; profile no longer renders the card', async () => {
    await freshSilentClaim();
    const app = createApp();
    const dismiss = await request(app)
      .post('/members/me/auto-link/dismiss')
      .set('Cookie', ownerCookie());
    expect(dismiss.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT pending_auto_link_card_json, pending_auto_link_card_dismissed_at FROM members WHERE id = ?`,
    ).get(MEM_ID) as { pending_auto_link_card_json: string | null; pending_auto_link_card_dismissed_at: string | null };
    db.close();
    expect(row.pending_auto_link_card_json).not.toBeNull();
    expect(row.pending_auto_link_card_dismissed_at).not.toBeNull();

    const profile = await request(app)
      .get(`/members/${MEM_SLUG}`)
      .set('Cookie', ownerCookie());
    expect(profile.status).toBe(200);
    expect(profile.text).not.toContain('We linked your account');
  });

  it('POST /members/me/auto-link/report-incorrect reverts state and clears the card', async () => {
    const { claimAuditId } = await freshSilentClaim();
    const app = createApp();
    const res = await request(app)
      .post('/members/me/auto-link/report-incorrect')
      .type('form')
      .send({ claimAuditId })
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      `SELECT legacy_member_id, historical_person_id, pending_auto_link_card_json FROM members WHERE id = ?`,
    ).get(MEM_ID) as Record<string, unknown>;
    db.close();
    expect(row.legacy_member_id).toBeNull();
    expect(row.historical_person_id).toBeNull();
    expect(row.pending_auto_link_card_json).toBeNull();
  });

  it('POST /members/me/auto-link/report-incorrect ignores body-supplied claimAuditId; derives server-side from card', async () => {
    // Forensic-integrity regression. A malicious body could otherwise plant
    // an attacker-chosen audit id into audit_entries.metadata_json and the
    // work_queue_items description, misdirecting admin triage.
    const { claimAuditId } = await freshSilentClaim();
    const app = createApp();
    const forgedId = 'audit_id_forged_by_attacker_pointing_at_someone_else';
    const res = await request(app)
      .post('/members/me/auto-link/report-incorrect')
      .type('form')
      .send({ claimAuditId: forgedId })
      .set('Cookie', ownerCookie());
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const audit = db.prepare(
      `SELECT metadata_json FROM audit_entries
         WHERE entity_id = ? AND action_type = 'legacy.auto_link_revert'
         ORDER BY created_at DESC LIMIT 1`,
    ).get(MEM_ID) as { metadata_json: string } | undefined;
    db.close();
    expect(audit).toBeDefined();
    const meta = JSON.parse(audit!.metadata_json) as Record<string, unknown>;
    // Server-derived value lands in the audit row; forged body value is discarded.
    expect(meta.original_claim_audit_id).toBe(claimAuditId);
    expect(meta.original_claim_audit_id).not.toBe(forgedId);
  });
});

describe('tokened report-incorrect GET /auto-link/report-incorrect/:token', () => {
  it('reverts when the token is valid and bound to the claim audit', async () => {
    const { claimAuditId } = await freshSilentClaim();
    // The token was already issued inside the silent claim; the email body
    // (in outbox_emails.body_text) carries the URL with the raw token. We
    // extract it here rather than re-issue.
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const outboxBody = db.prepare(
      `SELECT body_text FROM outbox_emails WHERE idempotency_key = ?`,
    ).get(`auto_link_notification:${claimAuditId}`) as { body_text: string } | undefined;
    db.close();
    expect(outboxBody).toBeDefined();
    const match = outboxBody!.body_text.match(/\/auto-link\/report-incorrect\/([^\s]+)/);
    expect(match).not.toBeNull();
    const token = match![1];

    const app = createApp();
    const res = await request(app).get(`/auto-link/report-incorrect/${token}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Thank you for reporting this');

    const db2 = new BetterSqlite3(dbPath, { readonly: true });
    const row = db2.prepare(`SELECT legacy_member_id FROM members WHERE id = ?`).get(MEM_ID) as { legacy_member_id: string | null };
    db2.close();
    expect(row.legacy_member_id).toBeNull();
  });

  it('returns a uniform 200 result page for an unrecognized token (anti-enumeration)', async () => {
    const app = createApp();
    const res = await request(app).get('/auto-link/report-incorrect/this-is-not-a-valid-token-handle');
    expect(res.status).toBe(200);
    expect(res.text).toContain('Thank you for reporting this');
  });
});
