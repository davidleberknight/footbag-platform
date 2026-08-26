/**
 * MailingListService -- administration of the mailing lists themselves.
 *
 * Owns:
 *   - Creating, editing and archiving the platform's subscription-backed
 *     mailing lists, and the per-list subscriber analytics an administrator
 *     reads before sending to one.
 *   - The exceptional manual adjustment of one member's subscription, which an
 *     administrator makes on that member's behalf and which carries a mandatory
 *     reason.
 *   - The shaping of the admin list surfaces: the index, the create and edit
 *     forms, and the per-list detail page carrying the analytics.
 *
 * Does not own:
 *   - Who receives a send. The send path resolves a list to recipients; this
 *     service never enumerates subscribers for delivery.
 *   - The member's own subscription choices, which the member makes for
 *     themselves, or the one-click withdrawal a mail client fires.
 *   - Group-backed lists. A group's roster is the record of who is on such a
 *     list, so those lists are created and retired by the group they belong to,
 *     and this service refuses to create one or to adjust a subscription on
 *     one.
 *
 * Required patterns:
 *   - Every write appends one audit row inside the same transaction, so a list
 *     cannot change without the ledger saying who changed it.
 *   - A write that moves nothing writes no audit row: archiving an already
 *     archived list, or setting a subscription to the status it already holds,
 *     reports the no-op rather than recording a change that did not happen.
 *   - The slug is derived once at creation and never rewritten. Subscriptions,
 *     outbox rows and broadcast archive rows all reference a list by slug, so a
 *     rewritten slug would orphan every one of them.
 *   - Archiving preserves everything. The list stops appearing in the member
 *     subscription screen and in new send flows; its subscriptions and its
 *     history stay exactly as they were.
 *
 * Persistence: mailing_lists (read/write), mailing_list_subscriptions
 * (status write, counts read).
 *
 * Side effects: audit_entries append on every successful write.
 */
import {
  mailingLists,
  transaction,
  type MailingListRow,
  type MailingListWithCountsRow,
} from '../db/db';
import { appendAuditEntry } from './auditService';
import { ConflictError, NotFoundError, ValidationError } from './serviceErrors';
import type { PageViewModel } from '../types/page';

const NAME_MAX = 100;
const DESCRIPTION_MAX = 500;
const SUBJECT_PREFIX_MAX = 32;
const FROM_IDENTITY_MAX = 254;
const REASON_MAX = 500;

/**
 * The statuses an administrator may set by hand. A bounce and a complaint are
 * facts the mail provider reported, not decisions anyone makes here, so neither
 * is offered: an administrator releases an address by returning it to
 * subscribed once the member has fixed it.
 */
export const ADMIN_SETTABLE_SUBSCRIPTION_STATUSES = [
  'subscribed',
  'unsubscribed',
  'suppressed',
] as const;

export type AdminSettableSubscriptionStatus =
  typeof ADMIN_SETTABLE_SUBSCRIPTION_STATUSES[number];

export interface MailingListCounts {
  subscribed: number;
  unsubscribed: number;
  bounced: number;
  complained: number;
  suppressed: number;
  total: number;
}

export interface MailingListSummary {
  slug: string;
  name: string;
  description: string;
  status: string;
  isArchived: boolean;
  isMemberManageable: boolean;
  isGroupBacked: boolean;
  sourceGroupId: string | null;
  fromIdentity: string | null;
  subjectPrefix: string;
  restrictedSending: boolean;
  counts: MailingListCounts;
}

export interface MailingListInput {
  name?: string;
  description?: string;
  isMemberManageable?: boolean;
  fromIdentity?: string;
  subjectPrefix?: string;
  restrictedSending?: boolean;
}

export type ArchiveOutcome =
  /** The list was active and is now archived. */
  | { status: 'archived' }
  /** The list was already archived, so nothing moved. */
  | { status: 'noop'; reason: 'already_archived' };

export type SubscriptionAdjustmentOutcome =
  /** The subscription row moved to the requested status. */
  | { status: 'adjusted' }
  /** No row moved: the member holds none on this list, or it already had that status. */
  | { status: 'noop'; reason: 'unchanged' };

