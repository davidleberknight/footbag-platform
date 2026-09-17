/**
 * scripts/lib/iam-access-key.sh — the refusals around minting and retiring a
 * live IAM access key.
 *
 * Several identities in this estate authenticate with long-lived access keys,
 * because a Lightsail host has no instance role. Minting one used to be an
 * operator's hand-typed command with things to remember afterwards: record it
 * in the vault before installing, shred the file, and come back later to cut
 * the predecessor. Every one of those failures is silent, and the worst leaves
 * either a live credential that exists in the account and in no record, or a
 * rotation that ends with two live keys and retires nothing.
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
 *     active, and a key that was installed successfully is not;
 *   - a retirement touches only a key the named identity actually holds, never
 *     the last one it has, and never deletes what is still active, so the
 *     documented deactivate-then-delete order is enforced rather than
 *     remembered.
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

const LIB = join(process.cwd(), 'scripts/lib/iam-access-key.sh');

let stubDir: string;

beforeEach(() => {
  stubDir = mkdtempSync(join(tmpdir(), 'footbag-test-iamkey-'));
});

afterEach(() => {
  rmSync(stubDir, { recursive: true, force: true });
});

/**
 * An aws stub that answers the two list shapes the library asks for, mints a
 * fixed pair, and records every invocation so a test can assert what was
 * called. The library asks for a count when deciding whether it may mint, and
 * for id/status rows when deciding whether it may retire, so the stub picks its
 * answer off the --query argument exactly as the real CLI would.
 */
