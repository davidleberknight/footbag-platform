/**
 * Admin email-template editor: GET /admin/email-templates, GET and POST
 * /admin/email-templates/:key/edit.
 *
 * An admin-only surface listing every registered outbound email template and
 * editing one template's wording, enabled flag, and PII classification. A save
 * updates the row and appends one audit entry in one transaction, and the very
 * next send renders the edited wording. Validation enforces the logic-less
 * template contract: only the template's declared merge fields may appear, and
 * every declared merge field must appear (an omitted credential-link token
 * would silently send a broken email). There is no create or delete path on
 * this surface. This suite pins the admin gate, the list, the field display,
 * the persisted save with its one audit row, the validation rules, overposting
 * safety, and the edit-to-send round trip.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { flashCookieOf } from '../fixtures/flashCookie';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';

const { dbPath } = setTestEnv('3971');

let createApp: Awaited<ReturnType<typeof importApp>>;

const ADMIN_ID = 'aaaaaaaa-0000-0000-0000-00000000et01';
const MEMBER_ID = 'bbbbbbbb-0000-0000-0000-00000000et02';

function cookieFor(memberId: string, role: 'admin' | 'member'): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId, role })}`;
}
const admin = () => cookieFor(ADMIN_ID, 'admin');

function templateRow(key: string): {
  subject_template: string; body_template: string; is_enabled: number;
  pii_classification: string; version: number; updated_by: string; template_key: string;
} {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const row = db.prepare('SELECT * FROM email_templates WHERE template_key = ?').get(key) as never;
  db.close();
  return row;
}

function auditRowsFor(key: string): Array<{ action_type: string; actor_member_id: string; metadata_json: string }> {
  const db = new BetterSqlite3(dbPath, { readonly: true });
  const rows = db.prepare(
    "SELECT action_type, actor_member_id, metadata_json FROM audit_entries WHERE entity_type = 'email_template' AND entity_id = ?",
  ).all(key) as never;
  db.close();
  return rows;
}

// A complete valid edit body for club_volunteer_leadership. Individual tests
// override a field.
function validBody(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    subjectTemplate: 'Co-lead {clubName}?',
    bodyTemplate: 'Hi {leaderName},\n\n{joinerName} asks you to come co-lead {clubName}.\n\n-- IFPA platform',
    piiClassification: 'confidential',
    isEnabled: '1',
    ...overrides,
  };
}

// The suite runs with authoring-tree writes on, as a developer machine does, so
// every save also writes its template sidecar; point that at a temp tree so no
// run touches the repository's curated/ directory.
const CURATED_TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-email-templates-curated-'));

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: ADMIN_ID, slug: 'et_admin', display_name: 'ET Admin', login_email: 'et-admin@example.com', is_admin: 1 });
  insertMember(db, { id: MEMBER_ID, slug: 'et_member', display_name: 'ET Member', login_email: 'et-member@example.com' });
  db.close();
  createApp = await importApp();
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.setCuratedRootDirForTests(CURATED_TMP_ROOT);
});

afterAll(async () => {
  const svcMod = await import('../../src/services/curatorMediaService');
  svcMod.resetCuratedRootDirForTests();
  cleanupTestDb(dbPath);
  fs.rmSync(CURATED_TMP_ROOT, { recursive: true, force: true });
});

describe('GET /admin/email-templates', () => {
  it('redirects unauthenticated traffic to login', async () => {
    const res = await request(createApp()).get('/admin/email-templates');
    expect(res.status).toBe(302);
    expect(res.headers.location).toContain('/login');
  });

  it('returns 403 for a signed-in non-admin', async () => {
    const res = await request(createApp())
      .get('/admin/email-templates')
      .set('Cookie', cookieFor(MEMBER_ID, 'member'));
    expect(res.status).toBe(403);
  });

  it('lists every seeded template with key, subject, and classification', async () => {
    const res = await request(createApp()).get('/admin/email-templates').set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('account_verify');
    expect(res.text).toContain('payment_receipt_failed');
    expect(res.text).toContain('Verify your IFPA Footbag account');
    expect(res.text).toContain('restricted');
  });
});

describe('GET /admin/email-templates/:key/edit', () => {
  it('404s an unknown template key', async () => {
    const res = await request(createApp())
      .get('/admin/email-templates/no_such_template/edit')
      .set('Cookie', admin());
    expect(res.status).toBe(404);
  });

  it('shows the template fields and its allowed merge fields', async () => {
    const res = await request(createApp())
      .get('/admin/email-templates/account_verify/edit')
      .set('Cookie', admin());
    expect(res.status).toBe(200);
    expect(res.text).toContain('account_verify');
    expect(res.text).toContain('{verifyUrl}');
    expect(res.text).toContain('{ttlPhrase}');
    expect(res.text).toContain('Welcome to IFPA Footbag.');
  });
});

describe('POST /admin/email-templates/:key/edit', () => {
  // On a developer machine the committed sidecar is the template's durable
  // source: an edit that reached only the database would be replaced by the
  // next seeding, losing the curator's wording.
  it('writes the saved template back to its sidecar in the seeder\'s shape', async () => {
    const body = {
      subjectTemplate: 'A change to your gallery (sidecar check)',
      bodyTemplate: 'Hi {memberName}, {whatChanged} on {galleryName}. Note: {note}',
      piiClassification: 'confidential',
      isEnabled: '1',
    };
    const res = await request(createApp())
      .post('/admin/email-templates/gallery_moderated_member/edit')
      .set('Cookie', admin())
      .type('form')
      .send(body);
    expect(res.status).toBe(303);
    const file = path.join(CURATED_TMP_ROOT, 'email_templates', 'gallery_moderated_member.json');
    const raw = fs.readFileSync(file, 'utf8');
    expect(JSON.parse(raw)).toEqual({
      templateKey: 'gallery_moderated_member',
      subjectTemplate: body.subjectTemplate,
      bodyTemplate: body.bodyTemplate,
      piiClassification: 'confidential',
      isEnabled: true,
    });
    expect(raw.endsWith('}\n')).toBe(true);
  });

  it('saves an edit, bumps the version, stamps the admin, and appends one audit row', async () => {
    const before = templateRow('club_volunteer_leadership');
    const res = await request(createApp())
      .post('/admin/email-templates/club_volunteer_leadership/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody());
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe('/admin/email-templates/club_volunteer_leadership/edit');

    // The confirmation shows on this template's page and on no other.
    const cookie = `${admin()}; ${flashCookieOf(res)}`;
    const own = await request(createApp()).get(res.headers.location).set('Cookie', cookie);
    expect(own.text).toMatch(/class="form-success-banner" role="status">Saved\./);
    const other = await request(createApp()).get('/admin/email-templates/account_verify/edit').set('Cookie', cookie);
    expect(other.status).toBe(200);
    expect(other.text).not.toContain('form-success-banner');
    // Another admin page that reads the same kind of confirmation ignores it.
    const params = await request(createApp()).get('/admin/system-parameters').set('Cookie', cookie);
    expect(params.status).toBe(200);
    expect(params.text).not.toContain('form-success-banner');
    // The page's own address typed without the cookie claims nothing.
    const bare = await request(createApp())
      .get('/admin/email-templates/club_volunteer_leadership/edit?saved=1').set('Cookie', admin());
    expect(bare.status).toBe(200);
    expect(bare.text).not.toContain('form-success-banner');

    const after = templateRow('club_volunteer_leadership');
    expect(after.subject_template).toBe('Co-lead {clubName}?');
    expect(after.body_template).toContain('asks you to come co-lead {clubName}.');
    expect(after.version).toBe(before.version + 1);
    expect(after.updated_by).toBe(ADMIN_ID);

    const audits = auditRowsFor('club_volunteer_leadership');
    expect(audits).toHaveLength(1);
    expect(audits[0]!.action_type).toBe('email_template.updated');
    expect(audits[0]!.actor_member_id).toBe(ADMIN_ID);
    expect(JSON.parse(audits[0]!.metadata_json).changedFields).toContain('subject_template');
  });

  it('the very next send renders the edited wording', async () => {
    const email = await import('../../src/services/emailService');
    email.emailService.send({
      template: 'club_volunteer_leadership',
      params: { leaderName: 'Lee', joinerName: 'Renee', clubName: 'Boulder Footbag' },
      recipientEmail: 'roundtrip@example.com',
      recipientMemberId: MEMBER_ID,
    });
    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare(
      "SELECT subject, body_text FROM outbox_emails WHERE recipient_email = 'roundtrip@example.com'",
    ).get() as { subject: string; body_text: string };
    db.close();
    expect(row.subject).toBe('Co-lead Boulder Footbag?');
    expect(row.body_text).toContain('Hi Lee,');
    expect(row.body_text).toContain('Renee asks you to come co-lead Boulder Footbag.');
  });

  it('rejects an unknown merge token with a 422 naming the allowed fields, leaving the row unchanged', async () => {
    const before = templateRow('vouch_confirmation');
    const res = await request(createApp())
      .post('/admin/email-templates/vouch_confirmation/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({
        subjectTemplate: 'Vouched',
        bodyTemplate: 'From {voucherName} until {expiryDate}. Extra: {loginEmail}.',
      }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('unknown merge field {loginEmail}');
    expect(res.text).toContain('{voucherName}');
    expect(templateRow('vouch_confirmation').body_template).toBe(before.body_template);
  });

  it('rejects a template that drops a required merge field (a linkless verification email)', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/account_verify/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({
        subjectTemplate: 'Verify your account',
        bodyTemplate: 'Please verify. The link expires in {ttlPhrase}.',
      }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('missing {verifyUrl}');
  });

  it('rejects conditional-syntax braces', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/password_changed/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({ subjectTemplate: 'Changed', bodyTemplate: '{{#if x}}nope{{/if}}' }));
    expect(res.status).toBe(422);
  });

  it('rejects an empty subject and a bad classification with per-field errors', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/password_changed/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({ subjectTemplate: '   ', bodyTemplate: 'b', piiClassification: 'top_secret' }));
    expect(res.status).toBe(422);
    expect(res.text).toContain('Subject: required.');
    expect(res.text).toContain('Classification: choose one of the listed values.');
    // Both refusals sit in the one refusal banner, a paragraph each, so neither
    // is lost and neither reads as anything but a refusal.
    expect(res.text).toMatch(
      /<div class="form-error-banner" role="alert">\s*<p>[^<]*<\/p><p>[^<]*<\/p>\s*<\/div>/,
    );
  });

  it('an unchecked enabled box disables the template', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/admin_loss_recruitment/edit')
      .set('Cookie', admin())
      .type('form')
      .send({
        subjectTemplate: 'IFPA admin team: please recruit a new admin volunteer',
        bodyTemplate: 'Administrator member ID: {entityId}\nWork queue: {queueUrl}',
        piiClassification: 'internal',
        // isEnabled omitted: an unchecked checkbox posts nothing.
      });
    expect(res.status).toBe(303);
    expect(templateRow('admin_loss_recruitment').is_enabled).toBe(0);
  });

  // Defect caught: markup, a control character, stacked blank lines or a
  // decomposed accent the administrator typed are stored and sent to every
  // recipient of this email, or the cleaner eats the {token} merge fields.
  it('stores the subject and body cleaned, keeping the merge fields', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/club_membership_leader_join/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({
        subjectTemplate: 'A <b>new</b>\u009b member joined {clubName}\r\ntoday',
        bodyTemplate: 'Hi {leaderName}, <i>Café</i>\u009b\r\n\r\n\r\n\r\n\r\n{memberName} joined {clubName}.',
      }));
    expect(res.status).toBe(303);
    const row = templateRow('club_membership_leader_join');
    expect(row.subject_template).toBe('A new member joined {clubName} today');
    expect(row.body_template).toBe('Hi {leaderName}, Café\n\n{memberName} joined {clubName}.');
  });

  // Defect caught: a subject of markup alone passes the required check on its
  // raw length and saves a template whose emails go out with no subject.
  it('refuses a subject that is only markup, leaving the row unchanged', async () => {
    const before = templateRow('club_membership_leader_join');
    const res = await request(createApp())
      .post('/admin/email-templates/club_membership_leader_join/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody({
        subjectTemplate: '<b> </b>',
        bodyTemplate: 'Hi {leaderName}, {memberName} joined {clubName}.',
      }));
    expect(res.status).toBe(422);
    expect(res.text).toMatch(/Subject: required/);
    expect(templateRow('club_membership_leader_join')).toEqual(before);
  });

  // Defect caught: a template that arrived with broken encoding (the
  // replacement character the body parser leaves for invalid bytes) is refused
  // with a misleading "required" message, or saved with the damage in it.
  it('refuses a subject or body with broken encoding, naming the encoding, and leaves the row unchanged', async () => {
    const before = templateRow('club_membership_leader_join');
    for (const over of [
      { subjectTemplate: 'Joined � {clubName}', bodyTemplate: 'Hi {leaderName}, {memberName} joined {clubName}.' },
      { subjectTemplate: 'Joined {clubName}', bodyTemplate: 'Hi {leaderName}, {memberName} � joined {clubName}.' },
    ]) {
      const res = await request(createApp())
        .post('/admin/email-templates/club_membership_leader_join/edit')
        .set('Cookie', admin())
        .type('form')
        .send(validBody(over));
      expect(res.status, JSON.stringify(over)).toBe(422);
      expect(res.text).toContain('could not be read');
    }
    expect(templateRow('club_membership_leader_join')).toEqual(before);
  });

  // Defect caught: a template stored before write-time cleaning existed is
  // resubmitted unchanged, and the audit row reports the body as edited only
  // because the cleaner tidied it, so the trail claims a change nobody made.
  it('records no body change when a template saved before cleaning is resubmitted unchanged', async () => {
    const stored = 'Hi {leaderName},   \n\n\n\n{clubName}: {whatChanged}.\n\nNote: {note}';
    const db = new BetterSqlite3(dbPath);
    db.prepare('UPDATE email_templates SET body_template = ? WHERE template_key = ?')
      .run(stored, 'club_record_corrected');
    db.close();
    const current = templateRow('club_record_corrected');
    // No other case saves this template, so the save below writes its only row.
    expect(auditRowsFor('club_record_corrected')).toHaveLength(0);

    const res = await request(createApp())
      .post('/admin/email-templates/club_record_corrected/edit')
      .set('Cookie', admin())
      .type('form')
      .send({
        subjectTemplate: current.subject_template,
        bodyTemplate: stored,
        piiClassification: current.pii_classification,
        isEnabled: current.is_enabled ? '1' : '',
      });
    expect(res.status).toBe(303);
    const audits = auditRowsFor('club_record_corrected');
    expect(audits).toHaveLength(1);
    expect(JSON.parse(audits[0]!.metadata_json).changedFields).toEqual([]);
  });

  it('ignores overposted privileged fields (key, id, version stay server-owned)', async () => {
    const before = templateRow('password_reset_confirm');
    const res = await request(createApp())
      .post('/admin/email-templates/password_reset_confirm/edit')
      .set('Cookie', admin())
      .type('form')
      .send({
        subjectTemplate: 'Your IFPA Footbag password was changed',
        bodyTemplate: 'Reset done.',
        piiClassification: 'internal',
        isEnabled: '1',
        template_key: 'account_verify',
        id: 'evil-id',
        version: '999',
        updated_by: 'someone-else',
      });
    expect(res.status).toBe(303);
    const after = templateRow('password_reset_confirm');
    expect(after.template_key).toBe('password_reset_confirm');
    expect(after.version).toBe(before.version + 1);
    expect(after.updated_by).toBe(ADMIN_ID);
    // The named other template is untouched.
    expect(templateRow('account_verify').subject_template).toBe('Verify your IFPA Footbag account');
  });

  it('404s a save against an unknown key and 403s a non-admin save', async () => {
    const unknown = await request(createApp())
      .post('/admin/email-templates/no_such_template/edit')
      .set('Cookie', admin())
      .type('form')
      .send(validBody());
    expect(unknown.status).toBe(404);

    const nonAdmin = await request(createApp())
      .post('/admin/email-templates/password_changed/edit')
      .set('Cookie', cookieFor(MEMBER_ID, 'member'))
      .type('form')
      .send(validBody());
    expect(nonAdmin.status).toBe(403);
  });
});
