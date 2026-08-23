/**
 * Signed one-click unsubscribe tokens.
 *
 * Bulk mail carries `List-Unsubscribe` and `List-Unsubscribe-Post` headers, and
 * the mail client turns them into its own unsubscribe control. The recipient is
 * not signed in when it fires, so the URL itself has to prove which member is
 * asking and what they are leaving. A signed token does that without a stored
 * row: an unsubscribe link sits in a delivered message for as long as the
 * message survives, and minting a row per recipient per send to cover that
 * would multiply the outbox by every send that ever went out.
 *
 * The token names exactly one member and one audience, so it can do nothing
 * else: it cannot sign the holder in, read anything, or unsubscribe anyone
 * else. It carries no expiry for the same reason the header exists -- a
 * three-year-old newsletter should still have a working unsubscribe control.
 *
 * The signing key is derived from the session secret, so rotating that secret
 * invalidates outstanding links. That is an accepted trade: the member can
 * still manage subscriptions after signing in, which is the affordance the mail
 * body points at, and the alternative is a second long-lived secret to guard.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { config } from '../config/env';

/**
 * What the token authorises the holder to leave: one subscription-backed
 * mailing list, and nothing else.
 *
 * A group's mail carries no unsubscribe control at all. Membership of the group
 * is what puts a member on its list, so an unsubscribe there would either lie
 * (leaving them on the roster and still receiving) or quietly remove them from
 * a committee, which is a governance act and not something a mail client's
 * button should perform. Group messages instead tell the reader how to leave
 * the group on the site.
 */
export type UnsubscribeTarget = { kind: 'list'; slug: string };

function signingKey(): Buffer {
  // A purpose-labelled derivation, so a token minted here can never be
  // mistaken for, or replayed as, anything else signed with the session secret.
  return createHmac('sha256', config.sessionSecret).update('unsubscribe-token-v1').digest();
}

function payloadOf(memberId: string, target: UnsubscribeTarget): string {
  return `${memberId}|l:${target.slug}`;
}

function signatureFor(payload: string): string {
  return createHmac('sha256', signingKey()).update(payload).digest('base64url');
}

/** Mints the token that goes in the unsubscribe URL for one recipient of one send. */
export function mintUnsubscribeToken(memberId: string, target: UnsubscribeTarget): string {
  const payload = payloadOf(memberId, target);
  return `${Buffer.from(payload, 'utf8').toString('base64url')}.${signatureFor(payload)}`;
}

/**
 * Reads a token back, or returns null for anything that is not a token this
 * deployment minted: a wrong shape, a tampered payload, a foreign signature, or
 * a token from before a secret rotation. The caller treats every null the same
 * way, so a forged token learns nothing from the response.
 */
export function readUnsubscribeToken(
  token: string,
): { memberId: string; target: UnsubscribeTarget } | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encodedPayload, provided] = parts;

  let payload: string;
  try {
    payload = Buffer.from(encodedPayload, 'base64url').toString('utf8');
  } catch {
    return null;
  }

  const expected = signatureFor(payload);
  const a = Buffer.from(provided, 'utf8');
  const b = Buffer.from(expected, 'utf8');
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  const sep = payload.indexOf('|');
  if (sep <= 0) return null;
  const memberId = payload.slice(0, sep);
  const ref = payload.slice(sep + 1);

  // A list reference is the only thing a token may name. Anything else,
  // including a group reference from a token minted before groups were ruled
  // out of this path, is refused rather than interpreted.
  if (!ref.startsWith('l:')) return null;
  const slug = ref.slice(2);
  return slug ? { memberId, target: { kind: 'list', slug } } : null;
}
