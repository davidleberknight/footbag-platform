import { Request } from 'express';

/**
 * The ownership test behind every owner-only member route: does the `:memberKey`
 * in the path belong to the signed-in caller?
 *
 * It lives here rather than in each controller because it is a security
 * predicate, and five private copies were five chances for one to be corrected
 * and the others left behind. A caller that fails this test is answered with
 * `renderNotFound`, never a 403, so the route cannot be used to discover which
 * member slugs exist.
 */
export function isOwnMemberRoute(req: Request): boolean {
  return req.user?.slug === req.params.memberKey;
}
