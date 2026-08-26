/**
 * EmailSubscriptionService -- a member's own mailing-list subscriptions, from
 * inside a session and from outside one.
 *
 * Owns:
 *   - One-click unsubscribe: reading the signed token a bulk message carried in
 *     its `List-Unsubscribe` headers, and withdrawing exactly the one
 *     subscription that token names.
 *   - The member's subscription screen: which lists they are offered, the state
 *     they hold on each, and the subscribe and withdraw writes they make there.
 *
 * Does not own:
 *   - Admin list management, or the exceptional adjustment an administrator
 *     makes to a member's subscription on their behalf.
 *   - Minting the token or attaching the headers, which belong to the send path.
 *
 * Required patterns:
 *   - The one-click caller is unauthenticated by design: a mail client fires the
 *     request with no session, which is the whole point of the header. Authority
 *     comes from the token's signature and from nothing else, so the token's
 *     contents are the only thing that decides what changes. The screen is the
 *     opposite case: the session names the member, and the route never takes a
 *     member id from the request.
 *   - One token, one row. A token names one member and one audience, and the
 *     write is scoped to that pair, so a forged or replayed token can do
 *     nothing wider than the action its holder was already offered.
 *   - Every one-click outcome answers the same way to the caller. A mail
 *     provider gets no signal about whether an address, a member, or a
 *     subscription exists, so the endpoint cannot be used to probe membership.
 *   - Idempotent: firing twice, which mail clients do, changes nothing the
 *     second time, and neither does a repeated choice on the screen.
 *   - A suppressed row is an operational decision made about an address, so no
 *     member action moves it, from either surface.
 *   - Only lists a member may manage are offered: an archived list is no longer
 *     offered at all, and a group-backed list's membership is the group roster,
 *     so leaving the group is the real action rather than a mail preference.
 *
 * Persistence: mailing_lists (read), mailing_list_subscriptions (read/write).
 *
 * Side effects: audit_entries append on a write that moves a row.
 */
import { randomUUID } from 'crypto';

import { mailingListSubscriptions, transaction } from '../db/db';
import { readUnsubscribeToken } from '../lib/unsubscribeToken';
import { appendAuditEntry } from './auditService';
import { ValidationError } from './serviceErrors';
import type { PageViewModel } from '../types/page';

interface MemberSubscriptionRow {
  slug: string;
  name: string;
  description: string;
  subscription_status: string | null;
  status_updated_at: string | null;
}

export interface EmailSubscriptionListViewModel {
  slug: string;
  name: string;
  description: string;
  isSubscribed: boolean;
  isLocked: boolean;
  stateLabel: string;
  stateExplanation: string;
}

export interface EmailSubscriptionsContent {
  formAction: string;
  backHref: string;
  lists: EmailSubscriptionListViewModel[];
  hasLists: boolean;
  notice: string;
  hasNotice: boolean;
  errorMessage: string;
  hasError: boolean;
}

export type SubscriptionChangeOutcome =
  /** The row moved to the state the member chose. */
  | { status: 'subscribed' }
  | { status: 'unsubscribed' }
  /** The row already held that state, so nothing moved. */
  | { status: 'noop'; reason: 'unchanged' };

/** What each state is called on the member's own screen, in their words. */
const STATE_LABELS: Record<string, string> = {
  subscribed: 'Receiving',
  unsubscribed: 'Not receiving',
  bounced: 'Paused, mail bounced',
  complained: 'Paused, reported as spam',
  suppressed: 'Set aside by an administrator',
  none: 'Not receiving',
};

const STATE_EXPLANATIONS: Record<string, string> = {
  subscribed: 'You receive messages sent to this list.',
  unsubscribed: 'You are not receiving these, and will not until you turn them back on.',
  bounced: 'Mail to your address came back undelivered, so this list is paused. Turning it on again resumes it once your address is working.',
  complained: 'A message from this list was reported as spam, so it is paused. Turn it on again if that was not what you meant.',
  suppressed: 'An administrator set this one aside for your address. Contact us if you would like it restored.',
  none: 'You are not receiving these.',
};

