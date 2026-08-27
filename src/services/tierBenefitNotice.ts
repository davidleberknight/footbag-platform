/**
 * The card a member reads where a Tier 1 benefit's control would have been.
 *
 * A member without the benefit is never handed the control and then refused:
 * the control's place carries this card instead, and the same text answers a
 * direct request for the form behind it. So one builder serves both the page
 * that would have shown the control and the refusal that replaces the generic
 * permission wall.
 *
 * Two sentences and one button. The first names what is out of reach, the
 * second sells the tier that unlocks it and states the price, and the button is
 * the only control, because the other routes to the benefit are not this
 * member's click to make: a vouch is given by a Tier 2 or Tier 3 member, and an
 * event or a first club is a choice made on another page. The Active Player
 * clause is short and last, but present: the IFPA rules give a Tier 0 member the
 * same benefits while that status is current, so a card offering only the
 * purchase would tell the member that paying is the only road when it is not.
 *
 * The price comes from the payment service, the same source that prints it
 * beside the real purchase buttons, so the two cannot drift apart. The button
 * points at the membership block on the member's own profile rather than buying
 * anything, because that block sells both paid tiers and shows what each costs,
 * and one control cannot choose between them.
 */
import { TierBenefitNotice } from '../types/page';
import { paymentService } from './paymentService';

/** Which benefit is out of reach, which decides only the opening sentence. */
export type TierBenefitKind = 'media' | 'club' | 'general';

const LEADS: Record<TierBenefitKind, string> = {
  media: 'Sharing media is a Tier 1 benefit.',
  club: "Starting a new club is a Tier 1 benefit, because you become the club's first leader.",
  general: 'This is a Tier 1 benefit.',
};

function explanation(): string {
  return (
    `IFPA membership costs a one-time ${paymentService.getTierPriceDisplay('tier1')}, lasts for ` +
    'life, and includes it; you can also hold Tier 1 benefits while Active Player status is current.'
  );
}

export function buildTierBenefitNotice(slug: string, kind: TierBenefitKind): TierBenefitNotice {
  return {
    lead: LEADS[kind],
    explanation: explanation(),
    upgradeLabel: 'Upgrade Your Membership',
    upgradeHref: `/members/${slug}#membership`,
  };
}
