/**
 * GET /dev/legacy-news — local-only inspection surface for the extracted legacy
 * footbag.org news archive.
 *
 * This is a DEBUG / INSPECTION surface, NOT a production feature. It reads the
 * forensic NDJSON produced by the legacy-archive ingest pipeline
 * (legacy_data/legacy_archive/parsed/news/news.ndjson) directly off disk and
 * renders a paginated, searchable, read-only view.
 *
 * Isolation (why this never reaches production):
 *   - Part of src/testkit/, which is stripped from the production image at
 *     build time, and the /dev mount in app.ts is env-gated to development +
 *     staging only. Double exclusion.
 *   - Read-only: opens no database, touches no live/canonical table, has zero
 *     write paths. It can only read the gitignored parsed NDJSON.
 *   - The parsed NDJSON is a local artifact; if it is absent (e.g. staging), the
 *     handler renders an empty "not extracted here" state rather than erroring.
 *
 * No canonicalization: nothing here promotes, normalizes, or publishes the
 * legacy data. Legacy markup is tag-stripped and Handlebars-escaped so it
 * renders as inert text, never as live HTML.
 */
import { Request, Response, NextFunction } from 'express';
import * as fs from 'node:fs';
import * as path from 'node:path';

const NDJSON_PATH = path.join(
  process.cwd(),
  'legacy_data', 'legacy_archive', 'parsed', 'news', 'news.ndjson',
);
const PAGE_SIZE = 25;
const HEADLINE_LEN = 100;
const EXCERPT_LEN = 240;

interface LegacyNewsRow {
  NewsID?: number;
  Day?: number;
  Month?: number;
  Year?: number;
  NewsHeadline?: string;
  NewsDetails?: string;
  _legacy_source?: string;
  _legacy_table?: string;
  _legacy_pk?: number;
  _dump_sha256?: string;
  _dump_date?: string;
  _ingest_run_id?: string;
}

// mtime-keyed cache so re-extraction is picked up without a server restart,
// without re-parsing 17k lines on every pagination click.
let cache: { mtimeMs: number; rows: LegacyNewsRow[] } | null = null;

function loadRows(): LegacyNewsRow[] | null {
  if (!fs.existsSync(NDJSON_PATH)) return null;
  const { mtimeMs } = fs.statSync(NDJSON_PATH);
  if (cache && cache.mtimeMs === mtimeMs) return cache.rows;
  const rows = fs.readFileSync(NDJSON_PATH, 'utf8')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => JSON.parse(line) as LegacyNewsRow);
  cache = { mtimeMs, rows };
  return rows;
}

function stripHtml(value: string | undefined): string {
  if (!value) return '';
  return value.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

function dateKey(row: LegacyNewsRow): number {
  return (row.Year ?? 0) * 10000 + (row.Month ?? 0) * 100 + (row.Day ?? 0);
}

function displayDate(row: LegacyNewsRow): string {
  if (!row.Year) return '—';
  const pad = (n: number | undefined) => String(n ?? 0).padStart(2, '0');
  return `${row.Year}-${pad(row.Month)}-${pad(row.Day)}`;
}

export function getDevLegacyNews(req: Request, res: Response, next: NextFunction): void {
  try {
    // Defense-in-depth: a dev/inspection surface must never be indexed. Set at
    // the HTTP level (the shared layout has no per-page robots hook, and this is
    // the reliable form of the directive). The surface is never served in
    // production anyway, so this is belt-and-suspenders.
    res.set('X-Robots-Tag', 'noindex, nofollow');
    const all = loadRows();
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const pageRaw = Number.parseInt(String(req.query.page ?? '1'), 10);

    if (all === null) {
      res.render('dev/legacy-news', {
        seo: { title: 'Legacy news (inspection)' },
        page: { sectionKey: '', pageKey: 'dev_legacy_news', title: 'Legacy news archive' },
        missing: true, ndjsonPath: NDJSON_PATH, q, rows: [], pagination: null, totalRows: 0,
      });
      return;
    }

    const needle = q.toLowerCase();
    const filtered = (needle
      ? all.filter((r) => stripHtml(r.NewsHeadline).toLowerCase().includes(needle))
      : all
    ).slice().sort((a, b) => dateKey(b) - dateKey(a) || (b.NewsID ?? 0) - (a.NewsID ?? 0));

    const totalRows = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalRows / PAGE_SIZE));
    const pageNum = Math.min(Math.max(Number.isNaN(pageRaw) ? 1 : pageRaw, 1), totalPages);
    const start = (pageNum - 1) * PAGE_SIZE;

    const rows = filtered.slice(start, start + PAGE_SIZE).map((r) => ({
      newsId: r.NewsID ?? null,
      date: displayDate(r),
      headline: truncate(stripHtml(r.NewsHeadline), HEADLINE_LEN) || '—',
      excerpt: truncate(stripHtml(r.NewsDetails), EXCERPT_LEN),
      provenance: {
        source: r._legacy_source, table: r._legacy_table, pk: r._legacy_pk,
        dumpSha256: r._dump_sha256, dumpDate: r._dump_date, ingestRunId: r._ingest_run_id,
      },
    }));

    const qParam = q ? `&q=${encodeURIComponent(q)}` : '';
    res.render('dev/legacy-news', {
      seo: { title: 'Legacy news (inspection)' },
      page: { sectionKey: '', pageKey: 'dev_legacy_news', title: 'Legacy news archive' },
      missing: false,
      q,
      rows,
      totalRows,
      pagination: {
        page: pageNum,
        totalPages,
        hasPrev: pageNum > 1,
        hasNext: pageNum < totalPages,
        prevHref: `/dev/legacy-news?page=${pageNum - 1}${qParam}`,
        nextHref: `/dev/legacy-news?page=${pageNum + 1}${qParam}`,
      },
    });
  } catch (err) {
    next(err);
  }
}
