/**
 * A refused member search on a page, carried from the page's service to the
 * controller that sends it.
 *
 * The member search is limited per IP and per member, and a refused search is
 * returned as data so the page still renders with its wait notice inside the
 * form. The response must still say it was refused: status 429 with a
 * Retry-After header naming the wait. The service knows whether the page's one
 * search was refused; the controller chooses the status. So the service puts
 * the wait on the page's metadata through `searchRefusalMeta`, and the
 * controller turns it into the status and header through `statusForPage`.
 */
import type { Response } from 'express';

/** Anything a page shows a search through: a search block or a member picker. */
export interface SearchOutcomeLike {
  rateLimited: boolean;
  retryAfterSeconds: number | null;
}

/**
 * The page metadata a refused search adds: the wait of the first refused
 * search among the page's searches, or nothing when none was refused. Spread
 * into the page's `page` object. A page runs at most one search per request,
 * so the first refused one is the only one.
 */
export function searchRefusalMeta(
  ...searches: ReadonlyArray<SearchOutcomeLike | null | undefined>
): { rateLimitRetryAfterSeconds?: number } {
  for (const s of searches) {
    if (s?.rateLimited) return { rateLimitRetryAfterSeconds: Math.max(1, s.retryAfterSeconds ?? 60) };
  }
  return {};
}

/**
 * The status to send a rendered page with: 429, with its Retry-After header
 * set, when the page carries a refused search; otherwise the status the
 * controller chose. Called before `render`, since what the render adds (the
 * canonical link) depends on the status already set.
 */
export function statusForPage(
  res: Response,
  vm: { page?: { rateLimitRetryAfterSeconds?: number } },
  status: number,
): number {
  const wait = vm.page?.rateLimitRetryAfterSeconds;
  if (wait === undefined) return status;
  res.setHeader('Retry-After', String(wait));
  return 429;
}
