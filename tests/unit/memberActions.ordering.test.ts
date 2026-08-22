/**
 * The member action collection orders itself on construction, and that ordering
 * is the only one: both the action block and the cross-page banner read it.
 *
 * Driven by fake sources rather than real domains, so the rule is pinned
 * independently of what any one domain currently contributes.
 */
import { describe, it, expect } from 'vitest';
import { buildMemberActions } from '../../src/services/memberActionService';
import {
  navigateTo,
  pendingAction,
  submitTo,
  urgentAction,
  type MemberActionItem,
  type MemberActionSource,
} from '../../src/services/memberActionItem';

const CTX = { memberId: 'm-1', slug: 'someone' };

function sourceOf(sourceKey: string, ...items: MemberActionItem[]): MemberActionSource {
  return { sourceKey, itemsFor: () => items };
}

function kinds(sources: MemberActionSource[]): string[] {
  return buildMemberActions(CTX, sources).items.map((i) => i.kind);
}

describe('urgency leads', () => {
  it('puts every needs-attention-now item before every item that can wait', () => {
    const order = kinds([
      sourceOf('a', pendingAction({ kind: 'waits', headline: 'h', options: [] })),
      sourceOf('b', urgentAction({ kind: 'now', headline: 'h', options: [] })),
    ]);
    expect(order).toEqual(['now', 'waits']);
  });

  it('answers whether anything urgent is held, which is what drives the banner', () => {
    const onlyPending = buildMemberActions(CTX, [
      sourceOf('a', pendingAction({ kind: 'waits', headline: 'h', options: [] })),
    ]);
    expect(onlyPending.hasUrgent).toBe(false);
    expect(onlyPending.isEmpty).toBe(false);

    const withUrgent = buildMemberActions(CTX, [
      sourceOf('a', urgentAction({ kind: 'now', headline: 'h', options: [] })),
    ]);
    expect(withUrgent.hasUrgent).toBe(true);
  });

  it('is empty when no source holds anything', () => {
    const none = buildMemberActions(CTX, [sourceOf('a'), sourceOf('b')]);
    expect(none.isEmpty).toBe(true);
    expect(none.hasUrgent).toBe(false);
    expect(none.items).toEqual([]);
  });
});

describe('deadline breaks ties inside an urgency band', () => {
  it('sorts the soonest deadline first', () => {
    const order = kinds([
      sourceOf('a', urgentAction({ kind: 'later', headline: 'h', deadline: '2026-09-01', options: [] })),
      sourceOf('b', urgentAction({ kind: 'sooner', headline: 'h', deadline: '2026-08-01', options: [] })),
    ]);
    expect(order).toEqual(['sooner', 'later']);
  });

  it('sorts an item with no deadline after a dated one, because the dated one runs out', () => {
    const order = kinds([
      sourceOf('a', urgentAction({ kind: 'undated', headline: 'h', options: [] })),
      sourceOf('b', urgentAction({ kind: 'dated', headline: 'h', deadline: '2030-01-01', options: [] })),
    ]);
    expect(order).toEqual(['dated', 'undated']);
  });

  it('never lets a sooner deadline jump an urgency band', () => {
    const order = kinds([
      sourceOf('a', pendingAction({ kind: 'waits_tomorrow', headline: 'h', deadline: '2026-08-01', options: [] })),
      sourceOf('b', urgentAction({ kind: 'now_next_year', headline: 'h', deadline: '2027-08-01', options: [] })),
    ]);
    expect(order).toEqual(['now_next_year', 'waits_tomorrow']);
  });
});

describe('source order is the last tie-break', () => {
  it('keeps registration order when urgency and deadline both match', () => {
    const first = sourceOf('first', urgentAction({ kind: 'from_first', headline: 'h', options: [] }));
    const second = sourceOf('second', urgentAction({ kind: 'from_second', headline: 'h', options: [] }));
    expect(kinds([first, second])).toEqual(['from_first', 'from_second']);
    expect(kinds([second, first])).toEqual(['from_second', 'from_first']);
  });

  it('keeps one source’s own items in the order it returned them', () => {
    const order = kinds([
      sourceOf(
        'a',
        urgentAction({ kind: 'one', headline: 'h', options: [] }),
        urgentAction({ kind: 'two', headline: 'h', options: [] }),
      ),
    ]);
    expect(order).toEqual(['one', 'two']);
  });
});

describe('the item shape keeps private content out', () => {
  it('carries a headline, an optional line, options and a deadline, and nothing else', () => {
    const item = urgentAction({ kind: 'k', headline: 'Head', options: [] });
    expect(Object.keys(item).sort()).toEqual(
      ['deadline', 'detail', 'headline', 'isUrgent', 'kind', 'options', 'urgency'],
    );
    expect(item.detail).toBeNull();
    expect(item.deadline).toBeNull();
  });

  it('fixes urgency through the constructor rather than by assignment', () => {
    expect(urgentAction({ kind: 'k', headline: 'h', options: [] }).urgency).toBe('now');
    expect(urgentAction({ kind: 'k', headline: 'h', options: [] }).isUrgent).toBe(true);
    expect(pendingAction({ kind: 'k', headline: 'h', options: [] }).urgency).toBe('pending');
    expect(pendingAction({ kind: 'k', headline: 'h', options: [] }).isUrgent).toBe(false);
  });
});

describe('an option is navigation or submission, decided when it is built', () => {
  it('builds a navigating option with an href and no form action', () => {
    const option = navigateTo('Answer', '/members/someone/questions');
    expect(option.isSubmit).toBe(false);
    expect(option.href).toBe('/members/someone/questions');
    expect(option.action).toBeNull();
    expect(option.fields).toEqual([]);
  });

  it('builds a submitting option with a form action and its hidden fields', () => {
    const option = submitTo('Upgrade to Tier 1', '/members/someone/purchase-tier', [
      { name: 'tier', value: 'tier1' },
    ]);
    expect(option.isSubmit).toBe(true);
    expect(option.action).toBe('/members/someone/purchase-tier');
    expect(option.href).toBeNull();
    expect(option.fields).toEqual([{ name: 'tier', value: 'tier1' }]);
  });

  it('marks exactly the leading option primary, so one control leads each item', () => {
    const item = urgentAction({
      kind: 'k',
      headline: 'h',
      options: [navigateTo('First', '/a'), navigateTo('Second', '/b'), navigateTo('Third', '/c')],
    });
    expect(item.options.map((o) => o.isPrimary)).toEqual([true, false, false]);
  });
});
