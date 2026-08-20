import { performance } from 'node:perf_hooks';
import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import type {
  CommandResultStatus,
  ProjectRootIdentity,
  VerificationCommand,
  VerificationCommandResult,
} from '../model/verification.js';
import { filterExecutionEnvironment } from './environment-policy.js';
import { terminateProcessTree } from './process-tree.js';
import type { ProcessTreeTermination } from './process-tree.js';
import { resolveInsideProject } from './project-path.js';
import {
  COMMAND_OUTPUT_LIMIT_BYTES,
  createCommandOutputCollector,
} from './redact-command-output.js';
import type {
  CollectedCommandOutput,
  CommandOutputCollector,
} from './redact-command-output.js';
import { diffWorkingTrees, snapshotWorkingTree } from './working-tree.js';

const closeAfterCleanupTimeoutMs = 500;
const stderrOutputSeparator = '\n[stderr]\n';
const streamOutputBudgetBytes = COMMAND_OUTPUT_LIMIT_BYTES
  - Buffer.byteLength(stderrOutputSeparator, 'utf8');
const stdoutOutputLimitBytes = Math.floor(streamOutputBudgetBytes / 2);
const stderrOutputLimitBytes = streamOutputBudgetBytes - stdoutOutputLimitBytes;

export interface ExecuteCommandContext {
  root: string;
  signal: AbortSignal;
  inheritedEnvironment: NodeJS.ProcessEnv;
  excludedArtifactPaths: string[];
  rootIdentity: ProjectRootIdentity;
  now: () => string;
}

export interface CommandExecutionResult {
  result: VerificationCommandResult;
  removedEnvironmentVariables: string[];
}

export interface CommandExecutor {
  execute(
    command: VerificationCommand,
    context: ExecuteCommandContext,
  ): Promise<CommandExecutionResult>;
}

