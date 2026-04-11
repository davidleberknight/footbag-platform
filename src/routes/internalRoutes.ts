import { Router } from 'express';
import { netController } from '../controllers/netController';

/**
 * Internal / operator routes.
 * Not linked from public nav. Read-only. No auth gate in this pass.
 * Mount point: /internal
 */
export const internalRouter = Router();

// Net enrichment QC / review
internalRouter.get('/net/review',      netController.reviewPage);
// Net curated match browser
internalRouter.get('/net/curated',     netController.curatedPage);
// Net match candidates from noise extraction
internalRouter.get('/net/candidates',                              netController.candidatesPage);
// Candidate detail + promote/reject workflow
internalRouter.get('/net/candidates/:candidateId',                 netController.candidateDetail);
internalRouter.post('/net/candidates/:candidateId/approve',        netController.candidateApprove);
internalRouter.post('/net/candidates/:candidateId/reject',         netController.candidateReject);
