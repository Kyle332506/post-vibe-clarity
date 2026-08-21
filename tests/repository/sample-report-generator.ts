import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
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
import { repositoryPath } from './repository-docs.js';

const generatedAt = '2026-08-18T12:00:00.000Z';
const executionStartedAt = '2026-08-18T12:01:00.000Z';
const presentationPlaceholder = '[generated for this run]';
const presentationNote = [
  '> **Presentation-only sanitization:** This sample comes from a real approved run of the `examples/launch-candidate/before` acceptance fixture.',
  '> Absolute local paths, run timestamps and IDs, command durations, and the machine-dependent fingerprint were replaced with `[generated for this run]` only after the original plan, execution, and report passed validation.',
  '> Findings, outcomes, command results, and coverage gaps are from that run. The placeholder was not approved and is not a reusable fingerprint.',
  '> The six launch-operations findings inspect repository evidence only; no live provider, deployment, alert delivery, health endpoint response, backup creation, restore result, or rollback execution was checked.',
].join('\n');

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

export async function generatePresentationSample(): Promise<{
  markdown: string;
  plan: VerificationPlan;
  execution: VerificationExecution;
  report: VerifiedReadinessReport;
  executionRecordPath: string;
}> {
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

    return {
      markdown: renderPresentationSample(approved.report, plan, approved.execution),
      plan,
      execution: approved.execution,
      report: approved.report,
      executionRecordPath: approved.executionPath,
    };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

const entryPath = process.argv[1];
const launchedDirectly = entryPath !== undefined
  && import.meta.url === pathToFileURL(resolve(entryPath)).href;

if (launchedDirectly && process.argv.includes('--write')) {
  const { markdown } = await generatePresentationSample();
  await writeFile(repositoryPath('docs/examples/sample-report.md'), markdown, 'utf8');
}
