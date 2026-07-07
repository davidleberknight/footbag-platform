/**
 * FreestyleCurationService -- admin-facing curation of freestyle dictionary content.
 *
 * Owns:
 *   - The admin browse of freestyle trick dictionary rows: listing every row
 *     regardless of activation or review status, text search over canonical name
 *     and slug, and filters by active flag and review status.
 *   - The admin edit surface for one trick: rendering its editable scalar fields
 *     plus its (read-only here) attached aliases, sources, and modifier links, and
 *     saving edits to the nine scalar fields of the trick row.
 *
 * Does not own:
 *   - The public freestyle section pages (FreestyleService is public, read-only).
 *   - Freestyle ontology and doctrine (the content modules and doctrine docs).
 *   - Editing the attached aliases, sources, and modifier links; those stay
 *     read-only on this surface.
 *
 * Write discipline: updateTrickScalars validates the submitted fields for row
 * shape (canonical name required, ADD numeric/empty/"modifier", category and
 * review status within the existing allowed values, active a boolean) plus one
 * structural doctrine check: when the ADD is numeric and the execution notation
 * carries scoring brackets, the scoring-bracket count must equal the ADD. Rows
 * with no scoring brackets are not checked. Terminal-atom and name-to-slug
 * doctrine remain out of scope. The scalar update and its one audit entry commit
 * together in a single transaction; the slug identity key is not editable.
 *
 * Persistence: reads and writes freestyle_tricks; reads freestyle_trick_aliases,
 * freestyle_trick_source_links (join freestyle_trick_sources), and
 * freestyle_trick_modifier_links (join freestyle_trick_modifiers). Appends
 * freestyle.trick.updated to audit_entries on a save.
 */
