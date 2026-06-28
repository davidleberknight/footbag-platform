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
 *   - /media/:galleryId named-gallery page read (tag-AND membership). Its editable
 *     filter prefills the gallery's topic criteria as removable include chips and
 *     submits to /media/browse, so refining or broadening the initial set (and
 *     paging past the render cap) happens on the dynamic surface; the owner
 *     `#by_*` criterion stays a locked context tag.
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
 *   - Results mode carries an editable tag filter (`content.filter`): one no-JS
 *     GET form whose controls all defer to a single "Apply Hashtag Filters"
 *     submit. Active include/exclude tags are checked checkboxes (uncheck + Apply
 *     removes); co-occurring tags (minus active / `#by_*` / `#unavailable_embed`)
 *     are unchecked add checkboxes; a locked context tag is read-only with a
 *     hidden input; free-text fields add new tags. On submit the controller folds
 *     the whole state into one canonical shareable URL via `canonicalFilterPath`
 *     and redirects (PRG), so the service owns every URL and the controller stays
 *     thin.
 *   - Hero `byMember` chip lifts from any `#by_<slug>` criterion (linked to that
 *     member's public gallery) so the template renders "by *Member Name*"
 *     attribution distinct from gallery ownership.
 *   - Viewer-aware shaping (`viewer: ViewerContext`): the member-galleries list
 *     links an owner's display name to their member profile only for a signed-in
 *     viewer (profiles are member-only); the name shows unlinked otherwise.
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
  countGalleryItemsByTagGroups,
  media,
  queryCooccurringTags,
  queryCuratorMediaTags,
  queryGalleryItemsByTagGroups,
  queryGalleryItemsByCriteriaGrouped,
  queryRecentCommunityMedia,
  queryMemberDisplayNamesBySlugs,
  queryStyleTermTagIds,
  queryTagIdsByNormalized,
  resolveTrickTags,
} from '../db/db';
import { CANONICAL_SETS, resolveCanonicalSetAlias } from '../content/freestyleCanonicalSets';
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
// (e.g. "Jane Doe") instead of the raw tag, linked to that member's
// public gallery (the `#by_<slug>` browse view), the same for every
// viewer. Slugs that don't resolve to an active, non-purged member
// fall back to the raw `#by_<slug>` tag string.
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
//
// A `#by_<slug>` tag renders the member's display name linked to that member's
// public per-uploader gallery (the `#by_<slug>` browse view), the same for every
// viewer. Member galleries are public; the member profile (which is signed-in
// only) is deliberately not the target here, so a logged-out visitor still has a
// working "more from this uploader" link rather than a dead name.
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
        href: browseTagHref(display),
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

// A resolved ontology cross-link from a media tag to a canonical freestyle page.
export interface MediaDestination {
  kind: 'trick' | 'set';
  label: string;
  href: string;
}

export interface GalleryItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  caption: string | null;
  // Non-empty image alt text: the caption, or a generic fallback when blank, so
  // a content image is never published with an empty alt.
  alt: string;
  thumbnailUrl: string;     // photo thumb; video tiles read media.thumbnailUrl via the partial
  displayHref: string;      // photo full-size; videos use media.videoUrl via the partial
  // Intrinsic pixel size of the photo, when known, so the viewer can reserve the
  // image's aspect box before it loads and avoid layout shift. Null for videos
  // (the facade carries its own fixed 16/9 box) and for photos with no stored size.
  width: number | null;
  height: number | null;
  uploadedAtIso: string;
  uploadedAtDisplay: string;
  // Per-tile chips: non-`#by_*` link to /media/browse?tag=…; `#by_*` lifts to
  // the member's display name linked to that member's public gallery.
  tags: TagChip[];
  // Ontology cross-links resolved from this item's tags: trick tags (slug or
  // alias) link to the trick page; set/concept tags link to the Set Encyclopedia
  // page (set aliases resolved to canonical). Deduped by destination, so a tag
  // and its alias pointing at the same page render once. Empty when nothing
  // resolves (unknown/utility tags stay plain, never a broken link).
  destinations: MediaDestination[];
  // Video tiles render a click-to-play facade via partials/video-facade.hbs
  // fed by this canonical shape. Null for photos.
  media: VideoMedia | null;
  // Link to the in-site viewer page for this item. Every list surface sets it
  // so a tile always opens the viewer rather than a raw media-store file: the
  // named-gallery context uses `/media/{galleryId}/{mediaId}`; browse, profile,
  // and teaching tiles use `/media/item/{mediaId}` carrying their tag-query (or
  // `?back=`) context so the viewer rebuilds the same ordered set for prev/next.
  itemHref: string | null;
  // True for tiles whose poster carries a burnt-in lower-left caption (the
  // demo-mosaic source clips): the tile masks that corner with a clean
  // trick-name label overlay instead of showing the caption below the image.
  captionMask?: boolean;
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
  // The editable tag filter (an on-the-view refinement that never mutates the
  // saved gallery), or null when the gallery is not worth filtering.
  filter: TagFilterView | null;
}

