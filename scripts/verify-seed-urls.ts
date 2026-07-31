// Seed/sidecar external-URL safety verifier.
//
// Runs at data-authoring time (when club seed CSVs are made from the mirror, and
// when curator gallery sidecars are authored), NOT at app boot. It reuses the one
// canonical validator (`validateExternalUrl`: scheme + SSRF + Safe Browsing +
// reachability) and writes the verdict to committed companion files:
//   - clubs     -> legacy_data/seed/clubs_url_verdicts.csv
//   - galleries -> curated/galleries/url_verdicts.json
// Loaders read those companions and stamp validated_at / quarantine_reason, so
// deploy / soup-to-nuts / boot make zero third-party callouts.
//
// Idempotent: a row that already carries a verdict for its current URL is kept
// untouched (no callout); a row whose URL changed, or a new row, is re-verified.
// Real verdicts require the live Safe Browsing adapter + key in the environment
// running this; with the dev stub everything is "safe" except the canonical
// malware test URL.
// `dotenv` and the app config are loaded lazily, inside the default validator
// factory, so argument validation, prerequisite checks, --help and any run with
// an injected transport work with no .env file and no credentials present.
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import {
  readFileSync,
  writeFileSync,
  existsSync,
  readdirSync,
  statSync,
  renameSync,
  unlinkSync,
  mkdirSync,
  accessSync,
  constants as fsConstants,
} from 'node:fs';
// Shape-only rules, safe to import here: this module reads no config and makes no
// network call, unlike the full validator, which the pure core below must stay
// loadable without.
import { structuralUrlRejection } from '../src/lib/externalUrlShape';

const GALLERY_VERDICTS_FILE = 'url_verdicts.json';

// Exit statuses, distinct so a caller can tell the classes apart without reading
// prose. 5 is deliberately unused here: it is reserved for the semantic-invariant
// checks, which are a separate piece of work.
export const EXIT_OK = 0;
export const EXIT_PUBLICATION_FAILURE = 1;
export const EXIT_INVALID_INVOCATION = 2;
export const EXIT_MISSING_PREREQUISITE = 3;
export const EXIT_VALIDATOR_FAILURE = 4;

export const USAGE = `Usage: verify:seed-urls [options]

Verifies external URLs in the club seed and the curator gallery sidecars, and
records a verdict beside each. Two artifacts are owned, one per source:
  clubs     -> legacy_data/seed/clubs_url_verdicts.csv
  galleries -> curated/galleries/url_verdicts.json

Options:
  --clubs-only              Process the club seed only.
  --galleries-only          Process the gallery sidecars only.
  --dry-run                 Compute verdicts and report, writing nothing.
                            Still performs live validation.
  --clubs-seed FILE         Read club rows from FILE instead of the default
                            legacy_data/seed/clubs.csv. Selects the input only;
                            it does not move any verdict output.
  --clubs-verdicts FILE     Read and write the club verdicts at FILE instead of
                            the committed default.
  --gallery-verdicts FILE   Read and write the gallery verdicts at FILE instead
                            of the committed default.
  -h, --help                Show this message.

Each verdict flag names both the cache the run reads and the file it publishes,
so a redirected run neither reads nor writes the committed default. A relative
FILE resolves against the current working directory and the resolved absolute
path is printed. Redirecting one of two selected outputs is refused: a run that
moved half its output would leave the pair inconsistent.`;

export interface UrlVerdict {
  validated_at: string | null;
  quarantine_reason: string | null;
}

// Minimal shape of the canonical validator, so tests can inject a stub without
// loading config or touching the network.
export type ValidateFn = (
  url: string,
) => Promise<{ valid: boolean; error?: string }>;

function hasVerdict(v: UrlVerdict | undefined): v is UrlVerdict {
  return !!v && (v.validated_at !== null || v.quarantine_reason !== null);
}

