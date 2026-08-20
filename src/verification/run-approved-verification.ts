import { timingSafeEqual } from 'node:crypto';
import { lstat, mkdir, mkdtemp, readFile, realpath, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import {
  ArtifactFileCollisionError,
  ArtifactFileOwnershipError,
  acquireOwnedFileExclusively,
  artifactTemporaryPath,
  closeOwnedFilePreservingEntry,
  publishOwnedArtifactSetExclusively,
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
import { compareOrdinal } from '../ordinal.js';
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
import {
  commandLauncherMatchesApproval,
  commandSourceMatchesApproval,
} from './command-source-state.js';
import { canonicalJson } from './plan-fingerprint.js';
import {
  assertProjectRootIdentity,
  buildObservationBoundary,
  captureProjectRootIdentity,
} from './project-observation.js';
import { validatePlanState } from './validate-plan-state.js';
import { recordCommandExecution } from './command-result-contract.js';
import { ORCHESTRATION_COVERAGE_GAP } from './contract-constants.js';

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

interface PartialPublicationResult {
  executionPath: string;
  retainedRecoveryDirectory: boolean;
}

export class VerificationPostProcessingError extends Error {
  readonly execution: VerificationExecution;
  readonly executionPath: string;

  constructor(execution: VerificationExecution, executionPath: string) {
    super(`Mandatory post-command processing did not complete. Partial execution evidence was published at: ${executionPath}`);
    this.name = 'VerificationPostProcessingError';
    this.execution = execution;
    this.executionPath = executionPath;
  }
}

const approvalError = 'Approval fingerprint does not match the verification plan.';
const invalidPlanError = 'Verification plan failed versioned runtime validation.';
const invalidExecutionError = 'Verification execution failed versioned runtime validation.';
const interruptedReason = 'Command was not run because verification was interrupted.';
const currentExecutorFailureReason = 'Command outcome is unavailable because the executor failed after the command may have started; the command may have run.';
const remainingExecutorFailureReason = 'Command was not run because verification stopped after an unexpected executor failure.';
const currentInterruptedReason = 'Command outcome is unavailable because verification was interrupted after the command may have started; the command may have run.';
const mismatchedResultReason = 'Command outcome is unavailable because the executor returned evidence for a different command; the command may have run.';
const changedSourceReason = 'Command was not run because its approved source declaration changed after planning.';
const changedLauncherReason = 'Command was not run because its approved launcher evidence changed after planning.';
const invalidExecutorResultReason = 'Command outcome is unavailable because the executor returned contradictory evidence after the command may have started; the command may have run.';
const postProcessingResultReason = 'Command was not run because mandatory post-command processing could not complete.';

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

async function stageOwnedArtifact(file: OwnedFile, contents: string): Promise<void> {
  await file.handle.truncate(0);
  await file.handle.writeFile(contents, 'utf8');
  await file.handle.sync();
}

async function validateExecutionArtifact(
  execution: VerificationExecution,
  plan: VerificationPlan,
): Promise<void> {
  const executionValidation = await validateVerificationExecution(execution);
  if (!executionValidation.ok) throw invalidArtifact(invalidExecutionError, executionValidation.errors);
  const linkageErrors = validateExecutionAgainstPlan(execution, plan);
  if (linkageErrors.length > 0) {
    throw invalidArtifact('Verification execution linkage is invalid', linkageErrors);
  }
}

async function publishPartialExecution(
  partialContents: string,
  executionPath: string,
  recoveryExecutionPath: string,
  outputBoundaryStable: boolean,
): Promise<PartialPublicationResult> {
  if (outputBoundaryStable) {
    try {
      await writeArtifactExclusively(executionPath, partialContents);
      return { executionPath, retainedRecoveryDirectory: false };
    } catch (error) {
      if (!(error instanceof ArtifactFileCollisionError)
        && !(error instanceof ArtifactFileOwnershipError)) throw error;
    }
  }

  await writeArtifactExclusively(recoveryExecutionPath, partialContents);
  return { executionPath: recoveryExecutionPath, retainedRecoveryDirectory: true };
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
  let executionStagingFile: OwnedFile | undefined;
  let reportStagingFile: OwnedFile | undefined;
  let retainRecoveryDirectory = false;

  await mkdir(outputDirectory, { recursive: true });
  for (const path of [executionPath, reportPath, lockPath, ...temporaryPaths]) {
    await requireAvailable(path);
  }
  const recoveryDirectory = await mkdtemp(join(tmpdir(), 'postvibe-partial-'));
  const recoveryExecutionPath = join(recoveryDirectory, basename(executionPath));
  const recoveryTemporaryPath = artifactTemporaryPath(recoveryExecutionPath);
  if ([recoveryDirectory, recoveryExecutionPath, recoveryTemporaryPath].some(containsMarkdownLineOrControl)) {
    await rmdir(recoveryDirectory).catch(() => undefined);
    throw new Error('Artifact paths must not contain line or control characters.');
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

    const excludedArtifactPaths = [
      planArtifactPath,
      executionPath,
      reportPath,
      lockPath,
      ...temporaryPaths,
      recoveryExecutionPath,
      recoveryTemporaryPath,
    ];
    const rootIdentity = await captureProjectRootIdentity(options.plan.projectRoot);
    const outputIdentity = await captureProjectRootIdentity(outputDirectory);
    const observationBoundary = buildObservationBoundary(rootIdentity, excludedArtifactPaths);
    executionStagingFile = await acquireOwnedFileExclusively(temporaryPaths[0]!);
    reportStagingFile = await acquireOwnedFileExclusively(temporaryPaths[1]!);
    const executor = options.executor ?? new LocalCommandExecutor();
    const results: VerificationCommandResult[] = [];
    const removedEnvironmentVariables = new Set<string>();
    let partial = false;
    let publicationAttempted = false;
    try {
      for (let index = 0; index < options.plan.commands.length; index += 1) {
        const command = options.plan.commands[index]!;
        try {
          await assertProjectRootIdentity(options.plan.projectRoot, rootIdentity);
        } catch {
          partial = true;
          results.push(...options.plan.commands.slice(index).map((remaining) => (
            unverifiedResult(remaining, 'Command was not run because the approved project root identity changed.')
          )));
          break;
        }
        if (options.signal.aborted) {
          partial = true;
          results.push(...options.plan.commands.slice(index).map((remaining) => (
            unverifiedResult(remaining, interruptedReason)
          )));
          break;
        }

        if (!await commandSourceMatchesApproval(options.plan.projectRoot, command)) {
          partial = true;
          results.push(unverifiedResult(command, changedSourceReason));
          continue;
        }
        if (!await commandLauncherMatchesApproval(options.plan.projectRoot, command)) {
          partial = true;
          results.push(unverifiedResult(command, changedLauncherReason));
          continue;
        }

        try {
          const commandExecution = await executor.execute(command, {
            root: options.plan.projectRoot,
            signal: options.signal,
            inheritedEnvironment: process.env,
            excludedArtifactPaths,
            rootIdentity,
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
          const recorded = recordCommandExecution(command, commandExecution);
          if (recorded === undefined) {
            partial = true;
            results.push(unverifiedResult(command, invalidExecutorResultReason));
            results.push(...options.plan.commands.slice(index + 1).map((remaining) => (
              unverifiedResult(remaining, remainingExecutorFailureReason)
            )));
            break;
          }
          results.push(recorded.result);
          for (const name of recorded.removedEnvironmentVariables) {
            removedEnvironmentVariables.add(name);
          }
          if (recorded.result.status === 'unverified') partial = true;
          if (recorded.result.status === 'interrupted') {
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
        removedEnvironmentVariables: [...removedEnvironmentVariables].sort(compareOrdinal),
        results,
        coverageGaps: structuredClone(options.plan.coverageGaps),
        observationBoundary,
        approvalBoundary: structuredClone(options.plan.approvalBoundary),
        containmentWarning: options.plan.containmentWarning,
        disclaimer: options.plan.disclaimer,
      };
      await validateExecutionArtifact(execution, options.plan);
      await stageOwnedArtifact(executionStagingFile, `${JSON.stringify(execution, null, 2)}\n`);

      await assertProjectRootIdentity(options.plan.projectRoot, rootIdentity);
      await assertProjectRootIdentity(outputDirectory, outputIdentity);
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
      await stageOwnedArtifact(reportStagingFile, renderedReport);
      await assertProjectRootIdentity(options.plan.projectRoot, rootIdentity);
      await assertProjectRootIdentity(outputDirectory, outputIdentity);
      publicationAttempted = true;
      await publishOwnedArtifactSetExclusively([
        { file: executionStagingFile, path: executionPath },
        { file: reportStagingFile, path: reportPath },
      ]);
      executionStagingFile = undefined;
      reportStagingFile = undefined;

      return { execution, report, executionPath, reportPath };
    } catch {
      results.push(...options.plan.commands.slice(results.length).map((command) => (
        unverifiedResult(command, postProcessingResultReason)
      )));
      const partialExecution: VerificationExecution = {
        schemaId: 'postvibe-verification-execution/0.1',
        schemaVersion: '0.1',
        executionId,
        status: 'partial',
        planId: options.plan.planId,
        planFingerprint: options.plan.fingerprint,
        toolkitVersion: options.plan.toolkitVersion,
        projectRoot: options.plan.projectRoot,
        startedAt,
        completedAt: now(),
        removedEnvironmentVariables: [...removedEnvironmentVariables].sort(compareOrdinal),
        results,
        coverageGaps: [...structuredClone(options.plan.coverageGaps), structuredClone(ORCHESTRATION_COVERAGE_GAP)],
        observationBoundary,
        approvalBoundary: structuredClone(options.plan.approvalBoundary),
        containmentWarning: options.plan.containmentWarning,
        disclaimer: options.plan.disclaimer,
      };
      await validateExecutionArtifact(partialExecution, options.plan);
      const partialContents = `${JSON.stringify(partialExecution, null, 2)}\n`;
      if (!publicationAttempted) {
        if (executionStagingFile !== undefined) {
          await stageOwnedArtifact(executionStagingFile, partialContents);
        }
        if (reportStagingFile !== undefined) await stageOwnedArtifact(reportStagingFile, '');
      }
      let outputBoundaryStable = true;
      try {
        await assertProjectRootIdentity(outputDirectory, outputIdentity);
      } catch {
        outputBoundaryStable = false;
      }
      if (outputBoundaryStable) {
        if (executionStagingFile !== undefined) await releaseOwnedFile(executionStagingFile);
        executionStagingFile = undefined;
        if (reportStagingFile !== undefined) await releaseOwnedFile(reportStagingFile);
        reportStagingFile = undefined;
      } else {
        if (executionStagingFile !== undefined) {
          await closeOwnedFilePreservingEntry(executionStagingFile);
          executionStagingFile = undefined;
        }
        if (reportStagingFile !== undefined) {
          await closeOwnedFilePreservingEntry(reportStagingFile);
          reportStagingFile = undefined;
        }
        if (lockFile !== undefined) {
          await closeOwnedFilePreservingEntry(lockFile);
          lockFile = undefined;
        }
      }
      const published = await publishPartialExecution(
        partialContents,
        executionPath,
        recoveryExecutionPath,
        outputBoundaryStable,
      );
      retainRecoveryDirectory = published.retainedRecoveryDirectory;
      throw new VerificationPostProcessingError(partialExecution, published.executionPath);
    }
  } finally {
    try {
      if (executionStagingFile !== undefined) await releaseOwnedFile(executionStagingFile);
    } finally {
      try {
        if (reportStagingFile !== undefined) await releaseOwnedFile(reportStagingFile);
      } finally {
        try {
          if (lockFile !== undefined) await releaseOwnedFile(lockFile);
        } finally {
          if (!retainRecoveryDirectory) await rmdir(recoveryDirectory).catch(() => undefined);
        }
      }
    }
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
