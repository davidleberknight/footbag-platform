/**
 * Contract tests for scripts/internal/deploy-rebuild-production-live-guard.sh:
 * the database-replacing deploy refuses a production target unless the SSM
 * production-live marker reads exactly "false", and independently refuses when
 * the on-host database already holds login-capable non-persona member accounts
 * over the pre-launch allowance. Both checks fail closed; non-production
 * targets are exempt.
 *
 * Hermetic: a fake `aws` executable on PATH serves the marker value from env
 * vars, and the database fixture is a minimal members table (the only table
 * the guard reads).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import BetterSqlite3 from 'better-sqlite3';
import * as path from 'node:path';
import * as fs from 'node:fs';
import * as os from 'node:os';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GUARD = path.join(
  REPO_ROOT,
  'scripts',
  'internal',
  'deploy-rebuild-production-live-guard.sh',
);

let dir: string;
let envPath: string;
let dbPath: string;
let fakeBin: string;

function writeFakeAws(): void {
  fakeBin = path.join(dir, 'bin');
  fs.mkdirSync(fakeBin, { recursive: true });
  const fakeAws = path.join(fakeBin, 'aws');
  fs.writeFileSync(
    fakeAws,
    '#!/usr/bin/env bash\n' +
      'if [[ "${FAKE_SSM_FAIL:-}" == "1" ]]; then exit 1; fi\n' +
      'printf \'%s\\n\' "${FAKE_SSM_VALUE:-false}"\n',
    { mode: 0o755 },
  );
}

function seedMembers(counts: {
  real?: number;
  personas?: number;
  passwordless?: number;
}): void {
  const db = new BetterSqlite3(dbPath);
  db.exec('CREATE TABLE members (id TEXT PRIMARY KEY, password_hash TEXT);');
  const insert = db.prepare('INSERT INTO members (id, password_hash) VALUES (?, ?)');
  for (let i = 0; i < (counts.real ?? 0); i++) {
    insert.run(`member_real_${i}`, `argon2-hash-${i}`);
  }
  for (let i = 0; i < (counts.personas ?? 0); i++) {
    insert.run(`member_persona_${i}`, `argon2-hash-p${i}`);
  }
  for (let i = 0; i < (counts.passwordless ?? 0); i++) {
    insert.run(`member_unclaimed_${i}`, null);
  }
  db.close();
}

function runGuard(overrides: Record<string, string> = {}): {
  status: number | null;
  stderr: string;
} {
  const res = spawnSync('bash', [GUARD], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
      FOOTBAG_ENV: 'production',
      ENV_PATH: envPath,
      DB_PATH: dbPath,
      ...overrides,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stderr: res.stderr };
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'footbag-test-prodlive-'));
  envPath = path.join(dir, 'env');
  dbPath = path.join(dir, 'footbag.db');
  fs.writeFileSync(envPath, 'AWS_PROFILE=fixture-profile\nAWS_REGION=us-east-1\n');
  writeFakeAws();
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('production-live guard: marker check', () => {
  it('passes a pre-live production target (marker "false", no database yet)', () => {
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    expect(res.status).toBe(0);
  });

  it('refuses a live-marked production target (marker "true")', () => {
    const res = runGuard({ FAKE_SSM_VALUE: 'true' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('production-live marker');
    expect(res.stderr).toContain('no bypass flag');
  });

  it('offers recovery advice that can actually move the marker, not a terraform apply', () => {
    // The marker resource carries ignore_changes on its value, so an apply
    // cannot move it in either direction. Advising one leaves the operator
    // running a command that changes nothing and a deploy still refused.
    const res = runGuard({ FAKE_SSM_VALUE: 'true' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('scripts/production-live-marker.sh');
    expect(res.stderr).not.toMatch(/run terraform apply/);
  });

  it('refuses any marker value other than exactly "false"', () => {
    const res = runGuard({ FAKE_SSM_VALUE: 'False' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('production-live marker');
  });

  it('refuses when the marker cannot be read (fail closed)', () => {
    const res = runGuard({ FAKE_SSM_FAIL: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('unreadable');
  });

  it('exempts non-production targets without reading the marker', () => {
    const res = runGuard({ FOOTBAG_ENV: 'staging', FAKE_SSM_VALUE: 'true' });
    expect(res.status).toBe(0);
  });
});

describe('production-live guard: real-member tripwire', () => {
  it('passes at exactly the pre-launch allowance of login-capable accounts', () => {
    seedMembers({ real: 3 });
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    expect(res.status).toBe(0);
  });

  it('refuses one account over the allowance, whatever the marker reads', () => {
    seedMembers({ real: 4 });
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('login-capable non-persona member accounts');
  });

  it('counts neither persona accounts nor password-less rows toward the allowance', () => {
    seedMembers({ real: 3, personas: 10, passwordless: 10 });
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    expect(res.status).toBe(0);
  });

  it('passes a database file that has no members table (fresh host artifact)', () => {
    const db = new BetterSqlite3(dbPath);
    db.exec('CREATE TABLE unrelated (id TEXT);');
    db.close();
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    expect(res.status).toBe(0);
  });

  it('refuses a database file it cannot read (fail closed)', () => {
    seedMembers({ real: 0 });
    fs.chmodSync(dbPath, 0o000);
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    fs.chmodSync(dbPath, 0o600);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not be read');
  });

  it('resolves the tripwire database from the host env file when no explicit path is given', () => {
    // The remote half deploys against FOOTBAG_DB_PATH from the host env
    // file, so the tripwire must inspect the same file; a hardcoded-only
    // fallback would silently pass on a host with a non-standard path.
    seedMembers({ real: 4 });
    fs.appendFileSync(envPath, `FOOTBAG_DB_PATH=${dbPath}\n`);
    const res = spawnSync('bash', [GUARD], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH ?? ''}`,
        FOOTBAG_ENV: 'production',
        ENV_PATH: envPath,
        FAKE_SSM_VALUE: 'false',
        DB_PATH: '',
      },
      ...SPAWN_GUARD,
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('login-capable non-persona member accounts');
  });

  it('also inspects the pre-migration database location (static)', () => {
    // A host whose env still carries the pre-migration path keeps its
    // database there until the remote half migrates it, after this guard;
    // reading as "fresh" there would silently skip the tripwire.
    const content = fs.readFileSync(GUARD, 'utf8');
    expect(content).toContain('PROD_LIVE_GUARD_DB_CANDIDATES+=("/srv/footbag/footbag.db")');
  });
});

describe('production-live guard: host-identity reconciliation', () => {
  it('refuses when the host env file records a different FOOTBAG_ENV than asserted', () => {
    // A misrouted SSH alias (staging alias pointing at the production box)
    // would otherwise skip every production-only check.
    fs.appendFileSync(envPath, 'FOOTBAG_ENV=production\n');
    const res = runGuard({ FOOTBAG_ENV: 'staging', FAKE_SSM_VALUE: 'true' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('misrouted SSH alias');
  });

  it('passes when the host record matches the asserted environment', () => {
    fs.appendFileSync(envPath, 'FOOTBAG_ENV=production\n');
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    expect(res.status).toBe(0);
  });

  it('passes a host with no recorded environment (first deploy)', () => {
    const res = runGuard({ FAKE_SSM_VALUE: 'false' });
    expect(res.status).toBe(0);
  });
});
