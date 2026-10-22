/**
 * FreestyleRecordCurationService -- admin-facing curation of freestyle world-record rows.
 *
 * Owns:
 *   - The admin browse of freestyle_records: listing every record regardless of
 *     confidence or superseded state (an admin curates provisional, disputed, and
 *     retired rows the public records page hides), with the resolved holder name,
 *     searchable by holder name and trick name and filterable by record type.
 *   - The admin edit surface for one record: rendering its editable fields and
 *     saving edits to the record row.
 *   - The admin new-record surface: rendering the create form and inserting a new
 *     record row with a generated id and the same field validation as an edit.
 *
 * Does not own:
 *   - The public freestyle records pages (FreestyleService is public, read-only).
 *   - The historical_persons registry (a linked person is referenced by id, never
 *     created here) or the trick dictionary.
 *   - Deleting records: a beaten record is retired by pointing its superseded-by at
 *     the newer record, and a questionable one is marked by its confidence rating;
 *     there is no hard delete on this surface.
 *
 * Write discipline: updateRecord validates the submitted fields (record type one of
 * the existing types, source required, at least one of a linked person id or a free
 * text name present, a linked person id references a real historical person, date
 * precision and confidence within the column's allowed values, achieved date empty or
 * a real calendar day in 1970 or later that claims no more than its precision (the
 * first of the month for month precision, the first of January for year precision),
 * adds count an integer or empty, numeric value a number or empty, and a
 * superseded-by that references a real record other than the row itself). Every
 * free-text field (holder name, trick and sort names, value text, source, video
 * timecode, notes) is cleaned with the shared write-time text sanitizer before those
 * checks run, and the changed-field list and the own-repeat check compare cleaned
 * values. The
 * update and its one audit entry commit together in a single transaction; the record
 * id is not editable. createRecord runs that same field validation, generates the new
 * record id, inserts the row, and commits with its own audit entry in one transaction.
 * Every write path first runs the pre-go-live persona guard, so a
 * seeded test persona cannot author record content in a developer checkout; in staging
 * and production the guard is a no-op and the admin remains the audit actor.
 *
 * Persistence: reads and writes freestyle_records; reads historical_persons to
 * validate and name a linked person. Appends freestyle.record.updated and
 * freestyle.record.created to audit_entries.
 */
import { randomUUID } from 'node:crypto';
import { freestyleRecords, historicalPersonLookup, transaction } from '../db/db';
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

interface FilterOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface FreestyleRecordBrowseRow {
  id: string;
  recordType: string;
  holderName: string;
  trickName: string;
  value: string;
  confidence: string;
  statusLabel: string;
  editHref: string;
}

export interface FreestyleRecordBrowseContent {
  rows: FreestyleRecordBrowseRow[];
  totalCount: number;
  hasRows: boolean;
  filters: FreestyleRecordBrowseFilters;
}

/** The browse filters an admin submits: free text plus the record-type select. */
export interface FreestyleRecordBrowseFilterInput {
  query?: string;
  recordType?: string;
}

export interface FreestyleRecordBrowseFilters {
  query: string;
  recordTypeOptions: FilterOption[];
  isFiltered: boolean;
}

export interface FreestyleRecordEditFields {
  recordType: string;
  personId: string;
  displayName: string;
  trickName: string;
  sortName: string;
  addsCount: string;
  valueNumeric: string;
  valueText: string;
  achievedDate: string;
  datePrecision: string;
  source: string;
  confidence: string;
  videoUrl: string;
  videoTimecode: string;
  notes: string;
  supersededBy: string;
}

