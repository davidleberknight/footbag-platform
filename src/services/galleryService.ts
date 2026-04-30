import {
  CuratorGalleryRow,
  CuratorMediaCountRow,
  media,
  queryCuratorMediaTags,
} from '../db/db';
import { getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { runSqliteRead } from './sqliteRetry';
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

export interface GalleryContent {
  items: GalleryItem[];
  pagination: GalleryPagination;
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

function buildHref(page: number): string {
  return page === 1 ? '/gallery' : `/gallery?page=${page}`;
}

function shapeItem(
  row: CuratorGalleryRow,
  tags: string[],
  constructURL: (key: string) => string,
): GalleryItem {
  let thumbnailUrl: string;
  let displayHref: string;

  if (row.media_type === 'video') {
    thumbnailUrl = row.thumbnail_url ?? '';
    displayHref = row.video_id ? constructURL(row.video_id) : '';
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
  };
}

export const galleryService = {
  getPublicGalleryPage(rawPage: unknown): PageViewModel<GalleryContent> {
    const page = sanitizePage(rawPage);

    return runSqliteRead('galleryService.getPublicGalleryPage', () => {
      const countRow = media.countCuratorMedia.get() as CuratorMediaCountRow;
      const total = countRow.n;

      const offset = (page - 1) * PAGE_SIZE;
      const rows = media.listCuratorMedia.all(PAGE_SIZE, offset) as CuratorGalleryRow[];

      const tagsByMediaId = new Map<string, string[]>();
      if (rows.length > 0) {
        const tagRows = queryCuratorMediaTags(rows.map((r) => r.id));
        for (const tr of tagRows) {
          const list = tagsByMediaId.get(tr.media_id);
          if (list) list.push(tr.tag_display);
          else tagsByMediaId.set(tr.media_id, [tr.tag_display]);
        }
      }

      const adapter = getMediaStorageAdapter();
      const items = rows.map((r) =>
        shapeItem(r, tagsByMediaId.get(r.id) ?? [], (k) => adapter.constructURL(k)),
      );

      const hasPrev = page > 1;
      const hasNext = offset + rows.length < total;

      return {
        seo: { title: 'Media Gallery' },
        page: {
          sectionKey: 'gallery',
          pageKey: 'gallery_index',
          title: 'Media Gallery',
          intro: 'Photos and videos from the IFPA curator account.',
        },
        content: {
          items,
          pagination: {
            page,
            pageSize: PAGE_SIZE,
            total,
            hasPrev,
            hasNext,
            prevHref: hasPrev ? buildHref(page - 1) : undefined,
            nextHref: hasNext ? buildHref(page + 1) : undefined,
          },
        },
      };
    });
  },
};
