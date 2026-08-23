/**
 * EmailSubscriptionService -- acting on a member's mailing-list subscriptions
 * from outside a session.
 *
 * Owns:
 *   - One-click unsubscribe: reading the signed token a bulk message carried in
 *     its `List-Unsubscribe` headers, and withdrawing exactly the one
 *     subscription that token names.
 *
 * Does not own:
 *   - The member-facing subscription screen, or any admin list management.
 *   - Minting the token or attaching the headers, which belong to the send path.
 *
 * Required patterns:
 *   - The caller is unauthenticated by design: a mail client fires the request
 *     with no session, which is the whole point of the header. Authority comes
 *     from the token's signature and from nothing else, so the token's contents
 *     are the only thing that decides what changes.
 *   - One token, one row. A token names one member and one audience, and the
 *     write is scoped to that pair, so a forged or replayed token can do
 *     nothing wider than the action its holder was already offered.
 *   - Every outcome answers the same way to the caller. A mail provider gets no
 *     signal about whether an address, a member, or a subscription exists, so
 *     the endpoint cannot be used to probe membership.
 *   - Idempotent: firing twice, which mail clients do, changes nothing the
 *     second time.
 *
 * Persistence: mailing_list_subscriptions (status write).
 *
 * Side effects: audit_entries append on a successful withdrawal.
 */
import { mailingListSubscriptions, transaction } from '../db/db';
import { readUnsubscribeToken } from '../lib/unsubscribeToken';
import { appendAuditEntry } from './auditService';

export type UnsubscribeOutcome =
  /** The token was valid and the subscription is now withdrawn, or already was. */
  | { status: 'done' }
  /** The token was not one this deployment minted. */
  | { status: 'rejected' };

export const emailSubscriptionService = {
  /** Withdraws the one subscription a signed unsubscribe token names. */
  unsubscribeByToken(token: string): UnsubscribeOutcome {
    const read = readUnsubscribeToken(token);
    if (!read) return { status: 'rejected' };

    const nowIso = new Date().toISOString();

    // The withdrawal and its audit row are one fact. Written separately, a
    // crash between them leaves a member unsubscribed with nothing in the
    // ledger saying who did it or when, which is precisely the governance
    // record this action exists to leave.
    transaction(() => {
      const result = mailingListSubscriptions.markUnsubscribed.run(
        nowIso, nowIso, read.target.slug, read.memberId,
      );

      // Only a row that actually moved is worth recording. A second firing of
      // the same header, or a row an operator had already suppressed, changes
      // nothing and writing an audit row for it would turn a mail client's
      // retry into ledger noise.
      if (result.changes > 0) {
        appendAuditEntry({
          actionType:    'email.unsubscribed_one_click',
          category:      'system',
          // The member performed this, by clicking their mail client's control.
          // The token is what authorizes it in place of a session.
          actorType:     'member',
          actorMemberId: read.memberId,
          entityType:    'mailing_list',
          entityId:      read.target.slug,
          reasonText:    'Member withdrew a mailing-list subscription through the one-click unsubscribe header',
        });
      }
    });
    return { status: 'done' };
  },
};
