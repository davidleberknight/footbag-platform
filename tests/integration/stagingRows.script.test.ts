/**
 * The --staging rows and their preflight, driven.
 *
 * Contract: each staging row reads staging and nothing else, whatever the
 * operator's shell exports: a production smoke target, a production base URL or
 * a deployed address left over from other work never reaches it. The preflight
 * names every missing need at the start and blocks exactly the rows that need
 * it, so a missing role or an unreachable site is reported once, up front, and
 * the other rows still run. The rows need at minimum the dev-tester role, which
 * the footbag-operator IAM user also holds, so either identity runs them and
 * any other is refused. A bare run never reaches any of this: the preflight and
 * the rows are called only under --staging.
 *
 * The functions are extracted from run_all_tests.sh and run in a scratch
 * directory whose scripts and libraries, and the aws, curl and npm on PATH, are
 * stubs that record how they were called. Nothing here reaches AWS or a
 * deployed host.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const RUNNER = join(REPO_ROOT, 'run_all_tests.sh');
const RUNNER_TEXT = readFileSync(RUNNER, 'utf8');
const ROWS = ['staging-aws-smoke', 'staging-realdata-invariants', 'staging-route-smoke', 'staging-browser'];

const scratch = createScratchDir('staging-rows');
afterAll(() => removeScratch(scratch));
let seq = 0;

function extract(): string {
  const fn = (name: string) =>
    spawnSync('sed', ['-n', `/^${name}() {/,/^}/p`, RUNNER], { encoding: 'utf8', ...SPAWN_GUARD }).stdout;
  const line = (prefix: string) => RUNNER_TEXT.split('\n').find((l) => l.startsWith(prefix)) ?? '';
  return [
    line('STAGING_SMOKE_TARGET_ENV='), line('STAGING_ROUTE_SMOKE_ENV='), line('STAGING_BROWSER_TARGET='),
    line('declare -A STAGING_BLOCKERS='), line('STAGING_URL='),
    ...['realdata_probe_value', 'staging_block', 'staging_blocked', 'staging_preflight',
      'gate_staging_aws_smoke', 'gate_staging_route_smoke', 'gate_staging_browser'].map(fn),
  ].join('\n');
}

interface World {
  /** The identity the shell's AWS credentials resolve to; null means no aws on PATH. */
  arn?: string | null;
  /** Whether the shared profile helper settles and proves an identity. */
  identityResolves?: boolean;
  runtimeProfileAnswers?: boolean;
  terraformInitialised?: boolean;
  /** The address the staging host records it serves; empty means it answers none. */
  siteUrl?: string;
  siteAnswers?: boolean;
  probe?: string | null;
}

const DEV_TESTER_ARN = 'arn:aws:sts::000000000000:assumed-role/FootbagDevTester/tester';
const OPERATOR_ARN = 'arn:aws:iam::000000000000:user/footbag-operator';

const GOOD: Required<World> = {
  arn: DEV_TESTER_ARN,
  identityResolves: true,
  runtimeProfileAnswers: true,
  terraformInitialised: true,
  siteUrl: 'https://staging-site.example.invalid',
  siteAnswers: true,
  probe: 'RDI_MEMBERS=25000\nRDI_AUTHORITATIVE=24000\nRDI_CLAIMABLE=140',
};

function exe(path: string, lines: string[]): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${lines.join('\n')}\n`, { mode: 0o755 });
}

/** Runs `body` after the extracted functions, in a scratch world built from `w`. */
function drive(body: string, w: World = {}, env: Record<string, string> = {}) {
  const world = { ...GOOD, ...w };
  const work = join(scratch, `world-${++seq}`);
  const bin = join(work, 'bin');
  const log = join(work, 'calls.log');
  mkdirSync(bin, { recursive: true });

  if (world.arn !== null) {
    exe(join(bin, 'aws'), [
      '#!/usr/bin/env bash',
      `if [[ "$*" == *"--profile footbag-staging-runtime"* ]]; then exit ${world.runtimeProfileAnswers ? 0 : 255}; fi`,
      `echo ${JSON.stringify(world.arn)}`,
    ]);
  }
  // The shared helper that supplies a shell with no identity of its own its
  // profile, proves it, and leaves the proved ARN behind.
  exe(join(work, 'scripts', 'lib', 'aws-profile.sh'), [
    'aws_profile_ensure() {',
    `  echo "aws_profile_ensure" >> ${JSON.stringify(log)}`,
    world.identityResolves
      ? `  AWS_IDENTITY_ARN=${JSON.stringify(world.arn ?? '')}; export AWS_PROFILE=fixture-profile; return 0`
      : '  echo "ERROR: the profile did not authenticate against AWS." >&2; return 1',
    '}',
  ]);
  exe(join(bin, 'curl'), ['#!/usr/bin/env bash', `echo "curl $*" >> ${JSON.stringify(log)}`, `exit ${world.siteAnswers ? 0 : 7}`]);
  exe(join(bin, 'npm'), [
    '#!/usr/bin/env bash',
    `echo "npm $* SMOKE_TARGET_ENV=\${SMOKE_TARGET_ENV-unset}" >> ${JSON.stringify(log)}`,
  ]);
  if (world.terraformInitialised) mkdirSync(join(work, 'terraform', 'staging', '.terraform'), { recursive: true });
  exe(join(work, 'scripts', 'lib', 'host-env-remote.sh'), [
    world.siteUrl
      ? `host_address_for() { HOST_ADDRESS=${JSON.stringify(world.siteUrl)}; return 0; }`
      : 'host_address_for() { HOST_ADDRESS=""; return 1; }',
  ]);
  exe(join(work, 'scripts', 'realdata-staging.sh'), world.probe === null
    ? ['#!/usr/bin/env bash', 'exit 1']
    : ['#!/usr/bin/env bash', `printf '%s\\n' ${world.probe.split('\n').map((l) => JSON.stringify(l)).join(' ')}`]);
  exe(join(work, 'scripts', 'smoke-local.sh'), [
    '#!/usr/bin/env bash',
    `echo "smoke-local SMOKE_ENV=\${SMOKE_ENV-unset} BASE_URL=\${BASE_URL-unset}" >> ${JSON.stringify(log)}`,
  ]);
  exe(join(work, 'scripts', 'test-deployed.sh'), [
    '#!/usr/bin/env bash',
    `echo "test-deployed $* DEPLOYED_BASE_URL=\${DEPLOYED_BASE_URL-unset}" >> ${JSON.stringify(log)}`,
  ]);

  const driver = join(work, 'driver.sh');
  writeFileSync(driver, ['set -uo pipefail', extract(), body].join('\n'));
  const res = spawnSync('bash', [driver], {
    cwd: work,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:/usr/bin:/bin`, ...env },
    ...SPAWN_GUARD,
  });
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

