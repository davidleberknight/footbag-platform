/**
 * NewsService -- the news feed's items: their creation as a side effect of the
 * platform's own flows, the rules an authored item must meet, and how an item
 * is shaped for display.
 *
 * Owns:
 *   - Automatic items. A flow that publishes something newsworthy (an event
 *     going public, its results' first publication) emits one item through
 *     `emitAutomaticItem`, inside that flow's own transaction. One source
 *     entity yields at most one automatic item of each type, however often
 *     its flow runs: a repeat leaves the first item standing and returns it.
 *   - The wording of the automatic event items (`eventItemText`): a free
 *     event's opening, a sanction grant, and the first results. Each names the
 *     event, its dates and its location, the organizer's words escaped so the
 *     body renders them exactly as typed.
 *   - Removal of an entity's items with it: deleting an event deletes every
 *     item about it.
 *   - The authored-item rules: a title of at most 200 characters and a
 *     Markdown body, both required, and a publication date that defaults to
 *     the moment of writing.
 *   - Display shaping: the label (News for an item in IFPA's voice, written by
 *     an administrator or created automatically; Community for a member's
 *     approved post), the byline a Community post carries and no other item
 *     does, and the body rendered from Markdown to HTML.
 *   - The public news pages, for any visitor, rendered identically for every
 *     viewer whether signed in or not:
 *       - `/news`, the current UTC year's items, with an empty state when it
 *         has none; `/news/year/:year`, another year's items, which exists only
 *         while that year holds items. Items are listed newest first, each as
 *         a dated item card (date, label, headline, excerpt; a Community
 *         post's byline and an event item's hashtag on its meta line; an event
 *         item's cover as its thumbnail). The year navigation links only to
 *         years holding items, the current year by its landing address.
 *       - `/news/:newsId`, one item's page in the detail-page order: an event
 *         item's cover, the label, date and Community byline, an event item's
 *         media line, the body, the link to the event, and the back link to
 *         the item's year.
 *     An item about an event carries that event's hashtag, linked to its
 *     gallery only while media carries it, and the event's honoured cover; a
 *     news item has no hashtag or cover of its own.
 *
 * Visibility invariant: a hidden item, an item whose publication time has not
 *   arrived, and an item about an event that is not publicly visible appear on
 *   no public surface; such an item's own page is not found. One filter in the
 *   statement layer applies it to every public read.
 *
 * Does not own:
 *   - When an item is due. The flow that emits it decides; this service only
 *     records it.
 *   - The member's announcement and its approval, which the broadcast service
 *     owns; an approval with the feed among its places produces the post.
 *
 * Required patterns:
 *   - `emitAutomaticItem` and `deleteItemsForEntity` are synchronous and open
 *     no transaction of their own, so they run inside the caller's: an item
 *     never outlives a rolled-back change, and a change never lands without
 *     its item.
 *   - An automatic item records no author: it speaks for the platform.
 *   - Authored text is cleaned with the shared write-time sanitizer before it
 *     is validated: the title as a single line, the body as Markdown, which
 *     keeps its indentation. The body is stored as written and rendered only
 *     for display, by the news Markdown renderer, which shows raw HTML as text
 *     and renders only web and site links.
 *
 * Persistence: `news_items` (insert and delete; the public reads), reading the
 *   item's author through `members_onboarded` and its event through `events`
 *   and `tags`.
 * Side effects: none of its own; the calling flow writes the audit row for
 *   the act that emitted the item.
 */
import { randomUUID } from 'node:crypto';
import { newsItems } from '../db/db';
import { escapeNewsMarkdown, newsExcerpt, renderNewsMarkdown } from '../lib/newsMarkdown';
import { personLocation } from './countryUtils';
import { INVALID_TEXT_ENCODING_MESSAGE, sanitizeUserText } from '../lib/textSanitizer';
import type { DatedItemMeta, DatedItemView } from '../types/datedItem';
import type { PageViewModel } from '../types/page';
import { coverPhotoImage, eventCoverPhotos, type CoverPhotoImage, type CoverPhotoView } from './entityCoverPhoto';
import { eventDateRange, getAdjacentArchiveYears } from './eventListing';
import { mediaService } from './mediaService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { runSqliteRead } from './sqliteRetry';

export type NewsType =
  | 'event_published'
  | 'event_results'
  | 'club_created'
  | 'club_archived'
  | 'member_honor'
  | 'vote_results'
  | 'announcement'
  | 'community_post'
  | 'system';

/** The types only the platform's own flows create, one per source entity. */
export type AutomaticNewsType = Exclude<NewsType, 'announcement' | 'community_post'>;

export type NewsLabel = 'News' | 'Community';

export const NEWS_TITLE_MAX_LENGTH = 200;

