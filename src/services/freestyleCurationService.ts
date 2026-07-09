/**
 * FreestyleCurationService -- admin-facing curation of freestyle dictionary content.
 *
 * Owns:
 *   - The admin browse of freestyle trick dictionary rows: listing every row
 *     regardless of activation or review status, text search over canonical name
 *     and slug, and filters by active flag and review status.
 *   - The admin edit surface for one trick: rendering its editable scalar fields
 *     and its attached aliases, sources, and modifier links, saving edits to the
 *     nine scalar fields of the trick row, adding or removing the trick's aliases,
 *     attaching or detaching links to the existing registry sources, and attaching
 *     or detaching links to the existing registry modifiers.
 *
 * Does not own:
 *   - The public freestyle section pages (FreestyleService is public, read-only).
 *   - Freestyle ontology and doctrine (the content modules and doctrine docs).
 *   - The source and modifier registries themselves (new provenance-source or
 *     modifier rows are not created here).
 *
 * Write discipline: updateTrickScalars validates the submitted fields for row
 * shape (canonical name required, ADD numeric/empty/"modifier", category and
 * review status within the existing allowed values, active a boolean) plus one
 * structural doctrine check: when the ADD is numeric and the execution notation
 * carries scoring brackets, the scoring-bracket count must equal the ADD. Rows
 * with no scoring brackets are not checked. Terminal-atom and name-to-slug
 * doctrine remain out of scope. addAlias derives the alias slug from the display
 * text with the pipeline's normalization, and rejects a slug that equals any
 * canonical trick slug (checked across every row regardless of status) or an
 * existing alias slug (the global primary key); it leaves source_id and notes
 * unset. removeAlias is scoped to the alias's own trick. attachSource links one
 * existing registry source with an optional external URL and asserted ADD (the
 * other link columns stay unset), rejecting an unknown source id or a duplicate
 * link; detachSource is keyed on both the trick and the source. attachModifier
 * links one existing registry modifier at an apply order that defaults to 1 when
 * blank, rejecting an unknown modifier or the exact (trick, modifier, apply order)
 * triple already linked, while allowing the same modifier at a different order;
 * detachModifier is keyed on the full triple. Each write and its one audit entry
 * commit together in a single transaction; the trick slug identity key is not
 * editable. Every write path first runs the pre-go-live persona guard, so a seeded
 * test persona cannot author freestyle content in a developer checkout; in staging
 * and production the guard is a no-op and the admin remains the audit actor.
 *
 * Persistence: reads and writes freestyle_tricks, freestyle_trick_aliases,
 * freestyle_trick_source_links, and freestyle_trick_modifier_links; reads
 * freestyle_trick_sources and freestyle_trick_modifiers. Appends
 * freestyle.trick.updated, freestyle.trick_alias.created/deleted,
 * freestyle.trick_source_link.created/deleted, and
 * freestyle.trick_modifier_link.created/deleted to audit_entries.
 */
