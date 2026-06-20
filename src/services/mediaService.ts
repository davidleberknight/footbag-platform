/**
 * MediaGalleryService -- public media page shaping for the /media URL space.
 *
 * (Implementation file is `mediaService.ts`. Member/curator media WRITES live
 * in `curatorMediaService.ts`; the avatar sub-service lives in
 * `avatarService.ts` via the factory `createAvatarService`.)
 *
 * Owns:
 *   - /media hub page read (collection cards; the Member galleries card links
 *     to the member-galleries list page)
 *   - /media/member-galleries list page read (member-owned named galleries,
 *     oldest first, excluding the auto-default Personal Gallery)
 *   - Profile Media section view-model (getMemberProfileMedia, consumed by
 *     memberService): the member's named galleries as link cards plus a view-all
 *     link, not an inline thumbnail grid
 *   - /media/:galleryId named-gallery page read (tag-AND membership)
 *   - /media/:galleryId/:mediaId named-gallery item-detail read (one item with
 *     prev/next over the gallery's ordered set and a back link to the gallery)
 *   - /media/item/:mediaId standalone item-detail read: the same viewer reached
 *     from any tag-query surface (browse, profile, teaching). The `?tag=` /
 *     `?exclude=` / `?sort=` context rebuilds the ordered set so prev/next walk
 *     it; with no resolvable context (or an item past the render cap) it renders
 *     a single item with no pager and a `?back=` return link.
 *   - Item-detail prev/next wrap modulo the ordered set (next past the end
 *     returns to the first item, previous before the start to the last); a
 *     one-item set hides the pager. Every list surface (named gallery, browse,
 *     profile preview, teaching examples) emits an in-site `itemHref` so a tile
 *     click opens the viewer rather than a raw media-store file.
 *   - /media/browse on-the-fly tag browse read (paginated results mode)
 *   - /media/freestyle-tutorials: permanent 301 redirect to /freestyle/media,
 *     where the freestyle media surface lives (registered before
 *     /media/:galleryId so the literal path matches first)
 *
 * Does not own:
 *   - Any media or gallery write: uploads, edits, deletes, gallery
 *     management, tagging (CuratorMediaService)
 *   - Tag stats recomputation (HashtagDiscoveryService.rebuildTagStats, run via
 *     OperationsPlatformService)
 *   - S3 lifecycle management
 *
 * Required patterns:
 *   - Read-only: no persistence writes, no audit rows, no outbox enqueues.
 *   - Named-gallery and browse page reads filter `moderation_status = 'active'` and
 *     `is_avatar = 0`; default ordering follows `member_galleries.sort_order`.
 *   - Named-gallery render is capped at `GALLERY_ITEMS_QUERY_CAP` rows with a
 *     pre-shaped truncation notice when the matching set exceeds it.
 *   - `/media/browse` accepts repeatable `?tag=` and `?exclude=`, normalized to
 *     `#<lowercase>`, deduplicated; include wins over same-token exclude. Mode is
 *     `browse` (form pane only) when no token resolves, otherwise `results`
 *     (form + paginated tile grid); pagination prev/next reproduce the canonical
 *     repeated-arg form.
 *   - Hero `byMember` chip lifts from any `#by_<slug>` criterion (auth-gated profile
 *     link) so the template renders "by *Member Name*" attribution distinct from
 *     gallery ownership.
 *   - Viewer-aware shaping (`viewer: ViewerContext`): per-item member hrefs are
 *     nulled when the viewer cannot reach the linked profile.
 *
 * Service shape: singleton object (storage adapter used only to construct
 * read URLs).
 */
import {
  CuratorGalleryRow,
  FhNamedGalleryTagRow,
  GALLERY_ITEMS_QUERY_CAP,
  GallerySortOrder,
  countGalleryItemsByCriteria,
  media,
  queryCuratorMediaTags,
  queryGalleryItemsByCriteria,
  queryGalleryItemsByCriteriaGrouped,
  queryRecentCommunityMedia,
  queryMemberDisplayNamesBySlugs,
  queryTagIdsByNormalized,
} from '../db/db';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { isSafePath } from '../lib/safePath';
import { runSqliteRead } from './sqliteRetry';
import { NotFoundError } from './serviceErrors';
import { UPLOADER_TAG_PREFIX } from './curatorMediaService';
import { PageViewModel } from '../types/page';
import { VideoMedia, expandVideoFromMediaItem } from './videoMedia';
import { hashtagDiscoveryService } from './hashtagDiscoveryService';
import { FREESTYLE_MEDIA_STRUCTURE } from '../content/freestyleMedia';

export const PAGE_SIZE = 24;

// Chip-shape for tag rendering: each tag display string carries an
// optional href. `#by_<slug>` chips render the member's display name
// (e.g. "Jane Doe") instead of the raw tag, with an href to
// `/members/<slug>` for authenticated viewers. Unauthenticated viewers
// see the name as plain text (the route is auth-gated, so a clickable
// link would dead-end). Slugs that don't resolve to an active,
// non-purged member fall back to the raw `#by_<slug>` tag string.
// Other tag namespaces have no destination page; they get null hrefs
// and render plain with the raw tag string.
export interface TagChip {
  display: string;
  href: string | null;
}

export interface ViewerContext {
  authenticated: boolean;
}

function collectMemberNamesForByTags(tagDisplays: string[]): Map<string, string> {
  const slugs = new Set<string>();
  for (const t of tagDisplays) {
    if (t.startsWith(UPLOADER_TAG_PREFIX)) slugs.add(t.slice(UPLOADER_TAG_PREFIX.length));
  }
  if (slugs.size === 0) return new Map();
  const rows = queryMemberDisplayNamesBySlugs([...slugs]);
  return new Map(rows.map((r) => [r.slug, r.display_name]));
}

// `buildOtherHref`, when supplied, sets the chip href for non-`#by_*`
// tags. Hero criteria/exclude callers omit it so chips render as plain.
// Item-tile callers pass `browseTagHref` so each chip links to the
// on-the-fly /media/browse view for that tag.
function shapeTagChip(
  display: string,
  viewer: ViewerContext,
  memberNamesBySlug: Map<string, string>,
  buildOtherHref?: () => string,
): TagChip {
  if (display.startsWith(UPLOADER_TAG_PREFIX)) {
    const slug = display.slice(UPLOADER_TAG_PREFIX.length);
    const memberName = memberNamesBySlug.get(slug);
    if (memberName) {
      return {
        display: memberName,
        href: viewer.authenticated ? `/members/${slug}` : null,
      };
    }
  }
  return { display, href: buildOtherHref ? buildOtherHref() : null };
}

