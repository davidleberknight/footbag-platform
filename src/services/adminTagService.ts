/**
 * AdminTagService -- taking an abusive freeform hashtag out of circulation.
 *
 * Owns:
 *   - The tag lookup an administrator reaches a hashtag by, the preview of what
 *     retiring it would detach, and the retirement itself.
 *
 * Does not own:
 *   - Applying a tag to media or to a gallery's criteria (CuratorMediaService),
 *     which is also where a retired tag is refused if somebody types it again.
 *   - A club's or an event's hashtag, which is that thing's address rather than
 *     a member's word and is corrected on its own surface.
 *   - Usage counts (HashtagDiscoveryService rebuilds `tag_stats`); this service
 *     deletes the one row belonging to a tag it retires and nothing else.
 *
 * Required patterns:
 *   - Retirement is moderation, not vocabulary management. The stories take a
 *     deliberate position that the platform imposes no taxonomy on freeform
 *     tags, so there is no rename and no merge here, only removal.
 *   - Every retirement takes a mandatory reason and is previewed before it is
 *     written, because it cannot be undone from the site.
 *   - The tag row is never deleted. It is stamped and left standing, which is
 *     what keeps its normalized form reserved against recreation.
 *
 * Invariants:
 *   - A standard tag is never retired. It is a club's or an event's address,
 *     its permanence is a stated data-model rule, and the write statement
 *     enforces it in SQL rather than trusting this service to check.
 *   - The platform's own generated tags, the per-uploader attribution tag and
 *     the curated marker, are never retired: no member authored them.
 *   - The media items themselves are untouched. Only the tag comes off.
 *
 * Transaction discipline: the detaches, the usage-record delete, the stamp and
 * the audit row are one transaction(() => ...).
 *
 * Persistence: tags, media_tags, member_gallery_tags,
 * member_gallery_exclude_tags, tag_stats, audit_entries.
 *
 * Side effects: audit append only. No member is emailed: the takedown decision
 * writes to a member when their own item is removed, and here every item
 * survives. What comes off is a shared word that was never any one member's,
 * and the message would have to quote the abusive tag to make sense.
 */
