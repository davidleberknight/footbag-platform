/**
 * Shared HTTP-layer helper for signed flash cookies. Centralizes the cookie
 * name, value format, and signed-cookie options so policy changes happen in
 * one place. Cookie integrity is signed with SESSION_SECRET.
 *
 * Value format: `<kind>` or `<kind>:<payload>`. Payload may contain additional
 * colons; the reader splits on the first colon only.
 */
import { Request, Response } from 'express';

export const FLASH_COOKIE = 'footbag_flash';

export const FLASH_KIND = {
  LOGIN: 'login',
  LOGOUT: 'logout',
  AVATAR_UPLOADED: 'avatar_uploaded',
  WIZARD_CLUB_CARD_RESOLVED: 'wizard_club_card_resolved',
  WIZARD_CLUB_CAP_HIT: 'wizard_club_cap_hit',
  MEDIA_SAVED: 'media_saved',
  // An administrator's disposition of a message the sender gave up on. The
  // payload carries the outcome, since a second administrator reviewing the same
  // message changed nothing and must not be told they did.
  EMAIL_LOG_REVIEWED: 'email_log_reviewed',
  // An administrator's decision on a reported item. The payload carries the
  // outcome and whether the stored files actually went, since a hidden item
  // whose bytes survive still needs the decision running again.
  MEDIA_MODERATION_DECIDED: 'media_moderation_decided',
  CONTACT_SUBMITTED: 'contact_submitted',
  WORK_QUEUE_RESOLVED: 'work_queue_resolved',
  WORK_QUEUE_REVIEWED: 'work_queue_reviewed',
  WORK_QUEUE_CLAIMED: 'work_queue_claimed',
  WORK_QUEUE_MEMBER_ASKED: 'work_queue_member_asked',
  // A dispute upheld and the wrongly-held claim stripped. Its own kind rather
  // than the resolve one, because a revert settles nothing: the requester's own
  // link is still undecided, so the item stays open by design and no answer has
  // gone to anybody. Sharing the resolve kind is what made the page report a
  // resolution and an email that never happened.
  WORK_QUEUE_CLAIM_REVERTED: 'work_queue_claim_reverted',
  // An item set aside, or taken back out of the parked listing. The payload
  // distinguishes the two so one banner kind covers both directions.
  WORK_QUEUE_PARKED: 'work_queue_parked',
  // An action that found its item already settled by another act. The payload
  // is the sentence and its tone.
  WORK_QUEUE_OUTCOME: 'work_queue_outcome',
  MEMBER_QUESTION_ANSWERED: 'member_question_answered',
  CLUB_ACTION: 'club_action',
  // A Tier 2 or Tier 3 member's vouch for Active Player status. The payload is
  // the outcome code the member service turns back into a sentence, so the
  // wording lives with the profile that shows it rather than in a cookie.
  VOUCH_RESULT: 'vouch_result',
  PROFILE_UPDATED: 'profile_updated',
  PASSWORD_CHANGED: 'password_changed',
  RECURRING_DONATION_CANCELED: 'recurring_donation_canceled',
  // A cancellation that found the gift already ended. The payload is the
  // sentence and its tone, so the history page reports that nothing changed.
  RECURRING_DONATION_OUTCOME: 'recurring_donation_outcome',
  RECONCILIATION_RESOLVED: 'reconciliation_resolved',
  // An administrator's correction on a member record. The payload is the
  // outcome code the member service turns back into a sentence, so the wording
  // lives with the surface rather than in a cookie.
  MEMBER_RECORD_CORRECTED: 'member_record_corrected',
  // An administrator's correction on a club record. The payload is the outcome
  // code the admin club service turns back into a sentence, so the wording
  // lives with the surface rather than in a cookie.
  CLUB_RECORD_CORRECTED: 'club_record_corrected',
  // An administrator retiring an abusive hashtag. The payload is the outcome
  // code the admin tag service turns back into a sentence, so the wording lives
  // with the surface rather than in a cookie.
  TAG_RETIRED: 'tag_retired',
  // An administrator's role grant or revoke, or honor grant, that found the
  // change already made by another act. The payload is the sentence and its
  // tone, so the list page reports that nothing was changed.
  ADMIN_ROLE_OUTCOME: 'admin_role_outcome',
  HONOR_GRANT_OUTCOME: 'honor_grant_outcome',
  // An administrator's change to a club's co-leaders, an event's organizers or
  // results, a historical person's deceased marking, or a freestyle trick's
  // publication. The payload is the sentence and its tone, so the page reports
  // what was done, or that nothing needed changing.
  CLUB_LEADERSHIP_OUTCOME: 'club_leadership_outcome',
  EVENT_ORGANIZER_OUTCOME: 'event_organizer_outcome',
  EVENT_RESULT_OUTCOME: 'event_result_outcome',
  HISTORICAL_RECORD_OUTCOME: 'historical_record_outcome',
  TRICK_PUBLISHED: 'trick_published',
  // An attach on the freestyle trick edit page that found its link already in
  // place. The payload is the sentence and its tone.
  FREESTYLE_EDIT_OUTCOME: 'freestyle_edit_outcome',
  ALARM_ACKNOWLEDGED: 'alarm_acknowledged',
  // A second administrator submitting the same acknowledgment, or one submitting
  // it after the condition cleared, changed nothing and must not be told they
  // did.
  ALARM_ALREADY_SETTLED: 'alarm_already_settled',
  // A member's subscription change or address recovery on their email
  // preferences. The payload is the outcome code the subscription service turns
  // back into a sentence and tone.
  EMAIL_PREFERENCE_RESULT: 'email_preference_result',
  // A member's community announcement. The payload is the outcome code the
  // broadcast service turns back into a sentence and tone.
  ANNOUNCE_RESULT: 'announce_result',
  // An administrator's change to a mailing list, or a broadcast sent to one.
  // The payload is the outcome code the mailing-list page turns back into a
  // sentence and tone.
  MAILING_LIST_RESULT: 'mailing_list_result',
  // An administrator's save on an edit page. The payload names what was saved,
  // so the confirmation shows only on the page that saved it, never on another
  // admin page opened within the cookie's lifetime.
  ADMIN_SAVED: 'admin_saved',
  // Stub-only: carries the just-registered recipient email across the
  // register/resend POST->303->GET so the simulated-email dev card can scope
  // to that recipient and never show another pending user's verify token.
  VERIFY_EMAIL_PENDING: 'verify_email_pending',
} as const;
export type FlashKind = (typeof FLASH_KIND)[keyof typeof FLASH_KIND];