// Verify a single URL unless a usable prior verdict for the SAME url exists.
//
// Shape decides first, ahead of any stored verdict and without a network call.
// The store exists to avoid repeating a lookup, not to let a URL keep a pass the
// current rules would not give it: tightening a shape rule has to reach the rows
// already stamped, or the tightening changes nothing until someone remembers to
// force a re-run. Quarantining here rather than re-asking the validator also
// spares a lookup for an address that could never have resolved anyway.
async function decide(
  url: string,
  prev: UrlVerdict | undefined,
  validate: ValidateFn,
  now: () => string,
): Promise<{ verdict: UrlVerdict; kept: boolean }> {
  const refusedByShape = structuralUrlRejection(url);
  if (refusedByShape) {
    return { verdict: { validated_at: null, quarantine_reason: refusedByShape }, kept: false };
  }
  if (hasVerdict(prev)) return { verdict: prev, kept: true };
  let res: { valid: boolean; error?: string };
  try {
    res = await validate(url);
  } catch (err) {
    res = { valid: false, error: err instanceof Error ? err.message : String(err) };
  }
  if (res.valid) return { verdict: { validated_at: now(), quarantine_reason: null }, kept: false };
  return { verdict: { validated_at: null, quarantine_reason: res.error ?? 'unknown' }, kept: false };
}

export interface VerdictRunStats {
  verified: number;
  quarantined: number;
  kept: number;
}

export interface ClubVerdictRow {
  key: string;
  url: string;
  verdict: UrlVerdict;
}

// Pure core for clubs: given current (key,url) rows and prior verdicts, return
// the refreshed verdict set. Drops keys no longer present / with no URL.
export async function computeClubVerdicts(
  rows: Array<{ key: string; url: string }>,
  prior: Map<string, { url: string; verdict: UrlVerdict }>,
  validate: ValidateFn,
  now: () => string,
): Promise<{ out: ClubVerdictRow[]; stats: VerdictRunStats }> {
  const out: ClubVerdictRow[] = [];
  const stats: VerdictRunStats = { verified: 0, quarantined: 0, kept: 0 };
  for (const row of rows) {
    const url = row.url.trim();
    if (!url) continue;
    const priorEntry = prior.get(row.key);
    const prev = priorEntry && priorEntry.url === url ? priorEntry.verdict : undefined;
    const { verdict, kept } = await decide(url, prev, validate, now);
    if (kept) stats.kept += 1;
    else if (verdict.validated_at) stats.verified += 1;
    else stats.quarantined += 1;
    out.push({ key: row.key, url, verdict });
  }
  out.sort((a, b) => a.key.localeCompare(b.key) || a.url.localeCompare(b.url));
  return { out, stats };
}

export type GalleryVerdicts = Record<string, Record<string, UrlVerdict>>;

// Pure core for galleries: keyed by gallery id then URL.
export async function computeGalleryVerdicts(
  galleries: Array<{ id: string; urls: string[] }>,
  prior: GalleryVerdicts,
  validate: ValidateFn,
  now: () => string,
): Promise<{ out: GalleryVerdicts; stats: VerdictRunStats }> {
  const out: GalleryVerdicts = {};
  const stats: VerdictRunStats = { verified: 0, quarantined: 0, kept: 0 };
  for (const gallery of galleries) {
    for (const raw of gallery.urls) {
      const url = raw.trim();
      if (!url) continue;
      const prev = prior[gallery.id]?.[url];
      const { verdict, kept } = await decide(url, prev, validate, now);
      if (kept) stats.kept += 1;
      else if (verdict.validated_at) stats.verified += 1;
      else stats.quarantined += 1;
      (out[gallery.id] ??= {})[url] = verdict;
    }
  }
  return { out, stats };
}

// ── CSV helpers (RFC4180: quoted fields may contain commas, quotes, newlines) ──

