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
 *   - Removal of an entity's items with it: deleting an event deletes every
 *     item about it.
 *   - The authored-item rules: a title of at most 200 characters and a
 *     Markdown body, both required, and a publication date that defaults to
 *     the moment of writing.
 *   - Display shaping: the label (News for an item in IFPA's voice, written by
 *     an administrator or created automatically; Community for a member's
 *     approved post), the byline a Community post carries and no other item
 *     does, and the body rendered from Markdown to HTML.
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
 * Persistence: `news_items` (insert and delete).
 * Side effects: none of its own; the calling flow writes the audit row for
 *   the act that emitted the item.
 */
import { randomUUID } from 'node:crypto';
import { newsItems } from '../db/db';
import { renderNewsMarkdown } from '../lib/newsMarkdown';
import { INVALID_TEXT_ENCODING_MESSAGE, sanitizeUserText } from '../lib/textSanitizer';
import { ValidationError } from './serviceErrors';

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

export interface NewsItemView {
  id: string;
  title: string;
  label: NewsLabel;
  publishedAt: string;
  /** Present only on a Community post. */
  byline: { displayName: string; profileHref: string } | null;
  bodyHtml: string;
}

function newNewsItemId(): string {
  return `news_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
}

export function newsLabelFor(newsType: NewsType): NewsLabel {
  return newsType === 'community_post' ? 'Community' : 'News';
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
};