// /media/browse URL for a single tag, given its tag_normalized form
// (with leading '#'). The URL token is the normalized form minus the '#',
// matching the input format the browse handler expects.
function browseTagHref(tagNormalized: string): string {
  const token = tagNormalized.startsWith('#') ? tagNormalized.slice(1) : tagNormalized;
  return `/media/browse?tag=${encodeURIComponent(token)}`;
}

// Splits raw criterion/exclude tag rows into the prose-attribution
// chip (`byMember`) and the remaining hashtag chips. A `#by_<slug>`
// criterion that resolves to an active member is lifted into
// `byMember` so the template can render "by <Name>" prose; an
// unresolved `#by_*` stays in `criteriaTags` as the raw tag.
// `#by_*` tags in the exclude list are stripped defensively
// (validateTags rejects them on input, so this is belt-and-braces).
function shapeGalleryChips(
  tagRows: { tag_display: string }[],
  excludeTagRows: { tag_display: string }[],
  viewer: ViewerContext,
  memberNamesBySlug: Map<string, string>,
): { byMember: TagChip | null; criteriaTags: TagChip[]; excludeTags: TagChip[] } {
  let byMember: TagChip | null = null;
  const criteriaTags: TagChip[] = [];
  for (const t of tagRows) {
    if (
      byMember === null &&
      t.tag_display.startsWith(UPLOADER_TAG_PREFIX) &&
      memberNamesBySlug.has(t.tag_display.slice(UPLOADER_TAG_PREFIX.length))
    ) {
      byMember = shapeTagChip(t.tag_display, viewer, memberNamesBySlug);
    } else {
      criteriaTags.push(shapeTagChip(t.tag_display, viewer, memberNamesBySlug));
    }
  }
  const excludeTags = excludeTagRows
    .filter((t) => !t.tag_display.startsWith(UPLOADER_TAG_PREFIX))
    .map((t) => shapeTagChip(t.tag_display, viewer, memberNamesBySlug));
  return { byMember, criteriaTags, excludeTags };
}

export interface GalleryItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  caption: string | null;
  thumbnailUrl: string;     // photo thumb; video tiles read media.thumbnailUrl via the partial
  displayHref: string;      // photo full-size; videos use media.videoUrl via the partial
  uploadedAtIso: string;
  uploadedAtDisplay: string;
  // Per-tile chips: non-`#by_*` link to /media/browse?tag=…; `#by_*` lifts
  // to the member-profile chip-link convention (auth-gated).
  tags: TagChip[];
  // Video tiles render a click-to-play facade via partials/video-facade.hbs
  // fed by this canonical shape. Null for photos.
  media: VideoMedia | null;
  // Link to the in-site viewer page for this item. Every list surface sets it
  // so a tile always opens the viewer rather than a raw media-store file: the
  // named-gallery context uses `/media/{galleryId}/{mediaId}`; browse, profile,
  // and teaching tiles use `/media/item/{mediaId}` carrying their tag-query (or
  // `?back=`) context so the viewer rebuilds the same ordered set for prev/next.
  itemHref: string | null;
}

export interface GalleryPagination {
  page: number;
  pageSize: number;
  total: number;
  hasNext: boolean;
  hasPrev: boolean;
  nextHref?: string;
  prevHref?: string;
}

// Owner attribution surfaced on hub cards and gallery hero blocks so
// readers can tell who curated each gallery. `isSystem` lets the
// template render "Footbag Hacky" without linking to a member profile
// for the curator account.
export interface GalleryOwner {
  displayName: string;
  slug: string;
  isSystem: boolean;
}

// One media-collection card on the /media hub. A null href is a forward-looking
// collection shown as "coming soon" (or the card's `emptyNote` when set, e.g.
// the Member galleries card's "None yet"). `accent` marks the browse-by-hashtag
// card, which leads the grid with a distinct green treatment at the same card size.
export interface MediaHubCard {
  title: string;
  description: string;
  href: string | null;
  cta: string | null;
  accent?: boolean;
  // Fallback note rendered when href is null; defaults to "Coming soon".
  emptyNote?: string;
}

export interface MediaHubContent {
  // The media-collection cards rendered in the hub grid; the browse-by-hashtag
  // card leads.
  cards: MediaHubCard[];
}

// One row on the /media/member-galleries list page: a member-owned named
// gallery with its item count and owner attribution. `ownerHref` is the
// owner's profile link, present only for authenticated viewers (member
// profiles are not visitor-visible); the display name shows regardless.
// One named-gallery link card in the profile Media section.
export interface ProfileGalleryCard {
  name: string;
  description: string;
  itemCount: number;
  itemCountNoun: string;
  href: string;
}

// The profile Media section: the member's named galleries as link cards plus a
// single "view all media" link. No inline thumbnails. `hasContent` is false when
// the member has neither a named gallery nor any upload, so the caller hides the
// section; an anonymous viewer of a HoF/BAP profile receives this empty shape.
export interface ProfileMediaView {
  galleries: ProfileGalleryCard[];
  allMediaHref: string | null;
  hasContent: boolean;
}

export interface MemberGalleryListItem {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  itemCountNoun: string;
  href: string;
  ownerDisplayName: string;
  ownerHref: string | null;
}

export interface MemberGalleriesContent {
  galleries: MemberGalleryListItem[];
  hasGalleries: boolean;
}

// One folder in the Freestyle Media section. A null href is a folder whose
// backing gallery has no items yet, shown as "coming soon" rather than dropped
// so the structure stays stable as content is curated.
export interface FreestyleMediaFolderView {
  label: string;
  description: string;
  itemCount: number;
  href: string | null;
  available: boolean;
}

// One section of the Freestyle Media page: an optional heading plus its folders.
// A null heading renders the folders as top-level cards.
export interface FreestyleMediaSectionView {
  heading: string | null;
  folders: FreestyleMediaFolderView[];
}

// The Freestyle Media content model, rendered identically by /freestyle/media
// and reached from the /media hub's single Freestyle card. Both read the shared
// FREESTYLE_MEDIA_STRUCTURE definition, so the two surfaces never diverge.
export interface FreestyleMediaContent {
  sections: FreestyleMediaSectionView[];
}