export function parseCsvRecords(text: string): string[][] {
  const records: string[][] = [];
  let field = '';
  let record: string[] = [];
  let inQuotes = false;
  let i = 0;
  while (i < text.length) {
    const ch = text[i]!;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        inQuotes = false; i += 1; continue;
      }
      field += ch; i += 1; continue;
    }
    if (ch === '"') { inQuotes = true; i += 1; continue; }
    if (ch === ',') { record.push(field); field = ''; i += 1; continue; }
    if (ch === '\r') { i += 1; continue; }
    if (ch === '\n') { record.push(field); records.push(record); record = []; field = ''; i += 1; continue; }
    field += ch; i += 1;
  }
  if (field.length > 0 || record.length > 0) { record.push(field); records.push(record); }
  return records;
}

function csvEscape(v: string): string {
  return /[",\n\r]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
}

// ── CLI file I/O (paths passed in; nothing path-dependent runs at import) ──────

function readClubRows(csvPath: string): Array<{ key: string; url: string }> {
  const records = parseCsvRecords(readFileSync(csvPath, 'utf8'));
  if (records.length === 0) return [];
  const header = records[0]!;
  const keyIdx = header.indexOf('legacy_club_key');
  const urlIdx = header.indexOf('external_url');
  if (keyIdx < 0 || urlIdx < 0) {
    throw new Error(`clubs.csv missing legacy_club_key/external_url; headers: ${header.join(',')}`);
  }
  const rows: Array<{ key: string; url: string }> = [];
  for (let i = 1; i < records.length; i++) {
    const r = records[i]!;
    const key = (r[keyIdx] ?? '').trim();
    if (!key) continue;
    rows.push({ key, url: r[urlIdx] ?? '' });
  }
  return rows;
}

function readPriorClubVerdicts(verdictsPath: string): Map<string, { url: string; verdict: UrlVerdict }> {
  const prior = new Map<string, { url: string; verdict: UrlVerdict }>();
  if (!existsSync(verdictsPath)) return prior;
  const records = parseCsvRecords(readFileSync(verdictsPath, 'utf8'));
  if (records.length === 0) return prior;
  const h = records[0]!;
  const k = h.indexOf('legacy_club_key');
  const u = h.indexOf('external_url');
  const v = h.indexOf('validated_at');
  const q = h.indexOf('quarantine_reason');
  for (let i = 1; i < records.length; i++) {
    const r = records[i]!;
    const key = (r[k] ?? '').trim();
    if (!key) continue;
    prior.set(key, {
      url: r[u] ?? '',
      verdict: {
        validated_at: (r[v] ?? '') === '' ? null : r[v]!,
        quarantine_reason: (r[q] ?? '') === '' ? null : r[q]!,
      },
    });
  }
  return prior;
}

// Serialising and writing are separate so a run can build both artifacts in full
// before it publishes either, and so the exact bytes can be asserted without a
// filesystem.
export function serialiseClubVerdicts(rows: ClubVerdictRow[]): string {
  const lines = ['legacy_club_key,external_url,validated_at,quarantine_reason'];
  for (const r of rows) {
    lines.push([
      csvEscape(r.key),
      csvEscape(r.url),
      csvEscape(r.verdict.validated_at ?? ''),
      csvEscape(r.verdict.quarantine_reason ?? ''),
    ].join(','));
  }
  return lines.join('\n') + '\n';
}

function readGalleries(dir: string): Array<{ id: string; urls: string[] }> {
  const out: Array<{ id: string; urls: string[] }> = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith('.json') || file === GALLERY_VERDICTS_FILE) continue;
    const sidecar = JSON.parse(readFileSync(path.join(dir, file), 'utf8')) as {
      id?: string;
      externalLinks?: Array<{ url?: string }>;
    };
    if (!sidecar.id || !Array.isArray(sidecar.externalLinks)) continue;
    const urls = sidecar.externalLinks.map((l) => l.url ?? '').filter((u) => u.trim().length > 0);
    if (urls.length > 0) out.push({ id: sidecar.id, urls });
  }
  return out;
}

function readPriorGalleryVerdicts(verdictsPath: string): GalleryVerdicts {
  if (!existsSync(verdictsPath)) return {};
  return JSON.parse(readFileSync(verdictsPath, 'utf8')) as GalleryVerdicts;
}

