/**
 * MediaModerationService -- member reports against media, and the administrator's
 * takedown decision on them.
 *
 * Owns:
 *   - Member and administrator flagging of a media item (`media_flags`)
 *   - The takedown queue page-model an administrator decides from
 *   - The two decisions, Delete and No Action, and the clearing of a single flag
 *   - `media_items.moderation_status`, which nothing else in the application writes
 *
 * Does not own:
 *   - Upload, edit and owner-initiated delete of media (CuratorMediaService)
 *   - Public gallery and item page shaping (MediaService), except the flag block
 *     that surface renders, which this service supplies
 *   - The generic work-queue card and its resolution (AdminWorkQueueService); the
 *     queue row raised here is a pointer closed by the decision below
 *
 * Required patterns:
 *   - A report names one reason from the closed `reason_code` set, each value a
 *     clause of the published terms of use. The reporter's own words are optional
 *     except on `other`, capped, and stored only in `media_flags.reason_text`.
 *   - One report per (media, reporter) pair: a repeat from the same member is a
 *     no-op, never a second count, which is what the unique index makes certain.
 *   - Flagging never changes visibility. Only an administrator's Delete decision
 *     does, so nothing here shadow-bans by degrees.
 *   - Delete hides the row first, then removes the stored objects, because hiding
 *     is what every public read honours and the objects are what the storage origin
 *     still serves. A failed object removal leaves the item hidden and is reported
 *     to the administrator, and deciding the same item again retries it.
 *   - A failed object removal also raises its own work-queue card, one per item,
 *     because a banner and a log line are gone the moment the administrator closes
 *     the tab while the bytes stay served. The card closes on the first removal
 *     that succeeds, whether from the dedicated retry or from a later decision.
 *   - The first open report on an item raises one work-queue twin; later reports on
 *     an item that already has an open twin raise none. The decision closes it in
 *     the same transaction, so a settled item cannot leave a card behind.
 *   - Rate limiting per reporter comes from `media_flag_rate_limit_per_hour`.
 *   - Tier 1 benefits are required to report, checked here as well as at the route.
 *
 * Invariants preserved:
 *   - The audit ledger and the work-queue row carry no member free text: the
 *     reporter's words stay in `media_flags.reason_text`, which account erasure
 *     clears, and the ledger records the reason code and the platform's own wording.
 *   - Flagging patterns are counted from the reports themselves; nothing
 *     IP-derived is stored, read or displayed.
 *   - A decision another administrator already took reports as settled rather than
 *     overwriting their reason.
 *
 * Transaction discipline:
 *   Each decision writes the media row, its open flags, the queue twin and the
 *   audit row in one transaction. Object-storage removal happens after it commits;
 *   the uploader's mail is enqueued after it commits too, so a rolled-back decision
 *   cannot announce itself.
 *
 * Persistence:
 *   media_flags, media_items, work_queue_items, audit_entries, members.
 *
 * Side effects:
 *   - audit_entries append: `media.flagged`, `media.deleted`, `media.flag_resolved`,
 *     `media.flag_cleared`
 *   - work-queue insert of `media_flag_review`, and its close on a decision
 *   - work-queue insert of `media_takedown_storage_removal` on a failed object
 *     removal, and its close on a removal that succeeds
 *   - outbox enqueue of the uploader's decision mail
 *   - object-storage delete on a Delete decision
 *
 * Service shape: factory `createMediaModerationService(deps)`, which takes the
 * media storage adapter so tests can inject a fake.
 */
import { randomUUID } from 'crypto';
import { media, mediaFlags, transaction, workQueue } from '../db/db';
import { logger } from '../config/logger';
import { MediaStorageAdapter, getMediaStorageAdapter } from '../adapters/mediaStorageAdapter';
import { ForbiddenError, NotFoundError, RateLimitedError, ValidationError } from './serviceErrors';
import { hit as rateLimitHit } from './rateLimitService';
import { readIntConfig } from './configReader';
import { hasTier1Benefits } from './tierPredicates';
import { appendAuditEntry } from './auditService';
import { runSqliteRead } from './sqliteRetry';
import { emailService } from './emailService';
import { workQueueService } from './workQueueService';
import type { PageViewModel } from '../types/page';

/** Which published conduct rule the reporter says the item breaks. */
export type FlagReasonCode =
  | 'illegal_or_harassing'
  | 'infringes_rights'
  | 'impersonation'
  | 'false_information'
  | 'spam'
  | 'other';

