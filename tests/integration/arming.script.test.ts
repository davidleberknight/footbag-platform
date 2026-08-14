/**
 * scripts/arming.sh and scripts/production-live-marker.sh — the
 * operator paths that arm and disarm payments and move the go-live marker.
 *
 * A real run applies Terraform, deploys to a host, and writes Parameter Store,
 * none of which CI can exercise. What is pinned here is everything that
 * decides whether the run is safe before any of that happens: the argument
 * refusals, the order the plan states, the refusal to write a values file that
 * resolves inside this repository, the surgical rewrite of a single tfvars
 * scalar, and the confirmation that a disarm cannot proceed without the Stripe
 * endpoint being disabled first.
 *
 * The arming script's synthetic --tfvars mode rewrites a local file and stops
 * before Terraform and the deploy; the marker script's --dry-run prints its
 * plan without reaching AWS.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync } from 'node:child_process';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { mkdtempSync, writeFileSync, readFileSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const ARMING = join(process.cwd(), 'scripts/arming.sh');
const MARKER = join(process.cwd(), 'scripts/production-live-marker.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(script: string, args: string[], input = ''): RunResult {
  const result = spawnSync('bash', [script, ...args], {
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
beforeAll(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'footbag-test-arming-'));
});
afterAll(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

let fileCounter = 0;
function writeTfvars(lines: string[]): string {
  fileCounter += 1;
  const p = join(tmpDir, `vars-${fileCounter}.tfvars`);
  writeFileSync(p, lines.join('\n') + '\n');
  return p;
}

const BASE_TFVARS = [
  'environment      = "production"',
  'operator_cidrs   = ["203.0.113.7/32"]',
  'payments_armed   = "dark"',
  'email_send_armed = "dark"',
];

describe('arming.sh — argument validation', () => {
  it('rejects an unknown argument', () => {
    const res = run(ARMING, ['--bogus']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/unknown argument/);
  });

  it('rejects a target that is neither staging nor production', () => {
    const res = run(ARMING, ['--target', 'dev', '--status']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--target must be 'staging' or 'production'/);
  });

  it('requires either a status read or a state to move to', () => {
    const res = run(ARMING, ['--target', 'production']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/one of --status or --state/);
  });

  it('rejects a state that is neither armed nor dark', () => {
    const res = run(ARMING, ['--target', 'production', '--state', 'on']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--state takes 'armed' or 'dark'/);
  });

  it('rejects a resume point outside the step range', () => {
    const res = run(ARMING, ['--target', 'production', '--state', 'dark', '--from-step', '9']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--from-step takes a step number from 1 to 5/);
  });
});

describe('arming.sh — the plan states the safe order', () => {
  it('disarming puts the Stripe endpoint first, before anything local changes', () => {
    const res = run(ARMING, ['--target', 'production', '--state', 'dark', '--dry-run']);
    expect(res.exitCode).toBe(0);
    const endpointStep = res.stdout.indexOf('DISABLED in the dashboard');
    const tfvarsStep = res.stdout.indexOf('Rewrite payments_armed');
    const applyStep = res.stdout.indexOf('terraform -chdir');
    const deployStep = res.stdout.indexOf('deploy_to_aws.sh');
    expect(endpointStep).toBeGreaterThan(-1);
    expect(endpointStep).toBeLessThan(tfvarsStep);
    expect(tfvarsStep).toBeLessThan(applyStep);
    expect(applyStep).toBeLessThan(deployStep);
  });

  it('arming skips the endpoint-disable step, which applies only to going dark', () => {
    const res = run(ARMING, ['--target', 'production', '--state', 'armed', '--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/no provider-side precondition/);
    expect(res.stdout).not.toMatch(/DISABLED in the dashboard/);
  });

  it('never plans a data-replacing deploy', () => {
    const res = run(ARMING, ['--target', 'production', '--state', 'dark', '--dry-run']);
    expect(res.stdout).toMatch(/code-only; never --all-data/);
    expect(res.stdout).not.toMatch(/--soup-to-nuts|--from-csv/);
  });

  it('warns that disarming manufactures one false reconciliation issue', () => {
    const res = run(ARMING, ['--target', 'production', '--state', 'dark', '--dry-run']);
    expect(res.stdout).toMatch(/false reconciliation issue/);
  });
});

describe('arming.sh — the values file is never written into this repository', () => {
  it('refuses a values symlink that resolves inside the repository tree', () => {
    const inRepo = join(process.cwd(), 'package.json');
    const link = join(tmpDir, 'in-repo.tfvars');
    symlinkSync(inRepo, link);
    const res = run(ARMING, [
      '--target',
      'production',
      '--state',
      'armed',
      '--tfvars',
      link,
      '--dry-run',
    ]);
    // The dry run resolves the path but performs no write, so the refusal has
    // to fire on resolution rather than at the point of writing.
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/inside this repository/);
  });
});

describe('arming.sh — tfvars rewrite', () => {
  it('changes only the arming scalar and leaves every other line byte-identical', () => {
    const tfvars = writeTfvars(BASE_TFVARS);
    const before = readFileSync(tfvars, 'utf-8');
    const res = run(
      ARMING,
      ['--target', 'production', '--state', 'armed', '--tfvars', tfvars],
      'yes\n',
    );
    expect(res.exitCode).toBe(0);
    const after = readFileSync(tfvars, 'utf-8');
    expect(after).toMatch(/^payments_armed\s+= "armed"$/m);
    expect(after.split('\n').length).toBe(before.split('\n').length);
    expect(after).toMatch(/^operator_cidrs\s+= \["203\.0\.113\.7\/32"\]$/m);
    expect(after).toMatch(/^email_send_armed\s+= "dark"$/m);
  });

  it('stops before terraform and the deploy in synthetic mode', () => {
    const tfvars = writeTfvars(BASE_TFVARS);
    const res = run(
      ARMING,
      ['--target', 'production', '--state', 'armed', '--tfvars', tfvars],
      'yes\n',
    );
    expect(res.stdout).toMatch(/stopping before terraform and deploy/);
  });

  it('leaves the file alone when it already declares the wanted state', () => {
    const tfvars = writeTfvars(BASE_TFVARS);
    const res = run(ARMING, ['--target', 'production', '--state', 'dark', '--tfvars', tfvars], 'ENDPOINT DISABLED\n');
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/already "dark"; leaving the file alone/);
  });

  it('refuses a values file that declares no arming scalar rather than inventing one', () => {
    const tfvars = writeTfvars(['environment = "production"']);
    const res = run(
      ARMING,
      ['--target', 'production', '--state', 'armed', '--tfvars', tfvars],
      'yes\n',
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/no payments_armed assignment found/);
    expect(readFileSync(tfvars, 'utf-8')).not.toMatch(/payments_armed/);
  });

  it('aborts the rewrite when the shown diff is not confirmed', () => {
    const tfvars = writeTfvars(BASE_TFVARS);
    const res = run(
      ARMING,
      ['--target', 'production', '--state', 'armed', '--tfvars', tfvars],
      'no\n',
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/tfvars not changed/);
    expect(readFileSync(tfvars, 'utf-8')).toMatch(/payments_armed\s+= "dark"/);
  });
});

describe('arming.sh — disarming cannot proceed past the Stripe endpoint', () => {
  it('aborts, changing nothing, when the endpoint disable is not confirmed', () => {
    const tfvars = writeTfvars(['payments_armed   = "armed"']);
    const res = run(
      ARMING,
      ['--target', 'production', '--state', 'dark', '--tfvars', tfvars],
      'not yet\n',
    );
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toMatch(/endpoint must be disabled before the host goes dark/);
    expect(readFileSync(tfvars, 'utf-8')).toMatch(/payments_armed\s+= "armed"/);
  });

  it('proceeds to the rewrite once the endpoint is confirmed disabled', () => {
    const tfvars = writeTfvars(['payments_armed   = "armed"']);
    const res = run(
      ARMING,
      ['--target', 'production', '--state', 'dark', '--tfvars', tfvars],
      'ENDPOINT DISABLED\nyes\n',
    );
    expect(res.exitCode).toBe(0);
    expect(readFileSync(tfvars, 'utf-8')).toMatch(/payments_armed\s+= "dark"/);
  });

  it('skips the endpoint confirmation when resuming past it', () => {
    const tfvars = writeTfvars(['payments_armed   = "armed"']);
    const res = run(
      ARMING,
      ['--target', 'production', '--state', 'dark', '--tfvars', tfvars, '--from-step', '2'],
      'yes\n',
    );
    expect(res.exitCode).toBe(0);
    expect(res.stdout).not.toMatch(/ENDPOINT DISABLED/);
    expect(readFileSync(tfvars, 'utf-8')).toMatch(/payments_armed\s+= "dark"/);
  });
});

describe('arming.sh — the email switch', () => {
  const EMAIL_TFVARS = [
    'environment      = "production"',
    'payments_armed   = "dark"',
    'email_send_armed = "dark"',
  ];

  it('rejects a switch that is neither payments nor email', () => {
    const res = run(ARMING, ['--target', 'production', '--switch', 'sms', '--state', 'dark']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--switch must be 'payments' or 'email'/);
  });

  it('names the boot refusal as the reason arming email is gated', () => {
    // Arming email without the feedback key does not fail to send mail, it
    // stops the process starting. That is the one fact an operator must have
    // before they run this, so the plan has to state it.
    const res = run(ARMING, [
      '--target', 'production', '--switch', 'email', '--state', 'armed', '--dry-run',
    ]);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/REFUSES TO BOOT/);
    expect(res.stdout).toMatch(/SES_FEEDBACK_WEBHOOK_KEY/);
  });

  it('warns that arming email withdraws the on-screen verification link', () => {
    const res = run(ARMING, [
      '--target', 'production', '--switch', 'email', '--state', 'armed', '--dry-run',
    ]);
    expect(res.stdout).toMatch(/verification\s+link on screen/);
  });

  it('aborts, changing nothing, when the SES preconditions are not confirmed', () => {
    const tfvars = writeTfvars(EMAIL_TFVARS);
    const res = run(
      ARMING,
      ['--target', 'production', '--switch', 'email', '--state', 'armed', '--tfvars', tfvars],
      'not really\n',
    );
    expect(res.exitCode).toBe(1);
    // The specific refusal matters, not merely that something aborted: without
    // asserting it, the tfvars confirmation prompt swallowing the same input
    // would make this pass with the SES gate removed entirely.
    expect(res.stderr).toMatch(/Email stays dark/);
    expect(res.stdout).not.toMatch(/step 2: tfvars/);
    expect(readFileSync(tfvars, 'utf-8')).toMatch(/email_send_armed\s+= "dark"/);
  });

  it('rewrites only the email scalar, leaving the payments switch untouched', () => {
    const tfvars = writeTfvars(EMAIL_TFVARS);
    const res = run(
      ARMING,
      ['--target', 'production', '--switch', 'email', '--state', 'armed', '--tfvars', tfvars],
      'SES READY\nyes\n',
    );
    expect(res.exitCode).toBe(0);
    const after = readFileSync(tfvars, 'utf-8');
    expect(after).toMatch(/^email_send_armed\s+= "armed"$/m);
    // The two switches are independent; arming one must never move the other.
    expect(after).toMatch(/^payments_armed\s+= "dark"$/m);
  });

  it('does not ask about the Stripe endpoint when the switch is email', () => {
    const res = run(ARMING, [
      '--target', 'production', '--switch', 'email', '--state', 'dark', '--dry-run',
    ]);
    expect(res.stdout).not.toMatch(/DISABLED in the dashboard/);
    expect(res.stdout).toMatch(/no provider-side precondition/);
  });
});

describe('production-live-marker.sh — refusals and plan', () => {
  it('rejects a direction that is neither live nor pre-live', () => {
    const res = run(MARKER, ['--set', 'maybe']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--set takes 'live' or 'pre-live'/);
  });

  it('requires either a status read or a direction', () => {
    const res = run(MARKER, []);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/one of --status or --set/);
  });

  it('requires an AWS profile for any real read or write', () => {
    const res = run(MARKER, ['--status']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toMatch(/--profile is required/);
  });

  it('states that going live forbids the database-replacing deploy permanently', () => {
    const res = run(MARKER, ['--set', 'live', '--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/--value true/);
    expect(res.stdout).toMatch(/forbids the database-replacing deploy permanently/);
  });

  it('states that returning to pre-live re-arms the destructive deploy paths', () => {
    const res = run(MARKER, ['--set', 'pre-live', '--dry-run']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toMatch(/--value false/);
    expect(res.stdout).toMatch(/re-arms the database-replacing deploy paths/);
  });

  it('writes the marker as a plain String parameter, never encrypted', () => {
    // The marker is a state flag the deploy guards read with the host's own
    // runtime profile, not a secret; declaring it SecureString here would
    // diverge from the resource Terraform owns.
    const res = run(MARKER, ['--set', 'live', '--dry-run']);
    expect(res.stdout).toMatch(/--type String/);
    expect(res.stdout).not.toMatch(/SecureString/);
  });
});
