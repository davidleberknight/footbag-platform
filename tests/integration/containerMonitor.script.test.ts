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
let originCert: string;

// Stands in for `openssl x509 -noout -enddate -dateopt iso_8601`, whose output
// OpenSSL 3 documents as notAfter= followed by the ISO 8601 time. NOT_AFTER
// sets the answer; OPENSSL_FAIL makes the read fail as an unreadable file does.
const OPENSSL_STUB = `#!/usr/bin/env bash
[[ -n "\${OPENSSL_FAIL:-}" ]] && { echo "Could not open file or uri for loading certificate" >&2; exit 1; }
printf 'notAfter=%s\\n' "\${NOT_AFTER:?}"
`;

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
    [[ -n "\${INSPECT_FAIL:-}" ]] && { echo "Error: No such object" >&2; exit 1; }
    last="\${!#}"
    svc="\${last#id-}"
    var="STATE_$svc"
    printf 'full-%s %s\\n' "$svc" "\${!var:-running healthy}" ;;
esac
`;

const SYSTEMCTL_STUB = `#!/usr/bin/env bash
case "$1" in
  is-active) [[ "\${STACK_ACTIVE:-1}" == 1 ]] ;;
  is-failed) [[ "\${STACK_FAILED:-0}" == 1 ]] ;;
  *) echo "unexpected systemctl $*" >&2; exit 2 ;;
esac
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
      FOOTBAG_MONITOR_OPENSSL_BIN: join(dir, 'openssl'),
      FOOTBAG_MONITOR_ORIGIN_CERT: originCert,
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
  originCert = join(dir, 'origin-chain');
  writeFileSync(join(dir, 'openssl'), OPENSSL_STUB);
  chmodSync(join(dir, 'openssl'), 0o755);
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

  it('sends the origin certificate\'s whole days to expiry on a host that holds one', () => {
    // Defect caught: an origin certificate whose renewal is failing goes
    // unwatched, and CloudFront answers every visitor with 502 the day it
    // expires; or a part day counted up, so the alarm clears a day late.
    writeFileSync(originCert, 'chain\n');
    // 20 days and 23 hours after NOW reads as 20 whole days.
    const notAfter = new Date((NOW + 20 * 86400 + 23 * 3600) * 1000).toISOString().replace('T', ' ').replace(/\.\d+Z$/, 'Z');
    const res = run({ NOT_AFTER: notAfter });
    expect(res.status, res.stderr).toBe(0);
    expect(res.lines).toContain('origin_cert_days_to_expiry:20|g');
    expect(res.lines.at(-1)).toBe('container_monitor_heartbeat:1|g');
  });

  it('sends no origin certificate reading on a host without one', () => {
    // Defect caught: staging, or production before issuance, publishing a
    // made-up expiry that hides the real one's absence, or failing its run
    // over a certificate it was never meant to hold.
    const res = run({ NOT_AFTER: '2030-01-01 00:00:00Z' });
    expect(res.status, res.stderr).toBe(0);
    expect(res.lines.some((l) => l.startsWith('origin_cert_days_to_expiry'))).toBe(false);
    expect(res.stderr).not.toMatch(/origin certificate/);
  });

  it('warns, and still sends the heartbeat, when the origin certificate cannot be read', () => {
    // Defect caught: an unreadable certificate silencing the whole monitor,
    // so every container alarm goes blind, or the failure passing unreported.
    writeFileSync(originCert, 'chain\n');
    const res = run({ OPENSSL_FAIL: '1' });
    expect(res.status, res.stderr).toBe(0);
    expect(res.lines.some((l) => l.startsWith('origin_cert_days_to_expiry'))).toBe(false);
    expect(res.stderr).toMatch(/origin certificate's expiry could not be read/);
    expect(res.lines.at(-1)).toBe('container_monitor_heartbeat:1|g');
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

  it('reports every container unhealthy, and still counts crashes, while footbag.service has failed', () => {
    // Defect caught: a start that failed or timed out leaves the unit failed
    // (not active) while its containers keep restarting, and a monitor that
    // treats failed like a planned stop sends only its heartbeat, so the site
    // sits down for hours with no container alarm. The stopped case above
    // shows a deliberate stop still raises nothing.
    const res = run({ STACK_ACTIVE: '0', STACK_FAILED: '1', EVENTS: 'die web 1\\ndie web 1' });
    expect(res.status, res.stderr).toBe(0);
    for (const svc of ['nginx', 'web', 'worker', 'image']) {
      expect(res.lines).toContain(`container_unhealthy:1|g|#container:${svc}`);
    }
    expect(res.lines).toContain('container_crashes:2|c|#container:web');
    expect(res.lines.at(-1)).toBe('container_monitor_heartbeat:1|g');
  });

  it('records each container\'s failures for the crash-loop breaker, only on a run that met no error', () => {
    // Defect caught: the breaker never seeing the failures it must count, so a
    // loop is never stopped; or a failed run's window, read again by the next
    // run, counted twice and tripping a container early.
    const exitsFile = join(stateDir, 'exits');
    run({ EVENTS: 'oom image \\ndie image 137\\ndie worker 1\\ndie worker 139\\ndie web 0' });
    expect(readFileSync(exitsFile, 'utf8')).toBe(`${NOW} worker 2\n${NOW} image 1\n`);

    // A run that read failures and then met an error records none of them:
    // the next run reads the same window again and records them then.
    const failed = run({ EVENTS: 'die worker 1', INSPECT_FAIL: '1' });
    expect(failed.status).not.toBe(0);
    expect(readFileSync(exitsFile, 'utf8')).toBe(`${NOW} worker 2\n${NOW} image 1\n`);
  });

  it('reads a container the crash-loop breaker stopped as unhealthy, even while the site is stopped', () => {
    // Defect caught: the breaker's stop of footbag.service read as a planned
    // stop, so only the heartbeat goes out and the site sits on the
    // maintenance page with no alarm.
    writeFileSync(join(stateDir, 'crash-loop-tripped'), 'container=web\ntripped_at=1\nfailures=5\n');
    // A space, not empty: the stand-in reads an empty value as the full stack.
    const res = run({ STACK_ACTIVE: '0', PRESENT: ' ' });
    expect(res.status, res.stderr).toBe(0);
    expect(res.lines).toContain('container_unhealthy:1|g|#container:web');
    expect(res.lines.at(-1)).toBe('container_monitor_heartbeat:1|g');
  });

  it('reads only the tripped worker unhealthy while the rest of the site runs', () => {
    writeFileSync(join(stateDir, 'crash-loop-tripped'), 'container=worker\ntripped_at=1\nfailures=5\n');
    const res = run();
    expect(res.lines).toContain('container_unhealthy:1|g|#container:worker');
    expect(res.lines).toContain('container_unhealthy:0|g|#container:web');
  });

  it('reads every container unhealthy for a trip marker that names none', () => {
    // Defect caught: a damaged marker silencing the alarm for a stopped site.
    writeFileSync(join(stateDir, 'crash-loop-tripped'), 'garbled\n');
    const res = run();
    for (const svc of ['nginx', 'web', 'worker', 'image']) {
      expect(res.lines).toContain(`container_unhealthy:1|g|#container:${svc}`);
    }
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
