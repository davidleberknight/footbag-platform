// loadCheck.ts
//
// The request driver behind scripts/load-check.sh. It issues a weighted mix of
// real page requests at a fixed concurrency for a fixed duration and reports the
// client-side latency distribution and error rate.
//
// It is never run directly by an operator: load-check.sh resolves the staging
// address, refuses production, mints the one session this uses, and reads the
// CloudWatch side back afterwards. This half only drives requests and does the
// arithmetic.
//
// Two properties are deliberate.
//
// Every HTML path here reaches the origin. The distribution serves all HTML
// under the managed CachingDisabled policy (terraform/<env>/cloudfront.tf), so
// no cache-busting is needed and none is done: the mix measured at the edge is
// the mix the origin serves.
//
// Redirects are not followed. A page that starts answering 302 is a change in
// what the run measures, so it surfaces as an unexpected status in the preflight
// rather than as a quietly longer request.
import { readFileSync, writeFileSync } from 'node:fs';

export interface ScenarioEntry {
  /** Request path, including its leading slash. */
  path: string;
  /** Share of the mix, as a whole number. Weights need not sum to 100. */
  weight: number;
  /** Whether the request carries the member session cookie. */
  authenticated: boolean;
}

export interface RequestSample {
  path: string;
  /** HTTP status, or 0 when the request never produced a response. */
  status: number;
  ms: number;
}

export interface PathSummary {
  path: string;
  count: number;
  errors: number;
  p50: number;
  p95: number;
}

export interface Summary {
  requests: number;
  errors: number;
  errorRate: number;
  requestsPerSecond: number;
  requestsPerMinute: number;
  elapsedSeconds: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
  max: number;
  perPath: PathSummary[];
}

/**
 * The mix. Weights describe a small association's reading traffic: mostly the
 * front page and the two sections that carry the most content, with a thin tail
 * of sign-in and one signed-in page.
 *
 * The paths are the ones scripts/smoke-local.sh already probes, so a route that
 * disappears breaks the smoke check first rather than silently changing what a
 * baseline means.
 */
export function buildScenario(memberPath: string): ScenarioEntry[] {
  return [
    { path: '/', weight: 25, authenticated: false },
    { path: '/events', weight: 15, authenticated: false },
    { path: '/events/year/2025', weight: 10, authenticated: false },
    { path: '/clubs', weight: 10, authenticated: false },
    { path: '/freestyle', weight: 15, authenticated: false },
    { path: '/freestyle/tricks', weight: 15, authenticated: false },
    { path: '/login', weight: 5, authenticated: false },
    { path: memberPath, weight: 5, authenticated: true },
  ];
}

/**
 * Expand the weights into the sequence a worker walks. Workers start at
 * different offsets in this sequence, so a run does not put every worker on the
 * same path at the same instant, which would measure a thundering herd rather
 * than a mix.
 */
export function expandScenario(entries: ScenarioEntry[]): ScenarioEntry[] {
  const expanded: ScenarioEntry[] = [];
  for (const entry of entries) {
    for (let i = 0; i < entry.weight; i += 1) expanded.push(entry);
  }
  return expanded;
}

/**
 * Nearest-rank percentile over an already-sorted array of milliseconds.
 * Returns 0 for an empty sample rather than NaN, so a report never carries a
 * number that formats as "NaN ms" and reads like a measurement.
 */
export function percentile(sortedMs: number[], p: number): number {
  if (sortedMs.length === 0) return 0;
  const rank = Math.ceil((p / 100) * sortedMs.length);
  const index = Math.min(Math.max(rank, 1), sortedMs.length) - 1;
  return sortedMs[index];
}

/**
 * A request counts as an error when it produced no response at all, or when the
 * server answered 5xx. A 4xx is not an error here: /login answering 200 and a
 * missing page answering 404 are both the server working, and folding them in
 * would hide a real 5xx behind a scenario typo.
 */
export function isError(sample: RequestSample): boolean {
  return sample.status === 0 || sample.status >= 500;
}

