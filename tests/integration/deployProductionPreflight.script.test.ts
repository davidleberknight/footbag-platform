/**
 * A production deploy's preflight reaches production and nothing else, holds the
 * host to main's pins, and reminds the operator that staging comes first.
 *
 * Contract: between the release gate and the first shipping step, each deploy
 * leaf that can ship to production talks only to the production host it was
 * pointed at. Staging is not a prerequisite of a production release, so a
 * production deploy never asks the staging host for its address, never probes
 * the staging site, and never refuses because staging is unreachable or failing.
 * What it does instead is print the fixed staging-first reminder before it first
 * reaches the host. The code deploy holds the host's tools to the version list at
 * the tip of main on production, so a rollback to an earlier commit meets a host
 * stepped since, and to the working tree's list on staging, where a pin change
 * is tried first; the code deploy and the rebuild deploy choose the same way. The production post-deploy checks are later in each leaf and
 * are not this suite's subject.
 *
 * That stretch of each leaf is lifted from the file by its own first and last
 * lines, so the code driven is the shipped code, and run in a scratch world: a
 * throwaway repository whose main and working tree carry different version
 * lists, the shipped release-gate library with only its CI and git rules
 * stubbed, the shipped version-list reader, and ssh, docker and the other
 * libraries as stubs that record every call. The host comparison each leaf
 * ships is then run against stand-in host tools with the pins the stretch
 * chose. Nothing reaches a host or AWS.
 */
