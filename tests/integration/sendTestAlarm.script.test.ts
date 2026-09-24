/**
 * Contract tests for scripts/send-test-alarm.sh: raising one named alarm briefly
 * so every watcher can confirm alarm mail reaches them.
 *
 * What carries the risk: a test aimed at one environment reaching the other's
 * alarms; a state change made without the typed confirmation; an alarm left
 * raised because the second call was never made; and a success reported when a
 * call was refused.
 *
 * Hermetic: a stand-in AWS CLI, named through the script's test seam, logs its
 * argv and can be told to refuse, and the shared identity stub settles the
 * profile.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'send-test-alarm.sh');

let dir: string;
let fakeAws: string;
let awsLog: string;

function run(args: string[], env: Record<string, string> = {}): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...awsIdentityStubEnv(dir), FOOTBAG_AWS_BIN: fakeAws, FAKE_AWS_LOG: awsLog, ...env },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const calls = (): string[] => fs.readFileSync(awsLog, 'utf8').split('\n').filter((l) => l.includes('set-alarm-state'));

beforeEach(() => {
  dir = createScratchDir('send-test-alarm');
  awsLog = path.join(dir, 'aws.log');
  fs.writeFileSync(awsLog, '');
  fakeAws = path.join(dir, 'aws');
  fs.writeFileSync(
    fakeAws,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_AWS_LOG"',
      'if [[ -n "${FAKE_REFUSE_STATE:-}" && "$*" == *"--state-value ${FAKE_REFUSE_STATE}"* ]]; then',
      '  echo "ResourceNotFound" >&2; exit 254',
      'fi',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
});

afterEach(() => {
  removeScratch(dir);
});

describe('send-test-alarm: raising the alarm', () => {
  it('raises the named alarm and then sets it back to OK, in that order', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes']);
    expect(res.status).toBe(0);
    const [raise, restore] = calls();
    expect(raise).toContain('--alarm-name footbag-production-5xx-rate');
    expect(raise).toContain('--state-value ALARM');
    expect(restore).toContain('--state-value OK');
    expect(res.stdout).toContain('Record who received both in the cutover log');
  });

  it('fails when the alarm cannot be raised, and makes no second call', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes'], {
      FAKE_REFUSE_STATE: 'ALARM',
    });
    expect(res.status).toBe(1);
    expect(calls()).toHaveLength(1);
  });

  it('fails when the alarm was raised but could not be set back to OK', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes'], {
      FAKE_REFUSE_STATE: 'OK',
    });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('could not be set back to OK');
  });
});

describe('send-test-alarm: refusals', () => {
  it('refuses an alarm belonging to the other environment', () => {
    const res = run(['--target', 'staging', '--alarm', 'footbag-production-5xx-rate', '--yes']);
    expect(res.status).toBe(2);
    expect(calls()).toHaveLength(0);
  });

  it('refuses without a target or an alarm', () => {
    expect(run(['--alarm', 'footbag-production-5xx-rate', '--yes']).status).toBe(2);
    expect(run(['--target', 'production', '--yes']).status).toBe(2);
  });

  it('changes nothing without the typed confirmation when no terminal is attached', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate']);
    expect(res.status).toBe(1);
    expect(calls()).toHaveLength(0);
  });

  it('says on stderr that a stand-in AWS CLI proves nothing about the account', () => {
    const res = run(['--target', 'production', '--alarm', 'footbag-production-5xx-rate', '--yes']);
    expect(res.stderr).toContain('proves nothing about the account');
  });
});
