/**
 * scripts/activate-notification-feeds.sh -- bringing the bounce, complaint and
 * alarm queues up on one environment.
 *
 * A real run applies Terraform, writes a deployed host and deploys to it, none
 * of which CI can exercise. What is pinned here is everything that decides
 * whether the run is safe before any of that happens: the argument refusals, the
 * order the plan states, the refusal to write a values file git can pick up, the
 * surgical rewrite of a single flag, and the appending of that flag to an
 * environment that has never carried it.
 *
 * The last of those is the one worth stating plainly. This flag is new to an
 * environment the first time the feeds are brought up on it, so a script that
 * errored on a missing line would send the operator back to hand-editing the
 * values file, which is the manual step it exists to remove.
 *
 * Synthetic mode rewrites a local file and stops before Terraform, the host
 * write and the deploy.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/activate-notification-feeds.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[], input = ''): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    input,
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

let tmpDir: string;
let fileCounter = 0;

beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-feeds-'));
});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

function writeTfvars(lines: string[]): string {
  fileCounter += 1;
  const p = join(tmpDir, `vars-${fileCounter}.tfvars`);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

const OFF_TFVARS = [
  'environment        = "staging"',
  'operator_cidrs     = ["203.0.113.7/32"]',
  'enable_feed_queues = false',
];

/** A values file from an environment that has never carried the flag. */
const ABSENT_TFVARS = [
  'environment    = "staging"',
  'operator_cidrs = ["203.0.113.7/32"]',
];

function dryRun(args: string[], tfvarsLines: string[] = OFF_TFVARS): RunResult {
  return run([...args, '--tfvars', writeTfvars(tfvarsLines), '--dry-run']);
}

