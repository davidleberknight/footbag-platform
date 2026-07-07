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
import {
  freestyleTricks,
  freestyleTrickAliases,
  freestyleTrickSourceLinks,
  freestyleTrickModifiers,
} from '../db/db';
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

export interface FreestyleTrickEditAlias {
  slug: string;
  text: string;
  type: string;
}

export interface FreestyleTrickEditSource {
  label: string;
  type: string;
  url: string | null;
  externalUrl: string | null;
  assertedAdds: number | null;
}

export interface FreestyleTrickEditModifierLink {
  slug: string;
  name: string;
  type: string;
  addBonus: number;
  applyOrder: number;
}

export interface FreestyleTrickEditFields {
  canonicalName: string;
  adds: string;
  movementNotation: string;
  executionNotation: string;
  family: string;
  baseTrick: string;
  category: string;
  isActive: boolean;
  activeLabel: string;
  reviewStatus: string;
  reviewStatusLabel: string;
}

export interface FreestyleTrickEditContent {
  slug: string;
  fields: FreestyleTrickEditFields;
  categoryOptions: FilterOption[];
  reviewStatusOptions: FilterOption[];
  aliases: FreestyleTrickEditAlias[];
  sources: FreestyleTrickEditSource[];
  modifierLinks: FreestyleTrickEditModifierLink[];
  hasAliases: boolean;
  hasSources: boolean;
  hasModifierLinks: boolean;
  backHref: string;
  savingDeferred: boolean;
}

interface CurationEditDbRow {
  slug: string;
  canonical_name: string;
  adds: string | null;
  notation: string | null;
  operational_notation: string | null;
  trick_family: string | null;
  base_trick: string | null;
  category: string | null;
  is_active: number;
  review_status: string;
}
interface AliasDbRow { alias_slug: string; alias_text: string; alias_type: string; }
interface SourceLinkDbRow {
  source_label: string;
  source_type: string;
  source_url: string | null;
  external_url: string | null;
  asserted_adds: number | null;
}
interface ModifierLinkDbRow {
  modifier_slug: string;
  modifier_name: string;
  modifier_type: string;
  add_bonus: number;
  apply_order: number;
}

const CATEGORY_VALUES = ['dex', 'body', 'set', 'compound', 'modifier'];

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

  // Read-only edit page: the trick's editable scalar fields plus its attached
  // aliases, sources, and modifier links, shaped for display. Returns null when
  // the slug has no row (the controller maps null to 404). No writes: the save
  // path (validation, transaction, audit) lands in a later slice.
  getTrickEditPage(slug: string): PageViewModel<FreestyleTrickEditContent> | null {
    const row = freestyleTricks.getForCurationBySlug.get(slug) as CurationEditDbRow | undefined;
    if (!row) return null;

    const aliases: FreestyleTrickEditAlias[] = (freestyleTrickAliases.listForCuration.all(slug) as AliasDbRow[])
      .map((a) => ({ slug: a.alias_slug, text: a.alias_text, type: a.alias_type }));
    const sources: FreestyleTrickEditSource[] = (freestyleTrickSourceLinks.listForCuration.all(slug) as SourceLinkDbRow[])
      .map((s) => ({ label: s.source_label, type: s.source_type, url: s.source_url, externalUrl: s.external_url, assertedAdds: s.asserted_adds }));
    const modifierLinks: FreestyleTrickEditModifierLink[] = (freestyleTrickModifiers.listLinksByTrickSlug.all(slug) as ModifierLinkDbRow[])
      .map((m) => ({ slug: m.modifier_slug, name: m.modifier_name, type: m.modifier_type, addBonus: m.add_bonus, applyOrder: m.apply_order }));

    const isActive = row.is_active === 1;

    return {
      seo:  { title: 'Freestyle Content' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_edit', title: row.canonical_name },
      content: {
        slug: row.slug,
        fields: {
          canonicalName:    row.canonical_name,
          adds:             row.adds ?? '',
          movementNotation: row.notation ?? '',
          executionNotation: row.operational_notation ?? '',
          family:           row.trick_family ?? '',
          baseTrick:        row.base_trick ?? '',
          category:         row.category ?? '',
          isActive,
          activeLabel:      isActive ? 'Active' : 'Inactive',
          reviewStatus:     row.review_status,
          reviewStatusLabel: REVIEW_STATUS_LABELS[row.review_status] ?? row.review_status,
        },
        categoryOptions: CATEGORY_VALUES.map((v) => ({ value: v, label: v, selected: v === (row.category ?? '') })),
        reviewStatusOptions: REVIEW_STATUS_VALUES.map((v) => ({ value: v, label: REVIEW_STATUS_LABELS[v], selected: v === row.review_status })),
        aliases,
        sources,
        modifierLinks,
        hasAliases:       aliases.length > 0,
        hasSources:       sources.length > 0,
        hasModifierLinks: modifierLinks.length > 0,
        backHref:         '/admin/freestyle/tricks',
        savingDeferred:   true,
      },
    };
  },
};