// Deterministic JSON: gallery ids and URLs sorted, so re-runs produce stable
// diffs regardless of the order the sidecar directory happened to be read in.
export function serialiseGalleryVerdicts(verdicts: GalleryVerdicts): string {
  const sorted: GalleryVerdicts = {};
  for (const gid of Object.keys(verdicts).sort()) {
    const inner: Record<string, UrlVerdict> = {};
    for (const url of Object.keys(verdicts[gid]!).sort()) inner[url] = verdicts[gid]![url]!;
    sorted[gid] = inner;
  }
  return JSON.stringify(sorted, null, 2) + '\n';
}

// ── invocation contract ───────────────────────────────────────────────────────

export interface RunPlan {
  doClubs: boolean;
  doGalleries: boolean;
  dryRun: boolean;
  clubsCsv: string;
  clubsVerdicts: string;
  galleriesDir: string;
  galleryVerdicts: string;
  redirected: boolean;
  clubsSeedSelected: boolean;
}

export type ParseResult =
  | { ok: true; plan: RunPlan }
  | { ok: false; message: string; help?: boolean };

// Every refusal here happens before any file is read, any directory is created
// and any validator is constructed, so an invocation that cannot be honoured
// costs nothing and changes nothing.
export function parseArgs(argv: string[], repoRoot: string): ParseResult {
  let clubsOnly = false;
  let galleriesOnly = false;
  let dryRun = false;
  let clubsFlag: string | null = null;
  let galleryFlag: string | null = null;
  let clubsSeedFlag: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--help' || arg === '-h') return { ok: false, message: USAGE, help: true };
    else if (arg === '--dry-run') dryRun = true;
    else if (arg === '--clubs-only') clubsOnly = true;
    else if (arg === '--galleries-only') galleriesOnly = true;
    else if (arg === '--clubs-verdicts' || arg === '--gallery-verdicts' || arg === '--clubs-seed') {
      const value = argv[++i];
      if (value === undefined || value.startsWith('--')) {
        return { ok: false, message: `${arg} needs a file path` };
      }
      if (arg === '--clubs-verdicts') clubsFlag = value;
      else if (arg === '--clubs-seed') clubsSeedFlag = value;
      else galleryFlag = value;
    } else {
      return { ok: false, message: `unknown argument: ${arg}` };
    }
  }

  if (clubsOnly && galleriesOnly) {
    return {
      ok: false,
      message:
        '--clubs-only and --galleries-only together select nothing to do; pass ' +
        'one of them, or neither to process both.',
    };
  }

  const doClubs = !galleriesOnly;
  const doGalleries = !clubsOnly;

  if (!doClubs && clubsFlag !== null) {
    return { ok: false, message: '--clubs-verdicts was given but clubs are not being processed' };
  }
  if (!doClubs && clubsSeedFlag !== null) {
    return { ok: false, message: '--clubs-seed was given but clubs are not being processed' };
  }
  if (!doGalleries && galleryFlag !== null) {
    return { ok: false, message: '--gallery-verdicts was given but galleries are not being processed' };
  }
  // Redirecting one of two selected outputs would leave the pair split across
  // the checkout and the redirect, which is the state this contract exists to
  // prevent.
  if (doClubs && doGalleries && (clubsFlag === null) !== (galleryFlag === null)) {
    return {
      ok: false,
      message:
        'both outputs are selected, so redirect both or neither: pass ' +
        '--clubs-verdicts and --gallery-verdicts together, or narrow the run ' +
        'with --clubs-only or --galleries-only.',
    };
  }

  const galleriesDir = path.join(repoRoot, 'curated', 'galleries');
  const clubsVerdicts = clubsFlag === null
    ? path.join(repoRoot, 'legacy_data', 'seed', 'clubs_url_verdicts.csv')
    : path.resolve(clubsFlag);
  const galleryVerdicts = galleryFlag === null
    ? path.join(galleriesDir, GALLERY_VERDICTS_FILE)
    : path.resolve(galleryFlag);

  if (doClubs && doGalleries && clubsVerdicts === galleryVerdicts) {
    return {
      ok: false,
      message: `both outputs resolve to the same path: ${clubsVerdicts}`,
    };
  }

  return {
    ok: true,
    plan: {
      doClubs,
      doGalleries,
      dryRun,
      // The input selection is independent of the output redirect: choosing a
      // clubs file to read says nothing about where its verdicts are published.
      clubsCsv: clubsSeedFlag === null
        ? path.join(repoRoot, 'legacy_data', 'seed', 'clubs.csv')
        : path.resolve(clubsSeedFlag),
      clubsVerdicts,
      galleriesDir,
      galleryVerdicts,
      redirected: clubsFlag !== null || galleryFlag !== null,
      clubsSeedSelected: clubsSeedFlag !== null,
    },
  };
}

