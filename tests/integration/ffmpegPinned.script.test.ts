/**
 * The pinned-ffmpeg runner: every workstation and runner encodes with the
 * ffmpeg production's image container installs, and a stuck encode is killed at
 * the ceiling production's image worker uses.
 *
 * Docker is a stand-in that records the command it was asked to run and answers
 * the image questions, so each case reads exactly what the runner would run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawn, spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { requireToolInCI } from '../fixtures/toolAvailability';
import { DEFAULT_FFMPEG_TIMEOUT_MS } from '../../src/lib/videoProcessing';

const SCRIPT = join(process.cwd(), 'scripts/ffmpeg-pinned.sh');
const LIST = readFileSync(join(process.cwd(), 'ops/tool-versions.env'), 'utf-8');
const PIN = /^FFMPEG_VERSION=(.*)$/m.exec(LIST)![1];

let dir: string;
let log: string;
let docker: string;

beforeEach(() => {
  dir = createScratchDir('ffmpeg-pinned');
  log = join(dir, 'docker.log');
  docker = join(dir, 'docker');
  writeFileSync(docker, [
    '#!/usr/bin/env bash',
    `echo "$*" >> ${JSON.stringify(log)}`,
    'case "$1 $2" in',
    '  "image inspect") [[ -n "${STUB_NO_IMAGE:-}" ]] && exit 1; exit 0 ;;',
    '  "build -t"*) cat >/dev/null; exit 0 ;;',
    '  "rm -f") [[ "${STUB_RM:-}" == hang ]] && exec sleep 300; exit 0 ;;',
    '  "ps -aq") [[ -n "${STUB_PS_PRESENT:-}" ]] && echo 3f2a9c1d7e60; exit 0 ;;',
    'esac',
    // A tool run. The in-container shell records the tool's exit code in the
    // status file the runner names on the command line; each STUB_RUN mode
    // plays one way the container can end, including Docker losing the exit
    // (the status is written but the client never returns). A hang execs into
    // sleep so killing the client leaves no orphan holding the test's pipes.
    'if [[ "$1" == run && "$*" != *"apk info -v"* ]]; then',
    '  status=""; for a in "$@"; do [[ "$a" == /tmp/footbag-ffmpeg.*/status ]] && status="$a"; done',
    '  case "${STUB_RUN:-ok}" in',
    '    ok) echo 0 > "$status"; exit 0 ;;',
    '    exit3) echo 3 > "$status"; exit 3 ;;',
    '    docker-fails) exit 125 ;;',
    '    client-dies) exit 137 ;;',
    '    lost) echo 0 > "$status"; echo started; exec sleep 300 ;;',
    '    hang) echo started; exec sleep 300 ;;',
    '  esac',
    'fi',
    // The installed-package list's real shape, captured 2026-11-01 from
    // `apk info -v` in the pinned node:22-alpine base after `apk add
    // ffmpeg=8.1.3-r0`: the bare package line among its library packages.
    'if [[ "$1" == run && "$*" == *"apk info -v"* ]]; then',
    '  v="$STUB_IMAGE_FFMPEG"; printf "%s\\n" "ffmpeg-$v" "ffmpeg-libavcodec-$v" "ffmpeg-libavformat-$v" "ffmpeg-libswscale-$v"; exit 0',
    'fi',
    'exit 0',
  ].join('\n'));
  chmodSync(docker, 0o755);
});

afterEach(() => removeScratch(dir));

function run(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const r = spawnSync('bash', [SCRIPT, ...args], {
    encoding: 'utf-8',
    cwd: dir,
    env: { ...process.env, FOOTBAG_FFMPEG_DOCKER: docker, STUB_IMAGE_FFMPEG: PIN, ...extra },
    ...SPAWN_GUARD,
  });
  return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? ''), calls: existsSync(log) ? readFileSync(log, 'utf-8') : '' };
}

const runLine = (calls: string): string =>
  calls.split('\n').find((l) => l.startsWith('run ') && !l.includes('apk info')) ?? '';

