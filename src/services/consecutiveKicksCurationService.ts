/**
 * ConsecutiveKicksCurationService -- admin-facing curation of consecutive-kicks records.
 *
 * Owns:
 *   - The admin browse of consecutive_kicks_records, grouped by section and then
 *     discipline, with a link to edit each row.
 *   - The admin edit surface for one row: rendering its editable fields and saving
 *     edits, keyed on the row's stable surrogate id (not its mutable display
 *     position).
 *   - Adding a row and removing one, the removal a hard delete by that same id.
 *
 * Does not own:
 *   - The public records pages (RecordsService is public, read-only).
 *
 * Write discipline: updateRow validates the submitted fields (section, subsection,
 * and discipline required; score and rank each empty or a whole number; the display
 * position a unique positive whole number, checked against the other rows before
 * the write with the column's UNIQUE constraint as the backstop). Every free-text
 * field is cleaned with the shared write-time text sanitizer before those checks
 * run (single-line for names, labels and dates, multi-line for the note), and the
 * changed-field list and the own-repeat check compare cleaned values. The update and
 * its one audit entry commit together in a single transaction; the id is not
 * editable. Every write path first runs the pre-go-live persona guard, so a seeded
 * test persona cannot author record content in a developer checkout; in staging and
 * production the guard is a no-op and the admin remains the audit actor.
 *
 * Persistence: reads and writes consecutive_kicks_records. Appends
 * freestyle.consecutive_record.created, .updated and .deleted to audit_entries.
 */