import {
  freestyleTricks,
  freestyleTrickAliases,
  freestyleTrickSourceLinks,
  freestyleTrickModifiers,
  transaction,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { checkAddMatchesScoringBrackets } from '../lib/freestyleNotation';

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
  saved: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

/** The nine editable scalar fields submitted by the edit form. */
export interface FreestyleTrickScalarInput {
  canonicalName?: string;
  adds?: string;
  movementNotation?: string;
  executionNotation?: string;
  family?: string;
  baseTrick?: string;
  category?: string;
  reviewStatus?: string;
  isActive?: boolean;
}

/** Options for re-rendering the edit page after a save or a validation failure. */
export interface EditPageOptions {
  saved?: boolean;
  submitted?: FreestyleTrickScalarInput;
  fieldErrors?: Record<string, string>;
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

// The category set is broad and has no schema CHECK, so the allowed values are
// read from the data rather than hardcoded (the data carries values beyond the
// schema comment's examples, and some rows carry none).
function allowedCategories(): string[] {
  return (freestyleTricks.listDistinctCategories.all() as { category: string }[]).map((r) => r.category);
}

const REVIEW_STATUS_LABELS: Record<string, string> = {
  curated: 'Curated',
  expert_reviewed: 'Expert reviewed',
  pending: 'Pending',
};
const REVIEW_STATUS_VALUES = ['curated', 'expert_reviewed', 'pending'];

// The review statuses the admin surface manages. Deliberately the same three the
// browse filter offers; the schema's fourth value is not part of this surface.
const EDITABLE_REVIEW_STATUSES = REVIEW_STATUS_VALUES;

const CANONICAL_NAME_MAX = 200;

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

  // Edit page: the trick's editable scalar fields plus its attached aliases,
  // sources, and modifier links (the attached rows are read-only here). Returns
  // null when the slug has no row (the controller maps null to 404). `opts`
  // re-renders the form after a save (saved banner) or a validation failure
  // (the admin's submitted values plus per-field errors).
  getTrickEditPage(slug: string, opts: EditPageOptions = {}): PageViewModel<FreestyleTrickEditContent> | null {
    const row = freestyleTricks.getForCurationBySlug.get(slug) as CurationEditDbRow | undefined;
    if (!row) return null;

    const aliases: FreestyleTrickEditAlias[] = (freestyleTrickAliases.listForCuration.all(slug) as AliasDbRow[])
      .map((a) => ({ slug: a.alias_slug, text: a.alias_text, type: a.alias_type }));
    const sources: FreestyleTrickEditSource[] = (freestyleTrickSourceLinks.listForCuration.all(slug) as SourceLinkDbRow[])
      .map((s) => ({ label: s.source_label, type: s.source_type, url: s.source_url, externalUrl: s.external_url, assertedAdds: s.asserted_adds }));
    const modifierLinks: FreestyleTrickEditModifierLink[] = (freestyleTrickModifiers.listLinksByTrickSlug.all(slug) as ModifierLinkDbRow[])
      .map((m) => ({ slug: m.modifier_slug, name: m.modifier_name, type: m.modifier_type, addBonus: m.add_bonus, applyOrder: m.apply_order }));

    // On a validation re-render, show what the admin submitted; otherwise the DB.
    const sub = opts.submitted;
    const category     = sub ? (sub.category ?? '') : (row.category ?? '');
    const reviewStatus = sub ? (sub.reviewStatus ?? '') : row.review_status;
    const isActive     = sub ? sub.isActive === true : row.is_active === 1;

    const fields: FreestyleTrickEditFields = {
      canonicalName:     sub ? (sub.canonicalName ?? '') : row.canonical_name,
      adds:              sub ? (sub.adds ?? '') : (row.adds ?? ''),
      movementNotation:  sub ? (sub.movementNotation ?? '') : (row.notation ?? ''),
      executionNotation: sub ? (sub.executionNotation ?? '') : (row.operational_notation ?? ''),
      family:            sub ? (sub.family ?? '') : (row.trick_family ?? ''),
      baseTrick:         sub ? (sub.baseTrick ?? '') : (row.base_trick ?? ''),
      category,
      isActive,
      activeLabel:       isActive ? 'Active' : 'Inactive',
      reviewStatus,
      reviewStatusLabel: REVIEW_STATUS_LABELS[reviewStatus] ?? reviewStatus,
    };

    const categoryOptions: FilterOption[] = [
      { value: '', label: '(none)', selected: category === '' },
      ...allowedCategories().map((c) => ({ value: c, label: c, selected: c === category })),
    ];
    const reviewStatusOptions: FilterOption[] = EDITABLE_REVIEW_STATUSES
      .map((v) => ({ value: v, label: REVIEW_STATUS_LABELS[v], selected: v === reviewStatus }));

    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);

    return {
      seo:  { title: 'Freestyle Content' },
      page: { sectionKey: 'admin', pageKey: 'admin_freestyle_edit', title: row.canonical_name },
      content: {
        slug: row.slug,
        fields,
        categoryOptions,
        reviewStatusOptions,
        aliases,
        sources,
        modifierLinks,
        hasAliases:       aliases.length > 0,
        hasSources:       sources.length > 0,
        hasModifierLinks: modifierLinks.length > 0,
        backHref:         '/admin/freestyle/tricks',
        saved:            opts.saved === true,
        fieldErrors,
        errorList,
        hasErrors:        errorList.length > 0,
      },
    };
  },

  // Scalar-row update: validate the nine editable fields (row-shape rules only,
  // not the doctrine QC), then update the trick and append one audit entry in a
  // single transaction. slug is the identity key and is not editable; attached
  // aliases, sources, and modifier links are untouched. Throws NotFoundError for
  // an unknown slug and ValidationError (with per-field messages) on bad input.
  updateTrickScalars(slug: string, input: FreestyleTrickScalarInput, actorMemberId: string): void {
    const current = freestyleTricks.getForCurationBySlug.get(slug) as CurationEditDbRow | undefined;
    if (!current) throw new NotFoundError(`No freestyle trick "${slug}"`);

    const fieldErrors: Record<string, string> = {};

    const canonicalName = (input.canonicalName ?? '').trim();
    if (!canonicalName) {
      fieldErrors.canonicalName = 'Canonical name is required.';
    } else if (canonicalName.length > CANONICAL_NAME_MAX) {
      fieldErrors.canonicalName = `Canonical name must be ${CANONICAL_NAME_MAX} characters or fewer.`;
    }

    const addsRaw = (input.adds ?? '').trim();
    const adds = addsRaw === '' ? null : addsRaw;
    if (adds !== null && adds !== 'modifier' && !/^\d+$/.test(adds)) {
      fieldErrors.adds = 'ADD must be empty, a whole number, or "modifier".';
    }

    const categoryRaw = (input.category ?? '').trim();
    const category = categoryRaw === '' ? null : categoryRaw;
    if (category !== null && !allowedCategories().includes(category)) {
      fieldErrors.category = 'Category must be one of the existing category values.';
    }

    const reviewStatus = (input.reviewStatus ?? '').trim();
    if (!EDITABLE_REVIEW_STATUSES.includes(reviewStatus)) {
      fieldErrors.reviewStatus = 'Review status must be curated, expert reviewed, or pending.';
    }

    const isActive = input.isActive === true ? 1 : 0;
    const movementNotation  = emptyToNull(input.movementNotation);
    const executionNotation = emptyToNull(input.executionNotation);
    const family            = emptyToNull(input.family);
    const baseTrick         = emptyToNull(input.baseTrick);

    // Scoring-bracket parity: when the ADD is numeric and the execution notation
    // carries scoring brackets, their count must equal the ADD. Rows with no
    // scoring brackets (a blank field, or primitive markers like `[set] > toe`)
    // are not checked here.
    const bracketCheck = checkAddMatchesScoringBrackets(adds, executionNotation ?? '');
    if (bracketCheck && !bracketCheck.ok) {
      const noun = bracketCheck.bracketCount === 1 ? 'scoring bracket' : 'scoring brackets';
      fieldErrors.executionNotation =
        `Execution notation shows ${bracketCheck.bracketCount} ${noun} but ADD is ${bracketCheck.add}; they must match.`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      throw new ValidationError('Some fields need attention.', { fieldErrors });
    }

    const changedFields: string[] = [];
    if (canonicalName !== current.canonical_name)               changedFields.push('canonical_name');
    if (adds !== (current.adds ?? null))                        changedFields.push('adds');
    if (movementNotation !== (current.notation ?? null))        changedFields.push('notation');
    if (executionNotation !== (current.operational_notation ?? null)) changedFields.push('operational_notation');
    if (family !== (current.trick_family ?? null))              changedFields.push('trick_family');
    if (baseTrick !== (current.base_trick ?? null))             changedFields.push('base_trick');
    if (category !== (current.category ?? null))                changedFields.push('category');
    if (isActive !== current.is_active)                         changedFields.push('is_active');
    if (reviewStatus !== current.review_status)                 changedFields.push('review_status');

    transaction(() => {
      freestyleTricks.updateScalars.run(
        canonicalName, adds, movementNotation, executionNotation,
        family, baseTrick, category, isActive, reviewStatus, slug,
      );
      appendAuditEntry({
        actionType:    'freestyle.trick.updated',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick',
        entityId:      slug,
        metadata:      { changedFields },
      });
    });
  },
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
