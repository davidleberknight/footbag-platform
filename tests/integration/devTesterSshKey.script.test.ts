/**
 * scripts/lib/dev-tester-ssh-key.sh — adding a named account's Match block to
 * an operator's SSH configuration, after a diff and a typed APPLY, and proving
 * how the alias resolves afterwards.
 *
 * The alias is how every run reaches the host, and it must connect as the
 * shared account unless a command runs under the job role's profile. So every
 * refusal below leaves the operator's file byte for byte as it was, and a write
 * that went through still fails the run when the alias no longer resolves the
 * way the block promises: a default that stops connecting as the shared account
 * would attribute every operator's work to one person, and a named account that
 * an earlier rule overrides would leave the person acting as somebody else.
 *
 * The cases run the real `ssh -G -F <file>`, so the verdict on how the alias
 * resolves comes from OpenSSH and not from a parser written here. The library's
 * own client is a wrapper that adds -F, because without it ssh reads the
 * configuration of whoever runs the suite. The shared isolation stubs `ssh`,
 * which cannot parse a file, so the real binary is put ahead of it, visibly.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, symlinkSync, readdirSync, chmodSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const LIB_DIR = join(process.cwd(), 'scripts/lib');
const REAL_SSH = '/usr/bin/ssh';
// skip-fails-in-ci: the runIf block below skips without a real ssh client,
// and this refusal makes that absence a failure on the runner.
if (!existsSync(REAL_SSH) && process.env.CI) {
  throw new Error(`${REAL_SSH} is required for these cases and is missing on this runner.`);
}

const PROFILE = 'FootbagDevTester';
const ACCOUNT = 'jane_doe';

let workDir: string;
let config: string;
let tmp: string;

beforeEach(() => {
  workDir = createScratchDir('dev-tester-ssh-key');
  config = join(workDir, 'config');
  tmp = join(workDir, 'tmp');
  mkdirSync(tmp);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const ALIAS = ['Host footbag-staging', '  Hostname 203.0.113.10', '  User footbag', ''].join('\n');

/** A directory holding the real ssh, and the client the library resolves the alias with. */
function bin(): { path: string; client: string } {
  const dir = join(workDir, 'bin');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'ssh'))) symlinkSync(REAL_SSH, join(dir, 'ssh'));
  const client = join(workDir, 'alias-ssh');
  writeFileSync(client, `#!/usr/bin/env bash\nexec ${REAL_SSH} -F ${JSON.stringify(config)} "$@"\n`);
  chmodSync(client, 0o755);
  return { path: dir, client };
}

/**
 * Runs the function against `body`. `confirm` stands for the operator typing
 * APPLY; without it there is no terminal, which the shared confirmation treats
 * as not confirmed.
 */
function ensure(body: string | null, confirm = false) {
  if (body !== null) writeFileSync(config, body, 'utf-8');
  const { path, client } = bin();
  const res = spawnSync(
    'bash',
    [
      '-c',
      `set -uo pipefail; source ${JSON.stringify(join(LIB_DIR, 'host-env-remote.sh'))};` +
        ` source ${JSON.stringify(join(LIB_DIR, 'ssh-alias.sh'))};` +
        ` source ${JSON.stringify(join(LIB_DIR, 'dev-tester-ssh-key.sh'))};` +
        (confirm ? ' ASSUME_YES=yes;' : '') +
        ` dtsk_ensure_match_block ${JSON.stringify(config)} footbag-staging ${ACCOUNT} ${PROFILE}`,
    ],
    {
      encoding: 'utf-8',
      ...SPAWN_GUARD,
      env: { ...process.env, PATH: `${path}:${process.env.PATH ?? ''}`, DTSK_SSH_BIN: client, TMPDIR: tmp },
    },
  );
  return {
    status: res.status,
    out: `${res.stdout ?? ''}${res.stderr ?? ''}`,
    file: existsSync(config) ? readFileSync(config, 'utf-8') : null,
  };
}

function userFor(awsProfile?: string): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.AWS_PROFILE;
  if (awsProfile) env.AWS_PROFILE = awsProfile;
  const res = spawnSync(REAL_SSH, ['-G', '-F', config, 'footbag-staging'], { encoding: 'utf-8', input: '', env, ...SPAWN_GUARD });
  return /^user (\S+)$/m.exec(res.stdout ?? '')?.[1] ?? '';
}