export interface EmitAutomaticItemInput {
  newsType: AutomaticNewsType;
  entityType: string;
  entityId: string;
  title: string;
  body: string;
  publishedAt: string;
  actorId: string;
  nowIso: string;
}

export type EmitAutomaticItemResult =
  | { status: 'created'; newsItemId: string }
  | { status: 'already_held'; newsItemId: string };

export interface AuthoredNewsInput {
  title: unknown;
  body: unknown;
  /** An ISO-8601 instant, or empty for the moment of writing. */
  publishedAt?: unknown;
}

export interface ValidAuthoredNews {
  title: string;
  body: string;
  publishedAt: string;
}

/** A news item row as a read returns it, with its author's name and profile slug when it has one. */
export interface NewsItemRow {
  id: string;
  news_type: NewsType;
  title: string;
  body: string;
  published_at: string;
  author_display_name: string | null;
  author_slug: string | null;
}

/** A public read's row: the item, plus the event it is about when it has one. */
export interface PublicNewsItemRow extends NewsItemRow {
  entity_type: string | null;
  entity_id: string | null;
  event_id: string | null;
  event_title: string | null;
  event_tag_normalized: string | null;
  event_tag_display: string | null;
}

/** The current year's page and each other year's page: one year's items, newest first. */
export interface NewsYearContent {
  year: number;
  items: DatedItemView[];
}

/** One item's own page. */
export interface NewsItemContent {
  label: NewsLabel;
  dateText: string;
  byline: { text: string; profileHref: string } | null;
  bodyHtml: string;
  coverPhoto: CoverPhotoImage | null;
  /** The event the item is about, with its hashtag and gallery, or null. */
  event: {
    href: string;
    linkLabel: string;
    hashtag: { display: string; galleryHref: string | null };
    galleryLabel: string;
  } | null;
}

export interface NewsItemView {
  id: string;
  title: string;
  label: NewsLabel;
  publishedAt: string;
  /** Present only on a Community post. */
  byline: { displayName: string; profileHref: string } | null;
  bodyHtml: string;
}

/** The three moments an event emits an automatic item. */
export type EventNewsKind = 'opened' | 'sanctioned' | 'results';

/** The event fields an automatic item's wording names. */
export interface EventNewsFacts {
  title: string;
  start_date: string;
  end_date: string;
  city: string;
  region: string | null;
  country: string;
}

/**
 * An automatic event item's title and Markdown body. The title is plain text,
 * shown escaped; inside the body the organizer's own words (the title and the
 * location) are escaped so they render exactly as typed.
 */
export function eventItemText(kind: EventNewsKind, event: EventNewsFacts): { title: string; body: string } {
  const name = escapeNewsMarkdown(event.title);
  const dates = escapeNewsMarkdown(eventDateRange(event.start_date, event.end_date));
  const where = escapeNewsMarkdown(personLocation(event.city, event.region, event.country)?.text ?? '');
  switch (kind) {
    case 'opened':
      return {
        title: `New event: ${event.title}`,
        body: `${name} runs ${dates} in ${where}. Details and registration are on the event page.`,
      };
    case 'sanctioned':
      return {
        title: `${event.title} is sanctioned by IFPA`,
        body: `IFPA has sanctioned ${name}, which runs ${dates} in ${where}. Details and registration are on the event page.`,
      };
    case 'results':
      return {
        title: `Results posted for ${event.title}`,
        body: `The results of ${name}, held ${dates} in ${where}, are now on the event page.`,
      };
  }
}

