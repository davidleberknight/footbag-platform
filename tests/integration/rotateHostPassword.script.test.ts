/**
 * scripts/rotate-host-password.sh: replaces the shared host account's sudo
 * password over the sudo wire, and proves the host accepts the new one.
 *
 * Driven end to end against a stand-in host. The stand-in ssh client keeps the
 * host's current password in a file, answers sudo the way sudo does (accepting
 * only that password on line one of the stream), and runs the root-side body
 * for real against stand-in account tools, so chpasswd changing the password is
 * what makes the proof pass. Every argument list any stand-in receives is
 * logged, so the cases can assert neither password ever reached one. The
 * confirmation and the display of the new password need a terminal, so the
 * runs that get that far go through a pseudo-terminal typing the answer.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync, existsSync, statSync, rmSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { connectingAs, SHARED_ACCOUNT, NAMED_ACCOUNT } from '../fixtures/sshConfigStub';
import { requireToolInCI } from '../fixtures/toolAvailability';

const SCRIPT = join(process.cwd(), 'scripts/rotate-host-password.sh');
const REMOTE_HALF = join(process.cwd(), 'scripts/internal/rotate-host-password-remote.sh');
const REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');
const ROOT_GUARD = 'if [[ $EUID -ne 0 ]]; then';
const HAS_SCRIPT = requireToolInCI('script', '--version');

const CURRENT = 'stub-current-password';
const NEW = 'stub-new-password-aaaaaaaaaaaaaaaaaaaaaa';

let work: string;
let home: string;
let cred: string;

const file = (name: string) => join(work, name);
const read = (name: string) => (existsSync(file(name)) ? readFileSync(file(name), 'utf-8') : '');
const hostPassword = () => read('hostpass').trim();
const argvLog = () => read('argv.log');
const sessions = () => read('argv.log').split('\n').filter((l) => l.startsWith('ssh '));

beforeEach(() => {
  work = createScratchDir('rotate-host-password');
  home = join(work, 'home');
  mkdirSync(join(home, 'AWS'), { recursive: true });
  cred = join(home, 'AWS', 'AWS_OPERATOR.txt');
  writeFileSync(cred, `${CURRENT}\n`, { mode: 0o600 });
  writeFileSync(file('hostpass'), `${CURRENT}\n`);
  const bin = join(work, 'bin');
  mkdirSync(bin);
  const exe = (name: string, lines: string[]) =>
    writeFileSync(join(bin, name), ['#!/usr/bin/env bash', `W=${JSON.stringify(work)}`, ...lines].join('\n') + '\n', { mode: 0o755 });
  // The account tools the root-side body calls on the host.
  exe('chpasswd', [
    'echo "chpasswd $*" >> "$W/argv.log"',
    'IFS=: read -r user pass',
    '[[ -f "$W/chpasswd-fails" ]] && { echo "chpasswd: (user footbag) pam_chauthtok() failed" >&2; exit 1; }',
    'printf "%s\\n" "$pass" > "$W/hostpass"',
    'printf "%s\\n" "$user" > "$W/chpasswd-user"',
  ]);
  exe('passwd', [
    'echo "passwd $*" >> "$W/argv.log"',
    '[[ -f "$W/passwd-fails" ]] && { echo "passwd: Authentication token manipulation error" >&2; exit 1; }',
    'echo "$3 $(cat "$W/pwstatus" 2>/dev/null || echo P) 2026-01-01 0 99999 7 -1"',
  ]);
  exe('chage', [
    'echo "chage $*" >> "$W/argv.log"',
    '[[ -f "$W/chage-fails" ]] && { echo "chage: user \'footbag\' does not exist in /etc/passwd" >&2; exit 1; }',
    'echo "Last password change : Jan 01, 2026"',
  ]);
  exe('openssl', ['echo "openssl $*" >> "$W/argv.log"', `printf '%s\\n' ${JSON.stringify(NEW)}`]);
  // The host: sudo accepts only the password the host holds, on line one.
  exe('ssh-host', [
    'echo "ssh $*" >> "$W/argv.log"',
    'cmd="${!#}"',
    'IFS= read -r pass',
    'cur="$(cat "$W/hostpass")"',
    'case "$cmd" in',
    '  *footbag-host-identity*)',
    '    cat >/dev/null',
    '    [[ "$pass" == "$cur" ]] || exit 1',
    '    printf -- "---FOOTBAG-HOST-ENV---\\nstaging\\n---FOOTBAG-HOST-URL---\\n\\n---FOOTBAG-END---\\n"; exit 0 ;;',
    '  *" -v")',
    '    [[ -f "$W/unreachable" ]] && exit 255',
    '    [[ "$pass" == "$cur" ]] && exit 0 || exit 1 ;;',
    '  *" bash")',
    '    [[ "$pass" == "$cur" ]] || { cat >/dev/null; exit 1; }',
    `    sed 's/${ROOT_GUARD.replace(/[[\]$]/g, '\\$&')}/if false; then/' | SUDO_USER=footbag PATH="$W/bin:$PATH" bash; exit $? ;;`,
    'esac',
    'exit 99',
  ]);
  writeFileSync(file('known_hosts'), 'footbag-staging ssh-ed25519 AAAAstub\n', { mode: 0o600 });
});
afterEach(() => removeScratch(work));

function env(account = SHARED_ACCOUNT): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ...connectingAs(account, work),
    HOME: home,
    FOOTBAG_HOST_SSH_BIN: join(work, 'bin', 'ssh-host'),
    ROTATE_HOST_PASSWORD_OPENSSL_BIN: join(work, 'bin', 'openssl'),
    FOOTBAG_KNOWN_HOSTS: file('known_hosts'),
    FOOTBAG_CR_REPORT_TO: '',
  };
}

/** No terminal: the condition of a scheduled job or an agent session. */
function runDetached(args: string[], account = SHARED_ACCOUNT) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8', input: `${CURRENT}\n`, env: env(account), ...SPAWN_GUARD,
  });
  return { status: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

/** At a terminal, with the credential file on stdin, typing `typed`. */
function runAtTerminal(typed = 'APPLY\n', args = ['--target', 'staging']) {
  const inner = ['bash', JSON.stringify(SCRIPT), ...args.map((a) => JSON.stringify(a)), '<', JSON.stringify(cred)].join(' ');
  const r = spawnSync('script', ['-qec', `${inner}; echo "EXIT=$?"`, '/dev/null'], {
    encoding: 'utf-8', input: typed, env: env(), ...SPAWN_GUARD,
  });
  const out = r.stdout ?? '';
  const m = out.match(/EXIT=(\d+)/);
  return { status: m ? Number(m[1]) : -1, out };
}

function expectNoPasswordInArgv() {
  const log = argvLog();
  expect(log, 'the current password reached an argument list').not.toContain(CURRENT);
  expect(log, 'the new password reached an argument list').not.toContain(NEW);
}

describe('rotate-host-password.sh: refusals, each beside a run the guard lets through', () => {
  it('requires a target rather than defaulting to one', () => {
    // Defect caught: a forgotten flag rotating whichever host a default named.
    expect(runDetached([]).status).toBe(2);
    expect(runDetached(['--target', 'prod']).status).toBe(2);
    expect(sessions()).toEqual([]);
  });

  it('mints nothing and opens no session without a terminal to show the new password on', () => {
    // Defect caught: a new password generated where nobody can read it, leaving
    // a live credential that no holder has.
    const r = runDetached(['--target', 'staging']);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/no terminal: the new password is shown only on the terminal/);
    expect(sessions()).toEqual([]);
    expect(argvLog()).not.toMatch(/^openssl /m);
    expect(hostPassword()).toBe(CURRENT);
  });

  it('refuses an alias that connects as a named account, before any session', () => {
    // Defect caught: a dev-and-tester's own password replaced by a script for
    // the shared account, locking them out of their own sudo.
    const r = runDetached(['--target', 'staging'], NAMED_ACCOUNT);
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/connects as 'ada_lovelace', a named account/);
    expect(sessions()).toEqual([]);
  });
});

