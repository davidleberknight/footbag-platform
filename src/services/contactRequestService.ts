import { randomUUID } from 'node:crypto';
import { workQueue, account, transaction } from '../db/db';
import { appendAuditEntry } from './auditService';
import { getCommunicationService } from './communicationService';
import { NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import { PageViewModel } from '../types/page';

export const CONTACT_CATEGORIES = [
  'display_name_correction',
  'profile_url_correction',
  'tier_status_question',
  'identity_link_issue',
  'other',
] as const;
export type ContactCategory = (typeof CONTACT_CATEGORIES)[number];

export const CONTACT_CATEGORY_LABELS: Record<ContactCategory, string> = {
  display_name_correction: 'Display name correction',
  profile_url_correction:  'Profile URL correction',
  tier_status_question:    'Tier-status question',
  identity_link_issue:     'Identity-link issue',
  other:                   'Other',
};

export const DECISION_LABELS = [
  'corrected',
  'denied',
  'duplicate',
  'out_of_scope',
] as const;
export type DecisionLabel = (typeof DECISION_LABELS)[number];

export const DECISION_LABEL_DISPLAY: Record<DecisionLabel, string> = {
  corrected:    'Corrected',
  denied:       'Denied',
  duplicate:    'Duplicate',
  out_of_scope: 'Out of scope',
};

const TASK_TYPE = 'member_contact_request';
const MAX_OPEN_PER_MEMBER = 3;
const MAX_MESSAGE_LEN = 2000;
const MAX_REASON_TEXT = 200;
const MAX_RESOLUTION_NOTE = 500;

export interface ContactRequestSubmitInput {
  requestingMemberId: string;
  category: ContactCategory;
  message: string;
}

export interface ContactRequestResolveInput {
  queueItemId: string;
  adminMemberId: string;
  decisionLabel: DecisionLabel;
  resolutionNote: string;
}

export interface ContactRequestRow {
  id: string;
  openedAtIso: string;
  queueCategory: string;
  taskType: string;
  entityType: string;
  entityId: string;
  entityHref: string | null;
  entityDisplayName: string | null;
  reasonText: string | null;
}

function validateCategory(c: unknown): ContactCategory {
  if (typeof c !== 'string' || !CONTACT_CATEGORIES.includes(c as ContactCategory)) {
    throw new ValidationError(`Invalid category: ${String(c)}`);
  }
  return c as ContactCategory;
}

function validateDecisionLabel(d: unknown): DecisionLabel {
  if (typeof d !== 'string' || !DECISION_LABELS.includes(d as DecisionLabel)) {
    throw new ValidationError(`Invalid decision label: ${String(d)}`);
  }
  return d as DecisionLabel;
}

// Admin work-queue page-model builder. The work-queue groups every open
// admin task by `queueCategory` and renders a uniform decision-action
// form per row. Category and task-type display labels live here so the
// admin controller stays a thin HTTP adapter.

const WORK_QUEUE_CATEGORY_LABELS: Record<string, string> = {
  events:      'Events',
  media:       'Media',
  membership:  'Membership',
  payments:    'Payments',
  elections:   'Elections',
  system:      'System',
};

const WORK_QUEUE_TASK_TYPE_LABELS: Record<string, string> = {
  member_contact_request: 'Member contact request',
  auto_link_match:        'Auto-link match',
};

export interface WorkQueueViewItem {
  id: string;
  queueCategory: string;
  taskType: string;
  taskTypeLabel: string;
  openedAtIso: string;
  openedAtDisplay: string;
  entityType: string;
  entityId: string;
  entityHref: string | null;
  entityDisplayName: string | null;
  reasonText: string | null;
  decisionLabels: Array<{ value: string; label: string }>;
}

export interface WorkQueueGroup {
  category: string;
  categoryLabel: string;
  items: WorkQueueViewItem[];
}

export interface WorkQueueContent {
  groups: WorkQueueGroup[];
  totalOpen: number;
  resolvedFlag: boolean;
  errorMessage: string | null;
}

function shapeWorkQueueItem(raw: ContactRequestRow): WorkQueueViewItem {
  return {
    id: raw.id,
    queueCategory: raw.queueCategory,
    taskType: raw.taskType,
    taskTypeLabel: WORK_QUEUE_TASK_TYPE_LABELS[raw.taskType] ?? raw.taskType,
    openedAtIso: raw.openedAtIso,
    openedAtDisplay: raw.openedAtIso.slice(0, 10),
    entityType: raw.entityType,
    entityId: raw.entityId,
    entityHref: raw.entityHref,
    entityDisplayName: raw.entityDisplayName,
    reasonText: raw.reasonText,
    decisionLabels: DECISION_LABELS.map((d) => ({ value: d, label: DECISION_LABEL_DISPLAY[d] })),
  };
}

export const contactRequestService = {
  /**
   * Submit a new contact-IFPA-admin request from an authenticated member.
   * Throws RateLimitedError if member already has MAX_OPEN_PER_MEMBER open
   * requests of this task_type.
   */
  submit(input: ContactRequestSubmitInput): { id: string } {
    const category = validateCategory(input.category);
    const trimmed = (input.message ?? '').trim();
    if (trimmed.length === 0) {
      throw new ValidationError('Message is required.');
    }
    if (trimmed.length > MAX_MESSAGE_LEN) {
      throw new ValidationError(`Message must be ${MAX_MESSAGE_LEN} characters or fewer.`);
    }

    const openCountRow = workQueue.countOpenForMember.get(
      input.requestingMemberId,
      TASK_TYPE,
    ) as { c: number } | undefined;
    const openCount = openCountRow?.c ?? 0;
    if (openCount >= MAX_OPEN_PER_MEMBER) {
      throw new RateLimitedError(
        `You already have ${MAX_OPEN_PER_MEMBER} open requests. Please wait for an admin response before submitting another.`,
      );
    }

    const id = `wq_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const nowIso = new Date().toISOString();
    const categoryLabel = CONTACT_CATEGORY_LABELS[category];
    const summary = trimmed.length > MAX_REASON_TEXT
      ? trimmed.slice(0, MAX_REASON_TEXT)
      : trimmed;
    const reasonText = `${categoryLabel}: ${summary}`;

    // The work_queue_items INSERT and the admin-alerts mailing-list notification
    // commit in one transaction: a rollback cannot leave a dangling alert or
    // an alertless queue item. Notification body carries task_type and
    // entity_id only. (DD §5.4, US §198)
    transaction(() => {
      workQueue.insertItem.run(
        id, nowIso, input.requestingMemberId, nowIso, input.requestingMemberId,
        'membership',
        TASK_TYPE,
        'member',
        input.requestingMemberId,
        5,
        nowIso,
        reasonText,
      );
      getCommunicationService().enqueueMailingListEmail({
        mailingListSlug:      'admin-alerts',
        subject:              `New admin queue item: ${TASK_TYPE}`,
        bodyText:             `Task type: ${TASK_TYPE}\nEntity ID: ${id}`,
        idempotencyKeyPrefix: `admin-alerts:${TASK_TYPE}:${id}`,
      });
    });

    appendAuditEntry({
      actionType:    'support.contact_request_submitted',
      category:      'support',
      actorType:     'member',
      actorMemberId: input.requestingMemberId,
      entityType:    'member',
      entityId:      input.requestingMemberId,
      reasonText:    categoryLabel,
      metadata:      {
        queue_item_id: id,
        category,
        message: trimmed,
      },
    });

    return { id };
  },

  /**
   * Resolve an open contact-request queue item. Updates the queue row,
   * appends an audit entry, and dispatches an email reply to the requesting
   * member. Throws NotFoundError when the queue id does not exist or is not
   * currently open.
   */
  async resolve(input: ContactRequestResolveInput): Promise<void> {
    const decisionLabel = validateDecisionLabel(input.decisionLabel);
    const note = (input.resolutionNote ?? '').trim();
    if (note.length === 0) {
      throw new ValidationError('Resolution note is required.');
    }
    if (note.length > MAX_RESOLUTION_NOTE) {
      throw new ValidationError(`Resolution note must be ${MAX_RESOLUTION_NOTE} characters or fewer.`);
    }

    const row = workQueue.findById.get(input.queueItemId) as
      | { status: string; entity_type: string; entity_id: string; task_type: string; reason_text: string | null }
      | undefined;
    if (!row || row.status !== 'open' || row.task_type !== TASK_TYPE) {
      throw new NotFoundError(`Open contact request not found: ${input.queueItemId}`);
    }
    if (row.entity_type !== 'member') {
      throw new ValidationError('Unexpected entity type on contact-request row.');
    }

    const nowIso = new Date().toISOString();
    const result = workQueue.resolve.run(
      nowIso,
      input.adminMemberId,
      decisionLabel,
      note.slice(0, MAX_RESOLUTION_NOTE),
      nowIso,
      input.adminMemberId,
      input.queueItemId,
    );
    if (result.changes === 0) {
      throw new NotFoundError(`Open contact request not found: ${input.queueItemId}`);
    }

    appendAuditEntry({
      actionType:    'support.contact_request_resolved',
      category:      'support',
      actorType:     'admin',
      actorMemberId: input.adminMemberId,
      entityType:    'member',
      entityId:      row.entity_id,
      reasonText:    decisionLabel,
      metadata:      {
        queue_item_id: input.queueItemId,
        decision_label: decisionLabel,
        resolution_note: note,
        original_reason_text: row.reason_text,
      },
    });

    const member = account.findContactInfoById.get(row.entity_id) as
      | { id: string; slug: string; display_name: string; login_email: string }
      | undefined;
    if (member && member.login_email) {
      const displayDecision = DECISION_LABEL_DISPLAY[decisionLabel];
      const subject = `Your IFPA contact request: ${displayDecision}`;
      const bodyText = [
        `Hi ${member.display_name},`,
        '',
        `An IFPA administrator has resolved your contact request with decision: ${displayDecision}.`,
        '',
        'Admin note:',
        note,
        '',
        `Original request: ${row.reason_text ?? ''}`,
        '',
        'If you need further assistance, you can submit a new contact request from your profile edit page.',
        '',
        '— International Footbag Players Association',
      ].join('\n');

      // Enqueue via outbox so SES is never called synchronously inside a
      // request or transaction boundary. Terminal-state idempotency key:
      // re-resolving the same queue item produces no second email.
      getCommunicationService().enqueueEmail({
        recipientEmail:    member.login_email,
        recipientMemberId: member.id,
        subject,
        bodyText,
        idempotencyKey:    `contact-request-resolve:${input.queueItemId}`,
      });
    }
  },

  /**
   * List all currently open work-queue items for the admin dashboard.
   * Returns rows grouped server-side by category for view convenience.
   */
  listOpenForAdmin(): ContactRequestRow[] {
    const rows = workQueue.listOpenForAdmin.all() as Array<{
      id: string;
      opened_at: string;
      queue_category: string;
      task_type: string;
      entity_type: string;
      entity_id: string;
      reason_text: string | null;
    }>;
    return rows.map((r) => {
      // Entity-display lookup belongs in the service (db.ts is the only SQL
      // surface; controllers are HTTP glue). Resolves member rows only;
      // other entity types render as plain ID + type label.
      let entityHref: string | null = null;
      let entityDisplayName: string | null = null;
      if (r.entity_type === 'member') {
        const m = account.findContactInfoById.get(r.entity_id) as
          | { slug: string; display_name: string }
          | undefined;
        if (m) {
          entityHref = `/members/${m.slug}`;
          entityDisplayName = m.display_name;
        }
      }
      return {
        id: r.id,
        openedAtIso: r.opened_at,
        queueCategory: r.queue_category,
        taskType: r.task_type,
        entityType: r.entity_type,
        entityId: r.entity_id,
        entityHref,
        entityDisplayName,
        reasonText: r.reason_text,
      };
    });
  },

  /**
   * Build the full page view-model for the admin work queue. Groups all
   * open items by `queueCategory`, applies display-label maps, and wraps
   * the result in the standard `PageViewModel<WorkQueueContent>` envelope.
   * Controllers call this directly and render the return value.
   */
  getAdminWorkQueuePage(opts: { resolvedFlag?: boolean; errorMessage?: string } = {}): PageViewModel<WorkQueueContent> {
    const rows = this.listOpenForAdmin();
    const groupMap = new Map<string, WorkQueueViewItem[]>();
    for (const r of rows) {
      const arr = groupMap.get(r.queueCategory) ?? [];
      arr.push(shapeWorkQueueItem(r));
      groupMap.set(r.queueCategory, arr);
    }
    const groups: WorkQueueGroup[] = [];
    for (const [category, items] of groupMap.entries()) {
      groups.push({
        category,
        categoryLabel: WORK_QUEUE_CATEGORY_LABELS[category] ?? category,
        items,
      });
    }
    return {
      seo:  { title: 'Admin Work Queue' },
      page: { sectionKey: 'admin', pageKey: 'admin_work_queue', title: 'Admin Work Queue' },
      content: {
        groups,
        totalOpen: rows.length,
        resolvedFlag: opts.resolvedFlag ?? false,
        errorMessage: opts.errorMessage ?? null,
      },
    };
  },
};
