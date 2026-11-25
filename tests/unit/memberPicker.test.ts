/**
 * The member picker's shaping: which `pick` values are read as intents, which
 * picker of a page opens, what a Choose leaves chosen, and where each button
 * posts.
 */
import { describe, it, expect } from 'vitest';
import {
  buildMemberPicker, buildRecordPicker, parsePickIntent, playerSearchOutcome,
  type MemberPickerInput, type RecordPickerInput,
} from '../../src/services/memberPicker';

const MAX = { memberId: 'm-max', displayName: 'Max Ito', location: 'Boulder, CO, United States' };

function input(overrides: Partial<MemberPickerInput> = {}): MemberPickerInput {
  return {
    formId: 'reg-form',
    formAction: '/events/e/register',
    fieldName: 'partner',
    fieldKey: 'partner-d1',
    label: 'Partner',
    searchLabel: "Partner's name",
    openLabel: 'Choose Partner',
    rowAction: { label: 'Choose', completes: false, ariaLabel: (name) => `Choose ${name} as partner for Open Doubles` },
    chosen: null,
    intent: null,
    openOnLoad: false,
    query: '',
    search: null,
    notFoundHint: null,
    ...overrides,
  };
}

describe('parsePickIntent', () => {
  // Defect caught: a crafted or garbled pick value is acted on as some other intent.
  it('reads the five intents and nothing else', () => {
    expect(parsePickIntent('open:partner-d1')).toEqual({ kind: 'open', key: 'partner-d1' });
    expect(parsePickIntent('remove:partner-d1')).toEqual({ kind: 'remove', key: 'partner-d1' });
    expect(parsePickIntent('search:organizer')).toEqual({ kind: 'search', key: 'organizer' });
    expect(parsePickIntent('change:organizer')).toEqual({ kind: 'change', key: 'organizer' });
    expect(parsePickIntent('choose:partner-d1:m-max')).toEqual({ kind: 'choose', key: 'partner-d1', memberId: 'm-max' });
    for (const bad of [undefined, '', 'open', 'open:', 'choose:partner-d1', 'choose:partner-d1:', 'search:k:extra', 'delete:k']) {
      expect(parsePickIntent(bad), String(bad)).toBeNull();
    }
  });

  // Defect caught: a historical record whose id contains colons cannot be
  // chosen, or is chosen under a truncated id that names some other record.
  it('reads a chosen id that itself contains colons whole', () => {
    expect(parsePickIntent('choose:person:master_person::0045d1d0669e289d'))
      .toEqual({ kind: 'choose', key: 'person', memberId: 'master_person::0045d1d0669e289d' });
  });
});

const RECORD = { id: 'master_person::00aa', displayName: 'Ada Old', location: 'Canada, 1985-1999' };

function recordInput(overrides: Partial<RecordPickerInput> = {}): RecordPickerInput {
  const { chosen: _c, search: _s, ...base } = input();
  return {
    ...base,
    fieldName: 'personId', fieldKey: 'person', label: 'Historical record',
    chosen: null, search: null, notFoundNoun: 'record',
    ...overrides,
  };
}

describe('buildRecordPicker', () => {
  // Defect caught: a record picker posts no id, or the member id slot, so the
  // chosen record never reaches the form's save.
  it('posts the chosen record under the field and chooses each row by its own id', () => {
    const chosen = buildRecordPicker(recordInput({ chosen: RECORD }));
    expect(chosen).toMatchObject({ chosenId: 'master_person::00aa', holdsChoice: true });
    const shown = buildRecordPicker(recordInput({
      intent: { kind: 'search', key: 'person' }, query: 'ada',
      search: { results: [{ ...RECORD, badge: null }], hasMore: false, tooShort: false, rateLimited: false, retryAfterSeconds: null },
    }));
    expect(shown.results[0]).toMatchObject({ buttonName: 'pick', buttonValue: 'choose:person:master_person::00aa' });
    expect(buildRecordPicker(recordInput()).chosenId).toBeNull();
  });

  // Defect caught: a record search that found nothing tells the admin no member
  // was found, which reads as the wrong search having run.
  it('names what was not found by the picker noun, and a member picker by "member"', () => {
    const empty = { results: [], hasMore: false, tooShort: false, rateLimited: false, retryAfterSeconds: null };
    const record = buildRecordPicker(recordInput({ intent: { kind: 'search', key: 'person' }, search: empty }));
    expect(record).toMatchObject({ notFound: true, notFoundNoun: 'record' });
    const member = buildMemberPicker(input({ intent: { kind: 'search', key: 'partner-d1' }, search: empty }));
    expect(member).toMatchObject({ notFound: true, notFoundNoun: 'member' });
  });

  // Defect caught: a member picker loses the chosen member's id from its
  // hidden field once record pickers share the shaping.
  it('keeps a member picker posting the chosen member id', () => {
    expect(buildMemberPicker(input({ chosen: MAX })).chosenId).toBe('m-max');
  });
});

