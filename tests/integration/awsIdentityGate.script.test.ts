/**
 * The gate over where an operator script gets its AWS identity.
 *
 * The condition it exists to prevent is a script that reaches AWS on whatever
 * the shell that started the run happened to hold. That worked for as long as
 * every shell was prepared by hand, and failed the first time a run started in
 * one that was not: the deploy stopped at its last step and named three causes,
 * all of them false, while the real answer was a stale variable in the
 * environment. The shared library settles and proves the identity instead, and
 * this gate is what keeps the next script from skipping it.
 *
 * Every case here asserts a refusal, inside a throwaway repository, because a
 * gate is worth what it catches rather than what it waves through. The
 * exceptions are the acceptance cases that pin the two compliant shapes, and
 * the final case, which runs the gate against this repository so the fixtures
 * stay honest about the real tree.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const GATE = join(process.cwd(), 'scripts/ci/check_aws_identity.sh');

interface RunResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Stands up a throwaway repository holding the given files and runs the gate
 * inside it. The gate resolves its root with `git rev-parse --show-toplevel`,
 * so the fixture has to be a real repository rather than a bare directory.
 */
function inFixtureRepo(files: Record<string, string>): RunResult {
  const root = mkdtempSync(join(tmpdir(), 'footbag-test-identity-gate-'));
  try {
    spawnSync('git', ['init', '-q', root], { encoding: 'utf8', ...SPAWN_GUARD });
    for (const [name, body] of Object.entries(files)) {
      const full = join(root, name);
      mkdirSync(join(full, '..'), { recursive: true });
      writeFileSync(full, body);
    }
    const res = spawnSync('bash', [GATE], { cwd: root, encoding: 'utf8', ...SPAWN_GUARD });
    return { exitCode: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

/** A script body, with the shebang and the strict-mode line every script has. */
function script(body: string): string {
  return ['#!/usr/bin/env bash', 'set -euo pipefail', body, ''].join('\n');
}

describe('the AWS-identity gate refuses a script that inherits its credentials', () => {
  it('refuses a bare aws call in a script that names no identity', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script('aws ssm get-parameter --name /footbag/thing'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/thing.sh');
    expect(res.stderr).toContain('never says where its identity comes from');
  });

  it('refuses a terraform call the same way, since terraform takes no profile', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script('terraform -chdir=terraform/staging output -raw domain'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/thing.sh');
  });

  it('refuses a call reached through a test seam, which reaches AWS just as well', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script('"$THING_AWS_BIN" s3 cp s3://bucket/key .'),
    });
    expect(res.exitCode).toBe(1);
  });

  it('refuses a call carrying an inline variable assignment in front of it', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script('AWS_REGION=us-east-1 aws sts get-caller-identity'),
    });
    expect(res.exitCode).toBe(1);
  });

  it('refuses a lib that reaches AWS without saying where its identity comes from', () => {
    const res = inFixtureRepo({
      'scripts/lib/thing.sh': script('aws ssm get-parameter --name /footbag/thing'),
    });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('scripts/lib/thing.sh');
  });

  it('is not satisfied by a comment claiming the library is used', () => {
    // Comments are stripped before anything is looked for, so a file cannot
    // describe a source line it does not have. This is the shape that made the
    // credential gate weaker than its own header claimed.
    const res = inFixtureRepo({
      'scripts/thing.sh': script(
        ['# identity comes from lib/aws-profile.sh', 'aws ssm get-parameter --name /x'].join('\n'),
      ),
    });
    expect(res.exitCode).toBe(1);
  });

  it('names the file and the offending line, not just a count', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script('aws lightsail get-instance --instance-name x'),
    });
    expect(res.stderr).toMatch(/scripts\/thing\.sh:\d+:.*aws lightsail/);
  });
});

describe('what the gate accepts', () => {
  it('accepts a script that sources the identity library', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script(
        [
          'source "$(dirname "${BASH_SOURCE[0]}")/lib/aws-profile.sh"',
          'aws_profile_ensure || exit 1',
          'aws ssm get-parameter --name /footbag/thing',
        ].join('\n'),
      ),
    });
    expect(res.exitCode, res.stderr).toBe(0);
    expect(res.stdout).toContain('[aws-identity] pass');
  });

  it('accepts a script that reads terraform through the shared reader', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script(
        [
          'source "$(dirname "${BASH_SOURCE[0]}")/lib/terraform-output.sh"',
          'tf_output_read terraform/staging cloudfront_domain',
        ].join('\n'),
      ),
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('leaves a script that reaches no AWS alone', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script('echo "terraform is mentioned here, and never run"'),
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('does not read `command -v terraform` as an invocation', () => {
    const res = inFixtureRepo({
      'scripts/thing.sh': script('command -v terraform >/dev/null || exit 1'),
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });

  it('leaves the host-side halves alone, which run on the host credential chain', () => {
    // With a workstation script beside it, so the run has a scope to report on:
    // an empty one is a refusal in its own right, tested below.
    const res = inFixtureRepo({
      'scripts/internal/thing-remote.sh': script('aws s3 cp s3://bucket/key /srv/footbag/'),
      'scripts/thing.sh': script('echo "nothing reached here"'),
    });
    expect(res.exitCode, res.stderr).toBe(0);
  });
});

describe('the gate fails closed', () => {
  it('refuses to report a pass when it matched no files at all', () => {
    // An empty scope is a broken check, not a clean tree: a scan that stops
    // finding the scripts would otherwise go green forever.
    const res = inFixtureRepo({ 'notes.txt': 'no scripts here\n' });
    expect(res.exitCode).toBe(1);
    expect(res.stderr).toContain('matched no files at all');
  });

  it('says how many scripts it scanned, so a shrinking scope is visible', () => {
    const res = inFixtureRepo({
      'scripts/a.sh': script('echo a'),
      'scripts/b.sh': script('echo b'),
    });
    expect(res.stdout).toMatch(/\[aws-identity\] pass \(2 scripts scanned\)/);
  });
});

describe('the gate against this repository', () => {
  it('passes, and scans the real scripts rather than an empty set', () => {
    const res = spawnSync('bash', [GATE], {
      cwd: process.cwd(),
      encoding: 'utf8',
      ...SPAWN_GUARD,
    });
    expect(res.status, res.stderr ?? '').toBe(0);
    const scanned = Number(/pass \((\d+) scripts scanned\)/.exec(res.stdout ?? '')?.[1] ?? '0');
    expect(scanned).toBeGreaterThan(40);
  });
});
