/**
 * Curator video transcode pipeline (DD §6.8 Curator Media Processing).
 *
 * Re-encodes input video through ffmpeg with explicit malware-stripping
 * options. Container, codec, metadata, and non-AV streams are all rebuilt
 * from the essential signal so embedded malware cannot survive. Only the
 * system member account uploads video bytes; member upload controllers
 * reject `video_platform='s3'` to enforce this restriction at the boundary.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';

/**
 * The single definition of each encoder bound's default.
 *
 * This module reads no environment of its own, deliberately. It is loaded by
 * the media container, which runs unprivileged with every capability dropped
 * and is given none of the web environment contract: no session secret, no
 * public base URL, no database path. Reaching the application config from here
 * would impose that contract on a process that cannot satisfy it and would stop
 * the container from starting at all. The container's entry point reads its own
 * deploy-time bounds and passes them in, so the values arrive as arguments and
 * this module stays loadable anywhere.
 *
 * Each default is applied here when a caller supplies no value, and the
 * application config imports it as the default it validates an operator
 * override against. Defining each one once is what makes the two sides of that
 * boundary agree: a second literal on the config side would drift silently the
 * first time either was changed alone.
 */
export const DEFAULT_VIDEO_MAX_HEIGHT = 1080;
export const DEFAULT_FFMPEG_TIMEOUT_MS = 240_000;

/**
 * How much encoder stderr is kept, and how much of it any user-facing message
 * may carry. The full tail belongs in the worker log, where an operator reads
 * it; a curator-facing message is capped at the public limit because encoder
 * output is diagnostic noise to them and can echo infrastructure detail.
 */
export const FFMPEG_STDERR_TAIL_BYTES = 2000;
export const FFMPEG_STDERR_PUBLIC_LIMIT_BYTES = 512;

/**
 * A failed ffmpeg run, classified so callers can branch on what happened
 * without parsing message strings:
 *
 *   - 'timeout': this module's own watchdog killed a run that exceeded its
 *     time ceiling.
 *   - 'signal': something outside this module killed the process — on a
 *     memory-limited container that is the cgroup enforcing its ceiling, which
 *     arrives as an exit code of null and a signal.
 *   - 'exit': ffmpeg itself failed and returned a non-zero exit code.
 */
export class FfmpegExecutionError extends Error {
  readonly kind: 'timeout' | 'signal' | 'exit';
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly timeoutMs?: number;
  readonly stderrTail: string;

  constructor(fields: {
    kind: 'timeout' | 'signal' | 'exit';
    exitCode: number | null;
    signal: NodeJS.Signals | null;
    timeoutMs?: number;
    stderrTail: string;
  }) {
    super(composeFfmpegErrorMessage(fields));
    this.name = 'FfmpegExecutionError';
    this.kind = fields.kind;
    this.exitCode = fields.exitCode;
    this.signal = fields.signal;
    this.timeoutMs = fields.timeoutMs;
    this.stderrTail = fields.stderrTail;
  }
}

function composeFfmpegErrorMessage(fields: {
  kind: 'timeout' | 'signal' | 'exit';
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  timeoutMs?: number;
  stderrTail: string;
}): string {
  if (fields.kind === 'timeout') {
    return `ffmpeg timed out after ${fields.timeoutMs} ms`;
  }
  if (fields.kind === 'signal') {
    return `ffmpeg killed by ${fields.signal}: ${fields.stderrTail}`;
  }
  return `ffmpeg exited with code ${fields.exitCode}: ${fields.stderrTail}`;
}

/**
 * Height cap for the output, expressed so the encoder never upscales: a source
 * already at or below the ceiling passes through untouched, a taller one is
 * reduced.
 *
 * This is the lever that bounds the per-frame encoding cost of an arbitrary
 * upload. Measured on one source at the same preset and thread count, 1080p
 * costs about 2.1x what 720p does and 4K several times more again, on a host
 * whose two vCPUs are shared with the web application. Without a cap a single
 * 4K upload dictates the time budget for everything.
 *
 * `-2` for width keeps the source aspect ratio and rounds to an even number,
 * which libx264 requires with yuv420p chroma subsampling. It works for portrait
 * sources too: a tall video is capped on its height and its width follows.
 */
