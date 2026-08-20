import { isDeepStrictEqual } from 'node:util';
import type {
  VerificationCommand,
  VerificationCommandResult,
} from '../model/verification.js';
import { compareOrdinal } from '../ordinal.js';
import type { CommandExecutionResult } from './local-command-executor.js';
import {
  COMMAND_OUTPUT_LIMIT_BYTES,
  redactAndBoundCommandOutput,
} from './redact-command-output.js';

const resultKeys = new Set([
  'commandId',
  'status',
  'startedAt',
  'durationMs',
  'exitCode',
  'signal',
  'output',
  'outputTruncated',
  'fileChanges',
  'unverifiedReason',
]);
const resultStatuses = new Set([
  'passed',
  'failed',
  'timed-out',
  'could-not-start',
  'interrupted',
  'unverified',
]);
const fileChangeKinds = new Set(['added', 'modified', 'removed']);

export interface RecordedCommandExecution {
  result: VerificationCommandResult;
  removedEnvironmentVariables: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(value: Record<string, unknown>, keys: Set<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function isNullableInteger(value: unknown): value is number | null {
  return value === null || Number.isSafeInteger(value);
}

function isNullableSignal(value: unknown): value is string | null {
  return value === null || (typeof value === 'string' && /^SIG[A-Z0-9]+$/u.test(value));
}

function hasProcessTiming(result: VerificationCommandResult): boolean {
  return result.startedAt !== undefined && result.durationMs !== undefined;
}

function hasNoProcessTiming(result: VerificationCommandResult): boolean {
  return result.startedAt === undefined && result.durationMs === undefined;
}

function hasReason(result: VerificationCommandResult): boolean {
  return typeof result.unverifiedReason === 'string' && result.unverifiedReason.trim().length > 0;
}

function hasNoReason(result: VerificationCommandResult): boolean {
  return result.unverifiedReason === undefined;
}

function signalAndExitAreExclusive(result: VerificationCommandResult): boolean {
  return result.signal === null || result.exitCode === null;
}

export function commandResultEvidenceErrors(result: VerificationCommandResult): string[] {
  const errors: string[] = [];
  const paths = result.fileChanges.map(({ path }) => path);
  if (!paths.every((path, index) => index === 0 || compareOrdinal(paths[index - 1]!, path) < 0)) {
    errors.push('file changes must be unique and sorted by path');
  }
  if (Buffer.byteLength(result.output, 'utf8') > COMMAND_OUTPUT_LIMIT_BYTES) {
    errors.push('output exceeds the UTF-8 byte limit');
  }

  const commonProcessEvidence = hasProcessTiming(result)
    && Number.isFinite(result.durationMs)
    && (result.durationMs ?? -1) >= 0
    && signalAndExitAreExclusive(result);
  let consistent = false;
  switch (result.status) {
    case 'passed':
      consistent = commonProcessEvidence
        && result.exitCode === 0
        && result.signal === null
        && hasNoReason(result);
      break;
    case 'failed':
      consistent = commonProcessEvidence
        && hasNoReason(result)
        && ((result.signal !== null && result.exitCode === null)
          || (result.signal === null && result.exitCode !== null && result.exitCode !== 0));
      break;
    case 'timed-out':
    case 'interrupted':
      consistent = commonProcessEvidence && hasReason(result);
      break;
    case 'could-not-start':
      consistent = commonProcessEvidence
        && result.exitCode === null
        && result.signal === null
        && hasReason(result);
      break;
    case 'unverified':
      consistent = hasNoProcessTiming(result)
        && result.exitCode === null
        && result.signal === null
        && result.output === ''
        && result.outputTruncated === false
        && result.fileChanges.length === 0
        && hasReason(result);
      break;
  }
  if (!consistent) errors.push('status evidence is contradictory');
  return errors;
}

function cloneFileChanges(input: unknown): VerificationCommandResult['fileChanges'] | undefined {
  if (!Array.isArray(input)) return undefined;
  const changes: VerificationCommandResult['fileChanges'] = [];
  for (const item of input) {
    if (!isRecord(item) || !hasOnlyKeys(item, new Set(['path', 'kind']))) return undefined;
    if (typeof item.path !== 'string' || item.path.length === 0) return undefined;
    if (typeof item.kind !== 'string' || !fileChangeKinds.has(item.kind)) return undefined;
    changes.push({ path: item.path, kind: item.kind as 'added' | 'modified' | 'removed' });
  }
  return changes;
}

export function recordCommandExecution(
  command: VerificationCommand,
  input: CommandExecutionResult,
): RecordedCommandExecution | undefined {
  if (!isRecord(input) || !hasOnlyKeys(input, new Set(['result', 'removedEnvironmentVariables']))) {
    return undefined;
  }
  if (!isRecord(input.result) || !hasOnlyKeys(input.result, resultKeys)) return undefined;
  const raw = input.result;
  if (raw.commandId !== command.id || typeof raw.status !== 'string' || !resultStatuses.has(raw.status)) {
    return undefined;
  }
  if (raw.startedAt !== undefined && typeof raw.startedAt !== 'string') return undefined;
  if (raw.durationMs !== undefined && (typeof raw.durationMs !== 'number' || !Number.isFinite(raw.durationMs))) {
    return undefined;
  }
  if (!isNullableInteger(raw.exitCode) || !isNullableSignal(raw.signal)) return undefined;
  if (typeof raw.output !== 'string' || typeof raw.outputTruncated !== 'boolean') return undefined;
  if (raw.unverifiedReason !== undefined && typeof raw.unverifiedReason !== 'string') return undefined;
  const fileChanges = cloneFileChanges(raw.fileChanges);
  if (fileChanges === undefined) return undefined;
  if (fileChanges.some(({ path }) => redactAndBoundCommandOutput(path).output !== path)) return undefined;
  if (!Array.isArray(input.removedEnvironmentVariables)
    || !input.removedEnvironmentVariables.every(
      (name) => typeof name === 'string' && /^[A-Za-z_][A-Za-z0-9_]*$/u.test(name),
    )) return undefined;

  const bounded = redactAndBoundCommandOutput(raw.output);
  const safeReason = raw.unverifiedReason === undefined
    ? undefined
    : redactAndBoundCommandOutput(raw.unverifiedReason).output;
  const result: VerificationCommandResult = {
    commandId: raw.commandId,
    status: raw.status as VerificationCommandResult['status'],
    ...(raw.startedAt === undefined ? {} : { startedAt: raw.startedAt }),
    ...(raw.durationMs === undefined ? {} : { durationMs: raw.durationMs }),
    exitCode: raw.exitCode,
    signal: raw.signal,
    output: bounded.output,
    outputTruncated: raw.outputTruncated || bounded.truncated,
    fileChanges,
    ...(safeReason === undefined ? {} : { unverifiedReason: safeReason }),
  };
  if (commandResultEvidenceErrors(result).length > 0) return undefined;
  return {
    result,
    removedEnvironmentVariables: [...input.removedEnvironmentVariables],
  };
}

export function exactCommandResultsMatchPlan(
  results: VerificationCommandResult[],
  commands: VerificationCommand[],
): boolean {
  return isDeepStrictEqual(
    results.map(({ commandId }) => commandId),
    commands.map(({ id }) => id),
  );
}
