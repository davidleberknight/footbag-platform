import { Router } from 'express';
import { adminController } from '../controllers/adminController';
import { adminCuratorController } from '../controllers/adminCuratorController';
import { adminWorkQueueController } from '../controllers/adminWorkQueueController';
import { adminClubCleanupController } from '../controllers/adminClubCleanupController';
import { adminBootstrapController } from '../controllers/adminBootstrapController';
import { adminClubLeadershipController } from '../controllers/adminClubLeadershipController';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';

export const adminRouter = Router();

// The single-shot first-admin bootstrap claim sits ABOVE the admin gate:
// the claimant is by definition not yet an admin, only signed in.
adminRouter.get('/bootstrap-claim',  requireAuth, adminBootstrapController.getClaim);
adminRouter.post('/bootstrap-claim', requireAuth, adminBootstrapController.postClaim);

adminRouter.use(requireAuth, requireAdmin);

adminRouter.get('/', adminController.index);
adminRouter.get('/work-queue',                adminWorkQueueController.index);
adminRouter.post('/work-queue/:id/resolve',   adminWorkQueueController.resolve);
adminRouter.post('/work-queue/:id/link-help/approve', adminWorkQueueController.linkHelpApprove);
adminRouter.post('/work-queue/:id/link-help/reject',  adminWorkQueueController.linkHelpReject);
adminRouter.post('/work-queue/:id/link-help/dispute-revert', adminWorkQueueController.linkHelpDisputeRevert);
adminRouter.get('/clubs/leadership',          adminClubLeadershipController.queue);
adminRouter.get('/clubs/:clubId/leadership',  adminClubLeadershipController.detail);
adminRouter.post('/clubs/:clubId/leadership/assign',  adminClubLeadershipController.assign);
adminRouter.post('/clubs/:clubId/leadership/demote',  adminClubLeadershipController.demote);
adminRouter.post('/clubs/:clubId/leadership/contact', adminClubLeadershipController.contact);
adminRouter.get('/club-cleanup',              adminClubCleanupController.index);
adminRouter.post('/club-cleanup/claim',       adminClubCleanupController.claim);
adminRouter.post('/club-cleanup/bulk-resolve', adminClubCleanupController.bulkResolve);
adminRouter.post('/club-cleanup/bulk-delist-residue', adminClubCleanupController.bulkDelistResidue);
adminRouter.post('/club-cleanup/:clubId/resolve', adminClubCleanupController.resolve);
adminRouter.post('/club-cleanup/:clubId/delist-residue', adminClubCleanupController.delistResidue);
// Promote and resolve key on the candidate id: an unpromoted candidate has
// no clubs row yet, so the clubId-keyed resolve route cannot address it.
adminRouter.post('/club-cleanup/candidates/:candidateId/promote', adminClubCleanupController.promote);
adminRouter.post('/club-cleanup/candidates/:candidateId/resolve', adminClubCleanupController.resolveCandidate);
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