/** What each outcome says on the page the change returns to. */
const SUBSCRIPTION_NOTICES: Record<string, string> = {
  subscribed: 'Turned on. You will receive the next message sent to that list.',
  unsubscribed: 'Turned off. You will not receive any further messages from that list.',
  unchanged: 'That was already how it was set, so nothing changed.',
};

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

  /**
   * The member's own subscription screen: every list they may manage, and the
   * state they hold on each.
   */
  getSubscriptionsPage(
    memberKey: string,
    memberId: string,
    opts: { notice?: string; errorMessage?: string } = {},
  ): PageViewModel<EmailSubscriptionsContent> {
    const rows = mailingListSubscriptions.listMemberManageableForMember.all(memberId) as
      MemberSubscriptionRow[];

    const lists = rows.map((row) => {
      const status = row.subscription_status ?? 'none';
      return {
        slug: row.slug,
        name: row.name,
        description: row.description,
        isSubscribed: status === 'subscribed',
        isLocked: status === 'suppressed',
        stateLabel: STATE_LABELS[status] ?? STATE_LABELS.none!,
        stateExplanation: STATE_EXPLANATIONS[status] ?? STATE_EXPLANATIONS.none!,
      };
    });

    const notice = opts.notice ? SUBSCRIPTION_NOTICES[opts.notice] ?? '' : '';

    return {
      seo: { title: 'Email Preferences', noindex: true },
      page: {
        sectionKey: 'members',
        pageKey: 'member_email_preferences',
        title: 'Email Preferences',
      },
      content: {
        formAction: `/members/${memberKey}/email-preferences`,
        backHref: `/members/${memberKey}`,
        lists,
        hasLists: lists.length > 0,
        notice,
        hasNotice: notice.length > 0,
        errorMessage: opts.errorMessage ?? '',
        hasError: (opts.errorMessage ?? '').length > 0,
      },
    };
  },

  /**
   * The member subscribing to or withdrawing from one list they may manage.
   * The member is named by the session, never by the request body, so this can
   * only ever act on the caller's own subscriptions.
   */
  setOwnSubscription(
    memberId: string,
    slug: string,
    subscribe: boolean,
  ): SubscriptionChangeOutcome {
    const offered = (mailingListSubscriptions.listMemberManageableForMember.all(memberId) as
      MemberSubscriptionRow[]).find((row) => row.slug === slug);
    // A list the screen does not offer is not one a member may act on, whether
    // it is archived, group-backed, administrators-only, or simply absent. The
    // member and the page are both real, so this is a bad choice rather than a
    // missing page, and it says so on the screen they chose from. Nothing is
    // revealed by saying so: every member is offered the same set.
    if (!offered) {
      throw new ValidationError('That is not one of the mailings you can choose.');
    }
    if (offered.subscription_status === 'suppressed') {
      throw new ValidationError(
        'This list was set aside for your address by an administrator. Contact us if you would like it restored.',
      );
    }

    const nowIso = new Date().toISOString();
    let changed = 0;

    // The write and its audit row are one fact: a subscription that moved with
    // nothing in the ledger saying so leaves no account of a member's own
    // consent decision.
    transaction(() => {
      const result = subscribe
        ? mailingListSubscriptions.memberSubscribe.run(
          `mls_${randomUUID().replace(/-/g, '').slice(0, 24)}`,
          nowIso, memberId, nowIso, memberId, slug, memberId, nowIso,
        )
        : mailingListSubscriptions.memberUnsubscribe.run(nowIso, nowIso, memberId, slug, memberId);
      changed = result.changes;

      // A repeated choice moves nothing, and recording it would fill the ledger
      // with decisions the member did not actually make.
      //
      // The two action names are written out rather than chosen inline, because
      // the catalogue gate reads literal values: a name assembled at the call
      // site is invisible to it, and an audit vocabulary nothing checks is one
      // that drifts.
      if (changed > 0 && subscribe) {
        appendAuditEntry({
          actionType: 'mailing_list.subscribed',
          category: 'system',
          actorType: 'member',
          actorMemberId: memberId,
          entityType: 'mailing_list',
          entityId: slug,
          reasonText: 'Member subscribed from their email preferences',
        });
      } else if (changed > 0) {
        appendAuditEntry({
          actionType: 'mailing_list.unsubscribed',
          category: 'system',
          actorType: 'member',
          actorMemberId: memberId,
          entityType: 'mailing_list',
          entityId: slug,
          reasonText: 'Member withdrew from their email preferences',
        });
      }
    });

    return changed > 0
      ? { status: subscribe ? 'subscribed' : 'unsubscribed' }
      : { status: 'noop', reason: 'unchanged' };
  },
};
