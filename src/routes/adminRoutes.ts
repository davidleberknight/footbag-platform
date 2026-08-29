import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { adminCuratorController } from '../controllers/adminCuratorController';
import { adminWorkQueueController } from '../controllers/adminWorkQueueController';
import { adminClubCleanupController } from '../controllers/adminClubCleanupController';
import { adminBootstrapController } from '../controllers/adminBootstrapController';
import { adminClubLeadershipController } from '../controllers/adminClubLeadershipController';
import { adminAdminRolesController } from '../controllers/adminAdminRolesController';
import { adminHonorGrantsController } from '../controllers/adminHonorGrantsController';
import { adminMemberController } from '../controllers/adminMemberController';
import { adminHistoricalRecordController } from '../controllers/adminHistoricalRecordController';
import { adminLegacyAccountController } from '../controllers/adminLegacyAccountController';
import { adminAuditLogController } from '../controllers/adminAuditLogController';
import { adminEmailLogController } from '../controllers/adminEmailLogController';
import { adminSystemHealthController } from '../controllers/adminSystemHealthController';
import { adminAlarmsController } from '../controllers/adminAlarmsController';
import { adminPaymentsController } from '../controllers/adminPaymentsController';
import { adminEmailTemplateController } from '../controllers/adminEmailTemplateController';
import { adminMailingListController } from '../controllers/adminMailingListController';
import { adminBroadcastController } from '../controllers/adminBroadcastController';
import { adminFreestyleController } from '../controllers/adminFreestyleController';
import { emergingVocabController } from '../controllers/emergingVocabController';
import { requireMember } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';

export const adminRouter = Router();

// The single-shot first-admin bootstrap claim sits ABOVE the admin gate:
// the claimant is by definition not yet an admin, only a signed-in member.
// Membership (onboarding complete) is still required — admin authority sits
// above member authority, never beside it, so even the bootstrap claimant and
// a dev-allowlisted admin finish the wizard before any admin surface opens.
adminRouter.get('/bootstrap-claim',  requireMember, adminBootstrapController.getClaim);
adminRouter.post('/bootstrap-claim', requireMember, adminBootstrapController.postClaim);

adminRouter.use(requireMember, requireAdmin);

