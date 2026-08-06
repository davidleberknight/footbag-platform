/**
 * The media container boots without the web environment contract.
 *
 * That container decodes untrusted input through ffmpeg, so it is deliberately
 * given the least it can run on: unprivileged, every capability dropped, no
 * session secret, no public base URL, no database path, no credentials. The
 * application config validates the whole web contract the moment it loads, so
 * any module reachable from the container's entrypoint that imports it stops
 * the container from starting at all. The container then fails its health
 * check, and the web and proxy containers that wait on it never start either,
 * which reaches a reader as a gateway error from the edge with nothing in the
 * web logs to explain it.
 *
 * The reachability test below is the general form and the one that matters: it
 * walks the entrypoint's whole runtime import graph, so a future import added
 * anywhere in it fails here rather than in a deploy. The boot tests underneath
 * pin the same contract from the other side, by loading the transcode library
 * with the web-only variables genuinely absent.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import * as path from 'node:path';

const SRC = path.resolve(__dirname, '../../src');

// Entrypoints whose containers are denied the web contract, and the module
// whose import would impose it. Add a row when a container is given the same
// treatment; the walk below then covers its whole graph too.
const DENIED_THE_WEB_CONTRACT = [
  { entry: 'imageWorker.ts', container: 'the media/transcode container' },
];
const WEB_CONFIG = path.join(SRC, 'config', 'env.ts');

/** Runtime imports only: a type-only import is erased and cannot load anything. */
function runtimeRelativeImports(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  const out: string[] = [];
  const pattern = /^\s*import\s+([\s\S]*?)\s*from\s*['"](\.[^'"]+)['"]/gm;
  for (const match of source.matchAll(pattern)) {
    const clause = match[1];
    if (/^type\s/.test(clause.trim())) continue;
    out.push(match[2]);
  }
  return out;
}

function resolveModule(fromFile: string, specifier: string): string | null {
  const base = path.resolve(path.dirname(fromFile), specifier);
  for (const candidate of [`${base}.ts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/** Every file the entrypoint can load at runtime, and how it got there. */
function importGraph(entry: string): Map<string, string[]> {
  const paths = new Map<string, string[]>([[entry, [path.basename(entry)]]]);
  const pending = [entry];
  while (pending.length > 0) {
    const current = pending.shift() as string;
    const trail = paths.get(current) as string[];
    for (const specifier of runtimeRelativeImports(current)) {
      const resolved = resolveModule(current, specifier);
      if (resolved === null || paths.has(resolved)) continue;
      paths.set(resolved, [...trail, path.relative(SRC, resolved)]);
      pending.push(resolved);
    }
  }
  return paths;
}

describe.each(DENIED_THE_WEB_CONTRACT)(
  'a container denied the web contract ($container)',
  ({ entry, container }) => {
    it('imports nothing that loads the web configuration', () => {
      const graph = importGraph(path.join(SRC, entry));
      const trail = graph.get(WEB_CONFIG);
      expect(
        trail === undefined,
        trail === undefined
          ? ''
          : `${container} reaches the web configuration through:\n  ` +
            trail.join('\n    -> ') +
            '\nThat config validates the whole web environment contract when it ' +
            'loads, and this container is given none of it, so importing it ' +
            'stops the container from starting.',
      ).toBe(true);
    });
  },
);

const WEB_ONLY_VARS = ['PORT', 'SESSION_SECRET', 'PUBLIC_BASE_URL', 'FOOTBAG_DB_PATH'];

describe('curator transcode library, booted as the media container boots it', () => {
  let saved: Record<string, string | undefined>;

  beforeEach(() => {
    saved = {};
    for (const name of WEB_ONLY_VARS) {
      saved[name] = process.env[name];
      delete process.env[name];
    }
  });

  afterEach(() => {
    for (const [name, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  });

  it('imports with none of the web-only environment present', async () => {
    const mod = await import('../../src/lib/videoProcessing?containerBoundary');
    expect(typeof mod.transcodeCuratorVideo).toBe('function');
  });

  // Setting an encoder bound in the environment must not reach the library: it
  // takes its bounds as arguments from the entry point that is allowed to read
  // the environment, and applies its own default when given none. A library
  // that quietly honoured the variable would be reading environment again.
  it('ignores the encoder bounds in the environment and applies its own default', async () => {
    const saved = process.env.VIDEO_MAX_HEIGHT;
    process.env.VIDEO_MAX_HEIGHT = '720';
    try {
      const { buildFfmpegArgs, DEFAULT_VIDEO_MAX_HEIGHT } = await import(
        '../../src/lib/videoProcessing?boundsAreArguments');
      const fromEnv = buildFfmpegArgs('in.mp4', 'out.mp4');
      expect(fromEnv[fromEnv.indexOf('-vf') + 1]).toBe(
        `scale=-2:'min(${DEFAULT_VIDEO_MAX_HEIGHT},ih)'`,
      );
      const given = buildFfmpegArgs('in.mp4', 'out.mp4', { maxHeight: 480 });
      expect(given[given.indexOf('-vf') + 1]).toBe("scale=-2:'min(480,ih)'");
    } finally {
      if (saved === undefined) delete process.env.VIDEO_MAX_HEIGHT;
      else process.env.VIDEO_MAX_HEIGHT = saved;
    }
  });
});

/**
 * The default each encoder bound falls back to is defined once, by the
 * transcode library, and the application config validates an operator override
 * against that same definition. Two literals kept in step by hand would let a
 * change to one of them pass every test while the encoder and the config
 * disagreed about what an unset variable means.
 */
describe('encoder-bound defaults', () => {
  it('are the values the application config enforces', async () => {
    const { DEFAULT_VIDEO_MAX_HEIGHT, DEFAULT_FFMPEG_TIMEOUT_MS } = await import(
      '../../src/lib/videoProcessing');
    const { config } = await import('../../src/config/env');
    expect(config.videoMaxHeight).toBe(DEFAULT_VIDEO_MAX_HEIGHT);
    expect(config.ffmpegTimeoutSeconds * 1000).toBe(DEFAULT_FFMPEG_TIMEOUT_MS);
  });
});
