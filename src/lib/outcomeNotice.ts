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

export interface OutcomeNoticeView {
  text: string;
  /** The green treatment: the thing asked for happened. */
  isSuccess: boolean;
  /** The red treatment, announced assertively: the request was refused. */
  isRefusal: boolean;
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
  if (marker === 'o:') return { text: payload.slice(2), isSuccess: true, isRefusal: false };
  if (marker === 'n:') return { text: payload.slice(2), isSuccess: false, isRefusal: true };
  if (marker === 'i:') return { text: payload.slice(2), isSuccess: false, isRefusal: false };
  return { text: payload, isSuccess: false, isRefusal: false };
}
