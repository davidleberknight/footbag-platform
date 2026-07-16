import { Router } from 'express';
import { netQcController } from '../internal-qc/controllers/netQcController';
import { personsQcController } from '../internal-qc/controllers/personsQcController';
import { requireAuth } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';

/**
 * Internal / operator routes. Not linked from public nav.
 * Gated by requireAuth + requireAdmin: unauthenticated requests redirect
 * to /login, non-admin authenticated requests get 403. State-changing POSTs
 * affect public Net data and must remain admin-only.
 * Mount point: /internal
 */
export const internalRouter = Router();

internalRouter.use(requireAuth, requireAdmin);

// Persons QC + browse
internalRouter.get('/persons/qc', personsQcController.qcPage);
internalRouter.get('/persons/browse', personsQcController.browsePage);

// The Emerging Vocabulary workbench moved to /admin/freestyle/emerging-vocabulary
// (a keeper curator surface, off this dev-only QC router). Redirect any bookmark
// held from when it lived here.
internalRouter.get('/freestyle/emerging-vocabulary', (_req, res) => {
  res.redirect(301, '/admin/freestyle/emerging-vocabulary');
});

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
