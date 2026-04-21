import { Router } from 'express';
import { netQcController } from '../internal-qc/controllers/netQcController';
import { personsController } from '../controllers/personsController';

/**
 * Internal / operator routes.
 * Not linked from public nav. Read-only. No auth gate in this pass.
 * Mount point: /internal
 */
export const internalRouter = Router();

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
// Net curated match browser
internalRouter.get('/net/curated',     netQcController.curatedPage);
// Net match candidates from noise extraction
internalRouter.get('/net/candidates',                              netQcController.candidatesPage);
// Candidate detail + promote/reject workflow
internalRouter.get('/net/candidates/:candidateId',                 netQcController.candidateDetail);
internalRouter.post('/net/candidates/:candidateId/approve',        netQcController.candidateApprove);
internalRouter.post('/net/candidates/:candidateId/reject',         netQcController.candidateReject);
