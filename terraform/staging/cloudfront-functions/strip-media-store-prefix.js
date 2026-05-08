function handler(event) {
  var request = event.request;
  // CloudFront /media-store/* behavior routes to the S3 media bucket. The app
  // writes S3 keys without a /media-store/ prefix (DD §1.5: local-fs and S3
  // layouts mirror exactly; the prefix is a URL convention, not a key
  // convention). This function strips /media-store on viewer-request so the
  // origin sees the actual S3 key. Query string is on request.querystring and
  // is unaffected by mutating request.uri; the existing ?v={uuid} cache-bust
  // is preserved.
  if (request.uri.startsWith('/media-store/')) {
    request.uri = request.uri.substring(12); // '/media-store'.length === 12
  }
  return request;
}
