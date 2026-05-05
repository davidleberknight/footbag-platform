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
} from '../db/db';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { runSqliteRead } from './sqliteRetry';
import { NotFoundError } from './serviceErrors';
import { PageViewModel } from '../types/page';

export const PAGE_SIZE = 24;

export interface GalleryItem {
  mediaId: string;
  mediaType: 'photo' | 'video';
  caption: string | null;
  thumbnailUrl: string;
  displayHref: string;
  uploadedAtIso: string;
  uploadedAtDisplay: string;
  tags: string[];
  // Inline-play support: video tiles render a click-to-play facade that swaps
  // the thumbnail for the platform iframe (YouTube/Vimeo) or a native HTML5
  // <video> element (s3). Photos leave both fields null.
  videoPlatform: 'youtube' | 'vimeo' | 's3' | null;
  videoEmbedUrl: string | null;
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

// Hub at /media: list of FH-owned named-gallery URL bookmarks.
export interface MediaHubGallerySummary {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  criteriaTags: string[];
  href: string;
}

export interface MediaHubContent {
  galleries: MediaHubGallerySummary[];
}

// Named-gallery page at /media/<id>: hero + items grouped by canonical
// trick tag. Items where source_id='tt_youtube' are excluded and counted
// separately so the page can route users to /freestyle/tt-series for that
// cluster. Per-trick groups render in alphabetical order.
export interface NamedGalleryHero {
  id: string;
  name: string;
  description: string;
  criteriaTags: string[];
}

export interface NamedGalleryGroup {
  tagSlug: string;            // canonical without leading '#', e.g. 'butterfly'
  tagDisplay: string;         // '#butterfly'
  trickHref: string;          // '/freestyle/tricks/<slug>' deep-link
  itemCount: number;
  items: GalleryItem[];
}

export interface NamedGalleryContent {
  gallery: NamedGalleryHero;
  groups: NamedGalleryGroup[];
  totalItems: number;
  excludedTtCount: number;
  ttSeriesHref: string;
}

/** Tags that describe gallery membership rather than trick identity. Skipped during grouping. */
const META_TAGS = new Set(['#freestyle', '#trick', '#curated']);

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
  let videoPlatform: GalleryItem['videoPlatform'] = null;
  let videoEmbedUrl: string | null = null;

  if (row.media_type === 'video') {
    // Branch on video_platform. The 's3' branch keeps the legacy shape
    // (video_id is an S3 key passed through the storage adapter); the
    // 'youtube' / 'vimeo' branches link out to the platform and use
    // platform-CDN thumbnails. NULL platform falls through to 's3' for
    // legacy/in-flight rows.
    if (row.video_platform === 'youtube') {
      thumbnailUrl = row.video_id
        ? `https://i.ytimg.com/vi/${row.video_id}/hqdefault.jpg`
        : '';
      displayHref = row.video_url ?? '';
      videoPlatform = 'youtube';
      videoEmbedUrl = row.video_id
        ? `https://www.youtube-nocookie.com/embed/${encodeURIComponent(row.video_id)}?rel=0`
        : null;
    } else if (row.video_platform === 'vimeo') {
      thumbnailUrl = row.thumbnail_url ?? '';
      displayHref = row.video_url ?? '';
      videoPlatform = 'vimeo';
      videoEmbedUrl = row.video_id
        ? `https://player.vimeo.com/video/${encodeURIComponent(row.video_id)}`
        : null;
    } else {
      thumbnailUrl = row.thumbnail_url ?? '';
      displayHref = row.video_id ? constructURL(row.video_id) : '';
      videoPlatform = 's3';
    }
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
    videoPlatform,
    videoEmbedUrl,
  };
}

export const mediaService = {
  getMediaHubPage(): PageViewModel<MediaHubContent> {
    return runSqliteRead('mediaService.getMediaHubPage', () => {
      const galleries = media.listFhNamedGalleries.all() as FhNamedGalleryRow[];

      const summaries: MediaHubGallerySummary[] = galleries.map((g) => {
        const tagRows = media.listFhNamedGalleryTags.all(g.id) as FhNamedGalleryTagRow[];
        const tagIds = tagRows.map((t) => t.id);
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          itemCount: countGalleryItemsByCriteria(tagIds),
          criteriaTags: tagRows.map((t) => t.tag_display),
          href: `/media/${g.id}`,
        };
      });

      return {
        seo: { title: 'Media Galleries' },
        page: {
          sectionKey: 'media',
          pageKey: 'media_hub',
          title: 'Media Galleries',
          intro: 'Curated photos and videos, organized into named galleries.',
        },
        content: { galleries: summaries },
      };
    });
  },

  getNamedGalleryPage(
    galleryId: string,
    _rawPage: unknown,
  ): PageViewModel<NamedGalleryContent> {
    return runSqliteRead('mediaService.getNamedGalleryPage', () => {
      const gallery = media.getFhNamedGalleryById.get(galleryId) as
        | FhNamedGalleryRow
        | undefined;
      if (!gallery) {
        throw new NotFoundError(`gallery ${galleryId} not found`);
      }

      const tagRows = media.listFhNamedGalleryTags.all(galleryId) as FhNamedGalleryTagRow[];
      const tagIds = tagRows.map((t) => t.id);
      const criteriaTagDisplays = tagRows.map((t) => t.tag_display);

      // Total includes TT items so the page can report how many were routed
      // away to /freestyle/tt-series; the rendered set excludes them.
      const totalAll = countGalleryItemsByCriteria(tagIds);
      const rows = queryGalleryItemsByCriteriaGrouped(tagIds);

      // Fetch tags for each rendered item so we can pick the canonical trick
      // tag for grouping. queryCuratorMediaTags returns [{ media_id, tag_display }].
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
      const groupsByTag = new Map<string, GalleryItem[]>();
      for (const row of rows as NamedGalleryGroupedRow[]) {
        const tags = tagsByMediaId.get(row.id) ?? [];
        const primaryTag = pickPrimaryTrickTag(tags);
        const key = primaryTag ?? '(uncategorized)';
        const item = shapeItem(row, tags, (k) => adapter.constructURL(k));
        const list = groupsByTag.get(key);
        if (list) list.push(item);
        else groupsByTag.set(key, [item]);
      }

      const groups: NamedGalleryGroup[] = [...groupsByTag.entries()]
        .map(([tagDisplay, items]) => {
          const slug = tagDisplay.replace(/^#/, '');
          return {
            tagSlug: slug,
            tagDisplay,
            trickHref: `/freestyle/tricks/${slug}`,
            itemCount: items.length,
            items,
          };
        })
        .sort((a, b) => a.tagDisplay.localeCompare(b.tagDisplay, undefined, { sensitivity: 'base' }));

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
            criteriaTags: criteriaTagDisplays,
          },
          groups,
          totalItems: rows.length,
          excludedTtCount: Math.max(0, totalAll - rows.length),
          ttSeriesHref: '/freestyle/tt-series',
        },
      };
    });
  },
};

/**
 * Pick the first non-meta tag from a media_items row's tag set. Returns the
 * tag display form (e.g. '#butterfly') or null if the row has only meta tags.
 * Tag order in `tagsByMediaId` mirrors `queryCuratorMediaTags` ordering
 * (alphabetical by tag_display) — deterministic for grouping stability.
 */
function pickPrimaryTrickTag(tags: string[]): string | null {
  for (const t of tags) {
    if (!META_TAGS.has(t.toLowerCase())) return t;
  }
  return null;
}
