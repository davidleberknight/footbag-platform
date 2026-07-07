/**
 * ConsecutiveKicksCurationService -- admin-facing curation of consecutive-kicks records.
 *
 * Owns:
 *   - The admin browse of consecutive_kicks_records, grouped by section and then
 *     division, with a link to edit each row.
 *   - The admin edit surface for one row: rendering its editable fields and saving
 *     edits, keyed on the row's stable surrogate id (not its mutable display
 *     position).
 *
 * Does not own:
 *   - The public records pages (RecordsService is public, read-only).
 *   - Adding or removing rows (a later slice; remove will be a hard delete by id).
 *
 * Write discipline: updateRow validates the submitted fields (section, subsection,
 * and division required; score and rank each empty or a whole number; the display
 * position a unique positive whole number, checked against the other rows before
 * the write with the column's UNIQUE constraint as the backstop). The update and
 * its one audit entry commit together in a single transaction; the id is not
 * editable. Every write path first runs the pre-go-live persona guard, so a seeded
 * test persona cannot author record content in a developer checkout; in staging and
 * production the guard is a no-op and the admin remains the audit actor.
 *
 * Persistence: reads and writes consecutive_kicks_records. Appends
 * freestyle.consecutive_record.updated to audit_entries.
 */
import { consecutiveKicksRecords, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { config } from '../config/env';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';

export interface ConsecutiveBrowseRow {
  id: string;
  sortOrder: number;
  players: string;
  score: string;
  editHref: string;
}
export interface ConsecutiveDivisionGroup {
  division: string;
  rows: ConsecutiveBrowseRow[];
}
export interface ConsecutiveSectionGroup {
  section: string;
  divisions: ConsecutiveDivisionGroup[];
}
export interface ConsecutiveBrowseContent {
  sections: ConsecutiveSectionGroup[];
  totalCount: number;
  hasRows: boolean;
}

export interface ConsecutiveEditFields {
  sortOrder: string;
  section: string;
  subsection: string;
  division: string;
  year: string;
  rank: string;
  player1: string;
  player2: string;
  score: string;
  note: string;
  eventDate: string;
  eventName: string;
  location: string;
}

export interface ConsecutiveEditContent {
  id: string;
  fields: ConsecutiveEditFields;
  backHref: string;
  saved: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

/** The editable fields submitted by the edit form. */
export interface ConsecutiveScalarInput {
  sortOrder?: string;
  section?: string;
  subsection?: string;
  division?: string;
  year?: string;
  rank?: string;
  player1?: string;
  player2?: string;
  score?: string;
  note?: string;
  eventDate?: string;
  eventName?: string;
  location?: string;
}

/** Options for re-rendering the edit page after a save or a validation failure. */
export interface ConsecutiveEditPageOptions {
  saved?: boolean;
  submitted?: ConsecutiveScalarInput;
  fieldErrors?: Record<string, string>;
}

interface ConsecutiveCurationDbRow {
  id: string;
  sort_order: number;
  section: string;
  subsection: string;
  division: string;
  year: string | null;
  rank: number | null;
  player_1: string | null;
  player_2: string | null;
  score: number | null;
  note: string | null;
  event_date: string | null;
  event_name: string | null;
  location: string | null;
}

// Pre-go-live guardrail, parallel to the record-curation and curated-media ones: a
// seeded test persona must never author record content in a developer checkout. A
// no-op in staging and production; the admin remains the audit actor of record.
function assertActorMayCurateFreestyle(actorMemberId: string): void {
  if (config.allowCuratedSidecarWrites && isSeededTestPersonaMemberId(actorMemberId)) {
    throw new ForbiddenError(
      'Consecutive-kicks records cannot be edited by a test persona in a pre-go-live developer checkout.',
    );
  }
}

function numOrEmpty(value: number | null): string {
  return value === null || value === undefined ? '' : String(value);
}

function joinPlayers(p1: string | null, p2: string | null): string {
  return [p1, p2].filter(Boolean).join(' & ');
}

export const consecutiveKicksCurationService = {
  getBrowsePage(): PageViewModel<ConsecutiveBrowseContent> {
    const rows = consecutiveKicksRecords.listAllForCuration.all() as ConsecutiveCurationDbRow[];

    // Group by section, then by division, preserving the sort_order ordering the
    // query already applied.
    const sections: ConsecutiveSectionGroup[] = [];
    const sectionIndex = new Map<string, ConsecutiveSectionGroup>();
    for (const r of rows) {
      let section = sectionIndex.get(r.section);
      if (!section) {
        section = { section: r.section, divisions: [] };
        sectionIndex.set(r.section, section);
        sections.push(section);
      }
      let division = section.divisions.find((d) => d.division === r.division);
      if (!division) {
        division = { division: r.division, rows: [] };
        section.divisions.push(division);
      }
      division.rows.push({
        id:        r.id,
        sortOrder: r.sort_order,
        players:   joinPlayers(r.player_1, r.player_2),
        score:     numOrEmpty(r.score),
        editHref:  `/admin/freestyle/consecutive-records/${r.id}/edit`,
      });
    }

    return {
      seo:  { title: 'Consecutive Kicks Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_consecutive_records', title: 'Consecutive Kicks Records' },
      content: { sections, totalCount: rows.length, hasRows: rows.length > 0 },
    };
  },

  // Edit page for one row. Returns null when the id has no row (the controller maps
  // null to 404). `opts` re-renders the form after a save (saved banner) or a
  // validation failure (the admin's submitted values plus per-field errors).
  getEditPage(id: string, opts: ConsecutiveEditPageOptions = {}): PageViewModel<ConsecutiveEditContent> | null {
    const row = consecutiveKicksRecords.getForCurationById.get(id) as ConsecutiveCurationDbRow | undefined;
    if (!row) return null;

    const sub = opts.submitted;
    const fields: ConsecutiveEditFields = {
      sortOrder:  sub ? (sub.sortOrder ?? '') : String(row.sort_order),
      section:    sub ? (sub.section ?? '') : row.section,
      subsection: sub ? (sub.subsection ?? '') : row.subsection,
      division:   sub ? (sub.division ?? '') : row.division,
      year:       sub ? (sub.year ?? '') : (row.year ?? ''),
      rank:       sub ? (sub.rank ?? '') : numOrEmpty(row.rank),
      player1:    sub ? (sub.player1 ?? '') : (row.player_1 ?? ''),
      player2:    sub ? (sub.player2 ?? '') : (row.player_2 ?? ''),
      score:      sub ? (sub.score ?? '') : numOrEmpty(row.score),
      note:       sub ? (sub.note ?? '') : (row.note ?? ''),
      eventDate:  sub ? (sub.eventDate ?? '') : (row.event_date ?? ''),
      eventName:  sub ? (sub.eventName ?? '') : (row.event_name ?? ''),
      location:   sub ? (sub.location ?? '') : (row.location ?? ''),
    };

    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);

    return {
      seo:  { title: 'Consecutive Kicks Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_consecutive_record_edit', title: 'Edit consecutive-kicks record' },
      content: {
        id: row.id,
        fields,
        backHref:  '/admin/freestyle/consecutive-records',
        saved:     opts.saved === true,
        fieldErrors,
        errorList,
        hasErrors: errorList.length > 0,
      },
    };
  },

  // Update one row's editable fields, then append one audit entry, in a single
  // transaction. Throws NotFoundError for an unknown id and ValidationError (with
  // per-field messages) on bad input.
  updateRow(id: string, input: ConsecutiveScalarInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const current = consecutiveKicksRecords.getForCurationById.get(id) as ConsecutiveCurationDbRow | undefined;
    if (!current) throw new NotFoundError(`No consecutive-kicks record "${id}"`);

    const fieldErrors: Record<string, string> = {};

    const section = (input.section ?? '').trim();
    if (!section) fieldErrors.section = 'Section is required.';
    const subsection = (input.subsection ?? '').trim();
    if (!subsection) fieldErrors.subsection = 'Subsection is required.';
    const division = (input.division ?? '').trim();
    if (!division) fieldErrors.division = 'Division is required.';

    const sortRaw = (input.sortOrder ?? '').trim();
    let sortOrder = current.sort_order;
    if (!/^\d+$/.test(sortRaw) || parseInt(sortRaw, 10) < 1) {
      fieldErrors.sortOrder = 'Display position must be a whole number of 1 or more.';
    } else {
      sortOrder = parseInt(sortRaw, 10);
      const holder = consecutiveKicksRecords.getIdBySortOrder.get(sortOrder) as { id: string } | undefined;
      if (holder && holder.id !== id) {
        fieldErrors.sortOrder = `Display position ${sortOrder} is already used by another row.`;
      }
    }

    const rank = wholeOrNull(input.rank, 'rank', 'Rank', fieldErrors);
    const score = wholeOrNull(input.score, 'score', 'Score', fieldErrors);

    const year = emptyToNull(input.year);
    const player1 = emptyToNull(input.player1);
    const player2 = emptyToNull(input.player2);
    const note = emptyToNull(input.note);
    const eventDate = emptyToNull(input.eventDate);
    const eventName = emptyToNull(input.eventName);
    const location = emptyToNull(input.location);

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }

    const changedFields: string[] = [];
    const mark = (changed: boolean, name: string) => { if (changed) changedFields.push(name); };
    mark(sortOrder !== current.sort_order, 'sort_order');
    mark(section !== current.section, 'section');
    mark(subsection !== current.subsection, 'subsection');
    mark(division !== current.division, 'division');
    mark(year !== (current.year ?? null), 'year');
    mark(rank !== (current.rank ?? null), 'rank');
    mark(player1 !== (current.player_1 ?? null), 'player_1');
    mark(player2 !== (current.player_2 ?? null), 'player_2');
    mark(score !== (current.score ?? null), 'score');
    mark(note !== (current.note ?? null), 'note');
    mark(eventDate !== (current.event_date ?? null), 'event_date');
    mark(eventName !== (current.event_name ?? null), 'event_name');
    mark(location !== (current.location ?? null), 'location');

    transaction(() => {
      consecutiveKicksRecords.updateForCuration.run(
        sortOrder, section, subsection, division, year, rank,
        player1, player2, score, note, eventDate, eventName, location, id,
      );
      appendAuditEntry({
        actionType:    'freestyle.consecutive_record.updated',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_consecutive_record',
        entityId:      id,
        metadata:      { changedFields },
      });
    });
  },
};

function wholeOrNull(
  raw: string | undefined,
  key: string,
  label: string,
  fieldErrors: Record<string, string>,
): number | null {
  const trimmed = (raw ?? '').trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) {
    fieldErrors[key] = `${label} must be empty or a whole number.`;
    return null;
  }
  return parseInt(trimmed, 10);
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
