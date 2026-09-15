/**
 * AdminClubService -- the administrator's club-management surface.
 *
 * Owns the club lookup, the per-club record, and the confirmation view-models
 * for every correction reached from that record. Writes nothing itself: each
 * correction is resolved and validated here, previewed with nothing written,
 * and committed by ClubService, which owns the club row and the hashtag that is
 * its address. Keeping the writes there is what stops this surface becoming a
 * second home for club rules, and it is why a correction made here obeys the
 * same field rules a co-leader's own edit obeys.
 *
 * Audience: admin only. A club carries no personal data of its own, so the
 * record is not a privacy surface; the route gate still stands in front of it,
 * because everything it offers is a write on somebody else's club.
 *
 * The lookup reads every club rather than a public listing view, because the
 * record exists to reach exactly the clubs those listings exclude: an inactive
 * club whose details are wrong, and an archived one whose name or location is
 * still read from the history it left behind.
 *
 * Reading a record writes nothing. Each correction writes one audit row and
 * one notice to the club's current co-leaders through ClubService.
 */
import { clubs, clubLeaders } from '../db/db';
import {
  clubService,
  type ClubFieldChange,
  type ClubWriteActor,
} from './clubService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { formatDateDisplay } from './dateFormat';
import type { PageViewModel } from '../types/page';
import type { OutcomeTone } from '../lib/outcomeNotice';

const LOOKUP_LIMIT = 25;
const MIN_LOOKUP_QUERY = 2;
const MAX_REASON = 500;

/**
 * What a committed correction did, carried across the redirect as a short code
 * rather than a sentence: the wording belongs to this service, and a cookie is
 * no place to keep prose.
 */
export type ClubCorrectionOutcome =
  | 'content_corrected'
  | 'content_unchanged'
  | 'hashtag_corrected'
  | 'hashtag_unchanged';

// A correction that landed and a correction that found nothing to change are
// different events, and painting both in the same green tells the administrator
// they caused a change where none happened.
const OUTCOME_NOTICE: Record<ClubCorrectionOutcome, [OutcomeTone, string]> = {
  content_corrected:
    ['ok', "The club's details have been corrected, every changed value is recorded in the audit log, and its co-leaders have been told."],
  content_unchanged: ['info', 'Those are the details the club already held, so nothing changed.'],
  hashtag_corrected:
    ['ok', "The hashtag has moved and every photo already carrying it moved with it, so the club's gallery still resolves. The old address no longer works."],
  hashtag_unchanged: ['info', 'That is the hashtag the club already held, so nothing changed.'],
};

function isClubCorrectionOutcome(value: string): value is ClubCorrectionOutcome {
  return Object.prototype.hasOwnProperty.call(OUTCOME_NOTICE, value);
}

/** The club row this surface reads, flat as the statement returns it. */
interface AdminClubRow {
  id: string;
  name: string;
  description: string | null;
  city: string;
  region: string | null;
  country: string;
  external_url: string | null;
  external_url_validated_at: string | null;
  external_url_quarantine_reason: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  tag_normalized: string;
  tag_display: string;
}

interface FactRow {
  label: string;
  value: string;
}

interface ChangeRow {
  label: string;
  before: string;
  after: string;
}

interface HiddenField {
  name: string;
  value: string;
}

interface LookupResultView {
  clubId: string;
  name: string;
  recordHref: string;
  facts: string[];
  badges: string[];
}

export interface AdminClubLookupContent {
  query: string;
  hasQuery: boolean;
  results: LookupResultView[];
  hasResults: boolean;
  resultSummary: string;
  /** The result cap was reached, so the set shown is not the whole match. */
  hasMore: boolean;
  errorMessage?: string;
}

export interface AdminClubRecordContent {
  clubId: string;
  name: string;
  hashtagLabel: string;
  publicHref: string;
  /**
   * The identifying strip under the hero: which club this is and what state it
   * is in, before the administrator reads anything else or acts on anything.
   */
  identifyingFacts: string[];
  stateLabels: string[];
  details: FactRow[];
  leaders: Array<{ displayName: string; roleLabel: string; recordHref: string }>;
  hasLeaders: boolean;
  /** Current values, so the correction form opens on what the club holds. */
  form: {
    name: string;
    description: string;
    city: string;
    region: string;
    country: string;
    externalUrl: string;
    /** Without the '#club_' the platform owns, which is not the part that moves. */
    hashtagSlug: string;
  };
  contentAction: string;
  hashtagAction: string;
  /** Named for where each one goes, since all of them leave this record. */
  elsewhereLinks: Array<{ label: string; href: string }>;
  errorMessage?: string;
}

