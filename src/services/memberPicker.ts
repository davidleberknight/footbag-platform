/**
 * The member picker: one field of a form that takes a member (a doubles
 * partner, an event organizer), chosen by name from a member search embedded
 * in that form. Pure shaping; the page's service resolves the chosen member
 * and runs the search, and this module turns that into what the
 * `member-picker` partial renders.
 *
 * The same controls choose a record that is not a member where a form takes
 * one (an old footbag.org account, a historical record, a player to credit):
 * `buildRecordPicker` shapes those, each row carrying the record's own id and,
 * where the search mixes kinds, a badge naming the row's kind.
 *
 * Every control of a picker is a submit button of its host form, named `pick`,
 * whose value says what was asked (`open:<key>`, `search:<key>`,
 * `choose:<key>:<id>`, `change:<key>`, and `remove:<key>` on a picker
 * whose choice may be cleared), with the search text in
 * `pick_q`. The form's own handler sees `pick`, writes nothing, and draws the
 * page again holding everything typed, so the picker works without JavaScript
 * and nothing is lost between steps. Only a search spends a search.
 */

/** What a picker button asked for, read from the `pick` field. */
export type PickIntent =
  | { kind: 'open' | 'search' | 'change' | 'remove'; key: string }
  | { kind: 'choose'; key: string; memberId: string };

/** The field `pick` arrives in, and the search text's field. */
export const PICK_FIELD = 'pick';
export const PICK_QUERY_FIELD = 'pick_q';

/**
 * The `pick` value read as an intent, or null for any value a picker never
 * sends. A chosen id is everything after the key, because a historical
 * record's id can itself contain colons.
 */
export function parsePickIntent(raw: string | undefined): PickIntent | null {
  if (!raw) return null;
  const [kind, key, ...rest] = raw.split(':');
  if (!key) return null;
  if (kind === 'choose') {
    const memberId = rest.join(':');
    return memberId ? { kind, key, memberId } : null;
  }
  if ((kind === 'open' || kind === 'search' || kind === 'change' || kind === 'remove') && rest.length === 0) return { kind, key };
  return null;
}

/** A member as a picker shows them: the name and where they are. */
export interface PickerMember {
  memberId: string;
  displayName: string;
  location: string | null;
}

/**
 * A record as a picker shows it: its own id, the name, a line placing it, and
 * a badge naming its kind where one search returns more than one kind.
 */
export interface PickerRecord {
  id: string;
  displayName: string;
  location: string | null;
  badge?: string | null;
}

/** A search's outcome, as the page's service ran it for this picker. */
export interface PickerSearchOutcome {
  results: PickerMember[];
  hasMore: boolean;
  tooShort: boolean;
  rateLimited: boolean;
  /** Seconds until the refused search can run again; null unless `rateLimited`. */
  retryAfterSeconds: number | null;
}

/** A record search's outcome, as the page's service ran it for this picker. */
export interface RecordSearchOutcome {
  results: PickerRecord[];
  hasMore: boolean;
  tooShort: boolean;
  rateLimited: boolean;
  /** Seconds until the refused search can run again; null unless `rateLimited`. */
  retryAfterSeconds: number | null;
}

export interface MemberPickerRow {
  displayName: string;
  location: string | null;
  /** A kind badge ("Historical") where the search mixes kinds. */
  badge?: string | null;
  /** The row button's name and value: the picker's choose intent, or the row's id under the field when choosing completes the form. */
  buttonName: string;
  buttonValue: string;
  ariaLabel: string;
}

export interface MemberPickerView {
  formId: string;
  /** The field the chosen member's id is posted under. */
  fieldName: string;
  /** Unique on the page; every intent names it. */
  fieldKey: string;
  label: string;
  chosen: { displayName: string; location: string | null } | null;
  /** The id the hidden field posts for the choice. */
  chosenId: string | null;
  /** "Partner: none chosen", or the chosen member's name and location. */
  stateText: string;
  /** A picker whose row button completes the form has no chosen state to show. */
  showState: boolean;
  /** The posted hidden field holding the choice; absent when a row button completes the form. */
  holdsChoice: boolean;
  isOpen: boolean;
  /** This field carries the page anchor the intents land on. */
  isActive: boolean;
  anchorId: string;
  autofocus: boolean;
  intentAction: string;
  openLabel: string;
  openValue: string;
  changeValue: string;
  /** A Remove control beside the chosen member, clearing the choice; shown only where the form allows none. */
  canRemove: boolean;
  removeValue: string;
  searchValue: string;
  searchLabel: string;
  searchInputId: string;
  query: string;
  results: MemberPickerRow[];
  hasMore: boolean;
  tooShort: boolean;
  rateLimited: boolean;
  /** Seconds until the refused search can run again; null unless `rateLimited`. */
  retryAfterSeconds: number | null;
  notFound: boolean;
  /** What the no-match line says was not found: "member" unless the picker chooses something else. */
  notFoundNoun: string;
  notFoundHint: string | null;
  rowAction: { label: string; completes: boolean };
  /** Where a row button posts: the intent action, or null to submit the form itself. */
  rowFormAction: string | null;
}

