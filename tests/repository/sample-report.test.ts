import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { VerificationExecution } from '../../src/model/verification.js';
import { buildVerifiedReport } from '../../src/report/build-verified-report.js';
import { renderVerifiedMarkdown } from '../../src/report/render-verified-markdown.js';
import { validateVerifiedReadinessReport } from '../../src/validation/report-v02-schema.js';
import { buildVerificationPlan } from '../../src/verification/build-verification-plan.js';
import { fingerprintPlan } from '../../src/verification/plan-fingerprint.js';
import { runApprovedVerification } from '../../src/verification/run-approved-verification.js';
import { expectNoEmoji, readRepositoryFile, repositoryPath } from './repository-docs.js';

const generatedAt = '2026-08-18T12:00:00.000Z';
const executionStartedAt = '2026-08-18T12:01:00.000Z';
const executionCompletedAt = '2026-08-18T12:02:00.000Z';
const sampleProjectRoot = '/example/launch-candidate/before';
const sampleSkillsRoot = '/example/skills';
const sampleExecutionPath = '.postvibe/pve-20260818120100000.execution.json';
const controlledFixtureCredential = 'fixture-example-token-never-use';

async function generateSampleReport(): Promise<{
  markdown: string;
  report: Awaited<ReturnType<typeof buildVerifiedReport>>;
  execution: VerificationExecution;
  plan: Awaited<ReturnType<typeof buildVerificationPlan>>;
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

    plan.projectRoot = sampleProjectRoot;
    plan.skillsRoot = sampleSkillsRoot;
    plan.planningReport.manifest.projectRoot = sampleProjectRoot;
    plan.fingerprint = fingerprintPlan(plan);
    plan.planId = `pvp-${plan.fingerprint.slice(0, 16)}`;

    const execution = structuredClone(approved.execution);
    execution.planId = plan.planId;
    execution.planFingerprint = plan.fingerprint;
    execution.projectRoot = plan.projectRoot;
    execution.startedAt = executionStartedAt;
    execution.completedAt = executionCompletedAt;
    execution.results = execution.results.map(({ startedAt: _startedAt, durationMs: _durationMs, ...result }) => result);

    const report = await buildVerifiedReport(plan.planningReport, plan, execution, sampleExecutionPath);
    return { markdown: renderVerifiedMarkdown(report), report, execution, plan };
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

describe('sample report documentation', () => {
  it('is exactly the current verified renderer output from the before acceptance fixture', async () => {
    const sample = await readRepositoryFile('docs/examples/sample-report.md');
    const { markdown, report, execution, plan } = await generateSampleReport();

    expect(await validateVerifiedReadinessReport(report, plan, execution, sampleExecutionPath)).toEqual({ ok: true });
    expect(sample).toBe(markdown);
    expect(sample).not.toContain(controlledFixtureCredential);
    expect(sample).toContain('Stop before launch');
    expect(sample).toContain('Unverified');
    expect(sample).toContain('## Local verification');
    expect(sample).toContain('package-script:build');
    expect(sample).toContain(report.disclaimer);
    expectNoEmoji(sample, 'docs/examples/sample-report.md');
  });
});
