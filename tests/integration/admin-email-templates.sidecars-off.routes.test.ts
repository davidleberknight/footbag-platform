/**
 * Admin email-template editor where the authoring tree is not writable.
 *
 * This is the shape every deployed host runs, staging before go-live and
 * production after it: the database row is the whole save, no template file is
 * written, and any admin may edit, including a test persona on staging, since
 * there is no committed file for a persona to overwrite.
 *
 * Companion to `admin-email-templates.routes.test.ts`, which covers the
 * developer shape where a save also rewrites the committed template file. The
 * flag is read once per process, so the two shapes cannot share a file.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';

import { setTestEnv, createTestDb, cleanupTestDb, importApp } from '../fixtures/testDb';

const { dbPath } = setTestEnv('4738');
// The fixture defaults this on to mirror a developer machine. Clear it before
// the app loads, since config freezes its value at module load.
process.env.ALLOW_CURATED_SIDECAR_WRITES = '0';

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import request from '../fixtures/supertestWithOrigin';
import { insertMember, createTestSessionJwt } from '../fixtures/factories';
import { SEEDED_PERSONA_MEMBER_ID_PREFIX } from '../../src/lib/personaGuards';

let createApp: Awaited<ReturnType<typeof importApp>>;

const PERSONA_ADMIN_ID = `${SEEDED_PERSONA_MEMBER_ID_PREFIX}et_off_admin`;
const CURATED_TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-email-templates-off-'));

function personaAdmin(): string {
  return `__Host-footbag_session=${createTestSessionJwt({ memberId: PERSONA_ADMIN_ID, role: 'admin' })}`;
}

beforeAll(async () => {
  const db = createTestDb(dbPath);
  insertMember(db, { id: PERSONA_ADMIN_ID, slug: 'et_off_admin', display_name: 'ET Off Admin', login_email: 'et-off@example.com', is_admin: 1 });
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

describe('POST /admin/email-templates/:key/edit on a deployed host', () => {
  // Defect caught: the developer-machine persona block leaks onto staging or
  // production, so the persona admins the staging walk uses, or the wording
  // fix an admin makes on production, are refused; or a deployed host tries to
  // write a template file that is not its source of truth.
  it('saves a persona admin\'s edit to the database row and writes no template file', async () => {
    const res = await request(createApp())
      .post('/admin/email-templates/gallery_moderated_member/edit')
      .set('Cookie', personaAdmin())
      .type('form')
      .send({
        subjectTemplate: 'Your gallery was edited (deployed host)',
        bodyTemplate: 'Hi {memberName}, {whatChanged} on {galleryName}. Note: {note}',
        piiClassification: 'confidential',
        isEnabled: '1',
      });
    expect(res.status).toBe(303);

    const db = new BetterSqlite3(dbPath, { readonly: true });
    const row = db.prepare('SELECT subject_template, updated_by FROM email_templates WHERE template_key = ?')
      .get('gallery_moderated_member') as { subject_template: string; updated_by: string };
    const audits = db.prepare(
      "SELECT COUNT(*) AS n FROM audit_entries WHERE entity_type = 'email_template' AND entity_id = 'gallery_moderated_member'",
    ).get() as { n: number };
    db.close();
    expect(row.subject_template).toBe('Your gallery was edited (deployed host)');
    expect(row.updated_by).toBe(PERSONA_ADMIN_ID);
    expect(audits.n).toBe(1);
    expect(fs.existsSync(path.join(CURATED_TMP_ROOT, 'email_templates'))).toBe(false);
  });
});
