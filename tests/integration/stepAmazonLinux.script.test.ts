/**
 * Stepping a host to the pinned Amazon Linux release.
 *
 * The contract: the root-side body judges the step by the release the host then
 * reports, not by the package manager's exit status; a host already at the pin
 * is left alone; the status mode changes nothing. The operator half refuses a
 * missing or unknown target, a host recording another environment, and an
 * unconfirmed production step, each before anything is sent.
 *
 * The root-side body runs here with the host's tools stubbed; the operator half
 * runs against a stand-in ssh.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/step-amazon-linux-remote.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/step-amazon-linux.sh');
const PIN = '2023.12.20261021';

let dir: string;
let bin: string;
let releaseFile: string;
let callLog: string;

beforeEach(() => {
  dir = createScratchDir('step-al');
  bin = join(dir, 'bin');
  mkdirSync(bin);
  releaseFile = join(dir, 'amazon-linux-release');
  callLog = join(dir, 'calls.log');
});

afterEach(() => removeScratch(dir));

/** dnf that records its calls; an upgrade lands `lands` in the release file. */
function stubDnf(lands: string): void {
  writeFileSync(join(bin, 'dnf'), [
    '#!/usr/bin/env bash',
    `echo "dnf $*" >> ${JSON.stringify(callLog)}`,
    `[[ "$1" == upgrade ]] && echo "Amazon Linux release ${lands} (Amazon Linux)" > ${JSON.stringify(releaseFile)}`,
    'exit 0',
  ].join('\n'));
  chmodSync(join(bin, 'dnf'), 0o755);
}

function runRemote(mode: string, release: string) {
  writeFileSync(releaseFile, `Amazon Linux release ${release} (Amazon Linux)\n`);
  const r = spawnSync('bash', ['-s'], {
    input: `MODE=${mode}\nAMAZON_LINUX_RELEASE=${PIN}\nAL_RELEASE_FILE=${releaseFile}\n` + readFileSync(REMOTE_HALF, 'utf-8'),
    encoding: 'utf-8',
    env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}` },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') };
}
const calls = (): string => (existsSync(callLog) ? readFileSync(callLog, 'utf-8') : '');

describe('the root-side step', () => {
  it('steps a host on another release and proves it reports the pin', () => {
    stubDnf(PIN);
    const r = runRemote('step', '2023.6.20241010');
    expect(r.status, r.out).toBe(0);
    expect(calls()).toContain(`dnf upgrade -y --releasever=${PIN}`);
    expect(r.out).toContain(`Amazon Linux ${PIN} verified`);
  });

  it('fails when the upgrade did not land the pinned release', () => {
    // Defect caught: the step reads done because dnf exited 0, while the host
    // still runs the old release and its old packages.
    stubDnf('2023.6.20241010');
    const r = runRemote('step', '2023.6.20241010');
    expect(r.status).toBe(1);
    expect(r.out).toMatch(/not 2023\.12\.20261021/);
  });

  it('leaves a host at the pin alone, and the status mode changes nothing', () => {
    stubDnf(PIN);
    expect(runRemote('step', PIN).out).toMatch(/nothing to do/);
    const status = runRemote('status', '2023.6.20241010');
    expect(status.status).toBe(0);
    expect(status.out).toContain('verdict: differs from the pin');
    expect(calls()).not.toMatch(/dnf upgrade/);
  });
});

describe('the operator half', () => {
  function standInHost(recorded?: string): { env: NodeJS.ProcessEnv; sessions: string } {
    const sessions = join(dir, 'sessions.log');
    writeFileSync(join(bin, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(recorded),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.30\\nuser footbag\\n"; exit 0; fi',
      'done',
      `cat >> "${sessions}"`,
      'exit 0',
    ].join('\n'));
    chmodSync(join(bin, 'ssh'), 0o755);
    const pin = join(dir, 'pin');
    writeFileSync(pin, '[203.0.113.30]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    return { env: { ...process.env, PATH: `${bin}:${process.env.PATH ?? ''}`, FOOTBAG_KNOWN_HOSTS: pin }, sessions };
  }
  function runOperator(args: string[], env: NodeJS.ProcessEnv) {
    const r = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8', input: 'fixture-sudo-password\n', env, ...SPAWN_GUARD,
    });
    return { status: r.status ?? -1, stderr: r.stderr ?? '' };
  }
  const sent = (s: string): string => (existsSync(s) ? readFileSync(s, 'utf8') : '');

  it('refuses a missing or unknown target before reaching any host', () => {
    const { env, sessions } = standInHost();
    for (const args of [[], ['--target', 'prod']]) {
      const r = runOperator(args, env);
      expect(r.status, args.join(' ')).toBe(1);
      expect(r.stderr).toContain('--target must be production or staging');
    }
    expect(existsSync(sessions)).toBe(false);
  });

  it('steps staging without a prompt, sending the pinned release with the body', () => {
    const { env, sessions } = standInHost();
    const r = runOperator(['--target', 'staging'], env);
    expect(r.status, r.stderr).toBe(0);
    expect(sent(sessions)).toContain(`AMAZON_LINUX_RELEASE=${PIN}`);
    expect(sent(sessions)).toContain('dnf upgrade -y --releasever=');
  });

  it('refuses a production step nobody confirmed at a terminal, and a host recording another environment', () => {
    // Defect caught: production's operating system moved from a script or an
    // agent session with no person at a terminal; or a staging alias pointing at
    // production steps the live host under a staging label.
    const { env, sessions } = standInHost();
    const prod = runOperator(['--target', 'production'], env);
    expect(prod.status).toBe(1);
    expect(prod.stderr).toContain('not confirmed');
    const wrong = standInHost('production');
    const mislabelled = runOperator(['--target', 'staging'], wrong.env);
    expect(mislabelled.status).toBe(1);
    expect(mislabelled.stderr).toMatch(/records FOOTBAG_ENV=production, but this run is --target staging/);
    expect(sent(sessions)).not.toContain('dnf upgrade');
  });
});