describe('activate-notification-feeds.sh — argument validation', () => {
  it('names no default environment, because which one is exactly the decision to make', () => {
    const res = run(['--status']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--target is required/);
  });

  it('rejects an environment that is neither staging nor production', () => {
    const res = run(['--target', 'dev', '--status']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('requires either a status read or a state to move to', () => {
    const res = run(['--target', 'staging']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/one of --status or --state/);
  });

  it('rejects a state that is neither on nor off', () => {
    const res = run(['--target', 'staging', '--state', 'maybe']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--state takes 'on' or 'off'/);
  });

  it('rejects a resume point outside the step range', () => {
    const res = run(['--target', 'staging', '--state', 'on', '--from-step', '9']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--from-step takes a step number from 1 to 5/);
  });

  it('rejects an unknown argument rather than ignoring it', () => {
    const res = run(['--target', 'staging', '--status', '--bogus']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/unknown argument/);
  });
});

describe('activate-notification-feeds.sh — the plan states the safe order', () => {
  it('puts the apply before the host write and the host write before the deploy', () => {
    // The queues collect from the apply; the host cannot name them until the
    // write; the worker cannot read them until the deploy. Any other order
    // leaves a step that silently does nothing.
    const res = dryRun(['--target', 'staging', '--state', 'on']);
    expect(res.exitCode).toBe(0);
    const applyStep = res.stdout.indexOf('terraform -chdir');
    const hostStep = res.stdout.indexOf('set-host-env.sh');
    const deployStep = res.stdout.indexOf('deploy_to_aws.sh');
    const verifyStep = res.stdout.indexOf('verify-host-env.sh');
    expect(applyStep).toBeGreaterThan(-1);
    expect(applyStep).toBeLessThan(hostStep);
    expect(hostStep).toBeLessThan(deployStep);
    expect(deployStep).toBeLessThan(verifyStep);
  });

  it('says the deploy is code-only, so activation can never replace a database', () => {
    const res = dryRun(['--target', 'staging', '--state', 'on']);
    expect(res.stdout).toMatch(/code-only; never --all-data/);
    expect(res.stdout).not.toMatch(/--soup-to-nuts|--from-csv/);
  });

  it('warns that the gap between applying and deploying is a gap, and that nothing is lost in it', () => {
    const res = dryRun(['--target', 'staging', '--state', 'on']);
    expect(res.stdout).toMatch(/collect/i);
    expect(res.stdout).toMatch(/None are lost|nothing is lost/i);
  });

  it('warns that turning the feeds off destroys whatever is still queued', () => {
    const res = dryRun(['--target', 'staging', '--state', 'off']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/REMOVES/);
    expect(res.stdout).toMatch(/destroyed|goes with it/i);
  });
});

describe('activate-notification-feeds.sh — the values file', () => {
  it('rewrites only the feed flag, leaving every other value untouched', () => {
    const tfvars = writeTfvars(OFF_TFVARS);
    const res = run(['--target', 'staging', '--state', 'on', '--tfvars', tfvars, '--yes']);
    expect(res.exitCode).toBe(0);
    const after = readFileSync(tfvars, 'utf-8');
    expect(after).toMatch(/^enable_feed_queues\s+= true$/m);
    expect(after).toMatch(/^environment\s+= "staging"$/m);
    expect(after).toMatch(/operator_cidrs\s+= \["203\.0\.113\.7\/32"\]/);
  });

  it('adds the flag to an environment that has never carried it', () => {
    // Erroring here would hand the operator back the hand-edit this script
    // exists to replace.
    const tfvars = writeTfvars(ABSENT_TFVARS);
    const res = run(['--target', 'staging', '--state', 'on', '--tfvars', tfvars, '--yes']);
    expect(res.exitCode).toBe(0);
    expect(readFileSync(tfvars, 'utf-8')).toMatch(/^enable_feed_queues = true$/m);
  });

  it('writes nothing when the flag already reads the requested value', () => {
    const tfvars = writeTfvars([...ABSENT_TFVARS, 'enable_feed_queues = true']);
    const before = readFileSync(tfvars, 'utf-8');
    const res = run(['--target', 'staging', '--state', 'on', '--tfvars', tfvars]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/already true; leaving the file alone/);
    expect(readFileSync(tfvars, 'utf-8')).toBe(before);
  });

  it('leaves the file alone when the rewrite cannot be confirmed', () => {
    // Confirmations are read from the terminal, never from stdin, because stdin
    // carries the operator's credential file. With no terminal and no --yes
    // there is no way to confirm, and the safe answer to that is to change
    // nothing.
    const tfvars = writeTfvars(OFF_TFVARS);
    const before = readFileSync(tfvars, 'utf-8');
    const res = run(['--target', 'staging', '--state', 'on', '--tfvars', tfvars]);
    expect(res.exitCode).toBe(1);
    expect(readFileSync(tfvars, 'utf-8')).toBe(before);
  });

  it('never lets the credential pipe answer a prompt', () => {
    // The first line of a redirected credential file looks exactly like a typed
    // confirmation would, if a prompt read stdin. It must not be taken as one.
    const tfvars = writeTfvars(OFF_TFVARS);
    const before = readFileSync(tfvars, 'utf-8');
    const res = run(['--target', 'staging', '--state', 'on', '--tfvars', tfvars], 'yes\nyes\n');
    expect(res.exitCode).toBe(1);
    expect(readFileSync(tfvars, 'utf-8')).toBe(before);
  });

  it('turns the feeds back off by the same single-scalar rewrite', () => {
    const tfvars = writeTfvars([...ABSENT_TFVARS, 'enable_feed_queues = true']);
    const res = run(['--target', 'staging', '--state', 'off', '--tfvars', tfvars, '--yes']);
    expect(res.exitCode).toBe(0);
    expect(readFileSync(tfvars, 'utf-8')).toMatch(/^enable_feed_queues = false$/m);
  });

  it('refuses a values file this repository does not ignore', () => {
    // The values file carries operator address ranges. Writing one where git can
    // pick it up is how those reach a commit.
    const tracked = join(process.cwd(), 'package.json');
    const res = run(['--target', 'staging', '--state', 'on', '--tfvars', tracked]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/git does not ignore it/);
  });

  it('refuses a values file that is not there rather than inventing one', () => {
    const res = run([
      '--target', 'staging', '--state', 'on',
      '--tfvars', join(tmpDir, 'no-such-file.tfvars'),
    ]);
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/does not exist/);
  });
});

describe('activate-notification-feeds.sh — synthetic mode stops before real infrastructure', () => {
  it('runs the values-file rewrite and nothing beyond it', () => {
    const tfvars = writeTfvars(OFF_TFVARS);
    const res = run(['--target', 'staging', '--state', 'on', '--tfvars', tfvars, '--yes']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/stopping before terraform, host-env and deploy/);
    // The steps it would have taken are named, so the preview and the real
    // sequence cannot drift apart unnoticed.
    expect(res.stdout).toMatch(/terraform -chdir/);
    expect(res.stdout).toMatch(/set-host-env\.sh/);
    expect(res.stdout).toMatch(/deploy_to_aws\.sh/);
    expect(res.stdout).toMatch(/verify-host-env\.sh/);
  });
});
