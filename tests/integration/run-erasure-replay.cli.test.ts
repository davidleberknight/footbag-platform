/**
 * The erasure-replay entry point the restore path runs before a restored
 * database takes traffic.
 *
 * Contract: it re-applies every erasure whose conditions the snapshot still
 * carries (a soft-deleted account past its grace window has its personal data
 * purged again), reports zero and succeeds when there is nothing to replay, and
 * exits non-zero with a line naming the failure when an account could not be
 * re-erased, so the operator restoring the database knows to act by hand.
 *
 * Cases run in file order: the success cases see a clean database, the payment
 * and outbox failure cases each arm a fault that is disarmed before the next
 * case, and the account failure case seeds its own permanently failing row last.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember, insertPayment, insertOutboxEmail } from '../fixtures/factories';
import { armWriteFault } from '../fixtures/faultInjection';
import { expectLoggedError } from '../setup-env';

const { dbPath } = setTestEnv('4231');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let replay: typeof import('../../src/runErasureReplay');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  // Soft-deleted long enough ago to be past any configured grace window, with
  // personal data still on the row, as an older snapshot would carry it.
  insertMember(db, {
    id: 'erase-restored',
    slug: 'erase_restored',
    login_email: 'erase-restored@example.com',
    deleted_at: '2020-01-01T00:00:00.000Z',
  });
  db.close();
  replay = await import('../../src/runErasureReplay');
});

afterAll(() => cleanupTestDb(dbPath));

function loginEmailOf(id: string): unknown {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return (db.prepare('SELECT login_email FROM members WHERE id = ?').get(id) as { login_email: unknown }).login_email;
  } finally {
    db.close();
  }
}

function captureStdout(): { lines: () => string; restore: () => void } {
  const chunks: string[] = [];
  const spy = vi.spyOn(process.stdout, 'write').mockImplementation((chunk: string | Uint8Array) => {
    chunks.push(String(chunk));
    return true;
  });
  return { lines: () => chunks.join(''), restore: () => spy.mockRestore() };
}

describe('runErasureReplay', () => {
  // Defect caught: a restore from an older snapshot serves a member's erased
  // personal data because the replay did not re-apply the erasure.
  it('re-erases an account the restored snapshot still carries, and succeeds', async () => {
    expect(loginEmailOf('erase-restored')).toBe('erase-restored@example.com');
    const out = captureStdout();
    let code: number;
    try {
      code = await replay.runErasureReplay();
    } finally {
      out.restore();
    }
    expect(code).toBe(0);
    expect(loginEmailOf('erase-restored')).not.toBe('erase-restored@example.com');
    expect(out.lines()).toMatch(/accounts purged=1\b/);
    expect(out.lines()).toContain('erasure-replay: ok');
  });

  // Defect caught: the restore path cannot run the replay unconditionally,
  // because a second run on an already-replayed database reports a failure.
  it('is a no-op that succeeds when there is nothing left to replay', async () => {
    const out = captureStdout();
    let code: number;
    try {
      code = await replay.runErasureReplay();
    } finally {
      out.restore();
    }
    expect(code).toBe(0);
    expect(out.lines()).toMatch(/accounts purged=0\b/);
  });

  // Defect caught: a payment past its retention window keeps the member-linking
  // fields the scan failed to strip, and the replay still reports success, so
  // the restored site takes traffic with that link back.
  it('exits non-zero and names the failure when an aged payment cannot be anonymised', async () => {
    const db = new BetterSqlite3(dbPath);
    try {
      insertMember(db, { id: 'erase-payer', slug: 'erase_payer' });
      insertPayment(db, { member_id: 'erase-payer', created_at: '2000-01-01T00:00:00.000Z' });
    } finally {
      db.close();
    }
    expectLoggedError('audit: payment.compliance_anonymize_failed');
    expectLoggedError('erasure replay: some rows could not be re-applied');
    const fault = armWriteFault(dbPath, { table: 'payments', op: 'UPDATE' });
    const out = captureStdout();
    let code: number;
    try {
      code = await replay.runErasureReplay();
    } finally {
      out.restore();
      fault.disarm();
    }
    expect(code).toBe(1);
    expect(out.lines()).toContain('erasure-replay: FAILED for 1 row(s)');
    expect(out.lines()).toMatch(/payments anonymised=0 \(eligible=1, failed=1\)/);
  });

  // Defect caught: per-recipient outbox copies past retention, each holding a
  // recipient address, survive a failed cleanup while the replay reports
  // success. Runs after the payment case, whose row the fault no longer blocks.
  it('exits non-zero and names the failure when aged outbox copies cannot be deleted', async () => {
    const db = new BetterSqlite3(dbPath);
    try {
      insertOutboxEmail(db, { status: 'sent', sent_at: '2000-01-01T00:00:00.000Z' });
    } finally {
      db.close();
    }
    expectLoggedError('audit: email.outbox_retention_cleanup_failed');
    expectLoggedError('erasure replay: some rows could not be re-applied');
    const fault = armWriteFault(dbPath, { table: 'outbox_emails', op: 'DELETE' });
    const out = captureStdout();
    let code: number;
    try {
      code = await replay.runErasureReplay();
    } finally {
      out.restore();
      fault.disarm();
    }
    expect(code).toBe(1);
    expect(out.lines()).toContain('erasure-replay: FAILED for 1 row(s)');
    expect(out.lines()).toMatch(/outbox copies failed=1\b/);
  });

  // Defect caught: an erasure that failed to re-apply is reported as success,
  // so the operator lets the site take traffic with that member's data back.
  it('exits non-zero and names the failure when an account cannot be re-erased', async () => {
    const db = new BetterSqlite3(dbPath);
    try {
      // The purge anonymises the slug to a fixed form; a row already holding
      // that form makes this account's purge fail.
      insertMember(db, { id: 'm-err', slug: 'm_err', deleted_at: '2020-01-01T00:00:00.000Z' });
      insertMember(db, { id: 'm-err-collider', slug: 'removed_merr' });
    } finally {
      db.close();
    }
    expectLoggedError('audit: member.pii_erasure_failed');
    expectLoggedError('erasure replay: some rows could not be re-applied');
    const out = captureStdout();
    let code: number;
    try {
      code = await replay.runErasureReplay();
    } finally {
      out.restore();
    }
    expect(code).toBe(1);
    expect(out.lines()).toContain('erasure-replay: FAILED for 1 row(s)');
  });
});
