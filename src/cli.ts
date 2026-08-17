#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { debugDiagnostic } from './cli/debug-diagnostic.js';
import { runReview } from './orchestrator/run-review.js';
import { renderJson } from './report/render-json.js';
import { renderMarkdown } from './report/render-markdown.js';

class CliUsageError extends Error {}

async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  if (command !== 'review') throw new CliUsageError('Expected the review command.');

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
  await writeFile(outputPath, rendered);
  process.stdout.write(`${outputPath}\n`);
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof CliUsageError
    ? error.message
    : process.env.POSTVIBE_DEBUG === '1'
      ? debugDiagnostic(error)
      : 'Review failed. Set POSTVIBE_DEBUG=1 for sanitized diagnostics.';
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
}
