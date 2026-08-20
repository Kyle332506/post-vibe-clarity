import { mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import type { CommandCategory, VerificationPlan } from '../../model/verification.js';
import { containsMarkdownLineOrControl } from '../../report/markdown-safety.js';
import { buildVerificationPlan } from '../../verification/build-verification-plan.js';
import { writeArtifactExclusively } from '../artifact-output.js';
import { renderPlatformCommand } from '../command-renderer.js';
import { findRepeatedSingularOption } from '../option-occurrences.js';
import { CliSafeError, CliUsageError } from './review.js';

const categories: CommandCategory[] = ['build', 'type-check', 'lint', 'test'];
const maximumGapIds = 12;
const maximumGapIdLength = 80;

interface PlanCommandDependencies {
  renderPlatformCommand: typeof renderPlatformCommand;
}

const defaultDependencies: PlanCommandDependencies = { renderPlatformCommand };

function parsePlanArgs(args: string[]) {
  let parsed;
  try {
    parsed = parseArgs({
      args,
      allowPositionals: true,
      tokens: true,
      options: {
        skills: { type: 'string' },
        exclude: { type: 'string', multiple: true },
        output: { type: 'string' },
      },
    });
  } catch {
    throw new CliUsageError('Invalid plan arguments.');
  }
  const repeated = findRepeatedSingularOption(parsed.tokens, new Set(['skills', 'output']));
  if (repeated !== undefined) throw new CliUsageError(`Option --${repeated} may be specified only once.`);
  return parsed;
}

function commandSummary(plan: VerificationPlan): string {
  const counts = new Map(categories.map((category) => [category, 0]));
  for (const command of plan.commands) {
    counts.set(command.category, (counts.get(command.category) ?? 0) + 1);
  }
  const categorySummary = categories.map((category) => `${category}: ${counts.get(category) ?? 0}`).join(', ');
  return `Commands: ${plan.commands.length} selected (${categorySummary}); ${plan.excludedCommands.length} excluded.`;
}

function gapSummary(plan: VerificationPlan): string {
  if (plan.coverageGaps.length === 0) return 'Gaps: none.';
  const shown = plan.coverageGaps
    .slice(0, maximumGapIds)
    .map(({ id }) => id.slice(0, maximumGapIdLength));
  const omitted = plan.coverageGaps.length - shown.length;
  const suffix = omitted === 0 ? '' : `, and ${omitted} more`;
  return `Gaps (${plan.coverageGaps.length}): ${shown.join(', ')}${suffix}.`;
}

export async function runPlanCommand(
  args: string[],
  dependencies: PlanCommandDependencies = defaultDependencies,
): Promise<void> {
  const { values, positionals } = parsePlanArgs(args);
  if (positionals.length > 1) throw new CliUsageError('Expected at most one project path.');
  if (values.output === undefined) throw new CliUsageError('Expected --output <plan-file>.');
  const root = resolve(positionals[0] ?? process.cwd());
  const outputPath = resolve(values.output);
  if (containsMarkdownLineOrControl(outputPath)) {
    throw new CliUsageError('Plan output path must not contain line or control characters.');
  }

  let plan: VerificationPlan;
  try {
    plan = await buildVerificationPlan({
      root,
      skillsRoot: values.skills ? resolve(values.skills) : join(root, 'skills'),
      excludedCommandIds: new Set(values.exclude ?? []),
      outputPath,
    });
  } catch (error) {
    if (error instanceof Error && /^Unknown command id /.test(error.message)) {
      throw new CliSafeError('Plan contains an unknown --exclude command id.');
    }
    throw error;
  }

  const outputDirectory = dirname(outputPath);
  const execute = dependencies.renderPlatformCommand(process.platform, 'postvibe', [
    'execute',
    outputPath,
    '--approve',
    plan.fingerprint,
    '--output',
    outputDirectory,
  ]);
  const artifact = `${JSON.stringify(plan, null, 2)}\n`;
  const stdout = [
    `Plan: ${outputPath}`,
    `Fingerprint: ${plan.fingerprint}`,
    commandSummary(plan),
    gapSummary(plan),
    `Warning: ${plan.containmentWarning}`,
    `Execute (${execute.shellLabel}): ${execute.command}`,
    '',
  ].join('\n');

  await mkdir(outputDirectory, { recursive: true });
  await writeArtifactExclusively(outputPath, artifact);
  process.stdout.write(stdout);
}
