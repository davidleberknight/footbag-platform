/**
 * scripts/verify-cwagent-metrics.sh — the proof that gates arming the host alarms.
 *
 * The three host alarms bind to one exact namespace, metric name and dimension
 * set each, and they treat missing data as missing. An alarm bound to a
 * combination the host never publishes therefore sits in insufficient data
 * forever, and before the missing-data treatment was corrected it sat in OK and
 * reported health it had never measured. This script is what stands between an
 * operator and arming that.
 *
 * The property worth pinning hardest is the mem query carrying NO dimensions.
 * The agent emits mem_used_percent bare, and every document in the estate spent
 * a year claiming these metrics carried an instance dimension they have never
 * had. A query that quietly grew a dimension would pass against a healthy host
 * and certify an alarm that watches nothing, which is precisely the failure the
 * script exists to catch, so the assertion belongs here rather than in a
 * reviewer's memory.
 *
 * The aws CLI is stubbed through the script's own CWAGENT_VERIFY_AWS_BIN seam,
 * so every case here needs no AWS and no credentials.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/verify-cwagent-metrics.sh');

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-cwagentverify-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

/**
 * An aws stub that answers get-metric-statistics with a datapoint count chosen
 * per metric name, and records every invocation's arguments one line each so a
 * test can assert on the query that was actually made, not just its answer.
 */
function awsStub(counts: Record<string, string>): string {
  const path = join(stubDir, 'aws-stub.sh');
  const alarmCount = counts['describe-alarms'] ?? '0';
  const cases = Object.entries(counts)
    .filter(([key]) => key !== 'describe-alarms')
    .map(([metric, count]) => `    ${metric}) echo '${count}';;`)
    .join('\n');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(stubDir, 'calls.log')}"`,
      `if [ "$2" = "describe-alarms" ]; then echo '${alarmCount}'; exit 0; fi`,
      'metric=""',
      'prev=""',
      'for arg in "$@"; do',
      '  if [ "$prev" = "--metric-name" ]; then metric="$arg"; fi',
      '  prev="$arg"',
      'done',
      'case "$metric" in',
      cases,
      '    *) echo "0";;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

function run(args: string[], counts?: Record<string, string>) {
  const env: NodeJS.ProcessEnv = { ...process.env };
  if (counts !== undefined) env.CWAGENT_VERIFY_AWS_BIN = awsStub(counts);
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env,
    ...SPAWN_GUARD,
  });
  return {
    status: result.status,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

function calls(): string[] {
  const log = join(stubDir, 'calls.log');
  if (!existsSync(log)) return [];
  return readFileSync(log, 'utf-8').trim().split('\n');
}

const ALL_PUBLISHING = {
  cpu_usage_active: '15',
  mem_used_percent: '15',
  disk_used_percent: '15',
};

describe('verify-cwagent-metrics.sh argument guards', () => {
  it('refuses to run without a target, because which environment a proof speaks for is not guessable', () => {
    const r = run([]);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('--target is required');
  });

  it('refuses an unknown environment rather than checking a namespace nothing publishes to', () => {
    const r = run(['--target', 'stagng']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("must be 'staging' or 'production'");
  });

  it('refuses a window that is not a positive whole number', () => {
    expect(run(['--target', 'staging', '--window-minutes', 'ten']).status).toBe(2);
    expect(run(['--target', 'staging', '--window-minutes', '0']).status).toBe(2);
  });

  it('refuses an unknown flag instead of silently ignoring it', () => {
    const r = run(['--target', 'staging', '--namespace', 'CWAgent']);
    expect(r.status).toBe(2);
    expect(r.stderr).toContain('unknown argument');
  });
});

describe('verify-cwagent-metrics.sh queries', () => {
  it('asks for mem_used_percent with no dimensions at all, which is what the agent emits and the alarm binds to', () => {
    run(['--target', 'staging'], ALL_PUBLISHING);
    const mem = calls().find((c) => c.includes('mem_used_percent'));
    expect(mem).toBeDefined();
    expect(mem).not.toContain('--dimensions');
  });

  it('scopes cpu and disk by exactly the dimensions their alarms pin', () => {
    run(['--target', 'staging'], ALL_PUBLISHING);
    const cpu = calls().find((c) => c.includes('cpu_usage_active'));
    const disk = calls().find((c) => c.includes('disk_used_percent'));
    expect(cpu).toContain('--dimensions Name=cpu,Value=cpu-total');
    expect(disk).toContain('Name=path,Value=/');
    expect(disk).toContain('Name=fstype,Value=xfs');
  });

  it('reads each environment in its own namespace, since no metric carries a host dimension', () => {
    const metricQueries = () => calls().filter((c) => c.includes('get-metric-statistics'));

    run(['--target', 'staging'], ALL_PUBLISHING);
    expect(metricQueries()).toHaveLength(3);
    expect(metricQueries().every((c) => c.includes('--namespace CWAgent '))).toBe(true);

    rmSync(join(stubDir, 'calls.log'), { force: true });
    run(['--target', 'production'], ALL_PUBLISHING);
    expect(metricQueries()).toHaveLength(3);
    expect(metricQueries().every((c) => c.includes('--namespace CWAgent/production'))).toBe(true);
  });

  it('pins the region, because these metrics are region-scoped and an operator default elsewhere would fail a healthy host', () => {
    run(['--target', 'staging'], ALL_PUBLISHING);
    expect(calls().every((c) => c.includes('--region us-east-1'))).toBe(true);
  });

  it('says on stderr when it ran against a stub, so a synthetic run is never mistaken for a proof', () => {
    const r = run(['--target', 'staging'], ALL_PUBLISHING);
    expect(r.stderr).toContain('SYNTHETIC');
  });
});

describe('verify-cwagent-metrics.sh verdicts', () => {
  it('passes and names the arming command when the metrics publish but no alarms exist yet', () => {
    const r = run(['--target', 'staging'], ALL_PUBLISHING);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('scripts/arm-cwagent-alarms.sh --target staging');
  });

  it('stops telling an already-armed environment to arm itself', () => {
    const r = run(['--target', 'staging'], { ...ALL_PUBLISHING, 'describe-alarms': '3' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('the three alarms exist and');
    expect(r.stdout).not.toContain('arm-cwagent-alarms.sh');
  });

  it('reads total silence as an agent that is not publishing, which is a different fix from a wrong dimension', () => {
    const r = run(['--target', 'production'], {});
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('not publishing at all');
    expect(r.stderr).toContain('CWAgent/production');
  });

  it('reads a partial answer as a dimension mismatch and names the combination that produced nothing', () => {
    const r = run(['--target', 'staging'], {
      cpu_usage_active: '15',
      mem_used_percent: '15',
      disk_used_percent: '0',
    });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('dimension mismatch');
    expect(r.stderr).toContain('disk_used_percent');
    expect(r.stderr).not.toContain('cpu_usage_active');
  });

  it('refuses to bless the run when anything is missing', () => {
    const r = run(['--target', 'staging'], { cpu_usage_active: '15' });
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('Do not arm the alarms until this passes.');
    expect(r.stdout).not.toContain('enable_cwagent_alarms = true');
  });
});
