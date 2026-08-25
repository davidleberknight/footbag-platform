/**
 * AdminHistoricalRecordService -- the administrator's surface for a historical
 * competition record nobody holds.
 *
 * Owns the lookup and the confirmation view-models for the one thing an
 * administrator does to such a record directly: recording that the person it
 * names is recognized as deceased, or taking that back. Writes nothing itself;
 * DeceasedMarkingService owns the flag.
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
import { deceasedMarking } from '../db/db';
import { deceasedMarkingService } from './deceasedMarkingService';
import { NotFoundError, ValidationError } from './serviceErrors';
import type { PageViewModel } from '../types/page';

const LOOKUP_LIMIT = 25;
const MIN_LOOKUP_QUERY = 2;

interface HistoricalRecordRow {
  person_id: string;
  person_name: string;
  country: string | null;
  first_year: number | null;
  last_year: number | null;
  is_deceased: number;
  claimed_by_member_id: string | null;
  claimed_by_display_name: string | null;
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
}

export interface AdminHistoricalRecordsContent {
  query: string;
  hasQuery: boolean;
  results: RecordResultView[];
  hasResults: boolean;
  resultSummary: string;
  hasMore: boolean;
  errorMessage?: string;
}

export interface AdminHistoricalRecordConfirmContent {
  personId: string;
  personName: string;
  summary: string;
  reason: string;
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

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
      ? `Held by ${row.claimed_by_display_name ?? 'a member'}, so this is recorded on their member record.`
      : null,
    claimedHref: row.claimed_by_member_id ? `/admin/members/${row.claimed_by_member_id}` : null,
    markAction:   `/admin/historical-records/${row.person_id}/deceased`,
    revertAction: `/admin/historical-records/${row.person_id}/deceased/revert`,
  };
}

function requireReason(raw: string): string {
  const reason = raw.trim();
  if (!reason) throw new ValidationError('Enter the reason for this change.');
  return reason;
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
    opts: { errorMessage?: string } = {},
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
      page: { sectionKey: '', pageKey: 'admin_historical_records', title },
      content: {
        query,
        hasQuery: query !== '',
        results,
        hasResults: results.length > 0,
        resultSummary,
        hasMore,
        errorMessage,
      },
    };
  },

  /** Preview the change. Nothing is written. */
  previewDeceasedChange(
    personId: string,
    marking: boolean,
    rawReason: string,
  ): PageViewModel<AdminHistoricalRecordConfirmContent> {
    const row = readRecord(personId);
    const reason = requireReason(rawReason);
    const title = marking
      ? 'Confirm: Record This Person as Deceased'
      : 'Confirm: Remove the Deceased Record';

    return {
      seo:  { title, noindex: true },
      page: { sectionKey: '', pageKey: 'admin_historical_record_confirm', title },
      content: {
        personId:   row.person_id,
        personName: row.person_name,
        summary: marking
          ? 'This records that the person is recognized as deceased, which stops the platform '
            + 'offering their record for direct claiming. Their competition results, honours and '
            + 'name stay published exactly as they are.'
          : 'This removes the marking, so the record can be claimed directly again. Nothing else '
            + 'about the record changes.',
        reason,
        confirmAction: marking
          ? `/admin/historical-records/${row.person_id}/deceased/confirm`
          : `/admin/historical-records/${row.person_id}/deceased/revert/confirm`,
        confirmLabel: marking ? 'Yes, Record as Deceased' : 'Yes, Remove the Record',
        cancelHref:   '/admin/historical-records',
      },
    };
  },

  /** Commit the change through the service that owns the flag. */
  applyDeceasedChange(
    actorId: string,
    personId: string,
    marking: boolean,
    rawReason: string,
  ): string {
    const reason = requireReason(rawReason);
    const result = deceasedMarkingService.setHistoricalPersonDeceased(
      actorId, personId, marking, reason,
    );
    if (result.status === 'unchanged') {
      return marking
        ? 'That record was already marked, so nothing changed.'
        : 'That record carried no marking, so nothing changed.';
    }
    return marking
      ? `${result.personName} is recorded as deceased, and the change is in the audit log.`
      : `The marking on ${result.personName} has been removed, and the change is in the audit log.`;
  },
};