export interface FreestyleRecordEditContent {
  id: string;
  isNew: boolean;
  formAction: string;
  fields: FreestyleRecordEditFields;
  recordTypeOptions: FilterOption[];
  datePrecisionOptions: FilterOption[];
  confidenceOptions: FilterOption[];
  holderName: string;
  backHref: string;
  saved: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

/** The editable record fields submitted by the edit form. */
export interface FreestyleRecordScalarInput {
  recordType?: string;
  personId?: string;
  displayName?: string;
  trickName?: string;
  sortName?: string;
  addsCount?: string;
  valueNumeric?: string;
  valueText?: string;
  achievedDate?: string;
  datePrecision?: string;
  source?: string;
  confidence?: string;
  videoUrl?: string;
  videoTimecode?: string;
  notes?: string;
  supersededBy?: string;
}

/** Options for re-rendering the edit page after a save or a validation failure. */
export interface RecordEditPageOptions {
  saved?: boolean;
  submitted?: FreestyleRecordScalarInput;
  fieldErrors?: Record<string, string>;
}

interface RecordCurationDbRow {
  id: string;
  record_type: string;
  person_id: string | null;
  display_name: string | null;
  trick_name: string | null;
  sort_name: string | null;
  adds_count: number | null;
  value_numeric: number | null;
  value_text: string | null;
  achieved_date: string | null;
  date_precision: string;
  source: string;
  confidence: string;
  video_url: string | null;
  video_timecode: string | null;
  notes: string | null;
  superseded_by: string | null;
}
interface RecordBrowseDbRow {
  id: string;
  record_type: string;
  holder_name: string | null;
  trick_name: string | null;
  value_numeric: number | null;
  confidence: string;
  superseded_by: string | null;
}

// The confidence and date-precision values the freestyle_records column CHECK
// constraints allow; the admin edit form offers exactly these.
const CONFIDENCE_VALUES = ['verified', 'probable', 'provisional', 'disputed'];
const DATE_PRECISION_VALUES = ['day', 'month', 'year', 'approximate'];
const ISO_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
// Footbag did not exist before 1970, so an earlier year is a placeholder rather
// than an achievement date; the public pages already show such a date as unknown.
const EARLIEST_RECORD_YEAR = 1970;

/**
 * Why this achieved date cannot be stored at this precision, or null when it can.
 * The date must be a real calendar day, checked by a UTC round trip so a day the
 * month does not have is refused rather than rolled into the next month. A date
 * known only to the month is stored as the first of that month and one known only
 * to the year as the first of January, so the stored day never claims more than
 * the precision does. `precision` is null when it is itself invalid, and then
 * only the date's own shape is judged.
 */
function achievedDateProblem(iso: string, precision: string | null): string | null {
  if (!ISO_DAY_RE.test(iso)) return 'Achieved date must be empty or a YYYY-MM-DD date.';
  const [year, month, day] = iso.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return 'Achieved date is not a real calendar date.';
  }
  if (year < EARLIEST_RECORD_YEAR) {
    return `Achieved date must be in ${EARLIEST_RECORD_YEAR} or later.`;
  }
  if (precision === 'month' && day !== 1) {
    return 'A date known only to the month is entered as the first of that month (YYYY-MM-01).';
  }
  if (precision === 'year' && (month !== 1 || day !== 1)) {
    return 'A date known only to the year is entered as the first of January (YYYY-01-01).';
  }
  return null;
}

