import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { VerificationPlan } from '../../model/verification.js';
import { containsMarkdownLineOrControl } from '../../report/markdown-safety.js';
import { validateVerificationPlan } from '../../validation/verification-plan-schema.js';
import { runApprovedVerification } from '../../verification/run-approved-verification.js';
import { STALE_PLAN_ERROR } from '../../verification/validate-plan-state.js';
import { CliSafeError, CliUsageError } from './review.js';

const invalidPlanMessage = 'Verification plan is invalid; create a new plan.';
const approvalMismatchMessage = 'Approval fingerprint does not match the verification plan.';

function parseExecuteArgs(args: string[]) {
  try {
    return parseArgs({
      args,
      allowPositionals: true,
      options: {
        approve: { type: 'string' },
        output: { type: 'string' },
        format: { type: 'string' },
      },
    });
  } catch {
    throw new CliUsageError('Invalid execute arguments.');
  }
}

async function loadPlan(path: string): Promise<VerificationPlan> {
  let input: unknown;
  try {
    input = JSON.parse(await readFile(path, 'utf8')) as unknown;
  } catch {
    throw new CliSafeError(invalidPlanMessage);
  }
  let validation;
  try {
    validation = await validateVerificationPlan(input);
  } catch {
    throw new CliSafeError(invalidPlanMessage);
  }
  if (!validation.ok) throw new CliSafeError(invalidPlanMessage);
  return input as VerificationPlan;
}

export async function runExecuteCommand(args: string[], signal: AbortSignal): Promise<void> {
  const { values, positionals } = parseExecuteArgs(args);
  if (positionals.length !== 1) throw new CliUsageError('Expected exactly one plan file.');
  if (values.approve === undefined) throw new CliUsageError('Expected --approve <fingerprint>.');
  if (values.output === undefined) throw new CliUsageError('Expected --output <directory>.');
  const format = values.format ?? 'markdown';
  if (format !== 'markdown' && format !== 'json') {
    throw new CliUsageError('Expected --format markdown or --format json.');
  }
  const planArtifactPath = resolve(positionals[0]!);
  const outputDirectory = resolve(values.output);
  if ([planArtifactPath, outputDirectory].some(containsMarkdownLineOrControl)) {
    throw new CliUsageError('Artifact paths must not contain line or control characters.');
  }

  const plan = await loadPlan(planArtifactPath);
  let result;
  try {
    result = await runApprovedVerification({
      plan,
      approvedFingerprint: values.approve,
      planArtifactPath,
      outputDirectory,
      format,
      signal,
    });
  } catch (error) {
    if (error instanceof Error && (error.message === approvalMismatchMessage || error.message === STALE_PLAN_ERROR)) {
      throw new CliSafeError(error.message);
    }
    throw error;
  }

  const passed = result.execution.results.filter(({ status }) => status === 'passed').length;
  const failed = result.execution.results.filter(({ status }) => status === 'failed').length;
  const unverified = result.execution.results.length - passed - failed;
  process.stdout.write([
    `Execution record: ${result.executionPath}`,
    `Report: ${result.reportPath}`,
    `Status: ${result.execution.status} (passed: ${passed}, failed: ${failed}, unverified: ${unverified}).`,
    '',
  ].join('\n'));
}
