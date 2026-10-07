/**
 * Every crawl oracle goes red on a planted defect and stays green on a clean
 * page, and the crawler core reports the defects only it can see (dead and
 * refused targets, server and logged errors, off-site redirects) against an
 * in-memory site served through its injectable fetcher. A crawl that passes is
 * only evidence if each oracle is shown here to fail on the defect it names.
 */
import { describe, it, expect } from 'vitest';
import {
  authenticatedNoindexFinding,
  canariesShown,
  duplicateTitleFindings,
  ledgerFindings,
  markupFindings,
  storyIdsFrom,
  openRedirectFinding,
  privacyLeakFindings,
  seoFindings,
  shownButRefusedFinding,
  sitemapEntryFindings,
  sitemapPaths,
  templateArtifactFindings,
  titleAndH1Findings,
  unreachedRouteFindings,
  type Canary,
  type CoverageRoute,
  type ViewerClass,
} from '../fixtures/crawl/oracles';
import {
  crawl,
  extractTargets,
  type CrawlPersona,
  type CrawlResponse,
  type Fetcher,
} from '../fixtures/crawl/core';
import { applyFindingExemptions } from '../fixtures/crawl/exemptions';

function page(body: string, head = '<title>Footbag Clubs</title>'): string {
  return `<!doctype html><html lang="en"><head>${head}</head><body><main><h1>Clubs</h1>${body}</main></body></html>`;
}

const CLEAN = page(
  '<p>Welcome</p><a href="/clubs/club_x">Club X</a>'
  + '<script type="application/json">{"a":{"b":{{1}}}}</script><script>var x = undefined;</script>',
);

describe('template artifacts', () => {
  it('flags each internal value that leaks into a page and passes a clean one', () => {
    const planted: Record<string, string> = {
      'stringified object': page('<p>[object Object]</p>'),
      'unrendered mustache': page('<p>{{member.name}}</p>'),
      'unset value as text': page('<td>undefined</td>'),
      'not-a-number as text': page('<span> NaN </span>'),
      'unparseable date': page('<time>Invalid Date</time>'),
      'empty href': page('<a href="">Profile</a>'),
      'unset value in a link': page('<a href="/members/undefined/edit">Edit</a>'),
      'null value in a source': page('<img src="/media/null/thumb.jpg" alt="x">'),
      'empty trailing segment': page('<a href="/clubs/">Clubs</a>'),
      'empty inner segment': page('<a href="/members//edit">Edit</a>'),
    };
    for (const [name, html] of Object.entries(planted)) {
      expect(templateArtifactFindings(html), name).not.toEqual([]);
    }
    expect(templateArtifactFindings(CLEAN)).toEqual([]);
  });
});

describe('markup validity', () => {
  it('flags defect-class markup and passes a valid page', () => {
    const planted: Record<string, string> = {
      'duplicate id': page('<p id="a">x</p><p id="a">y</p>'),
      'unlabelled control': page('<form action="/x" method="post"><input name="q"><button>Go</button></form>'),
      'misnested element': page('<p><div>x</div></p>'),
      'link with no text': page('<a href="/clubs/club_x"></a>'),
      'image with no alternative': page('<img src="/a.png">'),
      'reference to a missing id': page('<label for="nope">Name</label><input id="name">'),
    };
    for (const [name, html] of Object.entries(planted)) {
      expect(markupFindings(html), name).not.toEqual([]);
    }
    expect(markupFindings(page('<form action="/x" method="post"><label for="q">Q</label><input id="q" name="q"><button>Go</button></form>'))).toEqual([]);
  });
});

describe('title and h1', () => {
  it('requires exactly one non-empty title and one h1', () => {
    const noH1 = '<!doctype html><html><head><title>T</title></head><body><p>x</p></body></html>';
    expect(titleAndH1Findings(noH1)).toEqual(['expected one <h1>, found 0']);
    expect(titleAndH1Findings(page('<h1>Again</h1>'))).toEqual(['expected one <h1>, found 2']);
    expect(titleAndH1Findings(page('', '<title>  </title>'))).toEqual(['empty <title>']);
    expect(titleAndH1Findings(page('', '<title>A</title><title>B</title>'))).toEqual(['expected one <title>, found 2']);
    expect(titleAndH1Findings(CLEAN)).toEqual([]);
  });
});

