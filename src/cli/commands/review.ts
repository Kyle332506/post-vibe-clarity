import { mkdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { writeReportExclusively } from '../report-output.js';
import { runReview } from '../../orchestrator/run-review.js';
import { renderJson } from '../../report/render-json.js';
import { renderMarkdown } from '../../report/render-markdown.js';

export class CliUsageError extends Error {}
export class CliSafeError extends Error {}

export async function runReviewCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      skills: { type: 'string' },
      format: { type: 'string' },
      output: { type: 'string' },
    },
  });
  if (positionals.length > 1) throw new CliUsageError('Expected at most one project path.');
  const root = resolve(positionals[0] ?? process.cwd());
  const format = values.format ?? 'markdown';
  if (format !== 'json' && format !== 'markdown') {
    throw new CliUsageError('Expected --format markdown or --format json.');
  }

  const report = await runReview({
    root,
    skillsRoot: values.skills ? resolve(values.skills) : join(root, 'skills'),
  });
  const rendered = format === 'json' ? renderJson(report) : renderMarkdown(report);

  if (!values.output) {
    process.stdout.write(rendered);
    return;
  }

  const outputDirectory = resolve(values.output);
  const extension = format === 'json' ? 'json' : 'md';
  const outputPath = join(outputDirectory, `${report.runId}.${extension}`);
  await mkdir(outputDirectory, { recursive: true });
  await writeReportExclusively(outputPath, rendered);
  process.stdout.write(`${outputPath}\n`);
}
