/**
 * AdminNewsService -- the administrators' news desk: every news item listed,
 * News items written and edited, any item hidden, restored or deleted.
 *
 * Owns:
 *   - The admin news list (`/admin/news`): every item whatever its state,
 *     newest first by publication date, a page at a time, each with its label,
 *     publication time, whether it is public, hidden or still to be published,
 *     and whether an administrator wrote it, the platform created it, or a
 *     member posted it.
 *   - Writing a News item (`/admin/news/new`): a title, a Markdown body, an
 *     optional event or club named by its hashtag, and a publication time
 *     that defaults to now. A preview shows the item as it will appear before
 *     anything is saved.
 *   - One item's admin page (`/admin/news/:newsId`): a News item's edit form,
 *     with the same preview, or a Community post shown as written, since its
 *     words are the member's and are never edited; and the hide, restore and
 *     delete controls. An automatic item may be edited, but stays linked to
 *     the event it was created for.
 *   - Hiding an item, with a required reason, which takes it off every public
 *     news surface; restoring a hidden item; and deleting an item permanently,
 *     through a confirm page with a required reason.
 *
 * Does not own:
 *   - The authored-item rules (title, body, publication time) and display
 *     shaping, which the news service owns and this service applies.
 *   - The public news pages and their visibility filter (news service).
 *   - Creating a Community post, which a member's approved announcement does
 *     (broadcast service).
 *
 * Required patterns:
 *   - Every write and its audit row commit in one transaction; a notice to a
 *     Community post's member is queued inside it, so a rolled-back act sends
 *     nothing.
 *   - An edit records each changed field's value before and after, because it
 *     may land on another administrator's item or on one the platform wrote.
 *     An edit that changes nothing writes nothing.
 *   - Hiding an item already hidden, or restoring one already public, changes
 *     nothing and writes nothing; the item's page shows the state it holds.
 *   - A written item records its administrator as its author.
 *
 * Persistence: `news_items` (insert, update, delete, the admin reads), reading
 *   an item's event through `events` and its club through `clubs_all`, and the
 *   hashtag field through `tags`.
 * Side effects: audit `news.item.created`, `.updated`, `.rejected`,
 *   `.restored` and `.deleted`; the `news_post_hidden` and `news_post_deleted`
 *   notices to a Community post's member.
 */