// Named-gallery page at /media/<id>: hero with "Named Gallery: <name>"
// + criteria/exclude pill strip, description as a caption paragraph
// below the hero, then a flat item grid in the gallery's sort_order.
// Owner attribution renders in the hero block.
//
// `byMember` is the lifted-out `#by_<slug>` criterion: when a gallery filters
// by a specific member, that chip renders as prose attribution ("by Jane Doe")
// instead of among the hashtag chips. Null when no `#by_*` criterion applies or
// the slug doesn't resolve to an active member (the raw `#by_<slug>` tag then
// stays in criteriaTags).
export interface NamedGalleryHero {
  id: string;
  name: string;
  description: string;
  byMember: TagChip | null;
  criteriaTags: TagChip[];
  excludeTags: TagChip[];
  owner: GalleryOwner;
  externalLinks: Array<{ label: string; url: string }>;
}

export interface NamedGalleryContent {
  gallery: NamedGalleryHero;
  items: GalleryItem[];
  totalItems: number;
  // Pre-pluralized nouns so the hero subtitle never counts in the template.
  totalItemsNoun: string;   // 'item' / 'items'
  excludeTagsNoun: string;  // 'tag' / 'tags'
  // Pre-shaped notice when the result set exceeds the single-page render
  // cap; null when everything fits.
  truncationNotice: string | null;
  // Five site-wide popular tags, shown only when the gallery is empty so the
  // empty state is a teachable moment; absent otherwise.
  popularTags?: BrowseTagChip[];
}

// Single-item viewer rendered by both /media/:galleryId/:mediaId (named-gallery
// context) and /media/item/:mediaId (tag-query / single context). `title` is the
// hero h1 (the gallery name, or the item caption when there is no gallery).
// `backHref`/`backLabel` return to wherever the item was opened from. Prev/next
// walk the context's ordered set and wrap modulo; `showPager` is false for a
// one-item set, hiding the pager. uploadedBy lifts the item's `#by_<slug>` tag
// to a viewer-gated member chip; tags are the item's remaining hashtags.
export interface MediaItemContent {
  title: string;
  backHref: string;
  backLabel: string;
  item: GalleryItem;
  uploadedBy: TagChip | null;
  tags: TagChip[];
  showPager: boolean;
  prevHref: string | null;
  nextHref: string | null;
}

// Request inputs for the standalone /media/item/:mediaId viewer. `rawTags` /
// `rawExcludes` are the normalized-on-the-way-in tag-query context; `rawSort`
// selects the ordered-set order; `rawBack` is a no-context return path, used
// only when no tag context resolves (validated as a safe in-site path).
export interface MediaItemArgs {
  mediaId: string;
  rawTags: string[];
  rawExcludes: string[];
  rawSort: unknown;
  rawBack: unknown;
}

// /media/browse: the on-the-fly tag browse + temp gallery surface. Not a
// named-gallery URL bookmark (no `member_galleries` row). Two render modes:
//
//   mode === 'browse'  → form pane only, no results pane. Bare /media/browse
//                        and submitted-but-unresolved-tags both land here.
//   mode === 'results' → form pane + results pane. At least one criteria
//                        token resolved to a `tags` row.
//
// `formIncludeText` / `formExcludeText` are the space-joined echo of what
// the user submitted (after normalization), so the form re-fills correctly.
// `unresolvedTokens` lists submitted criteria tokens that did not resolve
// to a `tags` row, so the page can show a "no items match those tags"
// hint without 404-ing the URL.
export interface MediaBrowseArgs {
  rawTags: string[];
  rawExcludes: string[];
  rawPage: unknown;
}

export interface BrowseTagChip {
  display: string;
  normalized: string;
  href: string;
}

