function handler(event) {
  var request = event.request;
  // CloudFront /s3-photos/* behavior routes to the S3 media bucket. The app
  // writes S3 keys without a /s3-photos/ prefix (DD §1.5: local-fs and S3
  // layouts mirror exactly; the prefix is a URL convention, not a key
  // convention, made explicit so the URL announces its S3 origin). This
  // function strips /s3-photos on viewer-request so the origin sees the
  // actual S3 key. Query string is on request.querystring and is unaffected
  // by mutating request.uri; the existing ?v={uuid} cache-bust is preserved.
  if (request.uri.startsWith('/s3-photos/')) {
    request.uri = request.uri.substring(10); // '/s3-photos'.length === 10
  }
  return request;
}