adminRouter.get('/', adminController.index);
adminRouter.get('/admin-roles',               adminAdminRolesController.index);
adminRouter.post('/admin-roles/grant',                    adminAdminRolesController.grant);
adminRouter.post('/admin-roles/grant/confirm',            adminAdminRolesController.grantConfirm);
adminRouter.post('/admin-roles/:memberId/revoke',         adminAdminRolesController.revoke);
adminRouter.post('/admin-roles/:memberId/revoke/confirm', adminAdminRolesController.revokeConfirm);
// Post-go-live HoF/BAP honor tier grants: an honoree resolved after claiming, or
// a new inductee, gets Tier 2 from the honor here (claim-time grants never re-fire).
adminRouter.get('/honor-grants',               adminHonorGrantsController.index);
adminRouter.post('/honor-grants/grant',         adminHonorGrantsController.grant);
adminRouter.post('/honor-grants/grant/confirm', adminHonorGrantsController.grantConfirm);
// Correcting a grant made in error, and the board standing that turns over with
// each board. As elsewhere, the longer confirm paths precede their siblings.
adminRouter.post('/honor-grants/remove/confirm',       adminHonorGrantsController.removeConfirm);
adminRouter.post('/honor-grants/remove',               adminHonorGrantsController.remove);
adminRouter.post('/honor-grants/board/set/confirm',    adminHonorGrantsController.boardConfirm(true));
adminRouter.post('/honor-grants/board/set',            adminHonorGrantsController.board(true));
adminRouter.post('/honor-grants/board/remove/confirm', adminHonorGrantsController.boardConfirm(false));
adminRouter.post('/honor-grants/board/remove',         adminHonorGrantsController.board(false));
// Member management: the lookup, the per-member record, and every correction
// reached from it. Each correction previews first and writes only on confirm.
adminRouter.get('/members',                                adminMemberController.index);
adminRouter.get('/members/:memberId',                      adminMemberController.record);
adminRouter.post('/members/:memberId/name',                adminMemberController.previewName);
adminRouter.post('/members/:memberId/name/confirm',        adminMemberController.confirmName);
adminRouter.post('/members/:memberId/slug',                adminMemberController.previewSlug);
adminRouter.post('/members/:memberId/slug/confirm',        adminMemberController.confirmSlug);
adminRouter.post('/members/:memberId/tier',                adminMemberController.previewTier);
adminRouter.post('/members/:memberId/tier/confirm',        adminMemberController.confirmTier);
adminRouter.post('/members/:memberId/active-player',         adminMemberController.previewActivePlayer);
adminRouter.post('/members/:memberId/active-player/confirm', adminMemberController.confirmActivePlayer);
// Order matters: the two `/revert` paths must precede their shorter siblings,
// or `/deceased/confirm` would swallow `/deceased/revert/confirm`. Each handler
// is told here whether it is the marking or its reversal, rather than reading
// that back off the request path.
adminRouter.post('/members/:memberId/deceased/revert/confirm', adminMemberController.confirmDeceased(true));
adminRouter.post('/members/:memberId/deceased/revert',         adminMemberController.previewDeceased(true));
adminRouter.post('/members/:memberId/deceased/confirm',        adminMemberController.confirmDeceased(false));
adminRouter.post('/members/:memberId/deceased',                adminMemberController.previewDeceased(false));
// The same affordance for a competition record nobody has claimed. Same
// ordering rule: `/revert` before its shorter sibling.
// The old sign-ins nobody has claimed. Read-only: this is where the account id
// a link-help approval asks for actually comes from.
adminRouter.get('/legacy-accounts',                                   adminLegacyAccountController.index);
adminRouter.get('/historical-records',                                adminHistoricalRecordController.index);
adminRouter.post('/historical-records/:personId/deceased/revert/confirm', adminHistoricalRecordController.confirm(false));
adminRouter.post('/historical-records/:personId/deceased/revert',         adminHistoricalRecordController.preview(false));
adminRouter.post('/historical-records/:personId/deceased/confirm',        adminHistoricalRecordController.confirm(true));
adminRouter.post('/historical-records/:personId/deceased',                adminHistoricalRecordController.preview(true));
adminRouter.get('/work-queue',                adminWorkQueueController.index);
adminRouter.post('/work-queue/:id/claim',     adminWorkQueueController.claim);
adminRouter.post('/work-queue/:id/resolve',   adminWorkQueueController.resolve);
adminRouter.post('/work-queue/:id/dismiss',   adminWorkQueueController.dismiss);
adminRouter.post('/work-queue/:id/park',      adminWorkQueueController.park);
adminRouter.post('/work-queue/:id/unpark',    adminWorkQueueController.unpark);
adminRouter.post('/work-queue/:id/ask-member', adminWorkQueueController.askMember);
// The longer confirm path precedes its sibling, as elsewhere: the approval
// previews first and writes only on confirm.
adminRouter.post('/work-queue/:id/link-help/approve/confirm', adminWorkQueueController.linkHelpApprove);
adminRouter.post('/work-queue/:id/link-help/approve', adminWorkQueueController.linkHelpApprovePreview);
adminRouter.post('/work-queue/:id/link-help/reject',  adminWorkQueueController.linkHelpReject);
adminRouter.post('/work-queue/:id/link-help/dispute-revert', adminWorkQueueController.linkHelpDisputeRevert);
// Inbound payments, the retained nightly reports, and the reconciliation queue.
// Order matters: the literal `health`, `reports` and `reconciliation` paths must
// precede `/payments/:paymentId`, or a payment id of "reconciliation" would be
// looked up instead of the queue being rendered.
adminRouter.get('/payments',                          adminPaymentsController.index);
adminRouter.get('/payments/health',                   adminPaymentsController.health);
adminRouter.get('/payments/reports',                  adminPaymentsController.reports);
adminRouter.get('/payments/reports/:runId',           adminPaymentsController.report);
adminRouter.get('/payments/reconciliation',           adminPaymentsController.reconciliation);
adminRouter.post('/payments/reconciliation/:issueId/resolve', adminPaymentsController.resolve);
adminRouter.get('/payments/:paymentId',               adminPaymentsController.detail);
adminRouter.get('/audit-log',                 adminAuditLogController.index);
adminRouter.get('/audit-log/summary',         adminAuditLogController.summary);
adminRouter.get('/audit-log/export',          adminAuditLogController.exportLog);
adminRouter.get('/email-log',                 adminEmailLogController.index);
adminRouter.get('/system-health',             adminSystemHealthController.index);
adminRouter.get('/alarms',                    adminAlarmsController.index);
adminRouter.post('/alarms/:id/acknowledge',   adminAlarmsController.acknowledge);
// Email-template editor: edit wording, enabled flag, and classification of the
// registered outbound templates. Edit-only; template existence is code.
// Mailing-list administration. Order matters: the literal `new` path must
// precede `/mailing-lists/:slug`, or a list slug of "new" would be looked up
// instead of the create form being rendered.
adminRouter.get('/mailing-lists',                     adminMailingListController.index);
adminRouter.get('/mailing-lists/new',                 adminMailingListController.newForm);
adminRouter.post('/mailing-lists/new',                adminMailingListController.create);
adminRouter.get('/mailing-lists/:slug',               adminMailingListController.detail);
adminRouter.get('/mailing-lists/:slug/compose',       adminBroadcastController.composeForm);
adminRouter.post('/mailing-lists/:slug/compose',      adminBroadcastController.send);
adminRouter.get('/mailing-lists/:slug/edit',          adminMailingListController.editForm);
adminRouter.post('/mailing-lists/:slug/edit',         adminMailingListController.update);
adminRouter.post('/mailing-lists/:slug/archive',      adminMailingListController.archive);
adminRouter.post('/mailing-lists/:slug/subscriptions/adjust', adminMailingListController.adjustSubscription);
// The record of what was sent, across every audience a send can name.
adminRouter.get('/broadcasts',                        adminBroadcastController.index);
adminRouter.get('/broadcasts/:id',                    adminBroadcastController.detail);
adminRouter.get('/email-templates',           adminEmailTemplateController.index);
adminRouter.get('/email-templates/:key/edit', adminEmailTemplateController.edit);
adminRouter.post('/email-templates/:key/edit', adminEmailTemplateController.update);
adminRouter.get('/clubs/leadership',          adminClubLeadershipController.queue);
adminRouter.get('/clubs/:clubId/leadership',  adminClubLeadershipController.detail);
adminRouter.post('/clubs/:clubId/leadership/assign',  adminClubLeadershipController.assign);
// The longer confirm path first, as elsewhere: a demotion previews and writes
// only on confirm, because removing an affiliation ends a club membership.
adminRouter.post('/clubs/:clubId/leadership/demote/confirm', adminClubLeadershipController.demote);
adminRouter.post('/clubs/:clubId/leadership/demote',  adminClubLeadershipController.demotePreview);
adminRouter.get('/club-cleanup',              adminClubCleanupController.index);
adminRouter.post('/club-cleanup/claim',       adminClubCleanupController.claim);
adminRouter.post('/club-cleanup/bulk-resolve', adminClubCleanupController.bulkResolve);
adminRouter.post('/club-cleanup/:clubId/resolve', adminClubCleanupController.resolve);
adminRouter.post('/club-cleanup/:clubId/contact-members', adminClubCleanupController.contactMembers);
adminRouter.post('/club-cleanup/:clubId/delist-residue', adminClubCleanupController.delistResidue);
// Promote and resolve key on the candidate id: an unpromoted candidate has
// no clubs row yet, so the clubId-keyed resolve route cannot address it.
adminRouter.post('/club-cleanup/candidates/:candidateId/promote', adminClubCleanupController.promote);
adminRouter.post('/club-cleanup/candidates/:candidateId/resolve', adminClubCleanupController.resolveCandidate);

