/**
 * scripts/crash-loop-breaker.sh: a container that keeps failing after it has
 * started is stopped and kept stopped until an operator clears it. Driven end
 * to end against a stand-in Docker client and systemctl, and a scratch state
 * directory holding the failures the container monitor records.
 *
 * The rule under test: five failures inside thirty minutes trips a container;
 * web or nginx takes the whole site down to the maintenance page, the worker or
 * the image processor is stopped alone so the site stays up; the main unit's
 * start refuses while the site is tripped and stops a tripped worker or image
 * again after it brings the stack up.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/crash-loop-breaker.sh');
const NOW = 1_800_000_000;
const WINDOW = 30 * 60;

let dir: string;
let stateDir: string;
let calls: string;
let running: string;

// Stands in for the Docker client: `ps` lists the running containers named in
// the RUNNING file, and `stop` removes one from it, as a real stop would.
const DOCKER_STUB = `#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
case "$1" in
  ps)
    svc=""
    for arg in "$@"; do [[ "$arg" == label=com.docker.compose.service=* ]] && svc="\${arg#label=com.docker.compose.service=}"; done
    grep -qx "$svc" "$RUNNING" && echo "id-$svc"
    exit 0 ;;
  stop)
    [[ -n "\${STOP_FAIL:-}" ]] && { echo "Error response from daemon: cannot stop" >&2; exit 1; }
    id="\${!#}"
    grep -vx "\${id#id-}" "$RUNNING" > "$RUNNING.new" || true
    mv "$RUNNING.new" "$RUNNING" ;;
esac
`;

const SYSTEMCTL_STUB = `#!/usr/bin/env bash
echo "systemctl $*" >> "$CALLS"
case "$1" in
  is-active) [[ "\${STACK_ACTIVE:-1}" == 1 ]] ;;
  stop) exit 0 ;;
  *) echo "unexpected systemctl $*" >&2; exit 2 ;;
esac
`;

function run(mode: string, env: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT, mode], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CALLS: calls,
      RUNNING: running,
      STATE_DIRECTORY: stateDir,
      FOOTBAG_ENV: 'staging',
      FOOTBAG_BREAKER_DOCKER_BIN: join(dir, 'docker'),
      FOOTBAG_BREAKER_SYSTEMCTL_BIN: join(dir, 'systemctl'),
      FOOTBAG_BREAKER_NOW: String(NOW),
      ...env,
    },
    ...SPAWN_GUARD,
  });
  const log = existsSync(calls) ? readFileSync(calls, 'utf8') : '';
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', calls: log };
}

const exits = (...lines: [number, string, number][]) =>
  writeFileSync(join(stateDir, 'exits'), lines.map(([t, s, n]) => `${t} ${s} ${n}\n`).join(''));
const marker = () => {
  const p = join(stateDir, 'crash-loop-tripped');
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
};
const trip = (svc: string) =>
  writeFileSync(join(stateDir, 'crash-loop-tripped'), `container=${svc}\ntripped_at=${NOW - 600}\nfailures=5\n`);
const runningNow = () => readFileSync(running, 'utf8').split('\n').filter(Boolean);

beforeEach(() => {
  dir = createScratchDir('crash-loop-breaker');
  stateDir = join(dir, 'state');
  calls = join(dir, 'calls.log');
  running = join(dir, 'running');
  mkdirSync(stateDir);
  writeFileSync(running, 'nginx\nweb\nworker\nimage\n');
  writeFileSync(join(dir, 'docker'), DOCKER_STUB);
  writeFileSync(join(dir, 'systemctl'), SYSTEMCTL_STUB);
  chmodSync(join(dir, 'docker'), 0o755);
  chmodSync(join(dir, 'systemctl'), 0o755);
});

afterEach(() => removeScratch(dir));

describe('crash-loop-breaker.sh --check', () => {
  it('leaves a container with four failures in the window running', () => {
    // Defect caught: occasional crashes the restart policy is meant to heal
    // taking the site down.
    exits([NOW - 60, 'web', 2], [NOW - 1200, 'web', 2]);
    const res = run('--check');
    expect(res.status, res.stderr).toBe(0);
    expect(marker()).toBeNull();
    expect(res.calls).not.toMatch(/stop/);
    expect(runningNow()).toEqual(['nginx', 'web', 'worker', 'image']);
  });

  it('stops the whole site when web reaches five failures in the window, and records the trip', () => {
    // Defect caught: a web container crashing after every start cycling
    // without end, the loop the owner ruled unacceptable.
    exits([NOW - 60, 'web', 1], [NOW - 120, 'web', 3], [NOW - 1700, 'web', 1]);
    const res = run('--check');
    expect(res.status, res.stderr).toBe(0);
    expect(res.calls).toContain('systemctl stop --no-block footbag.service');
    expect(marker()).toBe(`container=web\ntripped_at=${NOW}\nfailures=5\n`);
    expect(res.stderr).toMatch(/web container failed 5 times in 30 minutes and is tripped/);
    expect(res.stderr).toContain('bash scripts/crash-loop-host.sh --target staging --clear');
  });

  it('stops only the image container when it reaches the limit, leaving the site up', () => {
    // Defect caught: a photo-processing loop taking every page down with it,
    // or the trip recorded while the looping container keeps running.
    exits([NOW - 30, 'image', 5], [NOW - 30, 'web', 1]);
    const res = run('--check');
    expect(res.status, res.stderr).toBe(0);
    expect(res.calls).toContain('docker stop --time 30 id-image');
    expect(res.calls).not.toMatch(/systemctl stop/);
    expect(runningNow()).toEqual(['nginx', 'web', 'worker']);
    expect(marker()).toMatch(/^container=image$/m);
  });

  it('counts only failures strictly inside the thirty-minute window, and forgets the rest', () => {
    // Defect caught: a crash from long ago adding to today's count and
    // tripping a healthy container, or the history growing without bound.
    exits([NOW - WINDOW, 'worker', 1], [NOW - 10, 'worker', 4]);
    expect(run('--check').status).toBe(0);
    expect(marker()).toBeNull();
    expect(readFileSync(join(stateDir, 'exits'), 'utf8')).toBe(`${NOW - 10} worker 4\n`);

    exits([NOW - WINDOW + 1, 'worker', 1], [NOW - 10, 'worker', 4]);
    expect(run('--check').status).toBe(0);
    expect(marker()).toMatch(/^container=worker$/m);
  });

  it('ignores a line from the future and a malformed line rather than counting them', () => {
    exits([NOW + 60, 'nginx', 9], [NOW - 5, 'nginx', 4]);
    writeFileSync(join(stateDir, 'exits'), `${readFileSync(join(stateDir, 'exits'), 'utf8')}garbage\n${NOW} bogus 7\n`);
    const res = run('--check');
    expect(res.status, res.stderr).toBe(0);
    expect(marker()).toBeNull();
  });

  it('holds an existing trip: a tripped worker found running again is stopped again', () => {
    // Defect caught: a deploy's compose up bringing a tripped container back
    // and its loop starting over unnoticed.
    trip('worker');
    exits();
    const res = run('--check');
    expect(res.status, res.stderr).toBe(0);
    expect(res.calls).toContain('docker stop --time 30 id-worker');
    expect(runningNow()).not.toContain('worker');
  });

  it('holds a site trip whose service is somehow running by stopping it again', () => {
    trip('nginx');
    const res = run('--check');
    expect(res.status, res.stderr).toBe(0);
    expect(res.calls).toContain('systemctl stop --no-block footbag.service');
  });

  it('treats a marker that names no container as the site\'s own trip', () => {
    // Defect caught: an unreadable or damaged marker read as no trip, so the
    // loop resumes; failing closed takes the site down instead.
    writeFileSync(join(stateDir, 'crash-loop-tripped'), 'garbled\n');
    const res = run('--check');
    expect(res.calls).toContain('systemctl stop --no-block footbag.service');
    expect(run('--start-guard').status).not.toBe(0);
  });

  it('fails the run when the tripped container cannot be stopped', () => {
    // Defect caught: a trip reported as holding while the container keeps
    // looping.
    exits([NOW - 30, 'image', 5]);
    const res = run('--check', { STOP_FAIL: '1' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/docker stop failed for image .*cannot stop/);
    expect(res.stderr).toMatch(/image container is still running after the stop/);
  });

  it('refuses to run without a writable state directory', () => {
    const res = run('--check', { STATE_DIRECTORY: join(dir, 'missing') });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/state directory .* is missing or not writable/);
  });

  it('refuses an unknown mode', () => {
    const res = run('--trip');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/unknown mode '--trip'/);
  });

  it('says on stderr which test seams are in use', () => {
    const res = run('--check');
    expect(res.stderr).toMatch(/test seam FOOTBAG_BREAKER_DOCKER_BIN in use/);
    expect(res.stderr).toMatch(/test seam FOOTBAG_BREAKER_NOW in use/);
  });
});

describe('the units run the breaker', () => {
  const unitLines = (unit: string, key: string) =>
    readFileSync(join(process.cwd(), 'ops/systemd', unit), 'utf8')
      .split('\n')
      .filter((l) => l.startsWith(`${key}=`))
      .map((l) => l.slice(key.length + 1).trim());

  /** A unit's own command line, run as systemd runs it from the install root. */
  function runUnitLine(line: string, env: NodeJS.ProcessEnv = {}) {
    const [bin, ...args] = line.split(/\s+/);
    const res = spawnSync(bin, args, {
      cwd: process.cwd(),
      encoding: 'utf8',
      env: {
        ...process.env, CALLS: calls, RUNNING: running, STATE_DIRECTORY: stateDir, FOOTBAG_ENV: 'staging',
        FOOTBAG_BREAKER_DOCKER_BIN: join(dir, 'docker'), FOOTBAG_BREAKER_SYSTEMCTL_BIN: join(dir, 'systemctl'),
        FOOTBAG_BREAKER_NOW: String(NOW), ...env,
      },
      ...SPAWN_GUARD,
    });
    return { status: res.status, stderr: res.stderr ?? '' };
  }

  it('runs the start guard before every start of the main unit, refusing while web is tripped', () => {
    // Defect caught: the guard written but never wired, so a reboot or a deploy
    // starts a tripped site's loop again.
    const guard = unitLines('footbag.service', 'ExecStartPre').find((l) => l.includes('crash-loop-breaker.sh'));
    expect(guard, 'footbag.service runs no crash-loop start guard').toBeDefined();
    expect(runUnitLine(guard!).status).toBe(0);
    trip('web');
    const res = runUnitLine(guard!);
    expect(res.status).not.toBe(0);
    expect(res.stderr).toContain('REFUSING TO START');
  });

  it('holds a tripped container down after every start of the main unit', () => {
    const hold = unitLines('footbag.service', 'ExecStartPost').find((l) => l.includes('crash-loop-breaker.sh'));
    expect(hold, 'footbag.service holds no tripped container down after its start').toBeDefined();
    trip('worker');
    expect(runUnitLine(hold!).status).toBe(0);
    expect(runningNow()).not.toContain('worker');
  });

  it('runs the breaker in the monitor unit, after the reading that records the failures it counts', () => {
    // Defect caught: the breaker counting before this minute's failures are
    // recorded, or never running at all.
    const starts = unitLines('footbag-container-monitor.service', 'ExecStart');
    const monitor = starts.findIndex((l) => l.includes('scripts/container-monitor.sh'));
    const breaker = starts.findIndex((l) => l.includes('scripts/crash-loop-breaker.sh --check'));
    expect(monitor).toBeGreaterThanOrEqual(0);
    expect(breaker).toBeGreaterThan(monitor);
    exits([NOW - 30, 'image', 5]);
    expect(runUnitLine(starts[breaker]).status).toBe(0);
    expect(runningNow()).not.toContain('image');
  });
});

describe('crash-loop-breaker.sh at the main unit\'s start', () => {
  it('refuses to start the site while web is tripped, naming the clearing command', () => {
    // Defect caught: a deploy or a reboot starting the loop again.
    trip('web');
    const res = run('--start-guard');
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/REFUSING TO START\. The web container was stopped for crashing/);
    expect(res.stderr).toContain('bash scripts/crash-loop-host.sh --target staging --clear');
  });

  it('lets the site start with no trip, and with only the image processor tripped', () => {
    expect(run('--start-guard').status).toBe(0);
    trip('image');
    expect(run('--start-guard').status).toBe(0);
  });

  it('stops a tripped image processor again after the stack comes up, and leaves the rest', () => {
    trip('image');
    const res = run('--start-hold');
    expect(res.status, res.stderr).toBe(0);
    expect(runningNow()).toEqual(['nginx', 'web', 'worker']);
  });

  it('stops nothing after the start when no container is tripped', () => {
    const res = run('--start-hold');
    expect(res.status, res.stderr).toBe(0);
    expect(res.calls).not.toMatch(/stop/);
  });
});
