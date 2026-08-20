import type { Finding } from './finding.js';
import type { CheckExecution, CoverageGap, ReadinessReport } from './report.js';
import type { CommandApprovalBoundary, ObservationBoundary } from './verification.js';

export interface VerificationLink {
  planId: string;
  planFingerprint: string;
  executionId: string;
  executionRecordPath: string;
  observationBoundary: ObservationBoundary;
  approvalBoundary: CommandApprovalBoundary;
}

export interface VerifiedReadinessReport extends Omit<ReadinessReport, 'schemaVersion'> {
  schemaVersion: '0.2';
  verification: VerificationLink;
}

export interface VerificationFindingSet {
  findings: Finding[];
  checkExecution: CheckExecution;
  coverageGaps: CoverageGap[];
}
