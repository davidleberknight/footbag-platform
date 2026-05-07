import {
  CuratorGalleryRow,
  FhNamedGalleryRow,
  FhNamedGalleryTagRow,
  NamedGalleryGroupedRow,
  countGalleryItemsByCriteria,
  media,
  queryCuratorMediaTags,
  queryGalleryItemsByCriteria,
  queryGalleryItemsByCriteriaGrouped,
  queryMemberDisplayNamesBySlugs,
} from '../db/db';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { runSqliteRead } from './sqliteRetry';
import { NotFoundError } from './serviceErrors';
import { UPLOADER_TAG_PREFIX } from './curatorMediaService';
import { PageViewModel } from '../types/page';
import { VideoMedia, expandVideoFromMediaItem } from './videoMedia';

export const PAGE_SIZE = 24;

// Chip-shape for tag rendering: each tag display string carries an
// optional href. `#by_<slug>` chips render the member's display name
// (e.g. "David Leberknight") instead of the raw tag, with an href to
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

function shapeTagChip(
  display: string,
  viewer: ViewerContext,
  memberNamesBySlug: Map<string, string>,
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
  return { display, href: null };
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
  tags: string[];
  // Video tiles render a click-to-play facade via partials/video-facade.hbs
  // fed by this canonical shape. Null for photos.
  media: VideoMedia | null;
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

// Hub at /media: list of named-gallery URL bookmarks (FH-owned first,
// member-owned after). Each card carries the owner attribution.
//
// `byMember` is the lifted-out `#by_<slug>` criterion: when a gallery
// filters items by a specific member, that chip is rendered as prose
// attribution ("by David Leberknight") rather than listed alongside
// hashtag chips. Null when no `#by_*` criterion applies, or when the
// slug doesn't resolve to an active member (in which case the raw
// `#by_<slug>` tag stays in criteriaTags as fallback).
export interface MediaHubGallerySummary {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  byMember: TagChip | null;
  criteriaTags: TagChip[];
  excludeTags: TagChip[];
  href: string;
  owner: GalleryOwner;
}

export interface MediaHubContent {
  galleries: MediaHubGallerySummary[];
}

// Named-gallery page at /media/<id>: hero with "Named Gallery: <name>"
// + criteria/exclude pill strip, description as a caption paragraph
// below the hero, then a flat item grid in the gallery's sort_order.
// Owner attribution renders in the hero block.
//
// `byMember` is the lifted-out `#by_<slug>` criterion. See
// `MediaHubGallerySummary.byMember` for semantics.
export interface NamedGalleryHero {
  id: string;
  name: string;
  description: string;
  byMember: TagChip | null;
  criteriaTags: TagChip[];
  excludeTags: TagChip[];
  owner: GalleryOwner;
}

export interface NamedGalleryContent {
  gallery: NamedGalleryHero;
  items: GalleryItem[];
  totalItems: number;
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

function buildHref(galleryId: string, page: number): string {
  return page === 1 ? `/media/${galleryId}` : `/media/${galleryId}?page=${page}`;
}

function shapeItem(
  row: CuratorGalleryRow,
  tags: string[],
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

export const mediaService = {
  getMediaHubPage(viewer: ViewerContext = { authenticated: false }): PageViewModel<MediaHubContent> {
    return runSqliteRead('mediaService.getMediaHubPage', () => {
      const galleries = media.listAllNamedGalleries.all() as NamedGalleryWithOwnerRow[];

      const allTagRowsByGallery = galleries.map((g) => ({
        gallery: g,
        tagRows: media.listFhNamedGalleryTags.all(g.id) as FhNamedGalleryTagRow[],
        excludeTagRows: media.listFhNamedGalleryExcludeTags.all(g.id) as FhNamedGalleryTagRow[],
      }));
      const allTagDisplays = allTagRowsByGallery.flatMap((x) =>
        [...x.tagRows, ...x.excludeTagRows].map((r) => r.tag_display),
      );
      const memberNamesBySlug = collectMemberNamesForByTags(allTagDisplays);

      const summaries: MediaHubGallerySummary[] = allTagRowsByGallery.map(
        ({ gallery: g, tagRows, excludeTagRows }) => {
          const tagIds = tagRows.map((t) => t.id);
          const excludeTagIds = excludeTagRows.map((t) => t.id);
          const chips = shapeGalleryChips(tagRows, excludeTagRows, viewer, memberNamesBySlug);
          return {
            id: g.id,
            name: g.name,
            description: g.description,
            itemCount: countGalleryItemsByCriteria(tagIds, excludeTagIds),
            byMember: chips.byMember,
            criteriaTags: chips.criteriaTags,
            excludeTags: chips.excludeTags,
            href: `/media/${g.id}`,
            owner: shapeOwner(g),
          };
        },
      );

      return {
        seo: { title: 'Media Galleries' },
        page: {
          sectionKey: 'media',
          pageKey: 'media_hub',
          title: 'Media Galleries',
          intro: 'Photos and videos organized into named galleries.',
        },
        content: { galleries: summaries },
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

      const memberNamesBySlug = collectMemberNamesForByTags(
        [...tagRows, ...excludeTagRows].map((r) => r.tag_display),
      );
      const chips = shapeGalleryChips(tagRows, excludeTagRows, viewer, memberNamesBySlug);

      const rows = queryGalleryItemsByCriteriaGrouped(tagIds, gallery.sort_order, excludeTagIds);

      // Per-item tag displays for tile-level chip rendering (no per-trick
      // grouping; items render flat in the gallery's sort_order).
      const tagsByMediaId = new Map<string, string[]>();
      if (rows.length > 0) {
        const tagDisplays = queryCuratorMediaTags(rows.map((r) => r.id));
        for (const tr of tagDisplays) {
          const list = tagsByMediaId.get(tr.media_id);
          if (list) list.push(tr.tag_display);
          else tagsByMediaId.set(tr.media_id, [tr.tag_display]);
        }
      }

      const adapter = getMediaStorageAdapter();
      const items: GalleryItem[] = rows.map((row) =>
        shapeItem(row, tagsByMediaId.get(row.id) ?? [], (k) => adapter.constructURL(k)),
      );

      return {
        seo: { title: gallery.name },
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
          },
          items,
          totalItems: rows.length,
        },
      };
    });
  },
};
