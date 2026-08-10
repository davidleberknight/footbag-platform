/**
 * The error-page helpers are the only way a route reaches the error template.
 *
 * The contract they exist to hold: the status digit the visitor reads is
 * derived from the status the response carries, so the two can never disagree.
 * A hand-written render is how a 422 response came to display "404" and tell
 * the visitor their link was no longer routable.
 *
 * The second contract is the control row. An error page is a dead end, so it
 * offers a way home, and offers the surface the caller came from instead only
 * when the caller names one.
 */
import { describe, it, expect, vi } from 'vitest';
import type { Response } from 'express';
import {
  renderConflict,
  renderForbidden,
  renderInvalidRequest,
  renderNotFound,
  renderRateLimited,
  renderServiceUnavailable,
} from '../../src/lib/controllerErrors';

function makeRes(locals: Record<string, unknown> = {}) {
  const render = vi.fn();
  const status = vi.fn().mockReturnValue({ render });
  return { res: { status, locals } as unknown as Response, status, render };
}

/** Template name, then the view-model the helper handed it. */
function rendered(render: ReturnType<typeof vi.fn>) {
  const [template, viewModel] = render.mock.calls[0] as [string, {
    seo: { title: string };
    page: { title: string; pageKey: string };
    content: { statusCode: number; paragraphs: string[]; actions: { label: string; href: string }[] };
  }];
  return { template, ...viewModel };
}

describe('every error helper renders the one error template', () => {
  const cases: [string, (res: Response) => void, number][] = [
    ['not found',           (res) => renderNotFound(res),                                404],
    ['forbidden',           (res) => renderForbidden(res),                               403],
    ['conflict',            (res) => renderConflict(res, { title: 'Already Curated' }),  409],
    ['invalid request',     (res) => renderInvalidRequest(res, { title: 'Invalid Request' }), 422],
    ['bad request',         (res) => renderInvalidRequest(res, { statusCode: 400, title: 'Bad Request' }), 400],
    ['rate limited',        (res) => renderRateLimited(res, { title: 'Slow down' }),     429],
    ['service unavailable', (res) => renderServiceUnavailable(res),                      503],
    ['internal error',      (res) => renderServiceUnavailable(res, 500),                 500],
  ];

  for (const [name, call, expected] of cases) {
    it(`${name}: the displayed code is the response status (${expected})`, () => {
      const { res, status, render } = makeRes();
      call(res);
      expect(status).toHaveBeenCalledWith(expected);
      const view = rendered(render);
      expect(view.template).toBe('errors/error');
      expect(view.content.statusCode).toBe(expected);
      expect(view.page.pageKey).toBe(`error_${expected}`);
    });

    it(`${name}: offers a way home`, () => {
      const { res, render } = makeRes();
      call(res);
      expect(rendered(render).content.actions).toEqual([{ label: 'Go to Home', href: '/' }]);
    });
  }
});

describe('an authorization refusal picks its control from the caller session', () => {
  it('a caller with no session is offered the sign-in page', () => {
    const { res, render } = makeRes({ isAuthenticated: false });
    renderForbidden(res);
    const view = rendered(render);
    expect(view.content.actions).toEqual([{ label: 'Sign In', href: '/login' }]);
    expect(view.content.paragraphs).toEqual(['You need to be signed in to view this page.']);
  });

  it('a signed-in caller is offered the home page, not a sign-in they have already done', () => {
    const { res, render } = makeRes({ isAuthenticated: true });
    renderForbidden(res);
    const view = rendered(render);
    expect(view.content.actions).toEqual([{ label: 'Go to Home', href: '/' }]);
    expect(view.content.paragraphs).toEqual(["You don't have permission to view this page."]);
  });

  it('a refusal at the perimeter, before authentication has run, offers the home page', () => {
    // The origin pin refuses a cross-origin request ahead of the auth
    // middleware, so the session flag is not set yet. That is a request-integrity
    // failure, not a missing session.
    const { res, render } = makeRes();
    renderForbidden(res);
    expect(rendered(render).content.actions).toEqual([{ label: 'Go to Home', href: '/' }]);
  });
});

describe('error-page copy', () => {
  it('the not-found page speaks to a visitor following a link from the old site', () => {
    const { res, render } = makeRes();
    renderNotFound(res);
    const view = rendered(render);
    expect(view.page.title).toBe('Page Not Found');
    expect(view.content.paragraphs.join(' ')).toMatch(/no longer routable/);
  });

  it('a caller can name the thing that was not found', () => {
    const { res, render } = makeRes();
    renderNotFound(res, { title: 'Club Not Found' });
    const view = rendered(render);
    expect(view.page.title).toBe('Club Not Found');
    expect(view.seo.title).toBe('Club Not Found');
  });

  it('an invalid request shows the caller message and never the not-found wording', () => {
    const { res, render } = makeRes();
    renderInvalidRequest(res, { title: 'Invalid Request', message: 'Pick a hashtag.' });
    const view = rendered(render);
    expect(view.content.paragraphs).toEqual(['Pick a hashtag.']);
    expect(view.content.paragraphs.join(' ')).not.toMatch(/does not exist/);
  });

  it('a caller with a surface to return to sends the visitor back there instead of home', () => {
    const { res, render } = makeRes();
    renderInvalidRequest(res, { title: 'Invalid Request', backHref: '/admin/curator/media' });
    expect(rendered(render).content.actions).toEqual([
      { label: 'Go Back', href: '/admin/curator/media' },
    ]);
  });
});
