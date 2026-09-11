/**
 * scripts/lib/cwagent-key.sh — the refusals and the cleanup around a live IAM key.
 *
 * The CloudWatch agent authenticates with a long-lived access key because a
 * Lightsail host has no instance role. Minting one used to be an operator's
 * hand-typed command with two things to remember afterwards: record it in the
 * vault before installing, and shred the file. Both failures are silent, and
 * the worse of the two leaves a live credential that exists in the account and
 * in no record.
 *
 * What is pinned here is the part that protects a credential rather than the
 * part that installs one:
 *
 *   - nothing is minted when there is no terminal to display it on, and the
 *     check happens before the create call rather than before the print, so a
 *     captured session cannot leave an orphan key behind;
 *   - a second key is never minted by accident, because two live keys is a
 *     rotation and a rotation is deliberate;
 *   - a key that was minted and then abandoned is deleted rather than left
 *     active, and a key that was installed successfully is not.
 *
 * The aws CLI is stubbed through the library's own seam, so nothing here
 * touches an account.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync, chmodSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/lib/cwagent-key.sh');

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-cwagentkey-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

/** An aws stub that reports a chosen number of existing keys, mints a fixed
 *  pair, and records every invocation so a test can assert what was called. */
function awsStub(existingKeys: number): string {
  const path = join(stubDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(stubDir, 'calls.log')}"`,
      'case "$2" in',
      `  list-access-keys) echo "${existingKeys}";;`,
      '  create-access-key) printf "AKIAFAKE\\tsecret-value-not-real\\n";;',
      '  delete-access-key) exit 0;;',
      'esac',
      'exit 0',
    ].join('\n'),
    'utf-8',
  );
  chmodSync(path, 0o755);
  return path;
}