import { tagRetirement } from '../db/db';
import { transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import type { PageViewModel } from '../types/page';
import type { OutcomeTone } from '../lib/outcomeNotice';

const MAX_REASON = 500;
const MIN_LOOKUP_QUERY = 2;

/** The platform writes these two itself, so no member authored either. */
const CURATED_TAG = '#curated';
const UPLOADER_TAG_PREFIX = '#by_';

/**
 * What a committed act did, carried across the redirect as a short code rather
 * than a sentence: the wording belongs to this service, and a cookie is no
 * place to keep prose.
 */
export type TagRetirementOutcome = 'retired';

const OUTCOME_NOTICE: Record<TagRetirementOutcome, [OutcomeTone, string]> = {
  retired: ['ok', 'The hashtag is retired. It has come off every photo, video and gallery that named it, it no longer appears anywhere on the site, and nobody can apply it again.'],
};

function isTagRetirementOutcome(value: string): value is TagRetirementOutcome {
  return Object.prototype.hasOwnProperty.call(OUTCOME_NOTICE, value);
}

/** The tag row this surface reads, flat as the statement returns it. */
interface AdminTagRow {
  id: string;
  tag_normalized: string;
  tag_display: string;
  is_standard: number;
  standard_type: string | null;
  retired_at: string | null;
  media_count: number;
  gallery_criteria_count: number;
  gallery_exclude_count: number;
}

interface FactRow {
  label: string;
  value: string;
}

interface HiddenField {
  name: string;
  value: string;
}

export interface AdminTagLookupContent {
  query: string;
  hasQuery: boolean;
  /** The resolved tag, present only when the search found one. */
  tag: {
    display: string;
    normalized: string;
    facts: FactRow[];
    /** Why this tag cannot be retired, when something bars it. */
    barMessage: string | null;
    canRetire: boolean;
  } | null;
  resultSummary: string;
  retireAction: string;
  errorMessage?: string;
}

export interface AdminTagConfirmContent {
  tagDisplay: string;
  tagNormalized: string;
  summary: string;
  detaches: FactRow[];
  caution: string;
  reason: string;
  hiddenFields: HiddenField[];
  confirmAction: string;
  confirmLabel: string;
  cancelHref: string;
}

/**
 * A hashtag is accepted however the administrator writes it, because that is
 * how it reaches them: pasted from a page with its '#', or typed as the bare
 * word out of a report.
 */
function normalizeTagQuery(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  return trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
}

function lookupHref(query: string): string {
  return `/admin/tags?q=${encodeURIComponent(query)}`;
}

function readTag(normalized: string): AdminTagRow {
  const row = tagRetirement.findTagForRetirement.get(normalized) as AdminTagRow | undefined;
  if (!row) throw new NotFoundError('No hashtag with that text.');
  return row;
}

/**
 * Why this tag may not be retired, or null when it may. Shared by the lookup,
 * which shows the sentence, and by the preview and the commit, which refuse on
 * it, so the three cannot disagree about what is allowed.
 */
function barReasonFor(row: AdminTagRow): string | null {
  if (row.retired_at !== null) {
    return 'This hashtag is already retired. It is off every item that carried it and nobody can apply it again.';
  }
  if (row.is_standard === 1) {
    return row.standard_type === 'club'
      ? "This hashtag is a club's address, not a member's word. Correct it from that club's record instead."
      : "This hashtag is an event's address, not a member's word, and an event's address is permanent.";
  }
  if (row.tag_normalized.startsWith(UPLOADER_TAG_PREFIX)) {
    return 'The platform writes this hashtag itself to mark who uploaded an item. No member chose it, and removing it would break the galleries that rely on it.';
  }
  if (row.tag_normalized === CURATED_TAG) {
    return "The platform writes this hashtag itself to mark the site's own curated media. No member chose it.";
  }
  return null;
}

function requireReason(raw: string): string {
  const reason = raw.trim();
  if (!reason) throw new ValidationError('Enter the reason for retiring this hashtag.');
  // Capped here as well as at the write, so an over-long reason is refused
  // before an administrator is asked to confirm rather than after.
  if (reason.length > MAX_REASON) {
    throw new ValidationError(`The reason must be ${MAX_REASON} characters or fewer.`);
  }
  return reason;
}

/** The tag an act names, resolved and checked, or the sentence saying why not. */
function resolveRetirableTag(rawTag: string): AdminTagRow {
  const row = readTag(normalizeTagQuery(rawTag));
  const bar = barReasonFor(row);
  if (bar) throw new ValidationError(bar);
  return row;
}

function detachRows(row: AdminTagRow): FactRow[] {
  const galleryCount = row.gallery_criteria_count + row.gallery_exclude_count;
  return [
    {
      label: 'Photos and videos carrying it',
      value: String(row.media_count),
    },
    {
      label: 'Member galleries naming it',
      value: String(galleryCount),
    },
  ];
}

export const adminTagService = {
  /** The hashtag lookup. Searching writes nothing. */
  getTagLookupPage(
    rawQuery: string,
    opts: { outcome?: string | null; errorMessage?: string } = {},
  ): PageViewModel<AdminTagLookupContent> {
    const query = rawQuery.trim();
    const title = 'Hashtags';
    let tag: AdminTagLookupContent['tag'] = null;
    let resultSummary: string;
    let errorMessage = opts.errorMessage;

    if (query === '') {
      resultSummary = 'Enter the hashtag exactly as it appears on the site. Retiring one takes it off '
        + 'every photo, video and gallery that names it, and nobody can apply it again.';
    } else if (query.replace(/^#/, '').length < MIN_LOOKUP_QUERY) {
      resultSummary = '';
      errorMessage = `A hashtag is at least ${MIN_LOOKUP_QUERY} characters after the '#'.`;
    } else {
      const row = tagRetirement.findTagForRetirement.get(normalizeTagQuery(query)) as
        | AdminTagRow
        | undefined;
      if (!row) {
        resultSummary = 'No hashtag with that text. Hashtags are matched whole, not by part of a word.';
      } else {
        const bar = barReasonFor(row);
        resultSummary = '';
        tag = {
          display:    row.tag_display,
          normalized: row.tag_normalized,
          facts:      detachRows(row),
          barMessage: bar,
          canRetire:  bar === null,
        };
      }
    }

    const outcomeNotice = opts.outcome && isTagRetirementOutcome(opts.outcome)
      ? OUTCOME_NOTICE[opts.outcome]
      : undefined;

    return {
      seo:  { title, noindex: true },
      page: {
        sectionKey: '',
        pageKey:    'admin_tags',
        title,
        notice:     outcomeNotice ? outcomeNotice[1] : undefined,
        ...(outcomeNotice ? { noticeTone: outcomeNotice[0] } : {}),
      },
      content: {
        query,
        hasQuery: query !== '',
        tag,
        resultSummary,
        retireAction: '/admin/tags/retire',
        ...(errorMessage ? { errorMessage } : {}),
      },
    };
  },

  /** Preview a retirement. Nothing is written. */
  previewRetirement(rawTag: string, rawReason: string): PageViewModel<AdminTagConfirmContent> {
    const reason = requireReason(rawReason);
    const row = resolveRetirableTag(rawTag);
    const title = 'Confirm: Retire This Hashtag';

    return {
      seo:  { title, noindex: true },
      page: { sectionKey: '', pageKey: 'admin_tag_confirm', title },
      content: {
        tagDisplay:    row.tag_display,
        tagNormalized: row.tag_normalized,
        summary: 'Retiring a hashtag takes it off everything counted above and stops anybody applying it '
          + 'again. The photos and videos themselves are untouched, and so is everything their '
          + "owners wrote about them: only the hashtag comes off. Nobody is emailed, because the "
          + 'hashtag was never any one member\'s.',
        detaches: detachRows(row),
        caution: 'This cannot be undone from the site. The hashtag cannot be brought back, and '
          + 'nothing records which items used to carry it beyond the audit log.',
        reason,
        hiddenFields: [
          { name: 'tag',    value: row.tag_normalized },
          { name: 'reason', value: reason },
        ],
        confirmAction: '/admin/tags/retire/confirm',
        confirmLabel:  'Yes, Retire This Hashtag',
        cancelHref:    lookupHref(row.tag_display),
      },
    };
  },

  /** Commit a retirement. */
  applyRetirement(actorId: string, rawTag: string, rawReason: string): TagRetirementOutcome {
    const reason = requireReason(rawReason);
    const row = resolveRetirableTag(rawTag);
    const now = new Date().toISOString();

    transaction(() => {
      tagRetirement.deleteMediaTagsByTagId.run(row.id);
      tagRetirement.deleteGalleryCriteriaByTagId.run(row.id);
      tagRetirement.deleteGalleryExcludesByTagId.run(row.id);
      tagRetirement.deleteTagStat.run(row.id);
      const stamped = tagRetirement.markRetired.run(now, actorId, now, actorId, row.id);
      // The statement carries the permanence rule in its WHERE clause, so a
      // row it declines to touch is a tag this service should never have
      // reached. Failing the transaction is the honest outcome: the detaches
      // above roll back with it rather than leaving a tag stripped of its
      // items and still applicable.
      if (stamped.changes !== 1) {
        throw new ValidationError('That hashtag could not be retired. Search for it again and check what it is.');
      }
      appendAuditEntry({
        actionType:    'media.tag_retired',
        category:      'media',
        actorType:     'admin',
        actorMemberId: actorId,
        entityType:    'tag',
        entityId:      row.id,
        reasonText:    reason,
        metadata:      {
          tagNormalized:        row.tag_normalized,
          tagDisplay:           row.tag_display,
          mediaDetached:        row.media_count,
          galleryCriteriaRemoved: row.gallery_criteria_count,
          galleryExcludesRemoved: row.gallery_exclude_count,
        },
      });
    });

    return 'retired';
  },
};
