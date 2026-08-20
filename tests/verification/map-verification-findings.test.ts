import { describe, expect, it } from 'vitest';
import type {
  CommandCategory,
  CommandResultStatus,
  VerificationExecution,
  VerificationPlan,
} from '../../src/model/verification.js';
import { mapVerificationEvidence } from '../../src/verification/map-verification-findings.js';
import { ORCHESTRATION_COVERAGE_GAP } from '../../src/verification/contract-constants.js';
import { fingerprintPlan } from '../../src/verification/plan-fingerprint.js';
import { sampleVerificationExecution } from '../fixtures/sample-verification-execution.js';
import { sampleVerificationPlan } from '../fixtures/sample-verification-plan.js';

function approve(plan: VerificationPlan, execution: VerificationExecution): void {
  plan.fingerprint = fingerprintPlan(plan);
  plan.planId = `pvp-${plan.fingerprint.slice(0, 16)}`;
  execution.planId = plan.planId;
  execution.planFingerprint = plan.fingerprint;
}

function mapped(category: CommandCategory, status: CommandResultStatus) {
  const plan = structuredClone(sampleVerificationPlan);
  plan.commands = [{ ...plan.commands[0]!, id: `fixture:${category}`, category }];
  plan.excludedCommands = [];
  plan.coverageGaps = [];
  plan.categoryAssessments = plan.categoryAssessments.map((assessment) => ({
    ...assessment,
    state: assessment.category === category ? 'applicable' : 'not-applicable',
    reason: assessment.category === category ? 'A declared command applies.' : 'Evidence shows this category does not apply.',
  }));
  const execution: VerificationExecution = {
    ...structuredClone(sampleVerificationExecution),
    results: [{
      commandId: `fixture:${category}`,
      status,
      startedAt: '2026-08-18T12:01:00.000Z',
      durationMs: 42,
      exitCode: status === 'passed' ? 0 : status === 'failed' ? 1 : null,
      signal: null,
      output: '',
      outputTruncated: false,
      fileChanges: [],
      ...(status === 'passed' || status === 'failed' ? {} : { unverifiedReason: `The ${category} command lacks complete evidence.` }),
    }],
    coverageGaps: [],
  };
  approve(plan, execution);
  return mapVerificationEvidence(plan, execution).findings.find(
    ({ id }) => id === `universal-verification.commands.fixture:${category}`,
  );
}

