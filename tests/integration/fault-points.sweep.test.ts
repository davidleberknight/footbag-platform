/**
 * A failure after the platform has already reached outside itself loses
 * nothing, doubles nothing, and reports nothing done that is not.
 *
 * The inventory in `tests/fixtures/faultPoints.ts` names every adapter call in
 * the services and what follows it. The first half of this file holds that
 * inventory to the source: an adapter call site, or a direct network call, the
 * inventory does not account for fails here, so a new external call is
 * classified the day it ships. The second half drives each point the inventory
 * marks as swept by this file: the write after the external call is made to
 * fail once, the outcome is checked, and the same request is retried and
 * checked again. A point recorded as a known defect asserts exactly the
 * violations it was found with, so the fix fails it until the record changes.
 */
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4469');
process.env.PAYMENT_ADAPTER = 'stub';

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';
import { armWriteFault } from '../fixtures/faultInjection';
import { REPO_ROOT, scanSource } from '../fixtures/sourceTree';
import {
  ADAPTER_SITES,
  DIRECT_NETWORK_CALLS,
  WEBHOOK_EVENT_SWEEP,
  type FaultStatus,
} from '../fixtures/faultPoints';

const THIS_FILE = 'tests/integration/fault-points.sweep.test.ts';

beforeAll(async () => {
  createTestDb(dbPath).close();
  await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

beforeEach(async () => {
  const { resetPaymentAdapterForTests } = await import('../../src/adapters/paymentAdapter');
  resetPaymentAdapterForTests();
});

function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

function sweptBy(status: FaultStatus): string | null {
  return 'swept' in status ? status.swept : null;
}

// ── The inventory against the source ────────────────────────────────────────

describe('fault-point inventory', () => {
  // Defect caught: a service gains an adapter call, or loses one, and nobody
  // decides whether a failure after it can lose or double what it records.
  it('accounts for every adapter call site in the services', () => {
    const counted = new Map<string, number>();
    for (const file of scanSource('Adapter()', { roots: ['src/services'], exts: ['.ts'] })) {
      const src = stripComments(readFileSync(path.join(REPO_ROOT, file), 'utf8'));
      for (const m of src.matchAll(/\b(get[A-Z][A-Za-z]*Adapter)\(\)/g)) {
        const key = `${file} ${m[1]}`;
        counted.set(key, (counted.get(key) ?? 0) + 1);
      }
    }
    const declared = new Map<string, number>();
    for (const site of ADAPTER_SITES) {
      const key = `${site.file} ${site.getter}`;
      declared.set(key, (declared.get(key) ?? 0) + 1);
    }
    expect(counted.size, 'the scan found no adapter calls; the scanner is broken').toBeGreaterThan(10);
    const keys = [...new Set([...counted.keys(), ...declared.keys()])].sort();
    const mismatched = keys
      .filter((k) => (counted.get(k) ?? 0) !== (declared.get(k) ?? 0))
      .map((k) => `${k}: ${counted.get(k) ?? 0} in the source, ${declared.get(k) ?? 0} in the inventory`);
    expect(mismatched).toEqual([]);
  });

  // Defect caught: a service reaches the network without an adapter, which
  // the adapter scan above cannot see.
  it('finds no direct network call in the services beyond the ones it names', () => {
    const direct = ['fetch(', 'https.request(', 'http.request(', 'net.connect(']
      .flatMap((needle) => scanSource(needle, { roots: ['src/services'], exts: ['.ts'] }))
      .filter((file) => stripComments(readFileSync(path.join(REPO_ROOT, file), 'utf8'))
        .match(/\b(fetch|https\.request|http\.request|net\.connect)\(/));
    expect([...new Set(direct)].sort()).toEqual(DIRECT_NETWORK_CALLS.map((d) => d.file).sort());
  });

  // Defect caught: a point claims a fault test in a file that does not exist,
  // so the claim is never checked by anything.
  it('names only fault-test files that exist', () => {
    const files = [...ADAPTER_SITES, ...DIRECT_NETWORK_CALLS]
      .map((s) => sweptBy(s.status))
      .filter((f): f is string => f !== null)
      .concat(WEBHOOK_EVENT_SWEEP);
    expect([...new Set(files)].filter((f) => !existsSync(path.join(REPO_ROOT, f)))).toEqual([]);
  });

  // Defect caught: a point marked swept by this file has no driver here, or
  // a driver here describes a point the inventory no longer holds.
  it('has a driver here for exactly the points it marks as swept by this file', () => {
    const marked = ADAPTER_SITES.filter((s) => sweptBy(s.status) === THIS_FILE).map((s) => s.operation).sort();
    expect([...new Set(DRIVERS.map((d) => d.operation))].sort()).toEqual(marked);
  });
});

// ── The points this file sweeps ─────────────────────────────────────────────

let memberSeq = 0;

function openDb(): BetterSqlite3.Database {
  return new BetterSqlite3(dbPath);
}

function count(sql: string, ...args: unknown[]): number {
  const db = openDb();
  try {
    return (db.prepare(sql).get(...args) as { c: number }).c;
  } finally {
    db.close();
  }
}

function freshMember(): string {
  memberSeq += 1;
  const id = `fp-member-${memberSeq}`;
  const db = openDb();
  try {
    insertMember(db, { id, slug: `fp_${memberSeq}`, login_email: `fp${memberSeq}@example.com` });
  } finally {
    db.close();
  }
  return id;
}

async function payments() {
  const { paymentService } = await import('../../src/services/paymentService');
  const mod = await import('../../src/adapters/paymentAdapter');
  mod.getPaymentAdapter();
  return { paymentService, stub: mod.getStubPaymentAdapterForTests()! };
}

async function attempt(fn: () => Promise<unknown>): Promise<{ threw: boolean; message: string; value: unknown }> {
  try {
    return { threw: false, message: '', value: await fn() };
  } catch (err) {
    return { threw: true, message: err instanceof Error ? err.message : String(err), value: undefined };
  }
}

function audited(actionType: string, memberId: string): number {
  return count('SELECT COUNT(*) AS c FROM audit_entries WHERE action_type = ? AND actor_member_id = ?', actionType, memberId);
}

interface Driver {
  /** The inventory operation this drives. */
  operation: string;
  name: string;
  /**
   * Fails the write that follows the external call once, then retries, and
   * returns every way the outcome broke the rule: something lost, doubled, or
   * reported done.
   */
  run: () => Promise<string[]>;
}

/**
 * A checkout start: the provider session is created, then a pending row and
 * an audit row are written. The audit write is the one made to fail.
 */
async function checkoutStart(opts: {
  actionType: string;
  rows: (memberId: string) => number;
  start: (memberId: string) => Promise<unknown>;
}): Promise<string[]> {
  const memberId = freshMember();
  const violations: string[] = [];
  const fault = armWriteFault(dbPath, {
    table: 'audit_entries', op: 'INSERT', when: `NEW.action_type = '${opts.actionType}'`,
  });
  let first;
  try {
    first = await attempt(() => opts.start(memberId));
  } finally {
    fault.disarm();
  }
  if (!first.threw) violations.push('reported success although the audit write failed');
  const rowsAfterFault = opts.rows(memberId);
  const auditAfterFault = audited(opts.actionType, memberId);
  if (rowsAfterFault !== auditAfterFault) {
    violations.push(`after the failed write: ${rowsAfterFault} pending row(s) and ${auditAfterFault} audit row(s)`);
  }
  const retry = await attempt(() => opts.start(memberId));
  if (retry.threw) violations.push(`retry refused: ${retry.message}`);
  const rows = opts.rows(memberId);
  const audits = audited(opts.actionType, memberId);
  if (rows !== 1 || audits !== 1) violations.push(`after the retry: ${rows} pending row(s) and ${audits} audit row(s)`);
  return violations;
}

const DRIVERS: Driver[] = [
  {
    operation: 'startMembershipPurchase',
    name: 'membership checkout start',
    run: async () => {
      const { paymentService } = await payments();
      return checkoutStart({
        actionType: 'payment.checkout_started',
        rows: (m) => count("SELECT COUNT(*) AS c FROM payments WHERE member_id = ? AND status = 'pending'", m),
        start: (m) => paymentService.startMembershipPurchase(m, 'tier1', '/members/x'),
      });
    },
  },
  {
    operation: 'startDonation',
    name: 'one-time donation checkout start',
    run: async () => {
      const { paymentService } = await payments();
      return checkoutStart({
        actionType: 'payment.donation_checkout_started',
        rows: (m) => count("SELECT COUNT(*) AS c FROM payments WHERE member_id = ? AND status = 'pending'", m),
        start: (m) => paymentService.startDonation(m, 2500, null, false, '/x'),
      });
    },
  },
  {
    operation: 'startDonation',
    name: 'recurring donation checkout start',
    run: async () => {
      const { paymentService } = await payments();
      return checkoutStart({
        actionType: 'payment.donation_checkout_started',
        rows: (m) => count('SELECT COUNT(*) AS c FROM recurring_donation_subscriptions WHERE member_id = ?', m),
        start: (m) => paymentService.startDonation(m, 2500, null, true, '/x'),
      });
    },
  },
  {
    operation: 'cancelRecurringDonation',
    name: 'recurring donation cancellation',
    run: async () => {
      const { paymentService, stub } = await payments();
      const memberId = freshMember();
      const { sessionId } = await paymentService.startDonation(memberId, 2500, null, true, '/x');
      const evt = stub.buildSignedStubWebhookEvent(sessionId);
      expect(paymentService.handleWebhook(evt.rawBody, evt.signature)).toEqual({ outcome: 'processed' });
      const db = openDb();
      const sub = db.prepare('SELECT stripe_subscription_id AS s FROM recurring_donation_subscriptions WHERE member_id = ?')
        .get(memberId) as { s: string };
      db.close();

      const actionType = 'payment.recurring_cancel_requested';
      const requested = () => count(
        "SELECT COUNT(*) AS c FROM recurring_donation_subscription_transitions WHERE member_id = ? AND lifecycle_event_code = 'cancel_requested'",
        memberId,
      );
      const told = () => count(
        "SELECT COUNT(*) AS c FROM outbox_emails WHERE recipient_member_id = ? AND template_key = 'donation_subscription_cancel_requested'",
        memberId,
      );
      const violations: string[] = [];
      const fault = armWriteFault(dbPath, { table: 'audit_entries', op: 'INSERT', when: `NEW.action_type = '${actionType}'` });
      let first;
      try {
        first = await attempt(() => paymentService.cancelRecurringDonation(memberId, sub.s));
      } finally {
        fault.disarm();
      }
      if (!first.threw) violations.push('reported success although the audit write failed');
      if (requested() !== audited(actionType, memberId)) {
        violations.push(`after the failed write: ${requested()} recorded request(s) and ${audited(actionType, memberId)} audit row(s)`);
      }
      const retry = await attempt(() => paymentService.cancelRecurringDonation(memberId, sub.s));
      if (retry.threw) violations.push(`retry refused: ${retry.message}`);
      if (requested() !== 1 || audited(actionType, memberId) !== 1) {
        violations.push(`after the retry: ${requested()} recorded request(s) and ${audited(actionType, memberId)} audit row(s)`);
      }
      if (told() !== 1) violations.push(`after the retry: the member was told ${told()} time(s)`);
      return violations;
    },
  },
];

/**
 * The violations each known-defect driver was found with. Exact, so a fix, or
 * a change in how the defect shows, fails the row until this is updated with
 * the inventory entry.
 */
const KNOWN_VIOLATIONS: Record<string, string[]> = {
  'membership checkout start': [
    'after the failed write: 1 pending row(s) and 0 audit row(s)',
    'retry refused: A membership purchase is already in progress. Complete or cancel it before starting another.',
    'after the retry: 1 pending row(s) and 0 audit row(s)',
  ],
  'one-time donation checkout start': [
    'after the failed write: 1 pending row(s) and 0 audit row(s)',
    'after the retry: 2 pending row(s) and 1 audit row(s)',
  ],
  'recurring donation checkout start': [
    'after the failed write: 1 pending row(s) and 0 audit row(s)',
    'after the retry: 2 pending row(s) and 1 audit row(s)',
  ],
  'recurring donation cancellation': [
    'after the failed write: 1 recorded request(s) and 0 audit row(s)',
    'after the retry: 1 recorded request(s) and 0 audit row(s)',
    'after the retry: the member was told 0 time(s)',
  ],
};

describe('fault points swept here', () => {
  for (const d of DRIVERS) {
    // Defect caught: a write that follows a provider call fails and leaves a
    // record lost, doubled, or reported done; or the retry does not land the
    // outcome exactly once.
    it(`${d.name}: a failed write after the provider call loses, doubles and misreports nothing`, async () => {
      const site = ADAPTER_SITES.find((s) => s.operation === d.operation)!;
      const known = 'knownDefect' in site.status;
      const violations = await d.run();
      expect(violations, known ? `recorded defect: ${(site.status as { knownDefect: string }).knownDefect}` : d.name)
        .toEqual(known ? (KNOWN_VIOLATIONS[d.name] ?? ['(no violations recorded)']) : []);
    });
  }
});
