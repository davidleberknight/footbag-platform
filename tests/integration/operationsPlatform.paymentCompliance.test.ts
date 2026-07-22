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

function insertPaymentAt(
  id: string,
  createdAt: string,
  memberId: string | null,
  opts: { paymentType?: string; descriptor?: string; donationNote?: string | null } = {},
): void {
  const paymentType = opts.paymentType ?? 'donation';
  const descriptor = opts.descriptor ?? 'A donation';
  const donationNote = opts.donationNote === undefined ? 'note from the member' : opts.donationNote;
  // A membership payment must carry a purchased tier (schema CHECK).
  const purchasedTierStatus = paymentType === 'membership' ? 'tier1' : null;
  db.prepare(`
    INSERT INTO payments (
      id, created_at, created_by, updated_at, updated_by, version,
      member_id, payment_type, amount_cents, currency, status, descriptor,
      purchased_tier_status, donation_note, stripe_payment_intent_id, stripe_customer_id,
      stripe_invoice_id, metadata_json
    ) VALUES (?, ?, 'system', ?, 'system', 1, ?, ?, 500, 'USD', 'succeeded', ?,
              ?, ?, ?, 'cus_x', ?, '{"ip":"1.2.3.4"}')
  `).run(id, createdAt, createdAt, memberId, paymentType, descriptor, purchasedTierStatus, donationNote, `pi_${id}`, `in_${id}`);
}

beforeAll(async () => {
  db = createTestDb(dbPath);
  insertMember(db, { id: 'pc-mem', slug: 'pc_mem' });
  // A donation past retention: its descriptor embeds the donor's note.
  insertPaymentAt('pay-old', '2018-01-01T00:00:00.000Z', 'pc-mem', {
    descriptor: 'Donation: in memory of a dear friend',
  });
  // A membership past retention: its descriptor is a fixed non-personal label.
  insertPaymentAt('pay-old-membership', '2018-02-01T00:00:00.000Z', 'pc-mem', {
    paymentType: 'membership',
    descriptor: 'IFPA Membership (Tier 1)',
    donationNote: null,
  });
  insertPaymentAt('pay-recent', '2026-01-01T00:00:00.000Z', 'pc-mem');  // inside retention
  db.close();
  operationsPlatformService = (await import('../../src/services/operationsPlatformService')).operationsPlatformService;
});

afterAll(() => cleanupTestDb(dbPath));

function paymentRow(id: string) {
  const probe = new BetterSqlite3(dbPath, { readonly: true });
  const row = probe.prepare(`
    SELECT member_id, donation_note, descriptor, stripe_payment_intent_id, stripe_customer_id,
           stripe_invoice_id, metadata_json, amount_cents, payment_type, status
    FROM payments WHERE id = ?
  `).get(id) as Record<string, unknown>;
  probe.close();
  return row;
}

describe('payment compliance cleanup', () => {
  it('anonymizes only payments past the retention window and counts them per type', async () => {
    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });
    expect(result.payments.eligible).toBe(2);
    expect(result.payments.anonymized).toBe(2);
    expect(result.payments.errors).toHaveLength(0);

    const old = paymentRow('pay-old');
    expect(old.member_id).toBeNull();
    expect(old.donation_note).toBeNull();
    expect(old.stripe_payment_intent_id).toBeNull();
    expect(old.stripe_customer_id).toBeNull();
    expect(old.stripe_invoice_id).toBeNull();
    expect(old.metadata_json).toBe('{}');
    // The donation descriptor embedded the note, so it is reset to a neutral
    // constant, removing the note that also lived in donation_note.
    expect(old.descriptor).toBe('Donation');
    // The anonymized financial record is preserved.
    expect(old.amount_cents).toBe(500);
    expect(old.payment_type).toBe('donation');
    expect(old.status).toBe('succeeded');

    // A membership descriptor carries no personal data; it is left intact while
    // the member link is still severed.
    const membership = paymentRow('pay-old-membership');
    expect(membership.member_id).toBeNull();
    expect(membership.descriptor).toBe('IFPA Membership (Tier 1)');
    expect(membership.payment_type).toBe('membership');

    const recent = paymentRow('pay-recent');
    expect(recent.member_id).toBe('pc-mem');
    expect(recent.donation_note).toBe('note from the member');
    expect(recent.descriptor).toBe('A donation');
  });

  it('is idempotent: a second pass finds nothing eligible', async () => {
    const result = await operationsPlatformService.runPiiPurgeScan({ now: NOW });
    expect(result.payments.eligible).toBe(0);
    expect(result.payments.anonymized).toBe(0);
  });
});