export interface AdminClubConfirmContent {
  clubId: string;
  name: string;
  hashtagLabel: string;
  summary: string;
  changes: ChangeRow[];
  hasChanges: boolean;
  noChangeMessage: string | null;
  /**
   * One sentence of caution, present only on a correction that cannot be taken
   * back by repeating it. A band on every confirmation is a band an
   * administrator stops reading, and then it is worth nothing on the one that
   * needs it.
   */
  caution?: string;
  reason: string;
  hiddenFields: HiddenField[];
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

/** How each club field is titled on a record and on a confirmation screen. */
const CLUB_FIELD_LABEL: Record<string, string> = {
  name:         'Club name',
  description:  'Description',
  city:         'City',
  region:       'Region or state',
  country:      'Country',
  external_url: 'Website',
  hashtag:      'Hashtag',
};

const STATUS_LABEL: Record<string, string> = {
  active:   'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

function recordHref(clubId: string): string {
  return `/admin/clubs/${clubId}`;
}

function clubKeyOf(row: AdminClubRow): string {
  return row.tag_normalized.replace('#', '');
}

function readClub(clubId: string): AdminClubRow {
  const row = clubs.findClubForAdminRecord.get(clubId) as AdminClubRow | undefined;
  if (!row) throw new NotFoundError('No club with that id.');
  return row;
}

function displayOrDash(value: string | null | undefined): string {
  return value && value.trim() !== '' ? value : '—';
}

function displayFieldValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '—';
  return String(value);
}

function dateOrDash(iso: string | null): string {
  return iso ? formatDateDisplay(iso.slice(0, 10)) : '—';
}

/**
 * The states an administrator needs to see at a glance, because each one
 * changes what the rest of the platform does with this club.
 */
function stateLabelsFor(row: AdminClubRow): string[] {
  const labels: string[] = [];
  if (row.status !== 'active') labels.push(STATUS_LABEL[row.status] ?? row.status);
  if (row.external_url_quarantine_reason) labels.push('Website address withheld');
  return labels;
}

function requireReason(raw: string): string {
  const reason = raw.trim();
  if (!reason) throw new ValidationError('Enter the reason for this correction.');
  // Capped here as well as at the write, so an over-long reason is refused
  // before an administrator is asked to confirm rather than after.
  if (reason.length > MAX_REASON) {
    throw new ValidationError(`The reason must be ${MAX_REASON} characters or fewer.`);
  }
  return reason;
}

function confirmEnvelope(
  title: string,
  content: AdminClubConfirmContent,
): PageViewModel<AdminClubConfirmContent> {
  return {
    seo:  { title, noindex: true },
    page: { sectionKey: '', pageKey: 'admin_club_confirm', title },
    content,
  };
}

/** The club content an administrator submits, in the shape ClubService takes. */
export interface ClubContentCorrectionInput {
  name: string;
  description: string;
  city: string;
  region: string;
  country: string;
  externalUrl: string;
}

/**
 * The club's owner reports a field-level refusal as a map, because a
 * co-leader's own form renders each message beside the field it belongs to.
 * This record carries one error band instead, so the messages are joined into
 * it: a band saying only that something is wrong leaves the administrator to
 * guess which of six fields it meant.
 */
function flattenFieldErrors(err: unknown): never {
  if (err instanceof ValidationError && err.fieldErrors) {
    const joined = Object.values(err.fieldErrors).join(' ').trim();
    if (joined !== '') throw new ValidationError(joined);
  }
  throw err;
}

function changeRows(changed: ClubFieldChange[]): ChangeRow[] {
  return changed.map((c) => ({
    label:  CLUB_FIELD_LABEL[c.field] ?? c.field,
    before: displayFieldValue(c.before),
    after:  displayFieldValue(c.after),
  }));
}

function contentHiddenFields(
  input: ClubContentCorrectionInput,
  reason: string,
): HiddenField[] {
  return [
    { name: 'name',         value: input.name },
    { name: 'description',  value: input.description },
    { name: 'city',         value: input.city },
    { name: 'region',       value: input.region },
    { name: 'country',      value: input.country },
    { name: 'external_url', value: input.externalUrl },
    { name: 'reason',       value: reason },
  ];
}

/**
 * The administrator whose correction this is, in the shape ClubService takes.
 * A preview commits nothing, so it carries a placeholder id rather than a real
 * administrator: nothing reads it, and a preview that named a real actor would
 * look like a write that had already happened.
 */
function administrator(memberId: string, reason: string): ClubWriteActor {
  return { kind: 'administrator', memberId, reason };
}

export const adminClubService = {
  /** The club lookup. Searching writes nothing. */
  getClubLookupPage(rawQuery: string): PageViewModel<AdminClubLookupContent> {
    const query = rawQuery.trim();
    const title = 'Clubs';
    let results: LookupResultView[] = [];
    let hasMore = false;
    let errorMessage: string | undefined;

    if (query !== '' && query.length < MIN_LOOKUP_QUERY) {
      errorMessage = `Enter at least ${MIN_LOOKUP_QUERY} characters, or an exact club id or hashtag.`;
    } else if (query !== '') {
      const lowered = query.toLowerCase();
      const escaped = lowered.replace(/[\\%_]/g, (ch) => `\\${ch}`);
      // A hashtag is accepted however the administrator writes it: with the
      // leading '#', with the 'club_' the platform owns, or with neither,
      // because all three are what a club's address looks like somewhere on
      // the site.
      const bare = lowered.replace(/^#/, '').replace(/^club_/, '');
      // One over the cap, so a full page of results can be told apart from a
      // set that was truncated. The extra row is dropped before rendering.
      const ids = clubs.findClubIdsForAdminSearch.all(
        query, `#club_${bare}`, escaped, escaped, LOOKUP_LIMIT + 1,
      ) as Array<{ id: string }>;
      hasMore = ids.length > LOOKUP_LIMIT;
      results = ids.slice(0, LOOKUP_LIMIT).map(({ id }) => {
        const row = readClub(id);
        const location = [row.city, row.region, row.country].filter(Boolean).join(', ');
        return {
          clubId:     row.id,
          name:       row.name,
          recordHref: recordHref(row.id),
          facts:      [row.tag_normalized, location].filter((f) => Boolean(f)),
          badges:     stateLabelsFor(row),
        };
      });
    }

    const resultSummary = query === ''
      ? 'Search for a club by id, hashtag, or part of its name or city.'
      : results.length === 0
        ? 'No club matches that search.'
        : hasMore
          ? `More than ${LOOKUP_LIMIT} clubs match. Narrow the search to see the rest.`
          : results.length === 1
            ? 'One club matches.'
            : `${results.length} clubs match.`;

    return {
      seo:  { title, noindex: true },
      page: { sectionKey: '', pageKey: 'admin_clubs', title },
      content: {
        query,
        hasQuery:   query !== '',
        results,
        hasResults: results.length > 0,
        resultSummary,
        hasMore,
        errorMessage,
      },
    };
  },

  /** The club record: everything an administrator acts on, in one place. */
  getClubRecordPage(
    clubId: string,
    opts: { outcome?: string | null; errorMessage?: string } = {},
  ): PageViewModel<AdminClubRecordContent> {
    const row = readClub(clubId);
    const clubKey = clubKeyOf(row);
    const leaderRows = clubLeaders.listLeadersWithNames.all(row.id) as Array<{
      member_id: string;
      role: string;
      display_name: string;
    }>;

    const outcomeNotice = opts.outcome && isClubCorrectionOutcome(opts.outcome)
      ? OUTCOME_NOTICE[opts.outcome]
      : undefined;

    const title = row.name;
    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '',
        pageKey:    'admin_club_record',
        title,
        notice:     outcomeNotice ? outcomeNotice[1] : undefined,
        ...(outcomeNotice ? { noticeTone: outcomeNotice[0] } : {}),
      },
      navigation: {
        contextLinks: [{ label: 'Back to the Club Lookup', href: '/admin/clubs' }],
      },
      content: {
        clubId:       row.id,
        name:         row.name,
        hashtagLabel: row.tag_normalized,
        publicHref:   `/clubs/${clubKey}`,
        identifyingFacts: [
          row.tag_normalized,
          [row.city, row.region, row.country].filter(Boolean).join(', '),
        ].filter((f) => Boolean(f)),
        stateLabels: stateLabelsFor(row),
        details: [
          { label: CLUB_FIELD_LABEL['name']!,        value: row.name },
          { label: CLUB_FIELD_LABEL['description']!, value: displayOrDash(row.description) },
          { label: CLUB_FIELD_LABEL['city']!,        value: row.city },
          { label: CLUB_FIELD_LABEL['region']!,      value: displayOrDash(row.region) },
          { label: CLUB_FIELD_LABEL['country']!,     value: row.country },
          { label: CLUB_FIELD_LABEL['external_url']!, value: displayOrDash(row.external_url) },
          { label: 'Website checked',  value: dateOrDash(row.external_url_validated_at) },
          { label: 'Status',           value: STATUS_LABEL[row.status] ?? row.status },
          { label: 'Created',          value: dateOrDash(row.created_at) },
          { label: 'Last changed',     value: dateOrDash(row.updated_at) },
        ],
        leaders: leaderRows.map((l) => ({
          displayName: l.display_name,
          roleLabel:   l.role === 'leader' ? 'Leader' : 'Co-leader',
          recordHref:  `/admin/members/${l.member_id}`,
        })),
        hasLeaders: leaderRows.length > 0,
        form: {
          name:        row.name,
          description: row.description ?? '',
          city:        row.city,
          region:      row.region ?? '',
          country:     row.country,
          externalUrl: row.external_url ?? '',
          hashtagSlug: row.tag_normalized.replace('#club_', ''),
        },
        contentAction: `${recordHref(row.id)}/content`,
        hashtagAction: `${recordHref(row.id)}/hashtag`,
        elsewhereLinks: [
          { label: "Leadership for this club", href: `/admin/clubs/${row.id}/leadership` },
          { label: 'Club cleanup queue',       href: '/admin/club-cleanup' },
        ],
        ...(opts.errorMessage ? { errorMessage: opts.errorMessage } : {}),
      },
    };
  },