describe.runIf(existsSync(REAL_SSH))('dtsk_ensure_match_block', () => {
  // Defect caught: a confirmed run that writes the block but leaves the alias
  // resolving some other way, or writes nothing and still reports success.
  it('writes the block once confirmed, and the alias then resolves both ways', () => {
    const r = ensure(ALIAS, true);
    expect(r.status, r.out).toBe(0);
    expect(r.file).not.toBe(ALIAS);
    expect(r.file?.endsWith(ALIAS)).toBe(true);
    expect(userFor()).toBe('footbag');
    expect(userFor(PROFILE)).toBe(ACCOUNT);
    expect(readdirSync(tmp)).toEqual([]);
  });

  // Defect caught: a re-run after a finished onboarding adds the block twice
  // or asks again, instead of saying there is nothing to do.
  it('changes nothing and asks nothing when the block is already there', () => {
    const first = ensure(ALIAS, true);
    expect(first.status, first.out).toBe(0);
    const again = ensure(null);
    expect(again.status, again.out).toBe(0);
    expect(again.out).toContain('already present');
    expect(again.file).toBe(first.file);
  });

  // Defect caught: an unconfirmed run writes the operator's file anyway, or
  // leaves the changed copy behind in the temp directory.
  it('leaves the file alone and removes its copy when the change is not confirmed', () => {
    const r = ensure(ALIAS);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('Not confirmed');
    expect(r.file).toBe(ALIAS);
    expect(readdirSync(tmp)).toEqual([]);
  });

  // Defect caught: with no configuration at all, the run creates one holding
  // only the block, so the alias it exists to sit beside is never defined.
  it('refuses a configuration that does not exist, creating none', () => {
    const r = ensure(null, true);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('does not exist');
    expect(r.file).toBeNull();
  });

  // Defect caught: an alias reached only through a wildcard gets a block that
  // nothing will ever match, and the run reports the account connected.
  it('refuses a configuration with no Host line naming the alias', () => {
    const body = 'Host footbag-*\n  User footbag\n';
    const r = ensure(body, true);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('no Host line naming footbag-staging');
    expect(r.file).toBe(body);
    expect(readdirSync(tmp)).toEqual([]);
  });

  // Defect caught: a workstation that already acts as one named person is
  // switched to another, so one person's runs are signed as somebody else.
  it('refuses a block for the alias that names another account', () => {
    const other = ensure(ALIAS, true);
    expect(other.status, other.out).toBe(0);
    const held = (other.file ?? '').replaceAll(ACCOUNT, 'john_roe');
    writeFileSync(config, held, 'utf-8');
    const r = ensure(null, true);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('naming another account');
    expect(r.file).toBe(held);
    expect(readdirSync(tmp)).toEqual([]);
  });

  // Defect caught: a configuration ssh rejects is overwritten with a result
  // that also does not parse, breaking every run that reaches the host.
  it('refuses a configuration whose result would not parse', () => {
    const body = `${ALIAS}  NotARealDirective yes\n`;
    const r = ensure(body, true);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain('would not parse');
    expect(r.file).toBe(body);
    expect(readdirSync(tmp)).toEqual([]);
  });

  // Defect caught: an earlier rule already sets the user for every host, so the
  // default no longer connects as the shared account, and the run calls the
  // onboarding done.
  it('fails the run when the alias no longer connects as the shared account by default', () => {
    const r = ensure(`Host *\n  User someone_else\n\n${ALIAS}`, true);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain("by default footbag-staging now resolves as 'someone_else'");
  });

  // Defect caught: an earlier rule under the job role's profile wins over the
  // new block, so the named person's commands connect as somebody else and the
  // run reports them connected as themselves.
  it('fails the run when an earlier rule overrides the account under the job role', () => {
    const body = `Match exec "test x$AWS_PROFILE = x${PROFILE}"\n  User someone_else\n\n${ALIAS}`;
    const r = ensure(body, true);
    expect(r.status).not.toBe(0);
    expect(r.out).toContain(`under AWS_PROFILE=${PROFILE}, footbag-staging resolves as 'someone_else'`);
  });
});
