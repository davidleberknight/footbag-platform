/**
 * A production deploy's preflight reaches production and nothing else.
 *
 * Contract: between pinning the host keys and the first shipping step, each
 * deploy leaf that can ship to production talks only to the production host it
 * was pointed at. Staging is not a prerequisite of a production release, so a
 * production deploy never asks the staging host for its address, never probes
 * the staging site, and never refuses because staging is unreachable or failing.
 * The production post-deploy checks are later in each leaf and are not this
 * suite's subject.
 *
 * That stretch of each leaf is lifted from the file by its own first and last
 * lines, so the code driven is the shipped code, and run in a scratch world: the
 * libraries it sources, the smoke scripts it could call, and the ssh and docker
 * on PATH are stubs that record every call. Nothing reaches a host or AWS.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const scratch = createScratchDir('deploy-production-preflight');
afterAll(() => removeScratch(scratch));
let seq = 0;

/**
 * Each leaf's preflight: from pinning the host keys, the first thing in the leaf
 * that reaches a host, up to the line where it starts shipping.
 */
const LEAVES: Array<{ leaf: string; first: string; last: string }> = [
  { leaf: 'scripts/deploy-code.sh', first: 'require_pinned_known_hosts || exit 1', last: '# ── Step 1' },
  { leaf: 'scripts/deploy-rebuild.sh', first: 'require_pinned_known_hosts || exit 1', last: 'if [[ "$SKIP_DB_REBUILD" != "yes" ]]; then' },
];

function preflightOf(leaf: string, first: string, last: string): string {
  const lines = readFileSync(join(REPO_ROOT, leaf), 'utf8').split('\n');
  const start = lines.indexOf(first);
  expect(start, `${leaf} pins the host keys`).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l.startsWith(last));
  expect(end, `${leaf} reaches its first shipping step`).toBeGreaterThan(start);
  return lines.slice(start, end).join('\n');
}

function exe(path: string, body: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n') + '\n', { mode: 0o755 });
}

/** Runs one leaf's preflight against production in a world of recording stubs. */
function drivePreflight(leaf: string, first: string, last: string) {
  const world = join(scratch, `world-${++seq}`);
  const bin = join(world, 'bin');
  const lib = join(world, 'scripts', 'lib');
  const log = join(world, 'calls.log');
  mkdirSync(bin, { recursive: true });
  mkdirSync(lib, { recursive: true });
  const record = (what: string) => `echo ${what} >> ${JSON.stringify(log)}`;

  exe(join(bin, 'ssh'), [
    // ssh -G answers the alias's host; every connection records the alias it named.
    'if [[ "$1" == -G ]]; then echo "hostname 192.0.2.10"; exit 0; fi',
    'for a in "$@"; do case "$a" in footbag-*) alias="$a" ;; esac; done',
    record('"ssh ${alias:-none}"'),
    'echo /home/footbag',
  ]);
  exe(join(bin, 'docker'), ['exit 0']);
  writeFileSync(join(lib, 'host-env-remote.sh'), [
    `require_host_is() { ${record('"require_host_is $1 $2"')}; return 0; }`,
    `host_address_for() { ${record('"host_address_for $1"')}; HOST_ADDRESS="https://$1.example.invalid"; return 0; }`,
  ].join('\n') + '\n');
  writeFileSync(join(lib, 'infra-sync.sh'), 'infra_sync_require() { return 0; }\n');
  for (const smoke of ['smoke-local.sh', 'smoke-security.sh']) {
    exe(join(world, 'scripts', smoke), [record(`"${smoke} SMOKE_ENV=\${SMOKE_ENV-unset} BASE_URL=\${BASE_URL-unset}"`)]);
  }
  for (const half of ['remote-half.sh', 'prune.sh', 'cutover-guard.sh', 'live-guard.sh']) {
    writeFileSync(join(world, half), '');
  }

  const driver = join(world, 'driver.sh');
  writeFileSync(driver, [
    'set -euo pipefail',
    `REPO_ROOT=${JSON.stringify(world)}; SCRIPT_DIR="$REPO_ROOT/scripts"`,
    'REMOTE=footbag-production; SUDO_PASS=fixture-password; SKIP_SMOKE=no',
    'KEEP_MEDIA=yes; FOOTBAG_PROD_DB_REPLACE_ACK=1',
    `REMOTE_HALF=${JSON.stringify(join(world, 'remote-half.sh'))}; PRUNE_LIB=${JSON.stringify(join(world, 'prune.sh'))}`,
    `CUTOVER_GUARD=${JSON.stringify(join(world, 'cutover-guard.sh'))}; PROD_LIVE_GUARD=${JSON.stringify(join(world, 'live-guard.sh'))}`,
    // What the leaf sourced before its preflight, standing in for the libraries.
    'require_pinned_known_hosts() { FOOTBAG_SSH_PIN_OPTS=(); return 0; }',
    'operator_credential_select() { return 0; }',
    'aws_profile_ensure() { return 0; }',
    'dev_tester_identity_agreement_require() { return 0; }',
    preflightOf(leaf, first, last),
    'echo REACHED-FIRST-SHIPPING-STEP',
  ].join('\n') + '\n');

  const res = spawnSync('bash', [driver], {
    cwd: world,
    encoding: 'utf8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    ...SPAWN_GUARD,
  });
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

describe('a production deploy reaches no staging host before it ships', () => {
  // Defect caught: a production deploy asks the staging host for its address,
  // probes the staging site, and refuses to ship production because staging is
  // down or failing, although staging has no bearing on a production release.
  it.each(LEAVES)('$leaf contacts only the production host in its preflight', ({ leaf, first, last }) => {
    const r = drivePreflight(leaf, first, last);
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('REACHED-FIRST-SHIPPING-STEP');
    // The preflight ran against production, so a silence below is not a run that
    // stopped early.
    expect(r.calls).toContain('require_host_is footbag-production production');
    expect(r.calls).toContain('ssh footbag-production');
    expect(r.calls, r.calls).not.toContain('staging');
    expect(r.calls).not.toContain('host_address_for');
    expect(r.calls).not.toMatch(/^smoke-/m);
  });
});