describe('playerSearchOutcome', () => {
  // Defect caught: a historical player is dropped from the credit search, is
  // credited under a member id instead of the hashtag, or is shown unmarked
  // beside members.
  it('keeps members and historical records, keyed by player tag, badging only the historical', () => {
    const outcome = playerSearchOutcome({
      results: [
        { playerTag: '#player_max_ito', isHistorical: false, displayName: 'Max Ito', location: 'Boulder' },
        { playerTag: '#player_ada_old', isHistorical: true, displayName: 'Ada Old', location: null },
      ],
      hasMore: true, tooShort: false, rateLimited: false, retryAfterSeconds: null,
    });
    expect(outcome).toEqual({
      results: [
        { id: '#player_max_ito', displayName: 'Max Ito', location: 'Boulder', badge: null },
        { id: '#player_ada_old', displayName: 'Ada Old', location: null, badge: 'Historical' },
      ],
      hasMore: true, tooShort: false, rateLimited: false, retryAfterSeconds: null,
    });
  });
});

describe('buildMemberPicker', () => {
  // Defect caught: a picker opens on a page that asked for none, or a second
  // picker opens beside the one the member asked for.
  it('opens only the picker an intent names', () => {
    expect(buildMemberPicker(input()).isOpen).toBe(false);
    const mine = buildMemberPicker(input({ intent: { kind: 'open', key: 'partner-d1' } }));
    expect(mine).toMatchObject({ isOpen: true, isActive: true, autofocus: true, anchorId: 'reg-form-pick' });
    const other = buildMemberPicker(input({ intent: { kind: 'open', key: 'partner-d2' } }));
    expect(other).toMatchObject({ isOpen: false, isActive: false });
  });

  // Defect caught: a single-pick form hides its picker on first load, or keeps
  // it open once a member is chosen.
  it('opens a single-pick form on load until a member is chosen', () => {
    expect(buildMemberPicker(input({ openOnLoad: true })).isOpen).toBe(true);
    expect(buildMemberPicker(input({ openOnLoad: true, chosen: MAX })).isOpen).toBe(false);
  });

  // Defect caught: Change drops the current choice before a new one is made,
  // or the state line loses who was chosen.
  it('keeps the choice while changing it, and names it in the state line', () => {
    const changing = buildMemberPicker(input({ chosen: MAX, intent: { kind: 'change', key: 'partner-d1' } }));
    expect(changing).toMatchObject({ isOpen: true, chosen: MAX, holdsChoice: true });
    expect(changing.stateText).toBe('Partner: Max Ito, Boulder, CO, United States');
    expect(buildMemberPicker(input()).stateText).toBe('Partner: none chosen');
  });

  // Defect caught: results from another picker's search, or from no search,
  // are shown; or a row button posts somewhere other than the intent action.
  it('shows results only for its own search, each row choosing that member', () => {
    const search = { results: [MAX], hasMore: false, tooShort: false, rateLimited: false, retryAfterSeconds: null };
    expect(buildMemberPicker(input({ intent: { kind: 'open', key: 'partner-d1' }, search })).results).toEqual([]);
    const shown = buildMemberPicker(input({ intent: { kind: 'search', key: 'partner-d1' }, search, query: 'max' }));
    expect(shown.results).toEqual([{
      ...MAX, buttonName: 'pick', buttonValue: 'choose:partner-d1:m-max',
      ariaLabel: 'Choose Max Ito as partner for Open Doubles',
    }]);
    expect(shown).toMatchObject({ rowFormAction: '/events/e/register#reg-form-pick', notFound: false, autofocus: false });
    const empty = buildMemberPicker(input({ intent: { kind: 'search', key: 'partner-d1' }, search: { ...search, results: [] } }));
    expect(empty.notFound).toBe(true);
    const short = buildMemberPicker(input({ intent: { kind: 'search', key: 'partner-d1' }, search: { ...search, results: [], tooShort: true } }));
    expect(short).toMatchObject({ tooShort: true, notFound: false });
  });

  // Defect caught: a row button that should complete the form posts a picker
  // intent instead, so the organizer is never added, or posts a hidden field
  // that duplicates the member id.
  it('lets a completing row button post the member id under the field itself', () => {
    const view = buildMemberPicker(input({
      fieldName: 'member_id', fieldKey: 'organizer', openOnLoad: true,
      rowAction: { label: 'Add Organizer', completes: true, ariaLabel: (n) => `Add Organizer: ${n}` },
      intent: { kind: 'search', key: 'organizer' },
      search: { results: [MAX], hasMore: true, tooShort: false, rateLimited: false, retryAfterSeconds: null },
    }));
    expect(view.results[0]).toMatchObject({ buttonName: 'member_id', buttonValue: 'm-max' });
    expect(view).toMatchObject({ rowFormAction: null, holdsChoice: false, showState: false, hasMore: true });
  });

  // Defect caught: an organizer editing an entry cannot clear a doubles
  // partner, or a Remove control shows on a picker with nobody chosen (or on a
  // form that requires a choice), or pressing Remove opens the search instead.
  it('offers Remove only for a chosen member on a picker that allows none', () => {
    const removable = buildMemberPicker(input({ chosen: MAX, canRemove: true }));
    expect(removable).toMatchObject({ canRemove: true, removeValue: 'remove:partner-d1' });
    expect(buildMemberPicker(input({ chosen: null, canRemove: true })).canRemove).toBe(false);
    expect(buildMemberPicker(input({ chosen: MAX })).canRemove).toBe(false);
    expect(buildMemberPicker(input({ chosen: null, canRemove: true, intent: { kind: 'remove', key: 'partner-d1' } })).isOpen).toBe(false);
  });
});
