/**
 * FreestyleCurationService -- admin-facing curation of freestyle dictionary content.
 *
 * Owns:
 *   - The admin read-only browse of freestyle trick dictionary rows: listing
 *     every row regardless of activation or review status, text search over
 *     canonical name and slug, and filters by active flag and review status.
 *
 * Does not own:
 *   - The public freestyle section pages (FreestyleService is public, read-only).
 *   - Freestyle ontology and doctrine (the content modules and doctrine docs).
 *
 * Read-only in this slice: no writes, no audit entries. The write path (editing a
 * trick and its aliases, sources, and modifier links) lands on this service in a
 * later slice; the browse links each row to that future edit surface.
 */
import { freestyleTricks } from '../db/db';
import { PageViewModel } from '../types/page';

interface CurationTrickDbRow {
  slug: string;
  canonical_name: string;
  adds: string | null;
  trick_family: string | null;
  is_active: number;
  review_status: string;
}

export interface FreestyleBrowseRow {
  slug: string;
  displayName: string;
  adds: string;
  family: string;
  isActive: boolean;
  activeLabel: string;
  reviewStatusLabel: string;
  editHref: string;
}

interface FilterOption {
  value: string;
  label: string;
  selected: boolean;
}

export interface FreestyleBrowseFilters {
  query: string;
  activeOptions: FilterOption[];
  reviewStatusOptions: FilterOption[];
  isFiltered: boolean;
}

export interface FreestyleBrowseContent {
  rows: FreestyleBrowseRow[];
  totalCount: number;
  filters: FreestyleBrowseFilters;
  hasRows: boolean;
}

export interface FreestyleBrowseFilterInput {
  query?: string;
  active?: string;        // '', 'active', or 'inactive'
  reviewStatus?: string;  // '', 'curated', 'expert_reviewed', or 'pending'
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  curated: 'Curated',
  expert_reviewed: 'Expert reviewed',
  pending: 'Pending',
};
const REVIEW_STATUS_VALUES = ['curated', 'expert_reviewed', 'pending'];

export const freestyleCurationService = {
  getBrowsePage(filter: FreestyleBrowseFilterInput = {}): PageViewModel<FreestyleBrowseContent> {
    const query = (filter.query ?? '').trim();
    const activeFilter = filter.active === 'active' || filter.active === 'inactive' ? filter.active : '';
    const reviewFilter = REVIEW_STATUS_VALUES.includes(filter.reviewStatus ?? '') ? (filter.reviewStatus as string) : '';

    const needle = query.toLowerCase();
    const all = freestyleTricks.listForCuration.all() as CurationTrickDbRow[];

    const rows: FreestyleBrowseRow[] = all
      .filter((r) => {
        if (needle && !(r.canonical_name.toLowerCase().includes(needle) || r.slug.toLowerCase().includes(needle))) {
          return false;
        }
        if (activeFilter === 'active' && r.is_active !== 1) return false;
        if (activeFilter === 'inactive' && r.is_active !== 0) return false;
        if (reviewFilter && r.review_status !== reviewFilter) return false;
        return true;
      })
      .map((r) => ({
        slug: r.slug,
        displayName: r.canonical_name,
        adds: r.adds ?? '',
        family: r.trick_family ?? '',
        isActive: r.is_active === 1,
        activeLabel: r.is_active === 1 ? 'Active' : 'Inactive',
        reviewStatusLabel: REVIEW_STATUS_LABELS[r.review_status] ?? r.review_status,
        editHref: `/admin/freestyle/tricks/${r.slug}/edit`,
      }));

    const activeOptions: FilterOption[] = [
      { value: '',         label: 'Any active state', selected: activeFilter === '' },
      { value: 'active',   label: 'Active',           selected: activeFilter === 'active' },
      { value: 'inactive', label: 'Inactive',         selected: activeFilter === 'inactive' },
    ];
    const reviewStatusOptions: FilterOption[] = [
      { value: '', label: 'Any review status', selected: reviewFilter === '' },
      ...REVIEW_STATUS_VALUES.map((v) => ({ value: v, label: REVIEW_STATUS_LABELS[v], selected: reviewFilter === v })),
    ];

    return {
      seo:  { title: 'Freestyle Content' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_browse', title: 'Freestyle Content' },
      content: {
        rows,
        totalCount: rows.length,
        filters: {
          query,
          activeOptions,
          reviewStatusOptions,
          isFiltered: query !== '' || activeFilter !== '' || reviewFilter !== '',
        },
        hasRows: rows.length > 0,
      },
    };
  },

  // Support for the not-yet-built edit surface: returns the trick's display name
  // so the placeholder can name which trick was requested, or null when the slug
  // has no row (the controller maps null to 404).
  getEditPlaceholder(slug: string): { slug: string; displayName: string } | null {
    const row = freestyleTricks.getAnyStatusBySlug.get(slug) as
      | { slug: string; canonical_name: string }
      | undefined;
    return row ? { slug: row.slug, displayName: row.canonical_name } : null;
  },
};
