import { access, mkdir, mkdtemp, readFile, readdir, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type {
  VerificationCommandResult,
  VerificationExecution,
  VerificationPlan,
} from '../../src/model/verification.js';
import type {
  CommandExecutionResult,
  CommandExecutor,
  ExecuteCommandContext,
} from '../../src/verification/local-command-executor.js';
import { buildVerificationPlan } from '../../src/verification/build-verification-plan.js';
import { fingerprintPlan } from '../../src/verification/plan-fingerprint.js';
import {
  runApprovedVerification,
  type RunApprovedVerificationOptions,
} from '../../src/verification/run-approved-verification.js';
import { ORCHESTRATION_COVERAGE_GAP } from '../../src/verification/contract-constants.js';
import { STALE_PLAN_ERROR } from '../../src/verification/validate-plan-state.js';
import { validateVerificationExecution } from '../../src/validation/verification-execution-schema.js';

const startedAt = '2026-08-18T12:01:00.000Z';
const executionId = 'pve-20260818120100000';
const temporaryDirectories: string[] = [];

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }));
}

async function fixture(directNodeTest = false): Promise<{
  root: string;
  skillsRoot: string;
  planArtifactPath: string;
  outputDirectory: string;
  plan: VerificationPlan;
}> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-approved-project-'));
  const skillsRoot = await mkdtemp(join(tmpdir(), 'postvibe-approved-skills-'));
  temporaryDirectories.push(root, skillsRoot);
  await writeFiles(root, {
    'package.json': `${JSON.stringify({
      packageManager: 'npm@11.5.1',
      scripts: {
        build: 'node -e "process.exit(0)"',
        test: directNodeTest ? 'node scripts/direct-test.mjs' : 'fixture-check',
      },
    }, null, 2)}\n`,
    'node_modules/fixture-check/package.json': `${JSON.stringify({
      name: 'fixture-check',
      bin: { 'fixture-check': 'cli.mjs' },
    }, null, 2)}\n`,
    'node_modules/fixture-check/cli.mjs': '#!/usr/bin/env node\nprocess.exit(0);\n',
    'scripts/direct-test.mjs': 'process.exit(0);\n',
    'index.html': '<form><input type="email" name="email"></form>\n',
    'src/index.ts': 'export const account = { email: "person@example.test" };\n',
  });
  await writeFiles(skillsRoot, {
    'launch-essentials/SKILL.md': [
      '---',
      'name: launch-essentials',
      'description: Test launch skill.',
      'license: Apache-2.0',
      '---',
      '',
      '# Launch essentials',
      '',
    ].join('\n'),
    'launch-essentials/readiness.yaml': [
      'schemaVersion: "0.1"',
      'id: launch-essentials',
      'skillVersion: "0.1.0"',
      'domains: [policy-business-essentials, security-privacy]',
      'appliesTo:',
      '  allCapabilities: [collects-personal-data]',
      'modes: [audit, propose, verify]',
      'maxActionLevel: 0',
      'checks: [launch-essentials.privacy-notice]',
      '',
    ].join('\n'),
    'universal-verification/SKILL.md': [
      '---',
      'name: universal-verification',
      'description: Test verification skill.',
      'license: Apache-2.0',
      '---',
      '',
      '# Universal verification',
      '',
    ].join('\n'),
    'universal-verification/readiness.yaml': [
      'schemaVersion: "0.1"',
      'id: universal-verification',
      'skillVersion: "0.1.0"',
      'domains: [data-correctness, maintainability-change-safety, release-delivery]',
      'modes: [verify]',
      'maxActionLevel: 1',
      'checks: [universal-verification.commands]',
      '',
    ].join('\n'),
    'secret-exposure/SKILL.md': [
      '---',
      'name: secret-exposure',
      'description: Test secret exposure skill.',
      'license: Apache-2.0',
      '---',
      '',
      '# Secret exposure',
      '',
    ].join('\n'),
    'secret-exposure/readiness.yaml': [
      'schemaVersion: "0.1"',
      'id: secret-exposure',
      'skillVersion: "0.1.0"',
      'domains: [security-privacy]',
      'modes: [audit, verify]',
      'maxActionLevel: 0',
      'checks: [secret-exposure.scan]',
      '',
    ].join('\n'),
  });
  const planArtifactPath = join(root, 'reports', 'approved-plan.json');
  const outputDirectory = join(root, '.postvibe');
  const plan = await buildVerificationPlan({
    root,
    skillsRoot,
    excludedCommandIds: new Set(),
    outputPath: planArtifactPath,
    now: () => '2026-08-18T12:00:00.000Z',
  });
  await writeFiles(root, {
    'reports/approved-plan.json': `${JSON.stringify(plan, null, 2)}\n`,
  });
  await mkdir(outputDirectory, { recursive: true });
  return { root, skillsRoot, planArtifactPath, outputDirectory, plan };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

