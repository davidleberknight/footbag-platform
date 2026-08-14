/**
 * scripts/provision-archive-signing-key.sh — per-environment key isolation.
 *
 * The archive's CloudFront key group validates cookies signed by the private
 * half of this keypair, and each environment stores its own copy in its own
 * Parameter Store namespace. The key file on the operator workstation must
 * carry the environment for that separation to hold: a shared file makes one
 * environment's key group trust a key another environment can read, which is
 * the cross-environment bridge the per-environment secret scoping exists to
 * prevent. These tests pin the isolation and the refusal that protects a key
 * predating the convention, neither of which needs AWS.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/provision-archive-signing-key.sh');

let keyDir: string;

beforeEach(() => {
  keyDir = mkdtempSync(join(tmpdir(), 'footbag-test-archive-key-'));
});

afterEach(() => {
  rmSync(keyDir, { recursive: true, force: true });
});

function run(args: string[]) {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('provision-archive-signing-key.sh — each environment owns its own keypair', () => {
  it('names the generated keypair after the environment', () => {
    const result = run(['--env', 'production', '--key-dir', keyDir, 'generate']);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(keyDir, 'archive-signing-key-production.pem'))).toBe(true);
    expect(existsSync(join(keyDir, 'archive-signing-key-production.pub'))).toBe(true);
    expect(existsSync(join(keyDir, 'archive-signing-key.pem'))).toBe(false);
  });

  it('gives two environments two different keys in one key directory', () => {
    expect(run(['--env', 'staging', '--key-dir', keyDir, 'generate']).exitCode).toBe(0);
    expect(run(['--env', 'production', '--key-dir', keyDir, 'generate']).exitCode).toBe(0);

    const staging = readFileSync(join(keyDir, 'archive-signing-key-staging.pub'), 'utf-8');
    const production = readFileSync(join(keyDir, 'archive-signing-key-production.pub'), 'utf-8');

    expect(staging).not.toEqual(production);
  });

  it('emits the tfvars block from this environment’s own public key', () => {
    run(['--env', 'staging', '--key-dir', keyDir, 'generate']);
    run(['--env', 'production', '--key-dir', keyDir, 'generate']);

    const result = run(['--env', 'production', '--key-dir', keyDir, 'tfvars']);
    const production = readFileSync(join(keyDir, 'archive-signing-key-production.pub'), 'utf-8');
    const stagingBody = readFileSync(join(keyDir, 'archive-signing-key-staging.pub'), 'utf-8')
      .split('\n')
      .filter((line) => line && !line.startsWith('-----'))[0];

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('archive_signing_public_key = <<-EOT');
    expect(result.stdout).toContain(production.split('\n')[1]);
    expect(result.stdout).not.toContain(stagingBody);
  });
});

describe('provision-archive-signing-key.sh — a key predating the convention', () => {
  // Deliberately not PEM-shaped. The refusal keys on the file existing under the
  // old name, never on its contents, so a realistic body would buy the test
  // nothing and would trip the repository's private-key secret scan on every
  // run thereafter.
  function writeUnscopedKey() {
    writeFileSync(join(keyDir, 'archive-signing-key.pem'), 'placeholder for an old key file\n');
    writeFileSync(join(keyDir, 'archive-signing-key.pub'), 'placeholder for an old key file\n');
  }

  it('refuses to emit tfvars from it rather than passing another environment’s key on', () => {
    writeUnscopedKey();

    const result = run(['--env', 'production', '--key-dir', keyDir, 'tfvars']);

    expect(result.exitCode).toBe(1);
    expect(result.stdout).not.toContain('archive_signing_public_key');
    expect(result.stderr).toContain('archive-signing-key-production.pem');
    expect(result.stderr).toMatch(/may belong to a\s*\n?.*different environment/);
  });

  it('refuses to generate over it, and names both ways to resolve it', () => {
    writeUnscopedKey();

    const result = run(['--env', 'production', '--key-dir', keyDir, 'generate']);

    expect(result.exitCode).toBe(1);
    expect(existsSync(join(keyDir, 'archive-signing-key-production.pem'))).toBe(false);
    expect(result.stderr).toContain('rename it to');
  });

  it('generates normally once no unscoped key is present', () => {
    const result = run(['--env', 'production', '--key-dir', keyDir, 'generate']);

    expect(result.exitCode).toBe(0);
    expect(existsSync(join(keyDir, 'archive-signing-key-production.pem'))).toBe(true);
  });
});
