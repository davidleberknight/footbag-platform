/**
 * The routes that take a JSON body, and the only ones the app parses JSON on.
 *
 * Every other state-changing request is an HTML form post, read as urlencoded
 * text. These three are called by code rather than by a form: the curator's
 * direct-upload script asks for a signed upload address and then confirms the
 * upload, and the media workers report job progress to the web process.
 * Parsing JSON anywhere else would let a request put a number or an object
 * into a field every form sends as text.
 */
export const JSON_BODY_PATHS: readonly string[] = [
  '/admin/curator/upload/sign',
  '/admin/curator/upload/finalize',
  '/ipc/job-events',
];