describe.skipIf(!HAS_SCRIPT)('rotate-host-password.sh: the rotation', () => {
  it('changes the password, proves sudo accepts the new one, files it, and shows it on the terminal', () => {
    // Defects caught: a run reporting success on a host still taking the old
    // password; a new password the operator never receives; the credential file
    // left holding a password the host now refuses; either password on a
    // command line.
    const r = runAtTerminal();
    expect(r.status, r.out).toBe(0);
    expect(hostPassword()).toBe(NEW);
    expect(read('chpasswd-user').trim()).toBe('footbag');
    expect(readFileSync(cred, 'utf-8')).toBe(`${NEW}\n`);
    expect(statSync(cred).mode & 0o777).toBe(0o600);
    expect(r.out).toContain(NEW);
    // The identity check, the change, and the proof: the proof is a sudo -v
    // session, and it ran after the change.
    const s = sessions();
    expect(s.length).toBe(3);
    expect(s[1]).toMatch(/sudo -k -S -p "" bash$/);
    expect(s[2]).toMatch(/sudo -k -S -p "" -v$/);
    expectNoPasswordInArgv();
  });

  it('changes nothing without the typed APPLY', () => {
    // Defect caught: the host's password replaced with nobody confirming.
    const r = runAtTerminal('apply\n');
    expect(r.status).toBe(1);
    expect(hostPassword()).toBe(CURRENT);
    expect(readFileSync(cred, 'utf-8')).toBe(`${CURRENT}\n`);
    expect(sessions().length).toBe(1);
    expect(r.out).not.toContain(NEW);
  });

  it('refuses a current password the host does not accept, before changing anything', () => {
    // Defect caught: a rotation attempted with a credential file that is
    // already wrong, which leaves no proven password to fall back on.
    writeFileSync(file('hostpass'), 'something-else\n');
    const r = runAtTerminal();
    expect(r.status).toBe(1);
    expect(sessions().length).toBe(1);
    expect(readFileSync(cred, 'utf-8')).toBe(`${CURRENT}\n`);
  });

  it('reports a change the host did not make, leaving the credential file as it was', () => {
    // Defect caught: a failed chpasswd followed by the new password written
    // into the credential file, so every later run fails sudo.
    writeFileSync(file('chpasswd-fails'), '');
    const r = runAtTerminal();
    expect(r.status).toBe(1);
    expect(hostPassword()).toBe(CURRENT);
    expect(readFileSync(cred, 'utf-8')).toBe(`${CURRENT}\n`);
    expect(r.out).toMatch(/still accepts the current password and refuses the new one/);
    expectNoPasswordInArgv();
  });

  it('shows the new password when it cannot prove which one the host takes, and files neither', () => {
    // Defect caught: a change that may have landed, with its password dropped
    // because the proof could not reach the host, leaving nobody holding it.
    writeFileSync(file('unreachable'), '');
    const r = runAtTerminal();
    expect(r.status).toBe(1);
    expect(hostPassword()).toBe(NEW);
    expect(r.out).toContain(NEW);
    expect(r.out).toMatch(/could not prove which password footbag-staging accepts now/);
    expect(readFileSync(cred, 'utf-8')).toBe(`${CURRENT}\n`);
  });

  it('writes the new password to the terminal device only', () => {
    // Defect caught: the password printed on stdout, which a wrapper, a CI job
    // or an agent session may be capturing. Every line naming it is a value
    // assignment, the wire, the file write, the proof, or the terminal display.
    const source = readFileSync(SCRIPT, 'utf-8');
    const body = source.slice(source.indexOf('show_new_password() {'));
    const fn = body.slice(0, body.indexOf('\n}\n'));
    expect(fn).toMatch(/printf '    %s\\n' "\$NEW_PASS"/);
    expect(fn).toMatch(/\n {2}\} > \/dev\/tty$/);
    const uses = source.split('\n').filter((l) => l.includes('"$NEW_PASS"') && !/^\s*#/.test(l));
    expect(uses.length).toBeGreaterThan(0);
    for (const l of uses) {
      expect(l, l).toMatch(/printf '    %s\\n'|RHP_NEW=%q|> "\$OPERATOR_CREDENTIAL_FILE"|sudo_answers "\$NEW_PASS"|\[\[ .*"\$NEW_PASS" == /);
    }
  });
});

describe('rotate-host-password-remote.sh: the root-side body', () => {
  function runHalf(sudoUser: string, account: string, password: string) {
    const body = readFileSync(REMOTE_HALF, 'utf-8');
    expect(body.split(ROOT_GUARD).length - 1).toBe(1);
    const half = file('half.sh');
    writeFileSync(half, readFileSync(REPORT_LIB, 'utf-8') + body.replace(ROOT_GUARD, 'if false; then'));
    const r = spawnSync('bash', [half], {
      encoding: 'utf-8',
      env: { ...process.env, PATH: `${join(work, 'bin')}:${process.env.PATH ?? ''}`, SUDO_USER: sudoUser, RHP_ACCOUNT: account, RHP_NEW: password },
      ...SPAWN_GUARD,
    });
    return { status: r.status, err: r.stderr ?? '' };
  }

  it('changes the password only of the account sudo authenticated, and only when it is the one named', () => {
    // Defect caught: the shared account's password replaced from a session
    // authenticated as someone else, or a named account's replaced from here.
    expect(runHalf('ada_lovelace', 'footbag', NEW).status).toBe(1);
    expect(runHalf('root', 'root', NEW).status).toBe(1);
    expect(hostPassword()).toBe(CURRENT);
    const ok = runHalf('footbag', 'footbag', NEW);
    expect(ok.status, ok.err).toBe(0);
    expect(hostPassword()).toBe(NEW);
  });

  it('fails when the password it set does not read as usable', () => {
    // Defect caught: a locked account, whose sudo every later run depends on,
    // reported as a successful change.
    writeFileSync(file('pwstatus'), 'L');
    const r = runHalf('footbag', 'footbag', NEW);
    expect(r.status).toBe(1);
    expect(r.err).toMatch(/password status of footbag is 'L', not a usable password/);
  });

  it('reports the account tools\' own messages when they fail, rather than discarding them', () => {
    // Defect caught: a failed status or age read reported with its cause
    // thrown away, or a failed age read passing silently as "not expired".
    writeFileSync(file('passwd-fails'), '');
    const status = runHalf('footbag', 'footbag', NEW);
    expect(status.status).toBe(1);
    expect(status.err).toMatch(/ERROR the password status of footbag could not be read.*passwd said: passwd: Authentication token manipulation error/);
    rmSync(file('passwd-fails'));
    writeFileSync(file('chage-fails'), '');
    const age = runHalf('footbag', 'footbag', NEW);
    expect(age.status, age.err).toBe(0);
    expect(age.err).toMatch(/WARN the password age of footbag could not be read.*chage said: chage: user 'footbag' does not exist/);
  });

  it('refuses an empty password or one chpasswd would split, before setting anything', () => {
    // Defect caught: an empty or colon-bearing value setting a password nobody
    // generated.
    expect(runHalf('footbag', 'footbag', '').status).toBe(1);
    expect(runHalf('footbag', 'footbag', 'a:b').status).toBe(1);
    expect(hostPassword()).toBe(CURRENT);
  });
});