export interface MediaBrowseContent {
  mode: 'browse' | 'results';
  // Pre-shaped so the template never compares the raw mode code.
  isResultsMode: boolean;
  // Pre-pluralized nouns for the results hero subtitle.
  totalItemsNoun: string;
  excludeTagsNoun: string;
  formIncludeText: string;
  formExcludeText: string;
  unresolvedTokens: string[];
  byMember: TagChip | null;
  criteriaTags: TagChip[];
  excludeTags: TagChip[];
  items: GalleryItem[];
  totalItems: number;
  pagination: GalleryPagination | null;
  popularTags?: BrowseTagChip[];
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function formatUploadedAt(iso: string): string {
  const datePart = iso.slice(0, 10);
  const [year, mm, dd] = datePart.split('-');
  const month = parseInt(mm, 10);
  const day = parseInt(dd, 10);
  if (!month || !day) return year ?? iso;
  return `${day} ${MONTHS[month - 1]} ${year}`;
}

function sanitizePage(raw: unknown): number {
  const n =
    typeof raw === 'string' ? parseInt(raw, 10)
    : typeof raw === 'number' ? raw
    : NaN;
  if (!Number.isFinite(n) || n < 1) return 1;
  return Math.floor(n);
}

function shapeItem(
  row: CuratorGalleryRow,
  tags: TagChip[],
  constructURL: (key: string) => string,
): GalleryItem {
  let thumbnailUrl: string;
  let displayHref: string;
  let media: VideoMedia | null = null;

  if (row.media_type === 'video') {
    media = expandVideoFromMediaItem(row, {
      constructURL,
      videoTitle: row.caption ?? '',
    });
    thumbnailUrl = media?.thumbnailUrl ?? '';
    displayHref = media?.videoUrl ?? '';
  } else {
    thumbnailUrl = row.s3_key_thumb ? constructURL(row.s3_key_thumb) : '';
    displayHref = row.s3_key_display ? constructURL(row.s3_key_display) : '';
  }

  return {
    mediaId: row.id,
    mediaType: row.media_type,
    caption: row.caption,
    thumbnailUrl,
    displayHref,
    uploadedAtIso: row.uploaded_at,
    uploadedAtDisplay: formatUploadedAt(row.uploaded_at),
    tags,
    media,
    itemHref: null,
  };
}

interface NamedGalleryWithOwnerRow {
  id: string;
  name: string;
  description: string;
  sort_order: 'upload_desc' | 'upload_asc' | 'caption_asc';
  owner_member_id: string;
  is_system: number;
  owner_display_name: string | null;
  owner_slug: string | null;
}

function shapeOwner(row: NamedGalleryWithOwnerRow): GalleryOwner {
  return {
    displayName: row.owner_display_name ?? 'Unknown',
    slug: row.owner_slug ?? '',
    isSystem: row.is_system === 1,
  };
}

// Upper bound on resolved include/exclude tags carried into the standalone item
// viewer. The viewer route is public and attacker-facing; each tag adds a query
// placeholder, so an unbounded list is a mild query-size vector. Overflow is
// dropped, matching how unresolved tokens are silently dropped on browse.
const ITEM_CONTEXT_TAG_CAP = 12;

// A gallery is a query over media items. The item viewer takes that query as a
// context so it can rebuild the same ordered set the tile was clicked in:
//   named  — a stored member_galleries row (criteria/exclude/sort from the DB)
//   query  — an ad-hoc tag query carried in the URL (browse, profile)
//   single — no rebuildable set: one item, no pager, a caller-supplied back link
type GalleryContext =
  | { kind: 'named'; galleryId: string }
  | { kind: 'query'; includeNormalized: string[]; excludeNormalized: string[]; sort: GallerySortOrder }
  | { kind: 'single'; backHref: string; backLabel: string };

function sanitizeSort(raw: unknown): GallerySortOrder {
  return raw === 'upload_asc' || raw === 'caption_asc' ? raw : 'upload_desc';
}

// The hero h1 for the standalone viewer, which has no gallery name to show.
function titleFor(row: CuratorGalleryRow): string {
  const caption = row.caption?.trim();
  return caption && caption.length > 0 ? caption : 'Media';
}

// Re-encode a tag-query context onto the standalone viewer URL so the set the
// user clicked into is byte-identical to the set the viewer rebuilds. The
// default sort is omitted so the common browse link stays `?tag=…`.
function buildItemContextQueryString(
  includeNormalized: string[],
  excludeNormalized: string[],
  sort: GallerySortOrder,
): string {
  const base = buildBrowseQueryString(includeNormalized, excludeNormalized);
  if (sort === 'upload_desc') return base;
  const sortParam = `sort=${encodeURIComponent(sort)}`;
  return base.length > 0 ? `${base}&${sortParam}` : sortParam;
}

interface ResolvedItemSet {
  rows: CuratorGalleryRow[];          // ordered set the pager walks; length >= 1
  index: number;                       // position of the requested item in rows
  encodeItemHref: (id: string) => string;
  backHref: string;
  backLabel: string;
  title: string;
}

// The one-item fallback: the item shows on its own with no pager. Used by the
// single context, and when a query context cannot locate the item in its
// rebuildable window (past the render cap, or no longer carrying the criteria).
function singleItemSet(mediaId: string, backHref: string, backLabel: string): ResolvedItemSet {
  const row = media.getPublicMediaItemById.get(mediaId) as CuratorGalleryRow | undefined;
  if (!row) {
    throw new NotFoundError(`media item ${mediaId} not found`);
  }
  return {
    rows: [row],
    index: 0,
    encodeItemHref: (id) => `/media/item/${encodeURIComponent(id)}`,
    backHref,
    backLabel,
    title: titleFor(row),
  };
}

function resolveItemSet(ctx: GalleryContext, mediaId: string): ResolvedItemSet {
  if (ctx.kind === 'single') {
    return singleItemSet(mediaId, ctx.backHref, ctx.backLabel);
  }

  if (ctx.kind === 'named') {
    const gallery = media.getNamedGalleryById.get(ctx.galleryId) as
      | NamedGalleryWithOwnerRow
      | undefined;
    if (!gallery) {
      throw new NotFoundError(`gallery ${ctx.galleryId} not found`);
    }
    const tagIds = (media.listFhNamedGalleryTags.all(ctx.galleryId) as FhNamedGalleryTagRow[]).map((t) => t.id);
    const excludeTagIds = (media.listFhNamedGalleryExcludeTags.all(ctx.galleryId) as FhNamedGalleryTagRow[])
      .map((t) => t.id);
    // The same ordered, capped item set the gallery page renders, so prev/next
    // follow the gallery's sort. A named-gallery item URL asserts membership, so
    // an item not in the set (including one past the cap) is a genuine 404.
    const fetched = queryGalleryItemsByCriteriaGrouped(
      tagIds, gallery.sort_order, excludeTagIds, GALLERY_ITEMS_QUERY_CAP + 1,
    );
    const rows = fetched.length > GALLERY_ITEMS_QUERY_CAP ? fetched.slice(0, GALLERY_ITEMS_QUERY_CAP) : fetched;
    const index = rows.findIndex((r) => r.id === mediaId);
    if (index === -1) {
      throw new NotFoundError(`item ${mediaId} not found in gallery ${ctx.galleryId}`);
    }
    const gid = encodeURIComponent(gallery.id);
    return {
      rows,
      index,
      encodeItemHref: (id) => `/media/${gid}/${encodeURIComponent(id)}`,
      backHref: `/media/${gid}`,
      backLabel: 'Back to gallery',
      title: gallery.name,
    };
  }

  // kind === 'query'
  const browseBack = `/media/browse?${buildBrowseQueryString(ctx.includeNormalized, ctx.excludeNormalized)}`;
  const allNormalized = [...ctx.includeNormalized, ...ctx.excludeNormalized];
  const tagRows = allNormalized.length === 0 ? [] : queryTagIdsByNormalized(allNormalized);
  const byNorm = new Map(tagRows.map((r) => [r.tag_normalized, r]));
  const criteriaTagIds = ctx.includeNormalized
    .map((n) => byNorm.get(n)?.id)
    .filter((id): id is string => id != null);
  const excludeTagIds = ctx.excludeNormalized
    .map((n) => byNorm.get(n)?.id)
    .filter((id): id is string => id != null);

  // No criteria token resolved to a real tag: nothing to walk, so show the
  // single item with a back link to the (empty) browse results.
  if (criteriaTagIds.length === 0) {
    return singleItemSet(mediaId, browseBack, 'Back to results');
  }

  const fetched = queryGalleryItemsByCriteriaGrouped(
    criteriaTagIds, ctx.sort, excludeTagIds, GALLERY_ITEMS_QUERY_CAP + 1,
  );
  const rows = fetched.length > GALLERY_ITEMS_QUERY_CAP ? fetched.slice(0, GALLERY_ITEMS_QUERY_CAP) : fetched;
  const index = rows.findIndex((r) => r.id === mediaId);
  if (index === -1) {
    // Past the render cap, or the item no longer carries the criteria: the tile
    // was just rendered, so never dead-end — show it on its own, back to results.
    return singleItemSet(mediaId, browseBack, 'Back to results');
  }
  const ctxQuery = buildItemContextQueryString(ctx.includeNormalized, ctx.excludeNormalized, ctx.sort);
  return {
    rows,
    index,
    encodeItemHref: (id) => `/media/item/${encodeURIComponent(id)}?${ctxQuery}`,
    backHref: browseBack,
    backLabel: 'Back to results',
    title: titleFor(rows[index]),
  };
}

// Shapes one item-viewer page for any context. Computes prev/next once, wrapping
// modulo the ordered set, and lifts the item's `#by_<slug>` tag to a viewer-gated
// uploader chip with the rest rendered as browseable hashtag chips.
function buildItemPage(
  ctx: GalleryContext,
  mediaId: string,
  viewer: ViewerContext,
): PageViewModel<MediaItemContent> {
  const set = resolveItemSet(ctx, mediaId);
  const n = set.rows.length;
  const row = set.rows[set.index];

  const itemTagRows = queryCuratorMediaTags([mediaId]);
  const memberNamesBySlug = collectMemberNamesForByTags(itemTagRows.map((r) => r.tag_display));

  let uploadedBy: TagChip | null = null;
  const tags: TagChip[] = [];
  for (const tr of itemTagRows) {
    if (tr.tag_display.startsWith(UPLOADER_TAG_PREFIX)) {
      if (uploadedBy === null && memberNamesBySlug.has(tr.tag_display.slice(UPLOADER_TAG_PREFIX.length))) {
        uploadedBy = shapeTagChip(tr.tag_display, viewer, memberNamesBySlug);
      }
    } else {
      tags.push(shapeTagChip(tr.tag_display, viewer, memberNamesBySlug, () => browseTagHref(tr.tag_normalized)));
    }
  }

  const adapter = getMediaStorageAdapter();
  const item = shapeItem(row, [], (k) => adapter.constructURL(k));
  const showPager = n > 1;

  return {
    seo: { title: set.title },
    page: {
      sectionKey: 'media',
      pageKey: 'media_gallery_item',
      title: set.title,
    },
    content: {
      title: set.title,
      backHref: set.backHref,
      backLabel: set.backLabel,
      item,
      uploadedBy,
      tags,
      showPager,
      prevHref: showPager ? set.encodeItemHref(set.rows[(set.index - 1 + n) % n].id) : null,
      nextHref: showPager ? set.encodeItemHref(set.rows[(set.index + 1) % n].id) : null,
    },
  };
}

export const mediaService = {
  getMediaHubPage(): PageViewModel<MediaHubContent> {
    return runSqliteRead('mediaService.getMediaHubPage', () => {
      const galleries = media.listAllNamedGalleries.all() as NamedGalleryWithOwnerRow[];

      // The hub no longer lists each gallery inline: member-owned named
      // galleries live behind the Member galleries card and its list page, and
      // FH-owned galleries are reached through the curated collection cards.
      // Only two facts drive the cards here: whether any member gallery exists
      // (the card links to the list page when so, otherwise it shows a "none
      // yet" note) and whether the chinlone collection is seeded (the Related
      // Sports link).
      const hasMemberGalleries = galleries.some((g) => g.is_system === 0);
      const relatedSportsHref = galleries.some((g) => g.id === 'gallery_chinlone')
        ? '/media/gallery_chinlone' : null;

      // The browse-by-hashtag card leads the grid with a distinct green treatment.
      // The Member galleries card sits second. A single Freestyle card opens into
      // the shared Freestyle Media section (tutorials and demos, records, curated
      // trick videos, shred clips), so the hub and /freestyle/media present one
      // structure. Related Sports absorbs chinlone and (future) sepak takraw.
      const cards: MediaHubCard[] = [
        {
          title: 'Browse by hashtag',
          description: 'Find every photo and video matching a set of hashtags.',
          href: '/media/browse',
          cta: 'Browse tags',
          accent: true,
        },
        {
          title: 'Member galleries',
          description: 'Photo and video galleries created by IFPA members.',
          href: hasMemberGalleries ? '/media/member-galleries' : null,
          cta: hasMemberGalleries ? 'Browse member galleries' : null,
          emptyNote: hasMemberGalleries ? undefined : 'None yet',
        },
        {
          title: 'Freestyle',
          description: 'Tutorials and demos, records footage, and curated freestyle videos.',
          href: '/freestyle/media',
          cta: 'Browse freestyle',
        },
        {
          title: 'Net',
          description: 'Net footage, instructional content, and future net media collections.',
          href: null,
          cta: null,
        },
        {
          title: 'Sideline',
          description: 'Sideline and circle-kicking footage.',
          href: null,
          cta: null,
        },
        {
          title: 'Related Sports',
          description: 'Media from sports closely related to footbag.',
          href: relatedSportsHref,
          cta: relatedSportsHref == null ? null : 'Browse',
        },
      ];

      return {
        seo: { title: 'Media Galleries' },
        page: {
          sectionKey: 'media',
          pageKey: 'media_hub',
          title: 'Footbag Media',
          intro: 'Browse by hashtag or visit named galleries.',
        },
        content: { cards },
      };
    });
  },

  getMemberGalleriesPage(viewer: ViewerContext = { authenticated: false }): PageViewModel<MemberGalleriesContent> {
    return runSqliteRead('mediaService.getMemberGalleriesPage', () => {
      const rows = media.listMemberOwnedNamedGalleries.all() as Array<{
        id: string;
        name: string;
        description: string;
        created_at: string;
        owner_slug: string;
        owner_display_name: string;
      }>;
      const galleries: MemberGalleryListItem[] = rows.map((g) => {
        const tagIds = (media.listFhNamedGalleryTags.all(g.id) as FhNamedGalleryTagRow[]).map((t) => t.id);
        const excludeTagIds = (media.listFhNamedGalleryExcludeTags.all(g.id) as FhNamedGalleryTagRow[]).map(
          (t) => t.id,
        );
        const itemCount = countGalleryItemsByCriteria(tagIds, excludeTagIds);
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          itemCount,
          itemCountNoun: itemCount === 1 ? 'item' : 'items',
          href: `/media/${g.id}`,
          ownerDisplayName: g.owner_display_name,
          // Member profiles are visible to signed-in members only, so the owner
          // link is present for authenticated viewers and omitted for visitors,
          // who still see the owner's display name.
          ownerHref: viewer.authenticated ? `/members/${g.owner_slug}` : null,
        };
      });
      return {
        seo: { title: 'Member Galleries' },
        page: {
          sectionKey: 'media',
          pageKey: 'media_member_galleries',
          title: 'Member Galleries',
          intro: 'Photo and video galleries created by IFPA members.',
        },
        content: { galleries, hasGalleries: galleries.length > 0 },
      };
    });
  },

