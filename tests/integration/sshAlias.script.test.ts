/**
 * scripts/lib/ssh-alias.sh — the named account's Match block, the one edit
 * hiring and firing make to an operator's SSH configuration.
 *
 * The alias's stanza is the default and is never edited for a named account.
 * The block above it applies only while AWS_PROFILE names the job role's
 * profile, which the wrapper sets for one command. A block that caught the
 * wrong stanza, or a file ssh could not parse, would change which account every
 * default run connects as, so the cases below pin that the file is otherwise
 * byte for byte, that the default still resolves as the shared account, and
 * that a result ssh would reject is never handed back.
 *
 * These cases run the real `ssh -G -F <file>`: given -F, ssh reads that file
 * alone and neither the system-wide configuration nor the user's, so nothing
 * on this machine decides the answer. The shared isolation's stub cannot parse
 * a file, so the real binary is put ahead of it, visibly, here.
 *
 * Nothing here writes the operator's file. The library produces the changed
 * copy beside the original and reports what happened; showing the diff and
 * asking belongs to the run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, rmSync, existsSync, mkdirSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const LIB = join(process.cwd(), 'scripts/lib/ssh-alias.sh');
const REAL_SSH = '/usr/bin/ssh';
if (!existsSync(REAL_SSH) && process.env.CI) {
  throw new Error(`${REAL_SSH} is required for these cases and is missing on this runner.`);
}

const PROFILE = 'FootbagDevTester';

let workDir: string;
let config: string;
let out: string;

beforeEach(() => {
  workDir = createScratchDir('ssh-alias');
  config = join(workDir, 'config');
  out = join(workDir, 'changed');
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

const DEFAULT = [
  'Host footbag-staging',
  '  Hostname 203.0.113.10',
  '  Port 2222',
  '  User footbag',
  '  IdentityFile ~/.ssh/id_ed25519',
  '  IdentitiesOnly yes',
  '',
  'Host footbag-production',
  '  Hostname 203.0.113.20',
  '  User footbag',
  '',
].join('\n');

const BLOCK = [
  'Match host footbag-staging exec "test x$AWS_PROFILE = xFootbagDevTester"',
  '  User david_leberknight',
  '  IdentityFile ~/.ssh/id_ed25519_david_leberknight',
  '',
].join('\n');

function bin(): string {
  const dir = join(workDir, 'real-ssh');
  mkdirSync(dir, { recursive: true });
  if (!existsSync(join(dir, 'ssh'))) symlinkSync(REAL_SSH, join(dir, 'ssh'));
  return dir;
}

function lib(fn: string, body: string, account = 'david_leberknight') {
  writeFileSync(config, body, 'utf-8');
  const res = spawnSync(
    'bash',
    [
      '-c',
      `set -uo pipefail; source ${JSON.stringify(LIB)};` +
        ` ${fn} ${JSON.stringify(config)} footbag-staging ${account} ${PROFILE}` +
        ` ${JSON.stringify(out)}; echo "rc=$?"`,
    ],
    { encoding: 'utf-8', ...SPAWN_GUARD, env: { ...process.env, PATH: `${bin()}:${process.env.PATH ?? ''}` } },
  );
  const rc = Number(/rc=(\d+)/.exec(res.stdout ?? '')?.[1] ?? '-1');
  return { rc, result: rc === 0 ? readFileSync(out, 'utf-8') : '' };
}

function userFor(file: string, awsProfile?: string): string {
  const env: NodeJS.ProcessEnv = { ...process.env };
  delete env.AWS_PROFILE;
  if (awsProfile) env.AWS_PROFILE = awsProfile;
  const res = spawnSync(REAL_SSH, ['-G', '-F', file, 'footbag-staging'], {
    encoding: 'utf-8',
    input: '',
    env,
    ...SPAWN_GUARD,
  });
  return /^user (\S+)$/m.exec(res.stdout ?? '')?.[1] ?? '';
}

const add = (body: string, account?: string) => lib('ssh_alias_add_match_block', body, account);
const remove = (body: string, account?: string) => lib('ssh_alias_remove_match_block', body, account);

describe.runIf(existsSync(REAL_SSH))('adding the Match block', () => {
  it('inserts it above the alias and changes no line of the existing file', () => {
    const r = add(DEFAULT);
    expect(r.rc).toBe(0);
    expect(r.result).toBe(BLOCK + DEFAULT);
  });

  it('leaves the default on footbag and switches only under the job role profile', () => {
    const r = add(DEFAULT);
    expect(r.rc).toBe(0);
    writeFileSync(out, r.result, 'utf-8');
    expect(userFor(out)).toBe('footbag');
    expect(userFor(out, 'footbag-operator')).toBe('footbag');
    expect(userFor(out, 'x; echo injected')).toBe('footbag');
    expect(userFor(out, PROFILE)).toBe('david_leberknight');
  });

  it('finds the alias among several names on one Host line', () => {
    const body = DEFAULT.replace('Host footbag-staging', 'Host staging-box footbag-staging');
    const r = add(body);
    expect(r.rc).toBe(0);
    expect(r.result).toBe(BLOCK + body);
  });

  it('does not take an alias that merely contains the name', () => {
    expect(add('Host footbag-staging-old\n  User footbag\n').rc).toBe(3);
  });

  it('reports nothing to do when the block is already there', () => {
    const first = add(DEFAULT);
    expect(add(first.result).rc).toBe(2);
  });

  it('refuses a second named account on the same workstation', () => {
    const first = add(DEFAULT);
    expect(add(first.result, 'james_leberknight').rc).toBe(4);
  });

  it('refuses a file with no stanza for the alias rather than inventing one', () => {
    expect(add('Host elsewhere\n  User x\n').rc).toBe(3);
  });

  it('refuses to hand back a file ssh would not parse', () => {
    // A rejected line stops ssh reading the whole file, which would take the
    // default route down with it.
    expect(add(`${DEFAULT}BadDirective yes\n`).rc).toBe(1);
  });

  it('reports an unreadable configuration rather than writing an empty one', () => {
    const res = spawnSync(
      'bash',
      [
        '-c',
        `set -uo pipefail; source ${JSON.stringify(LIB)};` +
          ` ssh_alias_add_match_block ${JSON.stringify(join(workDir, 'absent'))} footbag-staging a ${PROFILE}` +
          ` ${JSON.stringify(out)}; echo "rc=$?"`,
      ],
      { encoding: 'utf-8', ...SPAWN_GUARD },
    );
    expect(res.stdout).toContain('rc=1');
  });
});

describe.runIf(existsSync(REAL_SSH))('removing the Match block', () => {
  it('removes exactly the block, restoring the file byte for byte', () => {
    const added = add(DEFAULT);
    const r = remove(added.result);
    expect(r.rc).toBe(0);
    expect(r.result).toBe(DEFAULT);
  });

  it('reports nothing to do when the block is absent, and leaves another account\'s alone', () => {
    expect(remove(DEFAULT).rc).toBe(2);
    const added = add(DEFAULT);
    expect(remove(added.result, 'james_leberknight').rc).toBe(2);
  });
});