describe('search-engine relations', () => {
  const head = '<title>T</title><meta name="description" content="About clubs" /><link rel="canonical" href="http://x/clubs" />';
  it('requires a canonical and a description on a public page, and no canonical on an error page', () => {
    expect(seoFindings({ status: 200, html: page('', '<title>T</title>'), publicPage: true }))
      .toEqual(['public page has no canonical link', 'public page has no meta description']);
    expect(seoFindings({ status: 200, html: page('', '<title>T</title><meta name="description" content=" " />'), publicPage: true }))
      .toContain('public page has no meta description');
    expect(seoFindings({ status: 404, html: page('', head), publicPage: true }))
      .toEqual(['error page (404) carries a canonical link']);
    expect(seoFindings({ status: 200, html: page('', head), publicPage: true })).toEqual([]);
    expect(seoFindings({ status: 404, html: page(''), publicPage: true })).toEqual([]);
    // A signed-in page is not a search-engine surface, so it owes neither.
    expect(seoFindings({ status: 200, html: page(''), publicPage: false })).toEqual([]);
  });

  it('requires a noindex directive on a signed-in page, by header or meta', () => {
    expect(authenticatedNoindexFinding({}, page(''))).toMatch(/no noindex/);
    expect(authenticatedNoindexFinding({ 'x-robots-tag': 'noindex' }, page(''))).toBeNull();
    expect(authenticatedNoindexFinding({}, page('', '<meta name="robots" content="noindex, follow" />'))).toBeNull();
  });

  it('flags one title shared by distinct pages, not by one page reached under two queries', () => {
    expect(duplicateTitleFindings([
      { url: '/a', canonical: 'http://x/a', title: 'Footbag Clubs' },
      { url: '/b', canonical: 'http://x/b', title: 'Footbag Clubs' },
    ])).toHaveLength(1);
    expect(duplicateTitleFindings([
      { url: '/a', canonical: 'http://x/a', title: 'Footbag Clubs' },
      { url: '/a?page=2', canonical: 'http://x/a', title: 'Footbag Clubs' },
    ])).toEqual([]);
  });

  it('reads sitemap entries and flags member, dead, redirecting and noindex entries', () => {
    const xml = '<urlset><url><loc>http://localhost:3171/clubs</loc></url><url><loc>http://localhost:3171/hof?x=1</loc></url></urlset>';
    expect(sitemapPaths(xml, 'http://localhost:3171')).toEqual(['/clubs', '/hof?x=1']);
    expect(sitemapEntryFindings('/members/someone', 200, page(''))).toEqual(['sitemap lists a member page']);
    expect(sitemapEntryFindings('/history/p1', 302, '', '/login')).toEqual(['sitemap entry answers 302 to /login']);
    expect(sitemapEntryFindings('/clubs', 200, page('', '<meta name="robots" content="noindex" />')))
      .toEqual(['sitemap lists a page marked noindex']);
    expect(sitemapEntryFindings('/clubs', 200, CLEAN)).toEqual([]);
  });
});

describe('privacy canaries', () => {
  const canary = (audience: ViewerClass[]): Canary => ({
    field: 'phone', subjectMemberId: 'subject', forms: ['+1 555 0100'], audience: new Set(audience),
  });
  const html = page('<p>Call +1 555 0100</p>');
  const anon = { authenticated: false, onboarded: false };
  const member = { authenticated: true, onboarded: true, memberId: 'other' };
  const pending = { authenticated: true, onboarded: false, memberId: 'other' };
  const owner = { authenticated: true, onboarded: true, memberId: 'subject' };
  const admin = { authenticated: true, onboarded: true, memberId: 'boss', isAdmin: true };

  it('flags a private value shown outside its audience and passes it inside', () => {
    const privateField = canary(['owner', 'admin']);
    const membersField = canary(['member', 'owner', 'admin']);
    expect(privacyLeakFindings(html, anon, [membersField])).toHaveLength(1);
    expect(privacyLeakFindings(html, pending, [membersField])).toHaveLength(1);
    expect(privacyLeakFindings(html, member, [privateField])).toHaveLength(1);
    expect(privacyLeakFindings(html, member, [membersField])).toEqual([]);
    expect(privacyLeakFindings(html, owner, [privateField])).toEqual([]);
    expect(privacyLeakFindings(html, admin, [privateField])).toEqual([]);
    expect(privacyLeakFindings(CLEAN, anon, [privateField])).toEqual([]);
  });

  it('reports which canaries a page shows, for the positive controls', () => {
    expect(canariesShown(html, [canary(['owner'])])).toHaveLength(1);
    expect(canariesShown(CLEAN, [canary(['owner'])])).toEqual([]);
  });
});