export function buildHeightCapFilter(maxHeight: number): string {
  return `scale=-2:'min(${maxHeight},ih)'`;
}

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
 * Optional libx264 tuning knobs. All undefined = libx264 defaults
 * (preset=medium, auto-thread, rc-lookahead=40). Set on a small host where
 * the canonical defaults exceed the container memory budget.
 */
export interface VideoTranscodeTuning {
  preset?: string;
  threads?: number;
  rcLookahead?: number;
  /** Output height ceiling; defaults to the configured value. Never upscales. */
  maxHeight?: number;
  /**
   * Ceiling on one ffmpeg run, in milliseconds. A malformed input can put the
   * encoder into a loop that consumes a core and produces nothing; unbounded,
   * that holds the worker's video slot forever and the media job neither
   * completes nor fails.
   */
  timeoutMs?: number;
}

/**
 * detectVideoFormat against a file on disk, reading only the leading magic
 * bytes. Exists so the streaming path can validate an input that was never
 * held in memory as a whole.
 */
export async function detectVideoFormatFile(
  filePath: string,
): Promise<CuratorVideoFormat | null> {
  const handle = await open(filePath, 'r');
  try {
    const header = Buffer.alloc(12);
    const { bytesRead } = await handle.read(header, 0, 12, 0);
    return detectVideoFormat(header.subarray(0, bytesRead));
  } finally {
    await handle.close();
  }
}

/**
 * Validate that the buffer's magic bytes match a known curator-video input
 * format (mp4, webm, or mov). Returns the detected format, or null if
 * unrecognized. Strict enforcement at the boundary; the ffmpeg pipeline
 * itself does not auto-detect arbitrary formats.
 */
