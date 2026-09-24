/**
 * scripts/internal/provision-operator-account-remote.sh — the offboard branch,
 * run for real against a fake host.
 *
 * The root-side half is what actually ends a person's access, and a text match
 * against its source cannot say whether it does. So this suite runs the real
 * script body against a host built out of files: the account database, the
 * group database and each account's home directory live in a scratch tree, and
 * the account tools the script calls (`getent`, `id`, `passwd`, `usermod`,
 * `chage`, `gpasswd`, `install`, `stat`) are small stand-ins that read and write
 * that tree. `ssh-keygen` is the real one, because fingerprint matching is the
 * whole of the sweep and a stand-in would be testing itself.
 *
 * The one line changed before running is the refusal to run unless root. A test
 * cannot be root, and the check is asserted to be present and replaced exactly
 * once, so a rewrite of it fails here rather than going unexercised.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  writeFileSync,
  readFileSync,
  mkdirSync,
  chmodSync,
  existsSync,
  renameSync,
  rmSync,
} from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir } from '../fixtures/scratchDir';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/provision-operator-account-remote.sh');
const ROOT_GUARD = 'if [[ $EUID -ne 0 ]]; then';
const LEAVER = 'leaver_one';

let host: string;
let script: string;
const keys: Record<string, string> = {};

/** The account tools, reading and writing the fake host's files. */
const STUBS: Record<string, string> = {
  getent: `
case "$1" in
  passwd) if [[ -n "\${2:-}" ]]; then grep "^$2:" "$FAKE/passwd"; else cat "$FAKE/passwd"; fi ;;
  group) grep "^$2:" "$FAKE/group" ;;
  *) exit 2 ;;
esac`,
  id: `
if [[ "$1" == "-u" ]]; then shift; [[ "$1" == "--" ]] && shift; grep -q "^$1:" "$FAKE/passwd"; exit; fi
if [[ "$1" == "-nG" ]]; then
  n="$2"; grep -q "^$n:" "$FAKE/passwd" || exit 1
  printf '%s' "$n"
  awk -F: -v n="$n" '{c=split($4,m,","); for(i=1;i<=c;i++) if(m[i]==n) printf " %s",$1}' "$FAKE/group"
  echo; exit 0
fi
exit 2`,
  passwd: `
[[ "$1" == "-S" ]] || exit 2
echo "$3 $(cat "$FAKE/pw/$3" 2>/dev/null || echo P) 2026-01-01 0 99999 7 -1"`,
  usermod: `
case "$1" in
  -aG) touch "$FAKE/write-reached"; exit 3 ;;
  -L) echo LK > "$FAKE/pw/$3" ;;
  -s) awk -F: -v OFS=: -v n="$4" -v s="$2" '$1==n{$7=s}1' "$FAKE/passwd" > "$FAKE/passwd.new" && mv "$FAKE/passwd.new" "$FAKE/passwd" ;;
  *) exit 2 ;;
esac`,
  chage: `
case "$1" in
  -E) touch "$FAKE/expired.$4" ;;
  -l) if [[ -e "$FAKE/expired.$3" ]]; then echo "Account expires : Jan 01, 1970"; else echo "Account expires : never"; fi ;;
  *) exit 2 ;;
esac`,
  gpasswd: `
[[ "$1" == "-d" ]] || exit 2
awk -F: -v OFS=: -v n="$2" -v g="$3" '$1==g{c=split($4,m,","); o=""; for(i=1;i<=c;i++) if(m[i]!=n) o=(o==""?m[i]:o","m[i]); $4=o}1' "$FAKE/group" > "$FAKE/group.new" && mv "$FAKE/group.new" "$FAKE/group"`,
  install: `
mode=600
while [[ "$1" == -* ]]; do case "$1" in -m) mode="$2"; shift 2 ;; *) shift 2 ;; esac; done
cp -- "$1" "$2" && chmod "$mode" "$2"`,
  stat: `echo root`,
  useradd: `touch "$FAKE/write-reached"; exit 3`,
};

function makeKey(label: string): string {
  const path = join(host, `key-${label}`);
  const r = spawnSync('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', label, '-f', path], {
    encoding: 'utf-8',
    ...SPAWN_GUARD,
  });
  expect(r.status, r.stderr).toBe(0);
  return readFileSync(`${path}.pub`, 'utf-8').trim();
}

