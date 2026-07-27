function handler(event) {
  var request = event.request;

  // CloudFront validates the signed cookie before this function runs, so anonymous and
  // invalid requests never reach it: they draw the 403 that the distribution maps to the
  // denied-access page, which carries the sign-in link.
  //
  // The captured site links to directories in roughly a thousand places, and every typed
  // or bookmarked directory URL ends the same way. S3 serves objects, not directory
  // listings, so the index document has to be named explicitly. Validation matches the
  // original URI, not this rewritten one, which is why the signing policy covers the
  // whole host by wildcard rather than pinning a single URL.
  if (request.uri.endsWith('/')) {
    request.uri = request.uri + 'index.html';
  }

  return request;
}