function isUniqueViolation(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return code === 'SQLITE_CONSTRAINT_UNIQUE' || code === 'SQLITE_CONSTRAINT_PRIMARYKEY';
}

/**
 * The slug a new list is filed under, derived from its name. Hyphen-separated
 * to match the lists the platform seeds for itself, so an administrator reading
 * a list of slugs sees one convention rather than two.
 */
function slugForName(name: string): string {
  // NFKD splits an accented letter into its base plus a combining mark, and the
  // marks are dropped so an accented name yields the letter rather than a
  // separator where the accent stood.
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/\p{Mn}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
}

function countsOf(row: MailingListWithCountsRow): MailingListCounts {
  return {
    subscribed: row.subscribed_count,
    unsubscribed: row.unsubscribed_count,
    bounced: row.bounced_count,
    complained: row.complained_count,
    suppressed: row.suppressed_count,
    total: row.total_count,
  };
}

function shapeSummary(row: MailingListWithCountsRow): MailingListSummary {
  return {
    slug: row.slug,
    name: row.name,
    description: row.description,
    status: row.status,
    isArchived: row.status === 'archived',
    isMemberManageable: row.is_member_manageable === 1,
    isGroupBacked: row.recipient_source === 'group',
    sourceGroupId: row.source_group_id,
    fromIdentity: row.from_identity,
    subjectPrefix: row.subject_prefix,
    restrictedSending: row.restricted_sending === 1,
    counts: countsOf(row),
  };
}

/**
 * Shared field validation for creation and editing. Returns the cleaned values
 * alongside any per-field messages, so both paths apply one rule set.
 */
function validateFields(input: MailingListInput): {
  name: string;
  description: string;
  isMemberManageable: number;
  fromIdentity: string | null;
  subjectPrefix: string;
  restrictedSending: number;
  errors: Record<string, string>;
} {
  const errors: Record<string, string> = {};

  const name = (input.name ?? '').trim();
  if (!name) errors.name = 'Name: required.';
  else if (name.length > NAME_MAX) errors.name = `Name: at most ${NAME_MAX} characters.`;

  const description = (input.description ?? '').trim();
  if (description.length > DESCRIPTION_MAX) {
    errors.description = `Description: at most ${DESCRIPTION_MAX} characters.`;
  }

  const subjectPrefix = (input.subjectPrefix ?? '').trim();
  if (subjectPrefix.length > SUBJECT_PREFIX_MAX) {
    errors.subjectPrefix = `Subject prefix: at most ${SUBJECT_PREFIX_MAX} characters.`;
  }

  const fromRaw = (input.fromIdentity ?? '').trim();
  // Empty means the platform's default sender. A value that is not an address
  // would be rejected by the mail provider at send time, which is far too late
  // to tell whoever typed it.
  if (fromRaw && !/^[^\s@]+@[^\s@.]+\.[^\s@]+$/.test(fromRaw)) {
    errors.fromIdentity = 'From address: enter a complete email address, or leave it empty for the default sender.';
  } else if (fromRaw.length > FROM_IDENTITY_MAX) {
    errors.fromIdentity = `From address: at most ${FROM_IDENTITY_MAX} characters.`;
  }

  return {
    name,
    description,
    isMemberManageable: input.isMemberManageable === true ? 1 : 0,
    fromIdentity: fromRaw ? fromRaw : null,
    subjectPrefix,
    restrictedSending: input.restrictedSending === true ? 1 : 0,
    errors,
  };
}

// ---------------------------------------------------------------------------
// Admin page view-models
// ---------------------------------------------------------------------------

export interface MailingListIndexRowViewModel {
  slug: string;
  name: string;
  description: string;
  statusLabel: string;
  isArchived: boolean;
  audienceLabel: string;
  manageabilityLabel: string;
  subscribedCount: number;
  bouncedCount: number;
  complainedCount: number;
  totalCount: number;
  detailHref: string;
}

export interface MailingListIndexContent {
  rows: MailingListIndexRowViewModel[];
  totalCount: number;
  archivedCount: number;
  hasArchived: boolean;
  newHref: string;
}