import { describe, it, expect, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REPO_ROOT = process.cwd();
const GATE_LIB = join(REPO_ROOT, 'scripts/lib/production-release-gate.sh');
const HOST_CHECK = join(REPO_ROOT, 'scripts/internal/host-tool-versions-remote.sh');
const scratch = createScratchDir('deploy-production-preflight');
afterAll(() => removeScratch(scratch));
let seq = 0;

/** The reminder the release-gate library exports, read from the shipped library. */
const REMINDER = (() => {
  const res = spawnSync('bash', ['-c', `source "${GATE_LIB}"; printf '%s' "$PRODUCTION_STAGING_FIRST_REMINDER"`], {
    encoding: 'utf8', ...SPAWN_GUARD,
  });
  return res.stdout;
})();

/** Two version lists: the tip of main's, and an earlier commit's in the working tree. */
type Pins = { sqlite: string; docker: string; compose: string; release: string };
const MAIN_PINS: Pins = { sqlite: '3.51.2', docker: '25.0.16-1.amzn2023.0.5', compose: 'v5.1.0', release: '2023.12.20261021' };
const TREE_PINS: Pins = { sqlite: '3.50.4', docker: '25.0.14-1.amzn2023.0.1', compose: 'v2.39.1', release: '2023.11.20260901' };

function versionList(p: Pins, omit: string[] = []): string {
  return [
    `SQLITE_VERSION=${p.sqlite}`,
    `DOCKER_ENGINE_HOST=${p.docker}`,
    `COMPOSE_VERSION=${p.compose}`,
    `AMAZON_LINUX_RELEASE=${p.release}`,
  ].filter((l) => !omit.some((k) => l.startsWith(`${k}=`))).join('\n') + '\n';
}

/**
 * Each leaf's preflight: from the release gate's production block up to the line
 * where it starts shipping.
 */
const LEAVES: Array<{ leaf: string; last: string }> = [
  { leaf: 'scripts/deploy-code.sh', last: '# ── Step 1' },
  { leaf: 'scripts/deploy-rebuild.sh', last: 'if [[ "$SKIP_DB_REBUILD" != "yes" ]]; then' },
];

function preflightOf(leaf: string, last: string): string {
  const lines = readFileSync(join(REPO_ROOT, leaf), 'utf8').split('\n');
  const gate = lines.indexOf('  production_release_gate_deploy "$REPO_ROOT" || exit 1');
  expect(gate, `${leaf} calls the release gate`).toBeGreaterThan(-1);
  const start = lines.lastIndexOf('if [[ "$REMOTE" == "footbag-production" ]]; then', gate);
  expect(start, `${leaf} opens the gate's production block`).toBeGreaterThan(-1);
  const end = lines.findIndex((l, i) => i > start && l.startsWith(last));
  expect(end, `${leaf} reaches its first shipping step`).toBeGreaterThan(start);
  return lines.slice(start, end).join('\n');
}

function exe(path: string, body: string[]): void {
  writeFileSync(path, ['#!/usr/bin/env bash', ...body].join('\n') + '\n', { mode: 0o755 });
}

function git(cwd: string, args: string[]): void {
  const res = spawnSync('git', ['-c', 'user.email=preflight@example.com', '-c', 'user.name=Preflight', ...args], {
    cwd, encoding: 'utf8', ...SPAWN_GUARD,
  });
  if (res.status !== 0) throw new Error(`git ${args.join(' ')} failed: ${res.stderr}`);
}

/** Stand-in host tools answering at the given versions, as the host check's seams. */
function hostAt(dir: string, p: Pins): Record<string, string> {
  mkdirSync(dir, { recursive: true });
  exe(join(dir, 'sqlite3'), [`echo "${p.sqlite} 2026-01-09 00:00:00 abc"`]);
  exe(join(dir, 'rpm'), [`printf '%s' "${p.docker}"`]);
  exe(join(dir, 'docker'), ['[[ "$*" == "compose version --short" ]] || exit 1', `echo "${p.compose.replace(/^v/, '')}"`]);
  writeFileSync(join(dir, 'release'), `Amazon Linux release ${p.release} (Amazon Linux)\n`);
  return {
    HOST_SQLITE3_BIN: join(dir, 'sqlite3'), HOST_RPM_BIN: join(dir, 'rpm'),
    HOST_DOCKER_BIN: join(dir, 'docker'), AL_RELEASE_FILE: join(dir, 'release'),
  };
}

interface Drive {
  leaf: string;
  last: string;
  remote: 'footbag-production' | 'footbag-staging';
  /** The versions the stand-in host answers with, for the code deploy's host check. */
  host?: Pins;
  /** Keys left out of main's version list. */
  mainOmits?: string[];
  /** Lines appended to main's version list, and to the working tree's. */
  mainExtra?: string;
  treeExtra?: string;
}

/** Runs one leaf's preflight in a world of recording stubs, then the host check on the pins it chose. */
function drivePreflight({ leaf, last, remote, host, mainOmits = [], mainExtra = '', treeExtra = '' }: Drive) {
  const world = join(scratch, `world-${++seq}`);
  const bin = join(world, 'bin');
  const lib = join(world, 'scripts', 'lib');
  const log = join(world, 'calls.log');
  mkdirSync(bin, { recursive: true });
  mkdirSync(lib, { recursive: true });
  mkdirSync(join(world, 'ops'));
  // Every call that reaches the host is recorded, and also marked in the run's
  // output, so the reminder can be placed before the first of them.
  const record = (what: string) => `echo ${what} >> ${JSON.stringify(log)}; echo HOST-TOUCH`;

  // main carries the newer list, the checked-out commit an older one: the shape
  // of a rollback to a commit from before the last host step.
  writeFileSync(join(world, 'ops', 'tool-versions.env'), versionList(MAIN_PINS, mainOmits) + mainExtra);
  git(world, ['init', '-q', '-b', 'main']);
  git(world, ['add', 'ops']);
  git(world, ['commit', '-q', '-m', 'main']);
  git(world, ['update-ref', 'refs/remotes/origin/main', 'HEAD']);
  writeFileSync(join(world, 'ops', 'tool-versions.env'), versionList(TREE_PINS) + treeExtra);
  git(world, ['commit', '-q', '-am', 'the commit being deployed']);

  exe(join(bin, 'ssh'), [
    // ssh -G answers the alias's host; every connection records the alias it named.
    'if [[ "$1" == -G ]]; then echo "hostname 192.0.2.10"; exit 0; fi',
    'for a in "$@"; do case "$a" in footbag-*) alias="$a" ;; esac; done',
    record('"ssh ${alias:-none}"') + ' >&2',
    'echo /home/footbag',
  ]);
  exe(join(bin, 'docker'), ['exit 0']);
  writeFileSync(join(lib, 'host-env-remote.sh'), [
    `require_host_is() { ${record('"require_host_is $1 $2"')}; return 0; }`,
    `host_address_for() { ${record('"host_address_for $1"')}; HOST_ADDRESS="https://$1.example.invalid"; return 0; }`,
  ].join('\n') + '\n');
  writeFileSync(join(lib, 'infra-sync.sh'), 'infra_sync_require() { return 0; }\n');
  for (const stub of ['image-transfer.sh', 'ssh-known-hosts.sh', 'initial-admins.sh', 'terraform-output.sh', 'operator-credential.sh']) {
    writeFileSync(join(lib, stub), '');
  }
  writeFileSync(join(lib, 'tool-versions.sh'), readFileSync(join(REPO_ROOT, 'scripts/lib/tool-versions.sh'), 'utf8'));
  // The shipped library, with the clean-tree, main and CI rules answered "pass":
  // their own suite drives them. Its reminder and its read of main's pins run as
  // shipped.
  writeFileSync(join(lib, 'production-release-gate.sh'),
    `${readFileSync(GATE_LIB, 'utf8')}\nproduction_release_gate_deploy() { echo "gate $1" >> ${JSON.stringify(log)}; return 0; }\n`);
  for (const smoke of ['smoke-local.sh', 'smoke-security.sh']) {
    exe(join(world, 'scripts', smoke), [record(`"${smoke} SMOKE_ENV=\${SMOKE_ENV-unset} BASE_URL=\${BASE_URL-unset}"`)]);
  }
  for (const half of ['remote-half.sh', 'prune.sh', 'cutover-guard.sh', 'live-guard.sh']) {
    writeFileSync(join(world, half), '');
  }

  const driver = join(world, 'driver.sh');
  writeFileSync(driver, [
    'set -euo pipefail',
    // One stream, in order, so what is printed can be placed against the host calls.
    'exec 2>&1',
    `REPO_ROOT=${JSON.stringify(world)}; SCRIPT_DIR="$REPO_ROOT/scripts"`,
    `REMOTE=${remote}; SUDO_PASS=fixture-password; SKIP_SMOKE=no`,
    'KEEP_MEDIA=yes; FOOTBAG_PROD_DB_REPLACE_ACK=1',
    `REMOTE_HALF=${JSON.stringify(join(world, 'remote-half.sh'))}; PRUNE_LIB=${JSON.stringify(join(world, 'prune.sh'))}`,
    `CUTOVER_GUARD=${JSON.stringify(join(world, 'cutover-guard.sh'))}; PROD_LIVE_GUARD=${JSON.stringify(join(world, 'live-guard.sh'))}`,
    `HOST_TOOL_VERSIONS_LIB=${JSON.stringify(HOST_CHECK)}`,
    // What the leaf sourced before its preflight, standing in for the libraries.
    'source "$REPO_ROOT/scripts/lib/tool-versions.sh"',
    'require_pinned_known_hosts() { FOOTBAG_SSH_PIN_OPTS=(); return 0; }',
    'operator_credential_select() { return 0; }',
    'aws_profile_ensure() { return 0; }',
    'dev_tester_identity_agreement_require() { return 0; }',
    preflightOf(leaf, last),
    'echo REACHED-FIRST-SHIPPING-STEP',
    ...(host ? [
      // The pins the stretch chose, sent as the code deploy sends them.
      `source ${JSON.stringify(HOST_CHECK)}`,
      'EXPECTED_SQLITE_VERSION="$PIN_SQLITE_VERSION" EXPECTED_DOCKER_ENGINE="$PIN_DOCKER_ENGINE" \\',
      '  EXPECTED_COMPOSE_VERSION="$PIN_COMPOSE_VERSION" EXPECTED_AMAZON_LINUX_RELEASE="$PIN_AMAZON_LINUX_RELEASE" \\',
      '  host_tool_versions_match && echo HOST-CHECK-PASSED || echo HOST-CHECK-REFUSED',
    ] : []),
  ].join('\n') + '\n');

  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, ...(host ? hostAt(join(world, 'host'), host) : {}) };
  delete env.FOOTBAG_TOOL_VERSIONS;
  const res = spawnSync('bash', [driver], { cwd: world, encoding: 'utf8', env, ...SPAWN_GUARD });
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    calls: existsSync(log) ? readFileSync(log, 'utf8') : '',
  };
}

