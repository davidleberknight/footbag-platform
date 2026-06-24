/**
 * Exported email content builders. Each returns the subject and plain-text body
 * for one outbound email from typed inputs, so the sending service and its test
 * import the same builder instead of duplicating copy. Bodies are plain text:
 * the SES transport sends them as a text part, so an interpolated member-supplied
 * value cannot inject mail headers, and a newline in a value only adds body lines.
 */

export interface EmailContent {
  subject: string;
  bodyText: string;
}

const TIER_LABEL = {
  tier0: 'Tier 0',
  tier1: 'Tier 1 (IFPA Member)',
  tier2: 'Tier 2 (IFPA Organizer Member)',
  tier3: 'Tier 3 (IFPA Director)',
} as const;

export type TierKey = keyof typeof TIER_LABEL;

/**
 * Tells a vouched member they now hold Active Player status. The voucher's
 * public display name and the expiry date are interpolated; the body states the
 * Tier 1 benefit that Active Player carries.
 */
export function vouchConfirmationEmail(input: {
  voucherName: string;
  expiryDate: string;
}): EmailContent {
  return {
    subject: 'You have received Active Player status',
    bodyText: [
      `You have received Active Player status from ${input.voucherName}.`,
      `Your Active Player status is now active until ${input.expiryDate}.`,
      'As an Active Player you have Tier 1 benefits while current.',
    ].join('\n'),
  };
}

/**
 * Congratulates a member on a Hall of Fame or Big Add Posse induction. When the
 * member is already a Tier 3 director the honor sets Tier 2 as the underlying
 * tier they revert to rather than changing their current tier, so the body says
 * so; otherwise the honor grants Tier 2 outright.
 */
export function honorCongratulationEmail(input: {
  honor: 'hof' | 'bap';
  staysTier3: boolean;
}): EmailContent {
  const honorLine = input.honor === 'hof'
    ? 'Congratulations, you have been inducted into the Footbag Hall of Fame.'
    : 'Congratulations, you have been recognized in the Big Add Posse.';
  const tierLine = input.staysTier3
    ? 'This permanent honor sets Tier 2 as your underlying IFPA membership, held under your current Tier 3 director status.'
    : 'This permanent honor grants you Tier 2 IFPA membership.';
  return {
    subject: 'Congratulations from the IFPA',
    bodyText: [honorLine, '', tierLine].join('\n'),
  };
}

/**
 * Tells a member an administrator changed their membership tier, naming the new
 * tier and the mandatory reason the administrator recorded.
 */
export function tierChangeNoticeEmail(input: {
  newTier: TierKey;
  reasonText: string;
}): EmailContent {
  return {
    subject: 'Your IFPA membership status was updated',
    bodyText: [
      'An administrator updated your IFPA membership status.',
      '',
      `Membership tier: ${TIER_LABEL[input.newTier]}`,
      `Reason: ${input.reasonText}`,
    ].join('\n'),
  };
}

const SIGNOFF = '-- IFPA platform';

/** Confirms to a member that they joined or left a club. */
export function clubMembershipMemberEmail(input: {
  kind: 'join' | 'leave';
  memberName: string;
  clubName: string;
}): EmailContent {
  const verb = input.kind === 'join' ? 'joined' : 'left';
  return {
    subject: `You ${verb} ${input.clubName}`,
    bodyText: [
      `Hi ${input.memberName},`,
      '',
      `This confirms you ${verb} the club "${input.clubName}".`,
      '',
      'You can review your club memberships on your profile page.',
      '',
      SIGNOFF,
    ].join('\n'),
  };
}

/** Tells a club leader that a member joined or left their club. */
export function clubMembershipLeaderEmail(input: {
  kind: 'join' | 'leave';
  leaderName: string;
  memberName: string;
  clubName: string;
}): EmailContent {
  const verb = input.kind === 'join' ? 'joined' : 'left';
  return {
    subject: `${input.memberName} ${verb} ${input.clubName}`,
    bodyText: [
      `Hi ${input.leaderName},`,
      '',
      `${input.memberName} ${verb} your club "${input.clubName}".`,
      '',
      'You can review the roster on the club page.',
      '',
      SIGNOFF,
    ].join('\n'),
  };
}

