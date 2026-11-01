/**
 * The pinned-ffmpeg runner: every workstation and runner encodes with the
 * ffmpeg production's image container installs, and a stuck encode is killed at
 * the ceiling production's image worker uses.
 *
 * Docker is a stand-in that records the command it was asked to run and answers
 * the image questions, so each case reads exactly what the runner would run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
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
    'esac',
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
    expect(line).toContain(`--entrypoint timeout footbag-ffmpeg:${PIN} -s KILL ${DEFAULT_FFMPEG_TIMEOUT_MS / 1000} ffmpeg -i in.mp4 out.mp4`);
  });

  // Defect caught: a deployment that raises or lowers the ceiling is ignored
  // locally, so a long encode passes here and is killed in production.
  it('applies the configured ceiling when one is set', () => {
    const r = run(['ffprobe', 'clip.mp4'], { FFMPEG_TIMEOUT_SECONDS: '37' });
    expect(r.status, r.out).toBe(0);
    expect(runLine(r.calls)).toContain(`-s KILL 37 ffprobe clip.mp4`);
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
