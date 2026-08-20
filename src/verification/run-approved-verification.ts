import { timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, readFile, realpath } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import {
  ArtifactFileCollisionError,
  acquireOwnedFileExclusively,
  artifactTemporaryPath,
  releaseOwnedFile,
  writeArtifactExclusively,
} from '../cli/artifact-output.js';
import type { OwnedFile } from '../cli/artifact-output.js';
import type { VerifiedReadinessReport } from '../model/verified-report.js';
import type {
  VerificationCommand,
  VerificationCommandResult,
  VerificationExecution,
  VerificationPlan,
} from '../model/verification.js';
import { runReview } from '../orchestrator/run-review.js';
import { buildVerifiedReport } from '../report/build-verified-report.js';
import { containsMarkdownLineOrControl } from '../report/markdown-safety.js';
import { renderVerifiedMarkdown } from '../report/render-verified-markdown.js';
import { validateVerifiedReadinessReport } from '../validation/report-v02-schema.js';
import {
  validateExecutionAgainstPlan,
  validateVerificationExecution,
} from '../validation/verification-execution-schema.js';
import { validateVerificationPlan } from '../validation/verification-plan-schema.js';
import { LocalCommandExecutor } from './local-command-executor.js';
import type { CommandExecutor } from './local-command-executor.js';
import { canonicalJson } from './plan-fingerprint.js';
import { validatePlanState } from './validate-plan-state.js';

export interface RunApprovedVerificationOptions {
  plan: VerificationPlan;
  approvedFingerprint: string;
  planArtifactPath: string;
  outputDirectory: string;
  format: 'markdown' | 'json';
  signal: AbortSignal;
  executor?: CommandExecutor;
  now?: () => string;
}

export interface ApprovedVerificationResult {
  execution: VerificationExecution;
  report: VerifiedReadinessReport;
  executionPath: string;
  reportPath: string;
}

const approvalError = 'Approval fingerprint does not match the verification plan.';
const invalidPlanError = 'Verification plan failed versioned runtime validation.';
const invalidExecutionError = 'Verification execution failed versioned runtime validation.';
const interruptedReason = 'Command was not run because verification was interrupted.';
const currentExecutorFailureReason = 'Command outcome is unavailable because the executor failed after the command may have started; the command may have run.';
const remainingExecutorFailureReason = 'Command was not run because verification stopped after an unexpected executor failure.';
const currentInterruptedReason = 'Command outcome is unavailable because verification was interrupted after the command may have started; the command may have run.';
const mismatchedResultReason = 'Command outcome is unavailable because the executor returned evidence for a different command; the command may have run.';

function constantTimeTextEqual(left: unknown, right: unknown): boolean {
  const leftIsString = typeof left === 'string';
  const rightIsString = typeof right === 'string';
  const leftBytes = Buffer.from(leftIsString ? left : '', 'utf8');
  const rightBytes = Buffer.from(rightIsString ? right : '', 'utf8');
  const width = Math.max(leftBytes.length, rightBytes.length, 1);
  const paddedLeft = Buffer.alloc(width);
  const paddedRight = Buffer.alloc(width);
  leftBytes.copy(paddedLeft);
  rightBytes.copy(paddedRight);
  const equalBytes = timingSafeEqual(paddedLeft, paddedRight);
  return leftIsString
    && rightIsString
    && leftBytes.length === rightBytes.length
    && equalBytes;
}

function unverifiedResult(command: VerificationCommand, reason: string): VerificationCommandResult {
  return {
    commandId: command.id,
    status: 'unverified',
    exitCode: null,
    signal: null,
    output: '',
    outputTruncated: false,
    fileChanges: [],
    unverifiedReason: reason,
  };
}

function invalidArtifact(label: string, errors: string[]): Error {
  return new Error(`${label}: ${errors.join('; ')}`);
}

async function requireAvailable(path: string): Promise<void> {
  try {
    await lstat(path);
    throw new ArtifactFileCollisionError(`Artifact file already exists; no file was overwritten: ${path}`);
  } catch (error) {
    if (isMissingPathError(error)) return;
    throw error;
  }
}

function isMissingPathError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}

function renderJson(report: VerifiedReadinessReport): string {
  return `${JSON.stringify(report, null, 2)}\n`;
}

async function requireMatchingPlanArtifact(plan: VerificationPlan, path: string): Promise<void> {
  try {
    const artifact = JSON.parse(await readFile(path, 'utf8')) as unknown;
    if (canonicalJson(artifact) === canonicalJson(plan)) return;
  } catch {
    // The stable error below intentionally omits artifact-controlled details.
  }
  throw new Error('Verification plan artifact does not match the supplied verification plan.');
}