function result(commandId: string, status: 'passed' | 'failed' = 'passed'): VerificationCommandResult {
  return {
    commandId,
    status,
    startedAt,
    durationMs: 5,
    exitCode: status === 'passed' ? 0 : 1,
    signal: null,
    output: `${commandId} ${status}\n`,
    outputTruncated: false,
    fileChanges: [],
  };
}

function executorFrom(
  run: (commandId: string, context: ExecuteCommandContext, index: number) => Promise<CommandExecutionResult>,
): CommandExecutor & { calls: string[]; contexts: ExecuteCommandContext[] } {
  const calls: string[] = [];
  const contexts: ExecuteCommandContext[] = [];
  return {
    calls,
    contexts,
    async execute(command, context) {
      const index = calls.length;
      calls.push(command.id);
      contexts.push(context);
      return run(command.id, context, index);
    },
  };
}

function options(
  fixtureValue: Awaited<ReturnType<typeof fixture>>,
  executor: CommandExecutor,
  overrides: Partial<RunApprovedVerificationOptions> = {},
): RunApprovedVerificationOptions {
  return {
    plan: fixtureValue.plan,
    approvedFingerprint: fixtureValue.plan.fingerprint,
    planArtifactPath: fixtureValue.planArtifactPath,
    outputDirectory: fixtureValue.outputDirectory,
    format: 'markdown',
    signal: new AbortController().signal,
    executor,
    now: () => startedAt,
    ...overrides,
  };
}

async function expectNoExecution(executor: { calls: string[] }, promise: Promise<unknown>): Promise<void> {
  await expect(promise).rejects.toThrow();
  expect(executor.calls).toEqual([]);
}

describe('runApprovedVerification pre-execution gates', () => {
  it('rejects a different-length approval without invoking the executor', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor, {
      approvedFingerprint: 'short',
    })));
  });

  it('rejects a same-length wrong approval before invoking the executor', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));
    const wrongApproval = `${planned.plan.fingerprint[0] === 'a' ? 'b' : 'a'}${planned.plan.fingerprint.slice(1)}`;

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor, {
      approvedFingerprint: wrongApproval,
    })));
  });

  it('rejects an invalid plan schema before invoking the executor', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));
    const invalid = structuredClone(planned.plan) as VerificationPlan & { unexpected?: boolean };
    invalid.unexpected = true;

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor, { plan: invalid })));
  });

  it.each([
    ['stale project input', async (planned: Awaited<ReturnType<typeof fixture>>) => {
      await writeFile(join(planned.root, 'src', 'new-module.ts'), 'export const added = true;\n');
    }],
    ['changed selected skill', async (planned: Awaited<ReturnType<typeof fixture>>) => {
      await writeFile(join(planned.skillsRoot, 'universal-verification', 'SKILL.md'), [
        '---',
        'name: universal-verification',
        'description: Changed skill.',
        'license: Apache-2.0',
        '---',
        '',
      ].join('\n'));
    }],
  ])('rejects %s before invoking the executor', async (_label, mutate) => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));
    await mutate(planned);

    await expect(runApprovedVerification(options(planned, executor))).rejects.toThrow(STALE_PLAN_ERROR);
    expect(executor.calls).toEqual([]);
  });

  it('rejects a moved project root before invoking the executor', async () => {
    const planned = await fixture();
    const externalArtifacts = await mkdtemp(join(tmpdir(), 'postvibe-moved-root-plan-'));
    temporaryDirectories.push(externalArtifacts);
    const externalPlanPath = join(externalArtifacts, 'approved-plan.json');
    await writeFile(externalPlanPath, `${JSON.stringify(planned.plan, null, 2)}\n`);
    const movedRoot = `${planned.root}-moved`;
    temporaryDirectories.push(movedRoot);
    await rename(planned.root, movedRoot);
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expect(runApprovedVerification(options(planned, executor, {
      planArtifactPath: externalPlanPath,
    }))).rejects.toThrow(STALE_PLAN_ERROR);
    expect(executor.calls).toEqual([]);
  });

  it('rejects an unsupported toolkit version before invoking the executor', async () => {
    const planned = await fixture();
    const unsupported = structuredClone(planned.plan);
    unsupported.toolkitVersion = '99.0.0';
    unsupported.fingerprint = fingerprintPlan(unsupported);
    unsupported.planId = `pvp-${unsupported.fingerprint.slice(0, 16)}`;
    await writeFile(planned.planArtifactPath, `${JSON.stringify(unsupported, null, 2)}\n`);
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expect(runApprovedVerification(options(planned, executor, {
      plan: unsupported,
      approvedFingerprint: unsupported.fingerprint,
    }))).rejects.toThrow(STALE_PLAN_ERROR);
    expect(executor.calls).toEqual([]);
  });

  it.each([
    ['execution', `${executionId}.execution.json`],
    ['markdown report', `${executionId}.report.md`],
    ['lock', `${executionId}.lock`],
    ['execution temporary', `${executionId}.execution.json.tmp`],
    ['report temporary', `${executionId}.report.md.tmp`],
  ])('preflights an existing %s target before invoking the executor', async (_label, filename) => {
    const planned = await fixture();
    const target = join(planned.outputDirectory, filename);
    await writeFile(target, 'existing artifact\n');
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor)));
    expect(await readFile(target, 'utf8')).toBe('existing artifact\n');
  });

  it('rejects an output path that cannot be linked safely before invoking the executor', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor, {
      outputDirectory: join(planned.outputDirectory, 'line\nbreak'),
    })));
  });
});