// ── destination checks and publication ────────────────────────────────────────

// Read-only. An input that exists but cannot serve as an input is a missing
// prerequisite, not a destination problem: the two call for opposite fixes, and
// conflating them sends an operator to the wrong end of the pipeline.
export function inputProblem(target: string, kind: 'file' | 'directory'): string | null {
  if (!existsSync(target)) return `${target} (not found)`;
  let stat;
  try {
    stat = statSync(target);
  } catch (err) {
    const reason = (err as NodeJS.ErrnoException).code ?? 'unreadable';
    return `${target} (${reason})`;
  }
  if (kind === 'file' && !stat.isFile()) return `${target} (not a regular file)`;
  if (kind === 'directory' && !stat.isDirectory()) return `${target} (not a directory)`;
  try {
    accessSync(target, fsConstants.R_OK);
  } catch {
    return `${target} (not readable)`;
  }
  return null;
}

// Read-only, so a dry run can use it without a write probe.
export function destinationProblem(target: string): string | null {
  if (existsSync(target) && statSync(target).isDirectory()) {
    return `output path is a directory, not a file: ${target}`;
  }
  let dir = path.dirname(target);
  for (;;) {
    if (existsSync(dir)) break;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  if (existsSync(dir) && !statSync(dir).isDirectory()) {
    return `output destination cannot be created because part of the path is a file: ${dir}`;
  }
  return null;
}

// `wx` reserves the name atomically, so a leftover from a crashed earlier run is
// never reused or overwritten. Such leftovers are deliberately not swept up: one
// may be the only surviving copy of a previous verdict set.
export function stageFile(finalPath: string, contents: string): string {
  const dir = path.dirname(finalPath);
  const base = path.basename(finalPath);
  for (let attempt = 0; attempt < 8; attempt++) {
    const staged = path.join(dir, `.${base}.partial-${randomBytes(6).toString('hex')}`);
    try {
      writeFileSync(staged, contents, { flag: 'wx' });
      return staged;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'EEXIST') throw err;
    }
  }
  throw new Error(`could not reserve a temporary file beside ${finalPath}`);
}

function discard(staged: string | null): void {
  if (!staged) return;
  try {
    unlinkSync(staged);
  } catch {
    // Cleanup never masks the error that caused it.
  }
}

// ── run ───────────────────────────────────────────────────────────────────────

export interface ValidatorBundle {
  validate: ValidateFn;
  describe: string;
  refuseToWrite: string | null;
}

export interface RunDeps {
  /** Injected transport. When present no config, .env or credential is loaded. */
  validate?: ValidateFn;
  /** Injected clock for validated_at, so a test never depends on wall time. */
  now?: () => string;
  createValidator?: () => Promise<ValidatorBundle>;
  /** The publication primitive, so a split publication can be provoked. */
  publish?: (staged: string, final: string) => void;
  log?: (message: string) => void;
  logError?: (message: string) => void;
}