export async function runApprovedVerification(
  options: RunApprovedVerificationOptions,
): Promise<ApprovedVerificationResult> {
  const now = options.now ?? (() => new Date().toISOString());

  if (!constantTimeTextEqual(options.approvedFingerprint, options.plan.fingerprint)) {
    throw new Error(approvalError);
  }

  const planValidation = await validateVerificationPlan(options.plan);
  if (!planValidation.ok) throw invalidArtifact(invalidPlanError, planValidation.errors);

  const planArtifactPath = await realpath(options.planArtifactPath);
  await requireMatchingPlanArtifact(options.plan, planArtifactPath);
  await validatePlanState(options.plan, { planArtifactPath });

  const startedAt = now();
  const executionId = `pve-${startedAt.replace(/\D/g, '')}`;
  const outputDirectory = resolve(options.outputDirectory);
  const executionPath = join(outputDirectory, `${executionId}.execution.json`);
  const reportExtension = options.format === 'markdown' ? 'md' : 'json';
  const reportPath = join(outputDirectory, `${executionId}.report.${reportExtension}`);
  const lockPath = join(outputDirectory, `${executionId}.lock`);
  const temporaryPaths = [artifactTemporaryPath(executionPath), artifactTemporaryPath(reportPath)];
  if ([executionPath, reportPath, lockPath, ...temporaryPaths].some(containsMarkdownLineOrControl)) {
    throw new Error('Artifact paths must not contain line or control characters.');
  }
  let lockFile: OwnedFile | undefined;

  await mkdir(outputDirectory, { recursive: true });
  for (const path of [executionPath, reportPath, lockPath, ...temporaryPaths]) {
    await requireAvailable(path);
  }

  try {
    try {
      lockFile = await acquireOwnedFileExclusively(lockPath);
      await lockFile.handle.writeFile(`${executionId}\n`, 'utf8');
      await lockFile.handle.sync();
    } catch (error) {
      if (lockFile !== undefined) await releaseOwnedFile(lockFile);
      if (isAlreadyExistsError(error)) {
        throw new ArtifactFileCollisionError(`Artifact file already exists; no file was overwritten: ${lockPath}`);
      }
      throw error;
    }

    const executor = options.executor ?? new LocalCommandExecutor();
    const results: VerificationCommandResult[] = [];
    const removedEnvironmentVariables = new Set<string>();
    const excludedArtifactPaths = [
      planArtifactPath,
      executionPath,
      reportPath,
      lockPath,
      ...temporaryPaths,
    ];
    let partial = false;

    for (let index = 0; index < options.plan.commands.length; index += 1) {
      const command = options.plan.commands[index]!;
      if (options.signal.aborted) {
        partial = true;
        results.push(...options.plan.commands.slice(index).map((remaining) => (
          unverifiedResult(remaining, interruptedReason)
        )));
        break;
      }

      try {
        const commandExecution = await executor.execute(command, {
          root: options.plan.projectRoot,
          signal: options.signal,
          inheritedEnvironment: process.env,
          excludedArtifactPaths,
          now,
        });
        if (commandExecution.result.commandId !== command.id) {
          partial = true;
          results.push(unverifiedResult(command, mismatchedResultReason));
          results.push(...options.plan.commands.slice(index + 1).map((remaining) => (
            unverifiedResult(remaining, remainingExecutorFailureReason)
          )));
          break;
        }
        results.push(commandExecution.result);
        for (const name of commandExecution.removedEnvironmentVariables) {
          removedEnvironmentVariables.add(name);
        }
        if (commandExecution.result.status === 'unverified') partial = true;
        if (commandExecution.result.status === 'interrupted') {
          partial = true;
          results.push(...options.plan.commands.slice(index + 1).map((remaining) => (
            unverifiedResult(remaining, interruptedReason)
          )));
          break;
        }
      } catch {
        partial = true;
        results.push(unverifiedResult(
          command,
          options.signal.aborted ? currentInterruptedReason : currentExecutorFailureReason,
        ));
        results.push(...options.plan.commands.slice(index + 1).map((remaining) => (
          unverifiedResult(remaining, options.signal.aborted ? interruptedReason : remainingExecutorFailureReason)
        )));
        break;
      }
    }

    const execution: VerificationExecution = {
      schemaId: 'postvibe-verification-execution/0.1',
      schemaVersion: '0.1',
      executionId,
      status: partial ? 'partial' : 'completed',
      planId: options.plan.planId,
      planFingerprint: options.plan.fingerprint,
      toolkitVersion: options.plan.toolkitVersion,
      projectRoot: options.plan.projectRoot,
      startedAt,
      completedAt: now(),
      removedEnvironmentVariables: [...removedEnvironmentVariables].sort((left, right) => left.localeCompare(right)),
      results,
      coverageGaps: structuredClone(options.plan.coverageGaps),
      containmentWarning: options.plan.containmentWarning,
      disclaimer: options.plan.disclaimer,
    };
    const executionValidation = await validateVerificationExecution(execution);
    if (!executionValidation.ok) throw invalidArtifact(invalidExecutionError, executionValidation.errors);
    const linkageErrors = validateExecutionAgainstPlan(execution, options.plan);
    if (linkageErrors.length > 0) throw invalidArtifact('Verification execution linkage is invalid', linkageErrors);

    await writeArtifactExclusively(executionPath, `${JSON.stringify(execution, null, 2)}\n`);

    const freshReview = await runReview({
      root: options.plan.projectRoot,
      skillsRoot: options.plan.skillsRoot,
      now,
      excludedArtifactPaths,
    });
    const report = await buildVerifiedReport(freshReview, options.plan, execution, executionPath);
    const reportValidation = await validateVerifiedReadinessReport(
      report,
      options.plan,
      execution,
      executionPath,
    );
    if (!reportValidation.ok) {
      throw invalidArtifact('Verified readiness report failed versioned runtime validation', reportValidation.errors);
    }
    const renderedReport = options.format === 'markdown'
      ? renderVerifiedMarkdown(report)
      : renderJson(report);
    await writeArtifactExclusively(reportPath, renderedReport);

    return { execution, report, executionPath, reportPath };
  } finally {
    if (lockFile !== undefined) await releaseOwnedFile(lockFile);
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
