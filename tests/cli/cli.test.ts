import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const controlledFixtureValue = 'fixture-secret-value-never-use';
const controlledParserValue = 'sk_test_controlled_cli_error_never_emit';

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runProcess(command: string, args: string[], environment: NodeJS.ProcessEnv = process.env): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: environment,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';

    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk: string) => { stdout += chunk; });
    child.stderr.on('data', (chunk: string) => { stderr += chunk; });
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function runCli(args: string[], environment: NodeJS.ProcessEnv = process.env): Promise<CliResult> {
  return runProcess('pnpm', ['exec', 'tsx', 'src/cli.ts', ...args], environment);
}

async function runMalformedCatalog(environment: NodeJS.ProcessEnv): Promise<CliResult> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-malformed-'));
  const malformedSkill = join(temporaryRoot, 'malformed');

  try {
    await mkdir(malformedSkill);
    await writeFile(join(malformedSkill, 'SKILL.md'), [
      '---',
      'name: malformed',
      'description: Use when exercising sanitized malformed-catalog failures.',
      'license: Apache-2.0',
      '---',
      '',
      '# Malformed fixture',
      '',
    ].join('\n'));
    await writeFile(
      join(malformedSkill, 'readiness.yaml'),
      `schemaVersion: "0.1"\nid: "${controlledParserValue}\n`,
    );
    return await runCli([
      'review',
      'fixtures/cli-clean',
      '--skills',
      temporaryRoot,
      '--format',
      'json',
    ], environment);
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

describe('postvibe review CLI', () => {
  it('writes the selected JSON report to stdout', async () => {
    const result = await runCli([
      'review',
      'fixtures/web-missing-basics',
      '--skills',
      'tests/fixtures/skills',
      '--format',
      'json',
    ]);
    const stderrContainsControlledValue = result.stderr.includes(controlledFixtureValue);
    const stdoutContainsControlledValue = result.stdout.includes(controlledFixtureValue);

    expect(result.code).toBe(0);
    const parsed = JSON.parse(result.stdout) as Record<string, unknown>;
    expect(parsed.schemaVersion).toBe('0.1');
    expect(parsed.toolkitVersion).toBe('0.1.0');
    expect(parsed.partial).toBe(true);
    expect(parsed.checkExecutions).toEqual(expect.arrayContaining([
      expect.objectContaining({ checkId: 'secret-exposure.scan', status: 'completed' }),
    ]));
    expect(parsed.coverageGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'domain.product-ux', status: 'unverified' }),
    ]));
    expect(stdoutContainsControlledValue).toBe(false);
    expect(stderrContainsControlledValue).toBe(false);
  });

  it('creates an output directory and prints only the Markdown report path', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-output-'));
    const outputDirectory = join(temporaryRoot, 'nested', 'reports');

    try {
      const result = await runCli([
        'review',
        'fixtures/web-missing-basics',
        '--skills',
        'tests/fixtures/skills',
        '--format',
        'markdown',
        '--output',
        outputDirectory,
      ]);

      const stderrIsEmpty = result.stderr.length === 0;
      const stdoutIsOnlyMarkdownPath = new RegExp(`^${outputDirectory}/pvc-\\d+\\.md\\n$`).test(result.stdout);
      expect(result.code).toBe(0);
      expect(stderrIsEmpty).toBe(true);
      expect(stdoutIsOnlyMarkdownPath).toBe(true);
      const outputPath = result.stdout.trim();

      const markdown = await readFile(outputPath, 'utf8');
      const markdownContainsHeading = markdown.includes('# PostVibeClarity launch review');
      const markdownContainsControlledValue = markdown.includes(controlledFixtureValue);
      expect(markdownContainsHeading).toBe(true);
      expect(markdownContainsControlledValue).toBe(false);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('defaults to the project skills directory and Markdown output', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-defaults-'));
    const projectRoot = join(temporaryRoot, 'project');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'web-missing-basics'), projectRoot, { recursive: true });
      await cp(join(repositoryRoot, 'tests', 'fixtures', 'skills'), join(projectRoot, 'skills'), { recursive: true });

      const result = await runCli(['review', projectRoot]);
      const stderrIsEmpty = result.stderr.length === 0;
      const stdoutContainsHeading = result.stdout.includes('# PostVibeClarity launch review');
      const stdoutContainsControlledValue = result.stdout.includes(controlledFixtureValue);

      expect(result.code).toBe(0);
      expect(stderrIsEmpty).toBe(true);
      expect(stdoutContainsHeading).toBe(true);
      expect(stdoutContainsControlledValue).toBe(false);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('reports validation failures on stderr without a stack trace outside debug mode', async () => {
    const { POSTVIBE_DEBUG: _debug, ...environment } = process.env;
    const result = await runCli([
      'review',
      'fixtures/web-missing-basics',
      '--skills',
      'tests/fixtures/skills',
      '--format',
      'yaml',
    ], environment);
    const stderrContainsStackFrame = result.stderr.includes('\n    at ');

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('Expected --format markdown or --format json.');
    expect(stderrContainsStackFrame).toBe(false);
  });

  it('hides malformed catalog content behind a stable normal-mode execution error', async () => {
    const { POSTVIBE_DEBUG: _debug, ...environment } = process.env;
    const result = await runMalformedCatalog(environment);
    const stdoutIsEmpty = result.stdout.length === 0;
    const stderrContainsControlledValue = result.stderr.includes(controlledParserValue);
    const stderrIsStableGenericMessage = result.stderr === 'Review failed. Set POSTVIBE_DEBUG=1 for sanitized diagnostics.\n';

    expect(result.code).toBe(1);
    expect(stdoutIsEmpty).toBe(true);
    expect(stderrContainsControlledValue).toBe(false);
    expect(stderrIsStableGenericMessage).toBe(true);
  });

  it('limits debug diagnostics to a sanitized category and stack-frame locations', async () => {
    const result = await runMalformedCatalog({ ...process.env, POSTVIBE_DEBUG: '1' });
    const stdoutIsEmpty = result.stdout.length === 0;
    const stderrContainsControlledValue = result.stderr.includes(controlledParserValue);
    const stderrContainsRawParserMessage = result.stderr.includes('Missing closing');
    const stderrHasSanitizedCategory = result.stderr.startsWith('Review failed.\nError category: YAMLParseError\nStack frames:\n');
    const stderrHasStackFrameLocation = /\n  at (?:file:\/\/)?[^\n]+:\d+:\d+\n/.test(result.stderr);

    expect(result.code).toBe(1);
    expect(stdoutIsEmpty).toBe(true);
    expect(stderrContainsControlledValue).toBe(false);
    expect(stderrContainsRawParserMessage).toBe(false);
    expect(stderrHasSanitizedCategory).toBe(true);
    expect(stderrHasStackFrameLocation).toBe(true);
  });

  it('runs the compiled executable with its readiness schema available', async () => {
    const build = await runProcess('pnpm', ['build']);
    expect(build.code).toBe(0);

    const result = await runProcess(process.execPath, [
      'dist/src/cli.js',
      'review',
      'fixtures/web-missing-basics',
      '--skills',
      'tests/fixtures/skills',
      '--format',
      'json',
    ]);
    const stdoutContainsControlledValue = result.stdout.includes(controlledFixtureValue);
    const stderrContainsControlledValue = result.stderr.includes(controlledFixtureValue);

    expect(result.code).toBe(0);
    expect(stdoutContainsControlledValue).toBe(false);
    expect(stderrContainsControlledValue).toBe(false);
  });
});
