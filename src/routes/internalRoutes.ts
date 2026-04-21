import { Router } from 'express';
import { netQcController } from '../internal-qc/controllers/netQcController';
import { devOutboxController } from '../internal-qc/controllers/devOutboxController';
import { personsController } from '../controllers/personsController';
import { requireAuth } from '../middleware/auth';

/**
 * Internal / operator routes.
 * Not linked from public nav. Gated to any logged-in member
 * (redirects to /login when unauthenticated).
 * Mount point: /internal
 */
export const internalRouter = Router();

// Dev outbox: registered BEFORE requireAuth so a localhost developer can
// read the stub outbox without an existing session (needed to complete
// the very first email-verification flow). The SES_ADAPTER=stub gate
// inside devOutboxService 404s this route in any non-dev environment.
internalRouter.get('/dev-outbox',                                  devOutboxController.page);

internalRouter.use(requireAuth);

// Persons QC + browse
internalRouter.get('/persons/qc', personsController.qcPage);
internalRouter.get('/persons/browse', personsController.browsePage);

// Net team corrections triage
internalRouter.get('/net/team-corrections',                    netQcController.teamCorrectionsPage);
internalRouter.post('/net/team-corrections/:id/decision',      netQcController.teamCorrectionDecision);
// Net recovery signals + candidates (identity diagnostic)
internalRouter.get('/net/recovery-signals',    netQcController.recoverySignalsPage);
internalRouter.get('/net/recovery-candidates',              netQcController.recoveryCandidatesPage);
internalRouter.post('/net/recovery-candidates/:id/decision', netQcController.recoveryCandidateDecision);
// Net enrichment QC / review
internalRouter.get('/net/review/summary',            netQcController.reviewSummaryPage);
internalRouter.get('/net/review',                    netQcController.reviewPage);
internalRouter.post('/net/review/:id/classify',      netQcController.reviewClassify);
internalRouter.post('/net/review/:id/decision',      netQcController.reviewDecision);
// Net event detail (QC reviewer view — discipline grouping, conflict-flag labels, QC hints)
internalRouter.get('/net/events/:eventId', netQcController.eventDetailPage);
// Net curated match browser
internalRouter.get('/net/curated',     netQcController.curatedPage);
// Net match candidates from noise extraction
internalRouter.get('/net/candidates',                              netQcController.candidatesPage);
// Candidate detail + promote/reject workflow
internalRouter.get('/net/candidates/:candidateId',                 netQcController.candidateDetail);
internalRouter.post('/net/candidates/:candidateId/approve',        netQcController.candidateApprove);
internalRouter.post('/net/candidates/:candidateId/reject',         netQcController.candidateReject);