const FLASH_MAX_AGE_MS = 60_000;

export function writeFlash(
  res: Response,
  req: Request,
  kind: FlashKind,
  payload?: string,
): void {
  const value = payload ? `${kind}:${payload}` : kind;
  res.cookie(FLASH_COOKIE, value, {
    maxAge: FLASH_MAX_AGE_MS,
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
    path: '/',
    signed: true,
  });
}

const FLASH_KIND_VALUES = new Set<string>(Object.values(FLASH_KIND));

export function readFlash(
  req: Request,
): { kind: FlashKind; payload: string | null } | null {
  const raw = req.signedCookies?.[FLASH_COOKIE];
  if (typeof raw !== 'string' || raw.length === 0) return null;
  const colonIdx = raw.indexOf(':');
  const kind = colonIdx === -1 ? raw : raw.slice(0, colonIdx);
  // Defense-in-depth: cookie-parser already rejects tampered signatures,
  // so a `kind` arriving here was server-issued at some point. Whitelisting
  // against FLASH_KIND still drops orphaned values from older deploys (a
  // removed kind, a renamed kind) so the consumer never sees an unknown
  // discriminator.
  if (!FLASH_KIND_VALUES.has(kind)) return null;
  const payload = colonIdx === -1 ? null : raw.slice(colonIdx + 1);
  return { kind: kind as FlashKind, payload };
}

/**
 * Consume the flash if it is of `kind`: clear it and return its payload (an
 * empty string when it carried none). A flash of any other kind is left for
 * the page it belongs to, and the result is null.
 */
export function takeFlash(req: Request, res: Response, kind: FlashKind): string | null {
  const flash = readFlash(req);
  if (flash?.kind !== kind) return null;
  clearFlash(res, req);
  return flash.payload ?? '';
}

export type MediaSavedKind = 'create' | 'edit' | 'delete' | 'upload';

/** A typed tag the save stored in its folded form. */
export interface FoldedTag { typed: string; stored: string }

// The encoded size of the folded pairs one media-saved flash may carry.
const MEDIA_SAVED_FOLDED_MAX_CHARS = 1500;

/**
 * Report a media save, carrying the typed tags it stored in a folded form so the
 * next page can say so. Payload: `<kind>` or `<kind>|<URI-encoded JSON pairs>`.
 */
export function writeMediaSavedFlash(
  res: Response, req: Request, kind: MediaSavedKind, folded: FoldedTag[] = [],
): void {
  // A browser drops a cookie over 4 KB, and with it the whole saved message, so
  // only as many pairs as fit well inside that are carried (the cookie layer
  // encodes the value again and signs it). A save that folded more names the
  // first of them.
  const carried: FoldedTag[] = [];
  for (const pair of folded) {
    if (encodeURIComponent(JSON.stringify([...carried, pair])).length > MEDIA_SAVED_FOLDED_MAX_CHARS) break;
    carried.push(pair);
  }
  const payload = carried.length ? `${kind}|${encodeURIComponent(JSON.stringify(carried))}` : kind;
  writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, payload);
}