  /** Preview a correction of the club's own details. Nothing is written. */
  async previewContentCorrection(
    clubId: string,
    input: ClubContentCorrectionInput,
    rawReason: string,
  ): Promise<PageViewModel<AdminClubConfirmContent>> {
    const row = readClub(clubId);
    const reason = requireReason(rawReason);

    const moved = await clubService.editClubContent(
      row.id,
      {
        name:        input.name,
        description: input.description,
        city:        input.city,
        region:      input.region,
        country:     input.country,
        externalUrl: input.externalUrl,
      },
      administrator('preview', reason),
      { preview: true },
    ).catch(flattenFieldErrors);
    const changes = changeRows(moved);

    return confirmEnvelope("Confirm: Correct the Club's Details", {
      clubId:       row.id,
      name:         row.name,
      hashtagLabel: row.tag_normalized,
      summary: "The club's own co-leaders are the ordinary path for these fields, and this surface "
        + 'is the backstop for when they cannot use it. Every value here passes the same rules '
        + 'their own form applies, including the block on two clubs sharing an exact name in one '
        + "country. The club's co-leaders are emailed the reason you give here.",
      changes,
      hasChanges:      changes.length > 0,
      noChangeMessage: changes.length > 0 ? null : 'Those are the details the club already holds. Nothing would change.',
      reason,
      hiddenFields:  contentHiddenFields(input, reason),
      confirmAction: `${recordHref(row.id)}/content/confirm`,
      confirmLabel:  "Yes, Correct the Club's Details",
      cancelHref:    recordHref(row.id),
    });
  },

