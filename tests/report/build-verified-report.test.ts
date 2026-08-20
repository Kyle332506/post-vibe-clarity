import { describe, expect, it } from 'vitest';
import { derivePartial, summarizeReport } from '../../src/model/report.js';
import { buildVerifiedReport } from '../../src/report/build-verified-report.js';
import { fingerprintPlan } from '../../src/verification/plan-fingerprint.js';
import { sampleReadinessReport } from '../fixtures/sample-readiness-report.js';
import { sampleVerificationExecution } from '../fixtures/sample-verification-execution.js';
import { sampleVerificationPlan } from '../fixtures/sample-verification-plan.js';

const executionRecordPath = '.postvibe/execution-pve-20260818.json';

describe('buildVerifiedReport', () => {
  it('combines fresh Level 0 findings with linked command evidence and recomputes derived fields', async () => {
    const report = await buildVerifiedReport(
      sampleReadinessReport,
      sampleVerificationPlan,
      sampleVerificationExecution,
      executionRecordPath,
    );

    expect(report.schemaVersion).toBe('0.2');
    expect(report.verification).toEqual({
      planId: sampleVerificationPlan.planId,
      planFingerprint: sampleVerificationPlan.fingerprint,
      executionId: sampleVerificationExecution.executionId,
      executionRecordPath,
      observationBoundary: sampleVerificationExecution.observationBoundary,
      approvalBoundary: sampleVerificationExecution.approvalBoundary,
    });
    expect(report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'secret-exposure.fixture-secret' }),
      expect.objectContaining({ id: 'launch-essentials.privacy-unverified' }),
      expect.objectContaining({ id: 'universal-verification.commands.package-script:build', outcome: 'passed' }),
      expect.objectContaining({ id: 'universal-verification.commands.package-script:test', outcome: 'passed' }),
      expect.objectContaining({ id: 'universal-verification.commands.category.type-check', outcome: 'unverified' }),
      expect.objectContaining({ id: 'universal-verification.commands.package-script:lint', outcome: 'unverified' }),
    ]));
    expect(report.summary.byOutcome).toEqual({
      passed: 2,
      failed: 1,
      'likely-issue': 0,
      unverified: 3,
      'not-applicable': 0,
      'risk-accepted': 0,
      'resolved-and-rechecked': 0,
    });
    expect(report.summary.byCheckStatus).toEqual({ completed: 1, unavailable: 0, failed: 0, unverified: 2 });
    expect(report.partial).toBe(true);
  });

  it('removes only represented domain gaps and preserves unrelated Level 0 evidence', async () => {
    const base = structuredClone(sampleReadinessReport);
    base.coverageGaps.push({
      id: 'domain.mixed-fixture',
      status: 'unverified',
      domains: ['data-correctness', 'operations-observability'],
      reason: 'A mixed-domain fixture remains only partly represented.',
    });
    base.summary = summarizeReport(base.findings, base.checkExecutions, base.coverageGaps);
    base.partial = derivePartial(base.checkExecutions, base.coverageGaps);
    const report = await buildVerifiedReport(
      base,
      sampleVerificationPlan,
      sampleVerificationExecution,
      executionRecordPath,
    );

    expect(report.coverageGaps).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'domain.data-correctness' }),
      expect.objectContaining({ id: 'domain.maintainability-change-safety' }),
      expect.objectContaining({ id: 'domain.release-delivery' }),
    ]));
    expect(report.coverageGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'check.launch-essentials.privacy-notice' }),
      expect.objectContaining({ id: 'domain.operations-observability' }),
      expect.objectContaining({ id: 'domain.mixed-fixture', domains: ['operations-observability'] }),
    ]));
    expect(report.checkExecutions.slice(0, 2)).toEqual(sampleReadinessReport.checkExecutions);
  });

  it('rejects duplicate findings and missing execution-record paths', async () => {
    const duplicateBase = structuredClone(sampleReadinessReport);
    duplicateBase.findings.push(structuredClone(duplicateBase.findings[0]!));

    await expect(buildVerifiedReport(
      duplicateBase,
      sampleVerificationPlan,
      sampleVerificationExecution,
      executionRecordPath,
    )).rejects.toThrow(/duplicate/i);
    await expect(buildVerifiedReport(
      sampleReadinessReport,
      sampleVerificationPlan,
      sampleVerificationExecution,
      '',
    )).rejects.toThrow(/execution-record path/i);
  });

  it('rejects plan and execution linkage mismatches', async () => {
    const execution = structuredClone(sampleVerificationExecution);
    execution.planFingerprint = 'b'.repeat(64);

    await expect(buildVerifiedReport(
      sampleReadinessReport,
      sampleVerificationPlan,
      execution,
      executionRecordPath,
    )).rejects.toThrow(/verification execution/i);
  });

  it.each([
    ['command behavior', (plan: typeof sampleVerificationPlan) => { plan.commands[0]!.timeoutSeconds += 1; }],
    ['command evidence', (plan: typeof sampleVerificationPlan) => { plan.commands[0]!.source.declaration = 'changed script'; }],
    ['planning evidence', (plan: typeof sampleVerificationPlan) => {
      plan.planningReport.findings[0]!.recommendation = 'Changed after approval.';
    }],
  ])('rejects %s changed without recomputing the approved fingerprint', async (_label, mutate) => {
    const plan = structuredClone(sampleVerificationPlan);
    mutate(plan);

    await expect(buildVerifiedReport(
      sampleReadinessReport,
      plan,
      sampleVerificationExecution,
      executionRecordPath,
    )).rejects.toThrow(/fingerprint must match the canonical plan payload/i);
  });

  it('rejects an execution that drops a plan coverage gap', async () => {
    const plan = structuredClone(sampleVerificationPlan);
    plan.coverageGaps.push({
      id: 'workspace.packages-api',
      reason: 'The packages/api workspace is not covered by an approved command.',
      workspace: 'packages/api',
    });
    plan.fingerprint = fingerprintPlan(plan);
    plan.planId = `pvp-${plan.fingerprint.slice(0, 16)}`;
    const execution = structuredClone(sampleVerificationExecution);
    execution.planId = plan.planId;
    execution.planFingerprint = plan.fingerprint;

    await expect(buildVerifiedReport(
      sampleReadinessReport,
      plan,
      execution,
      executionRecordPath,
    )).rejects.toThrow(/coverageGaps must exactly match plan coverage gaps/i);
  });

  it('does not produce a report containing an unredacted controlled credential', async () => {
    const base = structuredClone(sampleReadinessReport);
    base.findings[0]!.recommendation = 'Set APP_TOKEN=pvc-controlled-report-secret';

    await expect(buildVerifiedReport(
      base,
      sampleVerificationPlan,
      sampleVerificationExecution,
      executionRecordPath,
    )).rejects.toThrow(/unredacted credential/i);
  });

  it('rejects an execution-record path containing line or control characters', async () => {
    await expect(buildVerifiedReport(
      sampleReadinessReport,
      sampleVerificationPlan,
      sampleVerificationExecution,
      '.postvibe/execution.json\n## injected',
    )).rejects.toThrow(/execution-record path.*control/i);
  });
});
