/**
 * The vocabulary every member obligation is expressed in: the item, its
 * options, the two named constructors that fix urgency, and the source role a
 * domain implements.
 *
 * This module imports nothing. Each owning domain builds its items from it,
 * and the aggregator in `memberActionService` imports both this and the
 * domains; keeping the vocabulary separate is what lets a domain contribute a
 * source without the aggregator and the domain importing each other.
 */

/** Needs attention now, or can wait. There is no third level. */
export type MemberActionUrgency = 'now' | 'pending';

export interface MemberActionOptionField {
  name: string;
  value: string;
}

/**
 * One way to resolve an item. Whether it navigates or submits is decided here,
 * at construction, and carried as a boolean, so no template decides it.
 */
export interface MemberActionOption {
  label: string;
  /**
   * The item's leading option. Set when the item is built, not by the source
   * and not by the template, so every item presents exactly one primary
   * control and the action hierarchy is decided in one place.
   */
  isPrimary: boolean;
  isSubmit: boolean;
  /** Set for a navigating option; null for a submitting one. */
  href: string | null;
  /** Set for a submitting option; null for a navigating one. */
  action: string | null;
  fields: readonly MemberActionOptionField[];
}

export function navigateTo(label: string, href: string): MemberActionOption {
  return { label, isPrimary: false, isSubmit: false, href, action: null, fields: [] };
}

export function submitTo(
  label: string,
  action: string,
  fields: readonly MemberActionOptionField[] = [],
): MemberActionOption {
  return { label, isPrimary: false, isSubmit: true, href: null, action, fields };
}

export interface MemberActionItem {
  /** Identifies the obligation type, for the template's key and for tests. */
  kind: string;
  urgency: MemberActionUrgency;
  /** Pre-shaped, so the template never compares the urgency value itself. */
  isUrgent: boolean;
  headline: string;
  /** One non-private line, or null. Never carries private content. */
  detail: string | null;
  /** ISO date the obligation runs out, or null when it has no deadline. */
  deadline: string | null;
  options: readonly MemberActionOption[];
}

interface MemberActionItemInput {
  kind: string;
  headline: string;
  detail?: string | null;
  deadline?: string | null;
  options: readonly MemberActionOption[];
}

/**
 * Urgency is chosen by calling one of these two rather than by assigning a
 * value, so the rule that there are exactly two levels has one home and a
 * third can never be introduced by a caller.
 */
export function urgentAction(input: MemberActionItemInput): MemberActionItem {
  return buildItem(input, 'now');
}

export function pendingAction(input: MemberActionItemInput): MemberActionItem {
  return buildItem(input, 'pending');
}

function buildItem(input: MemberActionItemInput, urgency: MemberActionUrgency): MemberActionItem {
  return {
    kind: input.kind,
    urgency,
    isUrgent: urgency === 'now',
    headline: input.headline,
    detail: input.detail ?? null,
    deadline: input.deadline ?? null,
    // The leading option is the item's primary control; the rest are
    // subordinate. Sources declare the order, this fixes the hierarchy.
    options: input.options.map((option, index) => ({ ...option, isPrimary: index === 0 })),
  };
}

/**
 * What a source is told about the member. The slug is here because an option's
 * href is fixed when the option is built and the owner-only surfaces items
 * point at are slug-scoped; a source given only the id would have to look the
 * slug up again on every page draw.
 */
export interface MemberActionContext {
  memberId: string;
  slug: string;
}

/** The single-method role a domain implements to contribute its obligations. */
export interface MemberActionSource {
  /** Stable key; also the tie-break order when neither item has a deadline. */
  readonly sourceKey: string;
  itemsFor(ctx: MemberActionContext): MemberActionItem[];
}
