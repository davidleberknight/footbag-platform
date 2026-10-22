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
 *   - The member's own way back from a bounce or a spam report on their
 *     address: lifting the mail provider's block on it, withdrawing a spam
 *     report when they turn a mailing back on, and clearing a bounce, with the
 *     lists it paused, once they prove the address works.
 *
 * Does not own:
 *   - Admin list management, or the exceptional adjustment an administrator
 *     makes to a member's subscription on their behalf.
 *   - Minting the token or attaching the headers, which belong to the send path.
 *   - Recording a bounce or a complaint (SesFeedbackService), and sending the
 *     verification link that proves a bounced address works
 *     (IdentityAccessService, which calls the bounce recovery here inside its
 *     token-consume transaction).
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
 *   - Every way back from a bounce or a spam report is the member's own act on
 *     their own address. Each clears only its own mark, so an administrator's
 *     'suppressed' block on the address is never lifted from here. The
 *     provider's block is lifted before any transaction opens, and a failure
 *     there changes nothing on the platform side.
 *   - A bounce clears only on proof, never on the asking: turning a list on
 *     while bounced moves the row and resumes nothing.
 *
 * Persistence: mailing_lists (read), mailing_list_subscriptions (read/write),
 * members (email_status, read/write).
 *
 * Side effects: audit_entries append on a write that moves a row, on a
 * withdrawn spam report and on a member's recovered address (a registrant
 * still onboarding recovers with no audit row); SES suppression lift
 * through CommunicationService; recordOperationalError when that lift fails.
 */
import { randomUUID } from 'crypto';

import { account, mailingListSubscriptions, sesFeedback, transaction } from '../db/db';
import { readUnsubscribeToken } from '../lib/unsubscribeToken';
import { appendAuditEntry, findOwnLatestAudit, isMember } from './auditService';
import { getCommunicationService } from './communicationService';
import { recordOperationalError } from './operationalErrors';
import { ServiceUnavailableError, ValidationError } from './serviceErrors';
import type { PageViewModel } from '../types/page';
import type { OutcomeTone } from '../lib/outcomeNotice';

interface EmailRecoveryStateRow {
  id: string;
  login_email: string | null;
  login_email_normalized: string | null;
  email_status: string;
}

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
  /** Why mailings to the member's address are stopped; empty while it receives mail. */
  addressNotice: string;
  hasAddressNotice: boolean;
  /** Offered only for a bounced address, which the member can prove works again. */
  showRecover: boolean;
  recoverAction: string;
  notice: string;
  noticeTone?: OutcomeTone;
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
  bounced: 'Mail to your address came back undelivered, so this list is paused. It resumes when you confirm your address works.',
  complained: 'A message from this list was reported as spam, so it is paused. Turn it on again to resume it.',
  suppressed: 'An administrator set this one aside for your address. Contact us if you would like it restored.',
  none: 'You are not receiving these.',
};

/**
 * What each outcome says on the page the change returns to, and the tone it
 * takes. Turning a list on and turning it off are both changes the member
 * asked for and got; a setting that already held changed nothing, and reporting
 * that in the same treatment would claim an act that never happened.
 */
const SUBSCRIPTION_NOTICES: Record<string, [OutcomeTone, string]> = {
  subscribed:   ['ok',   'Turned on. You will receive the next message sent to that list.'],
  unsubscribed: ['ok',   'Turned off. You will not receive any further messages from that list.'],
  unchanged:    ['info', 'That was already how it was set, so nothing changed.'],
  recovery_sent:     ['ok',   'We sent a link to your address. Open it to confirm the address works and resume your mailings.'],
  recovery_unneeded: ['info', 'Your address is already receiving mail, so nothing changed.'],
};

/** What the member's screen says about their address while mailings to it are stopped. */
const ADDRESS_NOTICES: Record<string, string> = {
  bounced: 'Mail to your address came back undelivered, so we have stopped sending you mailings. If your address works again, confirm it and we will send you a link.',
  complained: 'You reported one of our messages as spam, so we have stopped sending you mailings. Turn on any list below to start receiving it again.',
};

