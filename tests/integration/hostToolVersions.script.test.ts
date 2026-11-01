/**
 * A deploy refuses a host whose tools are not the pinned versions.
 *
 * The deploy, the backup and the restore call the host's sqlite3 and docker, and
 * the host's operating-system release decides which docker build it carries. A
 * deploy onto a host that has drifted from the version list runs code tested
 * against other versions, so the deploy's host half compares all three with the
 * pins the workstation sent, names every difference, and stops before it changes
 * anything. The comparison is driven here against stand-in tools; the last group
 * pins that the deploy actually ships the comparison and runs it first.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/internal/host-tool-versions-remote.sh');
const REMOTE_HALF = join(process.cwd(), 'scripts/internal/deploy-code-remote.sh');
const SENDER = join(process.cwd(), 'scripts/deploy-code.sh');

const PINS = {
  EXPECTED_SQLITE_VERSION: '3.51.2',
  EXPECTED_DOCKER_ENGINE: '25.0.16-1.amzn2023.0.5',
  EXPECTED_AMAZON_LINUX_RELEASE: '2023.12.20261021',
};

let dir: string;

beforeEach(() => {
  dir = createScratchDir('host-tool-versions');
});
afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

/** Stand-ins answering as a host at the given versions. */
function host(versions: { sqlite?: string; docker?: string; release?: string }): NodeJS.ProcessEnv {
  const sqlite = join(dir, 'sqlite3');
  writeFileSync(sqlite, `#!/usr/bin/env bash\necho "${versions.sqlite ?? PINS.EXPECTED_SQLITE_VERSION} 2026-01-09 00:00:00 abc"\n`);
  chmodSync(sqlite, 0o755);
  const rpm = join(dir, 'rpm');
  writeFileSync(rpm, `#!/usr/bin/env bash\nprintf '%s' "${versions.docker ?? PINS.EXPECTED_DOCKER_ENGINE}"\n`);
  chmodSync(rpm, 0o755);
  const release = join(dir, 'amazon-linux-release');
  writeFileSync(release, `Amazon Linux release ${versions.release ?? PINS.EXPECTED_AMAZON_LINUX_RELEASE} (Amazon Linux)\n`);
  return { HOST_SQLITE3_BIN: sqlite, HOST_RPM_BIN: rpm, AL_RELEASE_FILE: release };
}

function check(env: NodeJS.ProcessEnv, pins: Partial<typeof PINS> = PINS) {
  const res = spawnSync('bash', ['-c', `source "${LIB}"; host_tool_versions_match`], {
    env: { PATH: process.env.PATH ?? '', ...pins, ...env },
    encoding: 'utf8',
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stderr: res.stderr ?? '' };
}

describe('comparing the host\'s tools with the pins the deploy sent', () => {
  // Defect caught: a host at exactly the pinned versions is refused, so no
  // deploy can ever reach a correctly bootstrapped host.
  it('accepts a host whose sqlite3, docker and release all match', () => {
    const res = check(host({}));
    expect(res.status).toBe(0);
    expect(res.stderr).not.toContain('ERROR');
  });

  // Defect caught: a host carrying the distribution's older sqlite3 takes the
  // deploy, and the backup and restore then run a sqlite3 nothing was tested with.
  it('refuses a host whose sqlite3 differs, naming it', () => {
    const res = check(host({ sqlite: '3.40.0' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain("sqlite3 is 3.40.0");
  });

  // Defect caught: a hand-run package update moved docker, and the deploy runs
  // the stack on an engine the release was never proved against.
  it('refuses a host whose docker package differs, naming it', () => {
    const res = check(host({ docker: '25.0.14-1.amzn2023.0.1' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('docker package is 25.0.14-1.amzn2023.0.1');
  });

  // Defect caught: a host stepped to another Amazon Linux release, or left
  // half-stepped, takes the deploy as if nothing had changed.
  it('refuses a host on another Amazon Linux release, naming it', () => {
    const res = check(host({ release: '2023.11.20260901' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Amazon Linux 2023.11.20260901');
  });

  // Defect caught: an operator fixing differences one deploy at a time, because
  // the check stopped at the first one it found.
  it('names every difference in one run', () => {
    const res = check(host({ sqlite: '3.40.0', docker: '24.0.0-1', release: '2023.1.1' }));
    expect(res.status).toBe(1);
    expect(res.stderr.match(/^ERROR:/gm)).toHaveLength(3);
  });

  // Defect caught: a sender that forgot a pin turned the comparison into
  // "anything goes" for that tool.
  it('refuses when a pin was not sent', () => {
    const res = check(host({}), { ...PINS, EXPECTED_DOCKER_ENGINE: '' });
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('EXPECTED_DOCKER_ENGINE was not sent');
  });

  // Defect caught: a run against stand-in tools reads as a statement about a host.
  it('says when a stand-in tool is in use', () => {
    expect(check(host({})).stderr).toContain('SYNTHETIC: HOST_SQLITE3_BIN is set');
  });
});

describe('the deploy runs the comparison before it changes anything', () => {
  const remote = readFileSync(REMOTE_HALF, 'utf8').replace(/^\s*#.*$/gm, '');
  const sender = readFileSync(SENDER, 'utf8').replace(/^\s*#.*$/gm, '');

  // Defect caught: the comparison exists but the deploy never calls it, or calls
  // it after the first change to the host, so a drifted host is half-deployed.
  it('calls it ahead of the first step that touches the host', () => {
    const call = remote.indexOf('if ! host_tool_versions_match; then');
    expect(call, 'the remote half never calls the comparison').toBeGreaterThan(-1);
    // The disk preflight is the first statement the half executes after its
    // definitions, and the env reconcile is its first write to the host.
    for (const step of ['SRV_AVAIL_KB=', '\nseed_committed_host_config apply', '\nsystemctl ', 'rsync ']) {
      const at = remote.indexOf(step);
      expect(at, `${step.trim()} not found`).toBeGreaterThan(-1);
      expect(call, `the comparison runs after ${step.trim()}`).toBeLessThan(at);
    }
  });

  // Defect caught: the host half compares against pins the sender never sent, or
  // the helper never travels, so the call fails as an unknown command.
  it('sends the three pins from the version list and ships the helper', () => {
    expect(sender).toMatch(/tool_pins_ok SQLITE_VERSION DOCKER_ENGINE_HOST AMAZON_LINUX_RELEASE \|\| exit 1/);
    for (const key of Object.keys(PINS)) {
      expect(sender, `${key} is not sent`).toContain(`printf '${key}=%q\\n'`);
    }
    expect(sender).toMatch(/cat "\$PRUNE_LIB" "\$HOST_TOOL_VERSIONS_LIB" "\$HOST_VALUES_LIB" "\$REMOTE_HALF"/);
  });
});
