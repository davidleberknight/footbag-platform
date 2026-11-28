/**
 * Reading, clearing and drilling the crash-loop breaker from the operator's
 * workstation (scripts/crash-loop-host.sh and its root-side half).
 *
 * The root-side half runs here against a stand-in Docker client and systemctl
 * that share one file of container states, and the drill runs the real breaker
 * through them, so a drill passes only when the breaker itself trips and stops
 * the container. What these pin: a clear removes the trip and the failure
 * history and starts the site, and passes only when every container reads
 * running and healthy; the drill refuses production and the site's own
 * containers; the wrapper refuses bad arguments before reaching a host, asks
 * nothing for a status read, and changes nothing without a typed APPLY.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { spawnAtTerminal } from '../fixtures/ptySession';
import { hostIdentityAnswer } from '../fixtures/hostIdentityStub';

const REMOTE_HALF = join(process.cwd(), 'scripts/internal/crash-loop-remote.sh');
const REPORT_LIB = join(process.cwd(), 'scripts/lib/closing-report-remote.sh');
const BREAKER = join(process.cwd(), 'scripts/crash-loop-breaker.sh');
const OPERATOR_SCRIPT = join(process.cwd(), 'scripts/crash-loop-host.sh');

let dir: string;
let stateDir: string;
let containers: string;
let calls: string;
let envPath: string;
let activeFlag: string;

// One file of "<service> <status> <health>" lines stands for the Docker daemon,
// so a stop the breaker makes is what the half reads back afterwards.
const DOCKER_STUB = `#!/usr/bin/env bash
echo "docker $*" >> "$CALLS"
svc_of() { for a in "$@"; do [[ "$a" == label=com.docker.compose.service=* ]] && echo "\${a#label=com.docker.compose.service=}"; done; }
case "$1" in
  ps)
    svc="$(svc_of "$@")"
    all=0; for a in "$@"; do [[ "$a" == --all ]] && all=1; done
    while read -r s st h; do
      [[ "$s" == "$svc" ]] || continue
      (( all )) || [[ "$st" == running ]] && echo "id-$s"
    done < "$CONTAINERS" ;;
  inspect)
    id="\${!#}"
    while read -r s st h; do [[ "id-$s" == "$id" ]] && echo "$st $h"; done < "$CONTAINERS" ;;
  stop)
    id="\${!#}"
    while read -r s st h; do
      if [[ "id-$s" == "$id" ]]; then echo "$s exited none"; else echo "$s $st $h"; fi
    done < "$CONTAINERS" > "$CONTAINERS.new"
    mv "$CONTAINERS.new" "$CONTAINERS" ;;
esac
`;

const SYSTEMCTL_STUB = `#!/usr/bin/env bash
echo "systemctl $*" >> "$CALLS"
all_up() { printf '%s\\n' "nginx running healthy" "web running healthy" "worker running healthy" "image running \${IMAGE_HEALTH_AFTER:-healthy}" > "$CONTAINERS"; }
case "$1 \${2:-} \${3:-}" in
  "is-failed --quiet footbag.service") [[ "\${STACK_FAILED:-0}" == 1 ]] ;;
  "is-active --quiet footbag.service") [[ -e "$ACTIVE_FLAG" ]] ;;
  "reset-failed footbag.service "*) ;;
  "start footbag.service "*) touch "$ACTIVE_FLAG"; all_up ;;
  "reload footbag.service "*) all_up ;;
  "stop --no-block footbag.service") rm -f "$ACTIVE_FLAG" ;;
  "start footbag-container-monitor.service "*)
    STATE_DIRECTORY="$STATE_DIR" FOOTBAG_ENV=staging \\
      FOOTBAG_BREAKER_DOCKER_BIN="$STUBS/docker" FOOTBAG_BREAKER_SYSTEMCTL_BIN="$STUBS/systemctl" \\
      bash "$BREAKER" --check ;;
  *) echo "unexpected systemctl $*" >&2; exit 2 ;;
esac
`;

function halfEnv(extra: NodeJS.ProcessEnv = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    CALLS: calls,
    CONTAINERS: containers,
    ACTIVE_FLAG: activeFlag,
    STATE_DIR: stateDir,
    STUBS: dir,
    BREAKER,
    CRASH_LOOP_STATE_DIR: stateDir,
    CRASH_LOOP_ENV_PATH: envPath,
    CRASH_LOOP_BREAKER: BREAKER,
    CRASH_LOOP_DOCKER_BIN: join(dir, 'docker'),
    CRASH_LOOP_SYSTEMCTL_BIN: join(dir, 'systemctl'),
    CRASH_LOOP_WAIT_SECONDS: '0',
    ...extra,
  };
}

function runHalf(action: string, service = '', extra: NodeJS.ProcessEnv = {}) {
  // Sent as the wrapper sends it: the report library, then the half, on stdin.
  const res = spawnSync('bash', [], {
    encoding: 'utf8',
    input: readFileSync(REPORT_LIB, 'utf8') + readFileSync(REMOTE_HALF, 'utf8'),
    env: halfEnv({ CRASH_LOOP_ACTION: action, CRASH_LOOP_SERVICE: service, ...extra }),
    ...SPAWN_GUARD,
  });
  return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
}

const markerPath = () => join(stateDir, 'crash-loop-tripped');
const trip = (svc: string) => writeFileSync(markerPath(), `container=${svc}\ntripped_at=1\nfailures=5\n`);
const setContainers = (...lines: string[]) => writeFileSync(containers, lines.map((l) => `${l}\n`).join(''));

beforeEach(() => {
  dir = createScratchDir('crash-loop-host');
  stateDir = join(dir, 'state');
  containers = join(dir, 'containers');
  calls = join(dir, 'calls.log');
  envPath = join(dir, 'env');
  activeFlag = join(dir, 'active');
  mkdirSync(stateDir);
  writeFileSync(envPath, 'FOOTBAG_ENV=staging\n');
  writeFileSync(activeFlag, '');
  setContainers('nginx running healthy', 'web running healthy', 'worker running healthy', 'image running healthy');
  writeFileSync(join(dir, 'docker'), DOCKER_STUB);
  writeFileSync(join(dir, 'systemctl'), SYSTEMCTL_STUB);
  chmodSync(join(dir, 'docker'), 0o755);
  chmodSync(join(dir, 'systemctl'), 0o755);
});

afterEach(() => removeScratch(dir));

describe('the root-side crash-loop half', () => {
  it('reports no trip and every container for a status read', () => {
    const res = runHalf('status');
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('CRASH_LOOP_MARKER=none');
    expect(res.stdout).toContain('CRASH_LOOP_CONTAINER=image running healthy');
  });

  it('clears a site trip: removes the marker and the failure history, then starts the site', () => {
    // Defect caught: a clear that leaves the history behind, so the next
    // minute's count trips the container again at once; or one that never
    // starts the site, leaving the maintenance page up.
    trip('web');
    writeFileSync(join(stateDir, 'exits'), '1 web 5\n');
    rmActive();
    setContainers('nginx exited none', 'web exited none', 'worker exited none', 'image exited none');
    const res = runHalf('clear');
    expect(res.status, res.stderr).toBe(0);
    expect(existsSync(markerPath())).toBe(false);
    expect(existsSync(join(stateDir, 'exits'))).toBe(false);
    expect(readFileSync(calls, 'utf8')).toContain('systemctl start footbag.service');
    expect(res.stdout).toContain('CRASH_LOOP_MARKER=none');
    expect(res.stdout).toContain('CRASH_LOOP_CONTAINER=web running healthy');
  });

  it('clears a worker trip on a running site by bringing the stopped container back, not restarting the site', () => {
    trip('worker');
    setContainers('nginx running healthy', 'web running healthy', 'worker exited none', 'image running healthy');
    const res = runHalf('clear');
    expect(res.status, res.stderr).toBe(0);
    const log = readFileSync(calls, 'utf8');
    expect(log).toContain('systemctl reload footbag.service');
    expect(log).not.toContain('systemctl start footbag.service');
    expect(res.stdout).toContain('CRASH_LOOP_CONTAINER=worker running healthy');
  });

  it('drills the image processor through the real breaker: tripped and stopped, the site left up', () => {
    // Defect caught: a drill that reports success because it wrote the marker
    // itself, proving nothing about the breaker that has to stop a real loop.
    const res = runHalf('drill', 'image');
    expect(res.status, res.stderr).toBe(0);
    expect(res.stdout).toContain('CRASH_LOOP_MARKER=image');
    expect(res.stdout).toContain('CRASH_LOOP_CONTAINER=image exited none');
    expect(res.stdout).toContain('CRASH_LOOP_CONTAINER=web running healthy');
  });

  it('refuses a drill on a host that does not record staging, changing nothing', () => {
    // Defect caught: the drill taking a production container down.
    writeFileSync(envPath, 'FOOTBAG_ENV=production\n');
    const res = runHalf('drill', 'image');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('runs on staging only');
    expect(existsSync(join(stateDir, 'exits'))).toBe(false);
  });

  it('refuses to drill the site\'s own containers, or over an existing trip', () => {
    expect(runHalf('drill', 'web').status).toBe(2);
    trip('worker');
    const res = runHalf('drill', 'image');
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('already recorded');
  });

  it('refuses an action it does not know', () => {
    const res = runHalf('reset');
    expect(res.status).toBe(2);
    expect(res.stderr).toContain('unknown CRASH_LOOP_ACTION');
  });
});

/** footbag.service stopped, as the breaker leaves it after a site trip. */
function rmActive() {
  rmSync(activeFlag, { force: true });
}

