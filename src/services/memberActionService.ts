/**
 * MemberActionService -- the member's action block and its cross-page banner.
 *
 * Owns:
 *   - The set of sources it asks, and the aggregation of their items into one
 *     ordered collection that both the action block and the banner read.
 *   - The ordering and grouping rule, which lives here and nowhere else.
 *
 * Does not own:
 *   - Any obligation. A source lives in the domain that raises the obligation
 *     and reads through that domain's own service, so only the part of the
 *     platform that knows a deadline decides what is urgent.
 *   - The item vocabulary, which is `memberActionItem` so a domain can build
 *     items without importing this service.
 *   - Any SQL. This service holds none and assigns no urgency.
 *
 * Required patterns:
 *   - Obligations are derived when a page is drawn, never stored. Nothing is
 *     published, queued or persisted on the block's behalf, and no item carries
 *     a dismissal: an item stops being returned when the record behind it
 *     changes, which is the only way it clears.
 *   - An item carries a headline, an optional non-private detail line, its
 *     options and an optional deadline, and nothing else. There is no free-form
 *     body, so private content cannot reach either surface; anything private is
 *     read on the owner-only page an option links to.
 *   - The collection is ordered on construction and is the only ordering.
 *   - Every source runs on each authenticated page draw, because the banner has
 *     to know whether anything urgent is held. If that cost grows, the answer is
 *     to remember the result for the life of one request, never to start storing
 *     notifications.
 *
 * Persistence: none.
 * Side effects: none.
 */
import {
  MemberActionContext,
  MemberActionItem,
  MemberActionSource,
} from './memberActionItem';
import { activePlayerActionSource } from './activePlayerService';
import { memberQuestionActionSource } from './memberMessageService';
import { paymentActionSource } from './paymentService';

/**
 * One member's obligations, ordered on construction: needs-attention-now before
 * pending, then soonest deadline, then the order the sources are listed in
 * below. Within one urgency band an item with no deadline sorts after one that
 * has a deadline, because a dated obligation is the one that runs out.
 */
export interface MemberActions {
  items: readonly MemberActionItem[];
  urgentItems: readonly MemberActionItem[];
  pendingItems: readonly MemberActionItem[];
  isEmpty: boolean;
  hasUrgent: boolean;
}

// Source order is this list's order, and it is the last tie-break. Active
// Player leads because it is the obligation with a date on it.
//
// Resolved when a page is drawn rather than captured at module load. Each source
// lives in the domain that owns its obligation, and those domains legitimately
// reach back to the member surfaces this list feeds, so binding the values here
// at load time makes the list depend on which module happened to be imported
// first. That resolved to `undefined` and failed at the call, a long way from
// the import that caused it.
function defaultSources(): readonly MemberActionSource[] {
  return [
    activePlayerActionSource,
    memberQuestionActionSource,
    paymentActionSource,
  ];
}

function orderItems(
  collected: ReadonlyArray<{ item: MemberActionItem; sourceIndex: number }>,
): MemberActionItem[] {
  return [...collected]
    .sort((a, b) => {
      if (a.item.isUrgent !== b.item.isUrgent) return a.item.isUrgent ? -1 : 1;
      const ad = a.item.deadline;
      const bd = b.item.deadline;
      if (ad !== bd) {
        if (ad === null) return 1;
        if (bd === null) return -1;
        return ad < bd ? -1 : 1;
      }
      return a.sourceIndex - b.sourceIndex;
    })
    .map((entry) => entry.item);
}

export function buildMemberActions(
  ctx: MemberActionContext,
  sources: readonly MemberActionSource[],
): MemberActions {
  const collected: Array<{ item: MemberActionItem; sourceIndex: number }> = [];
  sources.forEach((source, sourceIndex) => {
    for (const item of source.itemsFor(ctx)) {
      collected.push({ item, sourceIndex });
    }
  });
  const items = orderItems(collected);
  return {
    items,
    urgentItems: items.filter((i) => i.isUrgent),
    pendingItems: items.filter((i) => !i.isUrgent),
    isEmpty: items.length === 0,
    hasUrgent: items.some((i) => i.isUrgent),
  };
}

export const memberActionService = {
  /** Ask every registered source what it currently holds for this member. */
  collectFor(ctx: MemberActionContext): MemberActions {
    return buildMemberActions(ctx, defaultSources());
  },

  /** The registered set, for the test that pins which domains contribute. */
  listSourceKeys(): string[] {
    return defaultSources().map((s) => s.sourceKey);
  },
};
