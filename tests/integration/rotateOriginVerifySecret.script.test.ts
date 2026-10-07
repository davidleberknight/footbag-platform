/**
 * Rotating the shared secret CloudFront sends to the origin, as one operation.
 *
 * Rotation is three acts in a fixed order: replace the secret, deploy so the host
 * mirrors it, prove the site answers through CloudFront. Between the first two
 * every request through CloudFront is refused, so what these pin is the order and
 * the gates between the acts: nothing is replaced while the site is already
 * failing, nothing is deployed unless the stored secret really changed and has
 * the shape the host expects, a failed step stops the run with the step to
 * resume from, and the secret itself never reaches the output.
 *
 * Every external act runs against a stand-in: the Terraform wrapper and the
 * deploy record that they ran, the parameter store answers from a file the
 * wrapper stand-in rewrites, and curl answers with a status the case chooses.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/rotate-origin-verify-secret.sh');
const OLD_SECRET = 'a'.repeat(64);
const NEW_SECRET = 'b'.repeat(64);

let workDir: string;
let callLog: string;
let secretFile: string;

function stub(name: string, body: string[]): string {
  const path = join(workDir, name);
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n'));
  chmodSync(path, 0o755);
  return path;
}

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-rotate-'));
  callLog = join(workDir, 'calls.log');
  secretFile = join(workDir, 'secret');
  writeFileSync(secretFile, OLD_SECRET);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

interface Opts {
  /** What the wrapper stand-in writes as the new stored value; null leaves it alone. */
  rotatedTo?: string | null;
  applyExit?: number;
  deployExit?: number;
  /** The status curl reports before the deploy has run, and after it. */
  statusBefore?: string;
  statusAfter?: string;
}

function run(args: string[], opts: Opts = {}) {
  const {
    rotatedTo = NEW_SECRET, applyExit = 0, deployExit = 0, statusBefore = '200', statusAfter = '200',
  } = opts;
  const deployed = join(workDir, 'deployed.marker');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ROTATE_TF_APPLY: stub('tf-apply', [
      `echo "tf-apply $*" >> ${JSON.stringify(callLog)}`,
      ...(rotatedTo === null ? [] : [`printf '%s' ${JSON.stringify(rotatedTo)} > ${JSON.stringify(secretFile)}`]),
      `exit ${applyExit}`,
    ]),
    ROTATE_DEPLOY: stub('deploy', [
      `echo "deploy $*" >> ${JSON.stringify(callLog)}`,
      ...(deployExit === 0 ? [`: > ${JSON.stringify(deployed)}`] : []),
      `exit ${deployExit}`,
    ]),
    ROTATE_AWS_BIN: stub('aws', [
      `echo "aws $*" >> ${JSON.stringify(callLog)}`,
      `cat ${JSON.stringify(secretFile)}`,
    ]),
    ROTATE_TERRAFORM_BIN: stub('terraform', ['echo "d1234abcdef8.cloudfront.net"']),
    ROTATE_CURL_BIN: stub('curl', [
      `echo "curl $*" >> ${JSON.stringify(callLog)}`,
      `if [[ -e ${JSON.stringify(deployed)} ]]; then printf '%s' ${JSON.stringify(statusAfter)}; else printf '%s' ${JSON.stringify(statusBefore)}; fi`,
    ]),
    ROTATE_PROBE_TRIES: '1',
  };
  const res = spawnSync('bash', [SCRIPT, ...args], { encoding: 'utf8', input: '', env, ...SPAWN_GUARD });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

describe('rotating the origin-verify secret', () => {
  it('replaces through the wrapper, deploys code only, then proves the site through CloudFront', () => {
    const res = run(['--target', 'staging']);
    expect(res.status, res.stderr).toBe(0);
    const log = calls();
    expect(log).toContain('tf-apply --target staging --replace random_id.origin_verify_secret');
    expect(log).toContain('deploy --target staging -k');
    expect(log.indexOf('tf-apply')).toBeLessThan(log.indexOf('deploy'));
    expect(log).toContain('https://d1234abcdef8.cloudfront.net/health/ready');
    expect(res.stdout).toContain('answers 200');
  });

  it('never prints the secret, old or new', () => {
    // The value is compared by digest. One echoed into the output lands in a
    // terminal scrollback, a CI log or an agent transcript.
    const res = run(['--target', 'staging']);
    for (const secret of [OLD_SECRET, NEW_SECRET]) {
      expect(res.stdout).not.toContain(secret);
      expect(res.stderr).not.toContain(secret);
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
    // Defect caught: a rotation started on a broken site ends broken, and
    // nothing can tell whether the rotation or the earlier fault is to blame.
    const res = run(['--target', 'staging'], { statusBefore: '000' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('before anything is changed');
    expect(calls()).not.toContain('tf-apply');
  });

  it('does not deploy when the replacement failed to apply', () => {
    const res = run(['--target', 'staging'], { applyExit: 1, rotatedTo: null });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not apply');
    expect(calls()).not.toContain('deploy');
  });

  it('does not deploy when the stored secret did not change', () => {
    // Defect caught: an apply that succeeded without replacing anything, then a
    // deploy reported as a rotation that never happened.
    const res = run(['--target', 'staging'], { rotatedTo: null });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not change');
    expect(calls()).not.toContain('deploy');
  });

  it('does not deploy a stored value the host and nginx would not accept', () => {
    // A placeholder, one character short, one too long, and the right length
    // in uppercase or outside hex.
    for (const rotatedTo of [
      'TODO-placeholder', 'a'.repeat(63), 'a'.repeat(65), 'A'.repeat(64), 'g'.repeat(64),
    ]) {
      rmSync(callLog, { force: true });
      writeFileSync(secretFile, OLD_SECRET);
      const res = run(['--target', 'staging'], { rotatedTo });
      expect(res.status, rotatedTo).toBe(1);
      expect(res.stderr, rotatedTo).toContain('64-character lowercase hex');
      expect(calls(), rotatedTo).not.toContain('deploy');
    }
  });

  it('names the step to resume from when the deploy fails, rather than rotating again', () => {
    const res = run(['--target', 'staging'], { deployExit: 1 });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--from-step 2');
  });

  it('resumes at the deploy without replacing the secret a second time', () => {
    const res = run(['--target', 'staging', '--from-step', '2']);
    expect(res.status, res.stderr).toBe(0);
    expect(calls()).not.toContain('tf-apply');
    expect(calls()).toContain('deploy --target staging -k');
  });

  it('fails when the site does not answer through CloudFront after the deploy', () => {
    // Defect caught: a rotation reported done while every request through
    // CloudFront is refused because the host never picked up the new value.
    const res = run(['--target', 'staging'], { statusAfter: '000' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('--from-step 3');
  });

  it('says on stderr that its test seams are in use', () => {
    const res = run(['--target', 'staging']);
    expect(res.stderr).toContain('TEST SEAM ROTATE_TF_APPLY is set');
  });
});