describe('running the pinned ffmpeg', () => {
  // Defect caught: a stuck encode outlives production's ceiling. The image
  // worker kills its ffmpeg after the configured timeout; killing the docker
  // client would leave the encoder running, so the ceiling has to be applied
  // inside the container, at the app's own default.
  it("kills the encoder inside the container at the app's own default ceiling", () => {
    const env = { ...process.env };
    delete env.FFMPEG_TIMEOUT_SECONDS;
    const r = spawnSync('bash', [SCRIPT, 'ffmpeg', '-i', 'in.mp4', 'out.mp4'], {
      encoding: 'utf-8', cwd: dir,
      env: { ...env, FOOTBAG_FFMPEG_DOCKER: docker, STUB_IMAGE_FFMPEG: PIN },
      ...SPAWN_GUARD,
    });
    expect(r.status, r.stderr).toBe(0);
    const line = runLine(readFileSync(log, 'utf-8'));
    expect(line).toContain(`--entrypoint sh footbag-ffmpeg:${PIN} -c `);
    expect(line).toContain('timeout -s KILL');
    expect(line).toMatch(new RegExp(`/status ${DEFAULT_FFMPEG_TIMEOUT_MS / 1000} ffmpeg -i in\\.mp4 out\\.mp4$`));
  });

  // Defect caught: a deployment that raises or lowers the ceiling is ignored
  // locally, so a long encode passes here and is killed in production.
  it('applies the configured ceiling when one is set', () => {
    const r = run(['ffprobe', 'clip.mp4'], { FFMPEG_TIMEOUT_SECONDS: '37' });
    expect(r.status, r.out).toBe(0);
    expect(runLine(r.calls)).toMatch(/\/status 37 ffprobe clip\.mp4$/);
  });

  // Defect caught: a ceiling of zero is accepted, and `timeout 0` means no
  // limit at all, so a stuck encode runs forever.
  it('refuses a ceiling of zero, running nothing', () => {
    const r = run(['ffmpeg', '-version'], { FFMPEG_TIMEOUT_SECONDS: '0' });
    expect(r.status).toBe(2);
    expect(runLine(r.calls)).toBe('');
  });

  // Defect caught: files the encoder writes land owned by root, or a path an
  // argument names does not exist inside the container.
  it('runs as the calling user with the working directory mounted at the same path', () => {
    const r = run(['ffmpeg', '-version']);
    const uid = spawnSync('id', ['-u'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout.trim();
    const gid = spawnSync('id', ['-g'], { encoding: 'utf-8', ...SPAWN_GUARD }).stdout.trim();
    const line = runLine(r.calls);
    expect(line).toContain(`--user ${uid}:${gid}`);
    expect(line).toContain(`-v ${dir}:${dir}`);
    expect(line).toContain(`-w ${dir}`);
  });

  // Defect caught: with the image missing, a caller silently falls back to
  // nothing useful, or docker pulls something unpinned under the same name.
  it('refuses, running nothing, when the pinned image is not built', () => {
    const r = run(['ffmpeg', '-version'], { STUB_NO_IMAGE: '1' });
    expect(r.status).toBe(1);
    expect(r.out).toContain(`footbag-ffmpeg:${PIN} is not built`);
    expect(runLine(r.calls)).toBe('');
  });
});

// The container's exit can go missing: on some Docker hosts the process ends
// but the engine never records it, so `docker run` waits forever, the encode
// that already succeeded is reported as a timeout, and the container is left
// behind. The runner learns the tool's exit from a status file the container
// writes, not from Docker, and force-removes a container whose exit was lost.
describe('surviving a container whose exit Docker never records', () => {
  const statusDirOf = (calls: string): string =>
    /(\/tmp\/footbag-ffmpeg\.[^/ ]+)\/status/.exec(runLine(calls))?.[1] ?? '';
  const nameOf = (calls: string): string =>
    /--name (footbag-ffmpeg-\S+)/.exec(runLine(calls))?.[1] ?? '';

  // Defect caught: a run that finished cleanly force-removes its container
  // anyway, or leaves its status directory behind in /tmp on every encode.
  it('returns the tool result and removes nothing when the client exits normally', () => {
    const r = run(['ffmpeg', '-version']);
    expect(r.status, r.out).toBe(0);
    expect(nameOf(r.calls)).not.toBe('');
    expect(r.calls).not.toContain('rm -f');
    expect(existsSync(statusDirOf(r.calls))).toBe(false);
  });

  // Defect caught: a failed encode is reported as a success, so the seeder
  // ships a broken or missing file.
  it("passes the tool's own failing exit code through", () => {
    const r = run(['ffmpeg', '-i', 'bad.mp4', 'out.mp4'], { STUB_RUN: 'exit3' });
    expect(r.status, r.out).toBe(3);
    expect(r.calls).not.toContain('rm -f');
  });

  // Defect caught: Docker refusing to start the container (no status was ever
  // written) is mistaken for a lost exit or reported as success.
  it("reports docker's own failure when the tool never ran", () => {
    const r = run(['ffmpeg', '-version'], { STUB_RUN: 'docker-fails' });
    expect(r.status, r.out).toBe(125);
    expect(r.calls).not.toContain('rm -f');
  });

  // Defect caught: the docker client dies on its own (its daemon connection
  // drops, it is killed) while the container keeps encoding, and the runner
  // returns with the encoder still running behind it.
  it('removes a container still present after the client died without a recorded result', () => {
    const r = run(['ffmpeg', '-version'], { STUB_RUN: 'client-dies', STUB_PS_PRESENT: '1' });
    expect(r.status, r.out).toBe(137);
    expect(r.calls).toContain(`rm -f ${nameOf(r.calls)}`);
  });

  // Defect caught: the container's own shell dies before recording a result
  // and Docker also loses the exit, so nothing ever ends the wait and every
  // caller without a watchdog of its own hangs forever.
  it('gives up at its own deadline when no result is ever recorded', () => {
    const r = run(['ffmpeg', '-version'], {
      STUB_RUN: 'hang', FFMPEG_TIMEOUT_SECONDS: '1', FOOTBAG_FFMPEG_EXIT_GRACE_SECONDS: '0',
    });
    expect(r.status, r.out).toBe(124);
    expect(r.calls).toContain(`rm -f ${nameOf(r.calls)}`);
    expect(existsSync(statusDirOf(r.calls))).toBe(false);
  });

  // Defect caught: the tool finished but Docker lost the exit, and the runner
  // waits until the encoder ceiling kills it, failing the whole seeding run.
  it('returns the recorded result and force-removes the container when the exit is lost', () => {
    const r = run(['ffmpeg', '-version'], { STUB_RUN: 'lost', FOOTBAG_FFMPEG_EXIT_GRACE_SECONDS: '0' });
    expect(r.status, r.out).toBe(0);
    const name = nameOf(r.calls);
    expect(name).not.toBe('');
    expect(r.calls).toContain(`rm -f ${name}`);
    expect(r.out).toContain(name);
    expect(existsSync(statusDirOf(r.calls))).toBe(false);
  });

  // Defect caught: a wedged engine also hangs the removal, and the runner
  // hangs on that instead, so the seeder still stalls.
  it('does not wait on a removal that hangs, and names the container left behind', () => {
    const r = run(['ffmpeg', '-version'], {
      STUB_RUN: 'lost', STUB_RM: 'hang',
      FOOTBAG_FFMPEG_EXIT_GRACE_SECONDS: '0', FOOTBAG_FFMPEG_RM_TIMEOUT_SECONDS: '1',
    });
    expect(r.status, r.out).toBe(0);
    const name = nameOf(r.calls);
    expect(r.calls).toContain(`rm -f ${name}`);
    expect(r.out).toContain(`${name} could not be removed`);
  });

  // Starts the runner on a container that never ends and resolves once the
  // container is running, so a case can stop the runner mid-encode.
  async function startHangingRun() {
    const child = spawn('bash', [SCRIPT, 'ffmpeg', '-version'], {
      cwd: dir,
      env: { ...process.env, FOOTBAG_FFMPEG_DOCKER: docker, STUB_IMAGE_FFMPEG: PIN, STUB_RUN: 'hang' },
    });
    let out = '';
    const closed = new Promise<{ code: number | null; signal: NodeJS.Signals | null }>(
      (resolve) => child.on('close', (code, signal) => resolve({ code, signal })),
    );
    child.stderr.on('data', (d) => { out += String(d); });
    await new Promise<void>((resolve) => child.stdout.on('data', (d) => {
      out += String(d);
      if (out.includes('started')) resolve();
    }));
    return { child, closed, output: () => out };
  }

  // Defect caught: interrupting a run (the operator's Ctrl-C, the caller's
  // stop, a closed terminal) kills the docker client but leaves the encoder
  // running in its container. Each signal has its own trap.
  it.each([
    ['SIGTERM', 143],
    ['SIGINT', 130],
    ['SIGHUP', 129],
  ] as const)('force-removes the container when the runner gets %s mid-encode', async (sig, want) => {
    const { child, closed, output } = await startHangingRun();
    child.kill(sig);
    const { code } = await closed;
    const calls = readFileSync(log, 'utf-8');
    expect(code, output()).toBe(want);
    expect(calls).toContain(`rm -f ${nameOf(calls)}`);
    expect(existsSync(statusDirOf(calls))).toBe(false);
  });

  // Defect caught: the application's watchdog SIGKILLs the runner, which no
  // trap can see; the docker client survives it, keeps the caller's output
  // pipe open, and the timeout reaches the caller only when the container
  // ends on its own, minutes later. The client must die with the runner.
  it.skipIf(!requireToolInCI('setpriv', '--version'))(
    'takes the docker client down with it when the runner is SIGKILLed',
    async () => {
      const { child, closed } = await startHangingRun();
      child.kill('SIGKILL');
      const { signal } = await closed;
      expect(signal).toBe('SIGKILL');
      // A SIGKILLed runner cannot remove its own status directory; this case
      // created it, so this case removes it.
      const leaked = statusDirOf(readFileSync(log, 'utf-8'));
      expect(leaked).not.toBe('');
      rmSync(leaked, { recursive: true, force: true });
    },
  );
});

describe('installing the pinned ffmpeg', () => {
  it('installs ffmpeg and ffprobe wrappers when the image holds the pinned version', () => {
    const bin = join(dir, 'bin');
    const r = run(['--install', bin]);
    expect(r.status, r.out).toBe(0);
    for (const tool of ['ffmpeg', 'ffprobe']) {
      expect(readFileSync(join(bin, tool), 'utf-8')).toContain(`ffmpeg-pinned.sh ${tool}`);
    }
  });

  // Defect caught: an image whose package repository served another ffmpeg is
  // installed as the pinned one, and every environment trusts the wrong version.
  it('installs nothing when the built image holds another ffmpeg', () => {
    const bin = join(dir, 'bin');
    const r = run(['--install', bin], { STUB_IMAGE_FFMPEG: '8.1.2-r0' });
    expect(r.status).toBe(1);
    expect(r.out).toContain('holds ffmpeg 8.1.2-r0');
    expect(existsSync(join(bin, 'ffmpeg'))).toBe(false);
  });
});
