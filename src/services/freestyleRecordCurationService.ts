/**
 * FreestyleRecordCurationService -- admin-facing curation of freestyle world-record rows.
 *
 * Owns:
 *   - The admin browse of freestyle_records: listing every record regardless of
 *     confidence or superseded state (an admin curates provisional, disputed, and
 *     retired rows the public records page hides), with the resolved holder name.
 *   - The admin edit surface for one record: rendering its editable fields and
 *     saving edits to the record row.
 *
 * Does not own:
 *   - The public freestyle records pages (FreestyleService is public, read-only).
 *   - The historical_persons registry (a linked person is referenced by id, never
 *     created here) or the trick dictionary.
 *   - Adding new records (a separate slice) or deleting records: a beaten record is
 *     retired by pointing its superseded-by at the newer record, and a questionable
 *     one is marked by its confidence rating; there is no hard delete on this surface.
 *
 * Write discipline: updateRecord validates the submitted fields (record type one of
 * the existing types, source required, at least one of a linked person id or a free
 * text name present, a linked person id references a real historical person, date
 * precision and confidence within the column's allowed values, achieved date a valid
 * ISO day or empty, adds count an integer or empty, numeric value a number or empty,
 * and a superseded-by that references a real record other than the row itself). The
 * update and its one audit entry commit together in a single transaction; the record
 * id is not editable. Every write path first runs the pre-go-live persona guard, so a
 * seeded test persona cannot author record content in a developer checkout; in staging
 * and production the guard is a no-op and the admin remains the audit actor.
 *
 * Persistence: reads and writes freestyle_records; reads historical_persons to
 * validate and name a linked person. Appends freestyle.record.updated to audit_entries.
 */
import { freestyleRecords, historicalPersonLookup, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { config } from '../config/env';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';

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
  getRecordBrowsePage(): PageViewModel<FreestyleRecordBrowseContent> {
    const rows = (freestyleRecords.listForCuration.all() as RecordBrowseDbRow[]).map((r) => ({
      id:          r.id,
      recordType:  r.record_type,
      holderName:  r.holder_name ?? '',
      trickName:   r.trick_name ?? '',
      value:       numOrEmpty(r.value_numeric),
      confidence:  r.confidence,
      statusLabel: r.superseded_by ? 'Superseded' : 'Current',
      editHref:    `/admin/freestyle/records/${r.id}/edit`,
    }));

    return {
      seo:  { title: 'Freestyle Records' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_records', title: 'Freestyle Records' },
      content: { rows, totalCount: rows.length, hasRows: rows.length > 0 },
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

  // Update one record's editable fields, then append one audit entry, in a single
  // transaction. Throws NotFoundError for an unknown id and ValidationError (with
  // per-field messages) on bad input.
  updateRecord(id: string, input: FreestyleRecordScalarInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const current = freestyleRecords.getForCurationById.get(id) as RecordCurationDbRow | undefined;
    if (!current) throw new NotFoundError(`No freestyle record "${id}"`);

    const fieldErrors: Record<string, string> = {};

    const recordType = (input.recordType ?? '').trim();
    if (!recordType) {
      fieldErrors.recordType = 'Record type is required.';
    } else if (!allowedRecordTypes().includes(recordType)) {
      fieldErrors.recordType = 'Record type must be one of the existing record types.';
    }

    const source = (input.source ?? '').trim();
    if (!source) fieldErrors.source = 'Source is required.';

    const personId = emptyToNull(input.personId);
    const displayName = emptyToNull(input.displayName);
    if (personId === null && displayName === null) {
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
    if (achievedDate !== null && !ISO_DAY_RE.test(achievedDate)) {
      fieldErrors.achievedDate = 'Achieved date must be empty or a YYYY-MM-DD date.';
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
      if (supersededBy === id) {
        fieldErrors.supersededBy = 'A record cannot supersede itself.';
      } else if (!freestyleRecords.getForCurationById.get(supersededBy)) {
        fieldErrors.supersededBy = 'No record has that id.';
      }
    }

    const valueText = emptyToNull(input.valueText);
    const trickName = emptyToNull(input.trickName);
    const sortName = emptyToNull(input.sortName);
    const videoUrl = emptyToNull(input.videoUrl);
    const videoTimecode = emptyToNull(input.videoTimecode);
    const notes = emptyToNull(input.notes);

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }

    const changedFields: string[] = [];
    const mark = (changed: boolean, name: string) => { if (changed) changedFields.push(name); };
    mark(recordType !== current.record_type, 'record_type');
    mark(personId !== (current.person_id ?? null), 'person_id');
    mark(displayName !== (current.display_name ?? null), 'display_name');
    mark(trickName !== (current.trick_name ?? null), 'trick_name');
    mark(sortName !== (current.sort_name ?? null), 'sort_name');
    mark(addsCount !== (current.adds_count ?? null), 'adds_count');
    mark(valueNumeric !== (current.value_numeric ?? null), 'value_numeric');
    mark(valueText !== (current.value_text ?? null), 'value_text');
    mark(achievedDate !== (current.achieved_date ?? null), 'achieved_date');
    mark(datePrecision !== current.date_precision, 'date_precision');
    mark(source !== current.source, 'source');
    mark(confidence !== current.confidence, 'confidence');
    mark(videoUrl !== (current.video_url ?? null), 'video_url');
    mark(videoTimecode !== (current.video_timecode ?? null), 'video_timecode');
    mark(notes !== (current.notes ?? null), 'notes');
    mark(supersededBy !== (current.superseded_by ?? null), 'superseded_by');

    transaction(() => {
      freestyleRecords.updateForCuration.run(
        recordType, personId, displayName, trickName, sortName, addsCount,
        valueNumeric, valueText, achievedDate, datePrecision, source, confidence,
        videoUrl, videoTimecode, notes, supersededBy, id,
      );
      appendAuditEntry({
        actionType:    'freestyle.record.updated',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_record',
        entityId:      id,
        metadata:      { changedFields },
      });
    });
  },
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