  // The profile Media section: the member's named galleries shaped as link cards
  // (name, description, item count, gallery URL), plus a "view all media" link.
  // The profile points at the galleries the member deliberately created rather
  // than embedding a thumbnail grid; the "view all" link covers every upload,
  // including the auto Personal Gallery that the named-gallery list excludes.
  // Item counts use the same tag-AND match the gallery page renders.
  getMemberProfileMedia(memberId: string, ownerSlug: string): ProfileMediaView {
    return runSqliteRead('mediaService.getMemberProfileMedia', () => {
      const galleryRows = media.listMemberNamedGalleriesByOwner.all(memberId) as Array<{
        id: string; name: string; description: string;
      }>;
      const galleries: ProfileGalleryCard[] = galleryRows.map((g) => {
        const tagIds = (media.listFhNamedGalleryTags.all(g.id) as FhNamedGalleryTagRow[]).map((t) => t.id);
        const excludeTagIds = (media.listFhNamedGalleryExcludeTags.all(g.id) as FhNamedGalleryTagRow[])
          .map((t) => t.id);
        const itemCount = countGalleryItemsByCriteria(tagIds, excludeTagIds);
        return {
          name: g.name,
          description: g.description,
          itemCount,
          itemCountNoun: itemCount === 1 ? 'item' : 'items',
          href: `/media/${encodeURIComponent(g.id)}`,
        };
      });

      const hasUploads = (media.listMemberUploadedMedia.all(memberId, 1) as CuratorGalleryRow[]).length > 0;
      const allMediaHref = hasUploads
        ? `/media/browse?tag=by_${encodeURIComponent(ownerSlug)}`
        : null;

      return {
        galleries,
        allMediaHref,
        hasContent: galleries.length > 0 || allMediaHref != null,
      };
    });
  },

