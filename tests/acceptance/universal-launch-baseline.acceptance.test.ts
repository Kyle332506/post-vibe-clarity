import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerifiedReadinessReport } from '../../src/model/verified-report.js';
import type { VerificationExecution, VerificationPlan } from '../../src/model/verification.js';
import { validateVerifiedReadinessReport } from '../../src/validation/report-v02-schema.js';
import { validateVerificationExecution } from '../../src/validation/verification-execution-schema.js';
import { validateVerificationPlan } from '../../src/validation/verification-plan-schema.js';

const repositoryRoot = fileURLToPath(new URL('../..', import.meta.url));
const skillsRoot = join(repositoryRoot, 'skills');
const disclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';
const controlledSecret = 'fixture-secret-value-never-use';
const temporaryDirectories: string[] = [];

interface CliResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

interface CliRunner {
  label: string;
  command: string;
  prefix: string[];
}

const runners: CliRunner[] = [
  { label: 'source', command: process.execPath, prefix: ['--import', 'tsx', 'src/cli.ts'] },
  { label: 'compiled', command: process.execPath, prefix: ['dist/src/cli.js'] },
];

function runCli(runner: CliRunner, args: string[]): Promise<CliResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(runner.command, [...runner.prefix, ...args], {
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
    child.on('error', reject);
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

async function copyFixture(name: string): Promise<{ projectRoot: string }> {
  const temporaryRoot = await mkdtemp(join(tmpdir(), `postvibe-${name}-`));
  const projectRoot = join(temporaryRoot, 'project');
  temporaryDirectories.push(temporaryRoot);
  await cp(join(repositoryRoot, 'fixtures', name), projectRoot, { recursive: true });
  return { projectRoot };
}

async function expectMissing(path: string): Promise<void> {
  await expect(access(path)).rejects.toMatchObject({ code: 'ENOENT' });
}

function fingerprintFrom(stdout: string): string {
  const match = /^Fingerprint: ([a-f0-9]{64})$/m.exec(stdout);
  if (match?.[1] === undefined) throw new Error('Plan stdout did not contain one fingerprint.');
  return match[1];
}

function pathFrom(stdout: string, label: string): string {
  const line = stdout.split('\n').find((candidate) => candidate.startsWith(`${label}: `));
  if (line === undefined) throw new Error(`CLI stdout did not contain ${label}.`);
  return line.slice(label.length + 2);
}

async function readValidatedPlan(path: string): Promise<VerificationPlan> {
  const input = JSON.parse(await readFile(path, 'utf8')) as unknown;
  expect(await validateVerificationPlan(input)).toEqual({ ok: true });
  return input as VerificationPlan;
}

async function readValidatedExecution(path: string): Promise<VerificationExecution> {
  const input = JSON.parse(await readFile(path, 'utf8')) as unknown;
  expect(await validateVerificationExecution(input)).toEqual({ ok: true });
  return input as VerificationExecution;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

describe.each(runners)('universal launch baseline through the $label CLI', (runner) => {
  it('runs the four approved Node commands in order and validates JSON evidence', async () => {
    const { projectRoot } = await copyFixture('verification-node');
    const planPath = join(projectRoot, 'approved-plan.json');
    const outputDirectory = join(projectRoot, '.postvibe');
    const markerPath = join(projectRoot, 'verification-order.log');

    const planned = await runCli(runner, [
      'plan', projectRoot, '--skills', skillsRoot, '--output', planPath,
    ]);
    expect(planned).toMatchObject({ code: 0, stderr: '' });
    const fingerprint = fingerprintFrom(planned.stdout);
    await expectMissing(markerPath);

    const executed = await runCli(runner, [
      'execute', planPath, '--approve', fingerprint, '--output', outputDirectory, '--format', 'json',
    ]);
    expect(executed).toMatchObject({ code: 0, stderr: '' });
    expect(executed.stdout).toMatch(/^Execution record: [^\n]+\.execution\.json\nReport: [^\n]+\.report\.json\nStatus: completed \(passed: 4, failed: 0, unverified: 0\)\.\n$/);
    expect(await readFile(markerPath, 'utf8')).toBe('build\ntype-check\nlint\ntest\n');

    const executionPath = pathFrom(executed.stdout, 'Execution record');
    const reportPath = pathFrom(executed.stdout, 'Report');
    const plan = await readValidatedPlan(planPath);
    const execution = await readValidatedExecution(executionPath);
    const reportInput = JSON.parse(await readFile(reportPath, 'utf8')) as unknown;
    expect(execution.results.map(({ commandId }) => commandId)).toEqual([
      'package-script:build',
      'package-script:type-check',
      'package-script:lint',
      'package-script:test',
    ]);
    expect(await validateVerifiedReadinessReport(reportInput, plan, execution, executionPath)).toEqual({ ok: true });
    const report = reportInput as VerifiedReadinessReport;
    expect(report.schemaVersion).toBe('0.2');
    expect(report.verification.executionRecordPath).toBe(executionPath);

    const persisted = [
      await readFile(planPath, 'utf8'),
      await readFile(executionPath, 'utf8'),
      await readFile(reportPath, 'utf8'),
      planned.stdout,
      executed.stdout,
      executed.stderr,
    ].join('\n');
    expect(persisted).not.toContain(controlledSecret);
    expect(persisted).not.toMatch(/readiness[ -]?score/i);
    expect(persisted).not.toMatch(/"score"\s*:\s*\d/i);
  });
});

describe('universal launch baseline safety cases', () => {
  const sourceRunner = runners[0]!;

  it('keeps the required disclaimer as the final Markdown line', async () => {
    const { projectRoot } = await copyFixture('verification-node');
    const planPath = join(projectRoot, 'approved-plan.json');
    const outputDirectory = join(projectRoot, '.postvibe');
    const planned = await runCli(sourceRunner, [
      'plan', projectRoot, '--skills', skillsRoot, '--output', planPath,
    ]);
    const executed = await runCli(sourceRunner, [
      'execute', planPath, '--approve', fingerprintFrom(planned.stdout), '--output', outputDirectory,
    ]);

    expect(executed.code).toBe(0);
    const markdown = await readFile(pathFrom(executed.stdout, 'Report'), 'utf8');
    expect(markdown.trimEnd().split('\n').at(-1)).toBe(disclaimer);
    expect(markdown).not.toContain(controlledSecret);
    expect(markdown).not.toMatch(/readiness[ -]?score/i);
  });

  it('passes portable arguments literally without shell interpretation', async () => {
    const { projectRoot } = await copyFixture('verification-portable');
    const planPath = join(projectRoot, 'approved-plan.json');
    const outputDirectory = join(projectRoot, '.postvibe');
    const planned = await runCli(sourceRunner, [
      'plan', projectRoot, '--skills', skillsRoot, '--output', planPath,
    ]);
    const executed = await runCli(sourceRunner, [
      'execute', planPath, '--approve', fingerprintFrom(planned.stdout), '--output', outputDirectory, '--format', 'json',
    ]);

    expect(executed.code).toBe(0);
    expect(JSON.parse(await readFile(join(projectRoot, 'literal-arguments.json'), 'utf8'))).toEqual([
      'literal value',
      '$(touch portable-injected)',
      '*',
      ';',
      'A&B',
    ]);
    await expectMissing(join(projectRoot, 'portable-injected'));
  });

  it('retains the deliberately uncovered monorepo package as a coverage gap', async () => {
    const { projectRoot } = await copyFixture('verification-monorepo');
    const planPath = join(projectRoot, 'approved-plan.json');
    const planned = await runCli(sourceRunner, [
      'plan', projectRoot, '--skills', skillsRoot, '--output', planPath,
    ]);

    expect(planned.code).toBe(0);
    const plan = await readValidatedPlan(planPath);
    expect(plan.coverageGaps).toContainEqual({
      id: 'workspace.packages.uncovered',
      reason: 'Detected workspace was not directly covered by an approved command.',
      workspace: 'packages/uncovered',
    });
  });

  it('rejects a wrong approval before creating the script marker', async () => {
    const { projectRoot } = await copyFixture('verification-node');
    const planPath = join(projectRoot, 'approved-plan.json');
    const outputDirectory = join(projectRoot, '.postvibe');
    const planned = await runCli(sourceRunner, [
      'plan', projectRoot, '--skills', skillsRoot, '--output', planPath,
    ]);
    const fingerprint = fingerprintFrom(planned.stdout);
    const wrongFingerprint = `${fingerprint[0] === 'a' ? 'b' : 'a'}${fingerprint.slice(1)}`;
    const executed = await runCli(sourceRunner, [
      'execute', planPath, '--approve', wrongFingerprint, '--output', outputDirectory,
    ]);

    expect(executed.code).toBe(1);
    expect(executed.stdout).toBe('');
    expect(executed.stderr).toBe('Approval fingerprint does not match the verification plan.\n');
    await expectMissing(join(projectRoot, 'verification-order.log'));
    await expectMissing(outputDirectory);
  });

  it('rejects a stale plan before creating the script marker', async () => {
    const { projectRoot } = await copyFixture('verification-node');
    const planPath = join(projectRoot, 'approved-plan.json');
    const outputDirectory = join(projectRoot, '.postvibe');
    const planned = await runCli(sourceRunner, [
      'plan', projectRoot, '--skills', skillsRoot, '--output', planPath,
    ]);
    await writeFile(join(projectRoot, 'src', 'index.ts'), 'export const verificationFixture = "changed";\n');
    const executed = await runCli(sourceRunner, [
      'execute', planPath, '--approve', fingerprintFrom(planned.stdout), '--output', outputDirectory,
    ]);

    expect(executed.code).toBe(1);
    expect(executed.stdout).toBe('');
    expect(executed.stderr).toBe('Verification plan is stale; create and approve a new plan.\n');
    await expectMissing(join(projectRoot, 'verification-order.log'));
    await expectMissing(outputDirectory);
  });
});
