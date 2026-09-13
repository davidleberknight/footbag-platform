/**
 * Admin system parameters: GET /admin/system-parameters, POST
 * /admin/system-parameters, POST /admin/system-parameters/pricing.
 *
 * An admin-only surface over the runtime-mutable configuration store. The
 * store is append-only and effective-dated, so a change is a new row
 * superseding the old one and the current value is the latest row whose start
 * date has arrived. Every change carries the acting administrator and a
 * required reason, and appends one audit entry in the same transaction as the
 * configuration row. Values are validated against the safe range for their key
 * before anything is stored. Membership prices are changed by scheduling a new
 * one from a start date, never by editing an entry that already exists. The
 * three emergency switches are displayed read-only, because the application
 * has no write path to them and a system administrator sets them by script.
 *
 * This suite pins the admin gate, the rendered surface, the audited append,
 * the validation floors and the cross-field reminder rule, overposting safety
 * on the read-only switches, and the price schedule with its conflict and
 * past-date refusals.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('4147');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000sp01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000sp02';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');
const member = () => cookieFor(MEMBER_ID, 'member');

interface ConfigRow {
  id: string;
  value_json: string;
  effective_start_at: string;
  reason_text: string;
  changed_by_member_id: string | null;
}

function configRows(key: string): ConfigRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      'SELECT id, value_json, effective_start_at, reason_text, changed_by_member_id FROM system_config WHERE config_key = ? ORDER BY effective_start_at ASC, id ASC',
    )
    .all(key) as ConfigRow[];
  db.close();
  return rows;
}

function currentValue(key: string): string | undefined {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db
    .prepare('SELECT value_json FROM system_config_current WHERE config_key = ?')
    .get(key) as { value_json: string } | undefined;
  db.close();
  return row?.value_json;
}

interface AuditRow {
  action_type: string;
  category: string;
  actor_member_id: string | null;
  reason_text: string | null;
  metadata_json: string;
}

function auditRowsFor(key: string): AuditRow[] {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db
    .prepare(
      "SELECT action_type, category, actor_member_id, reason_text, metadata_json FROM audit_entries WHERE entity_type = 'system_config' AND entity_id = ? ORDER BY id",
    )
    .all(key) as AuditRow[];
  db.close();
  return rows;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

// A save posts every value the screen owns, so a test that changes one value
// still sends the rest at their current settings.
function saveBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    outbox_max_retry_attempts: '5',
    outbox_poll_interval_seconds: '30',
    active_player_expiry_reminder_days_1: '30',
    active_player_expiry_reminder_days_2: '7',
    member_cleanup_grace_days: '90',
    deceased_cleanup_grace_days: '30',
    payment_retention_days: '2555',
    outbox_retention_days: '90',
    audit_retention_days: '2555',
    ballot_retention_days: '2555',
    reason: 'Routine tuning after the load check.',
    ...overrides,
  };
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, {
    id: ADMIN_ID,
    slug: 'sp_admin',
    display_name: 'SP Admin',
    login_email: 'sp-admin@example.com',
    is_admin: 1,
  });
  insertMember(db, {
    id: MEMBER_ID,
    slug: 'sp_member',
    display_name: 'SP Member',
    login_email: 'sp-member@example.com',
  });
  db.close();
  createApp = await importApp();
});

afterAll(() => cleanupTestDb(dbPath));

describe('the admin gate on the system parameters surface', () => {
  it('redirects unauthenticated traffic to login', async () => {
    const res = await request(createApp()).get('/admin/system-parameters');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('refuses a signed-in non-admin', async () => {
    const res = await request(createApp())
      .get('/admin/system-parameters')
      .set('Cookie', member());
    expect(res.status).toBe(403);
  });

  it('refuses a non-admin saving a value', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', member())
      .type('form')
      .send(saveBody());
    expect(res.status).toBe(403);
  });

  it('refuses a non-admin scheduling a price', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .set('Cookie', member())
      .type('form')
      .send({ priceKey: 'tier1_price_cents', amountUsd: '12.00', effectiveStartDate: today(), reason: 'x' });
    expect(res.status).toBe(403);
  });

  it('redirects an unauthenticated price post to login', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .type('form')
      .send({ priceKey: 'tier1_price_cents' });
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });
});

describe('GET /admin/system-parameters', () => {
  it('renders every section an administrator can act on', async () => {
    const res = await request(createApp()).get('/admin/system-parameters').set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('Membership and Pricing');
    expect(res.text).toContain('Donations and Payments');
    expect(res.text).toContain('Email and Notifications');
    expect(res.text).toContain('Data Retention and Cleanup');
  });

  it('shows a parameter with its current value and its default', async () => {
    const res = await request(createApp()).get('/admin/system-parameters').set('Cookie', admin());
    expect(res.text).toContain('name="outbox_poll_interval_seconds"');
    expect(res.text).toContain('Default 30.');
  });

  it('labels each retention window with what it actually does to the data', async () => {
    const res = await request(createApp()).get('/admin/system-parameters').set('Cookie', admin());
    expect(res.text).toContain('Anonymize');
    expect(res.text).toContain('Delete');
    expect(res.text).toContain('Hold');
  });

  it('shows the emergency switches with the operator script that sets each one, and no control to set them', async () => {
    const res = await request(createApp()).get('/admin/system-parameters').set('Cookie', admin());
    expect(res.text).toContain('scripts/payments-pause.sh');
    expect(res.text).toContain('scripts/outbound-mail-pause.sh');
    expect(res.text).toContain('scripts/bulk-send-pause.sh');
    expect(res.text).toContain('Payments are running');
    expect(res.text).not.toContain('name="payments_paused"');
    expect(res.text).not.toContain('name="email_outbox_paused"');
    expect(res.text).not.toContain('name="bulk_send_paused"');
  });

  it('shows the current price of each membership', async () => {
    const res = await request(createApp()).get('/admin/system-parameters').set('Cookie', admin());
    expect(res.text).toContain('Tier 1 IFPA Member');
    expect(res.text).toContain('$10.00');
    expect(res.text).toContain('Tier 2 IFPA Organizer Member');
    expect(res.text).toContain('$50.00');
  });
});

describe('POST /admin/system-parameters', () => {
  it('supersedes a changed value with a new row and leaves the old one in place', async () => {
    const before = configRows('outbox_max_retry_attempts');
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ outbox_max_retry_attempts: '7', reason: 'Provider throttling us more than usual.' }));

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/system-parameters?saved=parameters');

    const after = configRows('outbox_max_retry_attempts');
    expect(after.length).toBe(before.length + 1);
    expect(currentValue('outbox_max_retry_attempts')).toBe('7');

    const added = after[after.length - 1]!;
    expect(added.changed_by_member_id).toBe(ADMIN_ID);
    expect(added.reason_text).toBe('Provider throttling us more than usual.');
  });

  it('appends exactly one audit entry carrying the old and new values', async () => {
    const rows = auditRowsFor('outbox_max_retry_attempts');
    expect(rows.length).toBe(1);
    const entry = rows[0]!;
    expect(entry.action_type).toBe('config.updated');
    expect(entry.category).toBe('system');
    expect(entry.actor_member_id).toBe(ADMIN_ID);
    expect(entry.reason_text).toBe('Provider throttling us more than usual.');
    expect(JSON.parse(entry.metadata_json)).toMatchObject({ previousValue: 5, newValue: 7 });
  });

  it('writes nothing when no value differs from what is already stored', async () => {
    const before = configRows('outbox_poll_interval_seconds').length;
    const auditBefore = auditRowsFor('outbox_poll_interval_seconds').length;

    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ outbox_max_retry_attempts: '7' }));

    expect(res.status).toBe(303);
    expect(configRows('outbox_poll_interval_seconds').length).toBe(before);
    expect(auditRowsFor('outbox_poll_interval_seconds').length).toBe(auditBefore);
  });

  it('ignores a posted field naming a switch the application does not own', async () => {
    const before = configRows('payments_paused').length;
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ payments_paused: '1' }));

    expect(res.status).toBe(303);
    expect(configRows('payments_paused').length).toBe(before);
    expect(currentValue('payments_paused')).toBe('0');
  });
});

describe('POST /admin/system-parameters validation', () => {
  it('refuses a zero where the value has to be at least one, and stores nothing', async () => {
    const before = configRows('outbox_max_retry_attempts').length;
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ outbox_max_retry_attempts: '0' }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('1 is the lowest value allowed');
    expect(configRows('outbox_max_retry_attempts').length).toBe(before);
  });

  it('refuses a negative value', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ outbox_poll_interval_seconds: '-5' }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('enter a whole number of seconds');
  });

  it('refuses a value that is not a number at all', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ member_cleanup_grace_days: 'ninety' }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('enter a whole number of days');
  });

  it('refuses a payment retention window below the seven-year legal floor', async () => {
    const before = configRows('payment_retention_days').length;
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ payment_retention_days: '365' }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('2555 is the lowest value allowed');
    expect(configRows('payment_retention_days').length).toBe(before);
  });

  it('refuses a second Active Player reminder that does not fall closer to expiry than the first', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({
        active_player_expiry_reminder_days_1: '10',
        active_player_expiry_reminder_days_2: '10',
      }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('fewer days before expiry than the first reminder');
  });

  it('refuses a change with no reason', async () => {
    const before = configRows('outbox_retention_days').length;
    const res = await request(createApp())
      .post('/admin/system-parameters')
      .set('Cookie', admin())
      .type('form')
      .send(saveBody({ outbox_retention_days: '120', reason: '   ' }));

    expect(res.status).toBe(422);
    expect(res.text).toContain('say why the value is changing');
    expect(configRows('outbox_retention_days').length).toBe(before);
  });
});

describe('POST /admin/system-parameters/pricing', () => {
  it('schedules a future price without disturbing the price in force', async () => {
    const before = configRows('tier1_price_cents').length;
    const start = dayOffset(30);
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .set('Cookie', admin())
      .type('form')
      .send({
        priceKey: 'tier1_price_cents',
        amountUsd: '12.50',
        effectiveStartDate: start,
        reason: 'Board decision on the 2027 dues.',
      });

    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/system-parameters?saved=price');

    const after = configRows('tier1_price_cents');
    expect(after.length).toBe(before + 1);
    expect(currentValue('tier1_price_cents')).toBe('1000');

    const scheduled = after.find((row) => row.effective_start_at === `${start}T00:00:00.000Z`);
    expect(scheduled?.value_json).toBe('1250');
    expect(scheduled?.changed_by_member_id).toBe(ADMIN_ID);
  });

  it('records the price change in the audit ledger with both amounts', async () => {
    const rows = auditRowsFor('tier1_price_cents');
    expect(rows.length).toBe(1);
    const entry = rows[0]!;
    expect(entry.action_type).toBe('config.price_scheduled');
    expect(entry.category).toBe('pricing');
    expect(JSON.parse(entry.metadata_json)).toMatchObject({
      previousValueCents: 1000,
      newValueCents: 1250,
    });
  });

  it('refuses a second price for the same membership on the same start date', async () => {
    const start = dayOffset(30);
    const before = configRows('tier1_price_cents').length;
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .set('Cookie', admin())
      .type('form')
      .send({
        priceKey: 'tier1_price_cents',
        amountUsd: '13.00',
        effectiveStartDate: start,
        reason: 'Second attempt at the same date.',
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('already has a price starting on that date');
    expect(configRows('tier1_price_cents').length).toBe(before);
  });

  it('refuses a start date in the past, which the store would resolve to nothing', async () => {
    const before = configRows('tier2_price_cents').length;
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .set('Cookie', admin())
      .type('form')
      .send({
        priceKey: 'tier2_price_cents',
        amountUsd: '55.00',
        effectiveStartDate: dayOffset(-1),
        reason: 'Backdated by mistake.',
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('cannot start in the past');
    expect(configRows('tier2_price_cents').length).toBe(before);
  });

  it('refuses an amount that is not money', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .set('Cookie', admin())
      .type('form')
      .send({
        priceKey: 'tier2_price_cents',
        amountUsd: 'fifty five',
        effectiveStartDate: today(),
        reason: 'Typed the amount in words.',
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('enter an amount in dollars');
  });

  it('refuses a price change with no reason', async () => {
    const before = configRows('tier2_price_cents').length;
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .set('Cookie', admin())
      .type('form')
      .send({
        priceKey: 'tier2_price_cents',
        amountUsd: '55.00',
        effectiveStartDate: dayOffset(10),
        reason: '',
      });

    expect(res.status).toBe(422);
    expect(res.text).toContain('say why the price is changing');
    expect(configRows('tier2_price_cents').length).toBe(before);
  });

  it('takes a price starting today, which the store puts in force at once', async () => {
    const res = await request(createApp())
      .post('/admin/system-parameters/pricing')
      .set('Cookie', admin())
      .type('form')
      .send({
        priceKey: 'tier2_price_cents',
        amountUsd: '60.00',
        effectiveStartDate: today(),
        reason: 'IFPA rule change taking effect immediately.',
      });

    expect(res.status).toBe(303);
    expect(currentValue('tier2_price_cents')).toBe('6000');
  });
});
