/**
 * Schema-level tests for built-in email_templates seeds.
 *
 * Verifies that schema.sql's INSERT OR IGNORE statement lands the
 * required template with the expected template_key value, enabled
 * by default. Body templates must contain the documented Handlebars
 * slot names so wiring code can rely on their presence.
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import BetterSqlite3 from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { createTestDb } from '../fixtures/testDb';

interface TemplateRow {
  template_key: string;
  subject_template: string;
  body_template: string;
  is_enabled: number;
}

describe('email_templates seeds', () => {
  let db: BetterSqlite3.Database;
  let dbPath: string;

  beforeEach(() => {
    dbPath = path.join(
      os.tmpdir(),
      `footbag-test-ets-${Date.now()}-${Math.random().toString(36).slice(2)}.db`,
    );
    db = createTestDb(dbPath);
  });

  afterEach(() => {
    db.close();
    for (const ext of ['', '-wal', '-shm']) {
      const p = dbPath + ext;
      if (fs.existsSync(p)) fs.unlinkSync(p);
    }
  });

  it('hof_bap_admin_digest template is seeded and enabled', () => {
    const row = db.prepare(
      `SELECT template_key, subject_template, body_template, is_enabled
         FROM email_templates WHERE template_key = ?`,
    ).get('hof_bap_admin_digest') as TemplateRow | undefined;
    expect(row).toBeDefined();
    expect(row!.is_enabled).toBe(1);
    expect(row!.subject_template).toContain('{{claim_count}}');
    expect(row!.body_template).toContain('{{claim_rows}}');
    expect(row!.body_template).toContain('{{monitoring_window_remaining_days}}');
  });

  it('email_templates_enabled view exposes the seeded template', () => {
    const rows = db.prepare(
      `SELECT template_key FROM email_templates_enabled
        WHERE template_key = ?`,
    ).all('hof_bap_admin_digest') as Array<{ template_key: string }>;
    expect(rows.map(r => r.template_key)).toEqual(['hof_bap_admin_digest']);
  });

  it('INSERT OR IGNORE makes seed idempotent across re-application', () => {
    // Re-run the seed insert by hand; expect the existing row remains.
    const beforeCount = db.prepare(
      `SELECT COUNT(*) AS n FROM email_templates WHERE template_key = ?`,
    ).get('hof_bap_admin_digest') as { n: number };
    expect(beforeCount.n).toBe(1);

    db.prepare(`
      INSERT OR IGNORE INTO email_templates
        (id, created_at, created_by, updated_at, updated_by, version,
         template_key, subject_template, body_template, is_enabled)
      VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, 1)
    `).run(
      'duplicate-attempt', '2000-01-01T00:00:00.000Z', 'system',
      '2000-01-01T00:00:00.000Z', 'system',
      'hof_bap_admin_digest', 'X', 'Y',
    );

    const afterCount = db.prepare(
      `SELECT COUNT(*) AS n FROM email_templates WHERE template_key = ?`,
    ).get('hof_bap_admin_digest') as { n: number };
    expect(afterCount.n).toBe(1);
  });
});