import { randomUUID } from 'node:crypto';
import { account, newsItems, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { emailService } from './emailService';
import { normalizeTagToken } from './mediaService';
import { newsLabelFor, newsService, type NewsType, type ValidAuthoredNews } from './newsService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { INVALID_TEXT_ENCODING_MESSAGE, sanitizeUserText } from '../lib/textSanitizer';
import { resolvePage, shapePagination, type Pagination } from '../lib/pagination';
import type { PageViewModel } from '../types/page';

const LIST_PATH = '/admin/news';
const LIST_PAGE_SIZE = 50;
const REASON_MAX = 500;

/** The form's fields as typed. */
export interface AdminNewsInput {
  title?: string;
  body?: string;
  hashtag?: string;
  publishedAt?: string;
}

interface AdminNewsRow {
  id: string;
  news_type: NewsType;
  title: string;
  body: string;
  published_at: string;
  is_public: number;
  entity_type: string | null;
  entity_id: string | null;
  author_member_id: string | null;
  event_title: string | null;
  event_tag_display: string | null;
  club_name: string | null;
  club_tag_display: string | null;
}

interface AdminNewsListRow {
  id: string;
  news_type: NewsType;
  title: string;
  published_at: string;
  is_public: number;
}

export interface AdminNewsListItem {
  title: string;
  href: string;
  label: string;
  publishedText: string;
  stateLabel: string;
  sourceLabel: string;
}

export interface AdminNewsListContent {
  rows: AdminNewsListItem[];
  hasRows: boolean;
  newHref: string;
  pagination: Pagination;
}

export interface AdminNewsFields {
  title: string;
  body: string;
  hashtag: string;
  publishedAt: string;
}

export interface AdminNewsPreview {
  title: string;
  label: string;
  dateText: string;
  bodyHtml: string;
}

export interface AdminNewsModeration {
  isHidden: boolean;
  hideAction: string;
  restoreAction: string;
  deleteHref: string;
  reasonValue: string;
  reasonError: string | null;
}

export interface AdminNewsEditContent {
  isNew: boolean;
  /** A News item: the form is shown. A Community post is shown as written. */
  isEditable: boolean;
  formAction: string;
  fields: AdminNewsFields;
  /** An automatic item keeps the link to the event it was created for. */
  hashtagLocked: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  saved: boolean;
  preview: AdminNewsPreview | null;
  /** The facts strip of an existing item. */
  facts: { label: string; publishedText: string; stateLabel: string; sourceLabel: string } | null;
  /** A Community post's title and rendered body, shown as written. */
  communityPost: { title: string; bodyHtml: string } | null;
  moderation: AdminNewsModeration | null;
  backHref: string;
}

export interface AdminNewsDeleteContent {
  title: string;
  action: string;
  cancelHref: string;
  reasonValue: string;
  reasonError: string | null;
}

export interface AdminNewsPageOptions {
  submitted?: AdminNewsInput;
  fieldErrors?: Record<string, string>;
  preview?: AdminNewsPreview | null;
  saved?: boolean;
  reasonValue?: string;
  reasonError?: string;
}

export type AdminNewsWriteResult =
  | { status: 'created'; newsItemId: string }
  | { status: 'updated' }
  | { status: 'unchanged' };

export type AdminNewsStateResult = { status: 'changed' } | { status: 'already_held' };

const NEWS_INSTRUCTIONS = {
  what: 'Write a News item in IFPA\'s voice. It shows no byline.',
  how: 'Write the body in Markdown: headings, emphasis, lists and links. Preview it before saving.',
  headsUp: [
    'A future publish date keeps the item off the public pages until then.',
    'Changes are recorded in the audit log.',
  ],
};

const COMMUNITY_INSTRUCTIONS = {
  what: 'A member\'s approved post. Its words are the member\'s, so it cannot be edited.',
  how: 'Hide it or delete it, with a reason the member receives by email.',
};

function itemHref(id: string): string {
  return `${LIST_PATH}/${id}`;
}

function timeText(iso: string): string {
  return `${iso.slice(0, 16).replace('T', ' ')} UTC`;
}

/** The stored time as the form shows it: UTC, to the minute. */
function timeField(iso: string): string {
  return iso.slice(0, 16).replace('T', ' ');
}

function stateLabel(row: { is_public: number; published_at: string }, nowIso: string): string {
  if (row.is_public !== 1) return 'Hidden';
  return row.published_at > nowIso ? 'Scheduled' : 'Public';
}

function sourceLabel(newsType: NewsType): string {
  if (newsType === 'announcement') return 'Administrator';
  if (newsType === 'community_post') return 'Member';
  return 'Automatic';
}

function isAutomatic(newsType: NewsType): boolean {
  return newsType !== 'announcement' && newsType !== 'community_post';
}

function hashtagOf(row: AdminNewsRow): string {
  return row.event_tag_display ?? row.club_tag_display ?? '';
}

function loadItem(id: string): AdminNewsRow {
  const row = newsItems.getForAdmin.get(id) as AdminNewsRow | undefined;
  if (!row) throw new NotFoundError('News item not found.');
  return row;
}

/** The event or club a typed hashtag names, or none for an empty field. */
function resolveHashtag(
  raw: string | undefined,
  fieldErrors: Record<string, string>,
): { entityType: string | null; entityId: string | null } {
  const typed = (raw ?? '').trim();
  if (typed === '') return { entityType: null, entityId: null };
  const tag = normalizeTagToken(typed);
  const found = tag === ''
    ? undefined
    : newsItems.entityByHashtag.get(tag, tag) as { entity_type: string; entity_id: string } | undefined;
  if (!found) {
    fieldErrors.hashtag = 'No event or club carries this hashtag.';
    return { entityType: null, entityId: null };
  }
  return { entityType: found.entity_type, entityId: found.entity_id };
}

interface ValidNewsForm extends ValidAuthoredNews {
  entityType: string | null;
  entityId: string | null;
}

/**
 * Cleans and checks the form, the hashtag included unless it is locked,
 * gathering every field error into one refusal.
 */
function validateForm(
  input: AdminNewsInput,
  nowIso: string,
  locked: { entityType: string | null; entityId: string | null } | null,
): ValidNewsForm {
  const fieldErrors: Record<string, string> = {};
  let authored: ValidAuthoredNews | null = null;
  try {
    authored = newsService.validateAuthoredInput(
      { title: input.title, body: input.body, publishedAt: input.publishedAt }, nowIso,
    );
  } catch (err) {
    if (!(err instanceof ValidationError)) throw err;
    Object.assign(fieldErrors, err.fieldErrors ?? {});
  }
  const entity = locked ?? resolveHashtag(input.hashtag, fieldErrors);
  if (authored === null || Object.keys(fieldErrors).length > 0) {
    throw new ValidationError('Some fields need attention.', { fieldErrors });
  }
  return { ...authored, ...entity };
}

function validateReason(raw: string | undefined): string {
  const cleaned = sanitizeUserText(raw ?? '', 'multi_line');
  if (cleaned.status === 'invalid_encoding') {
    throw new ValidationError(INVALID_TEXT_ENCODING_MESSAGE, { fieldErrors: { reason: INVALID_TEXT_ENCODING_MESSAGE } });
  }
  if (cleaned.text === '') {
    throw new ValidationError('A reason is required.', { fieldErrors: { reason: 'A reason is required.' } });
  }
  if ([...cleaned.text].length > REASON_MAX) {
    const message = `The reason must be ${REASON_MAX} characters or fewer.`;
    throw new ValidationError(message, { fieldErrors: { reason: message } });
  }
  return cleaned.text;
}

function previewOf(v: ValidAuthoredNews, newsType: NewsType): AdminNewsPreview {
  const view = newsService.shapeNewsItem({
    id: '', news_type: newsType, title: v.title, body: v.body, published_at: v.publishedAt,
  });
  return { title: v.title, label: view.label, dateText: timeText(v.publishedAt), bodyHtml: view.bodyHtml };
}

/** Emails a Community post's member about an administrator's act on it. */
function noticeCommunityMember(
  row: AdminNewsRow,
  act: 'hidden' | 'deleted',
  reason: string,
  auditId: string,
): void {
  if (row.news_type !== 'community_post' || !row.author_member_id) return;
  const author = account.findNotificationContactById.get(row.author_member_id) as
    | { display_name: string }
    | undefined;
  if (!author) return;
  const params = { memberName: author.display_name, title: row.title, note: reason };
  if (act === 'hidden') {
    emailService.sendActNotice({ template: 'news_post_hidden', params, memberId: row.author_member_id, actId: auditId });
  } else {
    emailService.sendActNotice({ template: 'news_post_deleted', params, memberId: row.author_member_id, actId: auditId });
  }
}

function moderationOf(row: AdminNewsRow, opts: AdminNewsPageOptions): AdminNewsModeration {
  return {
    isHidden: row.is_public !== 1,
    hideAction: `${itemHref(row.id)}/reject`,
    restoreAction: `${itemHref(row.id)}/restore`,
    deleteHref: `${itemHref(row.id)}/delete`,
    reasonValue: opts.reasonValue ?? '',
    reasonError: opts.reasonError ?? null,
  };
}

export const adminNewsService = {
  /** Every item, newest first, a page at a time. */
  getNewsListPage(rawPage: unknown, nowIso: string): PageViewModel<AdminNewsListContent> {
    const total = (newsItems.countForAdmin.get() as { n: number }).n;
    const { page, totalPages } = resolvePage(rawPage, total, LIST_PAGE_SIZE, 'Admin news');
    const rows = (newsItems.listForAdmin.all(LIST_PAGE_SIZE, (page - 1) * LIST_PAGE_SIZE) as AdminNewsListRow[])
      .map((row) => ({
        title: row.title,
        href: itemHref(row.id),
        label: newsLabelFor(row.news_type),
        publishedText: timeText(row.published_at),
        stateLabel: stateLabel(row, nowIso),
        sourceLabel: sourceLabel(row.news_type),
      }));
    return {
      seo: { title: 'News', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_news', title: 'News',
        instructions: {
          what: 'Lists every news item, newest first: the ones administrators write, the ones the site creates for events, and members\' Community posts.',
          how: 'Open an item to edit, hide or delete it, or write a new one.',
          headsUp: [
            'Hiding an item takes it off every public news page until it is restored.',
            'Changes are recorded in the audit log.',
          ],
        },
      },
      content: {
        rows,
        hasRows: rows.length > 0,
        newHref: `${LIST_PATH}/new`,
        pagination: shapePagination({
          page, totalPages, pageSize: LIST_PAGE_SIZE, total,
          href: (p) => (p > 1 ? `${LIST_PATH}?page=${p}` : LIST_PATH),
        }),
      },
    };
  },

  /** The blank write form, or the form as typed with its preview or errors. */
  getNewPage(opts: AdminNewsPageOptions = {}): PageViewModel<AdminNewsEditContent> {
    const sub = opts.submitted ?? {};
    const fieldErrors = opts.fieldErrors ?? {};
    return {
      seo: { title: 'News', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_news_new', title: 'New News Item', instructions: NEWS_INSTRUCTIONS },
      content: {
        isNew: true,
        isEditable: true,
        formAction: LIST_PATH,
        fields: {
          title: sub.title ?? '', body: sub.body ?? '', hashtag: sub.hashtag ?? '', publishedAt: sub.publishedAt ?? '',
        },
        hashtagLocked: false,
        fieldErrors,
        errorList: Object.values(fieldErrors),
        saved: false,
        preview: opts.preview ?? null,
        facts: null,
        communityPost: null,
        moderation: null,
        backHref: LIST_PATH,
      },
    };
  },

  /**
   * One item's admin page: a News item's edit form, or a Community post as
   * written, with the moderation controls. Null for an unknown id.
   */
  getItemPage(id: string, nowIso: string, opts: AdminNewsPageOptions = {}): PageViewModel<AdminNewsEditContent> | null {
    const row = newsItems.getForAdmin.get(id) as AdminNewsRow | undefined;
    if (!row) return null;
    const isCommunity = row.news_type === 'community_post';
    const sub = opts.submitted;
    const locked = isAutomatic(row.news_type);
    const fieldErrors = opts.fieldErrors ?? {};
    return {
      seo: { title: 'News', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_news_item',
        title: isCommunity ? 'Community Post' : 'Edit News Item',
        instructions: isCommunity ? COMMUNITY_INSTRUCTIONS : NEWS_INSTRUCTIONS,
      },
      content: {
        isNew: false,
        isEditable: !isCommunity,
        formAction: itemHref(row.id),
        fields: {
          title: sub ? (sub.title ?? '') : row.title,
          body: sub ? (sub.body ?? '') : row.body,
          hashtag: sub && !locked ? (sub.hashtag ?? '') : hashtagOf(row),
          publishedAt: sub ? (sub.publishedAt ?? '') : timeField(row.published_at),
        },
        hashtagLocked: locked,
        fieldErrors,
        errorList: Object.values(fieldErrors),
        saved: opts.saved === true,
        preview: opts.preview ?? null,
        facts: {
          label: newsLabelFor(row.news_type),
          publishedText: timeText(row.published_at),
          stateLabel: stateLabel(row, nowIso),
          sourceLabel: sourceLabel(row.news_type),
        },
        communityPost: isCommunity
          ? { title: row.title, bodyHtml: newsService.shapeNewsItem(row).bodyHtml }
          : null,
        moderation: moderationOf(row, opts),
        backHref: LIST_PATH,
      },
    };
  },

  /** The confirm page before a permanent delete. Null for an unknown id. */
  getDeleteConfirmPage(id: string, opts: { reasonValue?: string; reasonError?: string } = {}): PageViewModel<AdminNewsDeleteContent> | null {
    const row = newsItems.getForAdmin.get(id) as AdminNewsRow | undefined;
    if (!row) return null;
    return {
      seo: { title: 'News', noindex: true },
      page: {
        sectionKey: 'admin', pageKey: 'admin_news_delete', title: 'Delete News Item',
        instructions: { what: 'Review deleting this item before it happens.' },
      },
      content: {
        title: row.title,
        action: `${itemHref(row.id)}/delete`,
        cancelHref: itemHref(row.id),
        reasonValue: opts.reasonValue ?? '',
        reasonError: opts.reasonError ?? null,
      },
    };
  },

  /** Checks a new item's form and shapes its preview; saves nothing. */
  previewNewItem(input: AdminNewsInput, nowIso: string): AdminNewsPreview {
    return previewOf(validateForm(input, nowIso, null), 'announcement');
  },

  /** Checks an edit's form and shapes its preview; saves nothing. */
  previewItemEdit(id: string, input: AdminNewsInput, nowIso: string): AdminNewsPreview {
    const row = loadItem(id);
    if (row.news_type === 'community_post') throw new NotFoundError('A Community post is not edited.');
    const locked = isAutomatic(row.news_type) ? { entityType: row.entity_type, entityId: row.entity_id } : null;
    return previewOf(validateForm(input, nowIso, locked), row.news_type);
  },

  /** Writes a News item in IFPA's voice, its administrator recorded as author. */
  createItem(input: AdminNewsInput, actorMemberId: string, nowIso: string): AdminNewsWriteResult {
    const v = validateForm(input, nowIso, null);
    const id = `news_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    transaction(() => {
      newsItems.insertAuthored.run(
        id, nowIso, actorMemberId, nowIso, actorMemberId,
        v.publishedAt, 'announcement', v.title, v.body, v.entityType, v.entityId, actorMemberId,
      );
      appendAuditEntry({
        actionType: 'news.item.created',
        actorType: 'admin',
        actorMemberId,
        entityType: 'news_item',
        entityId: id,
        metadata: { publishedAt: v.publishedAt, entityType: v.entityType, entityId: v.entityId },
      });
    });
    return { status: 'created', newsItemId: id };
  },

  /**
   * Saves an edit to a News item, recording each changed field before and
   * after. A Community post is never edited; an automatic item keeps its link.
   */
  updateItem(id: string, input: AdminNewsInput, actorMemberId: string, nowIso: string): AdminNewsWriteResult {
    const row = loadItem(id);
    if (row.news_type === 'community_post') throw new NotFoundError('A Community post is not edited.');
    const locked = isAutomatic(row.news_type) ? { entityType: row.entity_type, entityId: row.entity_id } : null;
    const v = validateForm(input, nowIso, locked);

    const changes: Record<string, { before: string | null; after: string | null }> = {};
    const mark = (field: string, before: string | null, after: string | null) => {
      if (before !== after) changes[field] = { before, after };
    };
    mark('title', row.title, v.title);
    mark('body', row.body, v.body);
    mark('publishedAt', row.published_at, v.publishedAt);
    mark('entityType', row.entity_type, v.entityType);
    mark('entityId', row.entity_id, v.entityId);
    if (Object.keys(changes).length === 0) return { status: 'unchanged' };

    transaction(() => {
      newsItems.updateContent.run(
        v.title, v.body, v.publishedAt, v.entityType, v.entityId, nowIso, actorMemberId, id,
      );
      appendAuditEntry({
        actionType: 'news.item.updated',
        actorType: 'admin',
        actorMemberId,
        entityType: 'news_item',
        entityId: id,
        metadata: { newsType: row.news_type, changes },
      });
    });
    return { status: 'updated' };
  },

  /** Hides an item from every public news surface, with a required reason. */
  hideItem(id: string, rawReason: string | undefined, actorMemberId: string, nowIso: string): AdminNewsStateResult {
    const reason = validateReason(rawReason);
    const row = loadItem(id);
    if (row.is_public !== 1) return { status: 'already_held' };
    transaction(() => {
      newsItems.setPublic.run(0, nowIso, actorMemberId, id, 0);
      const auditId = appendAuditEntry({
        actionType: 'news.item.rejected',
        actorType: 'admin',
        actorMemberId,
        entityType: 'news_item',
        entityId: id,
        reasonText: reason,
        metadata: { newsType: row.news_type },
      });
      noticeCommunityMember(row, 'hidden', reason, auditId);
    });
    return { status: 'changed' };
  },

  /** Shows a hidden item again. */
  restoreItem(id: string, actorMemberId: string, nowIso: string): AdminNewsStateResult {
    const row = loadItem(id);
    if (row.is_public === 1) return { status: 'already_held' };
    transaction(() => {
      newsItems.setPublic.run(1, nowIso, actorMemberId, id, 1);
      appendAuditEntry({
        actionType: 'news.item.restored',
        actorType: 'admin',
        actorMemberId,
        entityType: 'news_item',
        entityId: id,
        metadata: { newsType: row.news_type },
      });
    });
    return { status: 'changed' };
  },

  /**
   * Deletes an item permanently, with a required reason. A Community post's
   * announcement loses its link to the post through the foreign key.
   */
  deleteItem(id: string, rawReason: string | undefined, actorMemberId: string): void {
    const reason = validateReason(rawReason);
    const row = loadItem(id);
    transaction(() => {
      newsItems.deleteById.run(id);
      const auditId = appendAuditEntry({
        actionType: 'news.item.deleted',
        actorType: 'admin',
        actorMemberId,
        entityType: 'news_item',
        entityId: id,
        reasonText: reason,
        metadata: {
          newsType: row.news_type,
          publishedAt: row.published_at,
          entityType: row.entity_type,
          entityId: row.entity_id,
          authorMemberId: row.author_member_id,
        },
      });
      noticeCommunityMember(row, 'deleted', reason, auditId);
    });
  },
};
