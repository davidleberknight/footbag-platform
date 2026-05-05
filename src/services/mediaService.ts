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
import { VideoMedia, expandVideoFromMediaItem } from './videoMedia';

export const PAGE_SIZE = 24;

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

// Hub at /media: list of FH-owned named-gallery URL bookmarks.
export interface MediaHubGallerySummary {
  id: string;
  name: string;
  description: string;
  itemCount: number;
  criteriaTags: string[];
  excludeTags: string[];
  href: string;
}

export interface MediaHubContent {
  galleries: MediaHubGallerySummary[];
}

// Named-gallery page at /media/<id>: hero with "Named Gallery: <name>"
// + criteria/exclude pill strip, description as a caption paragraph
// below the hero, then a flat item grid in the gallery's sort_order.
export interface NamedGalleryHero {
  id: string;
  name: string;
  description: string;
  criteriaTags: string[];
  excludeTags: string[];
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

export const mediaService = {
  getMediaHubPage(): PageViewModel<MediaHubContent> {
    return runSqliteRead('mediaService.getMediaHubPage', () => {
      const galleries = media.listFhNamedGalleries.all() as FhNamedGalleryRow[];

      const summaries: MediaHubGallerySummary[] = galleries.map((g) => {
        const tagRows = media.listFhNamedGalleryTags.all(g.id) as FhNamedGalleryTagRow[];
        const excludeTagRows = media.listFhNamedGalleryExcludeTags.all(g.id) as FhNamedGalleryTagRow[];
        const tagIds = tagRows.map((t) => t.id);
        const excludeTagIds = excludeTagRows.map((t) => t.id);
        return {
          id: g.id,
          name: g.name,
          description: g.description,
          itemCount: countGalleryItemsByCriteria(tagIds, excludeTagIds),
          criteriaTags: tagRows.map((t) => t.tag_display),
          excludeTags: excludeTagRows.map((t) => t.tag_display),
          href: `/media/${g.id}`,
        };
      });

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

      const excludeTagRows = media.listFhNamedGalleryExcludeTags.all(galleryId) as FhNamedGalleryTagRow[];
      const excludeTagIds = excludeTagRows.map((t) => t.id);

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
            criteriaTags: criteriaTagDisplays,
            excludeTags: excludeTagRows.map((t) => t.tag_display),
          },
          items,
          totalItems: rows.length,
        },
      };
    });
  },
};
