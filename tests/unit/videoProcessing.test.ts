/**
 * Curator video transcode pipeline tests (DD §6.8).
 *
 * Validates the canonical ffmpeg argument set and magic-byte format
 * detection. The actual transcode test is gated on ffmpeg availability
 * in the test environment; CI installs ffmpeg, dev workstations may not.
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import {
  buildFfmpegArgs,
  detectVideoFormat,
  transcodeCuratorVideo,
} from '../../src/lib/videoProcessing';

const ffmpegAvailable =
  spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

describe('detectVideoFormat', () => {
  it('detects mp4 by ftyp atom at offset 4', () => {
    const mp4 = Buffer.alloc(16);
    mp4.write('ftyp', 4, 'ascii');
    mp4.write('mp42', 8, 'ascii');
    expect(detectVideoFormat(mp4)).toBe('mp4');
  });

  it('detects webm by EBML magic 0x1a45dfa3', () => {
    const webm = Buffer.from([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectVideoFormat(webm)).toBe('webm');
  });

  it('detects mov by ftyp atom with qt brand', () => {
    const mov = Buffer.alloc(16);
    mov.write('ftyp', 4, 'ascii');
    mov.write('qt  ', 8, 'ascii');
    expect(detectVideoFormat(mov)).toBe('mov');
  });

  it('returns null for buffers under 12 bytes', () => {
    expect(detectVideoFormat(Buffer.alloc(8))).toBeNull();
  });

  it('returns null for unrecognized magic bytes', () => {
    const garbage = Buffer.alloc(16, 0xff);
    expect(detectVideoFormat(garbage)).toBeNull();
  });

  it('returns null for JPEG (non-video) magic bytes', () => {
    const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(detectVideoFormat(jpeg)).toBeNull();
  });
});

describe('buildFfmpegArgs', () => {
  it('emits the canonical malware-stripping option set', () => {
    const args = buildFfmpegArgs('in.mp4', 'out.mp4');
    expect(args).toContain('-map');
    expect(args).toContain('0:v');
    expect(args).toContain('0:a?');
    expect(args).toContain('-map_metadata');
    expect(args).toContain('-1');
    expect(args).toContain('-map_chapters');
    expect(args).toContain('-c:v');
    expect(args).toContain('libx264');
    expect(args).toContain('-c:a');
    expect(args).toContain('aac');
    expect(args).toContain('-pix_fmt');
    expect(args).toContain('yuv420p');
    expect(args).toContain('-movflags');
    expect(args).toContain('+faststart');
  });

  it('includes input and output paths', () => {
    const args = buildFfmpegArgs('/tmp/in.mp4', '/tmp/out.mp4');
    expect(args[0]).toBe('-i');
    expect(args[1]).toBe('/tmp/in.mp4');
    expect(args[args.length - 1]).toBe('/tmp/out.mp4');
  });

  it('forces overwrite with -y', () => {
    const args = buildFfmpegArgs('in.mp4', 'out.mp4');
    expect(args).toContain('-y');
  });

  it('does not include -c copy shortcuts (would skip re-encoding)', () => {
    const args = buildFfmpegArgs('in.mp4', 'out.mp4');
    const idx = args.indexOf('-c:v');
    expect(args[idx + 1]).not.toBe('copy');
    const idxAudio = args.indexOf('-c:a');
    expect(args[idxAudio + 1]).not.toBe('copy');
  });
});

describe('transcodeCuratorVideo', () => {
  it('rejects unrecognized input format with no ffmpeg invocation', async () => {
    const garbage = Buffer.alloc(16, 0xff);
    await expect(transcodeCuratorVideo(garbage)).rejects.toThrow(
      'unrecognized video format',
    );
  });

  it.skipIf(!ffmpegAvailable)(
    'transcodes a synthesized mp4 input through ffmpeg with the malware-stripping options',
    async () => {
      // Synthesize a tiny valid mp4 by running ffmpeg directly to produce
      // a 1-frame test pattern; then feed those bytes through
      // transcodeCuratorVideo and verify the result is also a valid mp4.
      const { spawnSync } = await import('node:child_process');
      const { mkdtempSync, readFileSync, rmSync } = await import('node:fs');
      const path = await import('node:path');
      const os = await import('node:os');

      const tmpDir = mkdtempSync(path.join(os.tmpdir(), 'video-test-'));
      const inputPath = path.join(tmpDir, 'in.mp4');
      try {
        const synth = spawnSync(
          'ffmpeg',
          [
            '-f', 'lavfi',
            '-i', 'color=c=red:s=64x64:d=0.5:r=10',
            '-c:v', 'libx264',
            '-pix_fmt', 'yuv420p',
            '-y',
            inputPath,
          ],
          { stdio: 'ignore' },
        );
        expect(synth.status).toBe(0);

        const inputBytes = readFileSync(inputPath);
        expect(detectVideoFormat(inputBytes)).toBe('mp4');

        const result = await transcodeCuratorVideo(inputBytes);
        expect(result.outputFormat).toBe('mp4');
        expect(result.bytes.length).toBeGreaterThan(0);
        expect(detectVideoFormat(result.bytes)).toBe('mp4');
      } finally {
        rmSync(tmpDir, { recursive: true, force: true });
      }
    },
  );
});
