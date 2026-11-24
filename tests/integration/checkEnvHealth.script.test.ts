/**
 * scripts/check-env-health.sh: the read a heavy step waits on. A host whose
 * CPU burst allowance is spent runs at baseline CPU, so a bootstrap, restore or
 * deploy started there crawls and fails; and a critical alarm fired during a
 * long run must stop it rather than sit unread in a mailbox. Each refusal sits
 * beside a reading the same guard lets through, so a script that refuses
 * everything cannot pass.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/check-env-health.sh');
/** A name a restore from snapshot gives the host, so a hard-coded original name is caught. */
const INSTANCE = 'footbag-staging-web-r202611231837';
const CRITICAL = 'arn:aws:sns:us-east-1:111111111111:footbag-staging-alarms,arn:aws:sns:us-east-1:111111111111:footbag-staging-alarms-critical';
const WARNING = 'arn:aws:sns:us-east-1:111111111111:footbag-staging-alarms';

let work: string;
let bin: string;
let st: string;

const read = (f: string) => (existsSync(f) ? readFileSync(f, 'utf8') : '');
const calls = () => read(join(st, 'calls.log')).split('\n').filter(Boolean);

function exe(path: string, body: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n') + '\n');
  chmodSync(path, 0o755);
}

beforeEach(() => {
  work = createScratchDir('check-env-health');
  bin = join(work, 'bin');
  st = join(work, 'state');
  mkdirSync(bin);
  mkdirSync(st);
  // BURST: the metric lines Lightsail returns as text, "timestamp<TAB>average".
  // ALARMS: successive describe-alarms answers split on "~", the last repeating,
  // each "name<TAB>actions" lines with "\n" between them.
  exe(join(bin, 'aws'), [
    `S=${JSON.stringify(st)}`,
    'echo "aws $*" >> "$S/calls.log"',
    'case "$1 $2" in',
    '  "lightsail get-instance-metric-data")',
    `    [[ " $* " == *" --instance-name ${INSTANCE} "* ]] || { echo "NotFoundException" >&2; exit 254; }`,
    '    [[ -n "${BURST_FAIL:-}" ]] && { echo "An error occurred (AccessDeniedException)" >&2; exit 254; }',
    '    printf "%b" "${BURST-}" ;;',
    '  "cloudwatch describe-alarms")',
    '    [[ -n "${ALARMS_FAIL:-}" ]] && { echo "An error occurred (Throttling)" >&2; exit 254; }',
    '    n="$(cat "$S/alarm-calls" 2>/dev/null || echo 0)"; echo $((n + 1)) > "$S/alarm-calls"',
    '    IFS="~" read -r -a answers <<<"${ALARMS-}"',
    '    if (( ${#answers[@]} )); then printf "%b" "${answers[$n]:-${answers[-1]}}"; fi ;;',
    '  *) echo "stand-in aws: unhandled $*" >&2; exit 2 ;;',
    'esac',
  ]);
  exe(join(bin, 'terraform'), [
    `[[ "$*" == *"output -raw lightsail_instance_name"* ]] && { printf %s ${JSON.stringify(INSTANCE)}; exit 0; }`,
    'exit 1',
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
      CHECK_ENV_HEALTH_AWS_BIN: join(bin, 'aws'),
      CHECK_ENV_HEALTH_TERRAFORM_BIN: join(bin, 'terraform'),
      CHECK_ENV_HEALTH_POLL_SECS: '0',
      AWS_PROFILE: 'stub-profile',
      AWS_IDENTITY_BIN: join(bin, 'identity'),
      AWS_PROFILE_BIN: join(bin, 'identity'),
      ...extra,
    },
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
}

const point = (ts: string, avg: number) => `${ts}\\t${avg}\\n`;

describe('the burst capacity read', () => {
  // Defect caught: a heavy step started on a host whose burst allowance is
  // spent, so it runs at baseline CPU, times out and fails, as a fresh staging
  // instance's bootstrap did six times in one night.
  it('refuses a host below the minimum, naming the reading, and passes one at or above it', () => {
    const low = run(['--target', 'staging'], { BURST: point('2026-11-24T15:00:00Z', 19.4) });
    expect(low.status).toBe(1);
    expect(low.out).toMatch(/19\.4% of its CPU burst capacity, below the 50%/);

    // Lightsail reports many decimals; the reading is given to one.
    const long = run(['--target', 'staging'], { BURST: point('2026-11-24T15:00:00Z', 21.68718790509259) });
    expect(long.out).toMatch(/has 21\.7% of its CPU burst capacity/);

    const ok = run(['--target', 'staging'], { BURST: point('2026-11-24T15:00:00Z', 50) });
    expect(ok.status, ok.out).toBe(0);
    expect(ok.out).toMatch(/burst capacity 50%, at least 50%/);
  });

  it('judges the latest reading, whatever order Lightsail lists them in', () => {
    // Defect caught: a host that just spent its allowance passing on an older,
    // fuller reading. Lightsail does not promise an order.
    const burst = point('2026-11-24T15:05:00Z', 3) + point('2026-11-24T14:55:00Z', 90) + point('2026-11-24T15:00:00Z', 80);
    const res = run(['--target', 'staging'], { BURST: burst });
    expect(res.status).toBe(1);
    expect(res.out).toMatch(/has 3% of its CPU burst capacity/);
  });

  it('honours --min-burst', () => {
    const res = run(['--target', 'staging', '--min-burst', '15'], { BURST: point('2026-11-24T15:00:00Z', 19.4) });
    expect(res.status, res.out).toBe(0);
  });

  it.each([
    ['no datapoints', { BURST: '' }, /reported no burst capacity in the last 30 minutes/],
    ['a read the API refuses', { BURST_FAIL: '1' }, /could not read the burst capacity of footbag-staging-web-r202611231837: An error occurred \(AccessDeniedException\)/],
  ])('refuses when the burst capacity cannot be known (%s)', (_label, env, said) => {
    // Defect caught: an unread allowance taken as a full one.
    const res = run(['--target', 'staging'], env);
    expect(res.status).not.toBe(0);
    expect(res.out).toMatch(said);
  });

  it('reads the instance Terraform names, not a fixed name', () => {
    run(['--target', 'staging'], { BURST: point('2026-11-24T15:00:00Z', 80) });
    expect(calls().find((c) => c.includes('get-instance-metric-data'))).toContain(`--instance-name ${INSTANCE}`);
  });

  it('skips the burst read with --alarms-only', () => {
    const res = run(['--target', 'staging', '--alarms-only']);
    expect(res.status, res.out).toBe(0);
    expect(calls().some((c) => c.includes('get-instance-metric-data'))).toBe(false);
  });
});

describe('the alarm read', () => {
  const healthyBurst = { BURST: point('2026-11-24T15:00:00Z', 80) };

  // Defect caught: a critical alarm firing through a long run with no script
  // reading it, as staging's high-CPU alarm did eleven times in one night.
  it('stops on a critical alarm in ALARM, naming it, and only warns on a warning one', () => {
    const critical = run(['--target', 'staging'], { ...healthyBurst, ALARMS: `footbag-staging-high-cpu\\t${CRITICAL}\\n` });
    expect(critical.status).toBe(1);
    expect(critical.out).toMatch(/critical alarm footbag-staging-high-cpu is in ALARM/);

    const warning = run(['--target', 'staging'], { ...healthyBurst, ALARMS: `footbag-staging-outbox-backlog\\t${WARNING}\\n` });
    expect(warning.status, warning.out).toBe(0);
    expect(warning.out).toMatch(/warning alarm footbag-staging-outbox-backlog is in ALARM/);
  });

  it('with --allow-site-down, warns on the alarms a down site raises and still stops on the host\'s own', () => {
    // Defect caught: a rebuild refused because of the very 5xx and container
    // alarms it exists to end; or, the other way, a rebuild started on a host
    // whose memory alarm is firing because those were all waved through.
    // The outside health check's alarm among them: on real staging it was in
    // ALARM beside the 5xx alarm while the site was down.
    const down = `footbag-staging-cloudfront-5xx\\t${CRITICAL}\\nfootbag-staging-site-unavailable\\t${CRITICAL}\\nfootbag-staging-container-unhealthy-web\\t${CRITICAL}\\n`;
    const ok = run(['--target', 'staging', '--allow-site-down'], { ...healthyBurst, ALARMS: down });
    expect(ok.status, ok.out).toBe(0);
    expect(ok.out).toMatch(/warning alarm footbag-staging-cloudfront-5xx is in ALARM/);

    const memory = run(['--target', 'staging', '--allow-site-down'], {
      ...healthyBurst, ALARMS: `${down}footbag-staging-high-memory\\t${CRITICAL}\\n`,
    });
    expect(memory.status).toBe(1);
    expect(memory.out).toMatch(/critical alarm footbag-staging-high-memory is in ALARM/);

    // Without the flag the same 5xx alarm stops the read.
    const strict = run(['--target', 'staging'], { ...healthyBurst, ALARMS: down });
    expect(strict.status).toBe(1);
  });

  it('does not take a topic whose name only starts like the critical one as critical', () => {
    // Defect caught: a substring match counting another topic as critical.
    const res = run(['--target', 'staging'], {
      ...healthyBurst,
      ALARMS: `footbag-staging-x\\tarn:aws:sns:us-east-1:111111111111:footbag-staging-alarms-critical-archive\\n`,
    });
    expect(res.status, res.out).toBe(0);
  });

  it('reads only the target\'s own alarms, in ALARM', () => {
    run(['--target', 'staging'], healthyBurst);
    const call = calls().find((c) => c.includes('describe-alarms'))!;
    expect(call).toContain('--state-value ALARM');
    expect(call).toContain('--alarm-name-prefix footbag-staging-');
  });

  it('waits with --wait-minutes for a critical alarm to return to OK, and passes once it has', () => {
    // Defect caught: a deploy's own expected 5xx alarm, still in ALARM a minute
    // after the stack came back, stopping a run that is healthy.
    // The second answer is an empty listing ("\n": read -a drops a trailing
    // empty field, so a bare "~" would repeat the first answer).
    const res = run(['--target', 'staging', '--alarms-only', '--wait-minutes', '5'], {
      ALARMS: `footbag-staging-cloudfront-5xx\\t${CRITICAL}\\n~\\n`,
    });
    expect(res.status, res.out).toBe(0);
    expect(res.out).toMatch(/waiting for footbag-staging-cloudfront-5xx to return to OK/);
  });

  it('stops without waiting when --wait-minutes is not given', () => {
    const res = run(['--target', 'staging', '--alarms-only'], { ALARMS: `footbag-staging-cloudfront-5xx\\t${CRITICAL}\\n~\\n` });
    expect(res.status).toBe(1);
    expect(res.out).not.toMatch(/waiting for/);
  });

  it('refuses when the alarms cannot be listed', () => {
    // Defect caught: an unread alarm list taken as a quiet one.
    const res = run(['--target', 'staging', '--alarms-only'], { ALARMS_FAIL: '1' });
    expect(res.status).not.toBe(0);
    expect(res.out).toMatch(/could not list the staging alarms in ALARM: An error occurred \(Throttling\)/);
  });
});

describe('refusals', () => {
  it.each([
    [[], /target/i],
    [['--target', 'dev'], /target/i],
    [['--target', 'staging', '--min-burst', '101'], /--min-burst must be a whole number from 0 to 100/],
    [['--target', 'staging', '--wait-minutes', 'soon'], /--wait-minutes must be a whole number/],
  ])('refuses %j before reading anything', (args, said) => {
    const res = run(args as string[]);
    expect(res.status).toBe(2);
    expect(res.out).toMatch(said);
    expect(calls()).toEqual([]);
  });

  it('says on stderr that a stand-in is in use', () => {
    const res = run(['--target', 'staging', '--alarms-only']);
    expect(res.out).toMatch(/SYNTHETIC: CHECK_ENV_HEALTH_AWS_BIN=/);
  });
});