/** An account in the sudo group, with a usable password and the given keys. */
function addAccount(name: string, keyLabels: string[], opts: { keyFile?: boolean } = {}): string {
  const home = join(host, 'home', name);
  mkdirSync(join(home, '.ssh'), { recursive: true });
  const uid = 1000 + readFileSync(join(host, 'passwd'), 'utf-8').split('\n').filter(Boolean).length;
  writeFileSync(join(host, 'passwd'), `${name}:x:${uid}:${uid}::${home}:/bin/bash\n`, { flag: 'a' });
  const group = readFileSync(join(host, 'group'), 'utf-8').replace(
    /^wheel:x:10:(.*)$/m,
    (_m, members: string) => `wheel:x:10:${members ? `${members},${name}` : name}`,
  );
  writeFileSync(join(host, 'group'), group);
  if (opts.keyFile !== false) {
    writeFileSync(
      join(home, '.ssh', 'authorized_keys'),
      keyLabels.map((k) => keys[k]).join('\n') + (keyLabels.length ? '\n' : ''),
    );
  }
  return home;
}

function authorizedKeys(name: string): string {
  const path = join(host, 'home', name, '.ssh', 'authorized_keys');
  return existsSync(path) ? readFileSync(path, 'utf-8') : '';
}

function runOffboard(sudoUser = '', opts: { account?: string; shared?: string } = {}) {
  return spawnSync('bash', [script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${join(host, 'bin')}:${process.env.PATH ?? ''}`,
      FAKE: host,
      OPACC_MODE: 'offboard',
      OPACC_ACCOUNT: opts.account ?? LEAVER,
      OPACC_SHARED_ACCOUNT: opts.shared ?? 'footbag',
      SUDO_USER: sudoUser,
    },
    ...SPAWN_GUARD,
  });
}

/**
 * Create or rotate, run only as far as the key check. Every command after it
 * reaches real host state (the sudoers files, sshd, useradd), so the stand-in
 * for useradd and the one for usermod's -aG record that they were reached and
 * stop there. A run that got that far passed the key check.
 */
function runProvision(
  mode: 'create' | 'rotate',
  account: string,
  keyLine: string,
  shared = 'footbag',
  pw: { password?: string; setPassword?: 'yes' | 'no' } = {},
) {
  return spawnSync('bash', [script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${join(host, 'bin')}:${process.env.PATH ?? ''}`,
      FAKE: host,
      OPACC_MODE: mode,
      OPACC_ACCOUNT: account,
      OPACC_KEY_LINE: keyLine,
      OPACC_PASSWORD: pw.password ?? 'unused-by-these-tests',
      OPACC_SET_PASSWORD: pw.setPassword ?? 'yes',
      OPACC_SHARED_ACCOUNT: shared,
    },
    ...SPAWN_GUARD,
  });
}

/** Whether a run got past every pre-flight check to the first real write. */
function reachedTheWrite(r: { stderr: string }): boolean {
  return existsSync(join(host, 'write-reached')) || /no sudoers rule grants it/.test(r.stderr);
}

beforeEach(() => {
  host = createScratchDir('offboard-remote-host');
  mkdirSync(join(host, 'bin'));
  mkdirSync(join(host, 'pw'));
  mkdirSync(join(host, 'home'));
  writeFileSync(join(host, 'passwd'), '');
  writeFileSync(join(host, 'group'), 'wheel:x:10:\n');
  for (const [name, body] of Object.entries(STUBS)) {
    const path = join(host, 'bin', name);
    writeFileSync(path, `#!/usr/bin/env bash\nset -u\n${body}\n`);
    chmodSync(path, 0o755);
  }
  const source = readFileSync(REMOTE_HALF, 'utf-8');
  expect(source.split(ROOT_GUARD).length - 1).toBe(1);
  script = join(host, 'remote.sh');
  writeFileSync(script, source.replace(ROOT_GUARD, 'if false; then'));
  keys.leaver = makeKey('leaver');
  keys.other = makeKey('other');
});

afterEach(() => {
  rmSync(host, { recursive: true, force: true });
});

