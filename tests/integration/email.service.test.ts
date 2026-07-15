/**
 * Email service render contract over email_templates rows.
 *
 * The service renders every outbound message from the variant key's
 * email_templates row: token substitution from the shaper's merge map; a
 * disabled row suppresses the send (nothing enqueued); a missing row for a
 * registered key throws the seed invariant error; an unresolved token is left
 * literal rather than failing the send; and an admin-edited row's wording is
 * used by the very next send with no restart or reseed.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import { setTestEnv, createTestDb, cleanupTestDb } from '../fixtures/testDb';
import { insertEmailTemplate } from '../fixtures/factories';

const { dbPath } = setTestEnv('3187');

// eslint-disable-next-line @typescript-eslint/consistent-type-imports
let email: typeof import('../../src/services/emailService');

beforeAll(async () => {
  const db = createTestDb(dbPath);
  db.close();
  email = await import('../../src/services/emailService');
});

afterAll(() => cleanupTestDb(dbPath));

function outboxRows(): Array<{ subject: string; body_text: string | null; template_key: string | null }> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    'SELECT subject, body_text, template_key FROM outbox_emails ORDER BY created_at',
  ).all() as Array<{ subject: string; body_text: string | null; template_key: string | null }>;
  db.close();
  return rows;
}

describe('emailService render-from-DB contract', () => {
  it('renders subject and body from the variant row with merge tokens substituted, stamping the variant key', () => {
    const db = new BetterSqlite3(dbPath);
    insertEmailTemplate(db, {
      template_key: 'vouch_confirmation',
      subject_template: 'Vouched by {voucherName}',
      body_template: 'From {voucherName}, until {expiryDate}.',
      pii_classification: 'confidential',
    });
    db.close();

    const result = email.emailService.send({
      template: 'vouch_confirmation',
      params: { voucherName: 'Jane V', expiryDate: '2030-01-01' },
      recipientEmail: 'render-target@example.com',
    });
    expect(result.status).toBe('enqueued');

    const row = outboxRows().find((r) => r.template_key === 'vouch_confirmation');
    expect(row).toBeDefined();
    expect(row!.subject).toBe('Vouched by Jane V');
    expect(row!.body_text).toBe('From Jane V, until 2030-01-01.');
  });

  it('an edited row is used by the very next send', () => {
    const db = new BetterSqlite3(dbPath);
    insertEmailTemplate(db, {
      template_key: 'admin_queue_alert',
      subject_template: 'EDITED alert: {taskType}',
      body_template: 'Edited body. Task {taskType}, entity {entityId}.',
    });
    db.close();

    email.emailService.send({
      template: 'admin_queue_alert',
      params: { taskType: 'tt', entityId: 'ee' },
      recipientEmail: 'edited-target@example.com',
    });
    const row = outboxRows().find((r) => r.subject === 'EDITED alert: tt');
    expect(row).toBeDefined();
    expect(row!.body_text).toBe('Edited body. Task tt, entity ee.');
  });

  it('a disabled template suppresses the send and enqueues nothing', () => {
    const db = new BetterSqlite3(dbPath);
    insertEmailTemplate(db, { template_key: 'password_changed', is_enabled: 0 });
    db.close();

    const result = email.emailService.send({
      template: 'password_changed',
      params: {},
      recipientEmail: 'suppressed-target@example.com',
    });
    expect(result).toEqual({ id: null, status: 'suppressed' });
    expect(outboxRows().some((r) => r.template_key === 'password_changed')).toBe(false);
  });

  it('a missing row for a registered key throws the seed invariant error', () => {
    const db = new BetterSqlite3(dbPath);
    db.prepare("DELETE FROM email_templates WHERE template_key = 'password_reset_confirm'").run();
    db.close();

    expect(() => email.emailService.send({
      template: 'password_reset_confirm',
      params: {},
      recipientEmail: 'missing-target@example.com',
    })).toThrow(/email_templates row missing .* 'password_reset_confirm'/);
  });

  it('an unresolved token in an edited template is left literal and does not fail the send', () => {
    const db = new BetterSqlite3(dbPath);
    insertEmailTemplate(db, {
      template_key: 'club_coleader_invite',
      body_template: 'Hi {inviteeName}, join {clubName}. Stray: {notARealField}.',
    });
    db.close();

    const result = email.emailService.send({
      template: 'club_coleader_invite',
      params: { inviteeName: 'I', clubName: 'C' },
      recipientEmail: 'stray-target@example.com',
    });
    expect(result.status).toBe('enqueued');
    const row = outboxRows().find((r) => r.template_key === 'club_coleader_invite');
    expect(row!.body_text).toContain('Stray: {notARealField}.');
  });

  it('effective classification reads the row override, falling back to the registry default', () => {
    const db = new BetterSqlite3(dbPath);
    insertEmailTemplate(db, { template_key: 'admin_role_granted', pii_classification: 'confidential' });
    db.prepare("DELETE FROM email_templates WHERE template_key = 'admin_role_revoked'").run();
    db.close();

    expect(email.emailTemplateClassification('admin_role_granted')).toBe('confidential');
    // Row deleted: falls back to the registry default for the registered key.
    expect(email.emailTemplateClassification('admin_role_revoked')).toBe('internal');
    expect(email.emailTemplateClassification('never_registered_key')).toBeNull();
  });
});