interface NaturalOutcome {
  kind: 'close' | 'error';
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

interface ForcedOutcome {
  kind: 'timed-out' | 'interrupted';
  cleanup: Promise<ProcessTreeTermination>;
}

function wait(milliseconds: number): Promise<'elapsed'> {
  return new Promise((resolve) => setTimeout(() => resolve('elapsed'), milliseconds));
}

function safeSpawnErrorReason(error: Error | undefined): string {
  const code = (error as NodeJS.ErrnoException | undefined)?.code;
  const safeCode = typeof code === 'string' && /^[A-Z0-9_]+$/u.test(code) ? code : 'UNKNOWN';
  return `Command could not be started (${safeCode}).`;
}

function cleanupEvidence(
  outcome: ForcedOutcome['kind'],
  timeoutSeconds: number,
  cleanup: ProcessTreeTermination,
): string {
  const cause = outcome === 'timed-out'
    ? `Command timed out after ${timeoutSeconds} ${timeoutSeconds === 1 ? 'second' : 'seconds'}.`
    : 'Command execution was interrupted.';
  const boundary = cleanup.terminationBoundary === 'windows-taskkill-tree'
    ? 'Windows taskkill tree boundary'
    : 'Unix process group boundary';
  return cleanup.verified
    ? `${cause} Process tree termination was confirmed at the ${boundary}.`
    : `${cause} Process tree cleanup could not be verified at the ${boundary}: ${cleanup.limitation ?? 'No cleanup confirmation was available.'}`;
}

function addOptionalReason(
  result: VerificationCommandResult,
  unverifiedReason: string | undefined,
): VerificationCommandResult {
  return unverifiedReason === undefined ? result : { ...result, unverifiedReason };
}

async function waitForCloseAfterCleanup(
  naturalOutcome: Promise<NaturalOutcome>,
): Promise<NaturalOutcome | undefined> {
  const result = await Promise.race([naturalOutcome, wait(closeAfterCleanupTimeoutMs)]);
  return result === 'elapsed' ? undefined : result;
}

function removeOutputListeners(
  child: ChildProcess,
  stdoutListener: (chunk: Buffer) => void,
  stderrListener: (chunk: Buffer) => void,
): void {
  child.stdout?.off('data', stdoutListener);
  child.stderr?.off('data', stderrListener);
}

function finishCommandOutput(
  stdoutCollector: CommandOutputCollector,
  stderrCollector: CommandOutputCollector,
): CollectedCommandOutput {
  const stdout = stdoutCollector.finish();
  const stderr = stderrCollector.finish();
  let output: string;
  if (stdout.output.length === 0) output = stderr.output;
  else if (stderr.output.length === 0) output = stdout.output;
  else output = `${stdout.output}${stderrOutputSeparator}${stderr.output}`;
  return {
    output,
    truncated: stdout.truncated || stderr.truncated,
  };
}

export class LocalCommandExecutor implements CommandExecutor {
  async execute(
    command: VerificationCommand,
    context: ExecuteCommandContext,
  ): Promise<CommandExecutionResult> {
    const startedAt = context.now();
    const monotonicStart = performance.now();
    const filteredEnvironment = filterExecutionEnvironment(context.inheritedEnvironment);
    const before = await snapshotWorkingTree(context.root, context.excludedArtifactPaths, context.rootIdentity);
    const executable = command.argv[0];
    if (executable === undefined) throw new Error('Approved command argv must contain an executable.');
    const interruptedBeforeStart = async (): Promise<CommandExecutionResult> => {
      const after = await snapshotWorkingTree(context.root, context.excludedArtifactPaths, context.rootIdentity);
      return {
        removedEnvironmentVariables: filteredEnvironment.removedNames,
        result: {
          commandId: command.id,
          status: 'interrupted',
          startedAt,
          durationMs: Math.max(0, Math.round(performance.now() - monotonicStart)),
          exitCode: null,
          signal: null,
          output: '',
          outputTruncated: false,
          fileChanges: diffWorkingTrees(before, after),
          unverifiedReason: 'Command execution was interrupted before the command started; no process tree was created.',
        },
      };
    };

    if (context.signal.aborted) return interruptedBeforeStart();

    const cwd = await resolveInsideProject(context.root, command.cwd);
    if (context.signal.aborted) return interruptedBeforeStart();

    // Stream budgets sum with the fixed separator to the persisted output cap.
    // Independent capture makes composition deterministic regardless of pipe event timing.
    const stdoutCollector = createCommandOutputCollector(stdoutOutputLimitBytes);
    const stderrCollector = createCommandOutputCollector(stderrOutputLimitBytes);
    let child: ChildProcess;
    try {
      child = spawn(executable, command.argv.slice(1), {
        cwd,
        env: filteredEnvironment.environment,
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        detached: process.platform !== 'win32',
        windowsHide: true,
      });
    } catch (error) {
      const collected = finishCommandOutput(stdoutCollector, stderrCollector);
      const after = await snapshotWorkingTree(context.root, context.excludedArtifactPaths, context.rootIdentity);
      return {
        removedEnvironmentVariables: filteredEnvironment.removedNames,
        result: {
          commandId: command.id,
          status: 'could-not-start',
          startedAt,
          durationMs: Math.max(0, Math.round(performance.now() - monotonicStart)),
          exitCode: null,
          signal: null,
          output: collected.output,
          outputTruncated: collected.truncated,
          fileChanges: diffWorkingTrees(before, after),
          unverifiedReason: safeSpawnErrorReason(error instanceof Error ? error : undefined),
        },
      };
    }
    const stdoutListener = (chunk: Buffer): void => stdoutCollector.append(chunk);
    const stderrListener = (chunk: Buffer): void => stderrCollector.append(chunk);
    child.stdout?.on('data', stdoutListener);
    child.stderr?.on('data', stderrListener);

    const naturalOutcome = new Promise<NaturalOutcome>((resolve) => {
      child.once('error', (error) => resolve({
        kind: 'error',
        exitCode: null,
        signal: null,
        error,
      }));
      child.once('close', (exitCode, signal) => resolve({
        kind: 'close',
        exitCode,
        signal,
      }));
    });
    let forced = false;
    let timeout: NodeJS.Timeout | undefined;
    let resolveForced: ((outcome: ForcedOutcome) => void) | undefined;
    const forcedOutcome = new Promise<ForcedOutcome>((resolve) => {
      resolveForced = resolve;
    });
    const triggerForcedOutcome = (kind: ForcedOutcome['kind']): void => {
      if (forced) return;
      forced = true;
      if (timeout !== undefined) clearTimeout(timeout);
      context.signal.removeEventListener('abort', abortListener);
      const cleanup = child.pid === undefined
        ? Promise.resolve<ProcessTreeTermination>({
            terminationBoundary: process.platform === 'win32' ? 'windows-taskkill-tree' : 'unix-process-group',
            verified: false,
            limitation: 'Process-tree cleanup could not start because no process identifier was available.',
          })
        : terminateProcessTree(child.pid);
      resolveForced?.({ kind, cleanup });
    };
    const abortListener = (): void => triggerForcedOutcome('interrupted');
    context.signal.addEventListener('abort', abortListener, { once: true });
    timeout = setTimeout(
      () => triggerForcedOutcome('timed-out'),
      command.timeoutSeconds * 1_000,
    );

    const outcome = await Promise.race([naturalOutcome, forcedOutcome]);
    let status: CommandResultStatus;
    let exitCode: number | null;
    let signal: NodeJS.Signals | null;
    let unverifiedReason: string | undefined;

    if ('cleanup' in outcome) {
      const cleanup = await outcome.cleanup;
      const closed = await waitForCloseAfterCleanup(naturalOutcome);
      if (closed === undefined && cleanup.verified) {
        cleanup.verified = false;
        cleanup.limitation = 'The command process did not close within the bounded cleanup wait.';
      }
      status = outcome.kind;
      exitCode = closed?.exitCode ?? null;
      signal = closed?.signal ?? null;
      unverifiedReason = cleanupEvidence(outcome.kind, command.timeoutSeconds, cleanup);
    } else {
      if (timeout !== undefined) clearTimeout(timeout);
      context.signal.removeEventListener('abort', abortListener);
      status = outcome.kind === 'error'
        ? 'could-not-start'
        : outcome.exitCode === 0 ? 'passed' : 'failed';
      exitCode = outcome.exitCode;
      signal = outcome.signal;
      if (outcome.kind === 'error') unverifiedReason = safeSpawnErrorReason(outcome.error);
    }

    removeOutputListeners(child, stdoutListener, stderrListener);
    const collected = finishCommandOutput(stdoutCollector, stderrCollector);
    const after = await snapshotWorkingTree(context.root, context.excludedArtifactPaths, context.rootIdentity);
    const result = addOptionalReason({
      commandId: command.id,
      status,
      startedAt,
      durationMs: Math.max(0, Math.round(performance.now() - monotonicStart)),
      exitCode,
      signal,
      output: collected.output,
      outputTruncated: collected.truncated,
      fileChanges: diffWorkingTrees(before, after),
    }, unverifiedReason);

    return {
      result,
      removedEnvironmentVariables: filteredEnvironment.removedNames,
    };
  }
}