  getFreestyleMediaSection(): PageViewModel<FreestyleMediaContent> {
    return runSqliteRead('mediaService.getFreestyleMediaSection', () => {
      const byId = new Map(
        (media.listAllNamedGalleries.all() as NamedGalleryWithOwnerRow[]).map((g) => [g.id, g]),
      );
      const sections: FreestyleMediaSectionView[] = FREESTYLE_MEDIA_STRUCTURE.map((section) => ({
        heading: section.heading,
        folders: section.folders.map((f) => {
          const g = byId.get(f.galleryId);
          if (g == null) {
            // Gallery not seeded yet: keep the folder visible as a
            // forward-looking entry so the structure does not silently shrink.
            return { label: f.label, description: '', itemCount: 0, href: null, available: false };
          }
          const tagIds = (media.listFhNamedGalleryTags.all(g.id) as FhNamedGalleryTagRow[]).map(
            (t) => t.id,
          );
          const excludeTagIds = (
            media.listFhNamedGalleryExcludeTags.all(g.id) as FhNamedGalleryTagRow[]
          ).map((t) => t.id);
          const itemCount = countGalleryItemsByCriteria(tagIds, excludeTagIds);
          return {
            label: f.label,
            description: g.description,
            itemCount,
            href: itemCount > 0 ? `/media/${g.id}` : null,
            available: itemCount > 0,
          };
        }),
      }));
      return {
        seo: { title: 'Freestyle Media' },
        page: {
          sectionKey: 'freestyle',
          pageKey: 'freestyle_media',
          title: 'Freestyle Media',
          intro:
            'Tutorials and demos, records footage, curated trick videos, and individual shred clips.',
        },
        content: { sections },
      };
    });
  },

  getNamedGalleryPage(
    galleryId: string,
    _rawPage: unknown,
    viewer: ViewerContext = { authenticated: false },
  ): PageViewModel<NamedGalleryContent> {
    return runSqliteRead('mediaService.getNamedGalleryPage', () => {
      const gallery = media.getNamedGalleryById.get(galleryId) as
        | NamedGalleryWithOwnerRow
        | undefined;
      if (!gallery) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      const tagRows = media.listFhNamedGalleryTags.all(galleryId) as FhNamedGalleryTagRow[];
      const excludeTagRows = media.listFhNamedGalleryExcludeTags.all(galleryId) as FhNamedGalleryTagRow[];
      const tagIds = tagRows.map((t) => t.id);
      const excludeTagIds = excludeTagRows.map((t) => t.id);

      // Fetch cap+1 to detect overflow: this is a public unauthenticated
      // route, so the render must stay bounded no matter how broad the
      // gallery criteria are.
      const fetched = queryGalleryItemsByCriteriaGrouped(
        tagIds, gallery.sort_order, excludeTagIds, GALLERY_ITEMS_QUERY_CAP + 1,
      );
      const truncated = fetched.length > GALLERY_ITEMS_QUERY_CAP;
      const rows = truncated ? fetched.slice(0, GALLERY_ITEMS_QUERY_CAP) : fetched;
      const truncationNotice = truncated
        ? `Showing the first ${GALLERY_ITEMS_QUERY_CAP} of ${countGalleryItemsByCriteria(tagIds, excludeTagIds)} items.`
        : null;

      // Per-item tag rows for tile-level chip rendering.
      const itemTagRows = rows.length > 0 ? queryCuratorMediaTags(rows.map((r) => r.id)) : [];

      // Member-name lookup must cover both gallery-level criteria/exclude
      // `#by_*` tags AND item-level `#by_*` chips, so each tile chip lifts
      // to the member display name.
      const memberNamesBySlug = collectMemberNamesForByTags([
        ...tagRows.map((r) => r.tag_display),
        ...excludeTagRows.map((r) => r.tag_display),
        ...itemTagRows.map((r) => r.tag_display),
      ]);
      const chips = shapeGalleryChips(tagRows, excludeTagRows, viewer, memberNamesBySlug);

      const tagsByMediaId = new Map<string, TagChip[]>();
      for (const tr of itemTagRows) {
        const chip = shapeTagChip(
          tr.tag_display,
          viewer,
          memberNamesBySlug,
          () => browseTagHref(tr.tag_normalized),
        );
        const list = tagsByMediaId.get(tr.media_id);
        if (list) list.push(chip);
        else tagsByMediaId.set(tr.media_id, [chip]);
      }

      const adapter = getMediaStorageAdapter();
      const galleryIdToken = encodeURIComponent(gallery.id);
      const items: GalleryItem[] = rows.map((row) => {
        const item = shapeItem(row, tagsByMediaId.get(row.id) ?? [], (k) => adapter.constructURL(k));
        item.itemHref = `/media/${galleryIdToken}/${encodeURIComponent(item.mediaId)}`;
        return item;
      });

      // When the gallery is empty, the empty state offers five site-wide
      // popular tags as a teachable jumping-off point.
      const emptyResultSuggestions = rows.length === 0
        ? hashtagDiscoveryService.getPopularTags(5) : undefined;

      return {
        seo: { title: `Gallery ${gallery.name}` },
        page: {
          sectionKey: 'media',
          pageKey: 'media_named_gallery',
          title: gallery.name,
          intro: gallery.description || undefined,
        },
        content: {
          gallery: {
            id: gallery.id,
            name: gallery.name,
            description: gallery.description,
            byMember: chips.byMember,
            criteriaTags: chips.criteriaTags,
            excludeTags: chips.excludeTags,
            owner: shapeOwner(gallery),
            externalLinks: (media.listGalleryExternalLinksForPublic.all(galleryId) as Array<{
              label: string; url: string;
            }>).map((r) => ({ label: r.label, url: r.url })),
          },
          items,
          totalItems: rows.length,
          totalItemsNoun: rows.length === 1 ? 'item' : 'items',
          excludeTagsNoun: chips.excludeTags.length === 1 ? 'tag' : 'tags',
          truncationNotice,
          popularTags: emptyResultSuggestions?.length ? emptyResultSuggestions : undefined,
        },
      };
    });
  },

