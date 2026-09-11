// ---- Legacy-governance-review only: DELETE BEFORE GO-LIVE ----
import { Router } from 'express';
import { internalGovernanceController } from '../internal-governance/controllers/internalGovernanceController';
import { requireMember } from '../middleware/auth';
import { requireAdmin } from '../middleware/requireAdmin';

/**
 * Throwaway legacy-governance review routes. Not linked from any nav.
 * Gated by requireMember + requireAdmin (member gate before admin gate).
 * Mount point: /internal-governance -- deliberately distinct from the
 * retired /internal mount (see tests/unit/qc-subsystem-retired.test.ts and
 * tests/unit/route-auth-conformance.test.ts, which assert that mount stays
 * gone). This router never reaches production: src/app.ts refuses to mount
 * it outside development/staging, and the production image build strips
 * dist/internal-governance and stubs this module to export null.
 */
export const internalGovernanceRouter = Router();

internalGovernanceRouter.use(requireMember, requireAdmin);

internalGovernanceRouter.get('/', (_req, res) => res.redirect(302, '/internal-governance/committees'));
internalGovernanceRouter.get('/committees', internalGovernanceController.committees);
internalGovernanceRouter.get('/committees/:committeeId', internalGovernanceController.committeeDetail);
internalGovernanceRouter.get('/elections', internalGovernanceController.elections);
internalGovernanceRouter.get('/elections/:electionId', internalGovernanceController.electionDetail);