function newNewsItemId(): string {
  return `news_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export function newsLabelFor(newsType: NewsType): NewsLabel {
  return newsType === 'community_post' ? 'Community' : 'News';
}

const NEWS_LABEL_CSS_CLASS = 'badge-muted';

function newsYearOf(iso: string): number {
  return Number(iso.slice(0, 4));
}

/** The address of a year's news: the current year's is the news landing page. */
function newsYearHref(year: number, currentYear: number): string {
  return year === currentYear ? '/news' : `/news/year/${year}`;
}

function newsDateText(publishedAt: string): string {
  const day = publishedAt.slice(0, 10);
  return eventDateRange(day, day);
}

function eventHrefFromTag(tagNormalized: string): string {
  return `/events/${tagNormalized.startsWith('#') ? tagNormalized.slice(1) : tagNormalized}`;
}

function bylineText(displayName: string): string {
  return `By ${displayName}`;
}

/**
 * One item as a list entry: its date, label, headline linking to its page and
 * excerpt; a Community post's byline, then an event item's hashtag, on the
 * meta line; and an event item's cover as the thumbnail.
 */
export function toNewsDatedItem(
  row: PublicNewsItemRow,
  opts: { galleryHref: string | null; thumbUrl: string | null },
): DatedItemView {
  const view = newsService.shapeNewsItem(row);
  const meta: DatedItemMeta[] = [];
  if (view.byline) meta.push({ text: bylineText(view.byline.displayName), href: view.byline.profileHref });
  if (row.event_id && row.event_tag_display) {
    meta.push(opts.galleryHref
      ? { text: row.event_tag_display, href: opts.galleryHref, isHashtag: true }
      : { text: row.event_tag_display, isHashtag: true });
  }
  const excerpt = newsExcerpt(row.body);
  return {
    date: newsDateText(row.published_at),
    title: row.title,
    href: `/news/${row.id}`,
    label: { text: view.label, cssClass: NEWS_LABEL_CSS_CLASS },
    meta,
    excerpt: excerpt === '' ? null : excerpt,
    image: opts.thumbUrl ? { thumbUrl: opts.thumbUrl } : null,
  };
}

export const newsService = {
  /**
   * Records the one automatic item for a source entity, or finds the item a
   * previous run of the same flow left. Runs inside the caller's transaction.
   */
  emitAutomaticItem(input: EmitAutomaticItemInput): EmitAutomaticItemResult {
    const id = newNewsItemId();
    const result = newsItems.insertAutomatic.run(
      id, input.nowIso, input.actorId, input.nowIso, input.actorId,
      input.publishedAt, input.newsType, input.title, input.body,
      input.entityType, input.entityId,
    );
    if (result.changes === 1) return { status: 'created', newsItemId: id };
    const existing = newsItems.findAutomatic.get(
      input.newsType, input.entityType, input.entityId,
    ) as { id: string } | undefined;
    if (!existing) {
      throw new Error('automatic news insert was skipped but no item holds its place');
    }
    return { status: 'already_held', newsItemId: existing.id };
  },

  /** Deletes every item about one entity. Runs inside the caller's transaction. */
  deleteItemsForEntity(entityType: string, entityId: string): number {
    return newsItems.deleteForEntity.run(entityType, entityId).changes;
  },

  /**
   * Cleans and checks an administrator's or member's item, gathering every
   * field error into one refusal.
   */
  validateAuthoredInput(input: AuthoredNewsInput, nowIso: string): ValidAuthoredNews {
    const fieldErrors: Record<string, string> = {};

    const title = sanitizeUserText(typeof input.title === 'string' ? input.title : '', 'single_line');
    const body = sanitizeUserText(typeof input.body === 'string' ? input.body : '', 'markdown');

    let cleanTitle = '';
    if (title.status === 'invalid_encoding') {
      fieldErrors.title = INVALID_TEXT_ENCODING_MESSAGE;
    } else if (title.text === '') {
      fieldErrors.title = 'Title is required.';
    } else if ([...title.text].length > NEWS_TITLE_MAX_LENGTH) {
      fieldErrors.title = `Title must be ${NEWS_TITLE_MAX_LENGTH} characters or fewer.`;
    } else {
      cleanTitle = title.text;
    }

    let cleanBody = '';
    if (body.status === 'invalid_encoding') {
      fieldErrors.body = INVALID_TEXT_ENCODING_MESSAGE;
    } else if (body.text === '') {
      fieldErrors.body = 'Body is required.';
    } else {
      cleanBody = body.text;
    }

    let publishedAt = nowIso;
    const rawDate = typeof input.publishedAt === 'string' ? input.publishedAt.trim() : '';
    if (rawDate !== '') {
      const parsed = Date.parse(rawDate);
      if (Number.isNaN(parsed)) {
        fieldErrors.publishedAt = 'Publish date must be a valid date and time.';
      } else {
        publishedAt = new Date(parsed).toISOString();
      }
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }
    return { title: cleanTitle, body: cleanBody, publishedAt };
  },

  /** Shapes one item for display: its label, a Community post's byline, and its rendered body. */
  shapeNewsItem(row: NewsItemRow): NewsItemView {
    const label = newsLabelFor(row.news_type);
    const isCommunity = label === 'Community';
    const byline = isCommunity && row.author_display_name && row.author_slug
      ? { displayName: row.author_display_name, profileHref: `/members/${row.author_slug}` }
      : null;
    return {
      id: row.id,
      title: row.title,
      label,
      publishedAt: row.published_at,
      byline,
      bodyHtml: renderNewsMarkdown(row.body, { memberAuthored: isCommunity }),
    };
  },

  /** The year whose news the landing page shows: the current UTC year. */
  currentNewsYear(nowIso: string): number {
    return newsYearOf(nowIso);
  },

  /**
   * A year's news page: the current year's at `/news`, which shows an empty
   * state when it has no items, or another year's, which exists only while it
   * holds items. The year navigation links only to years holding items.
   */
  getNewsYearPage(year: number, nowIso: string): PageViewModel<NewsYearContent> {
    const currentYear = newsYearOf(nowIso);
    if (!Number.isInteger(year) || year < 1000 || year > currentYear) {
      throw new NotFoundError('No news for that year.');
    }
    return runSqliteRead('getNewsYearPage', () => {
      const rows = newsItems.listPublicByYear.all(nowIso, String(year)) as PublicNewsItemRow[];
      const isCurrent = year === currentYear;
      if (rows.length === 0 && !isCurrent) throw new NotFoundError('No news for that year.');

      const yearsHoldingItems = (newsItems.listPublicYears.all(nowIso) as Array<{ year: number }>)
        .map((r) => r.year);
      const navYears = yearsHoldingItems.includes(year) ? yearsHoldingItems : [...yearsHoldingItems, year];
      const { previousYear, nextYear } = getAdjacentArchiveYears(navYears, year);

      const eventIds = rows.flatMap((r) => (r.event_id ? [r.event_id] : []));
      const covers = eventIds.length > 0 ? eventCoverPhotos(eventIds) : new Map<string, CoverPhotoView>();
      const items = rows.map((row) => toNewsDatedItem(row, {
        galleryHref: row.event_tag_normalized ? mediaService.getEntityGalleryHref(row.event_tag_normalized) : null,
        thumbUrl: row.event_id ? covers.get(row.event_id)?.thumbUrl ?? null : null,
      }));

      return {
        seo: isCurrent
          ? { title: 'News', description: 'News from IFPA and posts from the footbag community.' }
          : { title: `${year} News`, description: `News from IFPA and posts from the footbag community in ${year}.` },
        page: isCurrent
          ? {
            sectionKey: 'news',
            pageKey: 'news_index',
            title: 'Footbag News',
            intro: 'News from IFPA and posts from the footbag community.',
          }
          : {
            sectionKey: 'news',
            pageKey: 'news_year',
            title: `Footbag News From ${year}`,
            intro: `News from IFPA and posts from the footbag community in ${year}.`,
          },
        navigation: {
          siblings: {
            previous: previousYear !== null
              ? { label: String(previousYear), href: newsYearHref(previousYear, currentYear) } : undefined,
            next: nextYear !== null
              ? { label: String(nextYear), href: newsYearHref(nextYear, currentYear) } : undefined,
          },
          ...(isCurrent ? {} : { contextLinks: [{ label: 'Back to Footbag News', href: '/news' }] }),
        },
        content: { year, items },
      };
    });
  },

  /**
   * One item's own page, in the detail-page order: an event item's cover, the
   * item's facts, an event item's media line, the body, the link to the event,
   * and the link back to the item's year.
   */
  getNewsItemPage(newsId: string, nowIso: string): PageViewModel<NewsItemContent> {
    return runSqliteRead('getNewsItemPage', () => {
      const row = newsItems.getPublicById.get(newsId, nowIso) as PublicNewsItemRow | undefined;
      if (!row) throw new NotFoundError('News item not found.');
      const view = newsService.shapeNewsItem(row);
      const currentYear = newsYearOf(nowIso);
      const itemYear = newsYearOf(row.published_at);

      let event: NewsItemContent['event'] = null;
      let cover: CoverPhotoView | null = null;
      if (row.event_id && row.event_tag_normalized && row.event_tag_display) {
        const galleryHref = mediaService.getEntityGalleryHref(row.event_tag_normalized);
        event = {
          href: eventHrefFromTag(row.event_tag_normalized),
          linkLabel: 'View Event',
          hashtag: { display: row.event_tag_display, galleryHref },
          galleryLabel: 'View Event Gallery',
        };
        cover = eventCoverPhotos([row.event_id]).get(row.event_id) ?? null;
      }

      const description = newsExcerpt(row.body);
      return {
        seo: {
          title: row.title,
          ...(description !== '' ? { description } : {}),
          ...(cover ? { imageUrl: cover.absoluteDisplayUrl } : {}),
        },
        page: { sectionKey: 'news', pageKey: 'news_item', title: row.title },
        navigation: {
          contextLinks: [itemYear === currentYear
            ? { label: 'Back to Footbag News', href: '/news' }
            : { label: `Back to Footbag News From ${itemYear}`, href: `/news/year/${itemYear}` }],
        },
        content: {
          label: view.label,
          dateText: newsDateText(row.published_at),
          byline: view.byline ? { text: bylineText(view.byline.displayName), profileHref: view.byline.profileHref } : null,
          bodyHtml: view.bodyHtml,
          coverPhoto: cover ? coverPhotoImage(cover, row.event_title ?? row.title) : null,
          event,
        },
      };
    });
  },
};
