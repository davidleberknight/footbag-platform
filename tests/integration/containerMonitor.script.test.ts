/**
 * scripts/container-monitor.sh: the per-container readings the CloudWatch
 * alarms watch, driven end to end against a stand-in Docker client, a scratch
 * cgroup tree and a file standing in for the agent's StatsD port.
 *
 * What the readings say is the whole point of the script, so every case reads
 * the lines it sent: a wrong figure here is an alarm that never fires or one
 * that fires on a healthy host.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';

const SCRIPT = join(process.cwd(), 'scripts/container-monitor.sh');
const NOW = 1_800_000_000;
const MIB = 1024 * 1024;

let dir: string;
let stateDir: string;
let cgroupRoot: string;
let sink: string;
let calls: string;

const DOCKER_STUB = `#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
case "$1" in
  events)
    [[ -n "\${EVENTS_FAIL:-}" ]] && { echo "Cannot connect to the Docker daemon" >&2; exit 1; }
    printf '%b' "\${EVENTS:-}" ;;
  ps)
    svc=""
    for arg in "$@"; do [[ "$arg" == label=com.docker.compose.service=* ]] && svc="\${arg#label=com.docker.compose.service=}"; done
    case " \${PRESENT:-nginx web worker image} " in *" $svc "*) echo "id-$svc" ;; esac ;;
  inspect)
    last="\${!#}"
    svc="\${last#id-}"
    var="STATE_$svc"
    printf 'full-%s %s\\n' "$svc" "\${!var:-running healthy}" ;;
esac
`;

const SYSTEMCTL_STUB = `#!/usr/bin/env bash
[[ "\${STACK_ACTIVE:-1}" == 1 ]]
`;

function cgroup(service: string, limit: number | 'max', current: number, inactiveFile: number) {
  const cg = join(cgroupRoot, 'system.slice', `docker-full-${service}.scope`);
  mkdirSync(cg, { recursive: true });
  writeFileSync(join(cg, 'memory.max'), `${limit}\n`);
  writeFileSync(join(cg, 'memory.current'), `${current}\n`);
  writeFileSync(join(cg, 'memory.stat'), `anon 1\nactive_file 2\ninactive_file ${inactiveFile}\n`);
}

function run(env: NodeJS.ProcessEnv = {}) {
  const res = spawnSync('bash', [SCRIPT], {
    encoding: 'utf8',
    env: {
      ...process.env,
      CALLS: calls,
      STATE_DIRECTORY: stateDir,
      FOOTBAG_MONITOR_DOCKER_BIN: join(dir, 'docker'),
      FOOTBAG_MONITOR_SYSTEMCTL_BIN: join(dir, 'systemctl'),
      FOOTBAG_MONITOR_CGROUP_ROOT: cgroupRoot,
      FOOTBAG_MONITOR_STATSD_SINK: sink,
      FOOTBAG_MONITOR_NOW: String(NOW),
      ...env,
    },
    ...SPAWN_GUARD,
  });
  const lines = existsSync(sink) ? readFileSync(sink, 'utf8').trim().split('\n').filter(Boolean) : [];
  return { status: res.status, stdout: res.stdout ?? '', stderr: res.stderr ?? '', lines };
}

const cursor = () => readFileSync(join(stateDir, 'events-until'), 'utf8').trim();

beforeEach(() => {
  dir = createScratchDir('container-monitor');
  stateDir = join(dir, 'state');
  cgroupRoot = join(dir, 'cgroup');
  sink = join(dir, 'statsd.txt');
  calls = join(dir, 'calls.log');
  mkdirSync(stateDir);
  writeFileSync(join(dir, 'docker'), DOCKER_STUB);
  writeFileSync(join(dir, 'systemctl'), SYSTEMCTL_STUB);
  chmodSync(join(dir, 'docker'), 0o755);
  chmodSync(join(dir, 'systemctl'), 0o755);
  for (const svc of ['nginx', 'web', 'worker', 'image']) cgroup(svc, 512 * MIB, 100 * MIB, 0);
});

afterEach(() => removeScratch(dir));

describe('container-monitor.sh', () => {
  it('sends a full set of zero-valued readings for a healthy stack, heartbeat last', () => {
    // Defect caught: a missing zero leaves the alarm with no data on a quiet
    // host, and a heartbeat sent before the readings claims a run that failed.
    const res = run();
    expect(res.status, res.stderr).toBe(0);
    for (const svc of ['nginx', 'web', 'worker', 'image']) {
      expect(res.lines).toContain(`container_oom_kills:0|c|#container:${svc}`);
      expect(res.lines).toContain(`container_crashes:0|c|#container:${svc}`);
      expect(res.lines).toContain(`container_unhealthy:0|g|#container:${svc}`);
      expect(res.lines).toContain(`container_memory_percent:19.53|g|#container:${svc}`);
    }
    expect(res.lines.at(-1)).toBe('container_monitor_heartbeat:1|g');
    expect(cursor()).toBe(String(NOW));
  });

  it('leaves the reclaimable file cache out of the memory reading', () => {
    // Defect caught: a container whose charge is mostly database cache read
    // as near its limit, paging the operator about a healthy container.
    cgroup('web', 512 * MIB, 480 * MIB, 400 * MIB);
    const res = run();
    expect(res.lines).toContain('container_memory_percent:15.62|g|#container:web');
  });

  it('counts OOM kills from oom events and crashes only from unexpected exits', () => {
    // Defect caught: an OOM kill or a crash that never reaches its alarm, or a
    // routine stop during a deploy (exit 0, 137 or 143) paging as a crash.
    const events = [
      'oom image ', 'die image 137', 'oom image ', 'die image 137',
      'die worker 1', 'die web 143', 'die nginx 0', 'die web 137', 'die worker 139',
    ].join('\\n');
    const res = run({ EVENTS: events });
    expect(res.lines).toContain('container_oom_kills:2|c|#container:image');
    expect(res.lines).toContain('container_crashes:0|c|#container:image');
    expect(res.lines).toContain('container_crashes:2|c|#container:worker');
    expect(res.lines).toContain('container_crashes:0|c|#container:web');
    expect(res.lines).toContain('container_crashes:0|c|#container:nginx');
    expect(res.lines).toContain('container_oom_kills:0|c|#container:web');
  });

  it.each([
    ['unhealthy healthcheck', { STATE_worker: 'running unhealthy' }],
    ['restarting', { STATE_worker: 'restarting none' }],
    ['absent', { PRESENT: 'nginx web image' }],
  ])('reports a worker that is %s as unhealthy', (_label, env) => {
    // Defect caught: a container that is stuck, crash-looping or gone reading
    // as healthy, so the unhealthy alarm never fires.
    const res = run(env);
    expect(res.lines).toContain('container_unhealthy:1|g|#container:worker');
    expect(res.lines).toContain('container_unhealthy:0|g|#container:web');
  });

  it('counts a container still starting its healthcheck as healthy', () => {
    const res = run({ STATE_web: 'running starting' });
    expect(res.lines).toContain('container_unhealthy:0|g|#container:web');
  });

  it('reads events from where the last run stopped, up to now', () => {
    // Defect caught: overlapping windows counting one crash twice, or a gap
    // between runs losing it.
    writeFileSync(join(stateDir, 'events-until'), `${NOW - 75}\n`);
    run();
    expect(readFileSync(calls, 'utf8')).toMatch(new RegExp(`events --since ${NOW - 75} --until ${NOW} `));
    expect(cursor()).toBe(String(NOW));
  });

  it('starts a fresh minute from a cursor in the future or a day stale', () => {
    for (const stale of [NOW + 600, NOW - 90_000]) {
      writeFileSync(join(stateDir, 'events-until'), `${stale}\n`);
      writeFileSync(calls, '');
      run();
      expect(readFileSync(calls, 'utf8'), `cursor ${stale}`).toMatch(new RegExp(`events --since ${NOW - 60} `));
    }
  });

  it('withholds the heartbeat and keeps the cursor when Docker cannot be read', () => {
    // Defect caught: a monitor blind to Docker still sending its heartbeat,
    // so the operator believes the containers are watched while nothing is;
    // or the cursor moving past events that were never read.
    writeFileSync(join(stateDir, 'events-until'), `${NOW - 60}\n`);
    const res = run({ EVENTS_FAIL: '1' });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/docker events failed: Cannot connect to the Docker daemon/);
    expect(res.lines).not.toContain('container_monitor_heartbeat:1|g');
    expect(cursor()).toBe(String(NOW - 60));
  });

  it('sends only the heartbeat while footbag.service is deliberately stopped', () => {
    // Defect caught: a maintenance stop paging every container as unhealthy.
    const res = run({ STACK_ACTIVE: '0' });
    expect(res.status, res.stderr).toBe(0);
    expect(res.lines).toEqual(['container_monitor_heartbeat:1|g']);
  });

  it('omits the memory reading for a container with no limit rather than dividing by it', () => {
    cgroup('nginx', 'max', 100 * MIB, 0);
    const res = run();
    expect(res.status, res.stderr).toBe(0);
    expect(res.lines.some((l) => l.startsWith('container_memory_percent:') && l.endsWith('#container:nginx'))).toBe(false);
    expect(res.lines).toContain('container_unhealthy:0|g|#container:nginx');
  });

  it('refuses to run without a writable state directory', () => {
    const res = run({ STATE_DIRECTORY: join(dir, 'missing') });
    expect(res.status).not.toBe(0);
    expect(res.stderr).toMatch(/state directory .* is missing or not writable/);
    expect(res.lines).toEqual([]);
  });

  it('says on stderr which test seams are in use', () => {
    const res = run();
    expect(res.stderr).toMatch(/test seam FOOTBAG_MONITOR_DOCKER_BIN in use/);
    expect(res.stderr).toMatch(/test seam FOOTBAG_MONITOR_STATSD_SINK in use/);
  });
});
