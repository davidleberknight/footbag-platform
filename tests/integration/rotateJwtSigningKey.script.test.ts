/**
 * Rotating the KMS key that signs every session token, as one operation.
 *
 * Rotation replaces the key through the Terraform wrapper, restarts the stack so
 * it loads the new public key, and proves the site answers. Every session ends at
 * the switch by design. What these pin: nothing is replaced while the site is
 * already failing; nothing is restarted unless the alias provably moved to a new,
 * enabled signing key whose public key differs and the old key is pending
 * deletion; a failed step names the step to resume from; the closing confirmation
 * is read from a terminal and nothing in the environment can answer it; and no
 * key identifier or public key reaches the output.
 *
 * Every external act runs against a stand-in. The KMS stand-in answers from files
 * the Terraform stand-in rewrites, the way a real replacement moves the alias.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/rotate-jwt-signing-key.sh');
const OLD_KEY = '1111aaaa-0000-0000-0000-000000000001';
const NEW_KEY = '2222bbbb-0000-0000-0000-000000000002';
const OLD_PEM = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAoldpublickeymaterial';
const NEW_PEM = 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAnewpublickeymaterial';

let workDir: string;
let callLog: string;
let world: string;

function stub(name: string, body: string[]): string {
  const path = join(workDir, name);
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

function put(file: string, value: string): void {
  writeFileSync(join(world, file), value);
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-rotate-jwt-'));
  callLog = join(workDir, 'calls.log');
  world = mkdtempSync(join(tmpdir(), 'footbag-test-rotate-jwt-world-'));
  put('alias', OLD_KEY);
  put(`shape_${OLD_KEY}`, 'Enabled\tRSA_2048\tSIGN_VERIFY');
  put(`state_${OLD_KEY}`, 'Enabled');
  put(`pem_${OLD_KEY}`, OLD_PEM);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
  rmSync(world, { recursive: true, force: true });
});

interface Opts {
  /** What the replacement leaves behind. null: the alias does not move. */
  rotation?: { shape: string; oldState: string; pem: string } | null;
  applyExit?: number;
  restartExit?: number;
  statusBefore?: string;
  statusAfter?: string;
  extraEnv?: NodeJS.ProcessEnv;
}