describe('shown but refused', () => {
  const signedIn = { authenticated: true, onboarded: true };
  const pendingCtx = { authenticated: true, onboarded: false };
  const anon = { authenticated: false, onboarded: false };
  it('flags a refusal of the persona the target was shown to, and nothing else', () => {
    expect(shownButRefusedFinding(403, undefined, anon, '/x')).toMatch(/403/);
    expect(shownButRefusedFinding(302, '/login?returnTo=%2Fx', signedIn, '/x')).toMatch(/log in/);
    expect(shownButRefusedFinding(303, '/register/wizard/personal_details', signedIn, '/x')).toMatch(/wizard/);
    // A visitor sent to log in, or a registrant moved along the wizard's own steps, is the gate working.
    expect(shownButRefusedFinding(302, '/login?returnTo=%2Fx', anon, '/x')).toBeNull();
    expect(shownButRefusedFinding(303, '/register/wizard/legacy_claim', pendingCtx, '/register/wizard/personal_details/submit')).toBeNull();
    expect(shownButRefusedFinding(302, '/login-help', signedIn, '/x')).toBeNull();
    expect(shownButRefusedFinding(200, undefined, signedIn, '/x')).toBeNull();
  });

  it('flags a member action offered to a registrant still onboarding', () => {
    // A form outside the wizard that sends the registrant back into it was a
    // control the page should never have shown them.
    expect(shownButRefusedFinding(303, '/register/wizard/club_affiliations', pendingCtx, '/media/item/m1/flag'))
      .toMatch(/still onboarding/);
    expect(shownButRefusedFinding(303, '/register/wizard/club_affiliations', pendingCtx, '/register/wizardry'))
      .toMatch(/still onboarding/);
  });
});

describe('open redirect', () => {
  it('flags a Location on another origin unless allowed', () => {
    const self = 'http://localhost:3171';
    expect(openRedirectFinding('https://evil.example/x', self, [])).toMatch(/evil\.example/);
    expect(openRedirectFinding('//evil.example/landing', self, [])).toMatch(/evil\.example/);
    expect(openRedirectFinding('/members', self, [])).toBeNull();
    expect(openRedirectFinding('http://localhost:3171/x', self, [])).toBeNull();
    expect(openRedirectFinding('https://checkout.stripe.com/c', self, ['https://checkout.stripe.com'])).toBeNull();
  });
});

describe('route coverage', () => {
  const route = (method: string, path: string, re: RegExp): CoverageRoute => ({ method, path, matches: (p) => re.test(p) });
  const routes = [
    route('GET', '/clubs/:key', /^\/clubs\/[^/]+\/?$/),
    route('POST', '/clubs/:key/join', /^\/clubs\/[^/]+\/join\/?$/),
  ];
  it('flags an unreached route, a stale exemption, and an exemption for a route that does not exist', () => {
    expect(unreachedRouteFindings(routes, [{ method: 'GET', path: '/clubs/club_x?tab=1' }], []))
      .toEqual(['unreached route: POST /clubs/:key/join']);
    expect(unreachedRouteFindings(routes, [
      { method: 'GET', path: '/clubs/club_x' }, { method: 'POST', path: '/clubs/club_x/join' },
    ], [])).toEqual([]);
    const exempt = (path: string) => ({ method: 'POST', path, reason: 'fixture-gap' as const, why: 'test' });
    expect(unreachedRouteFindings(routes, [{ method: 'GET', path: '/clubs/club_x' }], [exempt('/clubs/:key/join')])).toEqual([]);
    expect(unreachedRouteFindings(routes, [
      { method: 'GET', path: '/clubs/club_x' }, { method: 'POST', path: '/clubs/club_x/join' },
    ], [exempt('/clubs/:key/join')])).toEqual(['stale exemption: POST /clubs/:key/join is reached']);
    expect(unreachedRouteFindings(routes, [
      { method: 'GET', path: '/clubs/club_x' }, { method: 'POST', path: '/clubs/club_x/join' },
    ], [exempt('/gone')])).toEqual(['stale exemption: POST /gone is not a served route']);
  });
});