/**
 * Takes the member's address off the mail provider's own suppression list, on
 * that member's own request. The provider drops every send to a listed address,
 * so clearing the platform's mark without this would resume nothing. Runs
 * before any transaction, because it is a call to the provider; a failure is
 * recorded for an operator and reported to the member as a temporary outage,
 * with nothing on the platform side changed.
 */
export async function liftOwnAddressSuppression(memberId: string, address: string): Promise<void> {
  try {
    await getCommunicationService().liftAddressSuppression(address);
  } catch (err) {
    recordOperationalError({
      actionType: 'email.suppression_lift_failed',
      entityType: 'member',
      entityId: memberId,
      actorType: 'member',
      actorMemberId: memberId,
      reasonText: 'The mail provider refused to take a member\'s address off its suppression list.',
      cause: err,
    });
    throw new ServiceUnavailableError(
      'We could not resume mail to your address just now. Please try again in a few minutes.',
    );
  }
}

/**
 * Clears a bounce once the member has opened a verification link sent to the
 * address, and turns back on the lists that bounce paused. Runs inside the
 * caller's token-consume transaction, so the proof and its effect land
 * together. A member whose address was not bounced is left as they are.
 *
 * Only a member's recovery is audited. A registrant whose first verification
 * mail bounced recovers through this same path before onboarding finishes,
 * and the audit log holds no row about someone who is not a member.
 */
export function recoverBouncedAddressInTx(memberId: string, nowIso: string): void {
  const cleared = sesFeedback.clearBouncedForMember.run(nowIso, memberId, memberId);
  if (cleared.changes === 0) return;
  const restored = mailingListSubscriptions.restoreBouncedForMember.run(
    nowIso, nowIso, memberId, memberId,
  );
  if (!isMember(memberId)) return;
  appendAuditEntry({
    actionType: 'email.address_recovered',
    actorType: 'member',
    actorMemberId: memberId,
    entityType: 'member',
    entityId: memberId,
    reasonText: 'Member confirmed a bounced address works again through a verification link',
    metadata: { restored_lists: restored.changes },
  });
}

/** The page the unsubscribe address opens, and the page its button lands on. */
export interface UnsubscribeContent {
  /** True once the button was pressed: the outcome page. */
  done: boolean;
  /** On the outcome page, what happened and its tone: withdrawn, or the link
   *  refused with nothing changed. */
  outcomeText?: string;
  outcomeTone?: OutcomeTone;
  /** Where the button posts; null on the outcome page. */
  actionHref: string | null;
}

export type UnsubscribeOutcome =
  /** The token was valid and the subscription is now withdrawn, or already was. */
  | { status: 'done' }
  /** The token was not one this deployment minted. */
  | { status: 'rejected' };