/**
 * What a Share Media submit, or a save of one item, reports on the page it
 * lands on. `mediaId` is the first item shared or the item saved, so the page
 * shows the report only beside that item; `count` is how many items were
 * shared (0 for a save); `gallery` is the gallery named in the submit.
 */
export interface ShareOutcome {
  mediaId: string | null;
  count: number;
  saved: boolean;
  gallery: { id: string; name: string; tags: string[]; created: boolean } | null;
  folded: FoldedTag[];
  rejected: { filename: string; reason: string }[];
}

const SHARE_PREFIX = 'share|';

/**
 * Report a share across its redirect. The pairs a long report carries are cut
 * from the end, refusals last, so the cookie stays inside the size a browser
 * keeps; what is cut still leaves the success and the first refusals named.
 */
export function writeShareFlash(res: Response, req: Request, outcome: ShareOutcome): void {
  const encode = (o: ShareOutcome) => encodeURIComponent(JSON.stringify(o));
  // A file name or reason is cut short so one long or non-Latin name, which
  // encodes to many times its length, cannot by itself overflow the cookie.
  const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
  const trimmed: ShareOutcome = {
    ...outcome,
    folded: [...outcome.folded],
    rejected: outcome.rejected.map((r) => ({ filename: cut(r.filename, 60), reason: cut(r.reason, 160) })),
  };
  while (encode(trimmed).length > MEDIA_SAVED_FOLDED_MAX_CHARS && trimmed.folded.length > 0) trimmed.folded.pop();
  while (encode(trimmed).length > MEDIA_SAVED_FOLDED_MAX_CHARS && trimmed.rejected.length > 1) trimmed.rejected.pop();
  if (encode(trimmed).length > MEDIA_SAVED_FOLDED_MAX_CHARS && trimmed.gallery) {
    trimmed.gallery = { ...trimmed.gallery, tags: [] };
  }
  writeFlash(res, req, FLASH_KIND.MEDIA_SAVED, `${SHARE_PREFIX}${encode(trimmed)}`);
}

/** Consume a share report; any other flash is left for its own page. */
export function takeShareFlash(req: Request, res: Response): ShareOutcome | null {
  const flash = readFlash(req);
  if (flash?.kind !== FLASH_KIND.MEDIA_SAVED || !flash.payload?.startsWith(SHARE_PREFIX)) return null;
  clearFlash(res, req);
  try {
    const parsed = JSON.parse(decodeURIComponent(flash.payload.slice(SHARE_PREFIX.length))) as Partial<ShareOutcome>;
    return {
      mediaId: typeof parsed.mediaId === 'string' ? parsed.mediaId : null,
      count: typeof parsed.count === 'number' ? parsed.count : 0,
      saved: parsed.saved === true,
      gallery: parsed.gallery && typeof parsed.gallery.id === 'string' ? parsed.gallery : null,
      folded: Array.isArray(parsed.folded) ? parsed.folded.filter((f): f is FoldedTag =>
        typeof f?.typed === 'string' && typeof f?.stored === 'string') : [],
      rejected: Array.isArray(parsed.rejected) ? parsed.rejected.filter((r): r is { filename: string; reason: string } =>
        typeof r?.filename === 'string' && typeof r?.reason === 'string') : [],
    };
  } catch {
    return null;
  }
}

/**
 * Consume a media-saved flash: which save it reports and the tags it folded.
 * Any other flash is left for its own page, and an unrecognised payload reads
 * as none.
 */
export function takeMediaSaved(req: Request, res: Response): { kind: MediaSavedKind; folded: FoldedTag[] } | null {
  // A share report belongs to the media page it lands on, never to this reader.
  if (readFlash(req)?.payload?.startsWith(SHARE_PREFIX)) return null;
  const p = takeFlash(req, res, FLASH_KIND.MEDIA_SAVED);
  if (p === null) return null;
  const [kind, encoded] = p.split('|', 2);
  if (kind !== 'create' && kind !== 'edit' && kind !== 'delete' && kind !== 'upload') return null;
  let folded: FoldedTag[] = [];
  if (encoded) {
    try {
      const parsed: unknown = JSON.parse(decodeURIComponent(encoded));
      if (Array.isArray(parsed)) {
        folded = parsed.filter((f): f is FoldedTag =>
          typeof f?.typed === 'string' && typeof f?.stored === 'string');
      }
    } catch {
      folded = [];
    }
  }
  return { kind, folded };
}

/** Consume a media-saved flash and return which save it reports. */
export function takeMediaSavedFlash(req: Request, res: Response): MediaSavedKind | null {
  return takeMediaSaved(req, res)?.kind ?? null;
}

export function clearFlash(res: Response, req: Request): void {
  // RFC 6265-strict browsers require the clear cookie's attributes
  // (path, httpOnly, sameSite, secure) to match the set, so this mirrors
  // writeFlash's secure derivation.
  res.clearCookie(FLASH_COOKIE, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: req.secure || req.headers['x-forwarded-proto'] === 'https',
  });
}
