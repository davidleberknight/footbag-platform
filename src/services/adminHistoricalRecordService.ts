/**
 * AdminHistoricalRecordService -- the administrator's surface for a historical
 * competition record nobody holds.
 *
 * Owns the lookup and the confirmation view-models for the two things an
 * administrator does to such a record directly:
 *   - recording that the person it names is recognized as deceased, or taking
 *     that back. DeceasedMarkingService owns the flag and writes it.
 *   - correcting the imported facts: the name, the country, and the first and
 *     last competition years. This service writes the correction itself.
 *
 * The correction:
 *   - takes a reason, previews before it writes, and refuses a record a member
 *     holds, which is corrected through their member record instead.
 *   - writes the record, any player-hashtag move and one audit row
 *     (`legacy.historical_person_corrected`, carrying every changed value before
 *     and after) in one transaction, and writes nothing when nothing changed.
 *   - re-runs no identity matcher and touches no link. Claim matching reads the
 *     name live, so the corrected name is what the next wizard render matches.
 *   - moves the person's player hashtag (`#player_` and the name as a tag slug)
 *     when the corrected name spells it differently, renaming the one tag row
 *     in place, and each media item's copy of its display form, so the media
 *     crediting the person keep crediting them. A tag
 *     another record's name also spells is left alone, because it still
 *     credits that record; a move onto a tag already in use is refused rather
 *     than merging two tags.
 *
 * Persistence: reads and writes `historical_persons`, `tags` and `media_tags`; appends to
 * `audit_entries`. No outbox: nobody owns the record to be told.
 *
 * Why it is a surface of its own. A historical record is not a member account:
 * nobody signs in as one, it carries no contact details, and the flag on it is
 * consumed for exactly one purpose, which is to stop offering the record for
 * direct claiming. Where somebody has claimed the record, the flag belongs to
 * their member record and is set there, so this surface says so and offers no
 * control, rather than giving the same flag two homes that can disagree.
 *
 * Audience: admin only, behind the route gate.
 */
import {
  deceasedMarking,
  historicalRecordCorrection,
  mediaTags,
  nameVariants,
  transaction,
} from '../db/db';
import { deceasedMarkingService } from './deceasedMarkingService';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
import { appendAuditEntry, findStandingOwnAct } from './auditService';
import { canonicalCountryOrThrow, parseFirstCompetitionYearOrThrow } from './memberLocationRules';
import { locationPickers, type SelectOption } from './memberService';
import { slugifyForTag } from './slugify';
import { cleanUserText } from '../lib/textSanitizer';
import type { PageViewModel } from '../types/page';
import type { OutcomeNoticeView } from '../lib/outcomeNotice';
import type { ActionEnding } from '../lib/actionOutcome';

const LOOKUP_LIMIT = 25;
const MIN_LOOKUP_QUERY = 2;
const MAX_NAME = 200;
const MAX_REASON = 500;
const CORRECTED = 'legacy.historical_person_corrected';
const CONFIRM_INSTRUCTIONS = { what: 'Review this change before it is written.' };

interface HistoricalRecordRow {
  person_id: string;
  person_name: string;
  country: string | null;
  first_year: number | null;
  last_year: number | null;
  is_deceased: number;
  claimed_by_member_id: string | null;
  claimed_by_display_name: string | null;
  // 0 when the holder is a prospective member, who is never named on
  // an admin page and has no admin record to link.
  claimed_by_is_nameable: 0 | 1;
}

interface RecordResultView {
  personId: string;
  personName: string;
  facts: string[];
  isDeceased: boolean;
  /** Held by a member account, so the flag is set from their record instead. */
  isClaimed: boolean;
  claimedNote: string | null;
  claimedHref: string | null;
  markAction: string;
  revertAction: string;
  correctHref: string;
}

export interface AdminHistoricalRecordsContent {
  query: string;
  hasQuery: boolean;
  results: RecordResultView[];
  hasResults: boolean;
  resultSummary: string;
  hasMore: boolean;
  /** The result of the last mark or revert, carried across its redirect. */
  notice: OutcomeNoticeView | null;
  errorMessage?: string;
}