// Single-item viewer rendered by both /media/:galleryId/:mediaId (named-gallery
// context) and /media/item/:mediaId (tag-query / single context). `title` is the
// hero h1: the gallery name when viewed within a named gallery, otherwise the
// item's own title. `itemTitle` is the item's own title rendered as a heading
// directly above the media; it is set only when the hero shows the gallery name
// (so the item title appears exactly once and is never duplicated above and in
// the hero). `position` is the "current of total" marker, present only when the
// pager shows. `backHref`/`backLabel` return to wherever the item was opened
// from. Prev/next walk the context's ordered set and wrap modulo; `showPager` is
// false for a one-item set, hiding the pager. uploadedBy lifts the item's
// `#by_<slug>` tag to a member chip; tags are the item's remaining hashtags.
export interface MediaItemContent {
  title: string;
  itemTitle: string | null;
  backHref: string;
  backLabel: string;
  item: GalleryItem;
  // Attribution: `uploadedBy` is the member uploader chip (display name linked
  // to that member's public gallery); `curatedHref`, when set, marks a curated
  // item and links to the full curated collection. They are mutually exclusive.
  uploadedBy: TagChip | null;
  curatedHref: string | null;
  tags: TagChip[];
  showPager: boolean;
  position: { current: number; total: number } | null;
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
  rawContext?: string[];
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
  // The editable tag filter, present in results mode. The viewer removes an
  // active tag (each chip's `removeHref`), adds a free-text tag via the add
  // form, or clicks a co-occurring suggestion. Null in browse mode, where the
  // search form is the entry point.
  filter: TagFilterView | null;
}

// One locked (owner-scoping `#by_*`) tag in the filter bar, shown as a read-only
// label the visitor cannot edit; preserved across a submit via `contextInputs`.
export interface FilterChip {
  display: string;
}

// One co-occurring tag offered beneath the filter as a clickable chip that adds
// itself to the include field. `value` is the hash-stripped token; `count` is how
// many items in the current set carry it.
export interface SuggestionChip {
  display: string;
  count: number;
  value: string;
}