function awsStub(opts: { existingKeys?: number; keyRows?: string } = {}): string {
  const existingKeys = opts.existingKeys ?? 0;
  const keyRows = opts.keyRows ?? '';
  const path = join(stubDir, 'aws-stub.sh');
  writeFileSync(
    path,
    [
      '#!/usr/bin/env bash',
      `echo "$*" >> "${join(stubDir, 'calls.log')}"`,
      'case "$2" in',
      '  list-access-keys)',
      '    case "$*" in',
      `      *length*) echo "${existingKeys}";;`,
      `      *) printf '%b' "${keyRows}";;`,
      '    esac;;',
      '  create-access-key) printf "AKIAFAKE\\tsecret-value-not-real\\n";;',
      '  update-access-key) exit 0;;',
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
function runSnippet(snippet: string, opts: { existingKeys?: number; keyRows?: string } = {}) {
  const script = join(stubDir, 'case.sh');
  writeFileSync(
    script,
    ['#!/usr/bin/env bash', 'set -uo pipefail', `source "${LIB}"`, snippet].join('\n'),
    'utf-8',
  );
  const result = spawnSync('bash', [script], {
    cwd: process.cwd(),
    encoding: 'utf-8',
    env: { ...process.env, IAM_KEY_AWS_BIN: awsStub(opts) },
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

describe('access key provisioning refusals', () => {
  it('mints nothing when there is no terminal to show the secret on', () => {
    const r = runSnippet(
      'iam_key_provision footbag-staging-cwagent-publisher aws-entry 0; echo "rc=$?"',
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('no terminal to show the new access key on');
    expect(calls().some((c) => c.includes('create-access-key'))).toBe(false);
  });

  it('refuses a second key unless a rotation was asked for, and names the rotation path', () => {
    const r = runSnippet(
      'iam_key_provision footbag-staging-cwagent-publisher aws-entry 0; echo "rc=$?"',
      { existingKeys: 1 },
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('already holds 1 access key');
    expect(r.stderr).toContain('rotation');
    expect(calls().some((c) => c.includes('create-access-key'))).toBe(false);
  });

  it('refuses a third key on a rotation, because two is the account limit', () => {
    const r = runSnippet(
      'iam_key_provision footbag-staging-cwagent-publisher aws-entry 1; echo "rc=$?"',
      { existingKeys: 2 },
    );
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('already holds two access keys');
    expect(calls().some((c) => c.includes('create-access-key'))).toBe(false);
  });

  it('says plainly when it is running against a stub', () => {
    const r = runSnippet('iam_key_provision u e 0 || true');
    expect(r.stderr).toContain('SYNTHETIC');
  });
});

describe('access key cleanup', () => {
  it('deletes a key that was minted and never recorded anywhere', () => {
    const r = runSnippet(
      [
        'IAM_KEY_AKID=AKIAFAKE',
        'IAM_KEY_USER=footbag-staging-cwagent-publisher',
        'IAM_KEY_STATE=minted',
        'iam_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr).toContain('is being deleted');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(true);
  });

  it('never deletes a key the operator has already vaulted, whatever went wrong after', () => {
    const r = runSnippet(
      [
        'IAM_KEY_AKID=AKIAFAKE',
        'IAM_KEY_USER=footbag-staging-cwagent-publisher',
        'IAM_KEY_STATE=vaulted',
        'iam_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr).toContain('NOT being deleted');
    expect(r.stderr).toContain('AKIAFAKE');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('leaves an installed key alone, so a successful install is not undone on exit', () => {
    const r = runSnippet(
      [
        'IAM_KEY_AKID=AKIAFAKE',
        'IAM_KEY_USER=footbag-staging-cwagent-publisher',
        'IAM_KEY_STATE=minted',
        'iam_key_commit',
        'iam_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr).not.toContain('is being deleted');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('does nothing at all when no key was ever minted', () => {
    const r = runSnippet('iam_key_cleanup');
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
        'IAM_KEY_AKID=AKIAFAKE',
        'IAM_KEY_USER=footbag-staging-cwagent-publisher',
        'IAM_KEY_STATE=minted',
        'iam_key_cleanup',
        'iam_key_cleanup',
      ].join('\n'),
    );
    expect(calls().filter((c) => c.includes('delete-access-key'))).toHaveLength(1);
    expect(r.stderr.match(/is being deleted/g) ?? []).toHaveLength(1);
    expect(r.stderr).not.toMatch(/COULD NOT DELETE IT/);
  });

  it('reports a vaulted key once, not on every pass of the handler', () => {
    const r = runSnippet(
      [
        'IAM_KEY_AKID=AKIAFAKE',
        'IAM_KEY_USER=footbag-staging-cwagent-publisher',
        'IAM_KEY_STATE=vaulted',
        'iam_key_cleanup',
        'iam_key_cleanup',
      ].join('\n'),
    );
    expect(r.stderr.match(/NOT being deleted/g) ?? []).toHaveLength(1);
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('tells the operator how to remove the key by hand when the delete itself fails', () => {
    const failingStub = join(stubDir, 'aws-failing.sh');
    writeFileSync(failingStub, ['#!/usr/bin/env bash', 'exit 1'].join('\n'), 'utf-8');
    chmodSync(failingStub, 0o755);
    const script = join(stubDir, 'fail-case.sh');
    writeFileSync(
      script,
      [
        '#!/usr/bin/env bash',
        'set -uo pipefail',
        `source "${LIB}"`,
        'IAM_KEY_AKID=AKIAFAKE',
        'IAM_KEY_USER=footbag-staging-cwagent-publisher',
        'IAM_KEY_STATE=minted',
        'iam_key_cleanup',
      ].join('\n'),
      'utf-8',
    );
    const r = spawnSync('bash', [script], {
      cwd: process.cwd(),
      encoding: 'utf-8',
      env: { ...process.env, IAM_KEY_AWS_BIN: failingStub },
      ...SPAWN_GUARD,
    });
    expect(r.stderr).toContain('COULD NOT DELETE IT');
    expect(r.stderr).toContain('AKIAFAKE');
  });
});

describe('access key retirement', () => {
  const TWO_KEYS = 'AKIAOLD\\tActive\\nAKIANEW\\tActive\\n';
  const OLD_INACTIVE = 'AKIAOLD\\tInactive\\nAKIANEW\\tActive\\n';
  const ONE_KEY = 'AKIAONLY\\tActive\\n';

  it('refuses a key id the named identity does not hold', () => {
    // Retiring a key belonging to somebody else is how a rotation takes down a
    // service it was never meant to touch, and an id is easy to paste wrong.
    const r = runSnippet('iam_key_retire some-user AKIASTRANGER deactivate; echo "rc=$?"', {
      keyRows: TWO_KEYS,
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('is not a key of some-user');
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(false);
  });

  it('refuses to retire the only key an identity has', () => {
    const r = runSnippet('iam_key_retire some-user AKIAONLY deactivate; echo "rc=$?"', {
      keyRows: ONE_KEY,
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('no active key');
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(false);
  });

  it('counts ACTIVE keys, so an inactive one does not look like a way back in', () => {
    // Counting rows made "one Active plus one Inactive" look safe to retire
    // from, because the count was two. Deactivating the Active one then left
    // the identity unable to authenticate at all -- the exact outcome this
    // guard exists to prevent, reached through the guard.
    const r = runSnippet('iam_key_retire some-user AKIAACTIVE deactivate; echo "rc=$?"', {
      keyRows: 'AKIAACTIVE\\tActive\\nAKIADEAD\\tInactive\\n',
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('no active key');
    expect(r.stderr).toMatch(/not a way back in/);
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(false);
  });

  it('allows the retirement when a second ACTIVE key would remain', () => {
    // The ordinary rotation shape, and the case the guard must not block.
    const r = runSnippet('iam_key_retire some-user AKIAOLD deactivate; echo "rc=$?"', {
      keyRows: 'AKIAOLD\\tActive\\nAKIANEW\\tActive\\n',
    });
    expect(r.stdout).toContain('rc=0');
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(true);
  });

  it('deactivates an active predecessor and reads the list back afterwards', () => {
    const r = runSnippet('iam_key_retire some-user AKIAOLD deactivate; echo "rc=$?"', {
      keyRows: TWO_KEYS,
    });
    expect(r.stdout).toContain('rc=0');
    const update = calls().find((c) => c.includes('update-access-key'));
    expect(update).toContain('AKIAOLD');
    expect(update).toContain('Inactive');
    // The outcome, not the invocation: the list is read again after the change.
    expect(calls().filter((c) => c.includes('list-access-keys')).length).toBeGreaterThan(1);
  });

  it('is a no-op on a key that is already inactive', () => {
    const r = runSnippet('iam_key_retire some-user AKIAOLD deactivate; echo "rc=$?"', {
      keyRows: OLD_INACTIVE,
    });
    expect(r.stdout).toContain('rc=0');
    expect(r.stdout).toContain('already inactive');
    expect(calls().some((c) => c.includes('update-access-key'))).toBe(false);
  });

  it('refuses to delete a key that is still active, so the order cannot be skipped', () => {
    // Deactivating is reversible and proves nothing still depends on the key.
    // Deleting is not, and an access key id is never reissued, so the sequence
    // is enforced here rather than trusted to the operator's memory.
    const r = runSnippet('iam_key_retire some-user AKIAOLD delete; echo "rc=$?"', {
      keyRows: TWO_KEYS,
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain('still active');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(false);
  });

  it('deletes a key that has already been deactivated', () => {
    const r = runSnippet('iam_key_retire some-user AKIAOLD delete; echo "rc=$?"', {
      keyRows: OLD_INACTIVE,
    });
    expect(r.stdout).toContain('rc=0');
    expect(calls().some((c) => c.includes('delete-access-key'))).toBe(true);
  });

  it('refuses a mode it does not recognise rather than guessing one', () => {
    const r = runSnippet('iam_key_retire some-user AKIAOLD destroy; echo "rc=$?"', {
      keyRows: TWO_KEYS,
    });
    expect(r.stdout).toContain('rc=1');
    expect(r.stderr).toContain("must be 'deactivate' or 'delete'");
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

  it.each(installers)('%s describes its own credential in the vault block', (script) => {
    // The library holds no knowledge of any particular identity, so a caller
    // that sets no notes produces a vault entry saying only what the key is
    // called, which is a record nobody can act on.
    const source = readFileSync(join(process.cwd(), script), 'utf-8');
    expect(source).toContain('IAM_KEY_VAULT_NOTES=');
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
