/**
 * scripts/mute-expected-alarms.sh: one heavy step's expected alarms muted for
 * a bounded window, and only once the account's alerting-disabled alarm counts
 * mute rules, so no mute goes unseen. Every way a mute could fail leaves the
 * run unmuted with a warning rather than blocked, and each refusal sits beside
 * a run the same guard lets through.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/mute-expected-alarms.sh');
const FILTER_WITH_MUTES = '{ ($.eventSource = "monitoring.amazonaws.com" && ($.eventName = "DeleteAlarms" || $.eventName = "DisableAlarmActions" || $.eventName = "PutAlarmMuteRule")) }';
const FILTER_WITHOUT = '{ ($.eventSource = "monitoring.amazonaws.com" && ($.eventName = "DeleteAlarms" || $.eventName = "DisableAlarmActions")) }';
const ALARMS = [
  'footbag-staging-cloudfront-5xx', 'footbag-staging-high-cpu', 'footbag-staging-high-memory',
  'footbag-staging-db-backup-stale', 'footbag-staging-container-unhealthy-web',
  'footbag-staging-container-crash-worker', 'footbag-staging-container-monitor-heartbeat',
  'footbag-staging-origin-latency', 'footbag-staging-site-unavailable',
].join('\t');

let work: string;
let bin: string;
let st: string;

const calls = () => (existsSync(join(st, 'calls.log')) ? readFileSync(join(st, 'calls.log'), 'utf8') : '').split('\n').filter(Boolean);
const putCall = () => calls().find((c) => c.includes('put-alarm-mute-rule'));

function exe(path: string, body: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n') + '\n');
  chmodSync(path, 0o755);
}

beforeEach(() => {
  work = createScratchDir('mute-expected-alarms');
  bin = join(work, 'bin');
  st = join(work, 'state');
  mkdirSync(bin);
  mkdirSync(st);
  exe(join(bin, 'aws'), [
    `S=${JSON.stringify(st)}`,
    'echo "aws $*" >> "$S/calls.log"',
    'case "$1 $2" in',
    '  "logs describe-metric-filters")',
    '    [[ -n "${FILTER_FAIL:-}" ]] && { echo "An error occurred (AccessDeniedException)" >&2; exit 254; }',
    '    printf "%s\\n" "${FILTER-}" ;;',
    '  "cloudwatch describe-alarms") printf "%s\\n" "${ALARMS-}" ;;',
    '  "cloudwatch put-alarm-mute-rule")',
    '    [[ -n "${PUT_FAIL:-}" ]] && { echo "An error occurred (ValidationException): bad schedule" >&2; exit 254; }',
    '    exit 0 ;;',
    '  "cloudwatch delete-alarm-mute-rule")',
    '    [[ -n "${NO_RULE:-}" ]] && { echo "An error occurred (ResourceNotFoundException)" >&2; exit 254; }',
    '    [[ -n "${DELETE_FAIL:-}" ]] && { echo "An error occurred (Throttling)" >&2; exit 254; }',
    '    exit 0 ;;',
    '  *) echo "stand-in aws: unhandled $*" >&2; exit 2 ;;',
    'esac',
  ]);
  exe(join(bin, 'identity'), ["printf '%s\\n' 'arn:aws:iam::111111111111:user/footbag-operator'"]);
});

afterEach(() => removeScratch(work));

function run(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf8',
    input: '',
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH ?? ''}`,
      MUTE_ALARMS_AWS_BIN: join(bin, 'aws'),
      MUTE_ALARMS_NOW: '2026-11-24T16:05',
      AWS_PROFILE: 'stub-profile',
      AWS_IDENTITY_BIN: join(bin, 'identity'),
      AWS_PROFILE_BIN: join(bin, 'identity'),
      FILTER: FILTER_WITH_MUTES,
      ALARMS,
      ...extra,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

describe('muting', () => {
  // Defect caught: a heavy step's expected 5xx, CPU and container alarms
  // mailing a dozen times and burying the one that matters; or a real alarm
  // (memory, disk, backups) silenced along with them.
  it('mutes only the expected kinds of the target\'s alarms, for the window asked, starting now', () => {
    const res = run(['--target', 'staging', '--minutes', '120']);
    expect(res.status, res.out).toBe(0);
    const put = putCall()!;
    expect(put).toContain('--name footbag-staging-heavy-step');
    expect(put).toContain('--rule Schedule={Expression=at(2026-11-24T16:05),Duration=PT120M}');
    const muted = /AlarmNames=(\S+)/.exec(put)![1].split(',');
    expect(muted.sort()).toEqual([
      'footbag-staging-cloudfront-5xx', 'footbag-staging-container-crash-worker',
      'footbag-staging-container-monitor-heartbeat', 'footbag-staging-container-unhealthy-web',
      'footbag-staging-high-cpu', 'footbag-staging-origin-latency', 'footbag-staging-site-unavailable',
    ]);
  });

  // Defect caught: a mute nobody can see. Until the alerting-disabled alarm
  // counts mute rules, muting would silence alarms with no trace.
  it('mutes nothing, with a warning, until the alerting-disabled filter counts mute rules', () => {
    const res = run(['--target', 'staging', '--minutes', '120'], { FILTER: FILTER_WITHOUT });
    expect(res.status, res.out).toBe(0);
    expect(res.out).toMatch(/nothing was muted: the applied alerting-disabled filter does not yet count mute rules/);
    expect(putCall()).toBeUndefined();
  });

  it.each([
    ['the filter cannot be read', { FILTER_FAIL: '1' }, /nothing was muted: the alerting-disabled filter could not be read/],
    ['the mute is refused', { PUT_FAIL: '1' }, /nothing was muted: the mute rule was refused: An error occurred \(ValidationException\)/],
    ['no expected alarm exists', { ALARMS: 'footbag-staging-high-memory' }, /nothing was muted: no staging alarm of the expected kinds exists/],
  ])('warns and lets the run go on unmuted when %s', (_label, env, said) => {
    // Defect caught: a heavy step blocked by its own mute.
    const res = run(['--target', 'staging', '--minutes', '120'], env);
    expect(res.status, res.out).toBe(0);
    expect(res.out).toMatch(said);
  });

  it('reads the filter on the account trail the production tree owns', () => {
    run(['--target', 'staging', '--minutes', '120']);
    const read = calls().find((c) => c.includes('describe-metric-filters'))!;
    expect(read).toContain('--log-group-name /footbag/production/cloudtrail');
    expect(read).toContain('--filter-name-prefix footbag-production-alerting-disabled');
  });
});

describe('lifting the mute', () => {
  it('deletes the rule, and takes a rule already gone as lifted', () => {
    const res = run(['--target', 'staging', '--clear']);
    expect(res.status, res.out).toBe(0);
    expect(calls().find((c) => c.includes('delete-alarm-mute-rule'))).toContain('--alarm-mute-rule-name footbag-staging-heavy-step');
    const gone = run(['--target', 'staging', '--clear'], { NO_RULE: '1' });
    expect(gone.status, gone.out).toBe(0);
    expect(gone.out).toMatch(/No mute footbag-staging-heavy-step was in place/);
  });

  it('fails, naming the cause, when the rule cannot be deleted', () => {
    // Defect caught: alarms left muted with the run reporting them lifted.
    const res = run(['--target', 'staging', '--clear'], { DELETE_FAIL: '1' });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/could not lift the mute footbag-staging-heavy-step, so its alarms stay muted until it expires: An error occurred \(Throttling\)/);
  });
});

describe('refusals', () => {
  it.each([
    [[], /target/i],
    [['--target', 'staging'], /--minutes must be a whole number from 1 to 600/],
    [['--target', 'staging', '--minutes', '601'], /--minutes must be a whole number from 1 to 600/],
    [['--target', 'staging', '--minutes', '10', '--clear'], /exclusive/],
  ])('refuses %j before reaching AWS', (args, said) => {
    const res = run(args as string[]);
    expect(res.status).toBe(2);
    expect(res.out).toMatch(said);
    expect(calls()).toEqual([]);
  });
});