function run(args: string[], opts: Opts = {}) {
  const {
    rotation = { shape: 'Enabled\tRSA_2048\tSIGN_VERIFY', oldState: 'PendingDeletion', pem: NEW_PEM },
    applyExit = 0, restartExit = 0, statusBefore = '200', statusAfter = '200',
  } = opts;
  const restarted = join(workDir, 'restarted.marker');
  const w = JSON.stringify(world);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...(opts.extraEnv ?? {}),
    ROTATE_JWT_TF_APPLY: stub('tf-apply', [
      `echo "tf-apply $*" >> ${JSON.stringify(callLog)}`,
      ...(rotation === null || applyExit !== 0
        ? []
        : [
            `printf '%s' ${JSON.stringify(NEW_KEY)} > ${w}/alias`,
            `printf '%b' ${JSON.stringify(rotation.shape.replace(/\t/g, '\\t'))} > ${w}/shape_${NEW_KEY}`,
            `printf '%s' ${JSON.stringify(rotation.oldState)} > ${w}/state_${OLD_KEY}`,
            `printf '%s' ${JSON.stringify(rotation.pem)} > ${w}/pem_${NEW_KEY}`,
          ]),
      `exit ${applyExit}`,
    ]),
    ROTATE_JWT_RESTART: stub('restart', [
      `echo "restart $*" >> ${JSON.stringify(callLog)}`,
      'IFS= read -r line || true',
      `echo "restart-stdin $line" >> ${JSON.stringify(callLog)}`,
      ...(restartExit === 0 ? [`: > ${JSON.stringify(restarted)}`] : []),
      `exit ${restartExit}`,
    ]),
    ROTATE_JWT_AWS_BIN: stub('aws', [
      `echo "aws $*" >> ${JSON.stringify(callLog)}`,
      'key=""; query=""; prev=""',
      'for a in "$@"; do case "$prev" in --key-id) key="$a" ;; --query) query="$a" ;; esac; prev="$a"; done',
      `[[ "$key" == alias/* ]] && key="$(cat ${w}/alias)"`,
      'case "$2:$query" in',
      '  describe-key:KeyMetadata.KeyId) printf "%s\\n" "$key" ;;',
      `  describe-key:KeyMetadata.KeyState) cat ${w}/state_"$key" 2>/dev/null || exit 254; echo ;;`,
      `  describe-key:*) cat ${w}/shape_"$key" 2>/dev/null || exit 254; echo ;;`,
      `  get-public-key:*) cat ${w}/pem_"$key" 2>/dev/null || exit 254; echo ;;`,
      '  *) exit 64 ;;',
      'esac',
    ]),
    ROTATE_JWT_TERRAFORM_BIN: stub('terraform', ['echo "d111111abcdef8.cloudfront.net"']),
    ROTATE_JWT_CURL_BIN: stub('curl', [
      `echo "curl $*" >> ${JSON.stringify(callLog)}`,
      `if [[ -e ${JSON.stringify(restarted)} ]]; then printf '%s' ${JSON.stringify(statusAfter)}; else printf '%s' ${JSON.stringify(statusBefore)}; fi`,
    ]),
    ROTATE_JWT_PROBE_TRIES: '1',
  };
  const res = spawnSync('setsid', ['bash', SCRIPT, ...args], {
    encoding: 'utf8', input: 'fixture-sudo-password\n', env, ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

describe('rotating the JWT signing key', () => {
  it('replaces through the wrapper, restarts after the proof, and stops for the confirmation it cannot fake', () => {
    // With no terminal the closing confirmation is refused, which is the only
    // way the run ends here: everything before it must have happened in order.
    const res = run(['--target', 'staging']);
    const log = calls();
    expect(log).toContain('tf-apply --target staging --replace aws_kms_key.jwt_signing');
    expect(log).toContain('restart --target staging');
    expect(log.indexOf('tf-apply')).toBeLessThan(log.indexOf('restart --target'));
    expect(log).toContain('https://d111111abcdef8.cloudfront.net/health/ready');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('no terminal to confirm on');
    expect(res.stderr).toContain('--from-step 3');
  });

  it('hands the host password to the restart, never to the apply', () => {
    // Defect caught: the apply reading stdin would swallow the password the
    // restart needs, and the restart would then refuse with no credential.
    run(['--target', 'staging']);
    expect(calls()).toContain('restart-stdin fixture-sudo-password');
  });

  it('cannot have its closing confirmation answered by an exported variable', () => {
    // An exported ASSUME_YES in the operator's shell must not stand in for a
    // person checking that an earlier session was signed out.
    const res = run(['--target', 'staging'], { extraEnv: { ASSUME_YES: 'yes' } });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not confirmed');
  });

  it('never prints a key identifier or a public key', () => {
    const res = run(['--target', 'staging']);
    for (const value of [OLD_KEY, NEW_KEY, OLD_PEM, NEW_PEM]) {
      expect(res.stdout).not.toContain(value);
      expect(res.stderr).not.toContain(value);
    }
  });

  it('refuses a missing or unknown target before doing anything', () => {
    for (const args of [[], ['--target', 'prod']]) {
      const res = run(args);
      expect(res.status, args.join(' ')).toBe(1);
      expect(res.stderr).toContain('--target must be staging or production');
    }
    expect(calls()).toBe('');
  });

  it('refuses to rotate while the site already fails through CloudFront', () => {
    const res = run(['--target', 'staging'], { statusBefore: '000' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('before anything is changed');
    expect(calls()).not.toContain('tf-apply');
  });

  it('does not restart when the replacement failed to apply', () => {
    const res = run(['--target', 'staging'], { applyExit: 1 });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not apply');
    expect(calls()).not.toContain('restart --target');
  });

  // Each row is a replacement that looked applied but left something a restart
  // must not land on: the alias still on the old key, a new key that cannot sign,
  // the same public key, or an old key still live. Restarting onto any of them
  // either changes nothing while reporting a rotation, or signs every member out
  // onto a key that cannot sign them back in.
  it.each([
    ['the alias did not move', null, 'still points at the same key'],
    ['the new key is disabled', { shape: 'Disabled\tRSA_2048\tSIGN_VERIFY', oldState: 'PendingDeletion', pem: NEW_PEM }, 'not an enabled RSA_2048 signing key'],
    ['the new key is not a signing key', { shape: 'Enabled\tSYMMETRIC_DEFAULT\tENCRYPT_DECRYPT', oldState: 'PendingDeletion', pem: NEW_PEM }, 'not an enabled RSA_2048 signing key'],
    ['the public key did not change', { shape: 'Enabled\tRSA_2048\tSIGN_VERIFY', oldState: 'PendingDeletion', pem: OLD_PEM }, 'public key did not change'],
    ['the old key is still enabled', { shape: 'Enabled\tRSA_2048\tSIGN_VERIFY', oldState: 'Enabled', pem: NEW_PEM }, 'not pending deletion'],
  ] as const)('does not restart when %s', (_label, rotation, message) => {
    const res = run(['--target', 'staging'], { rotation });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain(message);
    expect(calls()).not.toContain('restart --target');
  });

  it('resumes at the restart without replacing the key a second time', () => {
    const res = run(['--target', 'staging', '--from-step', '2']);
    expect(calls()).not.toContain('tf-apply');
    expect(calls()).toContain('restart --target staging');
    expect(res.stderr).toContain('no terminal to confirm on');
  });

  it('names the step to resume from when the restart fails', () => {
    const res = run(['--target', 'staging'], { restartExit: 1 });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--from-step 2');
  });

  it('fails, naming the step, when the site does not answer after the restart', () => {
    // Defect caught: a container that could not load the new key reported as a
    // finished rotation while every request fails.
    const res = run(['--target', 'staging'], { statusAfter: '000' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('after the restart');
    expect(res.stderr).not.toContain('no terminal to confirm on');
  });

  it('says on stderr that its test seams are in use', () => {
    const res = run(['--target', 'staging']);
    expect(res.stderr).toContain('TEST SEAM ROTATE_JWT_TF_APPLY is set');
  });
});
