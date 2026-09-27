/**
 * scripts/internal/change-own-password-remote.sh — a named operator replacing the
 * one-time password of their own host account, run for real against stub tools.
 *
 * Whose password changes is decided by sudo, not by the caller: it is the
 * account that authenticated. So the cases pin that root and the shared account
 * are refused whatever else arrives, that a short password is refused before
 * anything is set, and that a set password is proved usable and not expired
 * rather than assumed. The account tools are stand-ins recording what they were
 * given; the one line changed before running is the refusal to run unless root,
 * asserted present exactly once.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { writeFileSync, readFileSync, chmodSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/change-own-password-remote.sh');
const ROOT_GUARD = 'if [[ $EUID -ne 0 ]]; then';

let host: string;
let script: string;

const STUBS: Record<string, string> = {
  chpasswd: 'cat > "$FAKE/chpasswd.in"',
  passwd: 'echo "$3 $(cat "$FAKE/status" 2>/dev/null || echo P) 2026-01-01 0 99999 7 -1"',
  chage: '[[ -e "$FAKE/expired" ]] && echo "Last password change : password must be changed" || echo "Last password change : Jan 01, 2026"',
};

beforeEach(() => {
  host = createScratchDir('chpw-remote');
  mkdirSync(join(host, 'bin'));
  for (const [name, body] of Object.entries(STUBS)) {
    const path = join(host, 'bin', name);
    writeFileSync(path, `#!/usr/bin/env bash\n${body}\n`);
    chmodSync(path, 0o755);
  }
  const source = readFileSync(REMOTE_HALF, 'utf-8');
  expect(source.split(ROOT_GUARD).length - 1).toBe(1);
  script = join(host, 'remote.sh');
  writeFileSync(script, source.replace(ROOT_GUARD, 'if false; then'));
});

afterEach(() => {
  removeScratch(host);
});

function run(sudoUser: string, newPassword: string) {
  const r = spawnSync('bash', [script], {
    encoding: 'utf-8',
    env: {
      ...process.env,
      PATH: `${join(host, 'bin')}:${process.env.PATH ?? ''}`,
      FAKE: host,
      SUDO_USER: sudoUser,
      CHPW_NEW: newPassword,
    },
    ...SPAWN_GUARD,
  });
  return { status: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
}

const chpasswdInput = (): string | null =>
  existsSync(join(host, 'chpasswd.in')) ? readFileSync(join(host, 'chpasswd.in'), 'utf-8') : null;

describe('changing your own password on the host', () => {
  it('sets the new password for the account sudo authenticated, through stdin', () => {
    const r = run('james_leberknight', 'a-password-of-his-own');
    expect(r.status, r.stderr).toBe(0);
    expect(chpasswdInput()).toBe('james_leberknight:a-password-of-his-own\n');
    expect(r.stdout).toMatch(/set, usable and not expired/);
  });

  it('refuses the shared account, whose password is never set from here', () => {
    const r = run('footbag', 'a-password-of-his-own');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/REFUSING/);
    expect(chpasswdInput()).toBeNull();
  });

  it('refuses root, and a run nobody authenticated', () => {
    expect(run('root', 'a-password-of-his-own').status).toBe(1);
    expect(run('', 'a-password-of-his-own').status).toBe(1);
    expect(chpasswdInput()).toBeNull();
  });

  it('refuses a password shorter than 12 characters before setting anything', () => {
    const r = run('james_leberknight', 'short-11chr');
    expect(r.status).toBe(2);
    expect(chpasswdInput()).toBeNull();
  });

  it('fails when the password it set is not usable', () => {
    writeFileSync(join(host, 'status'), 'L');
    const r = run('james_leberknight', 'a-password-of-his-own');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/not a usable password/);
  });

  it('fails when the password it set is expired', () => {
    writeFileSync(join(host, 'expired'), '');
    const r = run('james_leberknight', 'a-password-of-his-own');
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/is expired/);
  });
});