describe('the operator-facing crash-loop script', () => {
  /** A stand-in host that answers the identity question and runs what it is
   *  sent, the password line read off as sudo would, against this case's
   *  stand-in Docker, systemctl and state directory. */
  function runningHost(recorded?: string) {
    const stubDir = join(dir, 'host-bin');
    mkdirSync(stubDir, { recursive: true });
    const streams = join(dir, 'streams.log');
    const exports = Object.entries(halfEnv())
      .filter(([k]) => /^(CALLS|CONTAINERS|ACTIVE_FLAG|STATE_DIR|STUBS|BREAKER|CRASH_LOOP_[A-Z_]+)$/.test(k))
      .map(([k, v]) => `export ${k}=${JSON.stringify(v)}`);
    writeFileSync(join(stubDir, 'ssh'), [
      '#!/usr/bin/env bash',
      hostIdentityAnswer(recorded),
      'for a in "$@"; do',
      '  if [[ "$a" == "-G" ]]; then printf "hostname 203.0.113.40\\nuser footbag\\n"; exit 0; fi',
      'done',
      ...exports,
      `stream="$(cat)"; printf '%s\\n' "$stream" >> "${streams}"`,
      `printf '%s\\n' "$stream" | { IFS= read -r _pw; bash; }`,
    ].join('\n'));
    chmodSync(join(stubDir, 'ssh'), 0o755);
    const pin = join(dir, 'pin');
    writeFileSync(pin, '[203.0.113.40]:22 ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFAKE\n');
    return {
      env: { ...process.env, PATH: `${stubDir}:${process.env.PATH ?? ''}`, FOOTBAG_KNOWN_HOSTS: pin },
      streams,
    };
  }

  const sent = (streams: string) => (existsSync(streams) ? readFileSync(streams, 'utf8') : '');

  function runOperator(args: string[], env: NodeJS.ProcessEnv) {
    const res = spawnSync('setsid', ['bash', OPERATOR_SCRIPT, ...args], {
      encoding: 'utf8',
      input: 'fixture-sudo-password\n',
      env,
      ...SPAWN_GUARD,
    });
    return { status: res.status ?? -1, stdout: res.stdout ?? '', stderr: res.stderr ?? '' };
  }

  function runConfirmed(args: string[], env: NodeJS.ProcessEnv) {
    const pw = join(dir, 'pw');
    writeFileSync(pw, 'fixture-sudo-password\n');
    const inner = ['bash', OPERATOR_SCRIPT, ...args, '<', pw].map((a) => (a === '<' ? a : JSON.stringify(a))).join(' ');
    const res = spawnAtTerminal(inner, { typed: 'APPLY\n', env });
    return { status: res.status ?? -1, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
  }

  it('refuses bad arguments, a production drill and a drill of the site before reaching any host', () => {
    const { env, streams } = runningHost();
    for (const [args, message] of [
      [['--status'], '--target must be production or staging'],
      [['--target', 'staging'], 'one of --status, --clear or --drill'],
      [['--target', 'staging', '--status', '--clear'], 'name one action'],
      [['--target', 'staging', '--drill', 'web'], "--drill takes 'worker' or 'image'"],
      [['--target', 'production', '--drill', 'image'], 'the drill runs on staging only'],
    ] as const) {
      const res = runOperator([...args], env);
      expect(res.status, args.join(' ')).not.toBe(0);
      expect(res.stderr, args.join(' ')).toContain(message);
    }
    expect(sent(streams)).toBe('');
  });

  it('reads the status with no prompt and warns while a trip stands', () => {
    trip('image');
    const { env, streams } = runningHost();
    const res = runOperator(['--target', 'staging', '--status'], env);
    expect(res.status, res.stderr).toBe(0);
    expect(sent(streams)).toContain('CRASH_LOOP_ACTION=status');
    expect(res.stderr).toMatch(/image container is tripped for a crash loop on staging/);
  });

  it('refuses a host that records another environment before reading anything', () => {
    const { env, streams } = runningHost('production');
    const res = runOperator(['--target', 'staging', '--status'], env);
    expect(res.status).toBe(1);
    expect(sent(streams)).not.toContain('CRASH_LOOP_ACTION');
  });

  it('clears nothing that nobody confirmed at a terminal', () => {
    // Defect caught: a looping container started again by a script or an
    // agent session with no person deciding the cause is fixed.
    trip('web');
    const { env, streams } = runningHost();
    const res = runOperator(['--target', 'production', '--clear'], env);
    expect(res.status).toBe(1);
    expect(res.stderr).toContain('not confirmed');
    expect(sent(streams)).not.toContain('CRASH_LOOP_ACTION=clear');
    expect(existsSync(markerPath())).toBe(true);
  });

  it('clears a confirmed trip and passes only once every container reads running and healthy', () => {
    trip('web');
    rmActive();
    setContainers('nginx exited none', 'web exited none', 'worker exited none', 'image exited none');
    const { env } = runningHost();
    const res = runConfirmed(['--target', 'staging', '--clear'], env);
    expect(res.status, res.out).toBe(0);
    expect(res.out).toContain('all four containers are running and healthy');
    expect(existsSync(markerPath())).toBe(false);
  });

  it('fails a clear after which a container is not healthy', () => {
    // Defect caught: a clear reported done while the container it started is
    // already failing again.
    trip('image');
    setContainers('nginx running healthy', 'web running healthy', 'worker running healthy', 'image exited none');
    const { env } = runningHost();
    const res = runConfirmed(['--target', 'staging', '--clear'], {
      ...env, IMAGE_HEALTH_AFTER: 'unhealthy',
    });
    expect(res.status).not.toBe(0);
    expect(res.out).toMatch(/image container is running \(unhealthy\) after the clear/);
  });

  it('drills a confirmed staging run and passes when the breaker tripped and stopped the container', () => {
    const { env, streams } = runningHost();
    const res = runConfirmed(['--target', 'staging', '--drill', 'worker'], env);
    expect(res.status, res.out).toBe(0);
    expect(sent(streams)).toContain('CRASH_LOOP_ACTION=drill');
    expect(res.out).toContain('the breaker tripped and stopped the worker container on staging');
    expect(readFileSync(markerPath(), 'utf8')).toMatch(/^container=worker$/m);
  });
});
