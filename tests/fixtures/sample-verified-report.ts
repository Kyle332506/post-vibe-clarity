import type { VerifiedReadinessReport } from '../../src/model/verified-report.js';
import { buildVerifiedReport } from '../../src/report/build-verified-report.js';
import { sampleReadinessReport } from './sample-readiness-report.js';
import { sampleVerificationExecution } from './sample-verification-execution.js';
import { sampleVerificationPlan } from './sample-verification-plan.js';

export const sampleExecutionRecordPath = '.postvibe/execution-pve-20260818.json';

export async function sampleVerifiedReadinessReport(): Promise<VerifiedReadinessReport> {
  return buildVerifiedReport(
    structuredClone(sampleReadinessReport),
    structuredClone(sampleVerificationPlan),
    structuredClone(sampleVerificationExecution),
    sampleExecutionRecordPath,
  );
}
