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
 *      src/dev-shortcuts/seedConfig.ts.
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
  const m = await import('../../src/dev-shortcuts/seedConfig');
  DEV_ADMIN_SEED_PASSWORD_LITERAL = m.DEV_ADMIN_SEED_PASSWORD_LITERAL;
});

function grepRepoForLiteral(needle: string): string[] {
  const cmd =
    `grep -r -l --include='*.ts' --include='*.tsx' --include='*.js' ` +
    `--include='*.sh' --include='*.json' --include='*.hbs' ` +
    `--include='*.yml' --include='*.yaml' --include='*.html' ` +
    `--exclude-dir=node_modules --exclude-dir=dist --exclude-dir=.git ` +
    `--exclude-dir=database --exclude-dir=coverage ` +
    `-F '${needle}' .`;
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
  it('appears in exactly one checked-in file: src/dev-shortcuts/seedConfig.ts', () => {
    const hits = grepRepoForLiteral(DEV_ADMIN_SEED_PASSWORD_LITERAL);
    expect(hits).toEqual(['src/dev-shortcuts/seedConfig.ts']);
  }, 30_000);

  it('seed script source does not embed the literal as a string', () => {
    const seedSourcePath = path.resolve(
      REPO_ROOT,
      'src',
      'dev-shortcuts',
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
    const argon2Mod = await import('argon2');
    const { seedOne } = await import('../../src/dev-shortcuts/seed');
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
      const hash = await argon2Mod.default.hash(DEV_ADMIN_SEED_PASSWORD_LITERAL);
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