/** Tells a club's existing co-leaders that a member self-added to leadership. */
export function clubVolunteerLeadershipEmail(input: {
  leaderName: string;
  joinerName: string;
  clubName: string;
}): EmailContent {
  return {
    subject: `${input.joinerName} is now a co-leader of ${input.clubName}`,
    bodyText: [
      `Hi ${input.leaderName},`,
      '',
      `${input.joinerName} volunteered to co-lead your club "${input.clubName}" and is now part of the leadership team.`,
      '',
      'You can review the co-leaders on the club page.',
      '',
      SIGNOFF,
    ].join('\n'),
  };
}

/** Invites a current club member to volunteer as a co-leader. Carries no link. */
export function clubCoLeaderInviteEmail(input: {
  inviteeName: string;
  clubName: string;
}): EmailContent {
  return {
    subject: `You're invited to co-lead ${input.clubName}`,
    bodyText: [
      `Hi ${input.inviteeName},`,
      '',
      `A co-leader of the footbag club "${input.clubName}" invited you to join its leadership as a co-leader.`,
      '',
      "Co-leaders share their contact email with other logged-in members and help keep the club's page up to date.",
      '',
      `To accept, log in to your account, open Clubs, find "${input.clubName}", and choose "Volunteer to co-lead". You must be a current member of the club with Tier 1 benefits, and a member can co-lead one club at a time.`,
      '',
      SIGNOFF,
    ].join('\n'),
  };
}

/** Asks members of a leaderless club to volunteer as co-leader. Carries no link. */
export function clubLeaderlessContactEmail(input: {
  memberName: string;
  clubName: string;
}): EmailContent {
  return {
    subject: `${input.clubName} could use a co-leader`,
    bodyText: [
      `Hi ${input.memberName},`,
      '',
      `Your footbag club "${input.clubName}" currently has no co-leader. A co-leader keeps the club's page up to date and is the club's point of contact for other members.`,
      '',
      `If you would like to step up, log in to your account, open Clubs, find "${input.clubName}", and choose "Volunteer to co-lead". You need Tier 1 benefits, and a member can co-lead one club at a time.`,
      '',
      SIGNOFF,
    ].join('\n'),
  };
}

/**
 * Reminds a Tier 0 member that their Active Player status is approaching expiry,
 * naming the date and the ways to regain or extend it. `isDayOf` switches the
 * subject for the day-of reminder.
 */
export function activePlayerExpiryReminderEmail(input: {
  displayDate: string;
  isDayOf: boolean;
}): EmailContent {
  return {
    subject: input.isDayOf
      ? 'Your IFPA Active Player status expires today'
      : 'Your IFPA Active Player status is about to expire',
    bodyText:
      `Hello,\n\n` +
      `Your Active Player status expires on ${input.displayDate}. Active Player ` +
      `status grants Tier 1 benefits (including inclusion on the Official IFPA ` +
      `Roster) to Tier 0 Registered Members. Your membership tier itself is ` +
      `for life and does not expire.\n\n` +
      `You can regain or extend Active Player status by any of the following:\n` +
      `  - Attending a qualifying IFPA-sanctioned event.\n` +
      `  - Being vouched for by a Tier 2 IFPA Organizer Member or Tier 3 Director.\n` +
      `  - Joining your first club, if you have not previously used this one-time grant.\n\n` +
      `--\nInternational Footbag Players Association\n`,
  };
}

/**
 * Receipt for a settled or failed payment. A successful membership purchase adds
 * the line confirming the new tier; a failure states no charge was applied.
 */
export function paymentReceiptEmail(input: {
  descriptor: string;
  amountDisplay: string;
  outcome: 'succeeded' | 'failed';
  isMembership: boolean;
  purchasedTier: 'tier1' | 'tier2' | null;
  referenceId: string;
}): EmailContent {
  const lines: string[] = [];
  lines.push(input.outcome === 'succeeded'
    ? 'Thank you for your payment.'
    : 'Your payment could not be completed.');
  lines.push('');
  lines.push(`Item:    ${input.descriptor}`);
  lines.push(`Amount:  ${input.amountDisplay}`);
  if (input.outcome === 'succeeded' && input.isMembership && input.purchasedTier === 'tier1') {
    lines.push('');
    lines.push('Your Tier 1 IFPA Member status is now active.');
  } else if (input.outcome === 'succeeded' && input.isMembership && input.purchasedTier === 'tier2') {
    lines.push('');
    lines.push('Your Tier 2 IFPA Organizer Member status is now active.');
  } else if (input.outcome === 'failed') {
    lines.push('');
    lines.push('No charge was applied and your membership tier was not changed.');
    lines.push('You can try again from your dashboard.');
  }
  lines.push('');
  lines.push(`Reference: ${input.referenceId}`);
  return {
    subject: input.outcome === 'succeeded'
      ? `Payment received: ${input.descriptor}`
      : `Payment failed: ${input.descriptor}`,
    bodyText: lines.join('\n'),
  };
}

