// The cutover migration notice, compiled in rather than configured. Terraform
// flips the sentinel below to true for the freeze window (a literal-string
// substitution, so with the flag off the deployed code is byte-identical to
// this file), and the unit suite exercises the source both ways by making the
// same substitution. The notice lives HERE and not in the planned-maintenance
// origin swap because the swap replaces the default behaviour's origin for
// every hostname the distribution answers on, preview included, while the
// cutover window requires preview to serve the real site on the real database
// throughout; only a viewer-request function can decide per hostname. The DNS
// Cutover decision in the design record carries the ruling.
var CUTOVER_NOTICE = false;

// The notice page, inlined: a function-generated response has no origin and no
// bucket behind it, so the page travels with the code and counts against the
// 10 KB function-size cap (the whole file stays well inside it). Custom error
// pages do not replace it: they apply to what the origin returns, and this
// response is returned to the viewer without CloudFront contacting the origin.
var NOTICE_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Footbag.org</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; background: #f4f1ea; color: #222;
         margin: 0; display: flex; min-height: 100vh; align-items: center; justify-content: center; }
  main { max-width: 34em; padding: 2rem; text-align: center; }
  h1 { font-size: 1.6rem; margin-bottom: 1rem; }
</style>
</head>
<body>
<main>
  <h1>Footbag.org is migrating to new technology RIGHT NOW, and will go live soon.</h1>
  <p>Please check back in a few days.</p>
</main>
</body>
</html>
`;

function handler(event) {
  var request = event.request;

  // The bare apex answers a permanent redirect to the canonical www host, which is
  // the front door the whole platform is configured to speak for: the cross-site
  // request check, the sitemap, every per-page canonical tag and every link in
  // outbound mail all derive from it. The redirect cannot live in the application.
  // Two independent reasons, either sufficient: the distribution attaches an origin
  // request policy that withholds the viewer's Host header from the origin, and
  // nginx pins the upstream Host to one canonical value on every proxying location.
  // The origin therefore cannot learn which name the visitor typed, so the decision
  // has to be made at the edge, before the cache is consulted.
  //
  // Matched as an exact equality against the apex, never as "any host that is not
  // www". The distribution answers on more than one name and the others are
  // load-bearing: it serves on its own generated CloudFront name until the custom
  // domain is enabled, which is the address every pre-cutover exercise runs
  // against, and the preview subdomain exists precisely so the site can be served
  // under a real certificate before the apex and www move. A blanket rule would
  // redirect both of those to a name that does not yet resolve to the platform,
  // breaking them the moment it deployed.
  //
  // CloudFront lowercases header names but not header values, so the viewer may
  // send any casing of the name it typed.
  var host = request.headers.host ? request.headers.host.value.toLowerCase() : '';

  // The migration notice, for the freeze window only. Decided per hostname:
  // this branch matches www exactly and the apex branch below matches the bare
  // apex exactly, so the two are disjoint and the apex keeps its redirect with
  // the notice both on and off — a visitor typing the apex is 301'd to www and
  // meets the notice there. Preview and the distribution's own generated name
  // match neither branch and pass through to the platform, which is the entire
  // reason the notice lives in this function.
  //
  // One path is exempt: the Stripe webhook, because a delivery that draws the
  // notice for days is an endpoint Stripe disables, and the deliveries landing
  // after the final load belong in the database that goes live. No health
  // exemption exists here and none must be added: /health/* rides its own
  // ordered behaviour that this function never runs on, so a branch for it
  // would be unreachable dead code. Bare /health (no trailing segment) does
  // fall through to this behaviour and meets the notice; that is recorded as
  // expected — no handler answers it in any environment, so it trades a 404
  // for a 503 and nothing probes it.
  if (CUTOVER_NOTICE && host === 'www.footbag.org' && request.uri !== '/payments/webhook') {
    return {
      statusCode: 503,
      statusDescription: 'Service Unavailable',
      headers: {
        // Seconds, not a date: the window has deliberately no declared end.
        'retry-after': { value: '86400' },
        // Never cached and never indexed: the notice must vanish the moment the
        // flag lifts, and a 503 with these headers is what keeps search engines
        // returning instead of deindexing the site.
        'cache-control': { value: 'no-store' },
        'x-robots-tag': { value: 'noindex' },
        'content-type': { value: 'text/html; charset=utf-8' },
      },
      body: NOTICE_HTML,
    };
  }

  if (host !== 'footbag.org') {
    return request;
  }

  // The query string arrives as an object, one field per parameter, each carrying a
  // value plus, when the parameter appears more than once, a multiValue array
  // holding every occurrence. Joining name=value pairs with & reproduces the
  // original query string exactly: both halves are stored in their wire form, so
  // nothing is re-encoded here and an already-encoded value is never encoded twice.
  // A parameter that appeared with no value keeps its trailing equals sign, which
  // is what the viewer sent.
  var parts = [];
  for (var name in request.querystring) {
    var param = request.querystring[name];
    if (param.multiValue) {
      for (var i = 0; i < param.multiValue.length; i++) {
        parts.push(name + '=' + param.multiValue[i].value);
      }
    } else {
      parts.push(name + '=' + param.value);
    }
  }
  var query = parts.join('&');

  // 301 rather than a method-preserving status: a 301 replays a POST as a GET,
  // which is correct here, because nothing posts to the bare apex before landing
  // on the site.
  return {
    statusCode: 301,
    statusDescription: 'Moved Permanently',
    headers: {
      location: {
        value: 'https://www.footbag.org' + request.uri + (query === '' ? '' : '?' + query),
      },
    },
  };
}