  /** Commit a correction of the club's own details through the club's owner. */
  async applyContentCorrection(
    actorId: string,
    clubId: string,
    input: ClubContentCorrectionInput,
    rawReason: string,
  ): Promise<ClubCorrectionOutcome> {
    const row = readClub(clubId);
    const reason = requireReason(rawReason);

    const moved = await clubService.editClubContent(
      row.id,
      {
        name:        input.name,
        description: input.description,
        city:        input.city,
        region:      input.region,
        country:     input.country,
        externalUrl: input.externalUrl,
      },
      administrator(actorId, reason),
    ).catch(flattenFieldErrors);
    return moved.length > 0 ? 'content_corrected' : 'content_unchanged';
  },

  /**
   * Preview a move of the club's hashtag. Nothing is written.
   *
   * The refusals are raised as validation failures rather than returned,
   * because each of them is a submission the administrator can fix on the
   * record they came from.
   */
  previewHashtagCorrection(
    clubId: string,
    newSlug: string,
    rawReason: string,
  ): PageViewModel<AdminClubConfirmContent> {
    const row = readClub(clubId);
    const reason = requireReason(rawReason);
    const moved = this.resolveHashtagMove(row, newSlug, reason);
    const unchanged = moved.oldTag === moved.newTag;

    const changes: ChangeRow[] = unchanged ? [] : [{
      label:  CLUB_FIELD_LABEL['hashtag']!,
      before: moved.oldTag,
      after:  moved.newTag,
    }];

    return confirmEnvelope("Confirm: Correct the Club's Hashtag", {
      clubId:       row.id,
      name:         row.name,
      hashtagLabel: row.tag_normalized,
      summary: "The hashtag is the club's address as well as its tag, so the club's page moves with "
        + 'it and every photo already carrying the hashtag follows. The old address stops working '
        + "and nothing redirects from it. The club's co-leaders are emailed the reason you give "
        + 'here.',
      changes,
      hasChanges:      changes.length > 0,
      noChangeMessage: unchanged ? 'That is the hashtag the club already holds. Nothing would change.' : null,
      ...(unchanged ? {} : {
        caution: 'This cannot be undone by anything but another move. Any link already shared to the '
          + 'old address will lead nowhere.',
      }),
      reason,
      hiddenFields: [
        { name: 'hashtag_slug', value: newSlug },
        { name: 'reason',       value: reason },
      ],
      confirmAction: `${recordHref(row.id)}/hashtag/confirm`,
      confirmLabel:  'Yes, Move the Hashtag',
      cancelHref:    recordHref(row.id),
    });
  },

