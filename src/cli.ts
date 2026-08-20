#!/usr/bin/env node

import { ArtifactFileCollisionError, ArtifactFileOwnershipError } from './cli/artifact-output.js';
import { runExecuteCommand } from './cli/commands/execute.js';
import { runPlanCommand } from './cli/commands/plan.js';
import { CliSafeError, CliUsageError, runReviewCommand } from './cli/commands/review.js';
import { debugDiagnostic } from './cli/debug-diagnostic.js';
import { ReportFileCollisionError } from './cli/report-output.js';

type CommandName = 'review' | 'plan' | 'execute';

function commandLabel(command: CommandName): string {
  return `${command[0]!.toUpperCase()}${command.slice(1)}`;
}

async function runExecute(args: string[]): Promise<void> {
  const controller = new AbortController();
  const abort = (): void => controller.abort();
  process.once('SIGINT', abort);
  try {
    await runExecuteCommand(args, controller.signal);
  } finally {
    process.removeListener('SIGINT', abort);
  }
}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'review') return runReviewCommand(args);
  if (command === 'plan') return runPlanCommand(args);
  if (command === 'execute') return runExecute(args);
  throw new CliUsageError('Expected the review command.');
}

try {
  await main();
} catch (error: unknown) {
  const command = process.argv[2];
  const knownCommand: CommandName = command === 'plan' || command === 'execute' ? command : 'review';
  const label = commandLabel(knownCommand);
  const isSafeError = error instanceof CliUsageError
    || error instanceof CliSafeError
    || error instanceof ReportFileCollisionError
    || (knownCommand !== 'review' && (
      error instanceof ArtifactFileCollisionError
      || error instanceof ArtifactFileOwnershipError
    ));
  const message = isSafeError
    ? error.message
    : process.env.POSTVIBE_DEBUG === '1'
      ? debugDiagnostic(error).replace(/^Review failed\./, `${label} failed.`)
      : `${label} failed. Set POSTVIBE_DEBUG=1 for sanitized diagnostics.`;
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