/**
 * The reasons a reporter picks from. Each is a clause of the terms of use the
 * site publishes, so a decision is defensible against a rule the member could
 * read before they reported.
 */
export const FLAG_REASONS: readonly { value: FlagReasonCode; label: string }[] = [
  { value: 'illegal_or_harassing', label: 'Illegal, harassing, or defamatory' },
  { value: 'infringes_rights',     label: 'Infringes copyright or another right' },
  { value: 'impersonation',        label: 'Impersonation or misrepresented identity' },
  { value: 'false_information',    label: 'False or manipulated competitive or historical information' },
  { value: 'spam',                 label: 'Spam or unsolicited promotion' },
  { value: 'other',                label: 'Something else' },
];

const REASON_LABELS: Record<FlagReasonCode, string> =
  Object.fromEntries(FLAG_REASONS.map((r) => [r.value, r.label])) as Record<FlagReasonCode, string>;

export const FLAG_DETAIL_MAX_LEN = 500;
export const DECISION_REASON_MAX_LEN = 500;

/** How far back a reporter's other reports are counted for the pattern line. */
const PATTERN_WINDOW_DAYS = 30;

/** The task type whose card points at this surface. */
const TASK_TYPE = 'media_flag_review';

/** The card raised when a takedown's stored files outlive the decision. */
const STORAGE_TASK_TYPE = 'media_takedown_storage_removal';

export type FlagResult =
  | { status: 'recorded'; flagId: string }
  | { status: 'already_flagged' };

export type DecisionResult =
  | { status: 'decided'; storageRemoved: boolean; uploaderNotified: boolean }
  // The item was hidden before this decision arrived: another administrator got
  // there first, or this is a retry of a removal whose objects survived.
  | { status: 'already_hidden'; storageRemoved: boolean }
  | { status: 'already_settled' };

export type ClearFlagResult =
  | { status: 'cleared' }
  | { status: 'already_settled' };

export type RetryRemovalResult =
  | { status: 'removed' }
  | { status: 'still_failing' }
  // The item is visible, so there is no takedown whose files could be owed.
  | { status: 'not_applicable' };

export interface FlaggedReportViewModel {
  flagId: string;
  reasonLabel: string;
  detail: string | null;
  reportedAtIso: string;
  reportedAtDisplay: string;
  reporterDisplay: string;
  reporterHref: string;
  patternNote: string | null;
  clearHref: string;
}

export interface FlaggedMediaViewModel {
  mediaId: string;
  caption: string | null;
  thumbHref: string | null;
  mediaHref: string;
  uploaderDisplay: string;
  uploaderHref: string;
  isHidden: boolean;
  statusLabel: string;
  flagCountLabel: string;
  reports: FlaggedReportViewModel[];
  deleteHref: string;
  noActionHref: string;
}

/** A hidden item whose stored files are still there. */
export interface PendingRemovalViewModel {
  mediaId: string;
  caption: string | null;
  uploaderDisplay: string;
  uploaderHref: string;
  removedAtDisplay: string;
  decisionReason: string | null;
  retryHref: string;
}

export interface AdminMediaFlagsContent {
  items: FlaggedMediaViewModel[];
  hasItems: boolean;
  emptyMessage: string;
  reasonMaxLength: number;
  pendingRemoval: PendingRemovalViewModel[];
  hasPendingRemoval: boolean;
  pendingRemovalNote: string;
}

interface ModerationRow {
  id: string;
  uploader_member_id: string;
  media_type: string;
  caption: string | null;
  s3_key_thumb: string | null;
  s3_key_display: string | null;
  video_platform: string | null;
  video_url: string | null;
  thumbnail_url: string | null;
  is_avatar: number;
  moderation_status: string;
  moderation_reason: string | null;
  uploader_display_name: string;
  uploader_slug: string;
  uploader_login_email: string;
  uploader_is_system: number;
}

interface AwaitingRemovalRow {
  id: string;
  caption: string | null;
  moderation_reason: string | null;
  removed_at: string;
  queue_item_id: string;
  opened_at: string;
  uploader_display_name: string;
  uploader_slug: string;
}