// One typed record field, cleaned before its own checks run. Unreadable text is
// recorded beside the form's other field errors and reads as empty.
function cleanRecordText(
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

// A stored record value read the way a cleaned submission is, so a value stored
// before cleaning existed is not mistaken for a change. Empty reads as null.
function comparableStored(stored: string | null, shape: TextShape): string | null {
  const result = sanitizeUserText(stored ?? '', shape);
  const text = result.status === 'ok' ? result.text : (stored ?? '');
  return text === '' ? null : text;
}

function allowedRecordTypes(): string[] {
  return (freestyleRecords.listDistinctRecordTypes.all() as { record_type: string }[]).map((r) => r.record_type);
}

// Pre-go-live guardrail, parallel to the trick-curation and curated-media ones: a
// seeded test persona must never author record content where a curator write touches
// the committed pre-go-live source of truth in a developer checkout. A no-op in
// staging and production; the admin remains the audit actor of record.
function assertActorMayCurateFreestyle(actorMemberId: string): void {
  if (config.allowCuratedSidecarWrites && isSeededTestPersonaMemberId(actorMemberId)) {
    throw new ForbiddenError(
      'Freestyle records cannot be edited by a test persona in a pre-go-live developer checkout.',
    );
  }
}

function options(values: string[], selected: string): FilterOption[] {
  return values.map((v) => ({ value: v, label: v, selected: v === selected }));
}

function numOrEmpty(value: number | null): string {
  return value === null || value === undefined ? '' : String(value);
}

export const freestyleRecordCurationService = {
  // Browse every record, narrowed by an optional free-text match over the holder
  // name and the trick name, and by an optional record-type select. The holder
  // name matched is the resolved one, so a record linked to a historical person
  // is found by that person's registry name rather than only by the free-text
  // name the row carries. An unrecognised record type is treated as no filter,
  // so a hand-edited query string cannot empty the browse without saying why.
  getRecordBrowsePage(filter: FreestyleRecordBrowseFilterInput = {}): PageViewModel<FreestyleRecordBrowseContent> {
    const query = (filter.query ?? '').trim();
    const recordTypes = allowedRecordTypes();
    const typeFilter = recordTypes.includes(filter.recordType ?? '') ? (filter.recordType as string) : '';

    const needle = query.toLowerCase();
    const rows = (freestyleRecords.listForCuration.all() as RecordBrowseDbRow[])
      .filter((r) => {
        if (typeFilter && r.record_type !== typeFilter) return false;
        if (needle) {
          const holder = (r.holder_name ?? '').toLowerCase();
          const trick  = (r.trick_name ?? '').toLowerCase();
          if (!holder.includes(needle) && !trick.includes(needle)) return false;
        }
        return true;
      })
      .map((r) => ({
        id:          r.id,
        recordType:  r.record_type,
        holderName:  r.holder_name ?? '',
        trickName:   r.trick_name ?? '',
        value:       numOrEmpty(r.value_numeric),
        confidence:  r.confidence,
        statusLabel: r.superseded_by ? 'Superseded' : 'Current',
        editHref:    `/admin/freestyle/records/${r.id}/edit`,
      }));

    const recordTypeOptions: FilterOption[] = [
      { value: '', label: 'Any Record Type', selected: typeFilter === '' },
      ...recordTypes.map((t) => ({ value: t, label: t, selected: t === typeFilter })),
    ];

    return {
      seo:  { title: 'Freestyle Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_records', title: 'Freestyle Records' },
      content: {
        rows,
        totalCount: rows.length,
        hasRows: rows.length > 0,
        filters: {
          query,
          recordTypeOptions,
          isFiltered: query !== '' || typeFilter !== '',
        },
      },
    };
  },

  // Edit page for one record. Returns null when the id has no row (the controller
  // maps null to 404). `opts` re-renders the form after a save (saved banner) or a
  // validation failure (the admin's submitted values plus per-field errors).
  getRecordEditPage(id: string, opts: RecordEditPageOptions = {}): PageViewModel<FreestyleRecordEditContent> | null {
    const row = freestyleRecords.getForCurationById.get(id) as RecordCurationDbRow | undefined;
    if (!row) return null;

    const sub = opts.submitted;
    const fields: FreestyleRecordEditFields = {
      recordType:    sub ? (sub.recordType ?? '') : row.record_type,
      personId:      sub ? (sub.personId ?? '') : (row.person_id ?? ''),
      displayName:   sub ? (sub.displayName ?? '') : (row.display_name ?? ''),
      trickName:     sub ? (sub.trickName ?? '') : (row.trick_name ?? ''),
      sortName:      sub ? (sub.sortName ?? '') : (row.sort_name ?? ''),
      addsCount:     sub ? (sub.addsCount ?? '') : numOrEmpty(row.adds_count),
      valueNumeric:  sub ? (sub.valueNumeric ?? '') : numOrEmpty(row.value_numeric),
      valueText:     sub ? (sub.valueText ?? '') : (row.value_text ?? ''),
      achievedDate:  sub ? (sub.achievedDate ?? '') : (row.achieved_date ?? ''),
      datePrecision: sub ? (sub.datePrecision ?? '') : row.date_precision,
      source:        sub ? (sub.source ?? '') : row.source,
      confidence:    sub ? (sub.confidence ?? '') : row.confidence,
      videoUrl:      sub ? (sub.videoUrl ?? '') : (row.video_url ?? ''),
      videoTimecode: sub ? (sub.videoTimecode ?? '') : (row.video_timecode ?? ''),
      notes:         sub ? (sub.notes ?? '') : (row.notes ?? ''),
      supersededBy:  sub ? (sub.supersededBy ?? '') : (row.superseded_by ?? ''),
    };

    const holderName = row.person_id
      ? ((historicalPersonLookup.personNameById.get(row.person_id) as { person_name: string } | undefined)?.person_name ?? '')
      : (row.display_name ?? '');

    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);

    return {
      seo:  { title: 'Freestyle Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_record_edit', title: row.trick_name ?? 'Record' },
      content: {
        id: row.id,
        isNew: false,
        formAction: `/admin/freestyle/records/${row.id}/edit`,
        fields,
        recordTypeOptions:    options(allowedRecordTypes(), fields.recordType),
        datePrecisionOptions: options(DATE_PRECISION_VALUES, fields.datePrecision),
        confidenceOptions:    options(CONFIDENCE_VALUES, fields.confidence),
        holderName,
        backHref:  '/admin/freestyle/records',
        saved:     opts.saved === true,
        fieldErrors,
        errorList,
        hasErrors: errorList.length > 0,
      },
    };
  },

  // The blank new-record form: the same edit template with default field values
  // and its post target pointing at the create route. `opts` re-renders the form
  // with the admin's submitted values and per-field errors on a failed create.
  getRecordNewPage(opts: RecordEditPageOptions = {}): PageViewModel<FreestyleRecordEditContent> {
    const sub = opts.submitted;
    const recordTypes = allowedRecordTypes();
    const fields: FreestyleRecordEditFields = {
      recordType:    sub ? (sub.recordType ?? '') : (recordTypes[0] ?? ''),
      personId:      sub?.personId ?? '',
      displayName:   sub?.displayName ?? '',
      trickName:     sub?.trickName ?? '',
      sortName:      sub?.sortName ?? '',
      addsCount:     sub?.addsCount ?? '',
      valueNumeric:  sub?.valueNumeric ?? '',
      valueText:     sub?.valueText ?? '',
      achievedDate:  sub?.achievedDate ?? '',
      datePrecision: sub ? (sub.datePrecision ?? '') : 'day',
      source:        sub?.source ?? '',
      confidence:    sub ? (sub.confidence ?? '') : 'probable',
      videoUrl:      sub?.videoUrl ?? '',
      videoTimecode: sub?.videoTimecode ?? '',
      notes:         sub?.notes ?? '',
      supersededBy:  sub?.supersededBy ?? '',
    };

    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);

    return {
      seo:  { title: 'Freestyle Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_record_new', title: 'New Record' },
      content: {
        id: '',
        isNew: true,
        formAction: '/admin/freestyle/records',
        fields,
        recordTypeOptions:    options(recordTypes, fields.recordType),
        datePrecisionOptions: options(DATE_PRECISION_VALUES, fields.datePrecision),
        confidenceOptions:    options(CONFIDENCE_VALUES, fields.confidence),
        holderName: '',
        backHref:  '/admin/freestyle/records',
        saved:     false,
        fieldErrors,
        errorList,
        hasErrors: errorList.length > 0,
      },
    };
  },

  // Update one record's editable fields, then append one audit entry, in a single
  // transaction. Throws NotFoundError for an unknown id and ValidationError (with
  // per-field messages) on bad input.
  updateRecord(id: string, input: FreestyleRecordScalarInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const current = freestyleRecords.getForCurationById.get(id) as RecordCurationDbRow | undefined;
    if (!current) throw new NotFoundError(`No freestyle record "${id}"`);

    const v = validateRecordInput(input, id);

    const changedFields: string[] = [];
    const mark = (changed: boolean, name: string) => { if (changed) changedFields.push(name); };
    mark(v.recordType !== current.record_type, 'record_type');
    mark(v.personId !== (current.person_id ?? null), 'person_id');
    // Cleaned text fields compare against the stored value passed through the same
    // cleaner, so a value stored before cleaning existed is not reported as edited.
    mark(v.displayName !== comparableStored(current.display_name, 'single_line'), 'display_name');
    mark(v.trickName !== comparableStored(current.trick_name, 'single_line'), 'trick_name');
    mark(v.sortName !== comparableStored(current.sort_name, 'single_line'), 'sort_name');
    mark(v.addsCount !== (current.adds_count ?? null), 'adds_count');
    mark(v.valueNumeric !== (current.value_numeric ?? null), 'value_numeric');
    mark(v.valueText !== comparableStored(current.value_text, 'single_line'), 'value_text');
    mark(v.achievedDate !== (current.achieved_date ?? null), 'achieved_date');
    mark(v.datePrecision !== current.date_precision, 'date_precision');
    mark(v.source !== comparableStored(current.source, 'single_line'), 'source');
    mark(v.confidence !== current.confidence, 'confidence');
    mark(v.videoUrl !== (current.video_url ?? null), 'video_url');
    mark(v.videoTimecode !== comparableStored(current.video_timecode, 'single_line'), 'video_timecode');
    mark(v.notes !== comparableStored(current.notes, 'multi_line'), 'notes');
    mark(v.supersededBy !== (current.superseded_by ?? null), 'superseded_by');

    transaction(() => {
      freestyleRecords.updateForCuration.run(
        v.recordType, v.personId, v.displayName, v.trickName, v.sortName, v.addsCount,
        v.valueNumeric, v.valueText, v.achievedDate, v.datePrecision, v.source, v.confidence,
        v.videoUrl, v.videoTimecode, v.notes, v.supersededBy, id,
      );
      appendAuditEntry({
        actionType:    'freestyle.record.updated',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_record',
        entityId:      id,
        metadata:      { changedFields },
      });
    });
  },

  // Add one new record. Validates the same fields as an edit, generates the id,
  // inserts, and appends one audit entry in a single transaction. Returns the new
  // id so the controller can redirect to its edit page. Throws ValidationError
  // (with per-field messages) on bad input.
  createRecord(input: FreestyleRecordScalarInput, actorMemberId: string): string {
    assertActorMayCurateFreestyle(actorMemberId);
    const id = randomUUID();
    const v = validateRecordInput(input, id);
    // A repeat of this actor's own create, with every field the same, returns the
    // record that create made. Another actor's identical record is not a repeat.
    const ownRecordId = ownIdenticalCreatedRecordId(v, actorMemberId);
    if (ownRecordId !== null) return ownRecordId;

    transaction(() => {
      freestyleRecords.insertForCuration.run(
        id, v.recordType, v.personId, v.displayName, v.trickName, v.sortName, v.addsCount,
        v.valueNumeric, v.valueText, v.achievedDate, v.datePrecision, v.source, v.confidence,
        v.videoUrl, v.videoTimecode, v.notes, v.supersededBy,
      );
      appendAuditEntry({
        actionType:    'freestyle.record.created',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_record',
        entityId:      id,
        metadata:      { recordType: v.recordType, trickName: v.trickName, holder: v.personId ?? v.displayName },
      });
    });

    return id;
  },
};