describe('mapVerificationEvidence', () => {
  it.each([
    ['build', 'failed', 'failed', 'stop-before-launch'],
    ['test', 'failed', 'failed', 'stop-before-launch'],
    ['type-check', 'failed', 'failed', 'resolve-before-launch'],
    ['lint', 'failed', 'failed', 'resolve-before-launch'],
    ['build', 'timed-out', 'unverified', 'resolve-before-launch'],
    ['test', 'could-not-start', 'unverified', 'resolve-before-launch'],
    ['lint', 'interrupted', 'unverified', 'plan-soon'],
  ] as const)('%s %s maps correctly', (category, status, outcome, actionLevel) => {
    expect(mapped(category, status)).toMatchObject({ outcome, actionLevel });
  });

  it.each(['build', 'test', 'type-check', 'lint'] as const)('maps passing %s evidence without a verdict', (category) => {
    expect(mapped(category, 'passed')).toMatchObject({
      outcome: 'passed',
      actionLevel: 'improve-when-appropriate',
      humanReviewRequired: false,
    });
  });

  it.each([
    ['build', 'timed-out', 'resolve-before-launch'],
    ['test', 'timed-out', 'resolve-before-launch'],
    ['type-check', 'timed-out', 'plan-soon'],
    ['lint', 'timed-out', 'plan-soon'],
    ['build', 'could-not-start', 'resolve-before-launch'],
    ['test', 'could-not-start', 'resolve-before-launch'],
    ['type-check', 'could-not-start', 'plan-soon'],
    ['lint', 'could-not-start', 'plan-soon'],
    ['build', 'interrupted', 'resolve-before-launch'],
    ['test', 'interrupted', 'resolve-before-launch'],
    ['type-check', 'interrupted', 'plan-soon'],
    ['lint', 'interrupted', 'plan-soon'],
    ['build', 'unverified', 'resolve-before-launch'],
    ['test', 'unverified', 'resolve-before-launch'],
    ['type-check', 'unverified', 'plan-soon'],
    ['lint', 'unverified', 'plan-soon'],
  ] as const)('%s %s uses its missing-command priority', (category, status, actionLevel) => {
    expect(mapped(category, status)).toMatchObject({ outcome: 'unverified', actionLevel });
  });

  it('maps missing, excluded, and evidence-based not-applicable categories', () => {
    const plan = structuredClone(sampleVerificationPlan);
    plan.categoryAssessments = plan.categoryAssessments.map((assessment) => assessment.category === 'build'
      ? { ...assessment, state: 'not-applicable', reason: 'The inspected static site has no build step.' }
      : assessment);
    plan.commands = plan.commands.filter(({ category }) => category !== 'build');
    const execution = structuredClone(sampleVerificationExecution);
    execution.results = execution.results.filter(({ commandId }) => commandId !== 'package-script:build');
    approve(plan, execution);

    const mappedSet = mapVerificationEvidence(plan, execution);

    expect(mappedSet.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'universal-verification.commands.category.build',
        outcome: 'not-applicable',
        actionLevel: 'improve-when-appropriate',
        applicability: 'The inspected static site has no build step.',
      }),
      expect.objectContaining({
        id: 'universal-verification.commands.category.type-check',
        outcome: 'unverified',
        actionLevel: 'plan-soon',
      }),
      expect.objectContaining({
        id: 'universal-verification.commands.package-script:lint',
        outcome: 'unverified',
        actionLevel: 'plan-soon',
      }),
    ]));
  });

  it('records one versioned verification check and marks only incomplete evidence unverified', () => {
    const completePlan = structuredClone(sampleVerificationPlan);
    completePlan.excludedCommands = [];
    completePlan.coverageGaps = [];
    completePlan.categoryAssessments = completePlan.categoryAssessments.map((assessment) => ({
      ...assessment,
      state: assessment.category === 'build' || assessment.category === 'test' ? 'applicable' : 'not-applicable',
      reason: assessment.category === 'build' || assessment.category === 'test'
        ? 'A declared command applies.'
        : 'Evidence shows this category does not apply.',
    }));
    const completeExecution = structuredClone(sampleVerificationExecution);
    completeExecution.coverageGaps = [];
    approve(completePlan, completeExecution);
    const complete = mapVerificationEvidence(completePlan, completeExecution);
    const incomplete = mapVerificationEvidence(sampleVerificationPlan, sampleVerificationExecution);

    expect(complete.checkExecution).toEqual(expect.objectContaining({
      checkId: 'universal-verification.commands',
      checkVersion: '0.1.0',
      skillId: 'universal-verification',
      skillVersion: '0.1.0',
      domains: ['data-correctness', 'maintainability-change-safety', 'release-delivery'],
      status: 'completed',
    }));
    expect(complete.coverageGaps).toEqual([]);
    expect(incomplete.checkExecution.status).toBe('unverified');
    expect(incomplete.coverageGaps).toEqual([
      expect.objectContaining({
        id: 'check.universal-verification.commands.gap.category.type-check',
        checkId: 'universal-verification.commands',
        status: 'unverified',
      }),
      expect.objectContaining({
        id: 'check.universal-verification.commands.gap.command.package-script:lint',
        checkId: 'universal-verification.commands',
        status: 'unverified',
      }),
    ]);
  });

  it('preserves approved coverage gaps plus the one allowed orchestration gap in ordinal order', () => {
    const plan = structuredClone(sampleVerificationPlan);
    plan.coverageGaps.push({
      id: 'workspace.packages-api',
      reason: 'The workspace has no approved aggregate command.',
      workspace: 'packages/api',
    });
    const execution = structuredClone(sampleVerificationExecution);
    execution.status = 'partial';
    execution.coverageGaps = [...structuredClone(plan.coverageGaps), structuredClone(ORCHESTRATION_COVERAGE_GAP)];
    approve(plan, execution);

    const result = mapVerificationEvidence(plan, execution);

    expect(result.checkExecution.status).toBe('unverified');
    expect(result.coverageGaps.map(({ id }) => id)).toEqual([
      'check.universal-verification.commands.gap.category.type-check',
      'check.universal-verification.commands.gap.command.package-script:lint',
      'check.universal-verification.commands.gap.orchestration.post-processing',
      'check.universal-verification.commands.gap.workspace.packages-api',
    ]);
    expect(result.coverageGaps.at(-1)?.reason).toContain('packages/api');
  });

  it('rejects an execution that omits an approved plan coverage gap', () => {
    const plan = structuredClone(sampleVerificationPlan);
    plan.coverageGaps.push({
      id: 'workspace.packages-api',
      reason: 'The workspace has no approved aggregate command.',
      workspace: 'packages/api',
    });
    const execution = structuredClone(sampleVerificationExecution);
    approve(plan, execution);

    expect(() => mapVerificationEvidence(plan, execution)).toThrow(
      /coverageGaps must exactly match plan coverage gaps or the allowed orchestration gap/i,
    );
  });

  it('uses collision-free synthetic IDs when a command occupies the category finding ID', () => {
    const plan = structuredClone(sampleVerificationPlan);
    plan.commands[0]!.id = 'category.type-check';
    const execution = structuredClone(sampleVerificationExecution);
    execution.results[0]!.commandId = 'category.type-check';
    approve(plan, execution);

    const result = mapVerificationEvidence(plan, execution);
    const ids = result.findings.map(({ id }) => id);

    expect(ids).toContain('universal-verification.commands.category.type-check');
    expect(ids).toContain('universal-verification.commands.category.type-check.assessment');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('treats command failures as completed check evidence', () => {
    const plan = structuredClone(sampleVerificationPlan);
    plan.excludedCommands = [];
    plan.coverageGaps = [];
    plan.categoryAssessments = plan.categoryAssessments.map((assessment) => ({
      ...assessment,
      state: assessment.category === 'build' || assessment.category === 'test' ? 'applicable' : 'not-applicable',
      reason: assessment.category === 'build' || assessment.category === 'test'
        ? 'A declared command applies.'
        : 'Evidence shows this category does not apply.',
    }));
    const execution = structuredClone(sampleVerificationExecution);
    execution.coverageGaps = [];
    execution.results[0]!.status = 'failed';
    execution.results[0]!.exitCode = 1;
    approve(plan, execution);

    const result = mapVerificationEvidence(plan, execution);

    expect(result.checkExecution.status).toBe('completed');
    expect(result.coverageGaps).toEqual([]);
    expect(result.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'universal-verification.commands.package-script:build',
        outcome: 'failed',
      }),
    ]));
  });

  it('does not copy controlled command output into report findings', () => {
    const execution: VerificationExecution = structuredClone(sampleVerificationExecution);
    execution.results[0]!.output = 'APP_TOKEN=pvc-controlled-report-secret';

    expect(JSON.stringify(mapVerificationEvidence(sampleVerificationPlan, execution))).not.toContain(
      'pvc-controlled-report-secret',
    );
  });

  it('rejects execution evidence that is not linked to the supplied plan', () => {
    const execution = structuredClone(sampleVerificationExecution);
    execution.planFingerprint = 'b'.repeat(64);

    expect(() => mapVerificationEvidence(sampleVerificationPlan, execution)).toThrow(
      /planFingerprint must match the verification plan fingerprint/,
    );
  });
});