export interface MailingListFormFields {
  name: string;
  description: string;
  isMemberManageable: boolean;
  fromIdentity: string;
  subjectPrefix: string;
}

export interface MailingListFormContent {
  formAction: string;
  isNew: boolean;
  fields: MailingListFormFields;
  nameMax: number;
  descriptionMax: number;
  subjectPrefixMax: number;
  fromIdentityMax: number;
  backHref: string;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

export interface MailingListCountRowViewModel {
  label: string;
  value: number;
  explanation: string;
}

export interface MailingListDetailContent {
  slug: string;
  name: string;
  description: string;
  statusLabel: string;
  isArchived: boolean;
  isGroupBacked: boolean;
  audienceLabel: string;
  manageabilityLabel: string;
  fromIdentityDisplay: string;
  subjectPrefixDisplay: string;
  countRows: MailingListCountRowViewModel[];
  totalCount: number;
  editHref: string;
  composeHref: string;
  archiveAction: string;
  adjustAction: string;
  backHref: string;
  canArchive: boolean;
  canAdjust: boolean;
  canCompose: boolean;
  cannotComposeReason: string;
  statusOptions: Array<{ value: string; label: string }>;
  reasonMax: number;
  savedNotice: string;
  hasSavedNotice: boolean;
  fieldErrors: Record<string, string>;
  errorList: string[];
  hasErrors: boolean;
}

/** What each administrative outcome says on the page it redirects back to. */
const DETAIL_NOTICES: Record<string, string> = {
  created: 'List created. It is active and appears in the member subscription screen if members may manage it.',
  saved: 'Saved.',
  archived: 'List archived. Its subscriptions and its past sends are kept; it is no longer offered to members or to new sends.',
  already_archived: 'This list was already archived, so nothing changed.',
  adjusted: 'Subscription updated, and the change is recorded against you in the audit history.',
  unchanged: 'Nothing changed: that member holds no subscription on this list, or it already had the status you chose.',
  sent: 'Message queued for the list. It goes out in paced batches, and it is recorded under Broadcasts.',
  already_sent: 'That message was already sent. Nothing went out a second time.',
  no_recipients: 'Nothing was sent: this list resolved to no deliverable subscribers.',
};

function audienceLabelOf(row: { recipient_source: string }): string {
  return row.recipient_source === 'group' ? 'A group roster' : 'Its own subscribers';
}

function manageabilityLabelOf(row: { is_member_manageable: number }): string {
  return row.is_member_manageable === 1 ? 'Members manage it' : 'Administrators only';
}

function fieldsFromRow(row: MailingListRow): MailingListFormFields {
  return {
    name: row.name,
    description: row.description,
    isMemberManageable: row.is_member_manageable === 1,
    fromIdentity: row.from_identity ?? '',
    subjectPrefix: row.subject_prefix,
  };
}

function emptyFields(): MailingListFormFields {
  return { name: '', description: '', isMemberManageable: true, fromIdentity: '', subjectPrefix: '' };
}

function fieldsFromInput(input: MailingListInput): MailingListFormFields {
  return {
    name: input.name ?? '',
    description: input.description ?? '',
    isMemberManageable: input.isMemberManageable === true,
    fromIdentity: input.fromIdentity ?? '',
    subjectPrefix: input.subjectPrefix ?? '',
  };
}

interface FormPageOptions {
  submitted?: MailingListInput;
  fieldErrors?: Record<string, string>;
}

interface DetailPageOptions {
  /** The outcome key the redirect carried, which names the banner to show. */
  notice?: string;
  fieldErrors?: Record<string, string>;
}

function formPage(
  isNew: boolean,
  formAction: string,
  baseFields: MailingListFormFields,
  opts: FormPageOptions,
): PageViewModel<MailingListFormContent> {
  const fieldErrors = opts.fieldErrors ?? {};
  const errorList = Object.values(fieldErrors);
  return {
    seo: { title: 'Mailing Lists', noindex: true },
    page: {
      sectionKey: 'admin',
      pageKey: isNew ? 'admin_mailing_list_new' : 'admin_mailing_list_edit',
      title: isNew ? 'New Mailing List' : 'Edit Mailing List',
    },
    content: {
      formAction,
      isNew,
      fields: opts.submitted ? fieldsFromInput(opts.submitted) : baseFields,
      nameMax: NAME_MAX,
      descriptionMax: DESCRIPTION_MAX,
      subjectPrefixMax: SUBJECT_PREFIX_MAX,
      fromIdentityMax: FROM_IDENTITY_MAX,
      backHref: '/admin/mailing-lists',
      fieldErrors,
      errorList,
      hasErrors: errorList.length > 0,
    },
  };
}

export const mailingListService = {
  /** Every list, archived ones included, with its subscriber counts by status. */
  listMailingLists(): MailingListSummary[] {
    const rows = mailingLists.listWithCounts.all() as MailingListWithCountsRow[];
    return rows.map(shapeSummary);
  },

  /** One list with its counts, or null when no list holds that slug. */
  getMailingList(slug: string): MailingListSummary | null {
    const row = mailingLists.getWithCounts.get(slug) as MailingListWithCountsRow | undefined;
    return row ? shapeSummary(row) : null;
  },

  /** The admin index: every list, active first, with the counts that matter at a glance. */
  getMailingListIndexPage(): PageViewModel<MailingListIndexContent> {
    const rows = (mailingLists.listWithCounts.all() as MailingListWithCountsRow[]).map((row) => ({
      slug: row.slug,
      name: row.name,
      description: row.description,
      statusLabel: row.status === 'archived' ? 'Archived' : 'Active',
      isArchived: row.status === 'archived',
      audienceLabel: audienceLabelOf(row),
      manageabilityLabel: manageabilityLabelOf(row),
      subscribedCount: row.subscribed_count,
      bouncedCount: row.bounced_count,
      complainedCount: row.complained_count,
      totalCount: row.total_count,
      detailHref: `/admin/mailing-lists/${row.slug}`,
    }));
    const archivedCount = rows.filter((r) => r.isArchived).length;

    return {
      seo: { title: 'Mailing Lists', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_mailing_lists', title: 'Mailing Lists' },
      content: {
        rows,
        totalCount: rows.length,
        archivedCount,
        hasArchived: archivedCount > 0,
        newHref: '/admin/mailing-lists/new',
      },
    };
  },

  /** The create form. */
  getNewListPage(opts: FormPageOptions = {}): PageViewModel<MailingListFormContent> {
    return formPage(true, '/admin/mailing-lists/new', emptyFields(), opts);
  },

  /** The edit form for one list, or null when no list holds that slug. */
  getEditListPage(slug: string, opts: FormPageOptions = {}): PageViewModel<MailingListFormContent> | null {
    const row = mailingLists.getBySlug.get(slug) as MailingListRow | undefined;
    if (!row) return null;
    return formPage(false, `/admin/mailing-lists/${slug}/edit`, fieldsFromRow(row), opts);
  },

  /**
   * One list's detail page: what it is, who it reaches, its subscriber counts,
   * and the two administrative actions. Null when no list holds that slug.
   */
  getMailingListDetailPage(
    slug: string,
    opts: DetailPageOptions = {},
  ): PageViewModel<MailingListDetailContent> | null {
    const row = mailingLists.getWithCounts.get(slug) as MailingListWithCountsRow | undefined;
    if (!row) return null;

    const isArchived = row.status === 'archived';
    const isGroupBacked = row.recipient_source === 'group';
    const fieldErrors = opts.fieldErrors ?? {};
    const errorList = Object.values(fieldErrors);
    const notice = opts.notice ? DETAIL_NOTICES[opts.notice] ?? '' : '';

    return {
      seo: { title: 'Mailing Lists', noindex: true },
      page: { sectionKey: 'admin', pageKey: 'admin_mailing_list_detail', title: row.name },
      content: {
        slug: row.slug,
        name: row.name,
        description: row.description,
        statusLabel: isArchived ? 'Archived' : 'Active',
        isArchived,
        isGroupBacked,
        audienceLabel: audienceLabelOf(row),
        manageabilityLabel: manageabilityLabelOf(row),
        fromIdentityDisplay: row.from_identity ?? 'The platform default sender',
        subjectPrefixDisplay: row.subject_prefix ? `[${row.subject_prefix}]` : 'None',
        countRows: [
          { label: 'Subscribed', value: row.subscribed_count, explanation: 'Receives mail sent to this list.' },
          { label: 'Unsubscribed', value: row.unsubscribed_count, explanation: 'Withdrew, and stays withdrawn until they opt back in.' },
          { label: 'Bounced', value: row.bounced_count, explanation: 'The mail provider could not deliver to the address.' },
          { label: 'Complained', value: row.complained_count, explanation: 'The recipient marked a message as spam.' },
          { label: 'Suppressed', value: row.suppressed_count, explanation: 'Held off the list by an administrator.' },
        ],
        totalCount: row.total_count,
        editHref: `/admin/mailing-lists/${row.slug}/edit`,
        composeHref: `/admin/mailing-lists/${row.slug}/compose`,
        archiveAction: `/admin/mailing-lists/${row.slug}/archive`,
        adjustAction: `/admin/mailing-lists/${row.slug}/subscriptions/adjust`,
        backHref: '/admin/mailing-lists',
        canArchive: !isArchived,
        // A group-backed list's membership is the group roster, so there is no
        // subscription here for an administrator to move.
        canAdjust: !isGroupBacked,
        // An archived list is closed to new sends, and a group-backed list
        // resolves through a roster the groups feature supplies.
        canCompose: !isArchived && !isGroupBacked,
        cannotComposeReason: isArchived
          ? 'This list is archived, so nothing further is sent to it.'
          : isGroupBacked
            ? 'This list takes its recipients from a group roster, which the groups feature supplies. Sending to a group is not available yet.'
            : '',
        statusOptions: ADMIN_SETTABLE_SUBSCRIPTION_STATUSES.map((value) => ({
          value,
          label: value.charAt(0).toUpperCase() + value.slice(1),
        })),
        reasonMax: REASON_MAX,
        savedNotice: notice,
        hasSavedNotice: notice.length > 0,
        fieldErrors,
        errorList,
        hasErrors: errorList.length > 0,
      },
    };
  },

  /**
   * Creates a subscription-backed list and returns its slug. A group-backed
   * list is never created here: enabling a group's mail is what creates one,
   * and the group's roster is what fills it.
   */
  createList(input: MailingListInput, actorMemberId: string): string {
    const fields = validateFields(input);

    const slug = slugForName(fields.name);
    if (!fields.errors.name && !slug) {
      fields.errors.name = 'Name: use at least one letter or digit.';
    }
    if (Object.keys(fields.errors).length) {
      throw new ValidationError('Some fields need attention.', { fieldErrors: fields.errors });
    }

    const now = new Date().toISOString();
    try {
      transaction(() => {
        mailingLists.insertList.run(
          slug, now, fields.name, fields.description,
          fields.isMemberManageable, fields.fromIdentity,
          fields.subjectPrefix,
        );
        appendAuditEntry({
          actionType: 'mailing_list.created',
          category: 'system',
          actorType: 'admin',
          actorMemberId,
          entityType: 'mailing_list',
          entityId: slug,
          metadata: {
            name: fields.name,
            isMemberManageable: fields.isMemberManageable === 1,
          },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('A mailing list with that name already exists.');
      }
      throw err;
    }
    return slug;
  },

  /**
   * Updates a list's editable fields. The slug and the status are not among
   * them: the slug is the reference every subscription and every archived send
   * holds, and the status moves only through archiving.
   */
  updateList(slug: string, input: MailingListInput, actorMemberId: string): void {
    const current = mailingLists.getBySlug.get(slug) as MailingListRow | undefined;
    if (!current) throw new NotFoundError(`No mailing list "${slug}"`);

    const fields = validateFields(input);
    if (Object.keys(fields.errors).length) {
      throw new ValidationError('Some fields need attention.', { fieldErrors: fields.errors });
    }

    const changedFields: string[] = [];
    if (fields.name !== current.name) changedFields.push('name');
    if (fields.description !== current.description) changedFields.push('description');
    if (fields.isMemberManageable !== current.is_member_manageable) changedFields.push('is_member_manageable');
    if (fields.fromIdentity !== current.from_identity) changedFields.push('from_identity');
    if (fields.subjectPrefix !== current.subject_prefix) changedFields.push('subject_prefix');
    if (fields.restrictedSending !== current.restricted_sending) changedFields.push('restricted_sending');

    const now = new Date().toISOString();
    try {
      transaction(() => {
        mailingLists.updateList.run(
          fields.name, fields.description, fields.isMemberManageable,
          fields.fromIdentity, fields.subjectPrefix, fields.restrictedSending,
          now, slug,
        );
        appendAuditEntry({
          actionType: 'mailing_list.updated',
          category: 'system',
          actorType: 'admin',
          actorMemberId,
          entityType: 'mailing_list',
          entityId: slug,
          metadata: { changedFields },
        });
      });
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictError('A mailing list with that name already exists.');
      }
      throw err;
    }
  },

  /**
   * Archives a list. Every subscription and every past send is preserved; the
   * list simply stops being offered to members and to new sends. Archiving one
   * that is already archived changes nothing and is reported as such.
   */
  archiveList(slug: string, actorMemberId: string): ArchiveOutcome {
    const current = mailingLists.getBySlug.get(slug) as MailingListRow | undefined;
    if (!current) throw new NotFoundError(`No mailing list "${slug}"`);
    if (current.status === 'archived') {
      return { status: 'noop', reason: 'already_archived' };
    }

    const now = new Date().toISOString();
    transaction(() => {
      mailingLists.archiveList.run(now, slug);
      appendAuditEntry({
        actionType: 'mailing_list.archived',
        category: 'system',
        actorType: 'admin',
        actorMemberId,
        entityType: 'mailing_list',
        entityId: slug,
      });
    });
    return { status: 'archived' };
  },

  /**
   * The exceptional manual adjustment of one member's subscription, made on
   * that member's behalf. A member-manageable list is the member's own to
   * control, so a change made for them carries a mandatory reason and lands in
   * the ledger naming the administrator who made it.
   */
  adjustSubscription(
    slug: string,
    memberId: string,
    status: string,
    reason: string,
    actorMemberId: string,
  ): SubscriptionAdjustmentOutcome {
    const list = mailingLists.getBySlug.get(slug) as MailingListRow | undefined;
    if (!list) throw new NotFoundError(`No mailing list "${slug}"`);

    const errors: Record<string, string> = {};
    if (!ADMIN_SETTABLE_SUBSCRIPTION_STATUSES.includes(status as AdminSettableSubscriptionStatus)) {
      errors.status = 'Status: choose one of the listed values.';
    }
    const trimmedReason = (reason ?? '').trim();
    if (!trimmedReason) errors.reason = 'Reason: required for a change made on a member\'s behalf.';
    else if (trimmedReason.length > REASON_MAX) errors.reason = `Reason: at most ${REASON_MAX} characters.`;
    if (Object.keys(errors).length) {
      throw new ValidationError('Some fields need attention.', { fieldErrors: errors });
    }

    // A group-backed list has no subscription to adjust: being in the group is
    // what puts a member on it, so the only honest way to take them off is to
    // remove them from the group.
    if (list.recipient_source === 'group') {
      throw new ValidationError(
        'This list takes its recipients from a group roster. Change the group\'s membership instead.',
      );
    }

    const now = new Date().toISOString();
    let changed = 0;
    transaction(() => {
      const result = mailingLists.adminSetSubscriptionStatus.run(
        status, now, now, actorMemberId, slug, memberId,
      );
      changed = result.changes;
      // Nothing moved: either this member holds no row on this list, or it
      // already carries the status asked for. Recording that as an adjustment
      // would put a change in the ledger that never happened.
      if (changed > 0) {
        appendAuditEntry({
          actionType: 'mailing_list.subscription_adjusted',
          category: 'system',
          actorType: 'admin',
          actorMemberId,
          entityType: 'mailing_list',
          entityId: slug,
          reasonText: trimmedReason,
          metadata: { memberId, status },
        });
      }
    });

    return changed > 0
      ? { status: 'adjusted' }
      : { status: 'noop', reason: 'unchanged' };
  },
};