/** The id of a record this actor created whose stored values equal every field of
 *  the submitted create, or null. */
function ownIdenticalCreatedRecordId(v: ValidatedRecord, actorMemberId: string): string | null {
  const matches = freestyleRecords.findIdenticalForCuration.all(
    v.recordType, v.personId, v.displayName, v.trickName, v.sortName, v.addsCount,
    v.valueNumeric, v.valueText, v.achievedDate, v.datePrecision, v.source, v.confidence,
    v.videoUrl, v.videoTimecode, v.notes, v.supersededBy,
  ) as { id: string }[];
  for (const match of matches) {
    if (findOwnLatestAudit(actorMemberId, 'freestyle.record.created', 'freestyle_record', match.id)) {
      return match.id;
    }
  }
  return null;
}

interface ValidatedRecord {
  recordType: string;
  personId: string | null;
  displayName: string | null;
  trickName: string | null;
  sortName: string | null;
  addsCount: number | null;
  valueNumeric: number | null;
  valueText: string | null;
  achievedDate: string | null;
  datePrecision: string;
  source: string;
  confidence: string;
  videoUrl: string | null;
  videoTimecode: string | null;
  notes: string | null;
  supersededBy: string | null;
}

// Shared field-shape validation for a record create or edit. `selfId` is the row's
// own id, so a superseded-by pointing at the row itself is rejected. Throws
// ValidationError with per-field messages; returns the normalized, typed values.
function validateRecordInput(input: FreestyleRecordScalarInput, selfId: string): ValidatedRecord {
  const fieldErrors: Record<string, string> = {};

  const recordType = (input.recordType ?? '').trim();
  if (!recordType) {
    fieldErrors.recordType = 'Record type is required.';
  } else if (!allowedRecordTypes().includes(recordType)) {
    fieldErrors.recordType = 'Record type must be one of the existing record types.';
  }

  // Every free-text field is cleaned first, so the required checks below and the
  // caller's own-repeat check judge what will be stored.
  const text = (raw: string | undefined, shape: TextShape, field: string): string | null => {
    const cleaned = cleanRecordText(raw, shape, field, fieldErrors);
    return cleaned === '' ? null : cleaned;
  };
  const source        = text(input.source, 'single_line', 'source') ?? '';
  const displayName   = text(input.displayName, 'single_line', 'displayName');
  const trickName     = text(input.trickName, 'single_line', 'trickName');
  const sortName      = text(input.sortName, 'single_line', 'sortName');
  const valueText     = text(input.valueText, 'single_line', 'valueText');
  const videoTimecode = text(input.videoTimecode, 'single_line', 'videoTimecode');
  const notes         = text(input.notes, 'multi_line', 'notes');

  if (!source && !fieldErrors.source) fieldErrors.source = 'Source is required.';

  const personId = emptyToNull(input.personId);
  if (personId === null && displayName === null && !fieldErrors.displayName) {
    fieldErrors.displayName = 'A record needs a linked person id or a display name.';
  }
  if (personId !== null && !historicalPersonLookup.personNameById.get(personId)) {
    fieldErrors.personId = 'No historical person has that id.';
  }

  const datePrecision = (input.datePrecision ?? '').trim();
  if (!DATE_PRECISION_VALUES.includes(datePrecision)) {
    fieldErrors.datePrecision = 'Date precision must be day, month, year, or approximate.';
  }

  const achievedDate = emptyToNull(input.achievedDate);
  if (achievedDate !== null) {
    const problem = achievedDateProblem(
      achievedDate, DATE_PRECISION_VALUES.includes(datePrecision) ? datePrecision : null);
    if (problem) fieldErrors.achievedDate = problem;
  }

  const confidence = (input.confidence ?? '').trim();
  if (!CONFIDENCE_VALUES.includes(confidence)) {
    fieldErrors.confidence = 'Confidence must be verified, probable, provisional, or disputed.';
  }

  const addsRaw = (input.addsCount ?? '').trim();
  if (addsRaw !== '' && !/^\d+$/.test(addsRaw)) {
    fieldErrors.addsCount = 'Adds count must be empty or a whole number.';
  }
  const addsCount = addsRaw === '' ? null : parseInt(addsRaw, 10);

  const valueRaw = (input.valueNumeric ?? '').trim();
  if (valueRaw !== '' && !Number.isFinite(Number(valueRaw))) {
    fieldErrors.valueNumeric = 'Value must be empty or a number.';
  }
  const valueNumeric = valueRaw === '' ? null : Number(valueRaw);

  const supersededBy = emptyToNull(input.supersededBy);
  if (supersededBy !== null) {
    if (supersededBy === selfId) {
      fieldErrors.supersededBy = 'A record cannot supersede itself.';
    } else if (!freestyleRecords.getForCurationById.get(supersededBy)) {
      fieldErrors.supersededBy = 'No record has that id.';
    }
  }

  if (Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Some fields need attention.', { fieldErrors });
  }

  return {
    recordType,
    personId,
    displayName,
    trickName,
    sortName,
    addsCount,
    valueNumeric,
    valueText,
    achievedDate,
    datePrecision,
    source,
    confidence,
    videoUrl:      emptyToNull(input.videoUrl),
    videoTimecode,
    notes,
    supersededBy,
  };
}

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