describe('the offboard sweeps a loaned key even when resumed', () => {
  it('reads the fingerprints from a key file an earlier run already moved aside', () => {
    // The stray copy sits on another named account: the shared account is
    // guarded separately, and a copy there refuses the run instead.
    addAccount('footbag', ['other']);
    const leaverHome = addAccount(LEAVER, ['leaver']);
    addAccount('other_op', ['other']);
    addAccount('stray_host', ['leaver', 'other']);
    renameSync(
      join(leaverHome, '.ssh', 'authorized_keys'),
      join(leaverHome, '.ssh', 'authorized_keys.offboarded-20260101'),
    );

    const r = runOffboard('other_op');

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('REMOVED their key from stray_host');
    expect(r.stdout).not.toContain('No keys of theirs');
    expect(authorizedKeys('stray_host')).not.toContain(keys.leaver.split(' ')[1]);
    expect(authorizedKeys('stray_host')).toContain(keys.other.split(' ')[1]);
  });

  it('refuses rather than reporting a clean sweep when none of their keys can be found', () => {
    addAccount('footbag', ['leaver', 'other']);
    addAccount(LEAVER, [], { keyFile: false });
    addAccount('other_op', ['other']);

    const r = runOffboard('other_op');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`no key of ${LEAVER}'s can be found`);
    expect(authorizedKeys('footbag')).toContain(keys.leaver.split(' ')[1]);
  });
});

describe('the offboard never sweeps the last working login off the host', () => {
  it('does not count an account whose only key belongs to the person leaving', () => {
    addAccount('helper', ['leaver']);
    addAccount(LEAVER, ['leaver']);

    const r = runOffboard();

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is the last account on this host');
    expect(authorizedKeys('helper')).toContain(keys.leaver.split(' ')[1]);
    expect(authorizedKeys(LEAVER)).toContain(keys.leaver.split(' ')[1]);
  });

  it('proceeds when another account keeps a key of its own', () => {
    addAccount('footbag', ['other']);
    addAccount(LEAVER, ['leaver']);

    const r = runOffboard();

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('1 other account(s) can still reach this host');
  });
});

describe('the offboard ends the docker grant', () => {
  it('removes the account from the docker group, which reaches root through the daemon', () => {
    // Creation adds the account to docker so the deploy's schema check can
    // read through it. Membership there is root on the host by another door,
    // so leaving it after a departure is a grant that returns the moment the
    // account is unlocked.
    writeFileSync(join(host, 'group'), 'wheel:x:10:\ndocker:x:990:\n');
    addAccount('footbag', ['other']);
    addAccount(LEAVER, ['leaver']);
    addAccount('other_op', ['other']);
    writeFileSync(
      join(host, 'group'),
      readFileSync(join(host, 'group'), 'utf-8').replace(/^docker:x:990:$/m, `docker:x:990:${LEAVER},other_op`),
    );

    const r = runOffboard('other_op');

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('OK   not a member of docker');
    const docker = readFileSync(join(host, 'group'), 'utf-8').split('\n').find((l) => l.startsWith('docker:'));
    expect(docker).toBe('docker:x:990:other_op');
  });
});

describe('the offboard ends the sudo grant', () => {
  it('removes the account from the sudo group and proves it', () => {
    addAccount('footbag', ['other']);
    addAccount(LEAVER, ['leaver']);
    addAccount('other_op', ['other']);

    const r = runOffboard('other_op');

    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain('OK   not a member of wheel');
    expect(readFileSync(join(host, 'group'), 'utf-8')).not.toMatch(new RegExp(`\\b${LEAVER}\\b`));
  });
});

describe('the offboard never sweeps a key off the shared account', () => {
  // The sweep removes the retiring account's keys from every account, the
  // shared one included. A key found in both is how a footbag-operator holder
  // who fires their own named identity would lose their own way in, and the
  // last-login count does not notice while anybody else's key remains there.
  it('refuses, changing nothing, when a key being retired is also on the shared account', () => {
    addAccount('footbag', ['leaver', 'other']);
    addAccount(LEAVER, ['leaver']);
    addAccount('other_op', ['other']);
    const groupBefore = readFileSync(join(host, 'group'), 'utf-8');

    const r = runOffboard('other_op');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain(`REFUSING: a key on ${LEAVER} is also authorized on the shared`);
    expect(r.stderr).toContain('--rotate --key-only');
    expect(r.stderr).toContain('authorize-operator-key.sh --remove');
    expect(r.stderr).toContain('Nothing done.');
    expect(authorizedKeys('footbag')).toContain(keys.leaver.split(' ')[1]);
    expect(authorizedKeys(LEAVER)).toContain(keys.leaver.split(' ')[1]);
    expect(existsSync(join(host, 'pw', LEAVER))).toBe(false);
    expect(existsSync(join(host, `expired.${LEAVER}`))).toBe(false);
    expect(readFileSync(join(host, 'group'), 'utf-8')).toBe(groupBefore);
  });

  it('refuses when the shared account name did not arrive, rather than checking against nothing', () => {
    addAccount('footbag', ['leaver', 'other']);
    addAccount(LEAVER, ['leaver']);
    addAccount('other_op', ['other']);

    const r = runOffboard('other_op', { shared: '' });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("the shared account's name did not arrive");
    expect(authorizedKeys('footbag')).toContain(keys.leaver.split(' ')[1]);
    expect(authorizedKeys(LEAVER)).toContain(keys.leaver.split(' ')[1]);
  });

  it('does not apply to the shared account itself', () => {
    addAccount('footbag', ['other']);
    addAccount('other_op', ['other', 'leaver']);

    const r = runOffboard('other_op', { account: 'footbag' });

    expect(r.stderr).not.toContain('is also authorized on the shared');
    expect(r.stderr).not.toContain("the shared account's name did not arrive");
  });
});