// The editable tag filter shared by every dynamic gallery surface. The service
// owns all filtering; the template renders one no-JS GET form whose controls all
// defer to a single "Apply hashtag filters" submit. The active include/exclude
// tags (a named gallery's topic criteria plus any visitor refinement) prefill two
// chip-input fields (`includeText` / `excludeText`, space-separated hash-stripped
// tokens) that progressively enhance into tokenizers with autocomplete and are
// fully editable/removable; `suggestions` are context-aware co-occurring tags
// offered as click-to-add chips; `contextChips` / `contextInputs` carry only the
// locked owner-scoping `#by_*` tag. `addAction` is the form's GET target.
export interface TagFilterView {
  contextChips: FilterChip[];
  contextInputs: { name: string; value: string }[];
  includeText: string;
  excludeText: string;
  suggestions: SuggestionChip[];
  addAction: string;
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

// Canonical set slug -> display name, for the set/concept tile cross-link.
const SET_DISPLAY_BY_SLUG: ReadonlyMap<string, string> =
  new Map(CANONICAL_SETS.map((s) => [s.slug, s.displayName]));

// Normalize a tag display to its slug body: drop a leading '#', lowercase, and
// fold hyphens to underscores (media tags and trick slugs are underscore-form).
function tagBody(display: string): string {
  return display.replace(/^#/, '').toLowerCase().replace(/-/g, '_');
}

// Resolve a tag body to a Set Encyclopedia destination when it is `set_<slug>`
// or `concept_<slug>_sets`. Set aliases resolve to the canonical set (e.g.
// illusioning -> atomic, furious -> barraging). Unknown set -> null (no link).
function setDestFromTagBody(body: string): MediaDestination | null {
  let slug: string | null = null;
  if (body.startsWith('set_')) slug = body.slice(4);
  else if (body.startsWith('concept_') && body.endsWith('_sets')) slug = body.slice(8, -5);
  if (!slug) return null;
  const canonical = resolveCanonicalSetAlias(slug) ?? slug;
  const label = SET_DISPLAY_BY_SLUG.get(canonical);
  return label ? { kind: 'set', label, href: `/freestyle/sets/${canonical}` } : null;
}

// A media tag name made readable for a cross-link label: underscores/hyphens to
// spaces, title-cased ("pixie-barrage" -> "Pixie Barrage").
function titleizeTrickName(name: string): string {
  return name.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim();
}

// Resolve every item's tags to canonical freestyle destinations (trick + set),
// deduped per item by href. Trick resolution is one batched DB query across all
// items on the page. Set resolution is pure (content module). Unknown/utility
// tags resolve to nothing and stay plain tags.
function attachDestinations(items: GalleryItem[]): void {
  if (items.length === 0) return;
  const candidateBodies = new Set<string>();
  for (const it of items) for (const t of it.tags) candidateBodies.add(tagBody(t.display));
  const trickByBody = new Map<string, { canonicalSlug: string; canonicalName: string }>();
  for (const r of resolveTrickTags([...candidateBodies])) {
    if (!trickByBody.has(r.matched)) trickByBody.set(r.matched, { canonicalSlug: r.canonicalSlug, canonicalName: r.canonicalName });
  }
  for (const it of items) {
    const dests: MediaDestination[] = [];
    const seen = new Set<string>();
    for (const t of it.tags) {
      const body = tagBody(t.display);
      const set = setDestFromTagBody(body);
      if (set && !seen.has(set.href)) { dests.push(set); seen.add(set.href); }
      const trick = trickByBody.get(body);
      if (trick) {
        const href = `/freestyle/tricks/${trick.canonicalSlug}`;
        if (!seen.has(href)) { dests.push({ kind: 'trick', label: titleizeTrickName(trick.canonicalName), href }); seen.add(href); }
      }
    }
    it.destinations = dests;
  }
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

  const caption = row.caption?.trim();
  return {
    mediaId: row.id,
    mediaType: row.media_type,
    caption: row.caption,
    alt: caption && caption.length > 0 ? caption : 'Footbag media',
    thumbnailUrl,
    displayHref,
    width: row.media_type === 'photo' ? row.width_px : null,
    height: row.media_type === 'photo' ? row.height_px : null,
    uploadedAtIso: row.uploaded_at,
    uploadedAtDisplay: formatUploadedAt(row.uploaded_at),
    tags,
    destinations: [],   // resolved in a batch by attachDestinations()
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
  // The collection the item is being viewed within: the named gallery's name,
  // or null when there is no collection (a tag-query/single view). Drives the
  // hero: when set, the hero shows the collection and the item's own title sits
  // as a heading directly above the media; when null, the hero is the item's
  // own title (and no separate heading, so the title is never shown twice).
  collectionTitle: string | null;
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
    collectionTitle: null,
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
      backLabel: 'Back to Gallery',
      collectionTitle: gallery.name,
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
    backLabel: 'Back to Results',
    collectionTitle: null,
  };
}

// Shapes one item-viewer page for any context. Computes prev/next once, wrapping
// modulo the ordered set; lifts the item's `#by_<slug>` tag to an uploader chip
// linked to that member's gallery, lifts `#curated` to a curated-collection
// attribution, and renders the remaining hashtags as browseable chips.
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
  let isCurated = false;
  const tags: TagChip[] = [];
  for (const tr of itemTagRows) {
    if (tr.tag_normalized === CURATED_TAG) {
      // Curator provenance is surfaced as its own attribution linking to the
      // full curated collection (the curated counterpart of a member's uploader
      // attribution), so `#curated` is lifted out rather than also listed as a tag.
      isCurated = true;
    } else if (tr.tag_display.startsWith(UPLOADER_TAG_PREFIX)) {
      if (uploadedBy === null && memberNamesBySlug.has(tr.tag_display.slice(UPLOADER_TAG_PREFIX.length))) {
        uploadedBy = shapeTagChip(tr.tag_display, viewer, memberNamesBySlug);
      }
    } else {
      tags.push(shapeTagChip(tr.tag_display, viewer, memberNamesBySlug, () => browseTagHref(tr.tag_normalized)));
    }
  }
  // A curated item links to all curated media; a member upload links to that
  // member's gallery (via uploadedBy). The two are mutually exclusive in practice.
  const curatedHref = isCurated ? browseTagHref(CURATED_TAG) : null;

  const adapter = getMediaStorageAdapter();
  const item = shapeItem(row, [], (k) => adapter.constructURL(k));
  const showPager = n > 1;
  // The item's own title. When the item is viewed within a named gallery the
  // hero shows the gallery name and this sits as a heading above the media;
  // otherwise the hero is this title and no separate heading renders.
  const itemTitle = titleFor(row);
  const heroTitle = set.collectionTitle ?? itemTitle;

  return {
    seo: { title: itemTitle },
    page: {
      sectionKey: 'media',
      pageKey: 'media_gallery_item',
      title: heroTitle,
    },
    content: {
      title: heroTitle,
      itemTitle: set.collectionTitle != null ? itemTitle : null,
      backHref: set.backHref,
      backLabel: set.backLabel,
      item,
      uploadedBy,
      curatedHref,
      tags,
      showPager,
      position: showPager ? { current: set.index + 1, total: n } : null,
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
          cta: 'Browse Tags',
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
          cta: 'Browse Freestyle',
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
        ? `/media/browse?context=by_${encodeURIComponent(ownerSlug)}`
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
    refine: { rawTags: string[]; rawExcludes: string[]; curated?: string } = { rawTags: [], rawExcludes: [] },
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

      // The saved gallery query is the locked context; a visitor may refine it
      // transiently via ?tag=/?exclude= without mutating the saved row. The
      // refinement layers onto the criteria/exclude sets at view time only.
      // A refine tag that the gallery already requires (or excludes) is dropped:
      // re-adding it would duplicate a tag id in the AND-of-N query, whose
      // `HAVING COUNT(DISTINCT tag_id) = N` can then never match (so the gallery
      // would render empty), and it would also show the tag twice in the chips.
      const galleryCriteriaNorm = new Set(tagRows.map((t) => t.tag_display.toLowerCase()));
      const galleryExcludeNorm = new Set(excludeTagRows.map((t) => t.tag_display.toLowerCase()));
      const refineInclude = uniqStrings((refine.rawTags ?? []).map(normalizeTagToken).filter(notEmpty))
        .filter((t) => !galleryCriteriaNorm.has(t));
      const refineExclude = uniqStrings((refine.rawExcludes ?? []).map(normalizeTagToken).filter(notEmpty))
        .filter((t) => !refineInclude.includes(t) && !galleryExcludeNorm.has(t) && !galleryCriteriaNorm.has(t));
      const refineRows = (refineInclude.length + refineExclude.length) > 0
        ? queryTagIdsByNormalized([...refineInclude, ...refineExclude]) : [];
      const refineByNorm = new Map(refineRows.map((r) => [r.tag_normalized, r]));
      const refineIncludeRows = refineInclude.map((n) => refineByNorm.get(n))
        .filter((r): r is { id: string; tag_normalized: string; tag_display: string } => r != null);
      const refineExcludeRows = refineExclude.map((n) => refineByNorm.get(n))
        .filter((r): r is { id: string; tag_normalized: string; tag_display: string } => r != null);
      // De-dupe the AND-of-N ids defensively: a duplicate tag id breaks the
      // distinct-count HAVING clause.
      const effectiveTagIds = [...new Set([...tagIds, ...refineIncludeRows.map((r) => r.id)])];
      const effectiveExcludeTagIds = [...new Set([...excludeTagIds, ...refineExcludeRows.map((r) => r.id)])];

      // Fetch cap+1 to detect overflow: this is a public unauthenticated
      // route, so the render must stay bounded no matter how broad the
      // gallery criteria are.
      const fetched = queryGalleryItemsByCriteriaGrouped(
        effectiveTagIds, gallery.sort_order, effectiveExcludeTagIds, GALLERY_ITEMS_QUERY_CAP + 1,
      );
      const truncated = fetched.length > GALLERY_ITEMS_QUERY_CAP;
      const rows = truncated ? fetched.slice(0, GALLERY_ITEMS_QUERY_CAP) : fetched;
      const truncationNotice = truncated
        ? `Showing the first ${GALLERY_ITEMS_QUERY_CAP} of ${countGalleryItemsByCriteria(effectiveTagIds, effectiveExcludeTagIds)} items.`
        : null;

      // Editable, context-aware filter. The gallery's TOPIC criteria prefill the
      // removable include chips so a visitor can refine or broaden the initial
      // set; the owner-scoping `#by_*` criterion stays a locked context tag (it
      // cannot be lifted by editing, per the member-gallery scoping invariant).
      // The gallery's own exclude criteria prefill the (editable) exclude field.
      // Apply submits to /media/browse with the edited set, so removing a
      // criterion broadens on the dynamic surface. Suggestion candidates are
      // co-occurring tags within the gallery's base set.
      const toRef = (r: { tag_normalized: string; tag_display: string }): TagRef => ({
        normalized: r.tag_normalized, display: r.tag_display,
      });
      const isUploaderTag = (display: string): boolean =>
        display.toLowerCase().startsWith(UPLOADER_TAG_PREFIX);
      const ownerContextTags: TagRef[] = tagRows
        .filter((t) => isUploaderTag(t.tag_display))
        .map((t) => ({ normalized: t.tag_display.toLowerCase(), display: t.tag_display }));
      const topicCriteriaTags: TagRef[] = tagRows
        .filter((t) => !isUploaderTag(t.tag_display))
        .map((t) => ({ normalized: t.tag_display.toLowerCase(), display: t.tag_display }));
      const galleryExcludeTagRefs: TagRef[] = excludeTagRows
        .map((t) => ({ normalized: t.tag_display.toLowerCase(), display: t.tag_display }));
      const baseSetSize = countGalleryItemsByCriteria(tagIds, excludeTagIds);
      const suggRows = queryCooccurringTags(tagIds, excludeTagIds, FILTER_SUGGESTION_LIMIT);
      const curatedTagRow = queryTagIdsByNormalized([CURATED_TAG])[0];
      const curatedTagId = curatedTagRow?.id ?? null;
      const curatedCount = countCuratedInSet(effectiveTagIds, effectiveExcludeTagIds, curatedTagId);
      const filter = buildTagFilterView({
        basePath: '/media/browse',
        contextTags: ownerContextTags,
        contextInUrl: true,
        includeTags: [...topicCriteriaTags, ...refineIncludeRows.map(toRef)],
        excludeTags: [...galleryExcludeTagRefs, ...refineExcludeRows.map(toRef)],
        setSize: baseSetSize,
        candidates: suggRows.map((r) => ({ normalized: r.tag_normalized, display: r.tag_display, count: r.n })),
        curatedCount,
      });

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
      // A gallery built from the demo-mosaic clips inherits their burnt-in
      // lower-left poster caption; mask it per tile with a clean label overlay.
      const isMosaicGallery = tagRows.some((t) => t.tag_display.toLowerCase() === MOSAIC_CAPTION_TAG);
      const items: GalleryItem[] = rows.map((row) => {
        const item = shapeItem(row, tagsByMediaId.get(row.id) ?? [], (k) => adapter.constructURL(k));
        item.itemHref = `/media/${galleryIdToken}/${encodeURIComponent(item.mediaId)}`;
        if (isMosaicGallery) item.captionMask = true;
        return item;
      });
      attachDestinations(items);

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
          filter,
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
      // Context tokens (`?context=`, e.g. a club/event gallery) are locked
      // includes; visitor `?tag=` are removable includes. Both join the AND set.
      const contextNormalized = uniqStrings((args.rawContext ?? []).map(normalizeTagToken).filter(notEmpty));
      const includeNormalized = uniqStrings(args.rawTags.map(normalizeTagToken).filter(notEmpty))
        .filter((t) => !contextNormalized.includes(t));
      const excludeNormalizedRaw = uniqStrings(args.rawExcludes.map(normalizeTagToken).filter(notEmpty));
      // A token can't be both required and excluded; context/include win over
      // exclude, so the gallery is never vacuously empty.
      const excludeNormalized = excludeNormalizedRaw
        .filter((t) => !includeNormalized.includes(t) && !contextNormalized.includes(t));

      const formIncludeText = includeNormalized.map(stripHash).join(' ');
      const formExcludeText = excludeNormalized.map(stripHash).join(' ');

      const allNormalized = uniqStrings([...contextNormalized, ...includeNormalized, ...excludeNormalized]);
      const tagRows = allNormalized.length === 0 ? [] : queryTagIdsByNormalized(allNormalized);
      const tagRowByNormalized = new Map(tagRows.map((r) => [r.tag_normalized, r]));

      const resolveRows = (ns: string[]) => ns
        .map((n) => tagRowByNormalized.get(n))
        .filter((r): r is { id: string; tag_normalized: string; tag_display: string } => r != null);
      const contextRows = resolveRows(contextNormalized);
      const includeRows = resolveRows(includeNormalized);
      const excludeRows = resolveRows(excludeNormalized);

      const unresolvedTokens = [...contextNormalized, ...includeNormalized]
        .filter((n) => !tagRowByNormalized.has(n))
        .map(stripHash);

      // Member-name lookup for `#by_*` lift across hero criteria/exclude
      // chips AND any per-item chips we surface in the results pane.
      const allCriteriaDisplays = [
        ...contextRows.map((r) => r.tag_display),
        ...includeRows.map((r) => r.tag_display),
        ...excludeRows.map((r) => r.tag_display),
      ];

      // The match set: each context token is a single-tag group; each visitor
      // include token is an OR-group of tag ids. A recognized set/style term
      // matches its bare tag, its #<term>_* compounds, and its set/concept tags
      // (token-based); any other token matches exactly. Groups AND together;
      // criteriaTagIds (flat) drives the results-mode gate and the co-occurring
      // suggestions. The display chips above stay on the submitted tokens, so the
      // shown hashtags are unchanged.
      const expandIncludeTokenTagIds = (normalized: string): string[] => {
        const term = stripHash(normalized);
        const setSlug = SET_STYLE_TERMS.get(term);
        if (setSlug) {
          const { exacts, prefix } = styleTermTagPatterns(term, setSlug);
          // The term doubles as the modifier slug for the ontology link (pixie,
          // atomic, ...), so trick tags of #<slug> tricks carrying that modifier
          // (e.g. #pigbeater for pixie) are matched too.
          return queryStyleTermTagIds(exacts, prefix, term);
        }
        const row = tagRowByNormalized.get(normalized);
        return row ? [row.id] : [];
      };
      const criteriaGroups = [
        ...contextNormalized.map((n) => { const r = tagRowByNormalized.get(n); return r ? [r.id] : []; }),
        ...includeNormalized.map(expandIncludeTokenTagIds),
      ].filter((g) => g.length > 0);
      const criteriaTagIds = criteriaGroups.flat();
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
            filter: null,
          },
        };
      }

