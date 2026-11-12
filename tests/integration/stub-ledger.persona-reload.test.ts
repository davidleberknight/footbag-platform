/**
 * The stand-in payment provider's shared ledger and the reloads of persona data.
 *
 * The ledger is development and staging test tooling, kept beside the database
 * so the web, worker and testkit processes read one provider. Its contract
 * here: every reload of persona data (a seed that loads personas, every
 * refresh) empties it, so no provider record outlives the test data it belonged
 * to; a seed that loads nothing leaves it alone; a stand-in opened before the
 * reload, as a running web or worker process holds one, goes on recording and
 * reading afterwards; and production never keeps it on disk.
 */
import fs from 'node:fs';
import path from 'node:path';
import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

setTestEnv('4897');
// The database in a directory of this file's own, so the ledger beside it is
// this file's alone: every other suite's persona refresh empties the ledger
// beside its own database.
const scratch = createScratchDir('stub-ledger-reload');
const dbPath = path.join(scratch, 'footbag.db');
process.env.FOOTBAG_DB_PATH = dbPath;
process.env.FOOTBAG_ENV = 'development';

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { insertMember } from '../fixtures/factories';
import { CANONICAL_PERSONAS } from '../../src/testkit/canonicalPersonas';
import { seedPersonas } from '../../src/testkit/personaSeedCore';
import { refreshAllPersonas } from '../../src/testkit/personaRefreshRunner';
import { supertestFetcher } from '../fixtures/crawl/core';
import { runPersonaCommand } from '../fixtures/personaCommand';
import { createStubPaymentAdapter } from '../../src/adapters/paymentAdapter';
import { stubPaymentLedgerDirFor } from '../../src/adapters/stubPaymentLedgerStore';

const ledgerDir = path.join(path.dirname(dbPath), 'stub-payment-provider');
const WINDOW = { createdAfter: '2000-01-01T00:00:00.000Z', createdBefore: '2999-01-01T00:00:00.000Z' };
const checkout = (paymentId: string) => ({
  memberId: 'm-reload-1',
  paymentId,
  amountCents: 2500,
  currency: 'USD',
  descriptor: 'IFPA Donation',
  paymentType: 'donation' as const,
  successUrl: 'https://footbag.org/payments/success?session_id={CHECKOUT_SESSION_ID}',
  cancelUrl: 'https://footbag.org/payments/cancel?session_id={CHECKOUT_SESSION_ID}',
  metadata: {},
});

/** A checkout paid at the stand-in, as a tester's session leaves one. */
async function paidCheckout(paymentId: string): Promise<string> {
  const stub = createStubPaymentAdapter({ ledgerDir });
  const { sessionId, paymentIntentId } = await stub.createCheckoutSession(checkout(paymentId));
  stub.buildSignedStubWebhookEvent(sessionId);
  if (!paymentIntentId) throw new Error('the stand-in returned no payment intent');
  return paymentIntentId;
}

/** Every record file in the ledger, read straight off the disk. */
function recordFiles(): string[] {
  if (!fs.existsSync(ledgerDir)) return [];
  return fs.readdirSync(ledgerDir, { recursive: true }).map(String)
    .filter((f) => f.endsWith('.json'));
}

/** What a process opening the ledger now finds there. */
async function held(): Promise<{ intents: string[]; sessions: number }> {
  const reader = createStubPaymentAdapter({ ledgerDir });
  return {
    intents: (await reader.listPaymentIntents(WINDOW)).map((i) => i.id),
    sessions: reader.sessions.size,
  };
}

beforeAll(() => {
  const d = createTestDb(dbPath);
  // A serving administrator, so the worker's administrator-loss sweep is quiet.
  insertMember(d, {
    id: 'slr_admin', slug: 'slr_admin', login_email: 'slr-admin@example.com',
    is_admin: 1, last_login_at: new Date().toISOString(),
  });
  d.close();
});

afterAll(() => {
  cleanupTestDb(dbPath);
  removeScratch(scratch);
});

describe('a seed that loads personas', () => {
  it('empties the ledger, and a later seed that loads nothing leaves it alone', async () => {
    // Defect: provider records from an earlier session outlive the data they belonged to,
    // or a seed that changed nothing wipes a tester's records.
    const before = await paidCheckout('pay-reload-before-seed');
    expect((await held()).intents, 'the ledger holds a paid checkout').toEqual([before]);

    const seed = await runPersonaCommand('personaSeedRunner', dbPath);
    expect(seed.code, seed.out).toBe(0);
    expect(await held(), 'the seed emptied the ledger').toEqual({ intents: [], sessions: 0 });

    const kept = await paidCheckout('pay-reload-between-seeds');
    const again = await runPersonaCommand('personaSeedRunner', dbPath);
    expect(again.code, again.out).toBe(0);
    expect((await held()).intents, 'a seed that created no persona kept it').toEqual([kept]);
  }, 180_000);
});

