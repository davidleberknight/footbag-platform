/**
 * Atomicity contract for email verification: consuming the single-use token
 * and marking the member verified commit together. If the member UPDATE
 * fails mid-flow, the token consume rolls back with it, so the link in the
 * member's inbox still works on retry instead of dying with the member
 * left unverified.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3992');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/identityAccessService').identityAccessService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let tokens: typeof import('../../src/services/accountTokenService').accountTokenService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let dbMod: typeof import('../../src/db/db');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  svc = (await import('../../src/services/identityAccessService')).identityAccessService;
  tokens = (await import('../../src/services/accountTokenService')).accountTokenService;
  dbMod = await import('../../src/db/db');
});

afterAll(() => cleanupTestDb(dbPath));

function memberVerifiedAt(id: string): string | null {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT email_verified_at FROM members WHERE id = ?').get(id) as { email_verified_at: string | null };
  db.close();
  return row.email_verified_at;
}

function tokenUsedAt(tokenRowId: string): string | null {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT used_at FROM account_tokens WHERE id = ?').get(tokenRowId) as { used_at: string | null };
  db.close();
  return row.used_at;
}

describe('identityAccessService.verifyEmailByToken atomicity', () => {
  it('rolls back the token consume when the member update throws, so a retry succeeds', async () => {
    const id = 'verify-atom-1';
    const db = new BetterSqlite3(dbPath);
    insertMember(db, {
      id, slug: 'verify_atom_1',
      login_email: 'verify-atom-1@example.com',
      email_verified_at: null,
    });
    db.close();

    const { rawToken, tokenRowId } = tokens.issueToken({
      memberId: id, tokenType: 'email_verify', ttlHours: 1,
    });

    // Force the member UPDATE inside the flow to fail (the statement group
    // exposes prepared statements through getters, so the injected statement
    // replaces the real one for this call only).
    const spy = vi.spyOn(dbMod.auth, 'markEmailVerified', 'get').mockReturnValue({
      run: () => { throw new Error('forced member-update failure'); },
    } as never);
    await expect(svc.verifyEmailByToken(rawToken)).rejects.toThrow('forced member-update failure');
    spy.mockRestore();

    // The single-use token must survive the failed attempt unconsumed, and
    // the member must still be unverified.
    expect(tokenUsedAt(tokenRowId)).toBeNull();
    expect(memberVerifiedAt(id)).toBeNull();

    // The same link works on retry once the failure clears.
    const result = await svc.verifyEmailByToken(rawToken);
    expect(result).not.toBeNull();
    expect(result!.memberId).toBe(id);
    expect(memberVerifiedAt(id)).not.toBeNull();
    expect(tokenUsedAt(tokenRowId)).not.toBeNull();
  });
});

function taskRows(memberId: string): Array<{ task_type: string; state: string }> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    'SELECT task_type, state FROM member_onboarding_tasks WHERE member_id = ? ORDER BY task_type',
  ).all(memberId) as Array<{ task_type: string; state: string }>;
  db.close();
  return rows;
}

const PENDING_CHECKLIST = [
  { task_type: 'club_affiliations', state: 'pending' },
  { task_type: 'legacy_claim',      state: 'pending' },
  { task_type: 'personal_details',  state: 'pending' },
];

describe('the onboarding checklist is created by verifying the email', () => {
  // Defect caught: no wizard page may create the rows, so a verification that
  // left them out would leave the member's progress unrecorded, and one that
  // committed them apart from the verification could leave a verified member
  // with no checklist or a checklist on an unverified account.
  it('a verification creates the three pending rows and no wizard.start audit row', async () => {
    const id = 'verify-checklist-1';
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id, slug: 'verify_checklist_1', login_email: 'verify-checklist-1@example.com', email_verified_at: null, onboarding: 'none' });
    db.close();
    const { rawToken } = tokens.issueToken({ memberId: id, tokenType: 'email_verify', ttlHours: 1 });

    expect(await svc.verifyEmailByToken(rawToken)).not.toBeNull();
    expect(taskRows(id)).toEqual(PENDING_CHECKLIST);
    const ro = new BetterSqlite3(dbPath, { readonly: true });
    const starts = (ro.prepare(
      "SELECT COUNT(*) AS c FROM audit_entries WHERE actor_member_id = ? AND action_type = 'wizard.start'",
    ).get(id) as { c: number }).c;
    ro.close();
    expect(starts).toBe(0);
  });

  it('a failed checklist insert rolls back the whole verification, so the link still works', async () => {
    const id = 'verify-checklist-2';
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id, slug: 'verify_checklist_2', login_email: 'verify-checklist-2@example.com', email_verified_at: null, onboarding: 'none' });
    db.close();
    const { rawToken, tokenRowId } = tokens.issueToken({ memberId: id, tokenType: 'email_verify', ttlHours: 1 });

    const spy = vi.spyOn(dbMod.memberOnboarding, 'insertTaskListIfMissing', 'get').mockReturnValue({
      run: () => { throw new Error('forced checklist failure'); },
    } as never);
    await expect(svc.verifyEmailByToken(rawToken)).rejects.toThrow('forced checklist failure');
    spy.mockRestore();
    expect(tokenUsedAt(tokenRowId)).toBeNull();
    expect(memberVerifiedAt(id)).toBeNull();
    expect(taskRows(id)).toEqual([]);

    expect(await svc.verifyEmailByToken(rawToken)).not.toBeNull();
    expect(taskRows(id)).toEqual(PENDING_CHECKLIST);
  });

  it('a second outstanding link adds no rows and leaves an answered step answered', async () => {
    const id = 'verify-checklist-3';
    const db = new BetterSqlite3(dbPath);
    insertMember(db, { id, slug: 'verify_checklist_3', login_email: 'verify-checklist-3@example.com', email_verified_at: null, onboarding: 'none' });
    db.close();
    const first = tokens.issueToken({ memberId: id, tokenType: 'email_verify', ttlHours: 1 });
    const second = tokens.issueToken({ memberId: id, tokenType: 'email_verify', ttlHours: 1 });

    expect(await svc.verifyEmailByToken(first.rawToken)).not.toBeNull();
    const onboarding = (await import('../../src/services/memberOnboardingService')).memberOnboardingService;
    onboarding.completeTask(id, 'personal_details');
    expect(await svc.verifyEmailByToken(second.rawToken)).not.toBeNull();
    expect(taskRows(id)).toEqual([
      { task_type: 'club_affiliations', state: 'pending' },
      { task_type: 'legacy_claim',      state: 'pending' },
      { task_type: 'personal_details',  state: 'completed' },
    ]);
  });
});