      // Results mode.
      const page = sanitizePage(args.rawPage);
      const total = countGalleryItemsByTagGroups(criteriaGroups, excludeTagIds);
      const offset = (page - 1) * PAGE_SIZE;
      const rows = queryGalleryItemsByTagGroups(criteriaGroups, PAGE_SIZE, offset, excludeTagIds);

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
      const itemContextQuery = buildItemContextQueryString([...contextNormalized, ...includeNormalized], excludeNormalized, 'upload_desc');
      const items: GalleryItem[] = rows.map((row) => {
        const item = shapeItem(row, tagsByMediaId.get(row.id) ?? [], (k) => adapter.constructURL(k));
        item.itemHref = `/media/item/${encodeURIComponent(item.mediaId)}?${itemContextQuery}`;
        return item;
      });
      attachDestinations(items);

      const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
      const hasPrev = page > 1;
      const hasNext = page < totalPages;
      const baseQuery = [buildContextQueryString(contextNormalized), buildBrowseQueryString(includeNormalized, excludeNormalized)]
        .filter((s) => s.length > 0).join('&');
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

      // Suggestion row drawn from tags that co-occur in the current result set,
      // so the viewer narrows by tags actually present rather than a static
      // popular list. Empty when the set yields nothing to co-occur with.
      const suggestionRows = queryCooccurringTags(criteriaTagIds, excludeTagIds, FILTER_SUGGESTION_LIMIT);
      // Curated opt-in: how many of the current results are curator-published,
      // for the always-offered "Curated" suggestion (when curated is not already
      // the active filter, offerCurated handles that downstream).
      const curatedTagRow = tagRowByNormalized.get(CURATED_TAG)
        ?? queryTagIdsByNormalized([CURATED_TAG])[0];
      const curatedTagId = curatedTagRow?.id ?? null;
      const curatedCount = countCuratedInSet(criteriaTagIds, excludeTagIds, curatedTagId);
      const filter = shapeBrowseFilter({
        contextNormalized,
        includeNormalized,
        excludeNormalized,
        contextRows,
        includeRows,
        excludeRows,
        suggestionRows,
        setSize: total,
        curatedCount,
      });

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
          filter,
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
      const items = rows.map((row) => {
        const item = shapeItem(row, tagsByMediaId.get(row.id) ?? [], (k) => adapter.constructURL(k));
        item.itemHref = `/media/item/${encodeURIComponent(item.mediaId)}?${backParam}`;
        return item;
      });
      attachDestinations(items);
      return items;
    });
  },
};