describe('a persona refresh', () => {
  it('empties the ledger, and a stand-in opened before it goes on working', async () => {
    // Defect: a refresh leaves old provider records, or breaks the running stack's ledger.
    const running = createStubPaymentAdapter({ ledgerDir });
    const before = await paidCheckout('pay-reload-before-refresh');
    expect((await held()).intents).toContain(before);

    const createApp = await importApp();
    const res = await supertestFetcher(createApp()).post('/dev/personas/refresh', null);
    expect(res.status).toBe(302);
    // Counted on disk, not through a new stand-in: opening one recreates its
    // table directories, which would hide a reload that removed them from
    // under the running one.
    expect(recordFiles(), 'the refresh emptied the ledger').toEqual([]);

    const { sessionId, paymentIntentId } = await running.createCheckoutSession(checkout('pay-reload-after-refresh'));
    running.buildSignedStubWebhookEvent(sessionId);
    expect(await held(), 'the running stand-in still records, and another process reads it')
      .toEqual({ intents: [paymentIntentId], sessions: 1 });
  }, 180_000);
});

describe('what counts as a reload', () => {
  // Each case its own database in the same directory, so the ledger beside it is
  // the one under test. The seed and refresh entries are called directly, with
  // a single persona, to reach the edges the catalog-wide commands do not.
  const spec = CANONICAL_PERSONAS.find((s) => s.slug === 't1_paid')!;
  const current = '$argon2id$v=19$m=65536,t=3,p=4$c2FsdHNhbHQ$aGFzaGhhc2g';
  const freshDb = (name: string): BetterSqlite3.Database => {
    const file = path.join(scratch, `${name}.db`);
    createTestDb(file).close();
    return new BetterSqlite3(file);
  };

  it('a seed that loads a single persona empties the ledger', async () => {
    // Defect: adding one persona to the catalog reloads it without starting the provider over.
    const d = freshDb('one-persona');
    try {
      await paidCheckout('pay-reload-one-persona');
      expect(seedPersonas(d, [spec], current).createdSlugs).toEqual([spec.slug]);
      expect(recordFiles()).toEqual([]);
    } finally {
      d.close();
    }
  });

  it('a seed that only re-hashes a stale password, or fails, leaves the ledger alone', async () => {
    // Defect: a seed that loaded no persona wipes a tester's provider records.
    const d = freshDb('rehash-or-fail');
    try {
      seedPersonas(d, [spec], 'stale-placeholder-hash');
      const kept = await paidCheckout('pay-reload-rehash');
      const healed = seedPersonas(d, [spec], current);
      expect(healed.createdSlugs).toEqual([]);
      expect(healed.healed, 'the stale hash was re-hashed').toBe(1);
      expect((await held()).intents, 'after a re-hash').toEqual([kept]);
    } finally {
      d.close();
    }
    const readOnly = new BetterSqlite3(path.join(scratch, 'rehash-or-fail.db'), { readonly: true });
    try {
      const other = CANONICAL_PERSONAS.find((s) => s.slug === 'admin_t2')!;
      const failed = seedPersonas(readOnly, [other], current);
      expect(failed.failedSlugs, 'the persona could not be written').toEqual([other.slug]);
      expect((await held()).intents.length, 'after a failed seed').toBe(1);
    } finally {
      readOnly.close();
    }
  });

  it('a refresh that rolls back leaves the ledger alone', async () => {
    // Defect: a failed refresh keeps the old persona data but wipes the provider records it points at.
    const d = freshDb('refresh-rollback');
    try {
      seedPersonas(d, [spec], current);
      const kept = await paidCheckout('pay-reload-rollback');
      // A test-owned trigger, so the refresh's member delete fails and its transaction rolls back.
      d.exec(`CREATE TRIGGER test_refuse_member_delete BEFORE DELETE ON members
                BEGIN SELECT RAISE(ABORT, 'refused by the test'); END`);
      expect(() => refreshAllPersonas(d)).toThrow(/refused by the test/);
      expect((await held()).intents.filter((id) => id === kept), 'the rolled-back refresh kept it').toEqual([kept]);
    } finally {
      d.close();
    }
  });
});

describe('where the ledger is kept', () => {
  it('the stand-in the application builds keeps it off a production disk', async () => {
    // Defect: a dark production's stand-in writes member ids to disk because the wiring drops the rule.
    const asProcess = async (footbagEnv: string) => {
      vi.resetModules();
      const real = await import('../../src/config/env');
      vi.doMock('../../src/config/env', () => ({
        ...real, config: { ...real.config, isTestRunner: false, footbagEnv },
      }));
      try {
        const { stubPaymentLedgerDir } = await import('../../src/adapters/paymentAdapter');
        return stubPaymentLedgerDir();
      } finally {
        vi.doUnmock('../../src/config/env');
        vi.resetModules();
      }
    };
    expect(await asProcess('production')).toBeNull();
    expect(await asProcess('staging'), 'staging keeps it beside its database').toBe(ledgerDir);
  });

  it('on disk beside the database for development and staging, never on production', () => {
    // Defect: a dark production writes member ids to a directory no backup or erasure reaches.
    const dbFile = '/srv/footbag/db/footbag.db';
    expect(stubPaymentLedgerDirFor({ isTestRunner: false, footbagEnv: 'development', dbPath: dbFile }))
      .toBe('/srv/footbag/db/stub-payment-provider');
    expect(stubPaymentLedgerDirFor({ isTestRunner: false, footbagEnv: 'staging', dbPath: dbFile }))
      .toBe('/srv/footbag/db/stub-payment-provider');
    expect(stubPaymentLedgerDirFor({ isTestRunner: false, footbagEnv: 'production', dbPath: dbFile })).toBeNull();
    expect(stubPaymentLedgerDirFor({ isTestRunner: true, footbagEnv: 'staging', dbPath: dbFile }), 'the test runner')
      .toBeNull();
  });
});
