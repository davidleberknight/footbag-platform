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
import { randomUUID } from 'node:crypto';
import { consecutiveKicksRecords, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { config } from '../config/env';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';

// A pre-check rejects a duplicate display position before the insert, but two
// writers in separate processes can both pass that check and race to the same
// value; the column's unique constraint is the authoritative backstop. Map its
// violation to the same ValidationError the pre-check raises, so the losing writer
// sees the clean field message instead of an unhandled 500.
function isDuplicateKeyError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

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
  isNew: boolean;
  formAction: string;
  deleteHref: string;
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
        isNew: false,
        formAction: `/admin/freestyle/consecutive-records/${row.id}/edit`,
        deleteHref: `/admin/freestyle/consecutive-records/${row.id}/delete`,
        fields,
        backHref:  '/admin/freestyle/consecutive-records',
        saved:     opts.saved === true,
        fieldErrors,
        errorList,
        hasErrors: errorList.length > 0,
      },
    };
  },

  // The blank new-row form: the same edit template with empty field values and its
  // post target pointing at the create route. `opts` re-renders the form with the
  // admin's submitted values and per-field errors on a failed create.
  getNewPage(opts: ConsecutiveEditPageOptions = {}): PageViewModel<ConsecutiveEditContent> {
    const sub = opts.submitted;
    const fields: ConsecutiveEditFields = {
      sortOrder:  sub?.sortOrder ?? '',
      section:    sub?.section ?? '',
      subsection: sub?.subsection ?? '',
      division:   sub?.division ?? '',
      year:       sub?.year ?? '',
      rank:       sub?.rank ?? '',
      player1:    sub?.player1 ?? '',
      player2:    sub?.player2 ?? '',
      score:      sub?.score ?? '',
      note:       sub?.note ?? '',
      eventDate:  sub?.eventDate ?? '',
      eventName:  sub?.eventName ?? '',
      location:   sub?.location ?? '',
    };

    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);

    return {
      seo:  { title: 'Consecutive Kicks Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_consecutive_record_new', title: 'New consecutive-kicks record' },
      content: {
        id: '',
        isNew: true,
        formAction: '/admin/freestyle/consecutive-records',
        deleteHref: '',
        fields,
        backHref:  '/admin/freestyle/consecutive-records',
        saved:     false,
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

    const v = validateConsecutiveInput(input, id);

    const changedFields: string[] = [];
    const mark = (changed: boolean, name: string) => { if (changed) changedFields.push(name); };
    mark(v.sortOrder !== current.sort_order, 'sort_order');
    mark(v.section !== current.section, 'section');
    mark(v.subsection !== current.subsection, 'subsection');
    mark(v.division !== current.division, 'division');
    mark(v.year !== (current.year ?? null), 'year');
    mark(v.rank !== (current.rank ?? null), 'rank');
    mark(v.player1 !== (current.player_1 ?? null), 'player_1');
    mark(v.player2 !== (current.player_2 ?? null), 'player_2');
    mark(v.score !== (current.score ?? null), 'score');
    mark(v.note !== (current.note ?? null), 'note');
    mark(v.eventDate !== (current.event_date ?? null), 'event_date');
    mark(v.eventName !== (current.event_name ?? null), 'event_name');
    mark(v.location !== (current.location ?? null), 'location');

    transaction(() => {
      consecutiveKicksRecords.updateForCuration.run(
        v.sortOrder, v.section, v.subsection, v.division, v.year, v.rank,
        v.player1, v.player2, v.score, v.note, v.eventDate, v.eventName, v.location, id,
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

  // Add one new row. Validates the same fields as an edit, generates the id,
  // inserts, and appends one audit entry in a single transaction. Returns the new
  // id so the controller can redirect to its edit page. Throws ValidationError
  // (with per-field messages) on bad input.
  createRow(input: ConsecutiveScalarInput, actorMemberId: string): string {
    assertActorMayCurateFreestyle(actorMemberId);
    const id = randomUUID();
    const v = validateConsecutiveInput(input, id);

    try {
      transaction(() => {
        consecutiveKicksRecords.insertForCuration.run(
          id, v.sortOrder, v.section, v.subsection, v.division, v.year, v.rank,
          v.player1, v.player2, v.score, v.note, v.eventDate, v.eventName, v.location,
        );
        appendAuditEntry({
          actionType:    'freestyle.consecutive_record.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_consecutive_record',
          entityId:      id,
          metadata:      { sortOrder: v.sortOrder, section: v.section, division: v.division },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError('Some fields need attention.', {
          fieldErrors: { sortOrder: `Display position ${v.sortOrder} is already used by another row.` },
        });
      }
      throw err;
    }

    return id;
  },

  // Hard delete one row by its stable id, then append one audit entry, in a single
  // transaction. The audit metadata carries the row's section, division, and
  // display position so the removal is recoverable. Throws NotFoundError for an
  // unknown id.
  deleteRow(id: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const current = consecutiveKicksRecords.getForCurationById.get(id) as ConsecutiveCurationDbRow | undefined;
    if (!current) throw new NotFoundError(`No consecutive-kicks record "${id}"`);

    transaction(() => {
      consecutiveKicksRecords.deleteById.run(id);
      appendAuditEntry({
        actionType:    'freestyle.consecutive_record.deleted',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_consecutive_record',
        entityId:      id,
        metadata:      {
          sortOrder: current.sort_order,
          section:   current.section,
          division:  current.division,
          player1:   current.player_1,
          score:     current.score,
        },
      });
    });
  },
};

interface ValidatedConsecutive {
  sortOrder: number;
  section: string;
  subsection: string;
  division: string;
  year: string | null;
  rank: number | null;
  player1: string | null;
  player2: string | null;
  score: number | null;
  note: string | null;
  eventDate: string | null;
  eventName: string | null;
  location: string | null;
}

// Shared field-shape validation for a consecutive-kicks create or edit. `selfId` is
// the row's own id, so a display position it already holds is not counted as a
// collision against another row. Throws ValidationError with per-field messages;
// returns the normalized, typed values.
function validateConsecutiveInput(input: ConsecutiveScalarInput, selfId: string): ValidatedConsecutive {
  const fieldErrors: Record<string, string> = {};

  const section = (input.section ?? '').trim();
  if (!section) fieldErrors.section = 'Section is required.';
  const subsection = (input.subsection ?? '').trim();
  if (!subsection) fieldErrors.subsection = 'Subsection is required.';
  const division = (input.division ?? '').trim();
  if (!division) fieldErrors.division = 'Division is required.';

  const sortRaw = (input.sortOrder ?? '').trim();
  let sortOrder = 0;
  if (!/^\d+$/.test(sortRaw) || parseInt(sortRaw, 10) < 1) {
    fieldErrors.sortOrder = 'Display position must be a whole number of 1 or more.';
  } else {
    sortOrder = parseInt(sortRaw, 10);
    const holder = consecutiveKicksRecords.getIdBySortOrder.get(sortOrder) as { id: string } | undefined;
    if (holder && holder.id !== selfId) {
      fieldErrors.sortOrder = `Display position ${sortOrder} is already used by another row.`;
    }
  }

  const rank = wholeOrNull(input.rank, 'rank', 'Rank', fieldErrors);
  const score = wholeOrNull(input.score, 'score', 'Score', fieldErrors);

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Some fields need attention.', { fieldErrors });
  }

  return {
    sortOrder,
    section,
    subsection,
    division,
    year:      emptyToNull(input.year),
    rank,
    player1:   emptyToNull(input.player1),
    player2:   emptyToNull(input.player2),
    score,
    note:      emptyToNull(input.note),
    eventDate: emptyToNull(input.eventDate),
    eventName: emptyToNull(input.eventName),
    location:  emptyToNull(input.location),
  };
}

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