export interface MemberPickerInput {
  formId: string;
  /** The form's own action; intents post there, landing on the picker. */
  formAction: string;
  fieldName: string;
  fieldKey: string;
  label: string;
  searchLabel: string;
  openLabel: string;
  rowAction: { label: string; completes: boolean; ariaLabel: (name: string) => string };
  chosen: PickerMember | null;
  /** The intent of this submit, whichever picker of the page it named. */
  intent: PickIntent | null;
  /** A single-pick form whose first field is the picker opens it while nothing is chosen. */
  openOnLoad: boolean;
  query: string;
  /** The search this picker ran, when the intent was its search. */
  search: PickerSearchOutcome | null;
  notFoundHint: string | null;
  /**
   * The form may leave this field with nobody chosen, so a chosen member can
   * be removed. The page's service resolves a `remove` intent to no choice.
   */
  canRemove?: boolean;
}

/** A picker choosing a record that is not a member: rows carry the record's own id. */
export interface RecordPickerInput extends Omit<MemberPickerInput, 'chosen' | 'search'> {
  chosen: PickerRecord | null;
  search: RecordSearchOutcome | null;
  /** What the no-match line says was not found ("account", "record"). */
  notFoundNoun: string;
}

export function buildMemberPicker(input: MemberPickerInput): MemberPickerView {
  return buildPicker(input, input.chosen, input.chosen?.memberId ?? null, input.search, (m) => m.memberId, 'member');
}

export function buildRecordPicker(input: RecordPickerInput): MemberPickerView {
  return buildPicker(input, input.chosen, input.chosen?.id ?? null, input.search, (r) => r.id, input.notFoundNoun);
}

function buildPicker<T extends { displayName: string; location: string | null }>(
  input: Omit<MemberPickerInput, 'chosen' | 'search'>,
  chosen: T | null,
  chosenId: string | null,
  search0: { results: T[]; hasMore: boolean; tooShort: boolean; rateLimited: boolean; retryAfterSeconds: number | null } | null,
  idOf: (row: T) => string,
  notFoundNoun: string,
): MemberPickerView {
  const anchorId = `${input.formId}-pick`;
  const intentAction = `${input.formAction}#${anchorId}`;
  const mine = input.intent?.key === input.fieldKey ? input.intent : null;
  const isOpen = mine
    ? mine.kind !== 'choose' && mine.kind !== 'remove'
    : input.openOnLoad && chosen === null;
  const search = mine?.kind === 'search' ? search0 : null;
  const results = search?.results ?? [];
  const completes = input.rowAction.completes;
  return {
    formId: input.formId,
    fieldName: input.fieldName,
    fieldKey: input.fieldKey,
    label: input.label,
    chosen,
    chosenId,
    stateText: chosen
      ? `${input.label}: ${chosen.displayName}${chosen.location ? `, ${chosen.location}` : ''}`
      : `${input.label}: none chosen`,
    showState: !completes,
    holdsChoice: !completes,
    isOpen,
    isActive: mine !== null || (isOpen && input.openOnLoad),
    anchorId,
    autofocus: mine?.kind === 'open' || mine?.kind === 'change',
    intentAction,
    openLabel: input.openLabel,
    openValue: `open:${input.fieldKey}`,
    changeValue: `change:${input.fieldKey}`,
    canRemove: (input.canRemove ?? false) && !completes && chosen !== null,
    removeValue: `remove:${input.fieldKey}`,
    searchValue: `search:${input.fieldKey}`,
    searchLabel: input.searchLabel,
    searchInputId: `${anchorId}-q`,
    query: isOpen ? input.query : '',
    results: results.map((m) => ({
      ...m,
      buttonName: completes ? input.fieldName : PICK_FIELD,
      buttonValue: completes ? idOf(m) : `choose:${input.fieldKey}:${idOf(m)}`,
      ariaLabel: input.rowAction.ariaLabel(m.displayName),
    })),
    hasMore: search?.hasMore ?? false,
    tooShort: search?.tooShort ?? false,
    rateLimited: search?.rateLimited ?? false,
    retryAfterSeconds: search?.rateLimited ? search.retryAfterSeconds : null,
    notFound: search !== null && !search.tooShort && !search.rateLimited && results.length === 0,
    notFoundNoun,
    notFoundHint: input.notFoundHint,
    rowAction: { label: input.rowAction.label, completes },
    rowFormAction: completes ? null : intentAction,
  };
}

/** The search's own result rows, as a picker shows them. */
export function pickerSearchOutcome(result: {
  results: ReadonlyArray<{ memberId: string | null; displayName: string; location: string | null }>;
  hasMore: boolean; tooShort: boolean; rateLimited: boolean; retryAfterSeconds: number | null;
}): PickerSearchOutcome {
  return {
    results: result.results
      .filter((r): r is typeof r & { memberId: string } => r.memberId !== null)
      .map((r) => ({ memberId: r.memberId, displayName: r.displayName, location: r.location })),
    hasMore: result.hasMore,
    tooShort: result.tooShort,
    rateLimited: result.rateLimited,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/**
 * The member search's rows as players to credit: members and historical
 * records alike, each keyed by the player hashtag a credit adds, the
 * historical ones badged so a reader can tell a record from a member.
 */
export function playerSearchOutcome(result: {
  results: ReadonlyArray<{ playerTag: string; isHistorical: boolean; displayName: string; location: string | null }>;
  hasMore: boolean; tooShort: boolean; rateLimited: boolean; retryAfterSeconds: number | null;
}): RecordSearchOutcome {
  return {
    results: result.results.map((r) => ({
      id: r.playerTag,
      displayName: r.displayName,
      location: r.location,
      badge: r.isHistorical ? 'Historical' : null,
    })),
    hasMore: result.hasMore,
    tooShort: result.tooShort,
    rateLimited: result.rateLimited,
    retryAfterSeconds: result.retryAfterSeconds,
  };
}

/** How many rows a picker shows. */
export const PICKER_LIMIT = 5;