describe('a named account never takes a key the shared account already holds', () => {
  // Checked before anything is created or installed. A key shared between the
  // two would be swept off the shared account the day the named one retires.
  it('refuses to create an account with a key already on the shared account', () => {
    addAccount('footbag', ['other']);
    const passwdBefore = readFileSync(join(host, 'passwd'), 'utf-8');

    const r = runProvision('create', 'newcomer', keys.other);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is already');
    expect(r.stderr).toContain('authorized on the shared account footbag');
    expect(r.stderr).toContain('Nothing done.');
    expect(reachedTheWrite(r)).toBe(false);
    expect(readFileSync(join(host, 'passwd'), 'utf-8')).toBe(passwdBefore);
  });

  it('refuses a key-only rotation onto a key the shared account holds', () => {
    addAccount('footbag', ['other']);
    addAccount('named_op', ['leaver']);

    const r = runProvision('rotate', 'named_op', keys.other);

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('authorized on the shared account footbag');
    expect(reachedTheWrite(r)).toBe(false);
    expect(authorizedKeys('named_op')).toContain(keys.leaver.split(' ')[1]);
  });

  it('lets through a key that belongs to the named account alone', () => {
    addAccount('footbag', ['other']);

    const r = runProvision('create', 'newcomer', keys.leaver);

    expect(r.stderr).not.toContain('authorized on the shared account');
    expect(reachedTheWrite(r), r.stderr).toBe(true);
  });

  it('refuses when the shared account name did not arrive', () => {
    addAccount('footbag', ['other']);

    const r = runProvision('create', 'newcomer', keys.leaver, '');

    expect(r.status).toBe(1);
    expect(r.stderr).toContain("the shared account's name did not arrive");
    expect(reachedTheWrite(r)).toBe(false);
  });

  it('never replaces the shared account keys, which belong to several holders', () => {
    // The install writes authorized_keys whole with the one key given, so a
    // rotation of the shared account would remove every other holder's key.
    addAccount('footbag', ['other', 'leaver']);

    const r = runProvision('rotate', 'footbag', keys.other, 'footbag', {
      password: '',
      setPassword: 'no',
    });

    expect(r.status).toBe(1);
    expect(r.stderr).toContain('is the shared account');
    expect(r.stderr).toContain('Nothing done.');
    expect(reachedTheWrite(r)).toBe(false);
    expect(authorizedKeys('footbag')).toContain(keys.leaver.split(' ')[1]);
    expect(authorizedKeys('footbag')).toContain(keys.other.split(' ')[1]);
  });
});

describe('a key-only rotation carries no password, and needs none', () => {
  it('passes the argument check with an empty password when none is to be set', () => {
    addAccount('footbag', ['other']);
    addAccount('named_op', ['leaver']);

    const r = runProvision('rotate', 'named_op', keys.leaver, 'footbag', {
      password: '',
      setPassword: 'no',
    });

    expect(r.stderr).not.toContain('needs a password');
    expect(r.stderr).not.toContain('needs both a key line and a password');
    expect(reachedTheWrite(r), r.stderr).toBe(true);
  });

  it('still refuses a rotation that is to set a password but carries none', () => {
    addAccount('named_op', ['leaver']);

    const r = runProvision('rotate', 'named_op', keys.leaver, 'footbag', {
      password: '',
      setPassword: 'yes',
    });

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('needs a password');
    expect(reachedTheWrite(r)).toBe(false);
  });

  it('still refuses a create that carries no password, whatever it says about setting one', () => {
    const r = runProvision('create', 'newcomer', keys.leaver, 'footbag', {
      password: '',
      setPassword: 'no',
    });

    expect(r.status).toBe(2);
    expect(r.stderr).toContain('needs a password');
  });
});