/** The rows the preflight blocked, sorted, one per line after a marker. */
const BLOCKED = 'staging_preflight >/dev/null 2>&1; echo "BLOCKED:"; printf \'%s\\n\' "${!STAGING_BLOCKERS[@]}" | sort';
const blockedRows = (out: string) =>
  out.slice(out.indexOf('BLOCKED:') + 'BLOCKED:'.length).split('\n').map((s) => s.trim()).filter(Boolean);

describe('the staging rows, whatever the shell exports', () => {
  // Defect caught: a production target, base URL or deployed address left in the
  // operator's shell sends a staging row at production.
  it('point every row at staging and drop every inherited address', () => {
    const r = drive(
      'STAGING_URL=https://staging-site.example.invalid\ngate_staging_aws_smoke\ngate_staging_route_smoke\ngate_staging_browser',
      {},
      {
        SMOKE_TARGET_ENV: 'production', SMOKE_ENV: 'production',
        DEPLOYED_BASE_URL: 'https://production.example.invalid',
      },
    );
    expect(r.status, r.out).toBe(0);
    expect(r.calls).toMatch(/^npm run test:smoke -- --target staging SMOKE_TARGET_ENV=unset$/m);
    expect(r.calls).toMatch(/^smoke-local SMOKE_ENV=staging BASE_URL=https:\/\/staging-site\.example\.invalid$/m);
    expect(r.calls).toMatch(/^test-deployed --target staging DEPLOYED_BASE_URL=unset$/m);
    expect(r.calls).not.toContain('production');
  });

  // Defect caught: a row the preflight blocked runs anyway and fails with a raw
  // error mid-run, or a blocked row passes.
  it('fail a blocked row without running it', () => {
    const r = drive('staging_block "no role" staging-aws-smoke >/dev/null\ngate_staging_aws_smoke; echo "rc=$?"');
    expect(r.out).toContain('rc=1');
    expect(r.out).toContain('staging-aws-smoke did not run');
    expect(r.calls).not.toContain('npm');
  });
});