  /** Commit a move of the club's hashtag through the club's owner. */
  applyHashtagCorrection(
    actorId: string,
    clubId: string,
    newSlug: string,
    rawReason: string,
  ): ClubCorrectionOutcome {
    const row = readClub(clubId);
    const reason = requireReason(rawReason);
    // Resolved first so a submission that would move nothing writes nothing:
    // the club's owner has no way to tell a deliberate no-op from a real move,
    // and an audit row saying a hashtag changed to itself is a false entry.
    const moved = this.resolveHashtagMove(row, newSlug, reason);
    if (moved.oldTag === moved.newTag) return 'hashtag_unchanged';

    const result = clubService.updateClubHashtag(
      row.id, newSlug, administrator(actorId, reason),
    );
    if (result.branch !== 'updated') {
      throw new ValidationError('That hashtag could not be applied. Check the record and try again.');
    }
    return 'hashtag_corrected';
  },

  /**
   * What a hashtag move would do, with every refusal turned into the sentence
   * the administrator sees. Shared by the preview and the commit so the two
   * cannot disagree about whether a submission is acceptable.
   */
  resolveHashtagMove(
    row: AdminClubRow,
    newSlug: string,
    reason: string,
  ): { oldTag: string; newTag: string } {
    const result = clubService.updateClubHashtag(
      row.id, newSlug, administrator('preview', reason), { preview: true },
    );
    if (result.branch === 'invalid_format') {
      throw new ValidationError(
        'A hashtag is at least two characters of letters, digits or underscores. '
        + "The '#club_' in front of it belongs to the platform and is not typed here.",
      );
    }
    if (result.branch === 'tag_conflict') {
      throw new ValidationError('Another tag already holds that hashtag.');
    }
    if (result.branch !== 'updated') {
      throw new NotFoundError('No club with that id.');
    }
    return { oldTag: result.oldTag, newTag: result.newTag };
  },
};
