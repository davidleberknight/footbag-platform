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
