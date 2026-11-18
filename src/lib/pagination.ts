/**
 * The shared pager's view model, shaped once for every paged list so the one
 * `_pager` partial reads the same block wherever it appears.
 */
import { NotFoundError } from '../services/serviceErrors';

// One entry in the numbered pager: a page link, the current page, or a gap
// standing for skipped pages. `isNeighbour` marks the pages beside the current
// one, which a phone-width screen drops to keep the row on one line.
export interface PageLink {
  number: number | null;
  href: string | null;
  isCurrent: boolean;
  isGap: boolean;
  isNeighbour: boolean;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextHref?: string;
  prevHref?: string;
  // True when the set spans more than one page; the pager renders only then.
  isMultiPage: boolean;
  pageLinks: PageLink[];
  statusLabel: string;
}

// The pager shows the first page, the last page, the current page and the pages on
// either side of it, with a gap wherever pages are skipped.
function buildPageLinks(page: number, totalPages: number, href: (p: number) => string): PageLink[] {
  const shown = new Set<number>([1, totalPages, page, page - 1, page + 1]);
  const numbers = [...shown].filter((p) => p >= 1 && p <= totalPages).sort((a, b) => a - b);
  const links: PageLink[] = [];
  let previous = 0;
  for (const p of numbers) {
    if (p - previous > 1) {
      links.push({ number: null, href: null, isCurrent: false, isGap: true, isNeighbour: false });
    }
    const isCurrent = p === page;
    links.push({
      number: p,
      href: isCurrent ? null : href(p),
      isCurrent,
      isGap: false,
      isNeighbour: !isCurrent && p !== 1 && p !== totalPages,
    });
    previous = p;
  }
  return links;
}

/** A requested page number read from a query: anything missing, malformed or
 *  below one is the first page. */
export function sanitizePage(raw: unknown): number {
  const n =
    typeof raw === 'string' ? parseInt(raw, 10)
    : typeof raw === 'number' ? raw
    : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

/**
 * Resolves the requested page against the set size: a missing or malformed
 * page is the first, and a page past the last is not found, so a stale or
 * hand-edited link never renders a misleading empty set.
 */
export function resolvePage(
  rawPage: unknown, total: number, pageSize: number, what: string,
): { page: number; totalPages: number } {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const page = sanitizePage(rawPage);
  if (page > totalPages) throw new NotFoundError(`${what} page ${page} out of range`);
  return { page, totalPages };
}

export function shapePagination(args: {
  page: number;
  totalPages: number;
  pageSize: number;
  total: number;
  href: (p: number) => string;
}): Pagination {
  const { page, totalPages, pageSize, total, href } = args;
  const hasPrev = page > 1;
  const hasNext = page < totalPages;
  const isMultiPage = totalPages > 1;
  return {
    page,
    pageSize,
    total,
    totalPages,
    hasNext,
    hasPrev,
    ...(hasPrev ? { prevHref: href(page - 1) } : {}),
    ...(hasNext ? { nextHref: href(page + 1) } : {}),
    isMultiPage,
    pageLinks: isMultiPage ? buildPageLinks(page, totalPages, href) : [],
    statusLabel: `Page ${page} of ${totalPages}`,
  };
}