// Freestyle dictionary curation: browse the trick rows, open one for edit, and
// save its scalar fields. An alias can be added, reclassified, or removed on the
// edit page; attached sources and modifier links are attach-or-detach only.
// Before the /tricks routes: a work queue over the adjudication record, read
// from the table the funnel writes rather than from generated content.
adminRouter.get('/freestyle/notation-backlog',   adminFreestyleController.notationBacklog);
adminRouter.get('/freestyle/notation-drafts',    adminFreestyleController.notationDrafts);
adminRouter.get('/freestyle/notation-backlog/:candidateId/author',  adminFreestyleController.notationAuthorForm);
adminRouter.post('/freestyle/notation-backlog/:candidateId/author', adminFreestyleController.notationAuthorSave);
adminRouter.get('/freestyle/tricks',             adminFreestyleController.index);
adminRouter.get('/freestyle/tricks/:slug/edit',  adminFreestyleController.edit);
adminRouter.post('/freestyle/tricks/:slug/edit', adminFreestyleController.update);
adminRouter.post('/freestyle/tricks/:slug/aliases',                    adminFreestyleController.addAlias);
adminRouter.post('/freestyle/tricks/:slug/aliases/:aliasSlug',         adminFreestyleController.updateAlias);
adminRouter.post('/freestyle/tricks/:slug/aliases/:aliasSlug/delete',  adminFreestyleController.removeAlias);
adminRouter.post('/freestyle/tricks/:slug/sources',                    adminFreestyleController.attachSource);
adminRouter.post('/freestyle/tricks/:slug/sources/:sourceId/delete',   adminFreestyleController.detachSource);
adminRouter.post('/freestyle/tricks/:slug/modifiers',                                    adminFreestyleController.attachModifier);
adminRouter.post('/freestyle/tricks/:slug/modifiers/:modifierSlug/:applyOrder/delete',   adminFreestyleController.detachModifier);
// Emerging Vocabulary workbench (decision packet + full-dimension row table).
// Read-only curator surface; adjudications land through the ruling ledger.
adminRouter.get('/freestyle/emerging-vocabulary', emergingVocabController.workbenchPage);
// Moderation of the imported community trick tips: a cross-trick index, and
// per-tip edit / hide / restore / remap. Tips are keyed by numeric id (unresolved
// tips have no trick page), so this is its own index rather than a per-trick sub-surface.
adminRouter.get('/freestyle/tips',              adminFreestyleController.tips);
adminRouter.post('/freestyle/tips/:id/edit',    adminFreestyleController.editTip);
adminRouter.post('/freestyle/tips/:id/order',   adminFreestyleController.setTipOrder);
adminRouter.post('/freestyle/tips/:id/hide',    adminFreestyleController.hideTip);
adminRouter.post('/freestyle/tips/:id/restore', adminFreestyleController.restoreTip);
adminRouter.post('/freestyle/tips/:id/remap',   adminFreestyleController.remapTip);
// Dictionary provenance-source registry: list the existing sources and create one
// (the trick-dictionary provenance registry, distinct from the media-source registry).
adminRouter.get('/freestyle/sources',           adminFreestyleController.sources);
adminRouter.post('/freestyle/sources',          adminFreestyleController.createSource);
adminRouter.get('/freestyle/records',              adminFreestyleController.recordsIndex);
adminRouter.get('/freestyle/records/new',          adminFreestyleController.recordNew);
adminRouter.post('/freestyle/records',             adminFreestyleController.recordCreate);
adminRouter.get('/freestyle/records/:id/edit',     adminFreestyleController.recordEdit);
adminRouter.post('/freestyle/records/:id/edit',    adminFreestyleController.recordUpdate);
adminRouter.get('/freestyle/consecutive-records',             adminFreestyleController.consecutiveIndex);
adminRouter.get('/freestyle/consecutive-records/new',         adminFreestyleController.consecutiveNew);
adminRouter.post('/freestyle/consecutive-records',            adminFreestyleController.consecutiveCreate);
adminRouter.get('/freestyle/consecutive-records/:id/edit',    adminFreestyleController.consecutiveEdit);
adminRouter.post('/freestyle/consecutive-records/:id/edit',   adminFreestyleController.consecutiveUpdate);
adminRouter.post('/freestyle/consecutive-records/:id/delete', adminFreestyleController.consecutiveDelete);
adminRouter.get('/curator/upload', adminCuratorController.getUpload);
adminRouter.post('/curator/upload', adminCuratorController.postUpload);
// Async curator video upload (DD §6.8). Three-step browser flow: sign,
// direct-PUT to S3, finalize. Order matters within the /jobs subtree: the
// more-specific /events route comes before the page render, though Express
// matches by declaration order alone — listing both for clarity.
adminRouter.post('/curator/upload/sign', adminCuratorController.postSignUpload);
adminRouter.post('/curator/upload/finalize', adminCuratorController.postFinalizeUpload);
adminRouter.get('/curator/upload/jobs/:jobId/events', adminCuratorController.streamJobEvents);
adminRouter.get('/curator/upload/jobs/:jobId', adminCuratorController.getJobStatus);
adminRouter.get('/curator/media', adminCuratorController.getList);
adminRouter.get('/curator/media/:id/edit', adminCuratorController.getEdit);
adminRouter.post('/curator/media/:id/edit', adminCuratorController.postEdit);
adminRouter.post('/curator/media/:id/delete', adminCuratorController.postDelete);
adminRouter.get('/curator/galleries', adminCuratorController.getGalleryList);
adminRouter.get('/curator/galleries/new', adminCuratorController.getGalleryNew);
adminRouter.post('/curator/galleries', adminCuratorController.postGalleryCreate);
adminRouter.get('/curator/galleries/:id/edit', adminCuratorController.getGalleryEdit);
adminRouter.post('/curator/galleries/:id/edit', adminCuratorController.postGalleryEdit);
adminRouter.post('/curator/galleries/:id/delete', adminCuratorController.postGalleryDelete);