describe('runApprovedVerification execution and artifacts', () => {
  it('runs approved commands sequentially, continues after failure, and writes linked deterministic artifacts', async () => {
    const planned = await fixture();
    let active = 0;
    let maximumActive = 0;
    const executor = executorFrom(async (id, _context, index) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      return {
        result: result(id, index === 0 ? 'failed' : 'passed'),
        removedEnvironmentVariables: index === 0
          ? ['Z_TOKEN', 'A_SECRET']
          : ['A_SECRET', 'NODE_OPTIONS'],
      };
    });

    const actual = await runApprovedVerification(options(planned, executor));

    expect(executor.calls).toEqual(planned.plan.commands.map(({ id }) => id));
    expect(maximumActive).toBe(1);
    expect(actual.execution.results.map(({ commandId, status }) => ({ commandId, status }))).toEqual([
      { commandId: 'package-script:build', status: 'failed' },
      { commandId: 'package-script:test', status: 'passed' },
    ]);
    expect(actual.execution.removedEnvironmentVariables).toEqual(['A_SECRET', 'NODE_OPTIONS', 'Z_TOKEN']);
    expect(actual.execution.status).toBe('completed');
    expect(actual.execution.coverageGaps).toEqual(planned.plan.coverageGaps);
    expect(actual.executionPath).toBe(join(planned.outputDirectory, `${executionId}.execution.json`));
    expect(actual.reportPath).toBe(join(planned.outputDirectory, `${executionId}.report.md`));
    expect(actual.report.verification).toEqual({
      planId: planned.plan.planId,
      planFingerprint: planned.plan.fingerprint,
      executionId,
      executionRecordPath: actual.executionPath,
      observationBoundary: actual.execution.observationBoundary,
      approvalBoundary: actual.execution.approvalBoundary,
    });
    expect(await readFile(actual.executionPath, 'utf8')).toBe(`${JSON.stringify(actual.execution, null, 2)}\n`);
    expect(await readFile(actual.reportPath, 'utf8')).toContain('## Local verification');
    await expect(access(join(planned.outputDirectory, `${executionId}.lock`))).rejects.toMatchObject({ code: 'ENOENT' });
    const canonicalPlanArtifactPath = await realpath(planned.planArtifactPath);
    for (const context of executor.contexts) {
      expect(context.excludedArtifactPaths.slice(0, 6)).toEqual([
        canonicalPlanArtifactPath,
        actual.executionPath,
        actual.reportPath,
        join(planned.outputDirectory, `${executionId}.lock`),
        `${actual.executionPath}.tmp`,
        `${actual.reportPath}.tmp`,
      ]);
      const recoveryPath = context.excludedArtifactPaths[6];
      expect(recoveryPath).toMatch(/postvibe-partial-[^/\\]+[/\\]pve-20260818120100000\.execution\.json$/u);
      expect(context.excludedArtifactPaths[7]).toBe(`${recoveryPath}.tmp`);
    }
  });

  it('never starts a later command after an earlier command rewrites its approved source declaration', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id, _context, index) => {
      if (index === 0) {
        const manifest = JSON.parse(await readFile(join(planned.root, 'package.json'), 'utf8')) as {
          scripts: Record<string, string>;
        };
        manifest.scripts.test = 'unapproved replacement';
        await writeFile(join(planned.root, 'package.json'), `${JSON.stringify(manifest, null, 2)}\n`);
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });

    const actual = await runApprovedVerification(options(planned, executor));

    expect(executor.calls).toEqual(['package-script:build']);
    expect(actual.execution.status).toBe('partial');
    expect(actual.execution.results).toEqual([
      result('package-script:build'),
      expect.objectContaining({
        commandId: 'package-script:test',
        status: 'unverified',
        unverifiedReason: expect.stringMatching(/approved source declaration changed/i),
      }),
    ]);
  });

  it('never starts a later command after an earlier command rewrites its fingerprinted launcher entrypoint', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id, _context, index) => {
      if (index === 0) {
        await writeFile(
          join(planned.root, 'node_modules', 'fixture-check', 'cli.mjs'),
          '#!/usr/bin/env node\nprocess.stdout.write("unapproved launcher");\n',
        );
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });

    const actual = await runApprovedVerification(options(planned, executor));

    expect(executor.calls).toEqual(['package-script:build']);
    expect(actual.execution.results[1]).toEqual(expect.objectContaining({
      commandId: 'package-script:test',
      status: 'unverified',
      unverifiedReason: expect.stringMatching(/approved launcher evidence changed/i),
    }));
  });

  it('never starts a direct Node script after an earlier command rewrites that approved entrypoint', async () => {
    const planned = await fixture(true);
    const executor = executorFrom(async (id, _context, index) => {
      if (index === 0) {
        await writeFile(join(planned.root, 'scripts', 'direct-test.mjs'), 'process.exit(1);\n');
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });

    const actual = await runApprovedVerification(options(planned, executor));

    expect(executor.calls).toEqual(['package-script:build']);
    expect(actual.execution.results[1]).toEqual(expect.objectContaining({
      commandId: 'package-script:test',
      status: 'unverified',
      unverifiedReason: expect.stringMatching(/approved launcher evidence changed/i),
    }));
  });

  it('passes the saved plan path only as runtime state context so a new source file still invalidates approval', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await runApprovedVerification(options(planned, executor));
    expect(executor.calls).toHaveLength(2);

    const second = await fixture();
    await writeFile(join(second.root, 'src', 'added-after-plan.ts'), 'export const stale = true;\n');
    const staleExecutor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));
    await expectNoExecution(staleExecutor, runApprovedVerification(options(second, staleExecutor)));
  });

  it('does not allow an added source file to masquerade as the saved plan artifact', async () => {
    const planned = await fixture();
    const ignoredPlanPath = join(planned.outputDirectory, 'approved-plan.json');
    await rename(planned.planArtifactPath, ignoredPlanPath);
    const addedSourcePath = join(planned.root, 'src', 'added-after-plan.ts');
    await writeFile(addedSourcePath, 'export const stale = true;\n');
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor, {
      planArtifactPath: addedSourcePath,
    })));
  });

  it('canonicalizes a relative external plan path before excluding it from project state', async () => {
    const planned = await fixture();
    const ignoredPlanPath = join(planned.outputDirectory, 'approved-plan.json');
    await rename(planned.planArtifactPath, ignoredPlanPath);
    const externalRoot = await mkdtemp(join(process.cwd(), '.postvibe-relative-plan-'));
    temporaryDirectories.push(externalRoot);
    const externalPlanPath = join(externalRoot, 'approved-plan.json');
    await writeFile(externalPlanPath, `${JSON.stringify(planned.plan, null, 2)}\n`);
    const relativeExternalPlanPath = relative(process.cwd(), externalPlanPath);
    await writeFiles(planned.root, {
      [relativeExternalPlanPath]: 'ordinary project input with the same relative path\n',
    });
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor, {
      planArtifactPath: relativeExternalPlanPath,
    })));
  });

  it('turns an abort after completed evidence into explicit remaining unverified evidence and a partial record', async () => {
    const planned = await fixture();
    const controller = new AbortController();
    const executor = executorFrom(async (id) => {
      controller.abort();
      return { result: result(id), removedEnvironmentVariables: ['API_TOKEN'] };
    });

    const actual = await runApprovedVerification(options(planned, executor, { signal: controller.signal }));

    expect(executor.calls).toEqual(['package-script:build']);
    expect(actual.execution.status).toBe('partial');
    expect(actual.execution.results).toEqual([
      result('package-script:build'),
      expect.objectContaining({
        commandId: 'package-script:test',
        status: 'unverified',
        unverifiedReason: expect.stringMatching(/interrupted/i),
      }),
    ]);
    expect(JSON.parse(await readFile(actual.executionPath, 'utf8'))).toEqual(actual.execution);
  });

  it('records interruption rather than an executor failure when an abort makes the executor reject', async () => {
    const planned = await fixture();
    const controller = new AbortController();
    const executor = executorFrom(async () => {
      controller.abort();
      throw new Error('abort-specific executor detail');
    });

    const actual = await runApprovedVerification(options(planned, executor, { signal: controller.signal }));

    expect(actual.execution.status).toBe('partial');
    expect(actual.execution.results).toHaveLength(planned.plan.commands.length);
    expect(actual.execution.results).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: 'unverified', unverifiedReason: expect.stringMatching(/interrupted/i) }),
    ]));
    expect(JSON.stringify(actual.execution)).not.toContain('abort-specific executor detail');
  });

  it('preserves completed evidence and marks all unreached commands unverified after an unexpected executor error', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id, _context, index) => {
      if (index === 1) throw new Error('project-controlled secret text');
      return { result: result(id), removedEnvironmentVariables: [] };
    });

    const actual = await runApprovedVerification(options(planned, executor));

    expect(actual.execution.status).toBe('partial');
    expect(actual.execution.results[0]).toEqual(result('package-script:build'));
    expect(actual.execution.results[1]).toEqual(expect.objectContaining({
      commandId: 'package-script:test',
      status: 'unverified',
      unverifiedReason: expect.stringMatching(/outcome.*unavailable.*may have run/i),
    }));
    expect(JSON.stringify(actual.execution)).not.toContain('project-controlled secret text');
  });

  it('distinguishes the possibly-run rejected command from later commands that were not run', async () => {
    const planned = await fixture();
    const executor = executorFrom(async () => {
      throw new Error('post-command snapshot rejected');
    });

    const actual = await runApprovedVerification(options(planned, executor));

    expect(actual.execution.results).toEqual([
      expect.objectContaining({
        commandId: 'package-script:build',
        status: 'unverified',
        unverifiedReason: expect.stringMatching(/outcome.*unavailable.*may have run/i),
      }),
      expect.objectContaining({
        commandId: 'package-script:test',
        status: 'unverified',
        unverifiedReason: expect.stringMatching(/not run/i),
      }),
    ]);
    expect(JSON.stringify(actual.execution)).not.toContain('post-command snapshot rejected');
  });

  it('rejects swapped executor result IDs as sanitized partial evidence before accumulation', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (_id, _context, index) => ({
      result: result(index === 0 ? 'package-script:test' : 'package-script:build'),
      removedEnvironmentVariables: [],
    }));

    const actual = await runApprovedVerification(options(planned, executor));

    expect(executor.calls).toEqual(['package-script:build']);
    expect(actual.execution.status).toBe('partial');
    expect(actual.execution.results.map(({ commandId }) => commandId)).toEqual([
      'package-script:build',
      'package-script:test',
    ]);
    expect(actual.execution.results[0]).toEqual(expect.objectContaining({
      status: 'unverified',
      unverifiedReason: expect.stringMatching(/outcome.*unavailable.*may have run/i),
    }));
    expect(JSON.stringify(actual.execution)).not.toContain('swapped');
  });

  it('re-redacts and re-bounds replacement-executor output at the recorder boundary', async () => {
    const planned = await fixture();
    const rawCredential = 'pvc-controlled-recorder-secret';
    const executor = executorFrom(async (id) => ({
      result: {
        ...result(id),
        output: `API_TOKEN=${rawCredential}\n${'x'.repeat(300_000)}`,
        outputTruncated: false,
      },
      removedEnvironmentVariables: [],
    }));

    const actual = await runApprovedVerification(options(planned, executor));

    expect(actual.execution.results[0]!.output).not.toContain(rawCredential);
    expect(Buffer.byteLength(actual.execution.results[0]!.output, 'utf8')).toBeLessThanOrEqual(262_144);
    expect(actual.execution.results[0]!.outputTruncated).toBe(true);
    expect(await readFile(actual.executionPath, 'utf8')).not.toContain(rawCredential);
  });

  it('does not persist later lines from a replacement executor truncated inside a private key', async () => {
    const planned = await fixture();
    const secondKeyLine = 'RECORDER_SECOND_KEY_LINE_6nT3';
    const thirdKeyLine = 'RECORDER_THIRD_KEY_LINE_8pW5';
    const executor = executorFrom(async (id) => ({
      result: {
        ...result(id),
        output: [
          'safe-prefix',
          '-----BEGIN PRIVATE KEY-----',
          'A'.repeat(300_000),
          secondKeyLine,
          thirdKeyLine,
          '',
        ].join('\n'),
        outputTruncated: true,
      },
      removedEnvironmentVariables: [],
    }));

    const actual = await runApprovedVerification(options(planned, executor));
    const persisted = JSON.parse(
      await readFile(actual.executionPath, 'utf8'),
    ) as VerificationExecution;
    const persistedOutput = persisted.results[0]!.output;

    expect(actual.execution.results[0]!.output).toContain('[REDACTED]');
    expect(actual.execution.results[0]!.output).not.toContain(secondKeyLine);
    expect(actual.execution.results[0]!.output).not.toContain(thirdKeyLine);
    expect(persistedOutput).toContain('[REDACTED]');
    expect(persistedOutput).not.toContain(secondKeyLine);
    expect(persistedOutput).not.toContain(thirdKeyLine);
  });

  it('turns contradictory replacement-executor evidence into sanitized partial evidence', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({
      result: {
        ...result(id),
        status: 'passed',
        exitCode: 9,
        unverifiedReason: 'API_TOKEN=pvc-controlled-contradictory-secret',
      },
      removedEnvironmentVariables: [],
    }));

    const actual = await runApprovedVerification(options(planned, executor));

    expect(executor.calls).toEqual(['package-script:build']);
    expect(actual.execution.status).toBe('partial');
    expect(actual.execution.results).toEqual([
      expect.objectContaining({
        commandId: 'package-script:build',
        status: 'unverified',
        unverifiedReason: expect.stringMatching(/executor returned contradictory evidence/i),
      }),
      expect.objectContaining({ commandId: 'package-script:test', status: 'unverified' }),
    ]);
    expect(JSON.stringify(actual.execution)).not.toContain('pvc-controlled-contradictory-secret');
    expect(JSON.parse(await readFile(actual.executionPath, 'utf8'))).toEqual(actual.execution);
  });

  it('records unsafe replacement-executor structure as partial evidence and releases its lock', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => {
      const unsafe = result(id);
      unsafe.fileChanges = [
        { path: 'z-last.ts', kind: 'added' },
        { path: 'a-first.ts', kind: 'added' },
      ];
      return { result: unsafe, removedEnvironmentVariables: [] };
    });
    const lockPath = join(planned.outputDirectory, `${executionId}.lock`);

    const actual = await runApprovedVerification(options(planned, executor));

    expect(actual.execution.status).toBe('partial');
    expect(actual.execution.results[0]).toEqual(expect.objectContaining({
      status: 'unverified',
      unverifiedReason: expect.stringMatching(/contradictory evidence/i),
    }));
    await expect(access(lockPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('fails lock release closed and preserves a foreign lock-path replacement', async () => {
    const planned = await fixture();
    const lockPath = join(planned.outputDirectory, `${executionId}.lock`);
    const executor = executorFrom(async (id, _context, index) => {
      if (index === 0) {
        await unlink(lockPath);
        await writeFile(lockPath, 'foreign replacement lock\n');
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });

    await expect(runApprovedVerification(options(planned, executor))).rejects.toThrow(/ownership/i);

    expect(await readFile(lockPath, 'utf8')).toBe('foreign replacement lock\n');
  });

  it('runs the fresh Level 0 review after commands change the resulting tree', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id, context, index) => {
      if (index === 0) await writeFile(join(context.root, 'privacy.md'), '# Privacy\n');
      return { result: result(id), removedEnvironmentVariables: [] };
    });

    const actual = await runApprovedVerification(options(planned, executor));

    expect(planned.plan.planningReport.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'launch-essentials.privacy-notice-missing' }),
    ]));
    expect(actual.report.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'launch-essentials.privacy-notice-candidate-found' }),
    ]));
  });

  it('publishes only validated partial execution evidence when the post-command manifest is corrupt', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id, _context, index) => {
      if (index === planned.plan.commands.length - 1) {
        await writeFile(join(planned.root, 'package.json'), '{ invalid manifest');
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });
    let failure: unknown;

    try {
      await runApprovedVerification(options(planned, executor));
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'VerificationPostProcessingError',
      executionPath: join(planned.outputDirectory, `${executionId}.execution.json`),
    });
    const persisted = JSON.parse(await readFile(
      join(planned.outputDirectory, `${executionId}.execution.json`),
      'utf8',
    )) as { status: string; coverageGaps: Array<{ id: string }> };
    expect(persisted.status).toBe('partial');
    expect(persisted.coverageGaps.at(-1)?.id).toBe('orchestration.post-processing');
    await expect(access(join(planned.outputDirectory, `${executionId}.report.md`))).rejects.toMatchObject({ code: 'ENOENT' });
    expect(JSON.stringify(failure)).not.toContain('invalid manifest');
  });

  it('rolls back staged completed evidence and publishes partial execution when the report target is occupied after preflight', async () => {
    const planned = await fixture();
    const reportPath = join(planned.outputDirectory, `${executionId}.report.md`);
    const executor = executorFrom(async (id, _context, index) => {
      if (index === planned.plan.commands.length - 1) {
        await writeFile(reportPath, 'foreign report target\n');
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });
    let failure: unknown;

    try {
      await runApprovedVerification(options(planned, executor));
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'VerificationPostProcessingError',
      executionPath: join(planned.outputDirectory, `${executionId}.execution.json`),
    });
    const persisted = JSON.parse(await readFile(
      join(planned.outputDirectory, `${executionId}.execution.json`),
      'utf8',
    )) as { status: string; coverageGaps: Array<{ id: string }> };
    expect(persisted.status).toBe('partial');
    expect(persisted.coverageGaps.at(-1)?.id).toBe('orchestration.post-processing');
    expect(await readFile(reportPath, 'utf8')).toBe('foreign report target\n');
  });

  it('recovers partial evidence when a command occupies the final execution path', async () => {
    const planned = await fixture();
    const plannedExecutionPath = join(planned.outputDirectory, `${executionId}.execution.json`);
    const plannedReportPath = join(planned.outputDirectory, `${executionId}.report.md`);
    const executor = executorFrom(async (id, _context, index) => {
      if (index === 0) await writeFile(plannedExecutionPath, 'foreign execution target\n');
      return { result: result(id), removedEnvironmentVariables: [] };
    });
    let failure: unknown;

    try {
      await runApprovedVerification(options(planned, executor));
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'VerificationPostProcessingError',
      execution: expect.objectContaining({ status: 'partial' }),
      executionPath: expect.stringContaining('postvibe-partial-'),
    });
    const recoveryPath = (failure as { executionPath?: unknown }).executionPath;
    expect(typeof recoveryPath).toBe('string');
    if (typeof recoveryPath !== 'string') throw new Error('Collision recovery path was not published.');
    expect(recoveryPath).not.toBe(plannedExecutionPath);
    const recoveredExecution = JSON.parse(await readFile(recoveryPath, 'utf8')) as VerificationExecution;
    expect(await readFile(plannedExecutionPath, 'utf8')).toBe('foreign execution target\n');
    expect(await validateVerificationExecution(recoveredExecution)).toEqual({ ok: true });
    expect(recoveredExecution.coverageGaps).toContainEqual(ORCHESTRATION_COVERAGE_GAP);
    await expect(access(plannedReportPath)).rejects.toMatchObject({ code: 'ENOENT' });
    const stableOutputEntries = await readdir(planned.outputDirectory);
    expect(stableOutputEntries.filter((entry) => entry.endsWith('.tmp') || entry.endsWith('.lock'))).toEqual([]);
    temporaryDirectories.push(dirname(recoveryPath));
  });

  it('does not scan a replacement root and publishes sanitized partial evidence to an external artifact boundary', async () => {
    const planned = await fixture();
    const externalOutput = await mkdtemp(join(tmpdir(), 'postvibe-root-drift-output-'));
    const movedRoot = `${planned.root}-moved-after-command`;
    temporaryDirectories.push(externalOutput, movedRoot);
    const executor = executorFrom(async (id, _context, index) => {
      if (index === planned.plan.commands.length - 1) {
        await rename(planned.root, movedRoot);
        await mkdir(planned.root);
        await writeFile(join(planned.root, 'replacement-secret.ts'), "export const apiKey = 'must-not-be-scanned';\n");
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });
    let failure: unknown;

    try {
      await runApprovedVerification(options(planned, executor, { outputDirectory: externalOutput }));
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({
      name: 'VerificationPostProcessingError',
      executionPath: join(externalOutput, `${executionId}.execution.json`),
    });
    const persisted = await readFile(join(externalOutput, `${executionId}.execution.json`), 'utf8');
    expect(JSON.parse(persisted)).toMatchObject({
      status: 'partial',
      coverageGaps: expect.arrayContaining([
        expect.objectContaining({ id: 'orchestration.post-processing' }),
      ]),
    });
    expect(persisted).not.toContain('must-not-be-scanned');
    await expect(access(join(externalOutput, `${executionId}.report.md`))).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('uses a stable recovery boundary when root drift moves the requested artifact directory', async () => {
    const planned = await fixture();
    const movedRoot = `${planned.root}-moved-with-artifacts`;
    temporaryDirectories.push(movedRoot);
    const executor = executorFrom(async (id, _context, index) => {
      if (index === planned.plan.commands.length - 1) {
        await rename(planned.root, movedRoot);
        await mkdir(planned.root);
        await writeFile(join(planned.root, 'replacement-secret.ts'), "export const apiKey = 'must-not-be-scanned';\n");
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });
    let failure: unknown;

    try {
      await runApprovedVerification(options(planned, executor));
    } catch (error) {
      failure = error;
    }

    expect(failure).toMatchObject({ name: 'VerificationPostProcessingError' });
    const recoveryPath = (failure as { executionPath?: unknown }).executionPath;
    expect(typeof recoveryPath).toBe('string');
    if (typeof recoveryPath !== 'string') throw new Error('Root-drift recovery path was not published.');
    expect(recoveryPath).not.toBe(join(planned.outputDirectory, `${executionId}.execution.json`));
    expect(recoveryPath.endsWith(`${executionId}.execution.json`)).toBe(true);
    const persisted = await readFile(recoveryPath, 'utf8');
    expect(JSON.parse(persisted)).toMatchObject({
      status: 'partial',
      coverageGaps: expect.arrayContaining([
        expect.objectContaining({ id: 'orchestration.post-processing' }),
      ]),
    });
    expect(persisted).not.toContain('must-not-be-scanned');
    temporaryDirectories.push(dirname(recoveryPath));
  });

  it('keeps artifact JSON out of the fresh Level 0 scan in an ordinary output directory', async () => {
    const planned = await fixture();
    planned.plan.planningReport.manifest.artifacts[0]!.evidence[0]!.summary = (
      "apiKey='artifact-only-controlled-value'"
    );
    planned.plan.fingerprint = fingerprintPlan(planned.plan);
    planned.plan.planId = `pvp-${planned.plan.fingerprint.slice(0, 16)}`;
    await writeFile(planned.planArtifactPath, `${JSON.stringify(planned.plan, null, 2)}\n`);
    const executor = executorFrom(async (id, context, index) => {
      if (index === 0) {
        await writeFile(join(context.root, 'src', 'generated.ts'), "export const apiKey = 'command-tree-controlled-value';\n");
      }
      return { result: result(id), removedEnvironmentVariables: [] };
    });

    const actual = await runApprovedVerification(options(planned, executor, {
      approvedFingerprint: planned.plan.fingerprint,
      outputDirectory: join(planned.root, 'reports'),
    }));

    const secretLocations = actual.report.findings
      .filter(({ checkId }) => checkId === 'secret-exposure.scan')
      .flatMap(({ evidence }) => evidence.map(({ location }) => location));
    expect(secretLocations).toEqual(['src/generated.ts:1']);
  });

  it('uses the deterministic JSON report target when requested', async () => {
    const planned = await fixture();
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    const actual = await runApprovedVerification(options(planned, executor, { format: 'json' }));

    expect(actual.reportPath).toBe(join(planned.outputDirectory, `${executionId}.report.json`));
    expect(JSON.parse(await readFile(actual.reportPath, 'utf8'))).toEqual(actual.report);
  });
});