// The real validator and everything it needs are constructed only when no
// transport was injected, which is what keeps argument handling, prerequisite
// checks and the whole test suite free of the environment contract.
async function defaultValidator(dryRun: boolean): Promise<ValidatorBundle> {
  await import('dotenv/config');
  const { validateExternalUrl } = await import('../src/lib/externalUrlValidator');
  const { config } = await import('../src/config/env');
  // A verdict is worth no more than the adapters that produced it, and the
  // development defaults produce nothing worth committing: the stub Safe Browsing
  // adapter calls every URL safe apart from one canonical test address, and a
  // disabled reachability adapter calls every URL reachable. Recording those as
  // verdicts would put a safety judgement nobody made into a committed file, and
  // that is worse than leaving a URL unverified: an unverified URL is correctly
  // hidden on the public page, while a stamped one is shown.
  //
  // Reachability is reported rather than required, because a verdict without it
  // is weaker but still honest about threats; Safe Browsing is the load-bearing
  // one, so a stub there refuses the write.
  const refuse = config.safeBrowsingAdapter !== 'live' && !dryRun
    ? `SAFE_BROWSING_ADAPTER is '${config.safeBrowsingAdapter}', so every verdict ` +
      'would be a stub answer rather than a real one. Set it to live with a key ' +
      'available, or pass --dry-run to see what would change without recording it.'
    : null;
  return {
    validate: (url) => validateExternalUrl(url),
    describe:
      `safeBrowsing=${config.safeBrowsingAdapter}, ` +
      `reachability=${config.httpReachabilityAdapter}`,
    refuseToWrite: refuse,
  };
}

