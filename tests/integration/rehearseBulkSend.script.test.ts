/**
 * scripts/rehearse-bulk-send.sh -- rehearsing a staged bulk send against the
 * AWS mailbox simulator.
 *
 * A real run needs AWS credentials, applied Terraform and live SES, none of
 * which CI has. What is pinned here is everything that decides whether the run
 * is safe and correctly aimed before any of that is reached: the argument
 * refusals, the labelled simulator addresses it would use, the pass arithmetic,
 * and the fact that a dry run sends nothing.
 *
 * The addresses are the part most worth pinning. Every recipient must resolve
 * to the simulator, because an address that does not is a real mailbox
 * receiving rehearsal traffic, and the label is what lets one run reach many
 * distinct recipients without inventing one.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const SCRIPT = join(process.cwd(), 'scripts/rehearse-bulk-send.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

function run(args: string[]): RunResult {
  const result = spawnSync('bash', [SCRIPT, ...args], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  return {
    exitCode: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
  };
}

describe('argument refusals', () => {
  it('refuses to run without an environment', () => {
    const res = run([]);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("--target must be 'staging' or 'production'");
  });

  it('refuses an environment it does not know', () => {
    const res = run(['--target', 'preview']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain("--target must be 'staging' or 'production'");
  });

  it('refuses a scenario that names no simulator mailbox', () => {
    const res = run(['--target', 'staging', '--scenario', 'chaos']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('--scenario must be success, bounce, complaint or mixed');
  });

  it('refuses a message count of zero', () => {
    const res = run(['--target', 'staging', '--count', '0']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('--count must be a whole number from 1 to 5000');
  });

  it('refuses a message count beyond the upper bound', () => {
    // Simulator mail costs no reputation, but it is billed per message and
    // consumes the account's send rate, so a mistyped count is a real charge
    // rather than a typo that stops at a prompt.
    const res = run(['--target', 'staging', '--count', '500000']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('--count must be a whole number from 1 to 5000');
  });

  it('refuses a zero pacing interval', () => {
    // The rehearsal exists to prove the account's send rate tolerates the
    // cadence the worker releases at. Back-to-back passes measure how fast the
    // provider will refuse instead.
    const res = run(['--target', 'staging', '--interval', '0']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('--interval must be a whole number of seconds, at least 1');
  });

  it('refuses a non-numeric batch size', () => {
    const res = run(['--target', 'staging', '--batch', 'lots']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('--batch must be a positive whole number');
  });

  it('refuses an unknown argument rather than ignoring it', () => {
    const res = run(['--target', 'staging', '--send-for-real']);
    expect(res.exitCode).toBe(2);
    expect(res.stderr).toContain('unknown arg: --send-for-real');
  });
});

describe('the dry run', () => {
  const dry = (args: string[]) => run(['--target', 'staging', '--dry-run', ...args]);

  it('sends nothing and says so', () => {
    const res = dry(['--count', '3']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Nothing was sent.');
  });

  it('addresses every message to the mailbox simulator', () => {
    const res = dry(['--count', '12', '--scenario', 'mixed']);
    const addresses = res.stdout
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.endsWith('@simulator.amazonses.com'));
    expect(addresses.length).toBe(12);
    expect(addresses.every((a) => a.endsWith('@simulator.amazonses.com'))).toBe(true);
  });

  it('gives every message its own label so one run reaches many recipients', () => {
    const res = dry(['--count', '8']);
    const addresses = new Set(
      res.stdout.split('\n').map((l) => l.trim())
        .filter((l) => l.endsWith('@simulator.amazonses.com')),
    );
    expect(addresses.size).toBe(8);
    expect(addresses.has('success+0001@simulator.amazonses.com')).toBe(true);
    expect(addresses.has('success+0008@simulator.amazonses.com')).toBe(true);
  });

  it('puts one bounce and one complaint into a mixed run and leaves the rest clean', () => {
    const res = dry(['--count', '10', '--scenario', 'mixed']);
    const addresses = res.stdout.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('@simulator.amazonses.com'));
    expect(addresses.filter((a) => a.startsWith('bounce+')).length).toBe(1);
    expect(addresses.filter((a) => a.startsWith('complaint+')).length).toBe(1);
    expect(addresses.filter((a) => a.startsWith('success+')).length).toBe(8);
  });

  it('sends everything to one mailbox when the scenario names one', () => {
    const res = dry(['--count', '4', '--scenario', 'bounce']);
    const addresses = res.stdout.split('\n').map((l) => l.trim()).filter((l) => l.endsWith('@simulator.amazonses.com'));
    expect(addresses.every((a) => a.startsWith('bounce+'))).toBe(true);
  });

  it('sends nothing on a dry run even when the raw probe is asked for', () => {
    // The raw probe is a different IAM action and a different API call from the
    // rest of the run, so it is the one most tempting to reach for early. A dry
    // run must still touch nothing at all.
    const res = dry(['--count', '2', '--raw-probe']);
    expect(res.exitCode).toBe(0);
    expect(res.stdout).toContain('Nothing was sent.');
    expect(res.stdout).not.toContain('raw-MIME probe (SendRawEmail');
  });

  it('reports the pass count and the pacing it would use', () => {
    const res = dry(['--count', '12', '--batch', '5', '--interval', '30']);
    expect(res.stdout).toContain('12 in 3 pass(es) of 5, 30s apart');
    // Two gaps between three passes, not three.
    expect(res.stdout).toContain('60s of pacing');
  });

  it('counts a final short pass rather than dropping it', () => {
    const res = dry(['--count', '11', '--batch', '5']);
    expect(res.stdout).toContain('11 in 3 pass(es) of 5');
  });
});
