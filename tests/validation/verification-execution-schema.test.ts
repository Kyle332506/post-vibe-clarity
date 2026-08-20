import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as executionSchemaModule from '../../src/validation/verification-execution-schema.js';
import { sampleVerificationExecution } from '../fixtures/sample-verification-execution.js';
import { sampleVerificationPlan } from '../fixtures/sample-verification-plan.js';

const { validateExecutionAgainstPlan, validateVerificationExecution } = executionSchemaModule;

async function invalidErrors(input: unknown): Promise<string[]> {
  const result = await validateVerificationExecution(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected invalid verification execution');
  return result.errors;
}

describe('validateVerificationExecution', () => {
  it('accepts a versioned observation boundary that states every traversal exclusion and root identity', async () => {
    const input = {
      ...structuredClone(sampleVerificationExecution),
      observationBoundary: {
        policyVersion: 'project-observation/0.1',
        rootIdentity: { realPath: '/example/project', device: '1', inode: '2' },
        versionControlDirectories: ['.git'],
        artifactDirectories: ['.postvibe'],
        coverageDirectories: ['coverage'],
        distributionDirectories: ['dist'],
        dependencyDirectories: ['node_modules'],
        exactArtifactExclusions: ['/example/project/.postvibe/execution.json'],
        symlinks: 'not-followed',
        nonRegularFiles: 'not-observed',
        inaccessiblePaths: 'observation-fails',
        metadata: 'content-sha256-only',
      },
    };

    expect(await validateVerificationExecution(input)).toEqual({ ok: true });
  });

  it('accepts the canonical verification execution fixture', async () => {
    expect(await validateVerificationExecution(sampleVerificationExecution)).toEqual({ ok: true });
    expect(validateExecutionAgainstPlan(sampleVerificationExecution, sampleVerificationPlan)).toEqual([]);
  });

  it('rejects unknown fields throughout the strict execution contract', async () => {
    const input = structuredClone(sampleVerificationExecution) as unknown as Record<string, unknown>;
    Reflect.set(input, 'verdict', 'launch');
    const results = Reflect.get(input, 'results') as Array<Record<string, unknown>>;
    Reflect.set(results[0] ?? {}, 'rawOutput', 'secret');

    const errors = await invalidErrors(input);

    expect(errors.filter((error) => error.includes('additional properties'))).toHaveLength(2);
  });

  it('rejects changed disclaimer wording', async () => {
    const input = structuredClone(sampleVerificationExecution);
    input.disclaimer = 'This report reduces uncertainty but certifies the application.';

    expect((await invalidErrors(input)).join('\n')).toContain('/disclaimer');
  });

  it('requires the exact policy-versioned containment warning', async () => {
    const input = structuredClone(sampleVerificationExecution);
    input.containmentWarning = `${input.containmentWarning} Changed.`;

    expect((await invalidErrors(input)).join('\n')).toContain('/containmentWarning');
  });

  it('requires completedAt to be at or after startedAt', async () => {
    const input = structuredClone(sampleVerificationExecution);
    input.completedAt = '2026-08-18T12:00:59.999Z';

    expect(await invalidErrors(input)).toContain('/completedAt must be at or after /startedAt');
  });

  it('enforces the complete command status evidence matrix', async () => {
    const cases: Array<{
      label: string;
      mutate: (result: typeof sampleVerificationExecution.results[number]) => void;
    }> = [
      { label: 'passed with nonzero exit', mutate: (result) => { result.exitCode = 1; } },
      { label: 'failed with zero exit', mutate: (result) => {
        result.status = 'failed';
        result.exitCode = 0;
      } },
      { label: 'failed with an unverified reason', mutate: (result) => {
        result.status = 'failed';
        result.exitCode = 1;
        result.unverifiedReason = 'Contradictory reason.';
      } },
      { label: 'timed out without reason', mutate: (result) => {
        result.status = 'timed-out';
        result.exitCode = null;
      } },
      { label: 'could not start with an exit', mutate: (result) => {
        result.status = 'could-not-start';
        result.exitCode = 1;
        result.unverifiedReason = 'Could not start.';
      } },
      { label: 'interrupted without reason', mutate: (result) => {
        result.status = 'interrupted';
        result.exitCode = null;
      } },
      { label: 'unverified with process timing', mutate: (result) => {
        result.status = 'unverified';
        result.exitCode = null;
        result.unverifiedReason = 'No evidence.';
      } },
    ];

    for (const { label, mutate } of cases) {
      const input = structuredClone(sampleVerificationExecution);
      input.status = input.results[0]!.status === 'unverified' ? 'partial' : input.status;
      mutate(input.results[0]!);
      if (input.results[0]!.status === 'unverified' || input.results[0]!.status === 'interrupted') {
        input.status = 'partial';
      }
      expect((await invalidErrors(input)).join('\n'), label).toContain(
        '/results/package-script:build status evidence is contradictory',
      );
    }
  });

  it('rejects duplicate command result IDs', async () => {
    const input = structuredClone(sampleVerificationExecution);
    input.results[1] = structuredClone(input.results[0]!);

    expect(await invalidErrors(input)).toContain('/results duplicate commandId package-script:build');
  });

  it('rejects completed executions containing interrupted or unverified results', async () => {
    for (const status of ['interrupted', 'unverified'] as const) {
      const input = structuredClone(sampleVerificationExecution);
      input.results[0]!.status = status;
      expect(await invalidErrors(input)).toContain(`/status completed execution cannot contain ${status} results`);
    }
  });

  it('rejects non-sorted removed environment names and file changes', async () => {
    const environment = structuredClone(sampleVerificationExecution);
    environment.removedEnvironmentVariables.reverse();
    expect(await invalidErrors(environment)).toContain('/removedEnvironmentVariables must be sorted');

    const changes = structuredClone(sampleVerificationExecution);
    changes.results[1]!.fileChanges.reverse();
    expect(await invalidErrors(changes)).toContain('/results/package-script:test/fileChanges must be sorted by path');
  });

  it('rejects output larger than 262,144 UTF-8 bytes even below the character backstop', async () => {
    const input = structuredClone(sampleVerificationExecution);
    input.results[0]!.output = '\u{1f642}'.repeat(65_537);

    expect(await invalidErrors(input)).toContain('/results/package-script:build/output must not exceed 262144 UTF-8 bytes');
  });

  it('rejects results absent from the selected plan and missing selected results', () => {
    const unknown = structuredClone(sampleVerificationExecution);
    unknown.results[0]!.commandId = 'package-script:unknown';
    expect(validateExecutionAgainstPlan(unknown, sampleVerificationPlan)).toContain(
      '/results/package-script:unknown must reference a selected plan command',
    );

    const missing = structuredClone(sampleVerificationExecution);
    missing.results = missing.results.filter(({ commandId }) => commandId !== 'package-script:test');
    expect(validateExecutionAgainstPlan(missing, sampleVerificationPlan)).toContain(
      '/results must contain selected command package-script:test',
    );
  });

  it('requires exact ordered results and exact plan coverage gaps', () => {
    const reordered = structuredClone(sampleVerificationExecution);
    reordered.results.reverse();
    expect(validateExecutionAgainstPlan(reordered, sampleVerificationPlan)).toContain(
      '/results must match selected plan commands in exact order',
    );

    const extraGap = structuredClone(sampleVerificationExecution);
    extraGap.coverageGaps.push({ id: 'unexpected.gap', reason: 'Unexpected.' });
    expect(validateExecutionAgainstPlan(extraGap, sampleVerificationPlan)).toContain(
      '/coverageGaps must exactly match plan coverage gaps or the allowed orchestration gap',
    );
  });

  it('rejects plan ID and fingerprint linkage mismatches', () => {
    const input = structuredClone(sampleVerificationExecution);
    input.planId = 'pvp-bbbbbbbbbbbbbbbb';
    input.planFingerprint = 'b'.repeat(64);

    expect(validateExecutionAgainstPlan(input, sampleVerificationPlan)).toEqual(expect.arrayContaining([
      '/planId must match the verification plan',
      '/planFingerprint must match the verification plan fingerprint',
    ]));
  });

  it('selects one package-local versioned schema path for source and compiled layouts', () => {
    const packageRoot = join('/opt', 'postvibe');
    const expected = join(packageRoot, 'schemas', 'verification-execution-0.1.schema.json');

    expect(executionSchemaModule.resolveVerificationExecutionSchemaPath(
      pathToFileURL(join(packageRoot, 'src', 'validation', 'verification-execution-schema.ts')),
    )).toBe(expected);
    expect(executionSchemaModule.resolveVerificationExecutionSchemaPath(
      pathToFileURL(join(packageRoot, 'dist', 'src', 'validation', 'verification-execution-schema.js')),
    )).toBe(expected);
  });
});
