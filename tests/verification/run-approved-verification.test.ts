import { access, mkdir, mkdtemp, readFile, realpath, rename, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerificationCommandResult, VerificationPlan } from '../../src/model/verification.js';
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

async function fixture(): Promise<{
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
      scripts: { build: 'compile', test: 'check' },
    }, null, 2)}\n`,
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

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor)));
  });

  it('rejects a moved project root before invoking the executor', async () => {
    const planned = await fixture();
    const movedRoot = `${planned.root}-moved`;
    temporaryDirectories.push(movedRoot);
    await rename(planned.root, movedRoot);
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor)));
  });

  it('rejects an unsupported toolkit version before invoking the executor', async () => {
    const planned = await fixture();
    const unsupported = structuredClone(planned.plan);
    unsupported.toolkitVersion = '99.0.0';
    unsupported.fingerprint = fingerprintPlan(unsupported);
    unsupported.planId = `pvp-${unsupported.fingerprint.slice(0, 16)}`;
    const executor = executorFrom(async (id) => ({ result: result(id), removedEnvironmentVariables: [] }));

    await expectNoExecution(executor, runApprovedVerification(options(planned, executor, {
      plan: unsupported,
      approvedFingerprint: unsupported.fingerprint,
    })));
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
    });
    expect(await readFile(actual.executionPath, 'utf8')).toBe(`${JSON.stringify(actual.execution, null, 2)}\n`);
    expect(await readFile(actual.reportPath, 'utf8')).toContain('## Local verification');
    await expect(access(join(planned.outputDirectory, `${executionId}.lock`))).rejects.toMatchObject({ code: 'ENOENT' });
    const canonicalPlanArtifactPath = await realpath(planned.planArtifactPath);
    for (const context of executor.contexts) {
      expect(context.excludedArtifactPaths).toEqual([
        canonicalPlanArtifactPath,
        actual.executionPath,
        actual.reportPath,
        join(planned.outputDirectory, `${executionId}.lock`),
        `${actual.executionPath}.tmp`,
        `${actual.reportPath}.tmp`,
      ]);
    }
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

  it('releases its acquired lock when unsafe executor output prevents a valid partial record', async () => {
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

    await expect(runApprovedVerification(options(planned, executor))).rejects.toThrow(/validation|linkage/i);

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

  it('keeps artifact JSON out of the fresh Level 0 scan in an ordinary output directory', async () => {
    const planned = await fixture();
    planned.plan.containmentWarning = "apiKey='artifact-only-controlled-value'";
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
