import type { Evidence } from '../../model/finding.js';

export type OperationsCheckId =
  | 'launch-operations.release-process'
  | 'launch-operations.rollback-process'
  | 'launch-operations.monitoring-response'
  | 'launch-operations.health-check'
  | 'launch-operations.backup-restore'
  | 'launch-operations.maintenance-ownership';

export interface EvidenceRequirement {
  id: string;
  patterns: readonly RegExp[];
}

export interface DocumentEvidenceProfile {
  candidatePaths: readonly RegExp[];
  requirements: readonly EvidenceRequirement[];
  riskPatterns: readonly RegExp[];
}

export interface DocumentEvidenceResult {
  status: 'usable' | 'insufficient' | 'missing';
  evidence: Evidence[];
  riskEvidence: Evidence[];
  matchedRequirementIds: string[];
  missingRequirementIds: string[];
  unverifiedBoundaries: string[];
}
