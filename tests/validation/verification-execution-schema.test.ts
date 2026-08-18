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
