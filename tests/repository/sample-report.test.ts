import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VerifiedReadinessReport } from '../../src/model/verified-report.js';
import type { VerificationExecution, VerificationPlan } from '../../src/model/verification.js';
import { renderVerifiedMarkdown } from '../../src/report/render-verified-markdown.js';
import { validateVerifiedReadinessReport } from '../../src/validation/report-v02-schema.js';
import {
  validateExecutionAgainstPlan,
  validateVerificationExecution,
} from '../../src/validation/verification-execution-schema.js';
import { validateVerificationPlan } from '../../src/validation/verification-plan-schema.js';
import { buildVerificationPlan } from '../../src/verification/build-verification-plan.js';
import { runApprovedVerification } from '../../src/verification/run-approved-verification.js';
import { expectNoEmoji, readRepositoryFile, repositoryPath } from './repository-docs.js';

const generatedAt = '2026-08-18T12:00:00.000Z';
const executionStartedAt = '2026-08-18T12:01:00.000Z';
const presentationPlaceholder = '[generated for this run]';
const controlledFixtureCredential = 'fixture-example-token-never-use';
const presentationNote = [
  '> **Presentation-only sanitization:** This sample comes from a real approved run of the `examples/launch-candidate/before` acceptance fixture.',
  '> Absolute local paths, run timestamps and IDs, command durations, and the machine-dependent fingerprint were replaced with `[generated for this run]` only after the original plan, execution, and report passed validation.',
  '> Findings, outcomes, command results, and coverage gaps are from that run. The placeholder was not approved and is not a reusable fingerprint.',
].join('\n');

interface GeneratedSample {
  markdown: string;
  plan: VerificationPlan;
  execution: VerificationExecution;
  report: VerifiedReadinessReport;
  executionRecordPath: string;
  snapshots: {
    plan: VerificationPlan;
    execution: VerificationExecution;
    report: VerifiedReadinessReport;
  };
}

function replaceRequired(source: string, value: string, label: string): string {
  if (!source.includes(value)) throw new Error(`Rendered sample does not contain ${label}.`);
  return source.replaceAll(value, presentationPlaceholder);
}

function renderPresentationSample(
  report: VerifiedReadinessReport,
  plan: VerificationPlan,
  execution: VerificationExecution,
): string {
  const presentationReport = structuredClone(report);
  presentationReport.verification.observationBoundary.rootIdentity = {
    realPath: presentationPlaceholder,
    device: presentationPlaceholder,
    inode: presentationPlaceholder,
  };
  presentationReport.verification.observationBoundary.exactArtifactExclusions = (
    presentationReport.verification.observationBoundary.exactArtifactExclusions.map(() => presentationPlaceholder)
  );
  let markdown = renderVerifiedMarkdown(presentationReport);
  markdown = replaceRequired(markdown, report.verification.executionRecordPath, 'the execution-record path');
  markdown = replaceRequired(markdown, plan.projectRoot, 'the project root');
  markdown = replaceRequired(markdown, report.generatedAt, 'the generated timestamp');
  markdown = replaceRequired(markdown, plan.planId, 'the plan ID');
  markdown = replaceRequired(markdown, plan.fingerprint, 'the plan fingerprint');
  markdown = replaceRequired(markdown, execution.executionId, 'the execution ID');
  markdown = markdown.replace(/duration: \d+(?:\.\d+)? ms\./g, `duration: ${presentationPlaceholder}.`);
  return `${presentationNote}\n\n${markdown}`;
}

async function generateSampleReport(): Promise<GeneratedSample> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-sample-report-'));
  const fixtureRoot = join(temporaryRoot, 'project');
  const planOutput = join(temporaryRoot, 'verification-plan.json');
  const outputDirectory = join(temporaryRoot, '.postvibe');
  try {
    await cp(repositoryPath('examples/launch-candidate/before'), fixtureRoot, { recursive: true });
    const plan = await buildVerificationPlan({
      root: fixtureRoot,
      skillsRoot: repositoryPath('skills'),
      excludedCommandIds: new Set(),
      outputPath: planOutput,
      now: () => generatedAt,
    });
    await writeFile(planOutput, `${JSON.stringify(plan, null, 2)}\n`, 'utf8');
    const approved = await runApprovedVerification({
      plan,
      approvedFingerprint: plan.fingerprint,
      planArtifactPath: planOutput,
      outputDirectory,
      format: 'json',
      signal: new AbortController().signal,
      now: () => executionStartedAt,
    });

    const [planValidation, executionValidation, reportValidation] = await Promise.all([
      validateVerificationPlan(plan),
      validateVerificationExecution(approved.execution),
      validateVerifiedReadinessReport(approved.report, plan, approved.execution, approved.executionPath),
    ]);
    if (!planValidation.ok || !executionValidation.ok || !reportValidation.ok) {
      throw new Error('The real sample artifacts did not pass validation before presentation rendering.');
    }
    if (validateExecutionAgainstPlan(approved.execution, plan).length > 0) {
      throw new Error('The real sample execution did not remain linked to its approved plan.');
    }

    const snapshots = {
      plan: structuredClone(plan),
      execution: structuredClone(approved.execution),
      report: structuredClone(approved.report),
    };
    const markdown = renderPresentationSample(approved.report, plan, approved.execution);
    return {
      markdown,
      plan,
      execution: approved.execution,
      report: approved.report,
      executionRecordPath: approved.executionPath,
      snapshots,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

describe('sample report documentation', () => {
  it('projects a real immutable approved run into stable presentation-only Markdown', async () => {
    const sample = await readRepositoryFile('docs/examples/sample-report.md');
    const { markdown, report, execution, plan, executionRecordPath, snapshots } = await generateSampleReport();

    expect(await validateVerifiedReadinessReport(report, plan, execution, executionRecordPath)).toEqual({ ok: true });
    expect(validateExecutionAgainstPlan(execution, plan)).toEqual([]);
    expect(plan).toEqual(snapshots.plan);
    expect(execution).toEqual(snapshots.execution);
    expect(report).toEqual(snapshots.report);
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
    expect(sample).toContain('Stop before launch');
    expect(sample).toContain('Unverified');
    expect(sample).toContain('## Local verification');
    expect(sample).toContain('package-script:build');
    expect(sample).toContain(report.disclaimer);
    expectNoEmoji(sample, 'docs/examples/sample-report.md');
  });
});
