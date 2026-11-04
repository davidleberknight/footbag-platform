/**
 * A deploy refuses a host whose tools are not the pinned versions.
 *
 * The deploy, the backup and the restore call the host's sqlite3 and docker, the
 * stack starts through the Compose plugin, and the host's operating-system
 * release decides which docker build it carries. A deploy onto a host that has
 * drifted from the version list runs code tested against other versions, so the
 * deploy's host half compares all four with the pins the workstation sent, names
 * every difference, and stops before it changes anything. Which list the
 * workstation reads them from is driven in the production preflight suite. The comparison is driven here against stand-in tools; the last group
 * pins that the deploy actually ships the comparison and runs it first.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { readFileSync, rmSync, writeFileSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';

const LIB = join(process.cwd(), 'scripts/internal/host-tool-versions-remote.sh');

const PINS = {
  EXPECTED_SQLITE_VERSION: '3.51.2',
  EXPECTED_DOCKER_ENGINE: '25.0.16-1.amzn2023.0.5',
  // The list pins the release tag, with its leading v.
  EXPECTED_COMPOSE_VERSION: 'v5.1.0',
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
function host(versions: { sqlite?: string; docker?: string; compose?: string; release?: string }): NodeJS.ProcessEnv {
  const sqlite = join(dir, 'sqlite3');
  writeFileSync(sqlite, `#!/usr/bin/env bash\necho "${versions.sqlite ?? PINS.EXPECTED_SQLITE_VERSION} 2026-01-09 00:00:00 abc"\n`);
  chmodSync(sqlite, 0o755);
  const rpm = join(dir, 'rpm');
  writeFileSync(rpm, `#!/usr/bin/env bash\nprintf '%s' "${versions.docker ?? PINS.EXPECTED_DOCKER_ENGINE}"\n`);
  chmodSync(rpm, 0o755);
  // Answers only `docker compose version --short`, as the plugin does: the bare
  // number, without the tag's leading v. Asked anything else it fails, so a
  // check asking the wrong question reads nothing.
  const docker = join(dir, 'docker');
  const compose = versions.compose ?? PINS.EXPECTED_COMPOSE_VERSION.replace(/^v/, '');
  writeFileSync(docker, `#!/usr/bin/env bash\n[[ "$*" == "compose version --short" ]] || exit 1\necho "${compose}"\n`);
  chmodSync(docker, 0o755);
  const release = join(dir, 'amazon-linux-release');
  writeFileSync(release, `Amazon Linux release ${versions.release ?? PINS.EXPECTED_AMAZON_LINUX_RELEASE} (Amazon Linux)\n`);
  return { HOST_SQLITE3_BIN: sqlite, HOST_RPM_BIN: rpm, HOST_DOCKER_BIN: docker, AL_RELEASE_FILE: release };
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

  // Defect caught: a host whose Compose plugin was replaced or never installed
  // takes the deploy, and the stack is started by a Compose the release was
  // never proved against.
  it('refuses a host whose Compose plugin differs, naming it', () => {
    const res = check(host({ compose: '2.29.1' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Compose plugin is v2.29.1');
  });

  // Defect caught: a host with no Compose plugin at all passes, because an
  // empty answer is never compared.
  it('refuses a host with no Compose plugin', () => {
    const res = check(host({ compose: '' }));
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('Compose plugin is missing');
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
    const res = check(host({ sqlite: '3.40.0', docker: '24.0.0-1', compose: '2.0.0', release: '2023.1.1' }));
    expect(res.status).toBe(1);
    expect(res.stderr.match(/^ERROR:/gm)).toHaveLength(4);
  });

  // Defect caught: a sender that forgot a pin turned the comparison into
  // "anything goes" for that tool.
  it('refuses when any pin was not sent', () => {
    for (const key of Object.keys(PINS)) {
      const res = check(host({}), { ...PINS, [key]: '' });
      expect(res.status, key).toBe(1);
      expect(res.stderr, key).toContain(`${key} was not sent`);
    }
  });

  // Defect caught: a run against stand-in tools reads as a statement about a host.
  it('says when a stand-in tool is in use', () => {
    expect(check(host({})).stderr).toContain('SYNTHETIC: HOST_SQLITE3_BIN is set');
  });
});

/**
 * Both deploys that ship onto a host. The disk preflight is the first statement
 * each remote half executes after its definitions, the env reconcile its first
 * write to the host, and rsync its promotion; the shipping line is the one
 * stream the helper must travel on, ahead of the half.
 */
const DEPLOYS = [
  {
    sender: 'scripts/deploy-code.sh', remote: 'scripts/internal/deploy-code-remote.sh',
    steps: ['SRV_AVAIL_KB=', '\nseed_committed_host_config apply', '\nsystemctl ', 'rsync '],
    ships: /cat "\$REMOTE_REPORT_LIB" "\$PRUNE_LIB" "\$HOST_TOOL_VERSIONS_LIB" "\$HOST_VALUES_LIB" "\$REMOTE_HALF"/,
  },
  {
    sender: 'scripts/deploy-rebuild.sh', remote: 'scripts/internal/deploy-rebuild-remote.sh',
    steps: ['SRV_AVAIL_KB=', '\nseed_committed_host_config apply', 'rsync '],
    ships: /cat "\$REMOTE_REPORT_LIB" "\$CUTOVER_GUARD" "\$PROD_LIVE_GUARD" "\$HOST_TOOL_VERSIONS_LIB" "\$HOST_VALUES_LIB" "\$REMOTE_HALF"/,
  },
];

describe('the deploy runs the comparison before it changes anything', () => {
  const strip = (rel: string) => readFileSync(join(process.cwd(), rel), 'utf8').replace(/^\s*#.*$/gm, '');

  // Defect caught: the comparison exists but the deploy never calls it, or calls
  // it after the first change to the host, so a drifted host is half-deployed.
  it.each(DEPLOYS)('$remote calls it ahead of the first step that touches the host', ({ remote, steps }) => {
    const text = strip(remote);
    const call = text.indexOf('if ! host_tool_versions_match; then');
    expect(call, 'the remote half never calls the comparison').toBeGreaterThan(-1);
    for (const step of steps) {
      const at = text.indexOf(step);
      expect(at, `${step.trim()} not found`).toBeGreaterThan(-1);
      expect(call, `the comparison runs after ${step.trim()}`).toBeLessThan(at);
    }
  });

  // Defect caught: the host half compares against pins the sender never sent, or
  // the helper never travels, so the call fails as an unknown command and the
  // deploy refuses every host.
  it.each(DEPLOYS)('$sender sends the four pins and ships the helper', ({ sender, ships }) => {
    const text = strip(sender);
    for (const key of Object.keys(PINS)) {
      expect(text, `${key} is not sent`).toContain(`printf '${key}=%q\\n'`);
    }
    expect(text).toMatch(ships);
    expect(text).toContain('HOST_TOOL_VERSIONS_LIB="${SCRIPT_DIR}/internal/host-tool-versions-remote.sh"');
  });
});
