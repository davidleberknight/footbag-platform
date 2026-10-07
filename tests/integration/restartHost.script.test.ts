/**
 * Restarting the application stack on a deployed host, and proving it came back.
 *
 * The restart used to be a hand-typed sudo command over ssh, closing several
 * runbooks with no check that the site answered afterwards. What these pin: the
 * root-side body judges the restart on the outcome (unit active, every container
 * running and healthy, readiness answering) rather than on systemctl's exit
 * status; and the operator half refuses a missing or unknown target, a host that
 * records another environment, and an unconfirmed production restart, each
 * before anything is restarted.
 *
 * The root-side body runs here with the host's tools stubbed, as its tests seam
 * allows; the operator half runs against a stand-in ssh.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, readFileSync, existsSync, chmodSync,
} from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/restart-host-remote.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/restart-host.sh');

let workDir: string;
let binDir: string;
let envPath: string;
let callLog: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), 'footbag-test-restart-'));
  binDir = join(workDir, 'bin');
  mkdirSync(binDir);
  envPath = join(workDir, 'env');
  writeFileSync(envPath, 'FOOTBAG_ENV=test\n');
  callLog = join(workDir, 'calls.log');

  // systemctl records every call and reports the unit active unless told not to.
  writeFileSync(join(binDir, 'systemctl'), [
    '#!/usr/bin/env bash',
    `echo "systemctl $*" >> ${JSON.stringify(callLog)}`,
    'if [[ "$1" == "is-active" ]]; then exit "${UNIT_ACTIVE_EXIT:-0}"; fi',
    'exit 0',
  ].join('\n'));
  // docker answers `compose ps` with CONTAINERS (one "service state health" per
  // line) and `compose exec ... health/ready` with READY_EXIT.
  writeFileSync(join(binDir, 'docker'), [
    '#!/usr/bin/env bash',
    `echo "docker $*" >> ${JSON.stringify(callLog)}`,
    'case "$*" in',
    '  *" ps "*) printf "%b" "${CONTAINERS-web running healthy\\nworker running \\nnginx running healthy\\n}"; exit 0 ;;',
    '  *health/ready*) exit "${READY_EXIT:-0}" ;;',
    'esac',
    'exit 0',
  ].join('\n'));
  chmodSync(join(binDir, 'systemctl'), 0o755);
  chmodSync(join(binDir, 'docker'), 0o755);
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function runRemote(extraEnv: NodeJS.ProcessEnv = {}): { status: number; stdout: string; stderr: string } {
  const res = spawnSync('bash', [REMOTE_HALF], {
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH ?? ''}`,
      ENV_PATH: envPath,
      POLL_TRIES: '1',
      ...extraEnv,
    },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

function calls(): string {
  return existsSync(callLog) ? readFileSync(callLog, 'utf8') : '';
}

describe('the root-side restart', () => {
  it('restarts the service and reports success once every check holds', () => {
    const res = runRemote();
    expect(res.status, res.stderr).toBe(0);
    expect(calls()).toContain('systemctl restart footbag');
    expect(calls()).toContain('health/ready');
    expect(res.stdout).toContain('readiness answering');
  });

  // Each row is one way a restart can look done while the site is not serving:
  // the unit is not active, a container is still starting or has gone
  // unhealthy, a container is not running at all, compose reports nothing, or
  // the application never becomes ready. A check that passed any of these would
  // tell an operator the site was back when visitors were seeing errors.
  it.each([
    ['the unit is not active', { UNIT_ACTIVE_EXIT: '3' }],
    ['a container is still starting', { CONTAINERS: 'web running starting\\nworker running \\n' }],
    ['a container is unhealthy', { CONTAINERS: 'web running unhealthy\\n' }],
    ['a container has exited', { CONTAINERS: 'web running healthy\\nworker exited \\n' }],
    ['compose reports no containers', { CONTAINERS: '' }],
    ['readiness never answers', { READY_EXIT: '1' }],
  ])('fails, with the container state attached, when %s', (_label, env) => {
    const res = runRemote(env);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('did not come back healthy');
    expect(calls()).toContain('docker compose --env-file');
  });

  it('refuses without the host env file rather than restarting blind', () => {
    const res = runRemote({ ENV_PATH: join(workDir, 'absent-env') });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not readable');
    expect(calls()).not.toContain('systemctl restart');
  });
});

describe('the operator-facing restart', () => {
  /** A stand-in ssh: answers the alias lookup and the identity question, and
   *  records any other session's stdin, so a case can tell whether the restart
   *  body was ever sent. */
  function standInHost(recorded?: string): { env: NodeJS.ProcessEnv; sessions: string } {
    const stubDir = join(workDir, 'host-bin');
    mkdirSync(stubDir, { recursive: true });
    const sessions = join(workDir, 'sessions.log');
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(recorded),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.30\\nuser footbag\\n"; exit 0; fi',
      'done',
      `cat >> "${sessions}"`,
      'exit 0',
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    const pin = join(workDir, 'pin');
    writeFileSync(pin, '[203.0.113.30]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    return {
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}`, FOOTBAG_KNOWN_HOSTS: pin },
      sessions,
    };
  }

  function runOperator(args: string[], env: NodeJS.ProcessEnv = process.env) {
    const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8',
      input: 'fixture-sudo-password\n',
      env,
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  it('refuses a missing or unknown target before reaching any host', () => {
    // There is no default host: a restart that picked one would bounce the
    // environment the operator did not mean.
    const { env, sessions } = standInHost();
    for (const args of [[], ['--target', 'prod']]) {
      const res = runOperator(args, env);
      expect(res.status, args.join(' ')).toBe(1);
      expect(res.stderr).toContain('--target must be production or staging');
    }
    expect(existsSync(sessions)).toBe(false);
  });

  it('restarts staging without a prompt, sending the restart body to the host', () => {
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'staging'], env);
    expect(res.status, res.stderr).toBe(0);
    expect(readFileSync(sessions, 'utf8')).toContain('systemctl restart footbag');
  });

  it('refuses a production restart nobody confirmed at a terminal, sending nothing', () => {
    // Defect caught: production bounced from a script or an agent session with
    // no person at a terminal. The confirmation is read from the terminal, so a
    // run with none attached is refused before the restart body is sent.
    const { env, sessions } = standInHost();
    const res = runOperator(['--target', 'production'], env);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not confirmed');
    expect(existsSync(sessions) ? readFileSync(sessions, 'utf8') : '').not.toContain('systemctl restart');
  });

  it('refuses a host that records another environment before restarting anything', () => {
    // Defect caught: an ssh config pointing the staging alias at production
    // would restart the live site under a staging label.
    const { env, sessions } = standInHost('production');
    const res = runOperator(['--target', 'staging'], env);
    expect(res.status).toBe(1);
    expect(res.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
    expect(existsSync(sessions) ? readFileSync(sessions, 'utf8') : '').not.toContain('systemctl restart');
  });
});
