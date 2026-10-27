// How recently an earlier request must have landed for a further one to count
// as the same request submitted twice. Long enough to cover a double click, a
// back-button re-post or a second tab; short enough that someone whose email
// never arrived can ask again a minute later.
export const REPEAT_REQUEST_SECONDS = 60;