import {
  freestyleTricks,
  freestyleTrickAliases,
  freestyleTrickSources,
  freestyleTrickSourceLinks,
  freestyleTrickModifiers,
  freestyleTrickModifierLinks,
  transaction,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { ForbiddenError, NotFoundError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';
import { checkAddMatchesScoringBrackets } from '../lib/freestyleNotation';
import { trickNameToSlug } from './freestyleRecordShaping';
import { config } from '../config/env';
import { isSeededTestPersonaMemberId } from '../lib/personaGuards';

// A pre-check rejects a duplicate before each insert, but two writers in separate
// processes can both pass that check and race to the same key; the primary-key /
// unique constraint is the authoritative backstop. Map its violation to the same
// ValidationError the pre-check raises, so the losing writer sees the clean
// "already exists" message instead of an unhandled 500.
function isDuplicateKeyError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

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
  deleteHref: string;
}

export interface FreestyleTrickEditSource {
  sourceId: string;
  label: string;
  type: string;
  url: string | null;
  externalUrl: string | null;
  assertedAdds: number | null;
  detachHref: string;
}

export interface FreestyleTrickEditModifierLink {
  slug: string;
  name: string;
  type: string;
  addBonus: number;
  applyOrder: number;
  detachHref: string;
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
  addAliasHref: string;
  aliasTypeOptions: FilterOption[];
  aliasFormText: string;
  aliasError: string;
  hasAliasError: boolean;
  attachSourceHref: string;
  sourceOptions: FilterOption[];
  hasUnlinkedSources: boolean;
  sourceFormExternalUrl: string;
  sourceFormAssertedAdds: string;
  sourceError: string;
  hasSourceError: boolean;
  attachModifierHref: string;
  modifierOptions: FilterOption[];
  modifierFormApplyOrder: string;
  modifierError: string;
  hasModifierError: boolean;
}

/** The alias fields the add-alias form submits. */
export interface FreestyleAliasInput {
  aliasText?: string;
  aliasType?: string;
}

/** The source-link fields the attach-source form submits. */
export interface FreestyleSourceLinkInput {
  sourceId?: string;
  externalUrl?: string;
  assertedAdds?: string;
}

/** The modifier-link fields the attach-modifier form submits. */
export interface FreestyleModifierLinkInput {
  modifierSlug?: string;
  applyOrder?: string;
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
  aliasError?: string;
  aliasSubmitted?: FreestyleAliasInput;
  sourceError?: string;
  sourceSubmitted?: FreestyleSourceLinkInput;
  modifierError?: string;
  modifierSubmitted?: FreestyleModifierLinkInput;
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
interface FullAliasDbRow extends AliasDbRow { trick_slug: string; }
interface SourceLinkDbRow {
  source_id: string;
  source_label: string;
  source_type: string;
  source_url: string | null;
  external_url: string | null;
  asserted_adds: number | null;
}
interface SourceLinkKeyDbRow {
  trick_slug: string;
  source_id: string;
  external_url: string | null;
  asserted_adds: number | null;
}
interface SourceRegistryRow { id: string; source_label: string; }
interface ModifierLinkDbRow {
  modifier_slug: string;
  modifier_name: string;
  modifier_type: string;
  add_bonus: number;
  apply_order: number;
}
interface ModifierRegistryRow { slug: string; modifier_name: string; modifier_type: string; }
interface ModifierLinkKeyDbRow { trick_slug: string; modifier_slug: string; apply_order: number; }

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

// Alias types the schema documents; offered by the add-alias form. No CHECK
// constrains the column, so the admin surface is the enforcement point.
const ALIAS_TYPE_LABELS: Record<string, string> = {
  common:       'Common',
  abbreviation: 'Abbreviation',
  historical:   'Historical',
  notation:     'Notation',
};
const ALIAS_TYPES = ['common', 'abbreviation', 'historical', 'notation'];
const ALIAS_TEXT_MAX = 200;

// Pre-go-live guardrail, parallel to the curated-media one. It fires only where a
// curator write touches the committed pre-go-live source of truth in a developer
// checkout (config.allowCuratedSidecarWrites, which is on in dev and the
// integration-test fixture and off in staging and production). There, a seeded
// test persona must never author freestyle dictionary content; real maintainer
// accounts carry ordinary member ids and pass. In staging and production this is
// a no-op, so any admin may curate. The admin remains the audit actor of record.
function assertActorMayCurateFreestyle(actorMemberId: string): void {
  if (config.allowCuratedSidecarWrites && isSeededTestPersonaMemberId(actorMemberId)) {
    throw new ForbiddenError(
      'Freestyle dictionary content cannot be edited by a test persona in a pre-go-live developer checkout.',
    );
  }
}

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
      .map((a) => ({
        slug: a.alias_slug,
        text: a.alias_text,
        type: a.alias_type,
        deleteHref: `/admin/freestyle/tricks/${slug}/aliases/${encodeURIComponent(a.alias_slug)}/delete`,
      }));

    // On a failed add-alias re-render, keep the submitted text and type; otherwise
    // the form starts empty with the default type.
    const aliasFormText = opts.aliasSubmitted?.aliasText ?? '';
    const selectedAliasType = opts.aliasSubmitted?.aliasType ?? 'common';
    const aliasTypeOptions: FilterOption[] = ALIAS_TYPES.map((t) => ({
      value: t,
      label: ALIAS_TYPE_LABELS[t] ?? t,
      selected: t === selectedAliasType,
    }));
    const aliasError = opts.aliasError ?? '';
    const sourceLinks = freestyleTrickSourceLinks.listForCuration.all(slug) as SourceLinkDbRow[];
    const sources: FreestyleTrickEditSource[] = sourceLinks.map((s) => ({
      sourceId:     s.source_id,
      label:        s.source_label,
      type:         s.source_type,
      url:          s.source_url,
      externalUrl:  s.external_url,
      assertedAdds: s.asserted_adds,
      detachHref:   `/admin/freestyle/tricks/${slug}/sources/${encodeURIComponent(s.source_id)}/delete`,
    }));

    // The attach-source select offers only registry sources not already linked to
    // this trick; the service still rejects a duplicate defensively.
    const linkedSourceIds = new Set(sourceLinks.map((s) => s.source_id));
    const sourceSelectedId = opts.sourceSubmitted?.sourceId ?? '';
    const sourceOptions: FilterOption[] = (freestyleTrickSources.listAll.all() as SourceRegistryRow[])
      .filter((r) => !linkedSourceIds.has(r.id))
      .map((r) => ({ value: r.id, label: r.source_label, selected: r.id === sourceSelectedId }));
    const sourceError = opts.sourceError ?? '';

    // The attach-modifier select offers every registry modifier: the same modifier
    // can legitimately recur on a trick at a different apply order, so it is not
    // filtered by what is already linked.
    const modifierSelectedSlug = opts.modifierSubmitted?.modifierSlug ?? '';
    const modifierOptions: FilterOption[] = (freestyleTrickModifiers.listAll.all() as ModifierRegistryRow[])
      .map((m) => ({
        value: m.slug,
        label: `${m.modifier_name} (${m.modifier_type})`,
        selected: m.slug === modifierSelectedSlug,
      }));
    const modifierError = opts.modifierError ?? '';
    const modifierLinks: FreestyleTrickEditModifierLink[] = (freestyleTrickModifiers.listLinksByTrickSlug.all(slug) as ModifierLinkDbRow[])
      .map((m) => ({
        slug: m.modifier_slug,
        name: m.modifier_name,
        type: m.modifier_type,
        addBonus: m.add_bonus,
        applyOrder: m.apply_order,
        detachHref: `/admin/freestyle/tricks/${slug}/modifiers/${encodeURIComponent(m.modifier_slug)}/${m.apply_order}/delete`,
      }));

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
        addAliasHref:     `/admin/freestyle/tricks/${row.slug}/aliases`,
        aliasTypeOptions,
        aliasFormText,
        aliasError,
        hasAliasError:    aliasError !== '',
        attachSourceHref: `/admin/freestyle/tricks/${row.slug}/sources`,
        sourceOptions,
        hasUnlinkedSources:     sourceOptions.length > 0,
        sourceFormExternalUrl:  opts.sourceSubmitted?.externalUrl ?? '',
        sourceFormAssertedAdds: opts.sourceSubmitted?.assertedAdds ?? '',
        sourceError,
        hasSourceError:   sourceError !== '',
        attachModifierHref: `/admin/freestyle/tricks/${row.slug}/modifiers`,
        modifierOptions,
        modifierFormApplyOrder: opts.modifierSubmitted?.applyOrder ?? '',
        modifierError,
        hasModifierError: modifierError !== '',
      },
    };
  },

  // Scalar-row update: validate the nine editable fields (row-shape rules only,
  // not the doctrine QC), then update the trick and append one audit entry in a
  // single transaction. slug is the identity key and is not editable; attached
  // aliases, sources, and modifier links are untouched. Throws NotFoundError for
  // an unknown slug and ValidationError (with per-field messages) on bad input.
  updateTrickScalars(slug: string, input: FreestyleTrickScalarInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
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

  // Add one alias to a trick. The alias slug is derived from the submitted display
  // text with the same normalization the pipeline uses, so it is always in the
  // lowercase-underscore form. Rejected (ValidationError, re-rendered inline) when
  // the text is empty or over-long, the type is not a recognized one, the derived
  // slug is empty, or the slug collides: an alias slug may not equal any canonical
  // trick slug (checked across every row regardless of status), nor an existing
  // alias slug (the global primary key). The insert and its audit entry commit in
  // one transaction. source_id and notes are left unset in this surface.
  addAlias(trickSlug: string, input: FreestyleAliasInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const trick = freestyleTricks.getForCurationBySlug.get(trickSlug) as CurationEditDbRow | undefined;
    if (!trick) throw new NotFoundError(`No freestyle trick "${trickSlug}"`);

    const aliasText = (input.aliasText ?? '').trim();
    if (!aliasText) {
      throw new ValidationError('Alias text is required.');
    }
    if (aliasText.length > ALIAS_TEXT_MAX) {
      throw new ValidationError(`Alias text must be ${ALIAS_TEXT_MAX} characters or fewer.`);
    }

    const aliasType = (input.aliasType ?? '').trim();
    if (!ALIAS_TYPES.includes(aliasType)) {
      throw new ValidationError('Choose an alias type.');
    }

    const aliasSlug = trickNameToSlug(aliasText);
    if (!aliasSlug) {
      throw new ValidationError('Alias text must contain at least one letter or number.');
    }

    // An alias may never equal a canonical trick slug, active or not.
    if (freestyleTricks.getForCurationBySlug.get(aliasSlug)) {
      throw new ValidationError(`"${aliasSlug}" is already a canonical trick slug, so it cannot be an alias.`);
    }

    // alias_slug is the global primary key: reject a duplicate distinctly from a
    // slug already owned by a different trick.
    const existing = freestyleTrickAliases.getByAliasSlug.get(aliasSlug) as FullAliasDbRow | undefined;
    if (existing) {
      if (existing.trick_slug === trickSlug) {
        throw new ValidationError(`"${aliasSlug}" is already an alias of this trick.`);
      }
      throw new ValidationError(`"${aliasSlug}" is already an alias of another trick ("${existing.trick_slug}").`);
    }

    try {
      transaction(() => {
        freestyleTrickAliases.insert.run(aliasSlug, aliasText, trickSlug, aliasType);
        appendAuditEntry({
          actionType:    'freestyle.trick_alias.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_trick_alias',
          entityId:      aliasSlug,
          metadata:      { trickSlug, aliasSlug, aliasText, aliasType },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError(`"${aliasSlug}" is already an alias.`);
      }
      throw err;
    }
  },

  // Remove one alias from a trick. Scoped to the trick both in the ownership check
  // and in the delete statement, so an edit page cannot remove another trick's
  // alias. The delete and its audit entry (carrying the removed text and type, so
  // the change is recoverable) commit in one transaction. Unknown or wrong-trick
  // alias is a NotFoundError (mapped to 404).
  removeAlias(trickSlug: string, aliasSlug: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const existing = freestyleTrickAliases.getByAliasSlug.get(aliasSlug) as FullAliasDbRow | undefined;
    if (!existing || existing.trick_slug !== trickSlug) {
      throw new NotFoundError(`No alias "${aliasSlug}" on trick "${trickSlug}"`);
    }

    transaction(() => {
      freestyleTrickAliases.deleteForTrick.run(aliasSlug, trickSlug);
      appendAuditEntry({
        actionType:    'freestyle.trick_alias.deleted',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_alias',
        entityId:      aliasSlug,
        metadata:      {
          trickSlug,
          aliasSlug,
          aliasText: existing.alias_text,
          aliasType: existing.alias_type,
        },
      });
    });
  },

  // Attach one existing registry source to a trick. Rejected (ValidationError,
  // re-rendered inline) when no source is chosen, the id is not a registry source,
  // the trick is already linked to it (the composite primary key), or the asserted
  // ADD is neither empty nor a whole number. external_url is trimmed to NULL when
  // blank; external_ref, asserted_notation, asserted_category, and notes stay unset
  // in this surface. The insert and its audit entry commit in one transaction.
  // Creating new registry sources is not part of this surface.
  attachSource(trickSlug: string, input: FreestyleSourceLinkInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const trick = freestyleTricks.getForCurationBySlug.get(trickSlug) as CurationEditDbRow | undefined;
    if (!trick) throw new NotFoundError(`No freestyle trick "${trickSlug}"`);

    const sourceId = (input.sourceId ?? '').trim();
    const source = (freestyleTrickSources.listAll.all() as SourceRegistryRow[]).find((r) => r.id === sourceId);
    if (!source) {
      throw new ValidationError('Choose a source from the list.');
    }

    if (freestyleTrickSourceLinks.getLink.get(trickSlug, sourceId)) {
      throw new ValidationError(`This trick is already linked to "${source.source_label}".`);
    }

    const externalUrl = emptyToNull(input.externalUrl);
    const assertedRaw = (input.assertedAdds ?? '').trim();
    if (assertedRaw !== '' && !/^\d+$/.test(assertedRaw)) {
      throw new ValidationError('Asserted ADD must be empty or a whole number.');
    }
    const assertedAdds = assertedRaw === '' ? null : parseInt(assertedRaw, 10);

    try {
      transaction(() => {
        freestyleTrickSourceLinks.insert.run(trickSlug, sourceId, externalUrl, assertedAdds);
        appendAuditEntry({
          actionType:    'freestyle.trick_source_link.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_trick_source_link',
          entityId:      `${trickSlug}:${sourceId}`,
          metadata:      { trickSlug, sourceId, externalUrl, assertedAdds },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError(`This trick is already linked to "${source.source_label}".`);
      }
      throw err;
    }
  },

  // Detach one source link from a trick. getLink is keyed on both the trick and
  // the source, so an unknown or wrong-trick link is a NotFoundError (mapped to
  // 404) and an edit page can never detach another trick's link. The delete and
  // its audit entry (carrying the removed link's fields for recovery) commit in
  // one transaction.
  detachSource(trickSlug: string, sourceId: string, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const link = freestyleTrickSourceLinks.getLink.get(trickSlug, sourceId) as SourceLinkKeyDbRow | undefined;
    if (!link) {
      throw new NotFoundError(`No source link "${sourceId}" on trick "${trickSlug}"`);
    }

    transaction(() => {
      freestyleTrickSourceLinks.deleteForTrick.run(trickSlug, sourceId);
      appendAuditEntry({
        actionType:    'freestyle.trick_source_link.deleted',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_source_link',
        entityId:      `${trickSlug}:${sourceId}`,
        metadata:      {
          trickSlug,
          sourceId,
          externalUrl:  link.external_url,
          assertedAdds: link.asserted_adds,
        },
      });
    });
  },

  // Attach one registry modifier to a trick at an apply order. The apply order
  // defaults to 1 when blank (the schema default), and the resolved integer is
  // what is stored and audited. Rejected (ValidationError, re-rendered inline)
  // when no modifier is chosen, the slug is not a registry modifier, the apply
  // order is not a whole number of 1 or more, or the exact triple (trick,
  // modifier, apply order) is already linked. The same modifier at a different
  // apply order is allowed. The insert and its audit entry commit in one
  // transaction. The modifier registry itself is not edited here.
  attachModifier(trickSlug: string, input: FreestyleModifierLinkInput, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const trick = freestyleTricks.getForCurationBySlug.get(trickSlug) as CurationEditDbRow | undefined;
    if (!trick) throw new NotFoundError(`No freestyle trick "${trickSlug}"`);

    const modifierSlug = (input.modifierSlug ?? '').trim();
    const modifier = freestyleTrickModifiers.getBySlug.get(modifierSlug) as ModifierRegistryRow | undefined;
    if (!modifier) {
      throw new ValidationError('Choose a modifier from the list.');
    }

    const orderRaw = (input.applyOrder ?? '').trim();
    let applyOrder: number;
    if (orderRaw === '') {
      applyOrder = 1;
    } else if (/^\d+$/.test(orderRaw) && parseInt(orderRaw, 10) >= 1) {
      applyOrder = parseInt(orderRaw, 10);
    } else {
      throw new ValidationError('Apply order must be a whole number of 1 or more.');
    }

    if (freestyleTrickModifierLinks.getLink.get(trickSlug, modifierSlug, applyOrder)) {
      throw new ValidationError(`"${modifier.modifier_name}" is already linked at apply order ${applyOrder}.`);
    }

    try {
      transaction(() => {
        freestyleTrickModifierLinks.insert.run(trickSlug, modifierSlug, applyOrder);
        appendAuditEntry({
          actionType:    'freestyle.trick_modifier_link.created',
          category:      'content',
          actorType:     'admin',
          actorMemberId,
          entityType:    'freestyle_trick_modifier_link',
          entityId:      `${trickSlug}:${modifierSlug}:${applyOrder}`,
          metadata:      { trickSlug, modifierSlug, applyOrder, modifierName: modifier.modifier_name },
        });
      });
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        throw new ValidationError(`"${modifier.modifier_name}" is already linked at apply order ${applyOrder}.`);
      }
      throw err;
    }
  },

  // Detach one modifier link from a trick. Keyed on the full triple (trick,
  // modifier, apply order), so an unknown or wrong-trick link is a NotFoundError
  // (mapped to 404) and an edit page can never detach a different link. The delete
  // and its audit entry commit in one transaction.
  detachModifier(trickSlug: string, modifierSlug: string, applyOrder: number, actorMemberId: string): void {
    assertActorMayCurateFreestyle(actorMemberId);
    const link = freestyleTrickModifierLinks.getLink.get(trickSlug, modifierSlug, applyOrder) as ModifierLinkKeyDbRow | undefined;
    if (!link) {
      throw new NotFoundError(`No modifier link "${modifierSlug}" at apply order ${applyOrder} on trick "${trickSlug}"`);
    }

    transaction(() => {
      freestyleTrickModifierLinks.deleteForTrick.run(trickSlug, modifierSlug, applyOrder);
      appendAuditEntry({
        actionType:    'freestyle.trick_modifier_link.deleted',
        category:      'content',
        actorType:     'admin',
        actorMemberId,
        entityType:    'freestyle_trick_modifier_link',
        entityId:      `${trickSlug}:${modifierSlug}:${applyOrder}`,
        metadata:      { trickSlug, modifierSlug, applyOrder },
      });
    });
  },
};

function emptyToNull(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim();
  return trimmed === '' ? null : trimmed;
}
