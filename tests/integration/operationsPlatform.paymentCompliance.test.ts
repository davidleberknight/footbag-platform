/**
 * Payment compliance cleanup branch of the soft-deleted-records job: payments
 * older than the retention window have their member-linking PII anonymized
 * while the financial record is preserved; payments inside the window are
 * untouched; re-runs are no-ops. Vote ballots are out of scope by design
 * (preserve-only window; destroying IFPA vote records is a governance action).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('3203');

// Scan time; the seeded retention window is 2555 days (~7 years), so the cutoff
// is mid-2019. The 2018 payment is past it; the 2026 payment is inside it.
const NOW = new Date('2026-06-01T00:00:00.000Z');

let db: BetterSqlite3.Database;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let operationsPlatformService: typeof import('../../src/services/operationsPlatformService').operationsPlatformService;

function insertPaymentAt(id: string, createdAt: string, memberId: string | null): void {
  db.prepare(`
    INSERT INTO payments (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, payment_type, amount_cents, currency, status, descriptor,
      donation_note, stripe_payment_intent_id, stripe_customer_id, metadata_json
    ) VALUES (?, ?, 'system', ?, 'system', 1, ?, 'donation', 500, 'USD', 'succeeded', 'A donation',
              'note from the member', ?, 'cus_x', '{"ip":"1.2.3.4"}')
  `).run(id, createdAt, createdAt, memberId, `pi_${id}`);
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'pc-mem', slug: 'pc_mem' });
  insertPaymentAt('pay-old', '2018-01-01T00:00:00.000Z', 'pc-mem');     // past retention
  insertPaymentAt('pay-recent', '2026-01-01T00:00:00.000Z', 'pc-mem');  // inside retention
  db.close();
  operationsPlatformService = (await import('../../src/services/operationsPlatformService')).operationsPlatformService;
});

afterAll(() => cleanupTestDb(dbPath));

function paymentRow(id: string) {
  const probe = new BetterSqlite3(dbPath, { readonly: true });
  const row = probe.prepare(`
    SELECT member_id, donation_note, stripe_payment_intent_id, stripe_customer_id,
           metadata_json, amount_cents, payment_type, status
    FROM payments WHERE id = ?
  `).get(id) as Record<string, unknown>;
  probe.close();
  return row;
}

describe('payment compliance cleanup', () => {
  it('anonymizes only payments past the retention window and counts them per type', async () => {
    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });
    expect(result.payments.eligible).toBe(1);
    expect(result.payments.anonymized).toBe(1);
    expect(result.payments.errors).toHaveLength(0);

    const old = paymentRow('pay-old');
    expect(old.member_id).toBeNull();
    expect(old.donation_note).toBeNull();
    expect(old.stripe_payment_intent_id).toBeNull();
    expect(old.stripe_customer_id).toBeNull();
    expect(old.metadata_json).toBe('{}');
    // The anonymized financial record is preserved.
    expect(old.amount_cents).toBe(500);
    expect(old.payment_type).toBe('donation');
    expect(old.status).toBe('succeeded');

    const recent = paymentRow('pay-recent');
    expect(recent.member_id).toBe('pc-mem');
    expect(recent.donation_note).toBe('note from the member');
  });

  it('is idempotent: a second pass finds nothing eligible', async () => {
    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });
    expect(result.payments.eligible).toBe(0);
    expect(result.payments.anonymized).toBe(0);
  });
});