export interface AdminHistoricalRecordConfirmContent {
  personId: string;
  personName: string;
  summary: string;
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
  /** Present on a correction: each changed value before and after. */
  changes?: Array<{ label: string; before: string; after: string }>;
  hasChanges?: boolean;
  noChangeMessage?: string | null;
  /** One sentence of caution, only on a correction that moves a hashtag. */
  caution?: string | null;
  reason?: string;
  hiddenFields?: Array<{ name: string; value: string }>;
}

/** The facts an administrator submits, as the form posts them. */
export interface HistoricalRecordCorrectionInput {
  name: string;
  country: string;
  firstYear: string;
  lastYear: string;
}

export interface AdminHistoricalRecordCorrectionContent {
  personId: string;
  personName: string;
  form: HistoricalRecordCorrectionInput;
  countryOptions: SelectOption[];
  previewAction: string;
  cancelHref: string;
  errorMessage?: string;
}

interface CorrectableRow {
  person_id: string;
  person_name: string;
  country: string | null;
  first_year: number | null;
  last_year: number | null;
  claimed_by_member_id: string | null;
}

interface CorrectedFacts {
  person_name: string;
  country: string | null;
  first_year: number | null;
  last_year: number | null;
}

type FactField = keyof CorrectedFacts;

const FACT_FIELDS: FactField[] = ['person_name', 'country', 'first_year', 'last_year'];

const FACT_LABEL: Record<FactField, string> = {
  person_name: 'Name',
  country:     'Country',
  first_year:  'First competition year',
  last_year:   'Last competition year',
};

interface TagMove { tagId: string; oldTag: string; newTag: string }

function yearsLabel(row: HistoricalRecordRow): string | null {
  if (!row.first_year && !row.last_year) return null;
  if (row.first_year && row.last_year && row.first_year !== row.last_year) {
    return `Competed ${row.first_year} to ${row.last_year}`;
  }
  return `Competed ${row.first_year ?? row.last_year}`;
}

function shapeRow(row: HistoricalRecordRow): RecordResultView {
  const claimed = Boolean(row.claimed_by_member_id);
  return {
    personId:   row.person_id,
    personName: row.person_name,
    facts: [row.person_id, row.country, yearsLabel(row)]
      .filter((f): f is string => Boolean(f)),
    isDeceased: row.is_deceased === 1,
    isClaimed:  claimed,
    claimedNote: claimed
      ? `Held by ${row.claimed_by_is_nameable ? row.claimed_by_display_name : row.claimed_by_member_id}, so this is recorded on their member record.`
      : null,
    claimedHref: row.claimed_by_member_id && row.claimed_by_is_nameable
      ? `/admin/members/${row.claimed_by_member_id}`
      : null,
    markAction:   `/admin/historical-records/${row.person_id}/deceased`,
    revertAction: `/admin/historical-records/${row.person_id}/deceased/revert`,
    correctHref:  correctionHref(row.person_id),
  };
}

function correctionHref(personId: string): string {
  return `/admin/historical-records/${personId}/correction`;
}

/**
 * The record, refused when a member holds it: their member record is where the
 * name they compete under is corrected, and one set of facts must not have two
 * homes that can disagree.
 */
