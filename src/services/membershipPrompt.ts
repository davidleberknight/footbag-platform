/**
 * What a public page shows a non-member in place of a member-only action, such
 * as registering for an event or joining a club. A visitor is told plainly that
 * the action needs IFPA membership and is offered log-in, which returns them to
 * the action, and a free account. Someone signed in who has not finished
 * onboarding is not a member yet either, so they are sent on to finish it
 * rather than told to log in again.
 *
 * Pure shaping, with one read: the onboarding service's next outstanding task,
 * which names the wizard page a signed-in registrant goes to next.
 */
import { memberOnboardingService } from './memberOnboardingService';

/** Who is looking at the page: signed out, signed in but still onboarding, or a member. */
export type ViewerKind = 'visitor' | 'onboarding' | 'member';

export interface MembershipPromptAction {
  label: string;
  href: string;
  /** The prompt's main action; the rest are secondary. */
  isPrimary: boolean;
}

export interface MembershipPromptView {
  text: string;
  actions: MembershipPromptAction[];
}

const REGISTER_ACCOUNT_HREF = '/register';
const CREATE_ACCOUNT_LABEL = 'Create a Free Account';
const FINISH_ONBOARDING_LABEL = 'Finish Onboarding';

/** The log-in page, returning to `returnTo` once signed in. */
export function loginReturningTo(returnTo: string): string {
  return `/login?returnTo=${encodeURIComponent(returnTo)}`;
}

/**
 * The wizard page a signed-in registrant goes to next. With nothing outstanding
 * it is the complete page, which re-checks and sends them onward.
 */
export function onboardingWizardHref(memberId: string): string {
  const next = memberOnboardingService.nextOutstandingTaskType(memberId);
  return next ? `/register/wizard/${next}` : '/register/wizard/complete';
}

/** The prompt a visitor sees: membership is required, then log in or create an account. */
export function visitorMembershipPrompt(
  text: string, loginLabel: string, returnTo: string,
): MembershipPromptView {
  return {
    text,
    actions: [
      { label: loginLabel, href: loginReturningTo(returnTo), isPrimary: true },
      { label: CREATE_ACCOUNT_LABEL, href: REGISTER_ACCOUNT_HREF, isPrimary: false },
    ],
  };
}

/** The prompt a signed-in registrant still onboarding sees: finish onboarding first. */
export function onboardingMembershipPrompt(text: string, memberId: string): MembershipPromptView {
  return {
    text,
    actions: [{ label: FINISH_ONBOARDING_LABEL, href: onboardingWizardHref(memberId), isPrimary: true }],
  };
}