import { randomUUID } from 'node:crypto';
import { consecutiveKicksRecords, transaction } from '../db/db';
import { appendAuditEntry, findOwnLatestAudit } from './auditService';
import { ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { config } from '../config/env';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';
import {
  sanitizeUserText,
  INVALID_TEXT_ENCODING_MESSAGE,
  type TextShape,
} from '../lib/textSanitizer';

// One typed field, cleaned before its own checks run. Unreadable text is recorded
// beside the form's other field errors and reads as empty.
function cleanRowText(
  raw: string | undefined,
  shape: TextShape,
  field: string,
  fieldErrors: Record<string, string>,
): string {
  const result = sanitizeUserText(raw ?? '', shape);
  if (result.status === 'invalid_encoding') {
    fieldErrors[field] = INVALID_TEXT_ENCODING_MESSAGE;
    return '';
  }
  return result.text;
}

// A stored value read the way a cleaned submission is, so a value stored before
// cleaning existed is not mistaken for a change. Empty reads as null.
function comparableStored(stored: string | null, shape: TextShape): string | null {
  const result = sanitizeUserText(stored ?? '', shape);
  const text = result.status === 'ok' ? result.text : (stored ?? '');
  return text === '' ? null : text;
}

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
export interface ConsecutiveDisciplineGroup {
  discipline: string;
  rows: ConsecutiveBrowseRow[];
}
export interface ConsecutiveSectionGroup {
  section: string;
  disciplines: ConsecutiveDisciplineGroup[];
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
  discipline: string;
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

/** The confirm step before a row is deleted: what will go, and the two ways out. */
export interface ConsecutiveDeleteConfirmContent {
  id: string;
  summary: { label: string; value: string }[];
  deleteHref: string;
  cancelHref: string;
}

/** The editable fields submitted by the edit form. */
export interface ConsecutiveScalarInput {
  sortOrder?: string;
  section?: string;
  subsection?: string;
  discipline?: string;
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
  discipline: string;
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

    // Group by section, then by discipline, preserving the sort_order ordering the
    // query already applied.
    const sections: ConsecutiveSectionGroup[] = [];
    const sectionIndex = new Map<string, ConsecutiveSectionGroup>();
    for (const r of rows) {
      let section = sectionIndex.get(r.section);
      if (!section) {
        section = { section: r.section, disciplines: [] };
        sectionIndex.set(r.section, section);
        sections.push(section);
      }
      let discipline = section.disciplines.find((d) => d.discipline === r.discipline);
      if (!discipline) {
        discipline = { discipline: r.discipline, rows: [] };
        section.disciplines.push(discipline);
      }
      discipline.rows.push({
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
      discipline:   sub ? (sub.discipline ?? '') : row.discipline,
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
      page: { sectionKey: 'admin', pageKey: 'admin_consecutive_record_edit', title: 'Edit Consecutive-kicks Record' },
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

  // The confirm page shown before a row is deleted. A deletion cannot be undone, so
  // the admin sees which row it is before the final button. Returns null when the
  // id has no row (the controller maps null to 404).
  getDeleteConfirmPage(id: string): PageViewModel<ConsecutiveDeleteConfirmContent> | null {
    const row = consecutiveKicksRecords.getForCurationById.get(id) as ConsecutiveCurationDbRow | undefined;
    if (!row) return null;

    const players = [row.player_1, row.player_2].filter((p): p is string => !!p).join(' and ');
    const summary = [
      { label: 'Discipline', value: row.discipline },
      { label: 'Year',     value: row.year ?? '' },
      { label: 'Players',  value: players },
      { label: 'Score',    value: numOrEmpty(row.score) },
    ].filter(f => f.value !== '');

    return {
      seo:  { title: 'Consecutive Kicks Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_consecutive_record_delete', title: 'Delete Consecutive-kicks Record' },
      content: {
        id: row.id,
        summary,
        deleteHref: `/admin/freestyle/consecutive-records/${row.id}/delete`,
        cancelHref: `/admin/freestyle/consecutive-records/${row.id}/edit`,
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
      discipline:   sub?.discipline ?? '',
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
      page: { sectionKey: 'admin', pageKey: 'admin_consecutive_record_new', title: 'New Consecutive-kicks Record' },
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
    // Cleaned text fields compare against the stored value passed through the same
    // cleaner, so a value stored before cleaning existed is not reported as edited.
    mark(v.section !== comparableStored(current.section, 'single_line'), 'section');
    mark(v.subsection !== comparableStored(current.subsection, 'single_line'), 'subsection');
    mark(v.discipline !== comparableStored(current.discipline, 'single_line'), 'discipline');
    mark(v.year !== comparableStored(current.year, 'single_line'), 'year');
    mark(v.rank !== (current.rank ?? null), 'rank');
    mark(v.player1 !== comparableStored(current.player_1, 'single_line'), 'player_1');
    mark(v.player2 !== comparableStored(current.player_2, 'single_line'), 'player_2');
    mark(v.score !== (current.score ?? null), 'score');
    mark(v.note !== comparableStored(current.note, 'multi_line'), 'note');
    mark(v.eventDate !== comparableStored(current.event_date, 'single_line'), 'event_date');
    mark(v.eventName !== comparableStored(current.event_name, 'single_line'), 'event_name');
    mark(v.location !== comparableStored(current.location, 'single_line'), 'location');

    transaction(() => {
      consecutiveKicksRecords.updateForCuration.run(
        v.sortOrder, v.section, v.subsection, v.discipline, v.year, v.rank,
        v.player1, v.player2, v.score, v.note, v.eventDate, v.eventName, v.location, id,
      );
      appendAuditEntry({
        actionType:    'freestyle.consecutive_record.updated',
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
    // A repeat of this actor's own create returns the row that create made.
    const ownRowId = ownIdenticalCreatedRowId(input, actorMemberId);
    if (ownRowId !== null) return ownRowId;
    const id = randomUUID();
    const v = validateConsecutiveInput(input, id);

    try {
      transaction(() => {
        consecutiveKicksRecords.insertForCuration.run(
          id, v.sortOrder, v.section, v.subsection, v.discipline, v.year, v.rank,
          v.player1, v.player2, v.score, v.note, v.eventDate, v.eventName, v.location,
        );
        appendAuditEntry({
          actionType:    'freestyle.consecutive_record.created',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_consecutive_record',
          entityId:      id,
          metadata:      { sortOrder: v.sortOrder, section: v.section, discipline: v.discipline },
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
  // transaction. The audit metadata carries the row's section, discipline, and
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
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_consecutive_record',
        entityId:      id,
        metadata:      {
          sortOrder: current.sort_order,
          section:   current.section,
          discipline:  current.discipline,
          player1:   current.player_1,
          score:     current.score,
        },
      });
    });
  },
};

/**
 * The id of the row this actor's own create made at the submitted display
 * position, when every submitted field matches that row; null otherwise. A
 * different actor's row, or any different value, is not a repeat and is refused
 * by the normal create path.
 */
function ownIdenticalCreatedRowId(
  input: ConsecutiveScalarInput,
  actorMemberId: string,
): string | null {
  const sortRaw = (input.sortOrder ?? '').trim();
  if (!/^\d+$/.test(sortRaw) || parseInt(sortRaw, 10) < 1) return null;
  const holder = consecutiveKicksRecords.getIdBySortOrder.get(parseInt(sortRaw, 10)) as
    | { id: string }
    | undefined;
  if (!holder) return null;
  const ownCreate = findOwnLatestAudit(
    actorMemberId, 'freestyle.consecutive_record.created', 'freestyle_consecutive_record', holder.id,
  );
  if (!ownCreate) return null;
  let v: ValidatedConsecutive;
  try {
    v = validateConsecutiveInput(input, holder.id);
  } catch (err) {
    if (err instanceof ValidationError) return null;
    throw err;
  }
  const row = consecutiveKicksRecords.getForCurationById.get(holder.id) as {
    sort_order: number; section: string; subsection: string; discipline: string;
    year: string | null; rank: number | null; player_1: string | null; player_2: string | null;
    score: number | null; note: string | null; event_date: string | null;
    event_name: string | null; location: string | null;
  };
  const identical = row.sort_order === v.sortOrder
    && row.section === v.section
    && row.subsection === v.subsection
    && row.discipline === v.discipline
    && row.year === v.year
    && row.rank === v.rank
    && row.player_1 === v.player1
    && row.player_2 === v.player2
    && row.score === v.score
    && row.note === v.note
    && row.event_date === v.eventDate
    && row.event_name === v.eventName
    && row.location === v.location;
  return identical ? holder.id : null;
}

interface ValidatedConsecutive {
  sortOrder: number;
  section: string;
  subsection: string;
  discipline: string;
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

  // Every free-text field is cleaned first, so the required checks below and the
  // own-repeat check judge what will be stored.
  const text = (raw: string | undefined, shape: TextShape, field: string): string | null => {
    const cleaned = cleanRowText(raw, shape, field, fieldErrors);
    return cleaned === '' ? null : cleaned;
  };
  const section    = text(input.section, 'single_line', 'section') ?? '';
  const subsection = text(input.subsection, 'single_line', 'subsection') ?? '';
  const discipline = text(input.discipline, 'single_line', 'discipline') ?? '';
  const year       = text(input.year, 'single_line', 'year');
  const player1    = text(input.player1, 'single_line', 'player1');
  const player2    = text(input.player2, 'single_line', 'player2');
  const note       = text(input.note, 'multi_line', 'note');
  const eventDate  = text(input.eventDate, 'single_line', 'eventDate');
  const eventName  = text(input.eventName, 'single_line', 'eventName');
  const location   = text(input.location, 'single_line', 'location');

  if (!section && !fieldErrors.section) fieldErrors.section = 'Section is required.';
  if (!subsection && !fieldErrors.subsection) fieldErrors.subsection = 'Subsection is required.';
  if (!discipline && !fieldErrors.discipline) fieldErrors.discipline = 'Discipline is required.';

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
    discipline,
    year,
    rank,
    player1,
    player2,
    score,
    note,
    eventDate,
    eventName,
    location,
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