interface OpenFlagRow {
  id: string;
  media_id: string;
  reason_code: FlagReasonCode;
  reason_text: string | null;
  reported_at: string;
  reporter_member_id: string;
  reporter_display_name: string;
  reporter_slug: string;
  media_type: string;
  caption: string | null;
  s3_key_thumb: string | null;
  thumbnail_url: string | null;
  moderation_status: string;
  uploader_display_name: string;
  uploader_slug: string;
}

function isFlagReasonCode(value: unknown): value is FlagReasonCode {
  return typeof value === 'string' && FLAG_REASONS.some((r) => r.value === value);
}

/** The detail a reporter may add: optional, capped, and required on 'other'. */
function validateDetail(raw: unknown, reasonCode: FlagReasonCode): string | null {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length === 0) {
    if (reasonCode === 'other') {
      throw new ValidationError('Tell us what is wrong with this item.', {
        reasonText: 'Tell us what is wrong with this item.',
      });
    }
    return null;
  }
  if (text.length > FLAG_DETAIL_MAX_LEN) {
    throw new ValidationError(`Keep the description under ${FLAG_DETAIL_MAX_LEN} characters.`, {
      reasonText: `Keep the description under ${FLAG_DETAIL_MAX_LEN} characters.`,
    });
  }
  return text;
}

/** An administrator's reason, required on every decision and on a flag they clear. */
function validateDecisionReason(raw: unknown): string {
  const text = typeof raw === 'string' ? raw.trim() : '';
  if (text.length === 0) {
    throw new ValidationError('A reason is required.', { reason: 'A reason is required.' });
  }
  if (text.length > DECISION_REASON_MAX_LEN) {
    throw new ValidationError(`Keep the reason under ${DECISION_REASON_MAX_LEN} characters.`, {
      reason: `Keep the reason under ${DECISION_REASON_MAX_LEN} characters.`,
    });
  }
  return text;
}

function loadItemForModeration(mediaId: string): ModerationRow {
  const row = runSqliteRead('getMediaItemForModeration', () =>
    media.getMediaItemForModeration.get(mediaId),
  ) as ModerationRow | undefined;
  // An avatar is not gallery content and no public media surface renders one, so
  // it is not reportable and not decidable here.
  if (!row || row.is_avatar === 1) {
    throw new NotFoundError(`Media item not found: ${mediaId}`);
  }
  return row;
}

/** The reporting control the public item page renders, or nothing. */
export interface MediaFlagBlockViewModel {
  actionHref: string;
  reasons: readonly { value: FlagReasonCode; label: string }[];
  detailMaxLength: number;
  alreadyFlagged: boolean;
  alreadyFlaggedMessage: string;
}

/**
 * Whether this viewer may report this item, and the control if they may.
 *
 * Nothing renders for a visitor who is not signed in, for a member without Tier
 * 1 benefits, or on a member's own item, which they can simply delete. The
 * flagging story states the benefit gate and, unlike its sibling media stories,
 * asks for no benefit text in the control's place, so none is shown.
 */
export function buildMediaFlagBlock(input: {
  mediaId: string;
  viewerMemberId: string | null;
  isOwnItem: boolean;
}): MediaFlagBlockViewModel | null {
  if (!input.viewerMemberId || input.isOwnItem) return null;
  if (!hasTier1Benefits(input.viewerMemberId)) return null;

  const existing = runSqliteRead('findFlagByMediaAndReporter', () =>
    mediaFlags.findFlagByMediaAndReporter.get(input.mediaId, input.viewerMemberId),
  ) as { id: string } | undefined;

  return {
    actionHref: `/media/item/${input.mediaId}/flag`,
    reasons: FLAG_REASONS,
    detailMaxLength: FLAG_DETAIL_MAX_LEN,
    alreadyFlagged: existing != null,
    alreadyFlaggedMessage: 'You reported this item. An administrator will review it.',
  };
}

export interface MediaModerationServiceDeps {
  storage: MediaStorageAdapter;
}