function hourPhrase(n: number): string {
  return `${n} hour${n === 1 ? '' : 's'}`;
}

/** Email-verification message carrying the one-time confirmation link. */
export function accountVerifyEmail(input: { verifyUrl: string; ttlHours: number }): EmailContent {
  return {
    subject: 'Verify your IFPA Footbag account',
    bodyText:
      'Welcome to IFPA Footbag.\n\n' +
      `Please confirm your email address by opening the link below. The link expires in ${hourPhrase(input.ttlHours)}.\n\n` +
      `${input.verifyUrl}\n\n` +
      'If you did not request this account, you can ignore this message.',
  };
}

/** Legacy-account claim confirmation carrying the review-and-confirm link. */
export function legacyClaimConfirmEmail(input: { confirmUrl: string; ttlHours: number }): EmailContent {
  return {
    subject: 'Confirm your IFPA legacy account claim',
    bodyText:
      'Hello,\n\n' +
      'A claim request was submitted on your legacy IFPA account. ' +
      'Open the link below to review and confirm the link to your current account. ' +
      `The link expires in ${input.ttlHours} hours.\n\n` +
      `${input.confirmUrl}\n\n` +
      'If you did not initiate this claim, you can ignore this message; the link will expire unused.',
  };
}

/** Confirms a member-initiated password change. */
export function passwordChangedEmail(): EmailContent {
  return {
    subject: 'Your IFPA Footbag password was changed',
    bodyText:
      'This is a confirmation that the password for your IFPA Footbag account was just changed.\n\n' +
      'If this was not you, please reset your password immediately and contact admin@footbag.org.',
  };
}

/** Password-reset request message carrying the time-limited reset link. */
export function passwordResetRequestEmail(input: { resetUrl: string; ttlHours: number }): EmailContent {
  return {
    subject: 'Reset your IFPA Footbag password',
    bodyText:
      'A password reset was requested for your IFPA Footbag account.\n\n' +
      `Open the link below within ${hourPhrase(input.ttlHours)} to set a new password:\n\n` +
      `${input.resetUrl}\n\n` +
      'If you did not request this, you can ignore this message. Your current password remains in effect.',
  };
}

/** Confirms a password reset completed via the reset link. */
export function passwordResetConfirmEmail(): EmailContent {
  return {
    subject: 'Your IFPA Footbag password was changed',
    bodyText:
      'Your IFPA Footbag password was reset via the password-reset link.\n\n' +
      'If this was not you, contact admin@footbag.org immediately.',
  };
}

/** Asks the member to confirm control of a declared legacy footbag.org mailbox. */
export function mailboxLinkConfirmEmail(input: { verifyUrl: string; ttlHours: number }): EmailContent {
  return {
    subject: 'IFPA: confirm this was your footbag.org email address',
    bodyText:
      'You (or someone signed in to an IFPA Footbag account) told us this email ' +
      'address was used on the old footbag.org site.\n\n' +
      'If that was you, open the link below WHILE SIGNED IN to your IFPA account ' +
      `to confirm you still control this mailbox. The link expires in ${hourPhrase(input.ttlHours)}.\n\n` +
      `${input.verifyUrl}\n\n` +
      'If this was not you, you can ignore this message.',
  };
}

/**
 * Admin-alerts notification when a work-queue item is enqueued. Carries the task
 * type and entity id only, never member contact fields or message content.
 */
export function adminQueueAlertEmail(input: { taskType: string; entityId: string }): EmailContent {
  return {
    subject: `New admin queue item: ${input.taskType}`,
    bodyText: `Task type: ${input.taskType}\nEntity ID: ${input.entityId}`,
  };
}

/** Tells a member how their contact request was resolved, with the admin note. */
export function contactRequestResolutionEmail(input: {
  memberName: string;
  displayDecision: string;
  note: string;
}): EmailContent {
  return {
    subject: `Your IFPA contact request: ${input.displayDecision}`,
    bodyText: [
      `Hi ${input.memberName},`,
      '',
      `An IFPA administrator has resolved your contact request with decision: ${input.displayDecision}.`,
      '',
      'Admin note:',
      input.note,
      '',
      'If you need further assistance, you can submit a new contact request from your profile edit page.',
      '',
      'International Footbag Players Association',
    ].join('\n'),
  };
}
