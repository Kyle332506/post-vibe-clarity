import {
  derivePartial,
  summarizeReport,
  type CoverageGap,
  type ReadinessReport,
} from '../model/report.js';
import type { VerifiedReadinessReport } from '../model/verified-report.js';
import type { VerificationExecution, VerificationPlan } from '../model/verification.js';
import { validateReadinessReport } from '../validation/report-schema.js';
import { validateVerifiedReadinessReport } from '../validation/report-v02-schema.js';
import { validateVerificationExecution, validateExecutionAgainstPlan } from '../validation/verification-execution-schema.js';
import { validateVerificationPlan } from '../validation/verification-plan-schema.js';
import { mapVerificationEvidence } from '../verification/map-verification-findings.js';
import { containsMarkdownLineOrControl } from './markdown-safety.js';

const representedDomains = new Set([
  'data-correctness',
  'maintainability-change-safety',
  'release-delivery',
]);

function retainUnrepresentedDomains(gap: CoverageGap): CoverageGap | undefined {
  if (gap.checkId !== undefined) return gap;
  const domains = gap.domains.filter((domain) => !representedDomains.has(domain));
  return domains.length === 0 ? undefined : { ...gap, domains };
}

function invalidArtifact(label: string, errors: string[]): Error {
  return new Error(`${label} is invalid: ${errors.join('; ')}`);
}

export async function buildVerifiedReport(
  base: ReadinessReport,
  plan: VerificationPlan,
  execution: VerificationExecution,
  executionRecordPath: string,
): Promise<VerifiedReadinessReport> {
  if (executionRecordPath.trim().length === 0) throw new Error('A non-empty execution-record path is required.');
  if (containsMarkdownLineOrControl(executionRecordPath)) {
    throw new Error('The execution-record path must not contain control characters.');
  }

  const [baseValidation, planValidation, executionValidation] = await Promise.all([
    validateReadinessReport(base),
    validateVerificationPlan(plan),
    validateVerificationExecution(execution),
  ]);
  if (!baseValidation.ok) throw invalidArtifact('Base readiness report', baseValidation.errors);
  if (!planValidation.ok) throw invalidArtifact('Verification plan', planValidation.errors);
  if (!executionValidation.ok) throw invalidArtifact('Verification execution', executionValidation.errors);
  const linkageErrors = validateExecutionAgainstPlan(execution, plan);
  if (linkageErrors.length > 0) throw invalidArtifact('Verification execution linkage', linkageErrors);
  if (base.manifest.projectRoot !== plan.projectRoot) {
    throw new Error('Base readiness report project root must match the verification plan.');
  }

  const mapped = mapVerificationEvidence(plan, execution);
  const findings = [...base.findings, ...mapped.findings];
  const findingIds = new Set<string>();
  for (const finding of findings) {
    if (findingIds.has(finding.id)) throw new Error(`Report findings contain duplicate id ${finding.id}.`);
    findingIds.add(finding.id);
  }
  const checkExecutions = [...base.checkExecutions, mapped.checkExecution];
  const retainedGaps = base.coverageGaps.flatMap((gap) => {
    const retained = retainUnrepresentedDomains(gap);
    return retained === undefined ? [] : [retained];
  });
  const coverageGaps = [...retainedGaps, ...mapped.coverageGaps];

  const report: VerifiedReadinessReport = {
    ...base,
    schemaVersion: '0.2',
    checkExecutions,
    coverageGaps,
    findings,
    summary: summarizeReport(findings, checkExecutions, coverageGaps),
    partial: derivePartial(checkExecutions, coverageGaps),
    verification: {
      planId: plan.planId,
      planFingerprint: plan.fingerprint,
      executionId: execution.executionId,
      executionRecordPath,
      observationBoundary: structuredClone(execution.observationBoundary),
    },
  };
  const reportValidation = await validateVerifiedReadinessReport(
    report,
    plan,
    execution,
    executionRecordPath,
  );
  if (!reportValidation.ok) throw invalidArtifact('Verified readiness report', reportValidation.errors);
  return report;
}