// Lowercase + ensure leading '#' for an incoming tag token. Returns the
// empty string for inputs that are nothing more than '#' or whitespace.
export function normalizeTagToken(raw: string): string {
  const trimmed = raw.trim().toLowerCase();
  if (trimmed.length === 0) return '';
  const withHash = trimmed.startsWith('#') ? trimmed : `#${trimmed}`;
  if (withHash === '#') return '';
  return withHash;
}

function stripHash(t: string): string {
  return t.startsWith('#') ? t.slice(1) : t;
}

// Token-based search expansion for /media/browse. A handful of recognized
// set/style terms expand to ALL the tags that name them, so a visitor who
// searches "pixie" finds every pixie and pixie-set video in one go: the bare
// tag, its `#<term>_*` compounds (e.g. #pixie_barrage), and its set/concept
// tags (#set_pixie, #concept_pixie_sets). The value is the canonical SET slug
// for the term (the term itself for most; barraging for furious, whose set
// folded into barraging). NOT a synonym engine and NOT folk-name resolution
// (pigbeater = pixie eggbeater belongs to a later ontology-backed phase); it
// does not rename tags, retag media, or change displayed hashtags. Any token
// not in this table matches exactly, so other searches behave as before.
const SET_STYLE_TERMS: ReadonlyMap<string, string> = new Map<string, string>([
  ['pixie',     'pixie'],
  ['fairy',     'fairy'],
  ['atomic',    'atomic'],
  ['miraging',  'miraging'],
  ['stepping',  'stepping'],
  ['barraging', 'barraging'],
  ['furious',   'barraging'],
]);