describe('route-to-story ledger', () => {
  const clean = {
    servedRoutes: ['GET /clubs', 'GET /health/live'],
    storyIds: ['V_Browse_Clubs', 'A_Future_Thing'],
    routeStories: {
      'GET /clubs': { stories: ['V_Browse_Clubs'] },
      'GET /health/live': { none: 'machine-endpoint', why: 'probe' },
    },
    storiesWithoutRoute: { A_Future_Thing: { status: 'designed-not-deployed', why: 'not built' } },
  };
  it('passes a ledger that holds both ways', () => {
    expect(ledgerFindings(clean)).toEqual([]);
  });
  it('flags drift in each direction', () => {
    expect(ledgerFindings({ ...clean, servedRoutes: [...clean.servedRoutes, 'POST /clubs'] }))
      .toEqual(['served route has no ledger entry: POST /clubs']);
    expect(ledgerFindings({ ...clean, servedRoutes: ['GET /clubs'] }))
      .toEqual(['ledger entry for a route that is not served: GET /health/live']);
    expect(ledgerFindings({ ...clean, routeStories: { ...clean.routeStories, 'GET /clubs': { stories: ['V_Gone'] } } }))
      .toEqual([
        'ledger cites a story that does not exist: GET /clubs -> V_Gone',
        'story neither served by a route nor accounted for: V_Browse_Clubs',
      ]);
    expect(ledgerFindings({ ...clean, storiesWithoutRoute: {} }))
      .toEqual(['story neither served by a route nor accounted for: A_Future_Thing']);
    expect(ledgerFindings({ ...clean, storiesWithoutRoute: { ...clean.storiesWithoutRoute, V_Browse_Clubs: { status: 'x', why: 'y' } } }))
      .toEqual(['story is served by a route and also listed as having none: V_Browse_Clubs']);
    expect(ledgerFindings({ ...clean, storiesWithoutRoute: { ...clean.storiesWithoutRoute, V_Unknown: { status: 'x', why: 'y' } } }))
      .toEqual(['story listed as having no route does not exist: V_Unknown']);
  });
  it('reads story ids from third-level headings only', () => {
    expect(storyIdsFrom('# Title\n### V_One\ntext\n## Section\n### M_Two \n#### Not_A_Story\n')).toEqual(['V_One', 'M_Two']);
  });
});

describe('finding exemptions', () => {
  it('covers only the findings it names and reports itself stale when it matches nothing', () => {
    const f = { persona: 'p', url: '/a', via: '/', oracle: 'seo' as const, problem: 'public page has no meta description' };
    const ex = { oracle: 'seo' as const, url: /^\/a$/, problem: /meta description/, reason: 'known-defect' as const, why: 'w' };
    expect(applyFindingExemptions([f, { ...f, url: '/b' }], [ex])).toEqual({ open: [{ ...f, url: '/b' }], stale: [] });
    expect(applyFindingExemptions([], [ex]).stale).toEqual([ex]);
  });
});

describe('link and form extraction', () => {
  it('decodes escaped query links, treats a form with no action as posting to its page, and separates assets', () => {
    const html = '<a href="/dev/switch?as&#x3D;t0_fresh&amp;x&#x3D;1#top">s</a>'
      + '<form method="POST" class="f"><button>Save</button></form>'
      + '<form method="get" action="/search"></form>'
      + '<link rel="stylesheet" href="/css/style.css?v=1"><script src="/js/a.js"></script><img src="/i.png" alt="">'
      + '<a href="https://elsewhere.example/">x</a><a href="//cdn.example/x">y</a>';
    expect(extractTargets(html, '/members/m/edit?tab=1')).toEqual({
      gets: ['/dev/switch?as=t0_fresh&x=1', '/search'],
      posts: ['/members/m/edit'],
      assets: ['/css/style.css?v=1', '/js/a.js', '/i.png'],
    });
  });
});

