/**
 * Password-leak regression test for TEST_PERSONA_SEED_PASSWORD_LITERAL —
 * code only. The persona harness counterpart to
 * devAdminSeed.passwordLeak.test.ts.
 *
 * Scope: scans source-controlled CODE files (.ts/.js/.sh/.hbs/.json/.yml).
 * It does NOT scan documentation (.md); doc content is governed by doc-sync
 * and human review.
 *
 * Enforces the code-side protections:
 *
 *   1. Single-source containment in code — the literal appears only in
 *      src/testkit/personaSecrets.ts.
 *   2. The seed runner never embeds the literal — personaSeedRunner.ts
 *      imports the constant by symbol, never inlines it as a string.
 *   3. Deploy/operator scripts never embed the literal.
 *   4. seedPersona stores an argon2 hash in members.password_hash, never the
 *      plaintext literal.
 *
 * Production-import refusal is covered by personaSecrets's module-load guard.
 * Setting FOOTBAG_ENV='development' before any import is required because
 * importing the literal from personaSecrets triggers that guard.
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

let TEST_PERSONA_SEED_PASSWORD_LITERAL: string;

beforeAll(async () => {
  const m = await import('../../src/testkit/personaSecrets');
  TEST_PERSONA_SEED_PASSWORD_LITERAL = m.TEST_PERSONA_SEED_PASSWORD_LITERAL;
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

describe('TEST_PERSONA_SEED_PASSWORD_LITERAL — leak protection', () => {
  it('appears in exactly one checked-in file: src/testkit/personaSecrets.ts', () => {
    const hits = grepRepoForLiteral(TEST_PERSONA_SEED_PASSWORD_LITERAL);
    expect(hits).toEqual(['src/testkit/personaSecrets.ts']);
  }, 30_000);

  it('persona seed runner source does not embed the literal as a string', () => {
    const source = readFileSync(
      path.resolve(REPO_ROOT, 'src', 'testkit', 'personaSeedRunner.ts'),
      'utf8',
    );
    expect(source).not.toContain(TEST_PERSONA_SEED_PASSWORD_LITERAL);
  });

  it('deploy/operator scripts do not embed the literal', () => {
    for (const relPath of [
      'deploy_to_aws.sh',
      'scripts/deploy-rebuild.sh',
      'scripts/internal/deploy-rebuild-remote.sh',
      'scripts/manage-test-personas.sh',
      'run_dev.sh',
    ]) {
      const source = readFileSync(path.resolve(REPO_ROOT, relPath), 'utf8');
      expect(source, `${relPath} must not embed the persona password literal`).not.toContain(
        TEST_PERSONA_SEED_PASSWORD_LITERAL,
      );
    }
  });

  it('seedPersona stores an argon2id hash in members.password_hash; never the plaintext literal', async () => {
    const BetterSqlite3 = (await import('better-sqlite3')).default;
    const { hashPassword } = await import('../../src/lib/passwordHash');
    const { seedPersona } = await import('../../src/testkit/personaFactory');
    const fs = await import('node:fs');
    const os = await import('node:os');

    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'personaseed-password-'));
    const dbPath = path.join(tmpDir, 'footbag.db');
    const schema = fs.readFileSync(path.join(REPO_ROOT, 'database', 'schema.sql'), 'utf8');
    const db = new BetterSqlite3(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('foreign_keys = ON');
    db.exec(schema);

    try {
      const passwordHash = await hashPassword(TEST_PERSONA_SEED_PASSWORD_LITERAL);
      db.transaction(() =>
        seedPersona(
          db,
          {
            slug: 'persona_password_leak',
            displayName: 'Persona Password Leak',
            tier: 'tier0',
            coverageNotes: ['password-leak regression'],
          },
          { passwordHash },
        ),
      )();

      const row = db
        .prepare('SELECT password_hash FROM members WHERE slug = ?')
        .get('persona_password_leak') as { password_hash: string } | undefined;
      expect(row).toBeDefined();
      expect(row!.password_hash.startsWith('$argon2id$')).toBe(true);
      expect(row!.password_hash).not.toContain(TEST_PERSONA_SEED_PASSWORD_LITERAL);
    } finally {
      db.close();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  }, 30_000);
});
