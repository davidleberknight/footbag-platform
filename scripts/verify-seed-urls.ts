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
import 'dotenv/config';
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';

const GALLERY_VERDICTS_FILE = 'url_verdicts.json';

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
async function decide(
  url: string,
  prev: UrlVerdict | undefined,
  validate: ValidateFn,
  now: () => string,
): Promise<{ verdict: UrlVerdict; kept: boolean }> {
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

function writeClubVerdicts(verdictsPath: string, rows: ClubVerdictRow[]): void {
  const lines = ['legacy_club_key,external_url,validated_at,quarantine_reason'];
  for (const r of rows) {
    lines.push([
      csvEscape(r.key),
      csvEscape(r.url),
      csvEscape(r.verdict.validated_at ?? ''),
      csvEscape(r.verdict.quarantine_reason ?? ''),
    ].join(','));
  }
  writeFileSync(verdictsPath, lines.join('\n') + '\n');
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

// Deterministic JSON: gallery ids and URLs sorted, so re-runs produce stable diffs.
function writeGalleryVerdicts(verdictsPath: string, verdicts: GalleryVerdicts): void {
  const sorted: GalleryVerdicts = {};
  for (const gid of Object.keys(verdicts).sort()) {
    const inner: Record<string, UrlVerdict> = {};
    for (const url of Object.keys(verdicts[gid]!).sort()) inner[url] = verdicts[gid]![url]!;
    sorted[gid] = inner;
  }
  writeFileSync(verdictsPath, JSON.stringify(sorted, null, 2) + '\n');
}

async function main(): Promise<number> {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes('--dry-run');
  const clubsOnly = argv.includes('--clubs-only');
  const galleriesOnly = argv.includes('--galleries-only');
  const doClubs = !galleriesOnly;
  const doGalleries = !clubsOnly;

  const repoRoot = path.resolve(__dirname, '..');
  const clubsCsv = path.join(repoRoot, 'legacy_data', 'seed', 'clubs.csv');
  const clubsVerdicts = path.join(repoRoot, 'legacy_data', 'seed', 'clubs_url_verdicts.csv');
  const galleriesDir = path.join(repoRoot, 'curated', 'galleries');
  const galleryVerdicts = path.join(galleriesDir, GALLERY_VERDICTS_FILE);

  const { validateExternalUrl } = await import('../src/lib/externalUrlValidator');
  const validate: ValidateFn = (url) => validateExternalUrl(url);
  const nowIso = (): string => new Date().toISOString();

  if (doClubs) {
    if (!existsSync(clubsCsv)) {
      console.warn(`verify-seed-urls: ${clubsCsv} not found; skipping clubs.`);
    } else {
      const { out, stats } = await computeClubVerdicts(
        readClubRows(clubsCsv), readPriorClubVerdicts(clubsVerdicts), validate, nowIso,
      );
      if (!dryRun) writeClubVerdicts(clubsVerdicts, out);
      console.log(
        `clubs: ${out.length} rows -> verified=${stats.verified} quarantined=${stats.quarantined} kept=${stats.kept}` +
        (dryRun ? ' (dry-run, not written)' : ` -> ${path.relative(repoRoot, clubsVerdicts)}`),
      );
    }
  }

  if (doGalleries) {
    if (!existsSync(galleriesDir)) {
      console.warn(`verify-seed-urls: ${galleriesDir} not found; skipping galleries.`);
    } else {
      const { out, stats } = await computeGalleryVerdicts(
        readGalleries(galleriesDir), readPriorGalleryVerdicts(galleryVerdicts), validate, nowIso,
      );
      if (!dryRun) writeGalleryVerdicts(galleryVerdicts, out);
      const count = Object.values(out).reduce((n, m) => n + Object.keys(m).length, 0);
      console.log(
        `galleries: ${count} urls -> verified=${stats.verified} quarantined=${stats.quarantined} kept=${stats.kept}` +
        (dryRun ? ' (dry-run, not written)' : ` -> ${path.relative(repoRoot, galleryVerdicts)}`),
      );
    }
  }
  return 0;
}

// Run only as a CLI, not when imported by tests.
if (typeof require !== 'undefined' && require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error('verify-seed-urls failed:', err);
    process.exit(1);
  });
}