  getNamedGalleryItemPage(
    galleryId: string,
    mediaId: string,
    viewer: ViewerContext = { authenticated: false },
  ): PageViewModel<MediaItemContent> {
    return runSqliteRead('mediaService.getNamedGalleryItemPage', () =>
      buildItemPage({ kind: 'named', galleryId }, mediaId, viewer));
  },

  // Standalone item viewer reached from any tag-query surface. The tag context
  // rebuilds the ordered set so prev/next walk it; with no resolvable context
  // the item shows on its own (no pager) with a validated `?back=` return link.
  getMediaItemPage(
    args: MediaItemArgs,
    viewer: ViewerContext = { authenticated: false },
  ): PageViewModel<MediaItemContent> {
    return runSqliteRead('mediaService.getMediaItemPage', () => {
      const include = uniqStrings(args.rawTags.map(normalizeTagToken).filter(notEmpty))
        .slice(0, ITEM_CONTEXT_TAG_CAP);
      // Include wins over exclude on the same token (an item cannot both carry
      // and lack a tag); strip the conflict before capping, mirroring browse.
      const exclude = uniqStrings(args.rawExcludes.map(normalizeTagToken).filter(notEmpty))
        .filter((t) => !include.includes(t))
        .slice(0, ITEM_CONTEXT_TAG_CAP);
      const sort = sanitizeSort(args.rawSort);

      if (include.length === 0) {
        const back = isSafePath(args.rawBack) ? args.rawBack : '/media/browse';
        const label = isSafePath(args.rawBack) ? 'Back' : 'Browse media';
        return buildItemPage({ kind: 'single', backHref: back, backLabel: label }, args.mediaId, viewer);
      }
      return buildItemPage(
        { kind: 'query', includeNormalized: include, excludeNormalized: exclude, sort },
        args.mediaId,
        viewer,
      );
    });
  },

