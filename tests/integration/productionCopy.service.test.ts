/**
 * A copy of the production database keeps everything except credentials and
 * payment-provider identifiers, and refuses any snapshot it cannot follow.
 *
 * The copy is built from a snapshot table by table, following the column
 * register. The snapshot here is a database built from the schema with a row
 * of every sensitive kind, seeded beside ordinary member data; each case reads
 * the finished copy and checks one removal, or one thing that must survive it.
 * The builder's own connection is this file's database, which starts empty,
 * because the copy is built into a fresh file.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import argon2 from 'argon2';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { scratchPath, removeScratch } from '../fixtures/scratchDir';
import {
  insertAccountToken,
  insertAuditEntry,
  insertMember,
  insertOutboxEmail,
  insertPayment,
  insertRecurringDonationSubscription,
  insertRecurringDonationTransition,
  insertReconciliationIssue,
  insertStripeEvent,
  insertSystemConfig,
  insertWorkQueueItem,
} from '../fixtures/factories';
import { COPY_COLUMN_REGISTER, isCopied } from '../../src/lib/copyColumnRegister';
import {
  NEVER_VERIFYING_PASSWORD_HASH,
  PRODUCTION_COPY_CONFIG_KEY,
  PROVIDER_ID_PLACEHOLDER,
  TOKEN_LINK_TEMPLATE_KEYS,
} from '../../src/lib/productionCopy';

const { dbPath } = setTestEnv('3628');
const sourcePath = scratchPath('copy-source', '.db');
const unclassifiedSourcePath = scratchPath('copy-source-unclassified', '.db');
const unreadableSourcePath = scratchPath('copy-source-unreadable', '.db');

// Imported after the environment is set, so the database module opens this
// file's own, empty database.
let service: typeof import('../../src/services/productionCopyService');
let dbModule: typeof import('../../src/db/db');

const LIVE_EMAIL = 'copied.live@example.com';
const ids: Record<string, string> = {};

beforeAll(async () => {
  const src = createTestDb(sourcePath);
  ids.member = insertMember(src, {
    slug: 'copied_live', login_email: LIVE_EMAIL, display_name: 'Copied Live Member',
    stripe_customer_id: 'cus_LIVECUSTOMER01',
  });
  ids.purged = insertMember(src, { slug: 'copied_purged', personal_data_purged_at: '2026-01-01T00:00:00.000Z' });
  // Production always has a serving administrator; without one the admin-loss
  // job reports that nobody can administer the site, on the source as on the copy.
  ids.admin = insertMember(src, { slug: 'copied_admin', is_admin: 1 });
  insertAccountToken(src, ids.member, { token_type: 'password_reset' });

  ids.pending = insertOutboxEmail(src, { recipient_member_id: ids.member, recipient_email: LIVE_EMAIL, status: 'pending', template_key: 'tier_change', body_text: 'not sent yet' });
  ids.sentVerify = insertOutboxEmail(src, { recipient_member_id: ids.member, recipient_email: LIVE_EMAIL, status: 'sent', sent_at: '2026-10-01T00:00:00.000Z', template_key: 'account_verify', body_text: 'Verify at https://footbag.org/verify/raw-token-value' });
  ids.sentPlain = insertOutboxEmail(src, { recipient_member_id: ids.member, recipient_email: LIVE_EMAIL, status: 'sent', sent_at: '2026-10-01T00:00:00.000Z', template_key: 'tier_change', body_text: 'Your tier changed.' });

  ids.payment = insertPayment(src, {
    member_id: ids.member, status: 'succeeded',
    stripe_payment_intent_id: 'pi_LIVEINTENT0001', stripe_customer_id: 'cus_LIVECUSTOMER01',
    metadata_json: JSON.stringify({ stripe_charge_id: 'ch_LIVECHARGE0001', nested: { stripeInvoiceId: 'in_LIVEINVOICE01', kept: 'yes' }, receipt: 'kept', note: 'ch_LIVECHARGE0002' }),
  });
  ids.event = insertStripeEvent(src, { event_id: 'evt_LIVEEVENT00001' });
  ids.subscription = insertRecurringDonationSubscription(src, {
    member_id: ids.member, status: 'active',
    stripe_customer_id: 'cus_LIVECUSTOMER01', stripe_subscription_id: 'sub_LIVESUBSCRIP01',
    last_stripe_event_id: ids.event,
  });
  insertRecurringDonationTransition(src, {
    recurring_subscription_id: ids.subscription, member_id: ids.member,
    stripe_subscription_id: 'sub_LIVESUBSCRIP01', lifecycle_event_code: 'activated', new_status: 'active',
  });
  insertReconciliationIssue(src, { payment_id: ids.payment, stripe_payment_intent_id: 'pi_LIVEINTENT0001', details_json: JSON.stringify({ stripePaymentIntentId: 'pi_LIVEINTENT0001', amount_cents: 2500 }) });

  ids.payoutAudit = insertAuditEntry(src, { action_type: 'payment.payout_paid', entity_type: 'stripe_payout', entity_id: 'po_LIVEPAYOUT0001' });
  ids.memberAudit = insertAuditEntry(src, { action_type: 'member.profile_updated', entity_type: 'member', entity_id: ids.member, metadata: { fields: ['bio'] } });
  ids.disputeItem = insertWorkQueueItem(src, { entity_type: 'stripe_dispute', entity_id: 'dp_LIVEDISPUTE01', detail_text: 'Dispute dp_LIVEDISPUTE01 opened' });
  insertSystemConfig(src, { config_key: 'post_cutover', value_json: '1' });
  insertSystemConfig(src, { config_key: 'copy_test_other_setting', value_json: '42' });
  ids.openingSubscription = insertRecurringDonationSubscription(src, {
    member_id: ids.member, status: 'incomplete', stripe_subscription_id: null,
  });
  src.close();

  // A snapshot whose JSON column holds text that is not JSON, so the load
  // itself fails part way through.
  const unreadable = createTestDb(unreadableSourcePath);
  const unreadableMember = insertMember(unreadable, { slug: 'unreadable_json' });
  insertPayment(unreadable, { member_id: unreadableMember, metadata_json: 'not json at all' });
  unreadable.close();

  // A snapshot whose schema has a column the register never decided on.
  const unclassified = createTestDb(unclassifiedSourcePath);
  unclassified.exec('ALTER TABLE members ADD COLUMN recovery_code TEXT');
  unclassified.close();

  service = await import('../../src/services/productionCopyService');
  dbModule = await import('../../src/db/db');
});

afterAll(() => {
  dbModule?.checkpointAndCloseDatabase();
  cleanupTestDb(dbPath);
  removeScratch(sourcePath);
  removeScratch(unclassifiedSourcePath);
  removeScratch(unreadableSourcePath);
});

function one<T>(sql: string, ...params: unknown[]): T {
  return dbModule.db.prepare(sql).get(...params) as T;
}

describe('production copy: refusals before anything is written', () => {
  // Defect caught: a column added to production with nobody deciding what a
  // copy does with it, a recovery code say, reaches every copy.
  it('refuses a snapshot holding a column the register does not name, and writes nothing', () => {
    let refusal: unknown;
    try {
      service.productionCopyService.buildFromSnapshot(unclassifiedSourcePath);
    } catch (err) {
      refusal = err;
    }
    expect(refusal).toBeInstanceOf(service.ProductionCopyRefusal);
    expect((refusal as InstanceType<typeof service.ProductionCopyRefusal>).reasons)
      .toContain('column members.recovery_code is not in the register');
    expect(one<{ n: number }>('SELECT COUNT(*) AS n FROM main.sqlite_master').n).toBe(0);
  });

  // Defect caught: a load that fails part way commits what it had loaded, so
  // a partial copy, its tables already created, is left behind as a copy.
  it('leaves nothing behind when the load fails part way, on text it cannot inspect', () => {
    expect(() => service.productionCopyService.buildFromSnapshot(unreadableSourcePath))
      .toThrow(/not JSON/);
    expect(one<{ n: number }>('SELECT COUNT(*) AS n FROM main.sqlite_master').n).toBe(0);
  });
});

describe('production copy: the built copy', () => {
  beforeAll(() => {
    service.productionCopyService.buildFromSnapshot(sourcePath, new Date('2026-11-22T12:00:00.000Z'));
    service.productionCopyService.settle();
  });

  // Defect caught: a copied password hash is a working credential on staging.
  it('replaces every live password hash with one no password verifies, and leaves a purged account empty', async () => {
    const live = one<{ password_hash: string }>('SELECT password_hash FROM members WHERE id = ?', ids.member);
    expect(live.password_hash).toBe(NEVER_VERIFYING_PASSWORD_HASH);
    await expect(argon2.verify(live.password_hash, 'any password at all')).resolves.toBe(false);
    expect(one<{ password_hash: string | null }>('SELECT password_hash FROM members WHERE id = ?', ids.purged).password_hash).toBeNull();
  });

  // Defect caught: the copy masks or drops the member data a rehearsal needs.
  it('keeps member personal data as it stands', () => {
    const live = one<{ login_email: string; display_name: string }>('SELECT login_email, display_name FROM members WHERE id = ?', ids.member);
    expect(live).toEqual({ login_email: LIVE_EMAIL, display_name: 'Copied Live Member' });
  });

  // Defect caught: a working sign-in token, or the provider's event ledger,
  // reaches a copy.
  it('copies no account token and no provider event', () => {
    expect(one<{ n: number }>('SELECT COUNT(*) AS n FROM account_tokens').n).toBe(0);
    expect(one<{ n: number }>('SELECT COUNT(*) AS n FROM stripe_events').n).toBe(0);
  });

  // Defect caught: staging's mail worker delivers a production message that
  // was still waiting to go out, or a sent verification body hands over a
  // plaintext token.
  it('leaves unsent mail behind, clears token-bearing sent bodies, and keeps other sent mail whole', () => {
    expect(one<{ n: number }>('SELECT COUNT(*) AS n FROM outbox_emails WHERE id = ?', ids.pending).n).toBe(0);
    const verify = one<{ body_text: string | null; recipient_email: string }>('SELECT body_text, recipient_email FROM outbox_emails WHERE id = ?', ids.sentVerify);
    expect(verify).toEqual({ body_text: null, recipient_email: LIVE_EMAIL });
    const plain = one<{ body_text: string | null }>('SELECT body_text FROM outbox_emails WHERE id = ?', ids.sentPlain);
    expect(plain.body_text).toBe('Your tier changed.');
  });

  // Defect caught: a copy links a test environment to a real customer,
  // charge or subscription at the provider.
  it('clears every provider identifier from payments and members, and from the JSON they carry', () => {
    const pay = one<{ stripe_payment_intent_id: string | null; stripe_customer_id: string | null; metadata_json: string }>(
      'SELECT stripe_payment_intent_id, stripe_customer_id, metadata_json FROM payments WHERE id = ?', ids.payment);
    expect(pay.stripe_payment_intent_id).toBeNull();
    expect(pay.stripe_customer_id).toBeNull();
    expect(JSON.parse(pay.metadata_json)).toEqual({ nested: { kept: 'yes' }, receipt: 'kept', note: PROVIDER_ID_PLACEHOLDER });
    expect(one<{ stripe_customer_id: string | null }>('SELECT stripe_customer_id FROM members WHERE id = ?', ids.member).stripe_customer_id).toBeNull();
    const issue = one<{ details_json: string }>('SELECT details_json FROM reconciliation_issues WHERE payment_id = ?', ids.payment);
    expect(JSON.parse(issue.details_json)).toEqual({ amount_cents: 2500 });
  });

  // Defect caught: an active subscription in the copy names no provider
  // subscription, breaking the constraint, or keeps naming the real one.
  it('ends every billing subscription and names no provider subscription in its ledger', () => {
    const sub = one<{ status: string; stripe_subscription_id: string | null; stripe_customer_id: string | null; last_stripe_event_id: string | null }>(
      'SELECT status, stripe_subscription_id, stripe_customer_id, last_stripe_event_id FROM recurring_donation_subscriptions WHERE id = ?', ids.subscription);
    expect(sub).toEqual({ status: 'canceled', stripe_subscription_id: null, stripe_customer_id: null, last_stripe_event_id: null });
    const ledger = one<{ stripe_subscription_id: string }>(
      'SELECT stripe_subscription_id FROM recurring_donation_subscription_transitions WHERE recurring_subscription_id = ?', ids.subscription);
    expect(ledger.stripe_subscription_id).toBe(PROVIDER_ID_PLACEHOLDER);
    // A subscription that never started billing keeps its own status.
    expect(one<{ status: string }>('SELECT status FROM recurring_donation_subscriptions WHERE id = ?', ids.openingSubscription).status)
      .toBe('incomplete');
  });

  // Defect caught: the audit log or the work queue names a real payout or
  // dispute, or the copy blanks rows that name no provider object.
  it('replaces provider objects named in the audit log and the work queue, and only those', () => {
    expect(one<{ entity_id: string }>('SELECT entity_id FROM audit_entries WHERE id = ?', ids.payoutAudit).entity_id).toBe(PROVIDER_ID_PLACEHOLDER);
    expect(one<{ entity_id: string }>('SELECT entity_id FROM audit_entries WHERE id = ?', ids.memberAudit).entity_id).toBe(ids.member);
    const item = one<{ entity_id: string; detail_text: string | null }>('SELECT entity_id, detail_text FROM work_queue_items WHERE id = ?', ids.disputeItem);
    expect(item).toEqual({ entity_id: PROVIDER_ID_PLACEHOLDER, detail_text: null });
  });

  // Defect caught: a copy behaves as the live production database, so the
  // rebuild guards refuse staging, and the test routes reach real members.
  it('resets the cutover marker, keeps every other setting, and marks itself a copy', () => {
    expect(one<{ value_json: string }>(`SELECT value_json FROM system_config_current WHERE config_key = 'post_cutover'`).value_json).toBe('0');
    expect(one<{ value_json: string }>(`SELECT value_json FROM system_config_current WHERE config_key = 'copy_test_other_setting'`).value_json).toBe('42');
    expect(one<{ value_json: string }>('SELECT value_json FROM system_config_current WHERE config_key = ?', PRODUCTION_COPY_CONFIG_KEY).value_json)
      .toBe('{"copied_at":"2026-11-22T12:00:00.000Z"}');
  });

  // Defect caught: the copy loses its indexes, views or append-only
  // triggers, so it is not at production's schema.
  it('carries every index, view and trigger the snapshot defines', () => {
    const counts = (schema: string) => dbModule.db.prepare(
      `SELECT type, COUNT(*) AS n FROM ${schema}.sqlite_master WHERE sql IS NOT NULL GROUP BY type ORDER BY type`).all();
    dbModule.db.prepare('ATTACH DATABASE ? AS source_check').run(sourcePath);
    try {
      expect(counts('main')).toEqual(counts('source_check'));
    } finally {
      dbModule.db.exec('DETACH DATABASE source_check');
    }
  });

  // Defect caught: a second build runs over a database that already holds data.
  it('refuses to build into a file that already holds a schema', () => {
    expect(() => service.productionCopyService.buildFromSnapshot(sourcePath))
      .toThrow(/already holds a schema/);
  });

  // Defect caught: a job on staging fails on a copied row, a payment whose
  // provider identifiers the copy cleared among them.
  it('runs every scheduled job over the copy without a failure', async () => {
    const { JOBS } = await import('../../src/services/jobRegistry');
    const { runRegistryJobNow } = await import('../../src/testkit/runRegistryJob');
    const failed: string[] = [];
    for (const job of JOBS) {
      if (job.name === 'SYS_Reclaim_Expired_Media_Jobs') continue;
      const result = await runRegistryJobNow(job.name, { now: new Date('2026-11-22T12:00:00.000Z') });
      if (result.status !== 'ran') failed.push(`${job.name}: ${result.error}`);
    }
    expect(failed).toEqual([]);
  });
});

describe('production copy: the plan agrees with the register', () => {
  // Defect caught: a column the register marks rewrite has no expression, so
  // the copy would write nothing sensible there, or an expression outlives its
  // register entry.
  it('holds a rewrite expression for exactly the columns the register marks rewrite', () => {
    const registered = Object.entries(COPY_COLUMN_REGISTER).flatMap(([table, entry]) =>
      isCopied(entry) ? Object.keys(entry.rewrite ?? {}).map((c) => `${table}.${c}`) : []).sort();
    const expressed = Object.entries(dbModule.PRODUCTION_COPY_REWRITES).flatMap(([table, cols]) =>
      Object.keys(cols).map((c) => `${table}.${c}`)).sort();
    expect(expressed).toEqual(registered);
  });

  // Defect caught: a new template carries a verification or reset link and
  // the copy keeps its sent bodies, plaintext tokens included.
  it('clears the bodies of every template carrying a one-time link', async () => {
    const { TEMPLATE_VARIANTS } = await import('../../src/services/emailTemplateRegistry');
    const tokenLinkFields = ['verifyUrl', 'resetUrl'];
    const carrying = Object.entries(TEMPLATE_VARIANTS)
      .filter(([, def]) => def.mergeFields.some((f) => tokenLinkFields.includes(f)))
      .map(([key]) => key).sort();
    expect([...TOKEN_LINK_TEMPLATE_KEYS].sort()).toEqual(carrying);
  });
});
