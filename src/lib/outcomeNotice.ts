/**
 * The shape and the tone of an action result, shared by every surface that
 * reports one.
 *
 * Three tones, because an action has three endings a reader must be able to
 * tell apart: it happened, nothing needed to happen, or it was refused. The
 * green treatment claims the first, so painting a refusal with it tells the
 * member their action worked when it did not, and painting a no-op with it
 * claims a change that never occurred.
 *
 * The tone travels with the text through the flash cookie, because the page
 * that renders the outcome is not the request that produced it. The encoding is
 * a one-character prefix and a colon, which survives a cookie value and leaves
 * the message itself untouched, colons included.
 */

/** ok = it happened; info = nothing needed changing; no = refused. */
export type OutcomeTone = 'ok' | 'info' | 'no';

/**
 * A message and the tone it takes, ready for the `outcome-notice` partial.
 *
 * The tone rides as the tone rather than as a pair of booleans so that one
 * partial draws every outcome message on the site. A template that branches on
 * its own is a second renderer of the same vocabulary, and a second renderer is
 * what lets two surfaces drift apart.
 */
export interface OutcomeNoticeView {
  text: string;
  tone: OutcomeTone;
}

const PREFIX: Record<OutcomeTone, string> = { ok: 'o', info: 'i', no: 'n' };

/** Encode an outcome for a flash payload. */
export function outcomePayload(tone: OutcomeTone, text: string): string {
  return `${PREFIX[tone]}:${text}`;
}

/**
 * Decode a flash payload into the shaped notice a template renders.
 *
 * An unprefixed payload is read as informational rather than dropped: a cookie
 * written by an older deploy still says something true to the member, and the
 * neutral tone is the one that claims least.
 */
export function outcomeNotice(payload: string | null | undefined): OutcomeNoticeView | null {
  if (!payload) return null;
  const marker = payload.slice(0, 2);
  if (marker === 'o:') return { text: payload.slice(2), tone: 'ok' };
  if (marker === 'n:') return { text: payload.slice(2), tone: 'no' };
  if (marker === 'i:') return { text: payload.slice(2), tone: 'info' };
  return { text: payload, tone: 'info' };
}