export function summarize(samples: RequestSample[], elapsedSeconds: number): Summary {
  const all = samples.map((s) => s.ms).sort((a, b) => a - b);
  const errors = samples.filter(isError).length;

  const byPath = new Map<string, RequestSample[]>();
  for (const sample of samples) {
    const list = byPath.get(sample.path);
    if (list === undefined) byPath.set(sample.path, [sample]);
    else list.push(sample);
  }

  const perPath: PathSummary[] = [...byPath.entries()]
    .map(([path, list]) => {
      const sorted = list.map((s) => s.ms).sort((a, b) => a - b);
      return {
        path,
        count: list.length,
        errors: list.filter(isError).length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return {
    requests: samples.length,
    errors,
    errorRate: samples.length === 0 ? 0 : errors / samples.length,
    requestsPerSecond: elapsedSeconds === 0 ? 0 : samples.length / elapsedSeconds,
    requestsPerMinute: elapsedSeconds === 0 ? 0 : (samples.length / elapsedSeconds) * 60,
    elapsedSeconds,
    p50: percentile(all, 50),
    p90: percentile(all, 90),
    p95: percentile(all, 95),
    p99: percentile(all, 99),
    max: all.length === 0 ? 0 : all[all.length - 1],
    perPath,
  };
}

/**
 * Pull the session cookie out of a Netscape cookie jar as curl writes it.
 *
 * The jar is tab-separated with the name in field 7 and the value in field 8,
 * and curl prefixes a HttpOnly line with `#HttpOnly_`, which makes it look like
 * a comment. Skipping every line beginning with `#` therefore drops exactly the
 * cookie this needs, which is why the prefix is stripped before the filter.
 */
export function parseCookieJar(text: string): string {
  const pairs: string[] = [];
  for (const raw of text.split('\n')) {
    const line = raw.startsWith('#HttpOnly_') ? raw.slice('#HttpOnly_'.length) : raw;
    if (line.startsWith('#') || line.trim() === '') continue;
    const fields = line.split('\t');
    if (fields.length < 7) continue;
    const name = fields[5];
    const value = fields[6].trim();
    if (name !== '' && value !== '') pairs.push(`${name}=${value}`);
  }
  return pairs.join('; ');
}

interface Options {
  baseUrl: string;
  durationSeconds: number;
  concurrency: number;
  cookieFile: string;
  memberPath: string;
  outFile: string;
  preflightOnly: boolean;
}

function parseArgs(argv: string[]): Options {
  const options: Options = {
    baseUrl: '',
    durationSeconds: 0,
    concurrency: 0,
    cookieFile: '',
    memberPath: '',
    outFile: '',
    preflightOnly: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    switch (flag) {
      case '--base-url': options.baseUrl = value ?? ''; i += 1; break;
      case '--duration': options.durationSeconds = Number(value); i += 1; break;
      case '--concurrency': options.concurrency = Number(value); i += 1; break;
      case '--cookie-file': options.cookieFile = value ?? ''; i += 1; break;
      case '--member-path': options.memberPath = value ?? ''; i += 1; break;
      case '--out': options.outFile = value ?? ''; i += 1; break;
      case '--preflight': options.preflightOnly = true; break;
      default:
        throw new Error(`unknown argument '${flag}'`);
    }
  }

  for (const [name, present] of [
    ['--base-url', options.baseUrl !== ''],
    ['--cookie-file', options.cookieFile !== ''],
    ['--member-path', options.memberPath !== ''],
  ] as const) {
    if (!present) throw new Error(`${name} is required`);
  }

  return options;
}

async function timedRequest(
  baseUrl: string,
  entry: ScenarioEntry,
  cookie: string,
): Promise<RequestSample> {
  const started = performance.now();
  try {
    const response = await fetch(`${baseUrl}${entry.path}`, {
      redirect: 'manual',
      headers: entry.authenticated && cookie !== '' ? { cookie } : {},
    });
    // Drain the body, so the measurement covers the whole response rather than
    // the moment its headers arrived.
    await response.arrayBuffer();
    return { path: entry.path, status: response.status, ms: performance.now() - started };
  } catch {
    return { path: entry.path, status: 0, ms: performance.now() - started };
  }
}

/**
 * One request per distinct path before the timed run starts. A scenario path
 * that answers anything but 200 makes the whole baseline meaningless -- a 404 is
 * fast and would drag every percentile down -- so the run refuses rather than
 * reporting a number nobody can use.
 */
async function preflight(baseUrl: string, entries: ScenarioEntry[], cookie: string): Promise<number> {
  let bad = 0;
  for (const entry of entries) {
    const sample = await timedRequest(baseUrl, entry, cookie);
    const verdict = sample.status === 200 ? 'ok  ' : 'BAD ';
    if (sample.status !== 200) bad += 1;
    process.stdout.write(
      `  ${verdict} ${String(sample.status).padEnd(4)} ${entry.path}${entry.authenticated ? '  (signed in)' : ''}\n`,
    );
  }
  return bad;
}

function formatSummary(summary: Summary): string {
  const lines: string[] = [];
  lines.push('Client-side result');
  lines.push(`  requests          ${summary.requests}`);
  lines.push(`  errors            ${summary.errors} (${(summary.errorRate * 100).toFixed(2)}%)`);
  lines.push(`  elapsed           ${summary.elapsedSeconds.toFixed(1)}s`);
  lines.push(`  throughput        ${summary.requestsPerSecond.toFixed(1)}/s  ${summary.requestsPerMinute.toFixed(0)}/min`);
  lines.push(`  p50 / p90         ${summary.p50.toFixed(0)} ms / ${summary.p90.toFixed(0)} ms`);
  lines.push(`  p95 / p99 / max   ${summary.p95.toFixed(0)} ms / ${summary.p99.toFixed(0)} ms / ${summary.max.toFixed(0)} ms`);
  lines.push('');
  lines.push('  per path                       count  err    p50     p95');
  for (const row of summary.perPath) {
    lines.push(
      `  ${row.path.padEnd(30)} ${String(row.count).padStart(5)}  ${String(row.errors).padStart(3)}  ${row.p50.toFixed(0).padStart(5)}   ${row.p95.toFixed(0).padStart(5)}`,
    );
  }
  return lines.join('\n');
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const entries = buildScenario(options.memberPath);
  const cookie = parseCookieJar(readFileSync(options.cookieFile, 'utf-8'));

  if (options.preflightOnly) {
    const bad = await preflight(options.baseUrl, entries, cookie);
    if (bad > 0) {
      process.stderr.write(
        `\nERROR: ${bad} scenario path(s) did not answer 200. A baseline measured over a\n` +
        `       broken path is not a baseline. Fix the path or the persona, then re-run.\n`,
      );
      process.exit(1);
    }
    return;
  }

  const expanded = expandScenario(entries);
  const deadline = Date.now() + options.durationSeconds * 1000;
  const samples: RequestSample[] = [];
  const started = performance.now();

  const workers = Array.from({ length: options.concurrency }, async (_unused, workerIndex) => {
    let cursor = Math.floor((expanded.length / options.concurrency) * workerIndex);
    while (Date.now() < deadline) {
      const entry = expanded[cursor % expanded.length];
      cursor += 1;
      samples.push(await timedRequest(options.baseUrl, entry, cookie));
    }
  });

  await Promise.all(workers);

  const summary = summarize(samples, (performance.now() - started) / 1000);
  process.stdout.write(`${formatSummary(summary)}\n`);
  if (options.outFile !== '') {
    writeFileSync(options.outFile, `${JSON.stringify(summary, null, 2)}\n`, 'utf-8');
  }
}

// Only run when invoked as a program, so the exported helpers above can be
// imported by a unit test without driving any traffic. The check reads argv
// rather than the CommonJS `require.main`, because the unit test imports this
// module through the ESM-shaped test runner, where that symbol does not exist.
const invokedDirectly =
  process.argv[1] !== undefined && /loadCheck\.ts$/.test(process.argv[1]);

if (invokedDirectly) {
  main().catch((err: unknown) => {
    process.stderr.write(`ERROR: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(2);
  });
}
