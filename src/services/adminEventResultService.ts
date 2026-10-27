/**
 * AdminEventResultService -- the administrator's correction of an event's
 * published results.
 *
 * Owns the event finder, the read-only results view, and the two corrections an
 * administrator makes to official results:
 *   - a result entry: its placement, its score text, the division it is filed
 *     under (another division of the same event and team format, which is how
 *     swapped divisions are put right), and each competitor's displayed name.
 *   - a division: its sport family and its aggregate-standing mark. A division
 *     with no sport family must be an aggregate standing, as the schema requires.
 *
 * The corrections:
 *   - reach only an event whose results are public (its status is one the public
 *     event page shows). Migrated historical events qualify. A correction never
 *     publishes results that are not already public.
 *   - take a reason, preview before they write, and write nothing when nothing
 *     changed. A repeat of this admin's own standing correction reports the
 *     first submit's success.
 *   - write the rows and one audit row (`event.result_corrected` or
 *     `event.discipline_corrected`, carrying every changed value before and
 *     after) in one transaction.
 *   - edit a competitor's displayed name on the result row only. The link to a
 *     member or a historical record is untouched, and the historical record's
 *     own name is corrected on its own surface.
 *   - leave event fields (title, dates, sanction status) alone; those are the
 *     event-correction surface's.
 *
 * Persistence: reads `events`, `tags`, `event_disciplines`,
 * `event_result_entries` and `event_result_entry_participants`; writes the last
 * three; appends to `audit_entries`. No outbox, no work-queue insert.
 *
 * Audience: admin only, behind the route gate.
 */
import {
  eventResultCorrection,
  publicEvents,
  transaction,
  type EventResultDisciplineRow,
  type EventResultEntryRow,
  type EventResultEventRow,
  type EventResultFinderRow,
  type EventResultParticipantRow,
  type PublicEventResultRow,
} from '../db/db';
import { PUBLIC_EVENT_DETAIL_VISIBLE_STATUSES } from './eventVisibility';
import { NotFoundError, ValidationError } from './serviceErrors';
import { appendAuditEntry, findStandingOwnAct } from './auditService';
import { cleanUserText } from '../lib/textSanitizer';
import type { PageViewModel } from '../types/page';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import type { ActionEnding } from '../lib/actionOutcome';

const LOOKUP_LIMIT = 25;
const MIN_LOOKUP_QUERY = 2;
const MAX_REASON = 500;
const MAX_NAME = 200;
const MAX_SCORE = 200;
const MAX_PLACEMENT = 1000;
const ENTRY_CORRECTED = 'event.result_corrected';
const DISCIPLINE_CORRECTED = 'event.discipline_corrected';

/**
 * The sport families a division can be filed under: the five a new division
 * takes, plus sideline, which historical rows carry for their X-Square and
 * consecutives results.
 */
const SPORT_FAMILIES: Array<{ value: string; label: string }> = [
  { value: 'net',          label: 'Net' },
  { value: 'freestyle',    label: 'Freestyle' },
  { value: 'golf',         label: 'Golf' },
  { value: 'consecutives', label: 'Consecutives' },
  { value: 'x_square',     label: 'X-Square' },
  { value: 'sideline',     label: 'Sideline' },
];
const NO_FAMILY_LABEL = 'None (a standing across several sports)';

export interface SelectOptionView { value: string; label: string; selected: boolean }

export interface ChangeView { label: string; before: string; after: string }

interface FinderResultView {
  title: string;
  facts: string[];
  resultsHref: string;
}

export interface AdminEventResultsFinderContent {
  query: string;
  hasQuery: boolean;
  results: FinderResultView[];
  hasResults: boolean;
  resultSummary: string;
  errorMessage?: string;
}

interface EntryView {
  placement: number;
  names: string;
  scoreText: string | null;
  correctHref: string;
}

interface SectionView {
  name: string;
  facts: string[];
  correctHref: string | null;
  entries: EntryView[];
}

export interface AdminEventResultsContent {
  eventTitle: string;
  facts: string[];
  publicHref: string;
  sections: SectionView[];
  notice: OutcomeNoticeView | null;
  finderHref: string;
}

