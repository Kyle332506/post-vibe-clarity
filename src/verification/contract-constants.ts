import type { VerificationCoverageGap } from '../model/verification.js';

export const VERIFICATION_DISCLAIMER = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';

export const CONTAINMENT_WARNING = 'Commands run as local processes with the current user privileges; this is not a security sandbox and does not block network or out-of-project filesystem access.';

export const ORCHESTRATION_COVERAGE_GAP: VerificationCoverageGap = {
  id: 'orchestration.post-processing',
  reason: 'Mandatory post-command processing did not complete, so no verified readiness report was published.',
};
