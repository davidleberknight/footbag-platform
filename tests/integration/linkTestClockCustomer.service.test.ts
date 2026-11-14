/**
 * Linking a test-clock Stripe customer to a member, and the entry point the
 * operator script runs inside the container.
 *
 * The link exists so the payment rehearsal on pre-cutover production can drive a
 * genuine renewal: a test clock attaches to a customer only when the customer is
 * created, and a member's recurring checkout reuses the customer stored on their
 * record. Written wrongly, it either re-points a real donor's canonical Stripe
 * customer (splitting their history across two provider records) or runs
 * somewhere real money moves. So the cases are the refusals, each beside the run
 * it lets through, and proof that the one write lands where the recurring
 * checkout reads.
 */
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';

import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertMember } from '../fixtures/factories';

const { dbPath } = setTestEnv('4146');
process.env.PAYMENT_ADAPTER = 'stub';

const FREE = 'clock_free';
const HELD = 'clock_held';
const DECEASED = 'clock_deceased';
const LINKED_CUSTOMER = 'cus_gold00000101';
const HELD_CUSTOMER = 'cus_gold00000102';
const RUNNER = 'clock_runner';
const RUNNER_CUSTOMER = 'cus_gold00000103';

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let svc: typeof import('../../src/services/paymentService').paymentService;
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let adapterMod: typeof import('../../src/adapters/paymentAdapter');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let runner: typeof import('../../src/runLinkTestClockCustomer');
// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let errors: typeof import('../../src/services/serviceErrors');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: 'member-clock-free', slug: FREE, login_email: 'clock-free@example.invalid' });
  insertMember(db, {
    id: 'member-clock-held', slug: HELD, login_email: 'clock-held@example.invalid',
    stripe_customer_id: HELD_CUSTOMER,
  });
  insertMember(db, { id: 'member-clock-runner', slug: RUNNER, login_email: 'clock-runner@example.invalid' });
  insertMember(db, {
    id: 'member-clock-deceased', slug: DECEASED, login_email: 'clock-deceased@example.invalid', is_deceased: 1,
  });
  db.close();
  svc = (await import('../../src/services/paymentService')).paymentService;
  adapterMod = await import('../../src/adapters/paymentAdapter');
  runner = await import('../../src/runLinkTestClockCustomer');
  errors = await import('../../src/services/serviceErrors');
});

afterEach(() => adapterMod.resetPaymentAdapterForTests());
afterAll(() => cleanupTestDb(dbPath));

function member(slug: string): { stripe_customer_id: string | null; version: number; updated_by: string } {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  try {
    return db.prepare('SELECT stripe_customer_id, version, updated_by FROM members WHERE slug = ?').get(slug) as
      { stripe_customer_id: string | null; version: number; updated_by: string };
  } finally {
    db.close();
  }
}

/** The stub with the key mode a live or unread key would report. */
function holdKeyMode(mode: 'live' | 'unknown'): void {
  const stub = adapterMod.getPaymentAdapter();
  adapterMod.setPaymentAdapterForTests({ ...stub, resolveCredentialMode: async () => mode });
}

describe('linkTestClockCustomer: the key mode', () => {
  it('refuses unless the host holds a test key, and writes nothing', async () => {
    // Linking on a live key would re-point a real donor's provider customer on the
    // one host where real money moves.
    for (const mode of ['live', 'unknown'] as const) {
      holdKeyMode(mode);
      const before = member(FREE);
      await expect(svc.linkTestClockCustomer({ memberSlug: FREE, stripeCustomerId: LINKED_CUSTOMER, check: false }))
        .rejects.toThrow(errors.ForbiddenError);
      await expect(svc.linkTestClockCustomer({ memberSlug: FREE, stripeCustomerId: null, check: true }))
        .rejects.toThrow(new RegExp(`reads as ${mode}, not test`));
      expect(member(FREE)).toEqual(before);
    }
  });
});

describe('linkTestClockCustomer: the member and the customer', () => {
  it('checks without writing, then links the customer where the recurring checkout reads it', async () => {
    const check = await svc.linkTestClockCustomer({ memberSlug: FREE, stripeCustomerId: null, check: true });
    expect(check).toEqual({ status: 'would_link', memberId: 'member-clock-free' });
    expect(member(FREE).stripe_customer_id).toBeNull();

    const linked = await svc.linkTestClockCustomer({ memberSlug: FREE, stripeCustomerId: LINKED_CUSTOMER, check: false });
    expect(linked).toEqual({ status: 'linked', memberId: 'member-clock-free', stripeCustomerId: LINKED_CUSTOMER });
    const after = member(FREE);
    expect(after.stripe_customer_id).toBe(LINKED_CUSTOMER);
    expect(after.updated_by).toBe('operator');

    // A repeat of the same link reports what the first one left and writes nothing.
    const again = await svc.linkTestClockCustomer({ memberSlug: FREE, stripeCustomerId: LINKED_CUSTOMER, check: false });
    expect(again).toEqual({ status: 'already_held', memberId: 'member-clock-free', stripeCustomerId: LINKED_CUSTOMER });
    expect(member(FREE).version).toBe(after.version);
  });

  it('never re-points a member who already holds a different customer', async () => {
    // Re-pointing would split a donor's provider history across two customers.
    await expect(svc.linkTestClockCustomer({ memberSlug: HELD, stripeCustomerId: 'cus_gold00000199', check: false }))
      .rejects.toThrow(errors.ConflictError);
    await expect(svc.linkTestClockCustomer({ memberSlug: HELD, stripeCustomerId: null, check: true }))
      .rejects.toThrow(/already holds a Stripe customer/);
    expect(member(HELD).stripe_customer_id).toBe(HELD_CUSTOMER);
  });

  it('refuses a slug no active, living member has', async () => {
    for (const slug of ['nobody_here', DECEASED]) {
      await expect(svc.linkTestClockCustomer({ memberSlug: slug, stripeCustomerId: null, check: true }))
        .rejects.toThrow(errors.NotFoundError);
    }
    expect(member(DECEASED).stripe_customer_id).toBeNull();
  });

  it('refuses anything that is not a Stripe customer id', async () => {
    for (const id of [null, '', 'cus_', 'sub_gold00000001', 'cus_gold 1; DROP']) {
      await expect(svc.linkTestClockCustomer({ memberSlug: FREE, stripeCustomerId: id, check: false }), String(id))
        .rejects.toThrow(errors.ValidationError);
    }
  });
});

describe('runLinkTestClockCustomer: the line the operator script reads', () => {
  function captureStdout(): { lines: string[]; restore: () => void } {
    const lines: string[] = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string) => { lines.push(String(chunk)); return true; }) as typeof process.stdout.write;
    return { lines, restore: () => { process.stdout.write = original; } };
  }

  it('prints the outcome and exits 0, or prints the refusal and exits 1', async () => {
    // The script decides what to record, and whether to delete the clock it made,
    // from this line and this status alone.
    const out = captureStdout();
    let checked: number;
    let refused: number;
    try {
      checked = await runner.runLinkTestClockCustomer({ memberSlug: RUNNER, stripeCustomerId: RUNNER_CUSTOMER, check: false });
      refused = await runner.runLinkTestClockCustomer({ memberSlug: HELD, stripeCustomerId: null, check: true });
    } finally {
      out.restore();
    }
    expect(checked).toBe(0);
    expect(refused).toBe(1);
    expect(out.lines).toEqual([
      `LINK: LINKED member=member-clock-runner customer=${RUNNER_CUSTOMER}\n`,
      'LINK: REFUSED this member already holds a Stripe customer; name a member with no recurring donation yet\n',
    ]);
  });
});