export function detectVideoFormat(data: Buffer): CuratorVideoFormat | null {
  if (data.length < 12) return null;
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
 * (`legacy_data/legacy_mirror/create_mirror_footbag_org.py`).
 */
export function buildFfmpegArgs(
  inputPath: string,
  outputPath: string,
  tuning?: VideoTranscodeTuning,
): string[] {
  // Tuning args go between -c:v libx264 and -c:a so they bind to the video
  // encoder. -preset and -threads are stream-position-sensitive in ffmpeg.
  const x264Tuning: string[] = [];
  if (tuning?.preset) x264Tuning.push('-preset', tuning.preset);
  if (tuning?.threads !== undefined) x264Tuning.push('-threads', String(tuning.threads));
  if (tuning?.rcLookahead !== undefined) {
    x264Tuning.push('-x264-params', `rc-lookahead=${tuning.rcLookahead}`);
  }

  return [
    '-i', inputPath,
    '-map', '0:v',
    '-map', '0:a?',
    '-map_metadata', '-1',
    '-map_chapters', '-1',
    '-vf', buildHeightCapFilter(tuning?.maxHeight ?? DEFAULT_VIDEO_MAX_HEIGHT),
    '-c:v', 'libx264',
    ...x264Tuning,
    '-c:a', 'aac',
    '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart',
    '-y',
    outputPath,
  ];
}

/**
 * Transcode a video file on disk to a sanitized MP4 file on disk. The
 * streaming counterpart of transcodeCuratorVideo: no video bytes are ever
 * held in this process's memory, so peak memory is the encoder child's
 * working set alone, independent of file size. The caller owns both paths
 * and their cleanup; outputPath must end in .mp4 so ffmpeg picks the muxer.
 *
 * Errors:
 *   - FfmpegExecutionError, classified by `kind`, when the ffmpeg run fails.
 *     Its stderr tail and message never contain either file's directory.
 *   - 'unrecognized video format' if the file's magic bytes do not match
 *     the curator-video input whitelist.
 */
export async function transcodeCuratorVideoFile(
  inputPath: string,
  outputPath: string,
  tuning?: VideoTranscodeTuning,
): Promise<{ outputFormat: 'mp4' }> {
  const detected = await detectVideoFormatFile(inputPath);
  if (!detected) {
    throw new Error('unrecognized video format');
  }
  try {
    await runFfmpeg(buildFfmpegArgs(inputPath, outputPath, tuning),
                    tuning?.timeoutMs ?? DEFAULT_FFMPEG_TIMEOUT_MS);
  } catch (err) {
    // ffmpeg echoes its input and output paths in its banner, so the captured
    // stderr routinely carries their directories. Only this function knows
    // those paths exactly, so they are scrubbed here rather than
    // pattern-guessed by a caller; no caller may surface a filesystem path.
    if (err instanceof FfmpegExecutionError) {
      throw new FfmpegExecutionError({
        kind: err.kind,
        exitCode: err.exitCode,
        signal: err.signal,
        timeoutMs: err.timeoutMs,
        stderrTail: err.stderrTail
          .split(path.dirname(inputPath)).join('[tmp]')
          .split(path.dirname(outputPath)).join('[tmp]'),
      });
    }
    throw err;
  }
  return { outputFormat: 'mp4' };
}

/**
 * Transcode an input video buffer to a sanitized MP4 buffer, via temp files
 * and transcodeCuratorVideoFile. Holds the whole input and output in memory,
 * so it is only for callers on hosts with adequate memory (the operator
 * seeder, local development, tests); the storage-fed worker route uses the
 * file variant and never buffers video bytes.
 *
 * Errors: same as transcodeCuratorVideoFile.
 */
export async function transcodeCuratorVideo(
  input: Buffer,
  tuning?: VideoTranscodeTuning,
): Promise<TranscodedVideo> {
  const detected = detectVideoFormat(input);
  if (!detected) {
    throw new Error('unrecognized video format');
  }

  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'curator-video-'));
  const inputPath = path.join(tmpDir, `in.${detected}`);
  const outputPath = path.join(tmpDir, 'out.mp4');

  try {
    await writeFile(inputPath, input);
    await transcodeCuratorVideoFile(inputPath, outputPath, tuning);
    const bytes = await readFile(outputPath);
    return { bytes, outputFormat: 'mp4' };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Bounded ffmpeg run. A malformed input can put the encoder into a loop that
 * consumes a core and produces nothing; unbounded, that holds the worker's
 * video slot forever and the media job neither completes nor fails. The ceiling
 * is deploy-time config so a slow host or an unusually long source can raise it.
 */
function runFfmpeg(
  args: string[],
  timeoutMs: number = DEFAULT_FFMPEG_TIMEOUT_MS,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'ignore', 'pipe'] });
    let stderrTail = '';
    let timedOut = false;
    // SIGKILL rather than SIGTERM: the failure mode being guarded against is an
    // encoder stuck in a loop, which is exactly the case that may not honour a
    // polite signal.
    const timer = setTimeout(() => {
      timedOut = true;
      proc.kill('SIGKILL');
    }, timeoutMs);
    proc.stderr.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-FFMPEG_STDERR_TAIL_BYTES);
    });
    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    // A process killed by a signal closes with a null code and the signal set.
    // Binding only the code would report the literal "code null" and lose the
    // one fact that distinguishes an external kill (a memory-ceiling
    // enforcement) from an encoder failure.
    proc.on('close', (code, signal) => {
      clearTimeout(timer);
      if (timedOut) {
        reject(new FfmpegExecutionError({
          kind: 'timeout', exitCode: code, signal, timeoutMs, stderrTail,
        }));
      } else if (code === 0) {
        resolve();
      } else if (signal !== null) {
        reject(new FfmpegExecutionError({
          kind: 'signal', exitCode: code, signal, timeoutMs, stderrTail,
        }));
      } else {
        reject(new FfmpegExecutionError({
          kind: 'exit', exitCode: code, signal, timeoutMs, stderrTail,
        }));
      }
    });
  });
}