// ── The walk itself, over an in-memory site ──────────────────────────────────

function html(body: string): CrawlResponse {
  return { status: 200, headers: { 'content-type': 'text/html' }, setCookie: [], body: page(body) };
}
function status(code: number, location?: string): CrawlResponse {
  return { status: code, headers: location ? { location } : {}, setCookie: [], body: '' };
}

/** A site defined as a map of path to response; anything else is a 404. */
function fakeSite(routes: Record<string, CrawlResponse | ((url: string) => CrawlResponse)>, posts: Record<string, CrawlResponse> = {}, onGet?: (url: string) => void): Fetcher {
  const answer = (table: Record<string, CrawlResponse | ((url: string) => CrawlResponse)>, url: string) => {
    const hit = table[url] ?? table[url.split('?')[0]];
    if (!hit) return status(404);
    return typeof hit === 'function' ? hit(url) : hit;
  };
  return {
    async get(url) { onGet?.(url); return answer(routes, url); },
    async post(url) { return answer(posts, url); },
  };
}

const MEMBER: CrawlPersona = { name: 'member', cookie: 'c', authenticated: true, onboarded: true };
const BASE = { seeds: ['/'], maxPages: 50, shouldSkip: () => false, selfOrigin: 'http://localhost:3171' };

describe('crawler core', () => {
  it('reports each walk-level defect against the target that has it', async () => {
    let logged = 0;
    const fetcher = fakeSite({
      '/': html(
        '<a href="/dead">dead</a><a href="/forbidden">forbidden</a><a href="/boom">boom</a>'
        + '<a href="/stale-session">stale</a><a href="/wizard-bounce">wizard</a><a href="/noisy">noisy</a>'
        + '<a href="/go?next=/clubs">go</a><img src="/missing.png" alt="">'
        + '<form method="POST" action="/gone"><button>Go</button></form>',
      ),
      '/forbidden': status(403),
      '/boom': status(500),
      '/stale-session': status(302, '/login?returnTo=%2Fstale-session'),
      '/wizard-bounce': status(303, '/register/wizard/personal_details'),
      '/noisy': html('<p>ok</p>'),
      '/go': (url) => status(302, new URLSearchParams(url.split('?')[1]).get('next') ?? '/'),
      '/clubs': html('<p>clubs</p>'),
      '/login': html('<p>login</p>'),
      '/register/wizard/personal_details': html('<p>wizard</p>'),
    }, {}, (url) => { if (url === '/noisy') logged += 1; });

    const result = await crawl({
      ...BASE, persona: MEMBER, fetcher, replayOpenRedirects: true, loggedErrorCount: () => logged,
    });
    const by = (oracle: string) => result.findings.filter((f) => f.oracle === oracle).map((f) => f.url).sort();
    expect(by('dead-link')).toEqual(['/dead', '/gone']);
    expect(by('dead-asset')).toEqual(['/missing.png']);
    expect(by('server-error')).toEqual(['/boom']);
    expect(by('shown-but-refused')).toEqual(['/forbidden', '/stale-session', '/wizard-bounce']);
    expect(by('logged-error')).toEqual(['/noisy']);
    expect(by('open-redirect')).toEqual(['/go?next=%2F%2Fevil.example%2Flanding']);
  });

  it('a clean site yields no findings and every page is visited', async () => {
    const fetcher = fakeSite({
      '/': html('<a href="/a">a</a><form method="POST" action="/save"><button>Save</button></form>'),
      '/a': html('<a href="/">home</a>'),
      '/b': html('<p>b</p>'),
    }, { '/save': status(303, '/b') });
    const result = await crawl({ ...BASE, persona: MEMBER, fetcher, replayOpenRedirects: true });
    expect(result.findings).toEqual([]);
    expect([...result.visited].sort()).toEqual(['/', '/a', '/b']);
  });

  it('reports a capped walk instead of passing on the pages it never reached', async () => {
    const fetcher = fakeSite({ '/': html('<a href="/a">a</a>'), '/a': html('<a href="/b">b</a>'), '/b': html('') });
    const result = await crawl({ ...BASE, maxPages: 2, persona: MEMBER, fetcher });
    expect(result.findings.map((f) => f.oracle)).toEqual(['budget']);
  });
});