const CODE = LEAVES[0];

describe('a production deploy reaches no staging host before it ships', () => {
  // Defect caught: a production deploy asks the staging host for its address,
  // probes the staging site, and refuses to ship production because staging is
  // down or failing, although staging has no bearing on a production release.
  it.each(LEAVES)('$leaf contacts only the production host in its preflight', ({ leaf, last }) => {
    const r = drivePreflight({ leaf, last, remote: 'footbag-production' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('REACHED-FIRST-SHIPPING-STEP');
    // The preflight ran against production, so a silence below is not a run that
    // stopped early.
    expect(r.calls).toContain('gate ');
    expect(r.calls).toContain('require_host_is footbag-production production');
    expect(r.calls).toContain('ssh footbag-production');
    expect(r.calls, r.calls).not.toContain('staging');
    expect(r.calls).not.toContain('host_address_for');
    expect(r.calls).not.toMatch(/^smoke-/m);
  });
});

describe('the staging-first reminder', () => {
  // Defect caught: an operator ships a commit or a host version to production
  // that was never tried on staging, because nothing on the production path
  // says staging comes first, or says it only after the host has been reached.
  it.each(LEAVES)('$leaf prints it on production before it first reaches the host', ({ leaf, last }) => {
    expect(REMINDER, 'the library exports the reminder').not.toBe('');
    const r = drivePreflight({ leaf, last, remote: 'footbag-production' });
    expect(r.status, r.out).toBe(0);
    const at = r.out.indexOf(REMINDER);
    expect(at, r.out).toBeGreaterThan(-1);
    expect(at, 'the reminder comes after the host was reached').toBeLessThan(r.out.indexOf('HOST-TOUCH'));
  });

  // Defect caught: staging deploys carry production's reminder, so operators
  // learn to read past it. The run reaching its shipping step shows the
  // silence is not a run that stopped early.
  it.each(LEAVES)('$leaf does not print it on staging', ({ leaf, last }) => {
    const r = drivePreflight({ leaf, last, remote: 'footbag-staging' });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('REACHED-FIRST-SHIPPING-STEP');
    expect(r.calls).toContain('require_host_is footbag-staging staging');
    expect(r.out).not.toContain(REMINDER);
  });

  // Defect caught: the entry point and the migration deploy ask for the typed
  // APPLY without the reminder, or show it only on staging, or after the word is
  // typed. Both read the answer from the terminal, which a test cannot attach,
  // so the placement is read from the shipped file: a live call on the line
  // directly above the prompt. The entry point's prompt is asked only on its
  // production branch; the migration deploy's prompt serves both targets, so its
  // call carries the production condition itself.
  it.each([
    { file: 'deploy_to_aws.sh', prompt: `printf "  Type 'APPLY' to confirm: " >&2`, call: /^\s*production_staging_first_reminder$/ },
    { file: 'scripts/deploy-migrate.sh', prompt: "printf 'Type APPLY to continue: ' > /dev/tty", call: /^\s*\[\[ "\$DEPLOY_TARGET" == "footbag-production" \]\] && production_staging_first_reminder$/ },
  ])('$file shows it on production directly above the typed APPLY', ({ file, prompt, call }) => {
    const lines = readFileSync(join(REPO_ROOT, file), 'utf8').split('\n');
    const promptAt = lines.findIndex((l) => l.trim() === prompt);
    expect(promptAt, `${file} prompts for APPLY`).toBeGreaterThan(-1);
    expect(lines[promptAt - 1], `${file}: the line above the prompt`).toMatch(call);
  });
});

describe('which version list the host is held to', () => {
  // Defect caught: a rollback to an earlier commit is refused against a host
  // that is exactly where main says it should be, because the deploy held the
  // host to the old commit's pins.
  it.each(LEAVES)('$leaf on production passes a host at main\'s pins although the commit pins others', ({ leaf, last }) => {
    const r = drivePreflight({ leaf, last, remote: 'footbag-production', host: MAIN_PINS });
    expect(r.status, r.out).toBe(0);
    expect(r.out).toContain('HOST-CHECK-PASSED');
  });

  // Defect caught: a production host that has drifted from main, or was never
  // stepped to it, takes the deploy because it matches the deployed commit.
  it.each(LEAVES)('$leaf on production refuses a host at the commit\'s pins rather than main\'s', ({ leaf, last }) => {
    const r = drivePreflight({ leaf, last, remote: 'footbag-production', host: TREE_PINS });
    expect(r.out).toContain('HOST-CHECK-REFUSED');
    expect(r.out).toContain(`the version list pins ${MAIN_PINS.compose}`);
  });

  // Defect caught: staging is held to main, so a pin change cannot be tried on
  // staging before it reaches main.
  it.each(LEAVES)('$leaf on staging holds the host to the working tree\'s pins', ({ leaf, last }) => {
    expect(drivePreflight({ leaf, last, remote: 'footbag-staging', host: TREE_PINS }).out).toContain('HOST-CHECK-PASSED');
    expect(drivePreflight({ leaf, last, remote: 'footbag-staging', host: MAIN_PINS }).out).toContain('HOST-CHECK-REFUSED');
  });

  // Defect caught: a main whose list lacks a pin lets the deploy fall back to
  // the commit's copy, or send an empty pin, rather than stop before shipping.
  it.each(LEAVES)('$leaf on production stops before shipping when main\'s list lacks a pin', ({ leaf, last }) => {
    const r = drivePreflight({ leaf, last, remote: 'footbag-production', host: TREE_PINS, mainOmits: ['COMPOSE_VERSION'] });
    expect(r.status, r.out).toBe(1);
    // Stopped by the pin reader's refusal, not by bash meeting the unset value
    // later, which a leaf without nounset would never do.
    expect(r.out).toContain('the tip of main has no real value for COMPOSE_VERSION');
    expect(r.out).not.toContain('unbound variable');
    expect(r.out).not.toContain('REACHED-FIRST-SHIPPING-STEP');
    expect(r.out).not.toContain('HOST-TOUCH');
  });

  // Defect caught: a pin still holding the placeholder a new entry ships with
  // reaches the host check as if it were a version, on either path.
  it.each(LEAVES)('$leaf stops before shipping on a placeholder pin, in main\'s list on production and the tree\'s on staging', ({ leaf, last }) => {
    const placeholder = 'SQLITE_VERSION=REPLACE_WITH_THE_RELEASE\n';
    for (const [remote, extra] of [
      ['footbag-production', { mainExtra: placeholder }],
      ['footbag-staging', { treeExtra: placeholder }],
    ] as const) {
      const r = drivePreflight({ leaf, last, remote, ...extra });
      expect(r.status, `${remote}: ${r.out}`).toBe(1);
      expect(r.out, remote).toContain('SQLITE_VERSION');
      expect(r.out, remote).not.toContain('REACHED-FIRST-SHIPPING-STEP');
      expect(r.out, remote).not.toContain('HOST-TOUCH');
    }
  });

  // Defect caught: a pin corrected on main by a later line is read from the
  // earlier one, so the host is held to the stale version. The list's reader
  // takes the last line for a key, and main's reader must agree with it.
  it('on production, takes the last line for a key in main\'s list', () => {
    const r = drivePreflight({
      ...CODE, remote: 'footbag-production', host: { ...MAIN_PINS, sqlite: '3.52.0' }, mainExtra: 'SQLITE_VERSION=3.52.0\n',
    });
    expect(r.out, r.out).toContain('HOST-CHECK-PASSED');
  });
});