describe('the --staging preflight', () => {
  // Defect caught: a fully wired machine has a row blocked, or the staging site's
  // address is not handed to the rows that need it.
  it('blocks nothing when every need is present, and records the site', () => {
    const r = drive(`${BLOCKED}\necho "SITE=$STAGING_URL"`);
    expect(blockedRows(r.out.split('SITE=')[0]), r.out).toEqual([]);
    expect(r.out).toContain('SITE=https://staging-site.example.invalid');
  });

  // Defect caught: the operator, whose identity holds everything the dev-tester
  // role does, is refused the read-only staging checks or told to switch to the
  // dev-tester wrapper, which an operator never uses.
  it('runs every row for the footbag-operator IAM user, and never tells it to switch identity', () => {
    const r = drive(`${BLOCKED}\necho "PROFILE=\${AWS_PROFILE:-unset}"`, { arn: OPERATOR_ARN });
    expect(blockedRows(r.out.split('PROFILE=')[0]), r.out).toEqual([]);
    // The profile the helper settled stays in the runner's shell for the rows.
    expect(r.calls).toContain('aws_profile_ensure');
    expect(r.out).toContain('PROFILE=fixture-profile');
    // Every other need missing at once, so every hint is printed: none of them
    // sends the operator to the wrapper or to a dev-tester's credential file.
    const hints = drive('staging_preflight', {
      arn: OPERATOR_ARN, runtimeProfileAnswers: false, terraformInitialised: false, siteUrl: '', probe: null,
    }).out;
    expect(hints).toContain('blocks:');
    expect(hints).not.toContain('as-dev-tester.sh');
    expect(hints).not.toContain('DEV_TESTER_HOST.txt');
    expect(hints).not.toMatch(/as the dev-tester|requires the dev-tester role/);
  });

  // Defect caught: any identity at all, a dev-tester's own IAM user outside the
  // job role or a name that merely ends like the operator's, runs the staging
  // checks; or the refusal names only one of the two identities that may run them.
  it('refuses every other identity, naming both that may run the rows', () => {
    for (const arn of [
      'arn:aws:iam::000000000000:user/footbag-dev-testers/jane_doe',
      'arn:aws:iam::000000000000:user/not-footbag-operator',
      'arn:aws:sts::000000000000:assumed-role/footbag-staging-app-runtime/jane_doe',
    ]) {
      const r = drive('staging_preflight; echo "BLOCKED:"; printf \'%s\\n\' "${!STAGING_BLOCKERS[@]}" | sort', { arn });
      expect(blockedRows(r.out), arn).toEqual([...ROWS].sort());
      const refusal = r.out.split('\n').find((l) => l.includes(arn)) ?? '';
      expect(refusal, arn).toContain('footbag-operator');
      expect(refusal, arn).toContain('FootbagDevTester');
    }
  });

  // Defect caught: a shell whose AWS identity does not authenticate is judged
  // as though it were a wrong identity, sending the reader to switch identity
  // when the fix is a dead or missing credential.
  it('blocks every row when no AWS identity authenticates, saying so rather than naming a wrong identity', () => {
    // The helper's own error goes to stderr; only the preflight's report is read.
    const r = drive('staging_preflight 2>/dev/null; echo "BLOCKED:"; printf \'%s\\n\' "${!STAGING_BLOCKERS[@]}" | sort', { identityResolves: false });
    expect(blockedRows(r.out), r.out).toEqual([...ROWS].sort());
    expect(r.out).toContain('no AWS identity in this shell authenticates');
    expect(r.out).not.toContain('--staging runs as the IAM user footbag-operator');
  });

  // Each case: a missing need blocks exactly the rows that depend on it.
  it.each<[string, World, string[]]>([
    ['no AWS CLI', { arn: null }, ROWS],
    ['a staging runtime identity that does not answer', { runtimeProfileAnswers: false }, ['staging-aws-smoke']],
    ['an uninitialised staging terraform', { terraformInitialised: false }, ['staging-aws-smoke']],
    ['a site address the staging host cannot give', { siteUrl: '' }, ['staging-browser', 'staging-route-smoke']],
    ['a site that fails its readiness check', { siteAnswers: false }, ['staging-browser', 'staging-route-smoke']],
    ['an unreachable staging database', { probe: null }, ['staging-realdata-invariants']],
    ['an export-loaded staging database with too few members', { probe: 'RDI_MEMBERS=12\nRDI_AUTHORITATIVE=12\nRDI_CLAIMABLE=3' }, ['staging-realdata-invariants']],
    ['an export-loaded staging database with no claimable honoree', { probe: 'RDI_MEMBERS=25000\nRDI_AUTHORITATIVE=24000\nRDI_CLAIMABLE=0' }, ['staging-realdata-invariants']],
    // The row itself reports a database without the export as "prerequisite
    // not loaded"; blocking it here would turn every such staging run red.
    ['a staging database without the authoritative load', { probe: 'RDI_MEMBERS=2506\nRDI_AUTHORITATIVE=0\nRDI_CLAIMABLE=0' }, []],
  ])('%s blocks exactly the rows that need it', (_label, world, rows) => {
    const r = drive(BLOCKED, world);
    expect(blockedRows(r.out), r.out).toEqual([...rows].sort());
  });
});

describe('a run without --staging', () => {
  // Top-level code, so it cannot be extracted and driven. Defect caught: a bare
  // run reaches the staging preflight or the staging rows, contacting a deployed
  // host on a developer's everyday local run.
  it('calls the staging preflight and the staging rows only under --staging', () => {
    const lines = RUNNER_TEXT.split('\n');
    const calls = lines
      .map((l, i) => ({ l, i }))
      .filter(({ l }) => /\b(staging_preflight|staging_sequence)\b/.test(l))
      .filter(({ l }) => !/^\s*#/.test(l) && !/^(staging_preflight|staging_sequence)\(\) \{/.test(l));
    expect(calls.length).toBeGreaterThanOrEqual(3);
    for (const { l, i } of calls) {
      const guarded = /if \(\( STAGING == 1 \)\); then/.test(l) || /^\s*if \(\( STAGING == 1 \)\); then\s*$/.test(lines[i - 1]);
      expect(guarded, `line ${i + 1} is not under --staging: ${l.trim()}`).toBe(true);
    }
  });
});