// The exact tag forms and the `#<term>_*` compound prefix a set/style term
// matches: its own bare/set/concept tags, plus (when the canonical set differs,
// e.g. furious -> barraging) the canonical set's set/concept tags.
function styleTermTagPatterns(term: string, setSlug: string): { exacts: string[]; prefix: string } {
  const exacts = new Set<string>([
    `#${term}`,
    `#set_${term}`,    `#concept_${term}_sets`,
    `#set_${setSlug}`, `#concept_${setSlug}_sets`,
  ]);
  return { exacts: [...exacts], prefix: `#${term}` };
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

// Locked-context tokens as repeated `?context=` params. Context tags are part
// of the AND set but render non-removable; carrying them in every filter href
// keeps a viewer inside the surface's gallery (e.g. a club's media) while they
// refine within it.
function buildContextQueryString(contextNormalized: string[]): string {
  return contextNormalized.map((t) => `context=${encodeURIComponent(stripHash(t))}`).join('&');
}

// Canonical path for a tag set on a given surface: the bare basePath when
// empty, otherwise the repeated-arg query form (`context=` first, then `tag=`,
// then `exclude=`). Every editable-filter href (remove, add-suggestion,
// add-form redirect) is built from this so the rendered URL is always
// shareable. `contextNormalized` is empty for surfaces whose context is encoded
// in the path itself (a trick slug, a named-gallery id); it is populated only
// where the context rides in the query string (`/media/browse?context=`).
function buildFilterPath(
  basePath: string,
  contextNormalized: string[],
  includeNormalized: string[],
  excludeNormalized: string[],
): string {
  const parts: string[] = [];
  const ctx = buildContextQueryString(contextNormalized);
  const tags = buildBrowseQueryString(includeNormalized, excludeNormalized);
  if (ctx) parts.push(ctx);
  if (tags) parts.push(tags);
  const q = parts.join('&');
  return q.length === 0 ? basePath : `${basePath}?${q}`;
}

// How many co-occurring tags to offer in the suggestion row.
export const FILTER_SUGGESTION_LIMIT = 12;

// The curator-content marker. Curator-vs-community is the primary filtering
// axis, so it is surfaced as a dedicated always-on Source control rather than a
// raw suggestion chip.
const CURATED_TAG = '#curated';
// Galleries built from the demo-mosaic source clips, whose posters carry a
// burnt-in lower-left caption. Tiles in such a gallery mask that corner with a
// clean trick-name label overlay instead of exposing the burnt-in text.
const MOSAIC_CAPTION_TAG = '#demo_mosaic';

// Human-readable labels for known hashtags, so the filter reads as a product
// surface rather than developer jargon. Unknown tags fall back to a title-cased
// slug (`#some_thing` → "Some Thing"). The raw tag stays available for the URL
// and for the active-chip text; this only friendlies discovery affordances.
const TAG_LABELS: Record<string, string> = {
  '#curated': 'Curated',
  '#freestyle': 'Freestyle',
  '#trick': 'Tricks',
  '#tricks_of_the_trade': 'Tricks of the Trade',
  '#passback_records': 'PassBack Records',
  '#passback_tutorials': 'PassBack Tutorials',
  '#passback_advanced': 'PassBack Advanced',
  '#passback_beginner': 'PassBack Beginner',
  '#bap': 'Big-Add Posse',
  '#individual_shred_videos': 'Shred Clips',
  '#bap_originators': 'Originators (1992)',
  '#bap_golden_age': 'Golden Age (1995-1999)',
  '#bap_expansion': 'Expansion (2000-2009)',
  '#bap_modern': 'Modern (2010-2019)',
  '#bap_current': 'Current (2020-present)',
  '#shred_global': 'Shred Global',
  '#anz_trikz': 'AnzTrikz',
  '#footbag_finland': 'Footbag Finland',
  '#footbag_org': 'footbag.org',
  '#demo_mosaic': 'Demos',
};

function friendlyTagLabel(display: string): string {
  const known = TAG_LABELS[display.toLowerCase()];
  if (known) return known;
  // Fallback: drop the leading '#', split on underscores, title-case each word.
  return stripHash(display)
    .split('_')
    .filter((w) => w.length > 0)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// Below this many items in the current set, a filter is pointless — you can see
// everything at a glance — so the bar is suppressed unless a refinement is
// already active. One tunable constant; the real gate is also that a tag exists
// that actually splits the set (see buildTagFilterView).
export const MIN_FILTERABLE_ITEMS = 5;

// A tag in its normalized (#lowercase) and display forms: the input shape for
// the shared filter-view builder.
export interface TagRef {
  normalized: string;
  display: string;
}

// A co-occurring tag with how many items in the current set carry it. A tag is
// a useful filter only when it splits the set (0 < count < setSize); a tag on
// every item (or none) changes nothing and is never suggested.
export interface SuggestionCandidate {
  normalized: string;
  display: string;
  count: number;
}

// Builds the editable tag filter for any dynamic gallery surface — or returns
// `null` when the filter would not help, so the surface renders no bar. This is
// the one content-driven gate every surface (browse, trick, named gallery,
// event/club) flows through:
//
//   - `setSize` is how many items the current set holds.
//   - `candidates` are co-occurring tags with their per-set counts; only those
//     that split the set (0 < count < setSize) are offered, so a tag on every
//     item (universal noise like `#freestyle` on an all-curated trick) never
//     appears and a single-item set has nothing to suggest.
//   - The bar shows iff a refinement is already active OR the set is at least
//     `minItems` AND a splitting tag exists. Otherwise → null.
//
// `basePath` is the surface URL; `contextTags` are the locked tags shown
// without a remove control. When `contextInUrl` is true they ride in the query
// string as `?context=` (so `/media/browse` can lock a club/event tag); when
// false the path itself encodes them (a trick slug, a named-gallery id) and
// they stay out of the query string. Include/exclude tags always come from the
// query string: each chip gets a `removeHref` dropping just that tag.
export function buildTagFilterView(args: {
  basePath: string;
  contextTags: TagRef[];
  contextInUrl: boolean;
  includeTags: TagRef[];
  excludeTags: TagRef[];
  setSize: number;
  candidates: SuggestionCandidate[];
  // How many items in the current set carry `#curated`. Drives the always-offered
  // "Curated" opt-in suggestion (include = view the curated subset; ⊘ = exclude
  // it for community-only). 0/omitted when the surface has no curator content.
  curatedCount?: number;
  minItems?: number;
}): TagFilterView | null {
  const includeNormalized = args.includeTags.map((t) => t.normalized);
  const excludeNormalized = args.excludeTags.map((t) => t.normalized);
  const contextNormalized = args.contextTags.map((t) => t.normalized);
  // Context rides the query string only when it is not already encoded in the
  // path; the owner-scoping `#by_*` tag rides as `?context=` so it survives a
  // submit to /media/browse and cannot be lifted by editing.
  const contextUrlTokens = args.contextInUrl ? contextNormalized : [];
  const active = new Set([...contextNormalized, ...includeNormalized, ...excludeNormalized]);

  // Context-aware suggestions: co-occurring tags that actually split the current
  // set and are not already active. `#curated` is offered as an opt-in, pinned
  // first, whenever the set has curator content and curated is not already active.
  const partitioning = (args.candidates ?? [])
    .filter((c) => c.normalized !== CURATED_TAG && c.count > 0 && c.count < args.setSize && !active.has(c.normalized))
    .sort((a, b) => b.count - a.count || a.normalized.localeCompare(b.normalized))
    .slice(0, FILTER_SUGGESTION_LIMIT);
  const curatedCount = args.curatedCount ?? 0;
  const offerCurated = curatedCount > 0 && !active.has(CURATED_TAG);
  const suggestions: SuggestionChip[] = [
    ...(offerCurated ? [{ display: friendlyTagLabel(CURATED_TAG), count: curatedCount, value: stripHash(CURATED_TAG) }] : []),
    ...partitioning.map((c) => ({ display: friendlyTagLabel(c.display), count: c.count, value: stripHash(c.normalized) })),
  ];

  // Show the filter when there is anything to act on: an active tag (criteria or
  // refinement), a set large enough to be worth filtering, or a suggestion.
  const minItems = args.minItems ?? MIN_FILTERABLE_ITEMS;
  if (active.size === 0 && args.setSize < minItems && suggestions.length === 0) return null;

  const contextChips: FilterChip[] = args.contextTags.map((t) => ({ display: t.display }));
  const contextInputs = contextUrlTokens.map((t) => ({ name: 'context', value: stripHash(t) }));
  return {
    contextChips,
    contextInputs,
    includeText: includeNormalized.map(stripHash).join(' '),
    excludeText: excludeNormalized.map(stripHash).join(' '),
    suggestions,
    addAction: args.basePath,
  };
}

// Folds a free-text add submission from an editable filter form into the
// current tag set and returns the canonical path for `basePath` to redirect to,
// or null when nothing was added (the caller then renders normally). `addMode`
// chooses include vs exclude; a blank tag is a no-op. Include wins over exclude
// on the same token, matching the read path.
export function resolveTagFilterAdd(args: {
  basePath: string;
  rawContext?: string[];
  rawTags: string[];
  rawExcludes: string[];
  newTag: unknown;
  addMode: unknown;
}): string | null {
  const token = typeof args.newTag === 'string' ? normalizeTagToken(args.newTag) : '';
  if (token.length === 0) return null;
  const context = uniqStrings((args.rawContext ?? []).map(normalizeTagToken).filter(notEmpty));
  const include = uniqStrings(args.rawTags.map(normalizeTagToken).filter(notEmpty));
  const exclude = uniqStrings(args.rawExcludes.map(normalizeTagToken).filter(notEmpty));
  // A token already locked as context is left as-is (can't be re-added).
  if (!context.includes(token)) {
    if (args.addMode === 'exclude') {
      if (!exclude.includes(token) && !include.includes(token)) exclude.push(token);
    } else if (!include.includes(token)) {
      include.push(token);
    }
  }
  return buildFilterPath(args.basePath, context, include, exclude);
}

// Canonical filter path for an "Apply Hashtag Filters" submit. The batch filter
// form posts its full checkbox state plus any free-text additions and an `apply`
// marker; the controller folds them here and redirects (PRG), so every applied
// filter lands on one clean shareable URL (normalized, de-duped, empty and
// raw-cased tokens dropped) no matter which boxes were checked. `curatedOff`
// replays a broadened named-gallery view.
export function canonicalFilterPath(args: {
  basePath: string;
  rawContext?: string[];
  rawTags: string[];
  rawExcludes: string[];
  curatedOff?: boolean;
}): string {
  const context = uniqStrings((args.rawContext ?? []).map(normalizeTagToken).filter(notEmpty));
  const include = uniqStrings(args.rawTags.map(normalizeTagToken).filter(notEmpty))
    .filter((t) => !context.includes(t));
  // Context and include win over exclude on the same token, matching the read path.
  const exclude = uniqStrings(args.rawExcludes.map(normalizeTagToken).filter(notEmpty))
    .filter((t) => !include.includes(t) && !context.includes(t));
  const path = buildFilterPath(args.basePath, context, include, exclude);
  if (!args.curatedOff) return path;
  return `${path}${path.includes('?') ? '&' : '?'}curated=off`;
}

// The /media/browse case of buildTagFilterView. Context tags (from `?context=`,
// e.g. a club/event gallery) lock and ride in the URL; include/exclude are the
// visitor's removable refinements. `setSize` is the full result count and
// `suggestionRows` carry per-tag counts, so the shared builder keeps only
// splitting tags and suppresses the bar on thin context-only sets.
// How many items in the given set carry `#curated`, for the always-offered
// "Curated" opt-in. The set is `setTagIds`/`setExcludeIds`; adding the curated
// id (deduped) and counting yields the curated subset size.
function countCuratedInSet(
  setTagIds: string[],
  setExcludeIds: string[],
  curatedTagId: string | null,
): number {
  if (!curatedTagId) return 0;
  return countGalleryItemsByCriteria([...new Set([...setTagIds, curatedTagId])], setExcludeIds);
}

function shapeBrowseFilter(args: {
  contextNormalized: string[];
  includeNormalized: string[];
  excludeNormalized: string[];
  contextRows: { tag_normalized: string; tag_display: string }[];
  includeRows: { tag_normalized: string; tag_display: string }[];
  excludeRows: { tag_normalized: string; tag_display: string }[];
  suggestionRows: { tag_normalized: string; tag_display: string; n: number }[];
  setSize: number;
  curatedCount?: number;
}): TagFilterView | null {
  const toRef = (r: { tag_normalized: string; tag_display: string }): TagRef => ({
    normalized: r.tag_normalized,
    display: r.tag_display,
  });
  // Reuse the resolved order from the normalized arrays so chip order matches
  // the URL; map rows by normalized form.
  const byNormalized = new Map(
    [...args.contextRows, ...args.includeRows, ...args.excludeRows].map((r) => [r.tag_normalized, r]),
  );
  const pick = (ns: string[]): TagRef[] =>
    ns.map((n) => byNormalized.get(n)).filter((r): r is { tag_normalized: string; tag_display: string } => r != null).map(toRef);
  // Consistent with named galleries: only the owner-scoping `#by_` context stays
  // locked; any other context tag (club / event / trick) is an editable include
  // the visitor can remove to broaden.
  const lockedContext = args.contextNormalized.filter((t) => t.startsWith(UPLOADER_TAG_PREFIX));
  const editableContext = args.contextNormalized.filter((t) => !t.startsWith(UPLOADER_TAG_PREFIX));
  return buildTagFilterView({
    basePath: '/media/browse',
    contextTags: pick(lockedContext),
    contextInUrl: true,
    includeTags: pick([...editableContext, ...args.includeNormalized]),
    excludeTags: pick(args.excludeNormalized),
    setSize: args.setSize,
    candidates: args.suggestionRows.map((r) => ({ normalized: r.tag_normalized, display: r.tag_display, count: r.n })),
    curatedCount: args.curatedCount,
  });
}