  // /media/browse: on-the-fly tag browse + temp gallery. Not a named-gallery
  // bookmark. See MediaBrowseContent doc-comment for the two render modes.
  getMediaBrowsePage(
    args: MediaBrowseArgs,
    viewer: ViewerContext = { authenticated: false },
  ): PageViewModel<MediaBrowseContent> {
    return runSqliteRead('mediaService.getMediaBrowsePage', () => {
      const includeNormalized = uniqStrings(args.rawTags.map(normalizeTagToken).filter(notEmpty));
      const excludeNormalizedRaw = uniqStrings(args.rawExcludes.map(normalizeTagToken).filter(notEmpty));
      // Include wins over exclude when the same token appears in both
      // (otherwise the gallery would be vacuously empty, which is a
      // confusing UX). Strip the conflicting exclude entries.
      const excludeNormalized = excludeNormalizedRaw.filter((t) => !includeNormalized.includes(t));

      const formIncludeText = includeNormalized.map(stripHash).join(' ');
      const formExcludeText = excludeNormalized.map(stripHash).join(' ');

      const allNormalized = [...includeNormalized, ...excludeNormalized];
      const tagRows = allNormalized.length === 0 ? [] : queryTagIdsByNormalized(allNormalized);
      const tagRowByNormalized = new Map(tagRows.map((r) => [r.tag_normalized, r]));

      const includeRows = includeNormalized
        .map((n) => tagRowByNormalized.get(n))
        .filter((r): r is { id: string; tag_normalized: string; tag_display: string } => r != null);
      const excludeRows = excludeNormalized
        .map((n) => tagRowByNormalized.get(n))
        .filter((r): r is { id: string; tag_normalized: string; tag_display: string } => r != null);

      const unresolvedTokens = includeNormalized
        .filter((n) => !tagRowByNormalized.has(n))
        .map(stripHash);

      // Member-name lookup for `#by_*` lift across hero criteria/exclude
      // chips AND any per-item chips we surface in the results pane.
      const allCriteriaDisplays = [
        ...includeRows.map((r) => r.tag_display),
        ...excludeRows.map((r) => r.tag_display),
      ];

      const criteriaTagIds = includeRows.map((r) => r.id);
      const excludeTagIds = excludeRows.map((r) => r.id);

      // Browse mode: no resolved criteria → no results pane. Hero echoes
      // submitted tokens via formInclude/ExcludeText only; chip lists empty.
      if (criteriaTagIds.length === 0) {
        // A short suggested-tag list keeps the landing a discovery aid, not a wall
        // of chips. Real popular tags lead, ranked by usage; curated starter seeds
        // pad any unfilled slots so representative club, event, and style tags can
        // surface before community usage accrues, then fall away as it does.
        const popularTags = hashtagDiscoveryService.getPopularTagsWithSeeds(8);
        return {
          seo: { title: 'Browse Media' },
          page: {
            sectionKey: 'media',
            pageKey: 'media_browse',
            title: 'Browse Media',
          },
          content: {
            mode: 'browse',
            isResultsMode: false,
            totalItemsNoun: 'items',
            excludeTagsNoun: 'tags',
            formIncludeText,
            formExcludeText,
            unresolvedTokens,
            byMember: null,
            criteriaTags: [],
            excludeTags: [],
            items: [],
            totalItems: 0,
            pagination: null,
            popularTags: popularTags.length > 0 ? popularTags : undefined,
          },
        };
      }

      // Results mode.
      const page = sanitizePage(args.rawPage);
      const total = countGalleryItemsByCriteria(criteriaTagIds, excludeTagIds);
      const offset = (page - 1) * PAGE_SIZE;
      const rows = queryGalleryItemsByCriteria(criteriaTagIds, PAGE_SIZE, offset, excludeTagIds);

      const itemTagRows = rows.length > 0 ? queryCuratorMediaTags(rows.map((r) => r.id)) : [];

      const memberNamesBySlug = collectMemberNamesForByTags([
        ...allCriteriaDisplays,
        ...itemTagRows.map((r) => r.tag_display),
      ]);
      const heroChips = shapeGalleryChips(includeRows, excludeRows, viewer, memberNamesBySlug);

      const tagsByMediaId = new Map<string, TagChip[]>();
      for (const tr of itemTagRows) {
        const chip = shapeTagChip(
          tr.tag_display,
          viewer,
          memberNamesBySlug,
          () => browseTagHref(tr.tag_normalized),
        );
        const list = tagsByMediaId.get(tr.media_id);
        if (list) list.push(chip);
        else tagsByMediaId.set(tr.media_id, [chip]);
      }

      const adapter = getMediaStorageAdapter();
      // Each tile opens the standalone viewer carrying this browse query, so the
      // viewer rebuilds the same ordered set for wrapping prev/next. Browse has
      // no sort control, so the set follows the default upload-desc order.
      const itemContextQuery = buildItemContextQueryString(includeNormalized, excludeNormalized, 'upload_desc');
      const items: GalleryItem[] = rows.map((row) => {
        const item = shapeItem(row, tagsByMediaId.get(row.id) ?? [], (k) => adapter.constructURL(k));
        item.itemHref = `/media/item/${encodeURIComponent(item.mediaId)}?${itemContextQuery}`;
        return item;
      });

      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const hasPrev = page > 1;
      const hasNext = page < totalPages;
      const baseQuery = buildBrowseQueryString(includeNormalized, excludeNormalized);
      const pageHref = (p: number): string =>
        p === 1 ? `/media/browse?${baseQuery}` : `/media/browse?${baseQuery}&page=${p}`;
      const pagination: GalleryPagination = {
        page,
        pageSize: PAGE_SIZE,
        total,
        hasNext,
        hasPrev,
        ...(hasPrev ? { prevHref: pageHref(page - 1) } : {}),
        ...(hasNext ? { nextHref: pageHref(page + 1) } : {}),
      };

      const emptyResultSuggestions = total === 0
        ? hashtagDiscoveryService.getPopularTags(5) : undefined;

      return {
        seo: { title: 'Browse Media' },
        page: {
          sectionKey: 'media',
          pageKey: 'media_browse',
          title: 'Browse Media',
        },
        content: {
          mode: 'results',
          isResultsMode: true,
          totalItemsNoun: total === 1 ? 'item' : 'items',
          excludeTagsNoun: heroChips.excludeTags.length === 1 ? 'tag' : 'tags',
          formIncludeText,
          formExcludeText,
          unresolvedTokens,
          byMember: heroChips.byMember,
          criteriaTags: heroChips.criteriaTags,
          excludeTags: heroChips.excludeTags,
          items,
          totalItems: total,
          pagination,
          popularTags: emptyResultSuggestions?.length ? emptyResultSuggestions : undefined,
        },
      };
    });
  },

  // Recent member-authored community media for the teaching empty state shown
  // to a member who has not uploaded anything yet. Topical chips only; the
  // uploader marker is not surfaced. Returns an empty array when no member has
  // shared media yet (the caller hides the example strip in that case). The
  // recency set is not a tag query, so each tile opens the viewer as a single
  // item (no prev/next) returning to `backHref` (the member's gallery page).
  listRecentCommunityMedia(limit: number, backHref: string): GalleryItem[] {
    return runSqliteRead('mediaService.listRecentCommunityMedia', () => {
      const rows = queryRecentCommunityMedia(limit, ['photo', 'video']);
      if (rows.length === 0) return [];
      const itemTagRows = queryCuratorMediaTags(rows.map((r) => r.id));
      const tagsByMediaId = new Map<string, TagChip[]>();
      for (const tr of itemTagRows) {
        if (tr.tag_normalized.toLowerCase().startsWith(UPLOADER_TAG_PREFIX)) continue;
        const chip = shapeTagChip(
          tr.tag_display,
          { authenticated: true },
          new Map(),
          () => browseTagHref(tr.tag_normalized),
        );
        const list = tagsByMediaId.get(tr.media_id);
        if (list) list.push(chip);
        else tagsByMediaId.set(tr.media_id, [chip]);
      }
      const adapter = getMediaStorageAdapter();
      const safeBack = isSafePath(backHref) ? backHref : '/media/browse';
      const backParam = `back=${encodeURIComponent(safeBack)}`;
      return rows.map((row) => {
        const item = shapeItem(row, tagsByMediaId.get(row.id) ?? [], (k) => adapter.constructURL(k));
        item.itemHref = `/media/item/${encodeURIComponent(item.mediaId)}?${backParam}`;
        return item;
      });
    });
  },
};

// Lowercase + ensure leading '#' for an incoming tag token. Returns the
// empty string for inputs that are nothing more than '#' or whitespace.
function normalizeTagToken(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return '';
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (withHash === '#') return '';
  return withHash;
}

function stripHash(t: string): string {
  return t.startsWith('#') ? t.slice(1) : t;
}

function notEmpty(s: string): boolean {
  return s.length > 0;
}

function uniqStrings(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of items) {
    if (!seen.has(s)) {
      seen.add(s);
      out.push(s);
    }
  }
  return out;
}

function buildBrowseQueryString(includeNormalized: string[], excludeNormalized: string[]): string {
  const parts: string[] = [];
  for (const t of includeNormalized) parts.push(`tag=${encodeURIComponent(stripHash(t))}`);
  for (const t of excludeNormalized) parts.push(`exclude=${encodeURIComponent(stripHash(t))}`);
  return parts.join('&');
}