/** Drive the library directly: source it, then run one snippet against it. */
function runSnippet(snippet: string, existingKeys = 0) {
  const script = join(stubDir, 'case.sh');
  writeFileSync(
    script,
    ['#!/usr/bin/env bash', 'set -uo pipefail', `source "${LIB}"`, snippet].join('\n'),
    'utf-8',
  );
  const result = spawnSync('bash', [script], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, CWAGENT_KEY_AWS_BIN: awsStub(existingKeys) },
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

describe('cwagent key provisioning refusals', () => {
  it('mints nothing when there is no terminal to show the secret on', () => {
    const r = runSnippet(
      'cwagent_key_provision footbag-staging-cwagent-publisher aws-entry 0; echo "rc=$?"',
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('no terminal to show the new access key on');
    expect(calls().some((c) => c.includes('create-access-key'))).toBe(false);
  });

  it('refuses a second key unless a rotation was asked for, and names the rotation path', () => {
    const r = runSnippet(
      'cwagent_key_provision footbag-staging-cwagent-publisher aws-entry 0; echo "rc=$?"',
      1,
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('already holds 1 access key');
    expect(r.stderr).toContain('--rotate');
    expect(calls().some((c) => c.includes('create-access-key'))).toBe(false);
  });

  it('refuses a third key on a rotation, because two is the account limit', () => {
    const r = runSnippet(
      'cwagent_key_provision footbag-staging-cwagent-publisher aws-entry 1; echo "rc=$?"',
      2,
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('already holds two access keys');
    expect(calls().some((c) => c.includes('create-access-key'))).toBe(false);
  });

  it('says plainly when it is running against a stub', () => {
    const r = runSnippet('cwagent_key_provision u e 0 || true');
    expect(r.stderr).toContain('SYNTHETIC');
  });
});

describe('cwagent key cleanup', () => {
  it('deletes a key that was minted and never recorded anywhere', () => {
    const r = runSnippet(
      [
        'CWAGENT_AKID=AKIAFAKE',
        'CWAGENT_KEY_USER=footbag-staging-cwagent-publisher',
        'CWAGENT_KEY_STATE=minted',
        'cwagent_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr).toContain('is being deleted');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(true);
  });

  it('never deletes a key the operator has already vaulted, whatever went wrong after', () => {
    const r = runSnippet(
      [
        'CWAGENT_AKID=AKIAFAKE',
        'CWAGENT_KEY_USER=footbag-staging-cwagent-publisher',
        'CWAGENT_KEY_STATE=vaulted',
        'cwagent_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr).toContain('NOT being deleted');
    expect(r.stderr).toContain('AKIAFAKE');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('leaves an installed key alone, so a successful install is not undone on exit', () => {
    const r = runSnippet(
      [
        'CWAGENT_AKID=AKIAFAKE',
        'CWAGENT_KEY_USER=footbag-staging-cwagent-publisher',
        'CWAGENT_KEY_STATE=minted',
        'cwagent_key_commit',
        'cwagent_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr).not.toContain('is being deleted');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('does nothing at all when no key was ever minted', () => {
    const r = runSnippet('cwagent_key_cleanup');
    expect(r.stderr).not.toContain('is being deleted');
    expect(calls()).toHaveLength(0);
  });

  it('deletes once and reports once when the handler runs twice', () => {
    // The callers install this on EXIT, INT and TERM, and a trapped INT does not
    // terminate bash: the handler runs, the script resumes, the next command fails
    // under set -e, and the EXIT handler runs the same branch again. The second
    // pass cannot delete an already-deleted key, so it reported a key the run had
    // successfully removed as one the operator must chase by hand.
    const r = runSnippet(
      [
        'CWAGENT_AKID=AKIAFAKE',
        'CWAGENT_KEY_USER=footbag-staging-cwagent-publisher',
        'CWAGENT_KEY_STATE=minted',
        'cwagent_key_cleanup',
        'cwagent_key_cleanup',
      ].join('\n'),
    );
    expect(calls().filter((c) => c.includes('delete-access-key'))).toHaveLength(1);
    expect(r.stderr.match(/is being deleted/g) ?? []).toHaveLength(1);
    expect(r.stderr).not.toMatch(/COULD NOT DELETE IT/);
  });

  it('reports a vaulted key once, not on every pass of the handler', () => {
    const r = runSnippet(
      [
        'CWAGENT_AKID=AKIAFAKE',
        'CWAGENT_KEY_USER=footbag-staging-cwagent-publisher',
        'CWAGENT_KEY_STATE=vaulted',
        'cwagent_key_cleanup',
        'cwagent_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr.match(/NOT being deleted/g) ?? []).toHaveLength(1);
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('tells the operator how to remove the key by hand when the delete itself fails', () => {
    const failingStub = join(stubDir, 'aws-failing.sh');
    writeFileSync(
      failingStub,
      ['#!/usr/bin/env bash', 'exit 1'].join('\n'),
      'utf-8',
    );
    chmodSync(failingStub, 0o755);
    const script = join(stubDir, 'fail-case.sh');
    writeFileSync(
      script,
      [
        '#!/usr/bin/env bash',
        'set -uo pipefail',
        `source "${LIB}"`,
        'CWAGENT_AKID=AKIAFAKE',
        'CWAGENT_KEY_USER=footbag-staging-cwagent-publisher',
        'CWAGENT_KEY_STATE=minted',
        'cwagent_key_cleanup',
      ].join('\n'),
      'utf-8',
    );
    const r = spawnSync('bash', [script], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: { ...process.env, CWAGENT_KEY_AWS_BIN: failingStub },
      ...SPAWN_GUARD,
    });
    expect(r.stderr).toContain('COULD NOT DELETE IT');
    expect(r.stderr).toContain('AKIAFAKE');
  });
});

describe('cwagent installers', () => {
  const installers = [
    'scripts/install-cwagent-staging.sh',
    'scripts/install-cwagent-production.sh',
  ];

  it.each(installers)('%s refuses an unknown argument rather than ignoring it', (script) => {
    const r = spawnSync('bash', [join(process.cwd(), script), '--nope'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: '',
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(2);
    expect(r.stderr).toContain("unknown argument '--nope'");
  });

  it.each(installers)('%s refuses --profile with no value', (script) => {
    const r = spawnSync('bash', [join(process.cwd(), script), '--profile'], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      input: '',
      ...SPAWN_GUARD,
    });
    expect(r.status).toBe(2);
  });

  it.each(installers)('%s no longer takes a keys file, so there is none to shred', (script) => {
    const source = readFileSync(join(process.cwd(), script), 'utf-8');
    expect(source).not.toContain('KEYS_FILE');
    expect(source).not.toContain('create-access-key');
  });

  it('the root-side half installs exactly one cleanup handler, which owns everything', () => {
    // Bash keeps one handler per signal. The privileged-writer helper used to
    // install its own EXIT INT TERM handler and clear all three on the way out,
    // which replaced and then discarded the handler the install step sets for its
    // downloaded package directory: a fresh install left that directory behind
    // every time, and an interrupt after the first promoted file left it behind
    // with nothing watching. A registry the single handler sweeps is the only shape
    // that can hold both, so what is pinned here is that there is exactly one
    // registration and that the helper adds to the registry rather than trapping.
    const half = readFileSync(
      join(process.cwd(), 'scripts/internal/install-cwagent-remote.sh'),
      'utf-8',
    );
    const registrations = half.split('\n').filter((l) => /^\s*trap\s/.test(l));
    expect(registrations, registrations.join('\n')).toHaveLength(1);
    expect(registrations[0]).toMatch(/EXIT INT TERM/);
    expect(half).not.toMatch(/trap - EXIT/);

    const helper = half.slice(half.indexOf('install_via_tmp() {'));
    const body = helper.slice(0, helper.indexOf('\n}'));
    expect(body).toMatch(/CWAGENT_TMPS\+=\("\$tmp"\)/);
    expect(body).not.toMatch(/trap/);
  });
});
