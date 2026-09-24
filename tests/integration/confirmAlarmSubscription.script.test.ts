/**
 * Contract tests for scripts/confirm-alarm-subscription.sh: confirming the
 * ops-alert group's alarm subscription so that the unsubscribe link in an alarm
 * email cannot remove it.
 *
 * What carries the risk: a confirmation that leaves the subscription removable
 * by one stray click, which is silent and removes it for every member of the
 * group; a link for the wrong topic or the wrong environment being confirmed;
 * a confirmation happening without the typed answer; and a pass reported on the
 * strength of the call returning rather than on what the service now holds.
 *
 * Hermetic: a stand-in AWS CLI, named through the script's test seam, answers
 * the two subscription calls and logs its argv, and the shared identity stub
 * settles the profile. The link is built from the two parameters the service's
 * confirmation call takes, the topic and the token, which is all the script
 * reads from it; its other parameters and their order do not matter to a URL
 * parser.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { awsIdentityStubEnv } from '../fixtures/awsIdentityStub';

const REPO_ROOT = path.resolve(__dirname, '..', '..');
const SCRIPT = path.join(REPO_ROOT, 'scripts', 'confirm-alarm-subscription.sh');

function link(topic: string, token = 'a1b2c3d4e5'): string {
  return (
    'https://sns.us-east-1.amazonaws.com/confirmation.html?TopicArn=' +
    encodeURIComponent(`arn:aws:sns:us-east-1:000000000000:${topic}`) +
    `&Token=${token}&Endpoint=ops-alert@footbag.org`
  );
}

let dir: string;
let fakeAws: string;
let awsLog: string;

function run(
  args: string[],
  stdin: string,
  env: Record<string, string> = {},
): { status: number | null; stdout: string; stderr: string } {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: stdin + '\n',
    env: {
      ...process.env,
      ...awsIdentityStubEnv(dir),
      FOOTBAG_AWS_BIN: fakeAws,
      FAKE_AWS_LOG: awsLog,
      ...env,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status, stdout: res.stdout, stderr: res.stderr };
}

const confirmCalls = (): string[] =>
  fs.readFileSync(awsLog, 'utf8').split('\n').filter((l) => l.includes('confirm-subscription'));

beforeEach(() => {
  dir = createScratchDir('confirm-alarm-subscription');
  awsLog = path.join(dir, 'aws.log');
  fs.writeFileSync(awsLog, '');
  fakeAws = path.join(dir, 'aws');
  fs.writeFileSync(
    fakeAws,
    [
      '#!/usr/bin/env bash',
      'printf \'%s\\n\' "$*" >> "$FAKE_AWS_LOG"',
      'case "$2" in',
      '  confirm-subscription)',
      '    [[ "${FAKE_CONFIRM_FAIL:-}" == "1" ]] && { echo "InvalidParameter: Token expired" >&2; exit 254; }',
      '    printf \'arn:aws:sns:us-east-1:000000000000:footbag-production-alarms:11111111-2222\\n\' ;;',
      '  get-subscription-attributes)',
      '    printf \'%s\\n\' "${FAKE_ATTRS:-false	true	ops-alert@footbag.org}" ;;',
      'esac',
      '',
    ].join('\n'),
    { mode: 0o755 },
  );
});

afterEach(() => {
  removeScratch(dir);
});

describe('confirm-alarm-subscription: confirming', () => {
  it('confirms with authentication required on unsubscribe, and passes on the read-back', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'));
    expect(res.status).toBe(0);
    expect(res.stdout).toContain('PASS: ops-alert@footbag.org is confirmed on footbag-production-alarms');
    const [call] = confirmCalls();
    expect(call).toContain('--authenticate-on-unsubscribe true');
    expect(call).toContain('--topic-arn arn:aws:sns:us-east-1:000000000000:footbag-production-alarms');
    expect(call).toContain('--token a1b2c3d4e5');
    expect(call).toContain('--region us-east-1');
  });

  it('accepts production’s certificate-alarm topic on production', () => {
    expect(run(['--target', 'production', '--yes'], link('footbag-production-alarms-use1')).status).toBe(0);
  });

  it('fails when the read-back shows a subscription an unsubscribe link could still remove', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'), {
      FAKE_ATTRS: 'false\tfalse\tops-alert@footbag.org',
    });
    expect(res.status).toBe(1);
    expect(res.stdout).toContain('not confirmed with authentication required');
  });

  it('fails when the read-back shows the subscription still pending', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'), {
      FAKE_ATTRS: 'true\tfalse\tops-alert@footbag.org',
    });
    expect(res.status).toBe(1);
  });

  it('fails, naming the fresh-email remedy, when the service refuses the token', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'), { FAKE_CONFIRM_FAIL: '1' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('fresh confirmation email');
  });
});

describe('confirm-alarm-subscription: refusals', () => {
  it('refuses a link for the other environment’s alarm topic', () => {
    const res = run(['--target', 'staging', '--yes'], link('footbag-production-alarms'));
    expect(res.status).toBe(2);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('refuses production’s certificate-alarm topic on staging', () => {
    const res = run(['--target', 'staging', '--yes'], link('footbag-production-alarms-use1'));
    expect(res.status).toBe(2);
    expect(res.stderr).toContain("not staging's");
  });

  it('refuses a topic that is not an alarm topic', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-ses-feedback'));
    expect(res.status).toBe(2);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('refuses a link that is not a confirmation link from the service', () => {
    const res = run(['--target', 'production', '--yes'], 'https://example.com/confirmation.html?TopicArn=x&Token=y');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('not a subscription confirmation link');
  });

  it('refuses an empty link', () => {
    expect(run(['--target', 'production', '--yes'], '').status).toBe(2);
  });

  it('refuses without a target', () => {
    expect(run(['--yes'], link('footbag-production-alarms')).status).toBe(2);
  });

  it('changes nothing without the typed confirmation when no terminal is attached', () => {
    const res = run(['--target', 'production'], link('footbag-production-alarms'));
    expect(res.status).toBe(1);
    expect(confirmCalls()).toHaveLength(0);
  });

  it('says on stderr that a stand-in AWS CLI proves nothing about the account', () => {
    const res = run(['--target', 'production', '--yes'], link('footbag-production-alarms'));
    expect(res.stderr).toContain('proves nothing about the account');
  });
});