export function createMediaModerationService(deps: MediaModerationServiceDeps) {
  const { storage } = deps;

  function thumbHrefFor(row: { s3_key_thumb: string | null; thumbnail_url: string | null }): string | null {
    if (row.s3_key_thumb) return storage.constructURL(row.s3_key_thumb);
    return row.thumbnail_url;
  }

  /** The storage objects a takedown removes. A URL reference hosts no bytes. */
  function storageKeysFor(row: ModerationRow): string[] {
    const keys: string[] = [];
    if (row.s3_key_thumb) keys.push(row.s3_key_thumb);
    if (row.s3_key_display) keys.push(row.s3_key_display);
    return keys;
  }

  /**
   * Remove the item's stored objects and leave the queue telling the truth
   * about the result: a failure raises one card for the item, a success closes
   * whichever card an earlier failure left open. Deduplicated per item, so a
   * retry that fails again does not stack a second card.
   */
  async function removeStoredObjectsAndRecord(row: ModerationRow, actorId: string): Promise<boolean> {
    const allRemoved = await removeStoredObjects(row);
    const nowIso = new Date().toISOString();

    if (allRemoved) {
      workQueue.resolveOpenByEntity.run(
        nowIso, actorId, 'removed', 'Stored files removed.',
        nowIso, actorId,
        STORAGE_TASK_TYPE, 'media_item', row.id,
      );
      return true;
    }

    transaction(() => {
      const open = workQueue.findOpenByEntity.get(
        STORAGE_TASK_TYPE, 'media_item', row.id,
      ) as { id: string } | undefined;
      if (open) return;
      workQueueService.enqueue({
        actorId,
        queueCategory: 'media',
        taskType:      STORAGE_TASK_TYPE,
        entityType:    'media_item',
        entityId:      row.id,
        priority:      0,
        reasonText:    'This item is hidden, but its stored files were not removed and are still served to anyone holding their address.',
        detailText:    null,
      });
    });
    return false;
  }

  async function removeStoredObjects(row: ModerationRow): Promise<boolean> {
    let allRemoved = true;
    for (const key of storageKeysFor(row)) {
      try {
        await storage.delete(key);
      } catch (err) {
        allRemoved = false;
        // Warn rather than error: the item is already hidden from every read, the
        // administrator is told in the same response, and deciding the item again
        // retries the removal.
        logger.warn('mediaModerationService: storage delete failed on takedown', {
          mediaId: row.id,
          key,
          error: (err as Error).message,
        });
      }
    }
    return allRemoved;
  }

  /** The uploader is told what was decided. The system member is not a person. */
  function notifyUploader(row: ModerationRow, displayDecision: string, reason: string, key: string): boolean {
    if (row.uploader_is_system === 1) return false;
    const sent = emailService.send({
      template: 'media_moderation_decision',
      params: {
        memberName: row.uploader_display_name,
        displayDecision,
        note: reason,
      },
      recipientEmail:    row.uploader_login_email,
      recipientMemberId: row.uploader_member_id,
      idempotencyKey:    key,
      strict: true,
    });
    return sent.status !== 'suppressed';
  }

  function recordFlag(input: {
    mediaId: string;
    actorMemberId: string;
    actorIsAdmin: boolean;
    reasonCode: unknown;
    reasonText: unknown;
  }): FlagResult {
    if (!isFlagReasonCode(input.reasonCode)) {
      throw new ValidationError('Choose a reason.', { reasonCode: 'Choose a reason.' });
    }
    const reasonCode = input.reasonCode;
    const detail = validateDetail(input.reasonText, reasonCode);

    if (!input.actorIsAdmin) {
      if (!hasTier1Benefits(input.actorMemberId)) {
        throw new ForbiddenError('Reporting media is a Tier 1 benefit.');
      }
      const max = readIntConfig('media_flag_rate_limit_per_hour', 10);
      const rl = rateLimitHit(`media-flag:${input.actorMemberId}`, max, 60);
      if (!rl.allowed) {
        throw new RateLimitedError(
          `Too many reports. Try again in ${rl.retryAfterSeconds} seconds.`,
          rl.retryAfterSeconds,
        );
      }
    }

    const row = loadItemForModeration(input.mediaId);

    // One report per reporter per item, open or already resolved: the unique
    // index says so, and the story says a repeat is not a second count.
    const existing = runSqliteRead('findFlagByMediaAndReporter', () =>
      mediaFlags.findFlagByMediaAndReporter.get(input.mediaId, input.actorMemberId),
    ) as { id: string } | undefined;
    if (existing) return { status: 'already_flagged' };

    const flagId = `mediaflag_${randomUUID().replace(/-/g, '').slice(0, 24)}`;
    const nowIso = new Date().toISOString();
    const actorToken = input.actorIsAdmin ? 'admin-act-as' : 'member-self';

    transaction(() => {
      mediaFlags.insertFlag.run(
        flagId, nowIso, actorToken, nowIso, actorToken,
        input.mediaId, input.actorMemberId, reasonCode, detail, nowIso,
      );

      // One card per item, not per report: the decision is taken on the item, so
      // a second card would be a second thing to close for work already queued.
      const openTwin = workQueue.findOpenByEntity.get(
        TASK_TYPE, 'media_item', input.mediaId,
      ) as { id: string } | undefined;
      if (!openTwin) {
        workQueueService.enqueue({
          actorId:       input.actorMemberId,
          queueCategory: 'media',
          taskType:      TASK_TYPE,
          entityType:    'media_item',
          entityId:      input.mediaId,
          priority:      0,
          // Platform wording only. What the reporter wrote stays on the report.
          reasonText:    'A member reported this media item for review.',
          detailText:    null,
        });
      }

      appendAuditEntry({
        actionType: 'media.flagged',
        category:   'media',
        actorType:  input.actorIsAdmin ? 'admin' : 'member',
        actorMemberId: input.actorMemberId,
        entityType: 'media_item',
        entityId:   input.mediaId,
        reasonText: `Reported as: ${REASON_LABELS[reasonCode]}`,
        metadata:   { flagId, reasonCode, mediaType: row.media_type },
      });
    });

    return { status: 'recorded', flagId };
  }

  function settleFlagsAndQueue(input: {
    row: ModerationRow;
    adminMemberId: string;
    reason: string;
    resolutionLabel: 'deleted' | 'no_action';
    nowIso: string;
    hide: boolean;
  }): boolean {
    let settled = false;
    transaction(() => {
      if (input.hide) {
        // The decisive write, guarded on the item still being visible, so a
        // second decision can never write over the first. Within one process
        // the caller's own status check settles that, because nothing awaits
        // between its read and this transaction; the condition here is what
        // holds if a second process is ever serving the same database.
        const res = media.setMediaItemRemovedByAdmin.run(
          input.reason, input.nowIso, input.adminMemberId, input.row.id,
        );
        if (res.changes === 0) return;
      }

      const flagRes = mediaFlags.resolveOpenFlagsForMedia.run(
        input.nowIso, input.adminMemberId, input.resolutionLabel, input.reason,
        input.nowIso, input.adminMemberId, input.row.id,
      );
      // For No Action the flags are the decisive write: closing reports that
      // another administrator already closed settles nothing.
      if (!input.hide && flagRes.changes === 0) return;

      workQueue.resolveOpenByEntity.run(
        input.nowIso, input.adminMemberId, input.resolutionLabel, input.reason,
        input.nowIso, input.adminMemberId,
        TASK_TYPE, 'media_item', input.row.id,
      );

      appendAuditEntry({
        actionType: input.resolutionLabel === 'deleted' ? 'media.deleted' : 'media.flag_resolved',
        category:   'media',
        actorType:  'admin',
        actorMemberId: input.adminMemberId,
        entityType: 'media_item',
        entityId:   input.row.id,
        reasonText: input.reason,
        metadata:   {
          mediaType:      input.row.media_type,
          uploaderMemberId: input.row.uploader_member_id,
          flagsResolved:  flagRes.changes,
        },
      });
      settled = true;
    });
    return settled;
  }

  return {
    /** A member reports an item. Visibility is untouched either way. */
    flagMediaItem(input: {
      mediaId: string;
      reporterMemberId: string;
      reasonCode: unknown;
      reasonText: unknown;
    }): FlagResult {
      return recordFlag({
        mediaId:       input.mediaId,
        actorMemberId: input.reporterMemberId,
        actorIsAdmin:  false,
        reasonCode:    input.reasonCode,
        reasonText:    input.reasonText,
      });
    },

    /** An administrator raises a report themselves, to keep the queue consistent. */
    setFlagAsAdmin(input: {
      mediaId: string;
      adminMemberId: string;
      reasonCode: unknown;
      reasonText: unknown;
    }): FlagResult {
      return recordFlag({
        mediaId:       input.mediaId,
        actorMemberId: input.adminMemberId,
        actorIsAdmin:  true,
        reasonCode:    input.reasonCode,
        reasonText:    input.reasonText,
      });
    },

    /** An administrator withdraws one report without deciding the item. */
    clearFlag(input: { flagId: string; adminMemberId: string; reason: unknown }): ClearFlagResult {
      const reason = validateDecisionReason(input.reason);
      const flag = runSqliteRead('findFlagById', () =>
        mediaFlags.findFlagById.get(input.flagId),
      ) as { id: string; media_id: string; status: string } | undefined;
      if (!flag) throw new NotFoundError(`Media flag not found: ${input.flagId}`);

      const nowIso = new Date().toISOString();
      let cleared = false;
      transaction(() => {
        const res = mediaFlags.resolveFlagById.run(
          nowIso, input.adminMemberId, 'cleared', reason,
          nowIso, input.adminMemberId, input.flagId,
        );
        if (res.changes === 0) return;

        // The card exists per item, so it closes only when the last open report
        // on that item goes. Otherwise the queue would lose an item still
        // carrying live reports.
        const remaining = mediaFlags.countOpenFlagsForMedia.get(flag.media_id) as { n: number };
        if (remaining.n === 0) {
          workQueue.resolveOpenByEntity.run(
            nowIso, input.adminMemberId, 'cleared', reason,
            nowIso, input.adminMemberId,
            TASK_TYPE, 'media_item', flag.media_id,
          );
        }

        appendAuditEntry({
          actionType: 'media.flag_cleared',
          category:   'media',
          actorType:  'admin',
          actorMemberId: input.adminMemberId,
          entityType: 'media_item',
          entityId:   flag.media_id,
          reasonText: reason,
          metadata:   { flagId: input.flagId },
        });
        cleared = true;
      });

      return cleared ? { status: 'cleared' } : { status: 'already_settled' };
    },

    /** Delete: the item is hidden, then its stored objects are removed. */
    async decideDelete(input: {
      mediaId: string;
      adminMemberId: string;
      reason: unknown;
    }): Promise<DecisionResult> {
      const reason = validateDecisionReason(input.reason);
      const row = loadItemForModeration(input.mediaId);

      // Already hidden, so this is the retry path for an object removal that
      // failed earlier. Nothing is decided twice: no second audit row, no second
      // mail to the uploader, just another attempt at the bytes.
      if (row.moderation_status !== 'active') {
        const retried = await removeStoredObjectsAndRecord(row, input.adminMemberId);
        return { status: 'already_hidden', storageRemoved: retried };
      }

      const settled = settleFlagsAndQueue({
        row, adminMemberId: input.adminMemberId, reason,
        resolutionLabel: 'deleted', nowIso: new Date().toISOString(), hide: true,
      });
      if (!settled) return { status: 'already_settled' };

      const storageRemoved = await removeStoredObjectsAndRecord(row, input.adminMemberId);
      const uploaderNotified = notifyUploader(
        row, 'Removed', reason, `media-moderation:${input.mediaId}:deleted`,
      );

      return { status: 'decided', storageRemoved, uploaderNotified };
    },

    /** No Action: the reports are closed and the item stays exactly as it is. */
    decideNoAction(input: {
      mediaId: string;
      adminMemberId: string;
      reason: unknown;
    }): DecisionResult {
      const reason = validateDecisionReason(input.reason);
      const row = loadItemForModeration(input.mediaId);
      const nowIso = new Date().toISOString();

      const settled = settleFlagsAndQueue({
        row, adminMemberId: input.adminMemberId, reason,
        resolutionLabel: 'no_action', nowIso, hide: false,
      });
      if (!settled) return { status: 'already_settled' };

      const uploaderNotified = notifyUploader(
        row, 'No action taken', reason, `media-moderation:${input.mediaId}:no_action`,
      );
      return { status: 'decided', storageRemoved: true, uploaderNotified };
    },

    /**
     * Try again to remove a hidden item's stored files. Its own act rather than
     * a repeat of the decision: the decision needs a reason and a retry has
     * nothing new to say, so asking for one again would be typing that nothing
     * records.
     */
    async retryStorageRemoval(input: { mediaId: string; adminMemberId: string }): Promise<RetryRemovalResult> {
      const row = loadItemForModeration(input.mediaId);
      if (row.moderation_status === 'active') return { status: 'not_applicable' };

      const removed = await removeStoredObjectsAndRecord(row, input.adminMemberId);
      return { status: removed ? 'removed' : 'still_failing' };
    },

    /** The takedown queue an administrator reads and decides from. */
    getAdminMediaFlagsPage(opts?: { errorMessage?: string; noticeMessage?: string }): PageViewModel<AdminMediaFlagsContent> {
      const rows = runSqliteRead('listOpenFlagsWithMedia', () =>
        mediaFlags.listOpenFlagsWithMedia.all(),
      ) as OpenFlagRow[];

      const windowStart = new Date(Date.now() - PATTERN_WINDOW_DAYS * 86_400_000).toISOString();
      const reporterCounts = new Map<string, number>();
      for (const r of rows) {
        if (reporterCounts.has(r.reporter_member_id)) continue;
        const c = runSqliteRead('countFlagsByReporterSince', () =>
          mediaFlags.countFlagsByReporterSince.get(r.reporter_member_id, windowStart),
        ) as { n: number };
        reporterCounts.set(r.reporter_member_id, c.n);
      }

      const byMedia = new Map<string, FlaggedMediaViewModel>();
      for (const r of rows) {
        let item = byMedia.get(r.media_id);
        if (!item) {
          item = {
            mediaId:   r.media_id,
            caption:   r.caption,
            thumbHref: thumbHrefFor(r),
            mediaHref: `/media/item/${r.media_id}`,
            uploaderDisplay: r.uploader_display_name,
            uploaderHref:    `/members/${r.uploader_slug}`,
            isHidden:    r.moderation_status !== 'active',
            statusLabel: r.moderation_status === 'active' ? 'Visible' : 'Hidden',
            flagCountLabel: '',
            reports: [],
            deleteHref:   `/admin/media-flags/${r.media_id}/delete`,
            noActionHref: `/admin/media-flags/${r.media_id}/no-action`,
          };
          byMedia.set(r.media_id, item);
        }
        const recent = reporterCounts.get(r.reporter_member_id) ?? 1;
        item.reports.push({
          flagId:      r.id,
          reasonLabel: REASON_LABELS[r.reason_code] ?? r.reason_code,
          detail:      r.reason_text,
          reportedAtIso:     r.reported_at,
          reportedAtDisplay: r.reported_at.slice(0, 10),
          reporterDisplay: r.reporter_display_name,
          reporterHref:    `/members/${r.reporter_slug}`,
          patternNote: recent > 1
            ? `${recent} reports from this member in the last ${PATTERN_WINDOW_DAYS} days`
            : null,
          clearHref: `/admin/media-flags/flags/${r.id}/clear`,
        });
      }

      const items = [...byMedia.values()];
      for (const item of items) {
        item.flagCountLabel = item.reports.length === 1
          ? '1 open report'
          : `${item.reports.length} open reports`;
      }

      const awaiting = runSqliteRead('listMediaAwaitingStorageRemoval', () =>
        mediaFlags.listMediaAwaitingStorageRemoval.all(),
      ) as AwaitingRemovalRow[];
      const pendingRemoval: PendingRemovalViewModel[] = awaiting.map((r) => ({
        mediaId:         r.id,
        caption:         r.caption,
        uploaderDisplay: r.uploader_display_name,
        uploaderHref:    `/members/${r.uploader_slug}`,
        removedAtDisplay: r.removed_at.slice(0, 10),
        decisionReason:  r.moderation_reason,
        retryHref:       `/admin/media-flags/${r.id}/retry-removal`,
      }));

      return {
        seo:  { title: 'Flagged Media', noindex: true },
        page: {
          sectionKey: 'admin',
          pageKey:    'admin-media-flags',
          title:      'Flagged Media',
          intro:      'Media members have reported. Decide each item by removing it or closing the reports with no action.',
          ...(opts?.errorMessage ? { notice: opts.errorMessage } : {}),
          ...(opts?.noticeMessage && !opts?.errorMessage ? { notice: opts.noticeMessage } : {}),
        },
        navigation: { contextLinks: [{ label: 'Back to Admin', href: '/admin' }] },
        content: {
          items,
          hasItems: items.length > 0,
          emptyMessage: 'No media is awaiting review.',
          reasonMaxLength: DECISION_REASON_MAX_LEN,
          pendingRemoval,
          hasPendingRemoval: pendingRemoval.length > 0,
          pendingRemovalNote: 'These items are hidden, but their stored files were not removed and are still served to anyone who has their address. Retrying removes them.',
        },
      };
    },
  };
}

// Default instance for controllers. Tests that need a fake storage adapter build
// the service through `createMediaModerationService(deps)` instead.
export function getDefaultMediaModerationService(): ReturnType<typeof createMediaModerationService> {
  return createMediaModerationService({ storage: getMediaStorageAdapter() });
}
