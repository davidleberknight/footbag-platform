/**
 * The curator-video transcode entry point: a caller that is not the image
 * worker strips a video with the worker's own argument set and time limit, and
 * refuses a call it cannot honour before the encoder starts.
 *
 * ffmpeg is a stand-in on the front of PATH that records the arguments it was
 * given, or hangs when told to, so each case reads exactly what would run.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createScratchDir, removeScratch } from '../fixtures/scratchDir';
import { SPAWN_GUARD } from '../fixtures/spawnGuard';
import { buildFfmpegArgs } from '../../src/lib/videoProcessing';

const TSX = join(process.cwd(), 'node_modules/.bin/tsx');
const SCRIPT = join(process.cwd(), 'scripts/transcode-curator-video.ts');

let dir: string;
let log: string;
let input: string;
let output: string;

beforeEach(() => {
  dir = createScratchDir('transcode-curator-video');
  log = join(dir, 'ffmpeg.args');
  const stub = join(dir, 'ffmpeg');
  writeFileSync(stub, [
    '#!/usr/bin/env bash',
    `printf '%s\\n' "$@" > ${JSON.stringify(log)}`,
    '[[ -n "${STUB_HANG:-}" ]] && exec sleep 60',
    'exit 0',
  ].join('\n'));
  chmodSync(stub, 0o755);
  // The leading bytes of an MP4: a box size, then the ftyp brand the format
  // check reads.
  input = join(dir, 'clip.mp4');
  writeFileSync(input, Buffer.concat([
    Buffer.from([0, 0, 0, 0x18]), Buffer.from('ftypisom', 'ascii'), Buffer.alloc(16),
  ]));
  output = join(dir, 'out.mp4');
});

afterEach(() => removeScratch(dir));

function run(args: string[], extra: NodeJS.ProcessEnv = {}) {
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${dir}:${process.env.PATH}`, ...extra };
  if (!('FFMPEG_TIMEOUT_SECONDS' in extra)) delete env.FFMPEG_TIMEOUT_SECONDS;
  const r = spawnSync(TSX, [SCRIPT, ...args], { encoding: 'utf-8', env, ...SPAWN_GUARD });
  return { status: r.status, stderr: r.stderr };
}

function recordedArgs(): string[] | null {
  return existsSync(log) ? readFileSync(log, 'utf-8').trimEnd().split('\n') : null;
}

describe('transcode-curator-video', () => {
  it("runs the image worker's own argument set, height cap included", () => {
    const r = run([input, output]);
    expect(r.stderr).toBe('');
    expect(r.status).toBe(0);
    expect(recordedArgs()).toEqual(buildFfmpegArgs(input, output));
  });

  it('kills the encoder at the time limit FFMPEG_TIMEOUT_SECONDS sets', () => {
    const r = run([input, output], { FFMPEG_TIMEOUT_SECONDS: '1', STUB_HANG: '1' });
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/timed out after 1000 ms/);
  });

  it('refuses a time limit that is not a positive whole number, before encoding', () => {
    for (const bad of ['0', '-5', '2.5', 'ten', '']) {
      const r = run([input, output], { FFMPEG_TIMEOUT_SECONDS: bad });
      expect(r.status, `FFMPEG_TIMEOUT_SECONDS="${bad}"`).toBe(2);
      expect(recordedArgs(), `FFMPEG_TIMEOUT_SECONDS="${bad}"`).toBeNull();
    }
  });

  it('refuses anything but one input and one .mp4 output, before encoding', () => {
    for (const args of [[], [input], [input, output, 'extra'], [input, join(dir, 'out.mov')]]) {
      const r = run(args);
      expect(r.status, args.join(' ')).toBe(2);
      expect(recordedArgs(), args.join(' ')).toBeNull();
    }
  });

  it('refuses an input that is not a recognised video, before encoding', () => {
    writeFileSync(input, 'not a video at all, just text');
    const r = run([input, output]);
    expect(r.status).toBe(1);
    expect(r.stderr).toMatch(/unrecognized video format/);
    expect(recordedArgs()).toBeNull();
  });
});
