import { spawn } from 'node:child_process';
import { cp, mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { renderPlatformCommand } from '../../src/cli/command-renderer.js';
import { runPlanCommand } from '../../src/cli/commands/plan.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const tsxImport = import.meta.resolve('tsx');
const controlledFixtureValue = 'fixture-secret-value-never-use';
const controlledParserValue = 'sk_test_controlled_cli_error_never_emit';

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

function runProcess(
  command: string,
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
  cwd = repositoryRoot,
): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
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

function runCli(
  args: string[],
  environment: NodeJS.ProcessEnv = process.env,
  cwd = repositoryRoot,
): Promise<CliResult> {
  return runProcess(
    process.execPath,
    ['--import', tsxImport, join(repositoryRoot, 'src', 'cli.ts'), ...args],
    environment,
    cwd,
  );
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
    expect(parsed.toolkitVersion).toBe('0.2.0');
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

  it('retains legacy last-value behavior for repeated review --skills', async () => {
    const result = await runCli([
      'review',
      'fixtures/web-missing-basics',
      '--skills',
      'controlled-missing-skills',
      '--skills',
      'tests/fixtures/skills',
      '--format',
      'json',
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: '0.1' });
  });

  it('retains legacy last-value behavior for repeated review --format', async () => {
    const result = await runCli([
      'review',
      'fixtures/web-missing-basics',
      '--skills',
      'tests/fixtures/skills',
      '--format',
      'markdown',
      '--format',
      'json',
    ]);

    expect(result.code).toBe(0);
    expect(result.stderr).toBe('');
    expect(JSON.parse(result.stdout)).toMatchObject({ schemaVersion: '0.1' });
  });

  it('retains legacy last-value behavior for repeated review --output', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-review-last-output-'));
    const firstOutput = join(temporaryRoot, 'first-output');
    const secondOutput = join(temporaryRoot, 'second-output');

    try {
      const result = await runCli([
        'review',
        'fixtures/web-missing-basics',
        '--skills',
        'tests/fixtures/skills',
        '--format',
        'json',
        '--output',
        firstOutput,
        '--output',
        secondOutput,
      ]);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(result.stdout.startsWith(`${secondOutput}/pvc-`)).toBe(true);
      await expect(readdir(firstOutput)).rejects.toMatchObject({ code: 'ENOENT' });
      expect(await readdir(secondOutput)).toHaveLength(1);
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

describe('postvibe plan CLI', () => {
  it('does not publish when execute-command rendering exceeds its bound', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-plan-overbound-'));
    const projectRoot = join(temporaryRoot, 'project');
    const planPath = join(temporaryRoot, 'artifacts', 'verification-plan.json');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      let thrown: unknown;
      try {
        await runPlanCommand([
          projectRoot,
          '--skills',
          join(repositoryRoot, 'skills'),
          '--output',
          planPath,
        ], {
          renderPlatformCommand: (platform, executable, args) => renderPlatformCommand(
            platform,
            executable,
            [...args, 'x'.repeat(16_384)],
          ),
        });
      } catch (error) {
        thrown = error;
      }

      expect(thrown).toMatchObject({ message: 'Rendered command exceeds the bounded display length.' });
      expect(await readdir(temporaryRoot)).toEqual(['project']);
      await expect(readFile(planPath, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(projectRoot, 'verification-order.log'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });

      const retried = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
      ]);
      expect(retried.code).toBe(0);
      expect(retried.stderr).toBe('');
      expect(await readdir(join(temporaryRoot, 'artifacts'))).toEqual(['verification-plan.json']);
      await expect(readFile(join(projectRoot, 'verification-order.log'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('writes one exclusive plan and prints only the bounded approval summary', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-plan-'));
    const projectRoot = join(temporaryRoot, 'project');
    const outputDirectory = join(temporaryRoot, 'artifacts');
    const planPath = join(outputDirectory, 'verification-plan.json');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      await mkdir(outputDirectory);

      const result = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
      ]);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(await readdir(outputDirectory)).toEqual(['verification-plan.json']);
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as { fingerprint: string; containmentWarning: string };
      expect(result.stdout).toBe([
        `Plan: ${planPath}`,
        `Fingerprint: ${plan.fingerprint}`,
        'Commands: 4 selected (build: 1, type-check: 1, lint: 1, test: 1); 0 excluded.',
        'Gaps: none.',
        `Warning: ${plan.containmentWarning}`,
        'Approval boundary: approves the exact command and direct launch checks; it does not freeze imported files or dependencies.',
        `Execute (${process.platform === 'win32' ? 'PowerShell' : 'POSIX sh'}): ${process.platform === 'win32'
          ? `& 'postvibe' 'execute' '${planPath}' '--approve' '${plan.fingerprint}' '--output' '${outputDirectory}'`
          : `'postvibe' 'execute' '${planPath}' '--approve' '${plan.fingerprint}' '--output' '${outputDirectory}'`}`,
        '',
      ].join('\n'));
      await expect(readFile(join(projectRoot, 'verification-order.log'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('refuses to overwrite an existing plan', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-plan-collision-'));
    const projectRoot = join(temporaryRoot, 'project');
    const planPath = join(temporaryRoot, 'verification-plan.json');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      await writeFile(planPath, 'existing-plan\n');
      const result = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
      ]);

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(`Artifact file already exists; no file was overwritten: ${planPath}\n`);
      expect(await readFile(planPath, 'utf8')).toBe('existing-plan\n');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('requires the plan output path', async () => {
    const result = await runCli(['plan', 'fixtures/cli-clean']);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Expected --output <plan-file>.\n');
  });

  it('retains each repeated exclusion in the approved plan', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-plan-exclusions-'));
    const projectRoot = join(temporaryRoot, 'project');
    const planPath = join(temporaryRoot, 'verification-plan.json');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      const result = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--exclude',
        'package-script:build',
        '--exclude',
        'package-script:test',
        '--output',
        planPath,
      ]);

      expect(result.code).toBe(0);
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as {
        excludedCommands: Array<{ id: string }>;
        coverageGaps: Array<{ id: string }>;
      };
      expect(plan.excludedCommands.map(({ id }) => id)).toEqual([
        'package-script:build',
        'package-script:test',
      ]);
      expect(plan.coverageGaps.map(({ id }) => id)).toEqual([
        'command.package-script:build',
        'command.package-script:test',
      ]);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.each([
    'skills',
    'output',
  ])('rejects repeated plan --%s before creating an artifact', async (_option) => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-plan-duplicate-'));
    const projectRoot = join(temporaryRoot, 'project');
    const duplicateArgs = _option === 'skills'
      ? ['--skills', join(repositoryRoot, 'skills'), '--skills', join(temporaryRoot, 'controlled-missing-skills')]
      : ['--output', join(temporaryRoot, 'first-plan.json'), '--output', join(temporaryRoot, 'second-plan.json')];

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      const result = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        join(temporaryRoot, 'ordinary-plan.json'),
        ...duplicateArgs,
      ]);

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(`Option --${_option} may be specified only once.\n`);
      expect(await readdir(temporaryRoot)).toEqual(['project']);
      await expect(readFile(join(projectRoot, 'verification-order.log'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('accepts a leading-hyphen project path after the option terminator', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-plan-terminator-'));
    const projectRoot = join(temporaryRoot, '-project');
    const planPath = join(temporaryRoot, 'plan.json');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      const result = await runCli([
        'plan',
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
        '--',
        '-project',
      ], process.env, temporaryRoot);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as { projectRoot: string };
      expect(plan.projectRoot).toBe(await import('node:fs/promises').then(({ realpath }) => realpath(projectRoot)));
      await expect(readFile(join(projectRoot, 'verification-order.log'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('redacts project-controlled parser details in debug mode', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-plan-debug-'));
    const projectRoot = join(temporaryRoot, 'project');

    try {
      await mkdir(projectRoot);
      await writeFile(join(projectRoot, 'package.json'), `{"${controlledParserValue}":`);
      const result = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        join(temporaryRoot, 'plan.json'),
      ], { ...process.env, POSTVIBE_DEBUG: '1' });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toMatch(/^Plan failed\.\nError category: SyntaxError(?:\nStack frames:\n(?:  at frame-\d+:\d+:\d+\n?)+)?$/);
      expect(result.stderr).not.toContain(controlledParserValue);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});

describe('postvibe execute CLI', () => {
  it('rejects malformed plan JSON with a stable normal-mode error', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-execute-invalid-'));
    const planPath = join(temporaryRoot, 'plan.json');

    try {
      await writeFile(planPath, `{"${controlledParserValue}":`);
      const { POSTVIBE_DEBUG: _debug, ...environment } = process.env;
      const result = await runCli([
        'execute',
        planPath,
        '--approve',
        'a'.repeat(64),
        '--output',
        join(temporaryRoot, 'artifacts'),
      ], environment);

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Verification plan is invalid; create a new plan.\n');
      expect(result.stderr).not.toContain(controlledParserValue);
      expect(await readdir(temporaryRoot)).toEqual(['plan.json']);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('redacts malformed plan details in debug mode', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-execute-debug-'));
    const planPath = join(temporaryRoot, 'plan.json');

    try {
      await writeFile(planPath, `{"${controlledParserValue}":`);
      const result = await runCli([
        'execute',
        planPath,
        '--approve',
        'a'.repeat(64),
        '--output',
        join(temporaryRoot, 'artifacts'),
      ], { ...process.env, POSTVIBE_DEBUG: '1' });

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Verification plan is invalid; create a new plan.\n');
      expect(result.stderr).not.toContain(controlledParserValue);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('rejects a schema-invalid plan before creating execution artifacts', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-execute-schema-'));
    const projectRoot = join(temporaryRoot, 'project');
    const planPath = join(temporaryRoot, 'plan.json');
    const outputDirectory = join(temporaryRoot, 'artifacts');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      const planned = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
      ]);
      expect(planned.code).toBe(0);
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as Record<string, unknown>;
      const fingerprint = plan.fingerprint;
      if (typeof fingerprint !== 'string') throw new Error('Fixture plan fingerprint is missing.');
      plan.unexpected = 'controlled-invalid-plan';
      await writeFile(planPath, `${JSON.stringify(plan)}\n`);
      const result = await runCli([
        'execute',
        planPath,
        '--approve',
        fingerprint,
        '--output',
        outputDirectory,
      ]);

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe('Verification plan is invalid; create a new plan.\n');
      await expect(readFile(outputDirectory, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      await expect(readFile(join(projectRoot, 'verification-order.log'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('validates execute format before loading or running a plan', async () => {
    const result = await runCli([
      'execute',
      'controlled-plan-that-must-not-be-read.json',
      '--approve',
      'a'.repeat(64),
      '--output',
      'controlled-output-that-must-not-be-created',
      '--format',
      'yaml',
    ]);

    expect(result.code).toBe(1);
    expect(result.stdout).toBe('');
    expect(result.stderr).toBe('Expected --format markdown or --format json.\n');
  });

  it.each([
    'approve',
    'output',
    'format',
  ])('rejects repeated execute --%s before running a command', async (_option) => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-execute-duplicate-'));
    const projectRoot = join(temporaryRoot, 'project');
    const planPath = join(temporaryRoot, 'plan.json');
    const duplicateArgs = _option === 'approve'
      ? ['--approve', 'a'.repeat(64), '--approve', 'b'.repeat(64)]
      : _option === 'output'
        ? ['--output', join(temporaryRoot, 'first-output'), '--output', join(temporaryRoot, 'second-output')]
        : ['--format', 'json', '--format', 'markdown'];

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      const planned = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
      ]);
      expect(planned.code).toBe(0);
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as { fingerprint: string };
      const result = await runCli([
        'execute',
        planPath,
        '--approve',
        plan.fingerprint,
        '--output',
        join(temporaryRoot, 'ordinary-output'),
        '--format',
        'json',
        ...duplicateArgs,
      ]);

      expect(result.code).toBe(1);
      expect(result.stdout).toBe('');
      expect(result.stderr).toBe(`Option --${_option} may be specified only once.\n`);
      await expect(readFile(join(projectRoot, 'verification-order.log'), 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
      const entries = (await readdir(temporaryRoot)).sort();
      expect(entries).toEqual(['plan.json', 'project']);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it.runIf(process.platform !== 'win32')('records SIGINT as partial evidence and removes its process handler after execute', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-execute-sigint-'));
    const projectRoot = join(temporaryRoot, 'project');
    const planPath = join(temporaryRoot, 'plan.json');
    const outputDirectory = join(temporaryRoot, 'artifacts');
    const startedMarker = join(projectRoot, 'started.marker');

    try {
      await mkdir(projectRoot);
      await writeFile(join(projectRoot, 'long.mjs'), [
        "import { writeFileSync } from 'node:fs';",
        `writeFileSync(${JSON.stringify(startedMarker)}, 'started\\n');`,
        'setInterval(() => {}, 1000);',
        '',
      ].join('\n'));
      await writeFile(join(projectRoot, 'postvibe.verification.yaml'), [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: interrupt-lifecycle',
        '    category: test',
        '    argv: ["node", "long.mjs"]',
        '    cwd: "."',
        '    timeoutSeconds: 30',
        '',
      ].join('\n'));
      const planned = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
      ]);
      expect(planned.code).toBe(0);
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as { fingerprint: string };

      const child = spawn(process.execPath, [
        '--import',
        tsxImport,
        join(repositoryRoot, 'src', 'cli.ts'),
        'execute',
        planPath,
        '--approve',
        plan.fingerprint,
        '--output',
        outputDirectory,
        '--format',
        'json',
      ], {
        cwd: repositoryRoot,
        env: process.env,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      let stdout = '';
      let stderr = '';
      child.stdout.setEncoding('utf8');
      child.stderr.setEncoding('utf8');
      child.stdout.on('data', (chunk: string) => { stdout += chunk; });
      child.stderr.on('data', (chunk: string) => { stderr += chunk; });
      const completion = new Promise<number | null>((resolve, reject) => {
        child.once('error', reject);
        child.once('close', resolve);
      });
      await expect.poll(async () => {
        try {
          return (await readFile(startedMarker, 'utf8')) === 'started\n';
        } catch {
          return false;
        }
      }, { timeout: 5_000, interval: 25 }).toBe(true);
      expect(child.kill('SIGINT')).toBe(true);

      expect(await completion).toBe(0);
      expect(stderr).toBe('');
      expect(stdout).toMatch(/Status: partial \(passed: 0, failed: 0, unverified: 1\)\./);
      const executionPath = /^Execution record: (.+)$/m.exec(stdout)?.[1];
      if (executionPath === undefined) throw new Error('Interrupted execute output omitted its execution path.');
      const execution = JSON.parse(await readFile(executionPath, 'utf8')) as {
        status: string;
        results: Array<{ status: string; unverifiedReason?: string }>;
      };
      expect(execution).toMatchObject({
        status: 'partial',
        results: [expect.objectContaining({
          status: 'interrupted',
          unverifiedReason: expect.stringMatching(/interrupted/i),
        })],
      });
      expect((await readdir(outputDirectory)).some((name) => name.endsWith('.lock') || name.endsWith('.tmp'))).toBe(false);
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  }, 15_000);

  it('accepts a leading-hyphen plan path after the option terminator', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-cli-execute-terminator-'));
    const projectRoot = join(temporaryRoot, 'project');
    const planPath = join(temporaryRoot, '-approved-plan.json');
    const outputDirectory = join(temporaryRoot, 'output');

    try {
      await cp(join(repositoryRoot, 'fixtures', 'verification-node'), projectRoot, { recursive: true });
      const planned = await runCli([
        'plan',
        projectRoot,
        '--skills',
        join(repositoryRoot, 'skills'),
        '--output',
        planPath,
      ]);
      expect(planned.code).toBe(0);
      const plan = JSON.parse(await readFile(planPath, 'utf8')) as { fingerprint: string };
      const result = await runCli([
        'execute',
        '--approve',
        plan.fingerprint,
        '--output',
        outputDirectory,
        '--format',
        'json',
        '--',
        '-approved-plan.json',
      ], process.env, temporaryRoot);

      expect(result.code).toBe(0);
      expect(result.stderr).toBe('');
      expect(await readFile(join(projectRoot, 'verification-order.log'), 'utf8')).toBe('build\ntype-check\nlint\ntest\n');
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });
});