function readCorrectableRecord(personId: string): CorrectableRow {
  const row = historicalRecordCorrection.findRecord.get(personId) as CorrectableRow | undefined;
  if (!row) throw new NotFoundError('No historical record with that id.');
  if (row.claimed_by_member_id) {
    throw new ConflictError(
      'A member holds this record, so it is corrected through their member record instead.',
    );
  }
  return row;
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

/**
 * The submitted facts, validated. A blank country or year clears it, since
 * many imported records never carried one. A country spelled as the record
 * already holds it passes unchanged, so an imported spelling the picker does
 * not list survives a correction of some other field.
 */
function validateFacts(row: CorrectableRow, input: HistoricalRecordCorrectionInput): CorrectedFacts {
  const name = cleanUserText(input.name, 'single_line', 'name');
  if (!name) throw new ValidationError('Enter the name.');
  if (name.length > MAX_NAME) {
    throw new ValidationError(`The name must be ${MAX_NAME} characters or fewer.`);
  }
  const rawCountry = input.country.trim();
  const country = rawCountry === '' ? null : canonicalCountryOrThrow(rawCountry, row.country);
  const firstYear = parseFirstCompetitionYearOrThrow(input.firstYear.trim());
  const lastYear = parseFirstCompetitionYearOrThrow(input.lastYear.trim());
  if (firstYear !== null && lastYear !== null && firstYear > lastYear) {
    throw new ValidationError('The first competition year cannot be later than the last.');
  }
  return { person_name: name, country, first_year: firstYear, last_year: lastYear };
}

function changedFields(row: CorrectableRow, facts: CorrectedFacts): FactField[] {
  return FACT_FIELDS.filter((f) => row[f] !== facts[f]);
}

function shown(value: string | number | null): string {
  return value === null ? '(none)' : String(value);
}

function playerTag(name: string): string {
  return `#player_${slugifyForTag(name)}`;
}

/**
 * The player-hashtag move a name correction carries, or null when there is
 * nothing to move: the spelling is unchanged, no media carry the old tag, or
 * another record's name spells the same tag and it stays theirs.
 */
function resolveTagMove(row: CorrectableRow, facts: CorrectedFacts): TagMove | null {
  const oldTag = playerTag(row.person_name);
  const newTag = playerTag(facts.person_name);
  if (oldTag === newTag) return null;
  const existing = mediaTags.findTagByNormalized.get(oldTag) as { id: string } | undefined;
  if (!existing) return null;
  const people = nameVariants.listHistoricalPersonNames.all() as Array<{
    person_id: string; person_name: string;
  }>;
  if (people.some((p) => p.person_id !== row.person_id && playerTag(p.person_name) === oldTag)) {
    return null;
  }
  if (mediaTags.findTagByNormalized.get(newTag)) {
    throw new ValidationError(
      `The hashtag ${newTag} is already in use, so this correction would merge two hashtags. `
      + 'Resolve the hashtags first, then correct the name.',
    );
  }
  return { tagId: existing.id, oldTag, newTag };
}

function correctionHiddenFields(
  input: HistoricalRecordCorrectionInput,
  reason: string,
): Array<{ name: string; value: string }> {
  return [
    { name: 'name',       value: input.name },
    { name: 'country',    value: input.country },
    { name: 'first_year', value: input.firstYear },
    { name: 'last_year',  value: input.lastYear },
    { name: 'reason',     value: reason },
  ];
}

function readRecord(personId: string): { person_id: string; person_name: string; is_deceased: number } {
  const row = deceasedMarking.findHistoricalPerson.get(personId) as
    | { person_id: string; person_name: string; is_deceased: number }
    | undefined;
  if (!row) throw new NotFoundError('No historical record with that id.');
  return row;
}

export const adminHistoricalRecordService = {
  /** The lookup, by exact record id or part of the name. */
  getHistoricalRecordsPage(
    rawQuery: string,
    opts: { notice?: OutcomeNoticeView | null; errorMessage?: string } = {},
  ): PageViewModel<AdminHistoricalRecordsContent> {
    const query = rawQuery.trim();
    const title = 'Historical Records';
    let results: RecordResultView[] = [];
    let hasMore = false;
    let errorMessage = opts.errorMessage;

    if (query !== '' && query.length < MIN_LOOKUP_QUERY) {
      errorMessage = `Enter at least ${MIN_LOOKUP_QUERY} characters, or an exact record id.`;
    } else if (query !== '') {
      const escaped = query.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`);
      const rows = deceasedMarking.searchHistoricalPersons.all(
        query, escaped, LOOKUP_LIMIT + 1,
      ) as HistoricalRecordRow[];
      hasMore = rows.length > LOOKUP_LIMIT;
      results = rows.slice(0, LOOKUP_LIMIT).map(shapeRow);
    }

    const resultSummary = query === ''
      ? 'Search for a historical competition record by name, or by its exact record id.'
      : results.length === 0
        ? 'No historical record matches that search.'
        : hasMore
          ? `More than ${LOOKUP_LIMIT} records match. Narrow the search to see the rest.`
          : results.length === 1
            ? 'One record matches.'
            : `${results.length} records match.`;

    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_historical_records', title,
        instructions: {
          what: 'Finds competitors in the results archive who have no member account.',
          why: 'To correct a mistake in an imported record, or to record that the person has died.',
          how: 'Search by name or exact record id, then choose Correct the Record or the deceased action.',
          headsUp: [
            'Nobody is emailed, because no member holds these records.',
            'A record a member has claimed is corrected through that member\'s record.',
            'Recording a death stops the record being offered for claiming, and leaves the person\'s results and name published.',
          ],
        },
      },
      content: {
        query,
        hasQuery: query !== '',
        results,
        hasResults: results.length > 0,
        resultSummary,
        hasMore,
        notice: opts.notice ?? null,
        errorMessage,
      },
    };
  },

  /** Preview the change. Nothing is written. */
  previewDeceasedChange(
    personId: string,
    marking: boolean,
  ): PageViewModel<AdminHistoricalRecordConfirmContent> {
    const row = readRecord(personId);
    const title = marking
      ? 'Confirm: Record This Person as Deceased'
      : 'Confirm: Remove the Deceased Record';

    return {
      seo:  { title, noindex: true },
      page: { sectionKey: '', pageKey: 'admin_historical_record_confirm', title, instructions: CONFIRM_INSTRUCTIONS },
      content: {
        personId:   row.person_id,
        personName: row.person_name,
        summary: marking
          ? 'This records that the person is recognized as deceased, which stops the platform '
            + 'offering their record for direct claiming. Their competition results, honours and '
            + 'name stay published exactly as they are.'
          : 'This removes the marking, so the record can be claimed directly again. Nothing else '
            + 'about the record changes.',
        confirmAction: marking
          ? `/admin/historical-records/${row.person_id}/deceased/confirm`
          : `/admin/historical-records/${row.person_id}/deceased/revert/confirm`,
        confirmLabel: marking ? 'Yes, Record as Deceased' : 'Yes, Remove the Record',
        cancelHref:   '/admin/historical-records',
      },
    };
  },

  /**
   * Commit the change through the service that owns the flag, and say how it
   * ended. A record already in the asked-for state is a repeat: this admin's
   * own standing change reports the first submit's success, and a state
   * someone else left reports that nothing changed.
   */
  applyDeceasedChange(
    actorId: string,
    personId: string,
    marking: boolean,
  ): { ending: Exclude<ActionEnding, 'refused'>; text: string } {
    const result = deceasedMarkingService.setHistoricalPersonDeceased(
      actorId, personId, marking,
    );
    const changedText = marking
      ? `${result.personName} is recorded as deceased, and the change is in the audit log.`
      : `The marking on ${result.personName} has been removed, and the change is in the audit log.`;
    if (result.status === 'unchanged') {
      const act = marking ? 'member.deceased_marked' : 'member.deceased_reverted';
      const reversal = marking ? 'member.deceased_reverted' : 'member.deceased_marked';
      if (findStandingOwnAct(actorId, act, reversal, 'historical_person', personId)) {
        return { ending: 'own_repeat', text: changedText };
      }
      return {
        ending: 'already_held',
        text: marking
          ? 'That record was already marked, so nothing changed.'
          : 'That record carried no marking, so nothing changed.',
      };
    }
    return { ending: 'advance', text: changedText };
  },

  /**
   * The correction form, holding the record's current facts, or the values the
   * administrator submitted when they are shown it again with an error.
   */
  getCorrectionPage(
    personId: string,
    opts: { input?: HistoricalRecordCorrectionInput; errorMessage?: string } = {},
  ): PageViewModel<AdminHistoricalRecordCorrectionContent> {
    const row = readCorrectableRecord(personId);
    const form = opts.input ?? {
      name:      row.person_name,
      country:   row.country ?? '',
      firstYear: row.first_year === null ? '' : String(row.first_year),
      lastYear:  row.last_year === null ? '' : String(row.last_year),
    };
    const title = 'Correct a Historical Record';
    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '', pageKey: 'admin_historical_record_correction', title,
        instructions: {
          what: 'Corrects the name, country and competition years on an imported record.',
          how: 'Change what is wrong, give a reason, and review the correction before it is written.',
          headsUp: [
            'Leaving the country or a year blank clears it.',
            'A corrected name can move the person\'s player hashtag, and the preview says so.',
          ],
        },
      },
      content: {
        personId:       row.person_id,
        personName:     row.person_name,
        form,
        countryOptions: locationPickers(form.country, '').countryOptions,
        previewAction:  correctionHref(row.person_id),
        cancelHref:     `/admin/historical-records?q=${encodeURIComponent(row.person_id)}`,
        ...(opts.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      },
    };
  },

  /** Preview a correction. Nothing is written. */
  previewCorrection(
    personId: string,
    input: HistoricalRecordCorrectionInput,
    rawReason: string,
  ): PageViewModel<AdminHistoricalRecordConfirmContent> {
    const row = readCorrectableRecord(personId);
    const reason = requireReason(rawReason);
    const facts = validateFacts(row, input);
    const fields = changedFields(row, facts);
    const move = fields.includes('person_name') ? resolveTagMove(row, facts) : null;
    const changes = fields.map((f) => ({
      label: FACT_LABEL[f], before: shown(row[f]), after: shown(facts[f]),
    }));
    if (move) changes.push({ label: 'Player hashtag', before: move.oldTag, after: move.newTag });

    const title = 'Confirm: Correct the Historical Record';
    return {
      seo:  { title, noindex: true },
      page: { sectionKey: '', pageKey: 'admin_historical_record_confirm', title, instructions: CONFIRM_INSTRUCTIONS },
      content: {
        personId:   row.person_id,
        personName: row.person_name,
        summary: 'The corrected facts appear on the public history page and in results straight '
          + 'away, and a corrected name is what claim matching reads from then on. Nobody is '
          + 'emailed, because no member holds this record.',
        changes,
        hasChanges:      changes.length > 0,
        noChangeMessage: changes.length > 0
          ? null
          : 'Those are the facts the record already holds. Nothing would change.',
        caution: move
          ? `Every media item tagged ${move.oldTag} will carry ${move.newTag} instead, and the `
            + 'old hashtag stops existing.'
          : null,
        reason,
        hiddenFields:  correctionHiddenFields(input, reason),
        confirmAction: `${correctionHref(row.person_id)}/confirm`,
        confirmLabel:  'Yes, Correct the Record',
        cancelHref:    correctionHref(row.person_id),
      },
    };
  },

  /**
   * Commit a correction, and say how it ended. A submission that changes
   * nothing writes nothing: this admin's own standing correction reports the
   * first submit's success, and facts someone else left report that nothing
   * changed.
   */
  applyCorrection(
    actorId: string,
    personId: string,
    input: HistoricalRecordCorrectionInput,
    rawReason: string,
  ): { ending: Exclude<ActionEnding, 'refused'>; text: string } {
    const reason = requireReason(rawReason);
    let personName = '';
    let changed = false;

    transaction(() => {
      const row = readCorrectableRecord(personId);
      const facts = validateFacts(row, input);
      const fields = changedFields(row, facts);
      personName = facts.person_name;
      if (fields.length === 0) return;

      const move = fields.includes('person_name') ? resolveTagMove(row, facts) : null;
      const now = new Date().toISOString();
      historicalRecordCorrection.updateRecord.run(
        facts.person_name, facts.country, facts.first_year, facts.last_year, row.person_id,
      );
      if (move) {
        mediaTags.updateTagDisplay.run(move.newTag, move.newTag, now, actorId, move.tagId);
        mediaTags.updateMediaTagDisplayForTag.run(move.newTag, now, actorId, move.tagId);
      }

      const before: Record<string, string | number | null> = {};
      const after: Record<string, string | number | null> = {};
      for (const f of fields) {
        before[f] = row[f];
        after[f] = facts[f];
      }
      appendAuditEntry({
        actionType:    CORRECTED,
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'historical_person',
        entityId:      row.person_id,
        reasonText:    reason,
        metadata: {
          fields, before, after,
          ...(move ? { old_tag: move.oldTag, new_tag: move.newTag } : {}),
        },
      });
      changed = true;
    });

    const changedText = `The record for ${personName} has been corrected, and the change is in the audit log.`;
    if (changed) return { ending: 'advance', text: changedText };
    if (findStandingOwnAct(actorId, CORRECTED, CORRECTED, 'historical_person', personId)) {
      return { ending: 'own_repeat', text: changedText };
    }
    return {
      ending: 'already_held',
      text: 'Those are the facts the record already holds, so nothing changed.',
    };
  },
};
