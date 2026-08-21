import { describe, expect, it } from 'vitest';
import { validateVerifiedReadinessReport } from '../../src/validation/report-v02-schema.js';
import {
  validateExecutionAgainstPlan,
} from '../../src/validation/verification-execution-schema.js';
import { validateVerificationPlan } from '../../src/validation/verification-plan-schema.js';
import { expectNoEmoji, readRepositoryFile } from './repository-docs.js';
import { generatePresentationSample } from './sample-report-generator.js';

const presentationPlaceholder = '[generated for this run]';
const controlledFixtureCredential = 'fixture-example-token-never-use';
const operationsCheckIds = [
  'launch-operations.release-process',
  'launch-operations.rollback-process',
  'launch-operations.monitoring-response',
  'launch-operations.health-check',
  'launch-operations.backup-restore',
  'launch-operations.maintenance-ownership',
] as const;
const repositoryOnlyBoundary = 'The six launch-operations findings inspect repository evidence only; no live provider, deployment, alert delivery, health endpoint response, backup creation, restore result, or rollback execution was checked.';

describe('sample report documentation', () => {
  it('projects a real validated approved run into stable presentation-only Markdown', async () => {
    const sample = await readRepositoryFile('docs/examples/sample-report.md');
    const generated = await generatePresentationSample();
    const { markdown, report, execution, plan, executionRecordPath } = generated;

    expect(await validateVerifiedReadinessReport(report, plan, execution, executionRecordPath)).toEqual({ ok: true });
    expect(validateExecutionAgainstPlan(execution, plan)).toEqual([]);
    expect(Object.keys(generated).sort()).toEqual([
      'execution',
      'executionRecordPath',
      'markdown',
      'plan',
      'report',
    ]);
    expect(execution).toMatchObject({
      planId: plan.planId,
      planFingerprint: plan.fingerprint,
      projectRoot: plan.projectRoot,
    });
    expect(report.verification).toEqual({
      planId: plan.planId,
      planFingerprint: plan.fingerprint,
      executionId: execution.executionId,
      executionRecordPath,
      observationBoundary: execution.observationBoundary,
      approvalBoundary: execution.approvalBoundary,
    });

    const mutatedPlan = structuredClone(plan);
    mutatedPlan.projectRoot = `${plan.projectRoot}-changed`;
    expect(await validateVerificationPlan(mutatedPlan)).toEqual({
      ok: false,
      errors: expect.arrayContaining(['/fingerprint must match the canonical plan payload']),
    });
    expect(await validateVerifiedReadinessReport(report, mutatedPlan, execution, executionRecordPath)).toMatchObject({
      ok: false,
    });

    expect(sample).toBe(markdown);
    expect(sample).toContain('Presentation-only sanitization');
    expect(sample).toContain(presentationPlaceholder);
    expect(sample).toContain('The placeholder was not approved');
    for (const value of [
      plan.projectRoot,
      plan.planId,
      plan.fingerprint,
      execution.executionId,
      executionRecordPath,
      report.generatedAt,
    ]) {
      expect(sample).not.toContain(value);
    }
    expect(sample).not.toContain(controlledFixtureCredential);
    for (const checkId of operationsCheckIds) expect(sample).toContain(checkId);
    expect(sample).toContain(repositoryOnlyBoundary);
    expect(sample).toContain('Stop before launch');
    expect(sample).toContain('Unverified');
    expect(sample).toContain('## Local verification');
    expect(sample).toContain('## Command approval boundary');
    expect(sample).toContain('The exact command declaration and direct launch details were checked before start.');
    expect(sample).toContain('This does not freeze imported files, dependencies, operating-system code, or changes made by other processes.');
    expect(sample).toContain('package-script:build');
    expect(sample).toContain(report.disclaimer);
    expectNoEmoji(sample, 'docs/examples/sample-report.md');
  });
});