export async function run(
  argv: string[],
  repoRoot: string,
  deps: RunDeps = {},
): Promise<number> {
  const log = deps.log ?? ((m: string) => console.log(m));
  const logError = deps.logError ?? ((m: string) => console.error(m));

  const parsed = parseArgs(argv, repoRoot);
  if (!parsed.ok) {
    if (parsed.help) {
      log(parsed.message);
      return EXIT_OK;
    }
    logError(`verify-seed-urls: ${parsed.message}`);
    return EXIT_INVALID_INVOCATION;
  }
  const plan = parsed.plan;

  // Prerequisites for the selected mode, reported together so one
  // misconfiguration costs one run rather than several.
  const missing: string[] = [];
  if (plan.doClubs) {
    const problem = inputProblem(plan.clubsCsv, 'file');
    if (problem) missing.push(problem);
  }
  if (plan.doGalleries) {
    const problem = inputProblem(plan.galleriesDir, 'directory');
    if (problem) missing.push(problem);
  }
  if (missing.length > 0) {
    logError(`verify-seed-urls: ${missing.length} required input(s) unusable:`);
    for (const p of missing) logError(`  ${p}`);
    logError(
      'The club seed comes from legacy_data/scripts/extract_clubs.py; the gallery ' +
      'sidecars are curator-authored under curated/galleries/.',
    );
    return EXIT_MISSING_PREREQUISITE;
  }
  if (plan.clubsSeedSelected) log(`clubs input <- ${plan.clubsCsv}`);

  // Destinations are checked read-only, before any validator exists, so an
  // unusable path never costs a network call.
  const targets: string[] = [];
  if (plan.doClubs) targets.push(plan.clubsVerdicts);
  if (plan.doGalleries) targets.push(plan.galleryVerdicts);
  for (const target of targets) {
    const problem = destinationProblem(target);
    if (problem) {
      logError(`verify-seed-urls: ${problem}`);
      return EXIT_INVALID_INVOCATION;
    }
  }
  if (plan.redirected) {
    if (plan.doClubs) log(`clubs verdicts -> ${plan.clubsVerdicts}`);
    if (plan.doGalleries) log(`gallery verdicts -> ${plan.galleryVerdicts}`);
  }

  let validate: ValidateFn;
  if (deps.validate) {
    validate = deps.validate;
  } else {
    let bundle: ValidatorBundle;
    try {
      bundle = await (deps.createValidator ?? (() => defaultValidator(plan.dryRun)))();
    } catch (err) {
      logError(
        'verify-seed-urls: could not initialise the URL validator: ' +
        (err instanceof Error ? err.message : String(err)),
      );
      return EXIT_VALIDATOR_FAILURE;
    }
    log(`verify-seed-urls: ${bundle.describe}`);
    if (bundle.refuseToWrite) {
      logError(`verify-seed-urls refused to write: ${bundle.refuseToWrite}`);
      return EXIT_VALIDATOR_FAILURE;
    }
    validate = bundle.validate;
  }
  const now = deps.now ?? ((): string => new Date().toISOString());

  // Compute and serialise everything before publishing anything, so a failure
  // anywhere in generation publishes neither artifact.
  let clubsBody: string | null = null;
  let galleryBody: string | null = null;
  const summaries: string[] = [];
  try {
    if (plan.doClubs) {
      const { out, stats } = await computeClubVerdicts(
        readClubRows(plan.clubsCsv), readPriorClubVerdicts(plan.clubsVerdicts), validate, now,
      );
      clubsBody = serialiseClubVerdicts(out);
      summaries.push(
        `clubs: ${out.length} rows -> verified=${stats.verified} ` +
        `quarantined=${stats.quarantined} kept=${stats.kept}`,
      );
    }
    if (plan.doGalleries) {
      const { out, stats } = await computeGalleryVerdicts(
        readGalleries(plan.galleriesDir), readPriorGalleryVerdicts(plan.galleryVerdicts), validate, now,
      );
      galleryBody = serialiseGalleryVerdicts(out);
      const count = Object.values(out).reduce((n, m) => n + Object.keys(m).length, 0);
      summaries.push(
        `galleries: ${count} urls -> verified=${stats.verified} ` +
        `quarantined=${stats.quarantined} kept=${stats.kept}`,
      );
    }
  } catch (err) {
    logError(
      'verify-seed-urls: verification failed, nothing was written: ' +
      (err instanceof Error ? err.message : String(err)),
    );
    return EXIT_VALIDATOR_FAILURE;
  }

  if (plan.dryRun) {
    for (const line of summaries) log(`${line} (dry-run, not written)`);
    return EXIT_OK;
  }

  // Publication. Each artifact is replaced atomically on its own; the two are
  // independent files read by different loaders, so there is deliberately no
  // cross-file rollback and this is not a transactional two-file commit. If the
  // first lands and the second fails, the run says exactly that.
  const published: string[] = [];
  let clubsStaged: string | null = null;
  let galleryStaged: string | null = null;
  try {
    if (clubsBody !== null) {
      mkdirSync(path.dirname(plan.clubsVerdicts), { recursive: true });
      clubsStaged = stageFile(plan.clubsVerdicts, clubsBody);
    }
    if (galleryBody !== null) {
      mkdirSync(path.dirname(plan.galleryVerdicts), { recursive: true });
      galleryStaged = stageFile(plan.galleryVerdicts, galleryBody);
    }
    const publish = deps.publish ?? ((s: string, f: string) => renameSync(s, f));
    if (clubsStaged) {
      publish(clubsStaged, plan.clubsVerdicts);
      clubsStaged = null;
      published.push(plan.clubsVerdicts);
    }
    if (galleryStaged) {
      publish(galleryStaged, plan.galleryVerdicts);
      galleryStaged = null;
      published.push(plan.galleryVerdicts);
    }
  } catch (err) {
    const notPublished = targets.filter((t) => !published.includes(t));
    logError(
      'verify-seed-urls: publication failed: ' +
      (err instanceof Error ? err.message : String(err)),
    );
    for (const p of published) logError(`  published: ${p}`);
    for (const p of notPublished) logError(`  not published: ${p}`);
    return EXIT_PUBLICATION_FAILURE;
  } finally {
    discard(clubsStaged);
    discard(galleryStaged);
  }

  for (const line of summaries) log(line);
  for (const p of published) log(`wrote ${p}`);
  return EXIT_OK;
}

// Run only as a CLI, not when imported by tests.
if (typeof require !== 'undefined' && require.main === module) {
  run(process.argv.slice(2), path.resolve(__dirname, '..'))
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error('verify-seed-urls failed:', err);
      process.exit(EXIT_PUBLICATION_FAILURE);
    });
}
