/**
 * Transcodes one curator video file through the platform's own transcode, for
 * callers that are not the image worker: the curator seeder, which is Python.
 *
 * Why this exists: every path that turns a curated video into served video must
 * strip it with one argument set and one time limit, so that tightening the
 * pipeline once tightens every path. A second copy of the ffmpeg options in the
 * seeder drifted from the worker's (it lost the output height cap), so the
 * seeder runs this instead, and this runs exactly the function the image worker
 * runs, with the worker's defaults.
 *
 * Usage:
 *   tsx scripts/transcode-curator-video.ts <input> <output.mp4>
 *
 * FFMPEG_TIMEOUT_SECONDS, the same variable the image worker and the pinned
 * ffmpeg runner read, raises the time limit for a slow machine; unset, the
 * worker's default applies.
 *
 * What it refuses to do (exit 2): run without exactly an input and an output,
 * write anything but an .mp4, or accept a time limit that is not a positive
 * whole number of seconds. A failed or timed-out encode exits 1 with the
 * encoder's reason on stderr.
 */
import {
  DEFAULT_FFMPEG_TIMEOUT_MS,
  transcodeCuratorVideoFile,
} from '../src/lib/videoProcessing';

function refuse(message: string): never {
  process.stderr.write(`ERROR: ${message}\n`);
  process.exit(2);
}

const args = process.argv.slice(2);
if (args.length !== 2) {
  refuse('usage: tsx scripts/transcode-curator-video.ts <input> <output.mp4>');
}
const [input, output] = args;
if (!output.endsWith('.mp4')) {
  refuse(`the output must be an .mp4 file, got ${output}`);
}

const override = process.env.FFMPEG_TIMEOUT_SECONDS;
if (override !== undefined && !/^[1-9][0-9]*$/.test(override)) {
  refuse(`FFMPEG_TIMEOUT_SECONDS must be a positive whole number of seconds, got "${override}"`);
}
const timeoutMs = override !== undefined ? Number(override) * 1000 : DEFAULT_FFMPEG_TIMEOUT_MS;

transcodeCuratorVideoFile(input, output, { timeoutMs }).then(
  () => process.exit(0),
  (err: unknown) => {
    process.stderr.write(`ERROR: transcode failed: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  },
);