export const emailSubscriptionService = {
  /**
   * The page a person sees after pressing the unsubscribe button. A refused
   * link says nothing changed, or the reader would believe they had left a list
   * they still receive. A refusal means only that the link's signature failed,
   * which reveals nothing about any address or member.
   */
  getUnsubscribeOutcomePage(outcome: UnsubscribeOutcome): PageViewModel<UnsubscribeContent> {
    const refused = outcome.status === 'rejected';
    return {
      seo: { title: 'Unsubscribe', noindex: true },
      page: { sectionKey: '', pageKey: 'email_unsubscribe', title: 'Unsubscribe' },
      content: {
        done: true,
        actionHref: null,
        outcomeText: refused
          ? 'This unsubscribe link did not work, so nothing was changed. Sign in and open Email Preferences on your profile to unsubscribe.'
          : 'You are unsubscribed from this mailing list.',
        outcomeTone: refused ? 'no' : 'ok',
      },
    };
  },

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

    const address = account.emailRecoveryStateById.get(memberId) as EmailRecoveryStateRow | undefined;
    const addressNotice = address ? ADDRESS_NOTICES[address.email_status] ?? '' : '';

    const outcome = opts.notice ? SUBSCRIPTION_NOTICES[opts.notice] : undefined;

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
        addressNotice,
        hasAddressNotice: addressNotice.length > 0,
        showRecover: address?.email_status === 'bounced',
        recoverAction: `/members/${memberKey}/email-preferences/recover`,
        notice: outcome ? outcome[1] : '',
        ...(outcome ? { noticeTone: outcome[0] } : {}),
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
  async setOwnSubscription(
    memberId: string,
    slug: string,
    subscribe: boolean,
  ): Promise<SubscriptionChangeOutcome> {
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

    // A member who reported spam and now turns a mailing on has opted back in,
    // which is the one act that withdraws the report. The provider holds its
    // own block on the address, so that is lifted first; the mark and the list
    // then change together below. Only the list chosen resumes: every other
    // list the report paused waits for its own choice.
    let withdrawsComplaint = false;
    if (subscribe) {
      const address = account.emailRecoveryStateById.get(memberId) as EmailRecoveryStateRow | undefined;
      if (address?.email_status === 'complained' && address.login_email) {
        await liftOwnAddressSuppression(memberId, address.login_email);
        withdrawsComplaint = true;
      }
    }

    const nowIso = new Date().toISOString();
    let changed = 0;
    let complaintWithdrawn = false;

    // The write and its audit row are one fact: a subscription that moved with
    // nothing in the ledger saying so leaves no account of a member's own
    // consent decision.
    transaction(() => {
      if (withdrawsComplaint) {
        complaintWithdrawn = sesFeedback.clearComplainedForMember.run(nowIso, memberId, memberId).changes > 0;
        if (complaintWithdrawn) {
          appendAuditEntry({
            actionType: 'email.complaint_withdrawn',
            actorType: 'member',
            actorMemberId: memberId,
            entityType: 'member',
            entityId: memberId,
            reasonText: 'Member turned a mailing back on after reporting a message as spam',
            metadata: { list_slug: slug },
          });
        }
      }

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
          actorType: 'member',
          actorMemberId: memberId,
          entityType: 'mailing_list',
          entityId: slug,
          reasonText: 'Member subscribed from their email preferences',
        });
      } else if (changed > 0) {
        appendAuditEntry({
          actionType: 'mailing_list.unsubscribed',
          actorType: 'member',
          actorMemberId: memberId,
          entityType: 'mailing_list',
          entityId: slug,
          reasonText: 'Member withdrew from their email preferences',
        });
      }
    });

    // Withdrawing a spam report resumes mail even where the list row itself
    // already read as on, so it is reported as the change it is. A setting that
    // already held is this member's own repeat when their own latest choice on
    // the list is this one: it reports that choice again rather than "nothing
    // changed", since the member did make the change.
    return changed > 0 || complaintWithdrawn || ownLatestChoiceIs(memberId, slug, subscribe)
      ? { status: subscribe ? 'subscribed' : 'unsubscribed' }
      : { status: 'noop', reason: 'unchanged' };
  },
};

/**
 * Whether this member's own latest subscribe or withdraw on a list is the one
 * now asked for. The audit rows name the list rather than the member, so the
 * member's own rows are read and the later of the two decides.
 */
function ownLatestChoiceIs(memberId: string, slug: string, subscribe: boolean): boolean {
  const on = findOwnLatestAudit(memberId, 'mailing_list.subscribed', 'mailing_list', slug);
  const off = findOwnLatestAudit(memberId, 'mailing_list.unsubscribed', 'mailing_list', slug);
  const latest = !on ? off : !off ? on : (on.occurred_at >= off.occurred_at ? on : off);
  if (!latest) return false;
  return subscribe ? latest === on : latest === off;
}