/**
 * The read an operator attests against before an unreachable account of their
 * own name is rotated: the keys it accepts and whether it was retired. It must
 * change nothing, because it runs before the operator has agreed to anything.
 */
describe('the inspection of an existing account', () => {
  function runInspect(account: string) {
    return spawnSync('bash', [script], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${join(host, 'bin')}:${process.env.PATH ?? ''}`,
        FAKE: host,
        OPACC_MODE: 'inspect',
        OPACC_ACCOUNT: account,
      },
      ...SPAWN_GUARD,
    });
  }

  it('lists the keys a live account accepts, and changes nothing', () => {
    addAccount(LEAVER, ['leaver']);
    const before = authorizedKeys(LEAVER);
    const r = runInspect(LEAVER);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^SHELL \/bin\/bash$/m);
    expect(r.stdout).toMatch(/^PASSWORD P$/m);
    expect(r.stdout).toMatch(/^OFFBOARDED no$/m);
    expect(r.stdout).toMatch(/^KEY 256 SHA256:\S+ leaver \(ED25519\)$/m);
    expect(authorizedKeys(LEAVER)).toBe(before);
  });

  it('reports an account whose keys an offboard moved aside', () => {
    const home = addAccount(LEAVER, ['leaver']);
    renameSync(
      join(home, '.ssh', 'authorized_keys'),
      join(home, '.ssh', 'authorized_keys.offboarded-20260101'),
    );
    const r = runInspect(LEAVER);
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toMatch(/^OFFBOARDED yes$/m);
    expect(r.stdout).not.toMatch(/^KEY /m);
    // The keys it was retired with, so the operator reopening it sees them.
    expect(r.stdout).toMatch(/^RETIRED 256 SHA256:\S+ leaver \(ED25519\)$/m);
  });

  it('refuses an account that does not exist', () => {
    const r = runInspect('nobody_here');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('does not exist');
  });
});

/**
 * Reopening a retired account for the same person under the same name. The
 * retirement ended the keys it moved aside, so reinstating one would undo the
 * firing for whoever still holds the private half; a rehire takes a key made
 * fresh for it. Refused before anything on the host changes.
 */
describe('reopening a retired account', () => {
  function retire(): void {
    const home = addAccount(LEAVER, ['leaver']);
    renameSync(
      join(home, '.ssh', 'authorized_keys'),
      join(home, '.ssh', 'authorized_keys.offboarded-20260101'),
    );
  }

  function runReopen(mode: 'create' | 'rotate', keyLine: string) {
    return spawnSync('bash', [script], {
      encoding: 'utf-8',
      env: {
        ...process.env,
        PATH: `${join(host, 'bin')}:${process.env.PATH ?? ''}`,
        FAKE: host,
        OPACC_MODE: mode,
        OPACC_ACCOUNT: LEAVER,
        OPACC_KEY_LINE: keyLine,
        OPACC_PASSWORD: 'unused-by-these-tests',
        OPACC_SET_PASSWORD: 'yes',
        OPACC_SHARED_ACCOUNT: 'footbag',
        OPACC_REOPEN: 'yes',
      },
      ...SPAWN_GUARD,
    });
  }

  beforeEach(() => {
    addAccount('footbag', ['other']);
  });

  it('refuses a key the account was retired with, before any write', () => {
    retire();
    const r = runReopen('rotate', keys.leaver);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is a key leaver_one was retired with/);
    expect(reachedTheWrite(r)).toBe(false);
  });

  it('takes a key made fresh for the rehire', () => {
    retire();
    keys.fresh = makeKey('fresh');
    const r = runReopen('rotate', keys.fresh);
    expect(r.stderr).not.toMatch(/was retired with/);
    expect(reachedTheWrite(r)).toBe(true);
  });

  it('refuses a reopen that is not a rotation', () => {
    retire();
    keys.fresh = makeKey('fresh');
    const r = runReopen('create', keys.fresh);
    expect(r.status).toBe(2);
    expect(r.stderr).toMatch(/needs rotate mode/);
  });
});