export interface EntryCorrectionInput {
  placement: string;
  scoreText: string;
  disciplineId: string;
  /** Each competitor's displayed name, keyed by the participant row id. */
  names: Record<string, string>;
}

export interface AdminEntryCorrectionContent {
  eventTitle: string;
  divisionName: string;
  form: {
    placement: string;
    scoreText: string;
    names: Array<{ fieldName: string; inputId: string; label: string; value: string }>;
  };
  divisionOptions: SelectOptionView[];
  canMoveDivision: boolean;
  previewAction: string;
  cancelHref: string;
  errorMessage?: string;
}

export interface DisciplineCorrectionInput {
  sportFamily: string;
  aggregateStanding: string;
}

export interface AdminDisciplineCorrectionContent {
  eventTitle: string;
  divisionName: string;
  familyOptions: SelectOptionView[];
  isAggregateStanding: boolean;
  previewAction: string;
  cancelHref: string;
  errorMessage?: string;
}

export interface AdminEventResultConfirmContent {
  eventTitle: string;
  subject: string;
  changes: ChangeView[];
  hasChanges: boolean;
  noChangeMessage: string | null;
  reason: string;
  summary: string;
  hiddenFields: Array<{ name: string; value: string }>;
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

type Outcome = { ending: Exclude<ActionEnding, 'refused'>; text: string };

function resultsHref(eventId: string): string {
  return `/admin/events/${eventId}/results`;
}

function entryHref(eventId: string, entryId: string): string {
  return `${resultsHref(eventId)}/entries/${entryId}`;
}

function disciplineHref(eventId: string, disciplineId: string): string {
  return `${resultsHref(eventId)}/disciplines/${disciplineId}`;
}

function publicEventHref(tag: string): string {
  return `/events/${tag.startsWith('#') ? tag.slice(1) : tag}`;
}

function familyLabel(category: string | null): string {
  if (category === null) return NO_FAMILY_LABEL;
  return SPORT_FAMILIES.find((f) => f.value === category)?.label ?? category;
}

/**
 * The event, refused unless its results are public: a correction must not
 * reach results the publishing rules have not let out.
 */
function readCorrectableEvent(eventId: string): EventResultEventRow {
  const row = eventResultCorrection.findEvent.get(eventId) as EventResultEventRow | undefined;
  const visible = (PUBLIC_EVENT_DETAIL_VISIBLE_STATUSES as readonly string[]);
  if (!row || !visible.includes(row.status)) {
    throw new NotFoundError('No event with published results has that id.');
  }
  return row;
}

function readEntry(eventId: string, entryId: string): {
  event: EventResultEventRow; entry: EventResultEntryRow; participants: EventResultParticipantRow[];
} {
  const event = readCorrectableEvent(eventId);
  const entry = eventResultCorrection.findEntry.get(entryId, eventId) as EventResultEntryRow | undefined;
  if (!entry) throw new NotFoundError('That event has no result with that id.');
  const participants = eventResultCorrection.listEntryParticipants.all(entryId) as EventResultParticipantRow[];
  return { event, entry, participants };
}

function readDiscipline(eventId: string, disciplineId: string): {
  event: EventResultEventRow; discipline: EventResultDisciplineRow;
} {
  const event = readCorrectableEvent(eventId);
  const discipline = eventResultCorrection.findDiscipline.get(disciplineId, eventId) as
    | EventResultDisciplineRow | undefined;
  if (!discipline) throw new NotFoundError('That event has no division with that id.');
  return { event, discipline };
}

/** The divisions an entry may be filed under: its own event's, in its own team format. */
function divisionsFor(eventId: string, entry: EventResultEntryRow): EventResultDisciplineRow[] {
  if (entry.discipline_id === null) return [];
  const all = eventResultCorrection.listEventDisciplines.all(eventId) as EventResultDisciplineRow[];
  return all.filter((d) => d.team_type === entry.team_type);
}

function requireReason(raw: string): string {
  // Cleaned first, so markup alone is no reason and the cap counts what is stored.
  const reason = cleanUserText(raw, 'single_line', 'reason');
  if (!reason) throw new ValidationError('Enter the reason for this correction.');
  if (reason.length > MAX_REASON) {
    throw new ValidationError(`The reason must be ${MAX_REASON} characters or fewer.`);
  }
  return reason;
}

interface EntryFacts {
  placement: number;
  scoreText: string | null;
  disciplineId: string | null;
  names: Map<string, string>;
}

function validateEntry(
  eventId: string,
  entry: EventResultEntryRow,
  participants: EventResultParticipantRow[],
  input: EntryCorrectionInput,
): EntryFacts {
  const rawPlacement = input.placement.trim();
  if (!/^\d+$/.test(rawPlacement)) throw new ValidationError('Enter the placement as a whole number.');
  const placement = Number(rawPlacement);
  if (placement < 1 || placement > MAX_PLACEMENT) {
    throw new ValidationError(`The placement must be between 1 and ${MAX_PLACEMENT}.`);
  }

  const score = cleanUserText(input.scoreText, 'single_line', 'score');
  if (score.length > MAX_SCORE) {
    throw new ValidationError(`The score must be ${MAX_SCORE} characters or fewer.`);
  }

  let disciplineId = entry.discipline_id;
  const wanted = input.disciplineId.trim();
  if (entry.discipline_id !== null && wanted !== '' && wanted !== entry.discipline_id) {
    if (!divisionsFor(eventId, entry).some((d) => d.discipline_id === wanted)) {
      throw new ValidationError('Choose a division of this event with the same team format.');
    }
    disciplineId = wanted;
  }

  const names = new Map<string, string>();
  for (const p of participants) {
    const name = cleanUserText(input.names[p.participant_row_id] ?? '', 'single_line', 'name');
    if (!name) throw new ValidationError('Enter every competitor\'s name.');
    if (name.length > MAX_NAME) {
      throw new ValidationError(`A name must be ${MAX_NAME} characters or fewer.`);
    }
    names.set(p.participant_row_id, name);
  }

  return { placement, scoreText: score === '' ? null : score, disciplineId, names };
}

interface EntryDiff {
  fields: string[];
  before: Record<string, string | number | null>;
  after: Record<string, string | number | null>;
  changes: ChangeView[];
}

function shown(value: string | number | null): string {
  return value === null || value === '' ? '(none)' : String(value);
}

function disciplineName(eventId: string, id: string | null): string | null {
  if (id === null) return null;
  const d = eventResultCorrection.findDiscipline.get(id, eventId) as EventResultDisciplineRow | undefined;
  return d?.name ?? id;
}

function diffEntry(
  eventId: string,
  entry: EventResultEntryRow,
  participants: EventResultParticipantRow[],
  facts: EntryFacts,
): EntryDiff {
  const diff: EntryDiff = { fields: [], before: {}, after: {}, changes: [] };
  const add = (field: string, label: string, before: string | number | null, after: string | number | null,
    shownBefore = shown(before), shownAfter = shown(after)) => {
    diff.fields.push(field);
    diff.before[field] = before;
    diff.after[field] = after;
    diff.changes.push({ label, before: shownBefore, after: shownAfter });
  };
  if (facts.placement !== entry.placement) add('placement', 'Placement', entry.placement, facts.placement);
  if (facts.scoreText !== entry.score_text) add('score_text', 'Score', entry.score_text, facts.scoreText);
  if (facts.disciplineId !== entry.discipline_id) {
    add('discipline_id', 'Division', entry.discipline_id, facts.disciplineId,
      shown(entry.discipline_name), shown(disciplineName(eventId, facts.disciplineId)));
  }
  for (const p of participants) {
    const after = facts.names.get(p.participant_row_id)!;
    if (after !== p.display_name) {
      add(`display_name:${p.participant_row_id}`, `Competitor ${p.participant_order} name`,
        p.display_name, after);
    }
  }
  return diff;
}

function entryHiddenFields(input: EntryCorrectionInput, reason: string): Array<{ name: string; value: string }> {
  return [
    { name: 'placement',     value: input.placement },
    { name: 'score_text',    value: input.scoreText },
    { name: 'discipline_id', value: input.disciplineId },
    ...Object.entries(input.names).map(([id, value]) => ({ name: `name_${id}`, value })),
    { name: 'reason',        value: reason },
  ];
}

interface DisciplineFacts { category: string | null; aggregate: 0 | 1 }

function validateDiscipline(input: DisciplineCorrectionInput): DisciplineFacts {
  const family = input.sportFamily.trim();
  if (family !== '' && !SPORT_FAMILIES.some((f) => f.value === family)) {
    throw new ValidationError('Choose a sport family from the list.');
  }
  const aggregate: 0 | 1 = input.aggregateStanding === '1' ? 1 : 0;
  const category = family === '' ? null : family;
  if (category === null && aggregate === 0) {
    throw new ValidationError(
      'Only a standing across several sports may have no sport family. Choose a sport family, or mark it as an aggregate standing.',
    );
  }
  return { category, aggregate };
}

function aggregateLabel(value: number): string {
  return value === 1 ? 'Aggregate standing' : 'Single contest';
}

function shapeSections(eventId: string, rows: PublicEventResultRow[]): SectionView[] {
  const sections: SectionView[] = [];
  const bySection = new Map<string, SectionView>();
  const byEntry = new Map<string, { view: EntryView; names: string[] }>();
  for (const row of rows) {
    const key = row.discipline_id ?? '';
    let section = bySection.get(key);
    if (!section) {
      section = {
        name: row.discipline_name ?? 'General Ranking',
        facts: row.discipline_id === null
          ? []
          : [familyLabel(row.discipline_category), aggregateLabel(row.discipline_is_aggregate_standing ?? 0)],
        correctHref: row.discipline_id === null ? null : disciplineHref(eventId, row.discipline_id),
        entries: [],
      };
      bySection.set(key, section);
      sections.push(section);
    }
    let entry = byEntry.get(row.result_entry_id);
    if (!entry) {
      entry = {
        view: {
          placement: row.placement,
          names: '',
          scoreText: row.score_text,
          correctHref: entryHref(eventId, row.result_entry_id),
        },
        names: [],
      };
      byEntry.set(row.result_entry_id, entry);
      section.entries.push(entry.view);
    }
    entry.names.push(row.participant_display_name);
    entry.view.names = entry.names.join(' and ');
  }
  return sections;
}

function eventFacts(event: EventResultEventRow): string[] {
  const dates = event.start_date === event.end_date ? event.start_date : `${event.start_date} to ${event.end_date}`;
  return [dates, [event.city, event.region, event.country].filter(Boolean).join(', ')];
}

const CONFIRM_INSTRUCTIONS_HEADS_UP = 'Nothing is written until you confirm. The correction shows on the public event page straight away, and it is recorded in the audit log with your reason and the values before and after.';

export const adminEventResultService = {
  /** The finder, by part of an event's title or its start year. */
  getResultsFinderPage(rawQuery: string, opts: { errorMessage?: string } = {}): PageViewModel<AdminEventResultsFinderContent> {
    const query = rawQuery.trim();
    const title = 'Event Results';
    let results: FinderResultView[] = [];
    let hasMore = false;
    let errorMessage = opts.errorMessage;

    if (query !== '' && query.length < MIN_LOOKUP_QUERY) {
      errorMessage = `Enter at least ${MIN_LOOKUP_QUERY} characters, or a year.`;
    } else if (query !== '') {
      const escaped = query.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
      const year = /^\d{4}$/.test(query) ? query : null;
      const rows = eventResultCorrection.searchEvents.all(escaped, year, LOOKUP_LIMIT + 1) as EventResultFinderRow[];
      hasMore = rows.length > LOOKUP_LIMIT;
      results = rows.slice(0, LOOKUP_LIMIT).map((r) => ({
        title: r.title,
        facts: [r.start_date, `${r.city}, ${r.country}`, r.entry_count === 1 ? '1 result' : `${r.entry_count} results`],
        resultsHref: resultsHref(r.event_id),
      }));
    }

    const resultSummary = query === ''
      ? 'Search for an event by part of its name, or by the year it started.'
      : results.length === 0
        ? 'No event with published results matches that search.'
        : hasMore
          ? `More than ${LOOKUP_LIMIT} events match. Narrow the search to see the rest.`
          : results.length === 1 ? 'One event matches.' : `${results.length} events match.`;

    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_event_results', title,
        instructions: {
          what: 'Finds an event with published results, so you can correct them.',
          why: 'Organizers and the imported archive sometimes get results wrong, and this is where an administrator fixes them.',
          how: 'Search by part of the event name or by its year, then open the event.',
          headsUp: ['Only events whose results are public are listed. Event details such as the title and dates are not corrected here.'],
        },
      },
      content: { query, hasQuery: query !== '', results, hasResults: results.length > 0, resultSummary, errorMessage },
    };
  },

  /** One event's published results, read-only, with a correction link per result and division. */
  getEventResultsPage(eventId: string, opts: { notice?: OutcomeNoticeView | null } = {}): PageViewModel<AdminEventResultsContent> {
    const event = readCorrectableEvent(eventId);
    const rows = publicEvents.listPublicResultRowsByEventId.all(eventId) as PublicEventResultRow[];
    const title = 'Correct Event Results';
    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_event_results_event', title,
        instructions: {
          what: 'Shows this event\'s published results as the public sees them.',
          why: 'To find the result or division that needs correcting.',
          how: 'Choose Correct beside a result to fix its placement, score, division or a competitor\'s name, or beside a division to fix its sport family or aggregate-standing mark.',
          headsUp: [
            'A competitor\'s name is corrected on this result only. To correct a person\'s name everywhere, use Historical Records or their member record.',
            'A division\'s sport family and aggregate-standing mark decide whether its results count toward players\' career statistics.',
          ],
        },
      },
      content: {
        eventTitle: event.title,
        facts: eventFacts(event),
        publicHref: publicEventHref(event.tag_normalized),
        sections: shapeSections(eventId, rows),
        notice: opts.notice ?? null,
        finderHref: '/admin/events/results',
      },
    };
  },

  /** The entry correction form, holding the current values or what was submitted with an error. */
  getEntryCorrectionPage(
    eventId: string,
    entryId: string,
    opts: { input?: EntryCorrectionInput; errorMessage?: string } = {},
  ): PageViewModel<AdminEntryCorrectionContent> {
    const { event, entry, participants } = readEntry(eventId, entryId);
    const input = opts.input;
    const currentDivision = input?.disciplineId || entry.discipline_id || '';
    const divisions = divisionsFor(eventId, entry);
    const title = 'Correct a Result';
    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_event_result_entry', title,
        instructions: {
          what: 'Corrects one result: its placement, its score, the division it is filed under, and each competitor\'s name as shown.',
          why: 'To put right a wrong placement, a misspelled name, or results filed under the wrong division.',
          how: 'Change what is wrong, give a reason, and review the correction before it is written.',
          headsUp: [
            'Tied competitors share a placement, so two results may hold the same place.',
            'A result moves only to another division of this event with the same team format.',
          ],
        },
      },
      content: {
        eventTitle: event.title,
        divisionName: entry.discipline_name ?? 'General Ranking',
        form: {
          placement: input?.placement ?? String(entry.placement),
          scoreText: input?.scoreText ?? entry.score_text ?? '',
          names: participants.map((p) => ({
            fieldName: `name_${p.participant_row_id}`,
            inputId: `er_name_${p.participant_order}`,
            label: participants.length === 1 ? 'Competitor name' : `Competitor ${p.participant_order} name`,
            value: input?.names[p.participant_row_id] ?? p.display_name,
          })),
        },
        divisionOptions: divisions.map((d) => ({
          value: d.discipline_id, label: d.name, selected: d.discipline_id === currentDivision,
        })),
        canMoveDivision: divisions.length > 1,
        previewAction: entryHref(eventId, entryId),
        cancelHref: resultsHref(eventId),
        ...(opts.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      },
    };
  },

  /** Preview an entry correction. Nothing is written. */
  previewEntryCorrection(
    eventId: string,
    entryId: string,
    input: EntryCorrectionInput,
    rawReason: string,
  ): PageViewModel<AdminEventResultConfirmContent> {
    const { event, entry, participants } = readEntry(eventId, entryId);
    const reason = requireReason(rawReason);
    const facts = validateEntry(eventId, entry, participants, input);
    const diff = diffEntry(eventId, entry, participants, facts);
    const title = 'Confirm: Correct the Result';
    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_event_result_confirm', title,
        instructions: { what: 'Review the correction to this result before it is written.', headsUp: [CONFIRM_INSTRUCTIONS_HEADS_UP] },
      },
      content: {
        eventTitle: event.title,
        subject: `${entry.discipline_name ?? 'General Ranking'}, placement ${entry.placement}`,
        changes: diff.changes,
        hasChanges: diff.changes.length > 0,
        noChangeMessage: diff.changes.length > 0 ? null : 'Those are the values the result already holds. Nothing would change.',
        reason,
        summary: 'Nobody is emailed. The competitor links to member and historical records are not changed.',
        hiddenFields: entryHiddenFields(input, reason),
        confirmAction: `${entryHref(eventId, entryId)}/confirm`,
        confirmLabel: 'Yes, Correct the Result',
        cancelHref: entryHref(eventId, entryId),
      },
    };
  },

  /** Commit an entry correction, and say how it ended. */
  applyEntryCorrection(
    actorId: string,
    eventId: string,
    entryId: string,
    input: EntryCorrectionInput,
    rawReason: string,
  ): Outcome {
    const reason = requireReason(rawReason);
    let changed = false;

    transaction(() => {
      const { entry, participants } = readEntry(eventId, entryId);
      const facts = validateEntry(eventId, entry, participants, input);
      const diff = diffEntry(eventId, entry, participants, facts);
      if (diff.fields.length === 0) return;

      const now = new Date().toISOString();
      if (diff.fields.some((f) => !f.startsWith('display_name:'))) {
        eventResultCorrection.updateEntry.run(
          facts.placement, facts.scoreText, facts.disciplineId, now, actorId, entryId,
        );
      }
      for (const p of participants) {
        const name = facts.names.get(p.participant_row_id)!;
        if (name !== p.display_name) {
          eventResultCorrection.updateParticipantName.run(name, now, actorId, p.participant_row_id);
        }
      }
      appendAuditEntry({
        actionType:    ENTRY_CORRECTED,
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'event_result_entry',
        entityId:      entryId,
        reasonText:    reason,
        metadata:      { event_id: eventId, fields: diff.fields, before: diff.before, after: diff.after },
      });
      changed = true;
    });

    const changedText = 'The result has been corrected, and the change is in the audit log.';
    if (changed) return { ending: 'advance', text: changedText };
    if (findStandingOwnAct(actorId, ENTRY_CORRECTED, ENTRY_CORRECTED, 'event_result_entry', entryId)) {
      return { ending: 'own_repeat', text: changedText };
    }
    return { ending: 'already_held', text: 'Those are the values the result already holds, so nothing changed.' };
  },

  /** The division correction form. */
  getDisciplineCorrectionPage(
    eventId: string,
    disciplineId: string,
    opts: { input?: DisciplineCorrectionInput; errorMessage?: string } = {},
  ): PageViewModel<AdminDisciplineCorrectionContent> {
    const { event, discipline } = readDiscipline(eventId, disciplineId);
    const family = opts.input ? opts.input.sportFamily : (discipline.discipline_category ?? '');
    const aggregate = opts.input ? opts.input.aggregateStanding === '1' : discipline.is_aggregate_standing === 1;
    const title = 'Correct a Division';
    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_event_result_discipline', title,
        instructions: {
          what: 'Corrects a division\'s sport family and whether it is an aggregate standing.',
          why: 'An aggregate standing (an overall or club ranking across several of the event\'s contests) does not count toward players\' career statistics and partnerships, and a single contest does. A division filed the wrong way miscounts them.',
          how: 'Choose the sport family and the kind of division, give a reason, and review the correction before it is written.',
          headsUp: ['Only a standing across several sports may have no sport family.'],
        },
      },
      content: {
        eventTitle: event.title,
        divisionName: discipline.name,
        familyOptions: [
          ...SPORT_FAMILIES.map((f) => ({ value: f.value, label: f.label, selected: f.value === family })),
          { value: '', label: NO_FAMILY_LABEL, selected: family === '' },
        ],
        isAggregateStanding: aggregate,
        previewAction: disciplineHref(eventId, disciplineId),
        cancelHref: resultsHref(eventId),
        ...(opts.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      },
    };
  },

  /** Preview a division correction. Nothing is written. */
  previewDisciplineCorrection(
    eventId: string,
    disciplineId: string,
    input: DisciplineCorrectionInput,
    rawReason: string,
  ): PageViewModel<AdminEventResultConfirmContent> {
    const { event, discipline } = readDiscipline(eventId, disciplineId);
    const reason = requireReason(rawReason);
    const facts = validateDiscipline(input);
    const changes: ChangeView[] = [];
    if (facts.category !== discipline.discipline_category) {
      changes.push({ label: 'Sport family', before: familyLabel(discipline.discipline_category), after: familyLabel(facts.category) });
    }
    if (facts.aggregate !== discipline.is_aggregate_standing) {
      changes.push({ label: 'Kind', before: aggregateLabel(discipline.is_aggregate_standing), after: aggregateLabel(facts.aggregate) });
    }
    const title = 'Confirm: Correct the Division';
    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_event_result_confirm', title,
        instructions: { what: 'Review the correction to this division before it is written.', headsUp: [CONFIRM_INSTRUCTIONS_HEADS_UP] },
      },
      content: {
        eventTitle: event.title,
        subject: discipline.name,
        changes,
        hasChanges: changes.length > 0,
        noChangeMessage: changes.length > 0 ? null : 'Those are the values the division already holds. Nothing would change.',
        reason,
        summary: 'Players\' career statistics and partnerships count the division by its new kind from now on. Nobody is emailed.',
        hiddenFields: [
          { name: 'sport_family', value: input.sportFamily },
          { name: 'aggregate_standing', value: input.aggregateStanding },
          { name: 'reason', value: reason },
        ],
        confirmAction: `${disciplineHref(eventId, disciplineId)}/confirm`,
        confirmLabel: 'Yes, Correct the Division',
        cancelHref: disciplineHref(eventId, disciplineId),
      },
    };
  },

  /** Commit a division correction, and say how it ended. */
  applyDisciplineCorrection(
    actorId: string,
    eventId: string,
    disciplineId: string,
    input: DisciplineCorrectionInput,
    rawReason: string,
  ): Outcome {
    const reason = requireReason(rawReason);
    let changed = false;

    transaction(() => {
      const { discipline } = readDiscipline(eventId, disciplineId);
      const facts = validateDiscipline(input);
      const fields: string[] = [];
      const before: Record<string, string | number | null> = {};
      const after: Record<string, string | number | null> = {};
      if (facts.category !== discipline.discipline_category) {
        fields.push('discipline_category');
        before['discipline_category'] = discipline.discipline_category;
        after['discipline_category'] = facts.category;
      }
      if (facts.aggregate !== discipline.is_aggregate_standing) {
        fields.push('is_aggregate_standing');
        before['is_aggregate_standing'] = discipline.is_aggregate_standing;
        after['is_aggregate_standing'] = facts.aggregate;
      }
      if (fields.length === 0) return;

      eventResultCorrection.updateDiscipline.run(
        facts.category, facts.aggregate, new Date().toISOString(), actorId, disciplineId,
      );
      appendAuditEntry({
        actionType:    DISCIPLINE_CORRECTED,
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'event_discipline',
        entityId:      disciplineId,
        reasonText:    reason,
        metadata:      { event_id: eventId, fields, before, after },
      });
      changed = true;
    });

    const changedText = 'The division has been corrected, and the change is in the audit log.';
    if (changed) return { ending: 'advance', text: changedText };
    if (findStandingOwnAct(actorId, DISCIPLINE_CORRECTED, DISCIPLINE_CORRECTED, 'event_discipline', disciplineId)) {
      return { ending: 'own_repeat', text: changedText };
    }
    return { ending: 'already_held', text: 'Those are the values the division already holds, so nothing changed.' };
  },
};
