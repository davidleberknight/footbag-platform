import { Request, Response, NextFunction } from 'express';
import { contactRequestService, DECISION_LABELS, DECISION_LABEL_DISPLAY, CONTACT_CATEGORY_LABELS, type ContactCategory } from '../services/contactRequestService';
import { NotFoundError, ValidationError } from '../services/serviceErrors';
import { handleControllerError } from '../lib/controllerErrors';
import { account } from '../db/db';
import { PageViewModel } from '../types/page';
import { FLASH_KIND, writeFlash, readFlash, clearFlash } from '../lib/flashCookie';

interface WorkQueueViewItem {
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
  decisionLabels: { value: string; label: string }[];
}

interface WorkQueueGroup {
  category: string;
  categoryLabel: string;
  items: WorkQueueViewItem[];
}

interface WorkQueueContent {
  groups: WorkQueueGroup[];
  totalOpen: number;
  resolvedFlag: boolean;
  errorMessage: string | null;
}

const CATEGORY_LABEL: Record<string, string> = {
  events:      'Events',
  media:       'Media',
  membership:  'Membership',
  payments:    'Payments',
  elections:   'Elections',
  system:      'System',
};

const TASK_TYPE_LABEL: Record<string, string> = {
  member_contact_request: 'Member contact request',
  auto_link_match:        'Auto-link match',
};

function shapeItem(raw: {
  id: string;
  queueCategory: string;
  taskType: string;
  openedAtIso: string;
  entityType: string;
  entityId: string;
  reasonText: string | null;
}): WorkQueueViewItem {
  let entityHref: string | null = null;
  let entityDisplayName: string | null = null;
  if (raw.entityType === 'member') {
    const m = account.findContactInfoById.get(raw.entityId) as
      | { slug: string; display_name: string }
      | undefined;
    if (m) {
      entityHref = `/members/${m.slug}`;
      entityDisplayName = m.display_name;
    }
  }
  return {
    id: raw.id,
    queueCategory: raw.queueCategory,
    taskType: raw.taskType,
    taskTypeLabel: TASK_TYPE_LABEL[raw.taskType] ?? raw.taskType,
    openedAtIso: raw.openedAtIso,
    openedAtDisplay: raw.openedAtIso.slice(0, 10),
    entityType: raw.entityType,
    entityId: raw.entityId,
    entityHref,
    entityDisplayName,
    reasonText: raw.reasonText,
    decisionLabels: DECISION_LABELS.map((d) => ({ value: d, label: DECISION_LABEL_DISPLAY[d] })),
  };
}

function buildVm(opts: { resolvedFlag?: boolean; errorMessage?: string } = {}): PageViewModel<WorkQueueContent> {
  const rows = contactRequestService.listOpenForAdmin();
  const groupMap = new Map<string, WorkQueueViewItem[]>();
  for (const r of rows) {
    const arr = groupMap.get(r.queueCategory) ?? [];
    arr.push(shapeItem(r));
    groupMap.set(r.queueCategory, arr);
  }
  const groups: WorkQueueGroup[] = [];
  for (const [category, items] of groupMap.entries()) {
    groups.push({
      category,
      categoryLabel: CATEGORY_LABEL[category] ?? category,
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
}

export const adminWorkQueueController = {
  /** GET /admin/work-queue */
  index(req: Request, res: Response, next: NextFunction): void {
    try {
      const flash = readFlash(req);
      let resolvedFlag = false;
      if (flash?.kind === FLASH_KIND.WORK_QUEUE_RESOLVED) {
        resolvedFlag = true;
        clearFlash(res);
      }
      const vm = buildVm({ resolvedFlag });
      res.render('admin/work-queue/index', vm);
    } catch (err) {
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  /** POST /admin/work-queue/:id/resolve */
  async resolve(req: Request, res: Response, next: NextFunction): Promise<void> {
    const queueItemId = req.params['id'] ?? '';
    const decisionLabel = String(req.body?.decision_label ?? '');
    const resolutionNote = String(req.body?.resolution_note ?? '');
    try {
      await contactRequestService.resolve({
        queueItemId,
        adminMemberId: req.user!.userId,
        decisionLabel: decisionLabel as never,
        resolutionNote,
      });
      writeFlash(res, req, FLASH_KIND.WORK_QUEUE_RESOLVED, queueItemId);
      res.redirect(303, '/admin/work-queue');
    } catch (err) {
      if (err instanceof ValidationError) {
        const vm = buildVm({ errorMessage: err.message });
        res.status(422).render('admin/work-queue/index', vm);
        return;
      }
      if (err instanceof NotFoundError) {
        const vm = buildVm({ errorMessage: 'That queue item is no longer open.' });
        res.status(404).render('admin/work-queue/index', vm);
        return;
      }
      handleControllerError(err, res, next, 'admin work queue controller');
    }
  },

  // Helper so unrelated category labels stay defined even before items use them.
  _categoryLabels(): Record<string, string> {
    return { ...CATEGORY_LABEL };
  },
  _taskTypeLabels(): Record<string, string> {
    return { ...TASK_TYPE_LABEL };
  },
  _contactCategoryLabel(c: ContactCategory): string {
    return CONTACT_CATEGORY_LABELS[c];
  },
};
