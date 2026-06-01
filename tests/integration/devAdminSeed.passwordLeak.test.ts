/**
 * Password-leak regression test for DEV_ADMIN_SEED_PASSWORD_LITERAL —
 * code only.
 *
 * Scope: this test scans source-controlled CODE files (.ts/.js/.sh/.hbs/
 * .json/.yml). It does NOT scan documentation (.md). Doc content is
 * governed by doc-sync, doc-governance rules, and human review — not by
 * the test suite.
 *
 * The test enforces three code-side protections:
 *
 *   1. Single-source containment in code — the literal appears only in
 *      src/dev-bootstrap/seedConfig.ts.
 *   2. Seed script never embeds the literal — seed.ts imports the
 *      constant by symbol, never inlines it as a string.
 *   3. Deploy scripts never embed the literal — the workstation +
 *      remote-half deploy chain pipes seed JSON, never the password.
 *
 * Production-import refusal is covered by
 * tests/integration/devAdminSeed.envGuard.test.ts.
 *
 * Setting FOOTBAG_ENV='development' before any import is required because
 * importing DEV_ADMIN_SEED_PASSWORD_LITERAL from seedConfig triggers the
 * module's env-guard.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import * as path from 'node:path';

const PRIOR_FOOTBAG_ENV = process.env.FOOTBAG_ENV;
process.env.FOOTBAG_ENV = process.env.FOOTBAG_ENV ?? 'development';

afterAll(() => {
  if (PRIOR_FOOTBAG_ENV === undefined) {
    delete process.env.FOOTBAG_ENV;
  } else {
    process.env.FOOTBAG_ENV = PRIOR_FOOTBAG_ENV;
  }
});

const REPO_ROOT = path.resolve(__dirname, '..', '..');

let DEV_ADMIN_SEED_PASSWORD_LITERAL: string;

beforeAll(async () => {
  const m = await import('../../src/dev-bootstrap/seedConfig');
  DEV_ADMIN_SEED_PASSWORD_LITERAL = m.DEV_ADMIN_SEED_PASSWORD_LITERAL;
});

function grepRepoForLiteral(needle: string): string[] {
  // Scan only git-tracked (checked-in) files. `git grep` skips every gitignored
  // artifact (.curated-build media, scripts/.venv, the legacy mirror, any build
  // dir), which both matches this test's "checked-in file" intent and avoids
  // crawling large binary trees that timed out the old filesystem `grep -r`.
  const cmd =
    `git grep -I -l -F -e '${needle}' -- ` +
    `'*.ts' '*.tsx' '*.js' '*.sh' '*.json' '*.hbs' '*.yml' '*.yaml' '*.html'`;
  let raw = '';
  try {
    raw = execSync(cmd, { cwd: REPO_ROOT, encoding: 'utf8' });
  } catch (err) {
    const e = err as { status?: number; stdout?: string };
    if (e.status === 1) return [];
    throw err;
  }
  return raw
    .split('\n')
    .filter((s) => s.length > 0)
    .map((p) => p.replace(/^\.\//, ''));
}

describe('DEV_ADMIN_SEED_PASSWORD_LITERAL — leak protection', () => {
  it('appears in exactly one checked-in file: src/dev-bootstrap/seedConfig.ts', () => {
    const hits = grepRepoForLiteral(DEV_ADMIN_SEED_PASSWORD_LITERAL);
    expect(hits).toEqual(['src/dev-bootstrap/seedConfig.ts']);
  }, 30_000);

  it('seed script source does not embed the literal as a string', () => {
    const seedSourcePath = path.resolve(
      REPO_ROOT,
      'src',
      'dev-bootstrap',
      'seed.ts',
    );
    const source = readFileSync(seedSourcePath, 'utf8');
    expect(source).not.toContain(DEV_ADMIN_SEED_PASSWORD_LITERAL);
  });

  it('deploy scripts do not embed the literal', () => {
    for (const relPath of [
      'deploy_to_aws.sh',
      'scripts/deploy-to-aws.sh',
      'scripts/deploy-code.sh',
      'scripts/deploy-rebuild.sh',
      'scripts/internal/deploy-code-remote.sh',
      'scripts/internal/deploy-rebuild-remote.sh',
      'scripts/manage-dev-admin-seed.sh',
      'run_dev.sh',
    ]) {
      const source = readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
      expect(source, `${relPath} must not embed the password literal`).not.toContain(
        DEV_ADMIN_SEED_PASSWORD_LITERAL,
      );
    }
  });

  it('seedOne stores an argon2id hash in members.password_hash; never the plaintext literal', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { hashPassword } = await import('../../src/lib/passwordHash');
    const { seedOne } = await import('../../src/dev-bootstrap/seed');
    const fs = await import('node:fs');
    const os = await import('node:os');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'devseed-password-'));
    const dbPath = path.join(tmpDir, 'footbag.db');
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);

    try {
      const hash = await hashPassword(DEV_ADMIN_SEED_PASSWORD_LITERAL);
      const now = new Date().toISOString();
      const outcome = await seedOne(
        db,
        {
          loginEmail: 'seed-password-leak@example.com',
          displayName: 'Seed Password Leak',
          realName: 'Seed Password Leak',
        },
        hash,
        now,
      );
      expect(outcome).toBe('created');

      const row = db
        .prepare(
          'SELECT password_hash FROM members WHERE login_email_normalized = ?',
        )
        .get('seed-password-leak@example.com') as { password_hash: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(row!.password_hash).not.toContain(DEV_ADMIN_SEED_PASSWORD_LITERAL);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30_000);
});
