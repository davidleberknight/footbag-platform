/**
 * Curator video transcode pipeline (DD §6.8 Curator Media Processing).
 *
 * Re-encodes input video through ffmpeg with explicit malware-stripping
 * options. Container, codec, metadata, and non-AV streams are all rebuilt
 * from the essential signal so embedded malware cannot survive. Only the
 * system member account uploads video bytes; member upload controllers
 * reject `video_platform='s3'` to enforce this restriction at the boundary.
 *
 * Used by the curator content seed and (future) the admin act-as upload
 * path. The mirror program (`legacy_data/create_mirror_footbag_org.py`)
 * uses parallel settings via Python subprocess; the canonical option set
 * lives here.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

const MP4_MAGIC_OFFSET = 4;
const MP4_BRAND_FTYP = Buffer.from('ftyp', 'ascii');
const WEBM_MAGIC = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
const MOV_BRAND_QT = Buffer.from('qt  ', 'ascii');

export type CuratorVideoFormat = 'mp4' | 'webm' | 'mov';

export interface TranscodedVideo {
  bytes: Buffer;
  outputFormat: 'mp4';
}

/**
 * Validate that the buffer's magic bytes match a known curator-video input
 * format (mp4, webm, or mov). Returns the detected format, or null if
 * unrecognized. Strict enforcement at the boundary; the ffmpeg pipeline
 * itself does not auto-detect arbitrary formats.
 */
export function detectVideoFormat(data: Buffer): CuratorVideoFormat | null {
  if (data.length < 12) return null;
  // mp4: bytes 4..8 are 'ftyp', bytes 8..12 contain the brand.
  if (data.subarray(MP4_MAGIC_OFFSET, MP4_MAGIC_OFFSET + 4).equals(MP4_BRAND_FTYP)) {
    const brand = data.subarray(8, 12);
    if (brand.equals(MOV_BRAND_QT)) return 'mov';
    return 'mp4';
  }
  if (data.subarray(0, 4).equals(WEBM_MAGIC)) return 'webm';
  return null;
}

/**
 * Canonical ffmpeg arguments for the curator video full-transcode pipeline.
 *
 * Stream selection (`-map 0:v -map 0:a?`): drops subtitle, data, and
 *   attachment streams that can carry payloads.
 * Metadata stripping (`-map_metadata -1`): drops all input metadata.
 * Chapter stripping (`-map_chapters -1`): drops chapter markers.
 * Codec re-encode (`-c:v libx264 -c:a aac`): no `-c copy` shortcuts;
 *   re-encoding destroys codec-level malware.
 * Web-safe pixel format (`-pix_fmt yuv420p`).
 * Streaming-friendly output (`-movflags +faststart`).
 *
 * Encoder-quality knobs (CRF, preset, audio bitrate) match the existing
 * mirror program's first-attempt settings
 * (`legacy_data/create_mirror_footbag_org.py`).
 */
export function buildFfmpegArgs(inputPath: string, outputPath: string): string[] {
  return [
    '-i', inputPath,
    '-map', '0:v',
    '-map', '0:a?',
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-c:v', 'libx264',
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ];
}

/**
 * Transcode an input video buffer to a sanitized MP4 buffer.
 *
 * Spawns ffmpeg as a subprocess, reading from a temp file (ffmpeg cannot
 * reliably seek a stdin pipe for non-streamable inputs). Stdout/stderr
 * are captured for error reporting. The temp directory is cleaned up
 * unconditionally, even on failure.
 *
 * Errors:
 *   - 'ffmpeg exited with code N: <stderr tail>' on non-zero exit.
 *   - 'unrecognized video format' if the input magic bytes do not match
 *     the curator-video input whitelist.
 */
export async function transcodeCuratorVideo(input: Buffer): Promise<TranscodedVideo> {
  const detected = detectVideoFormat(input);
  if (!detected) {
    throw new Error('unrecognized video format');
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'curator-video-'));
  const inputPath = path.join(tmpDir, `in.${detected}`);
  const outputPath = path.join(tmpDir, 'out.mp4');

  try {
    await writeFile(inputPath, input);
    await runFfmpeg(buildFfmpegArgs(inputPath, outputPath));
    const bytes = await readFile(outputPath);
    return { bytes, outputFormat: 'mp4' };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrTail = '';
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-2000);
    });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited with code ${code}: ${stderrTail}`));
    });
  });
}
