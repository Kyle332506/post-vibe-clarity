import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';
import * as planSchemaModule from '../../src/validation/verification-plan-schema.js';
import { sampleVerificationPlan } from '../fixtures/sample-verification-plan.js';

const { validateVerificationPlan } = planSchemaModule;

async function invalidErrors(input: unknown): Promise<string[]> {
  const result = await validateVerificationPlan(input);
  expect(result.ok).toBe(false);
  if (result.ok) throw new Error('expected invalid verification plan');
  return result.errors;
}

describe('validateVerificationPlan', () => {
  it('accepts the canonical verification plan fixture', async () => {
    expect(await validateVerificationPlan(sampleVerificationPlan)).toEqual({ ok: true });
  });

  it('rejects unknown fields throughout the strict plan contract', async () => {
    const input = structuredClone(sampleVerificationPlan) as unknown as Record<string, unknown>;
    Reflect.set(input, 'readinessScore', 100);
    const commands = Reflect.get(input, 'commands') as Array<Record<string, unknown>>;
    Reflect.set(commands[0] ?? {}, 'shell', true);

    const errors = await invalidErrors(input);

    expect(errors.filter((error) => error.includes('additional properties'))).toHaveLength(2);
  });

  it('rejects duplicate command IDs across selected and excluded commands', async () => {
    const input = structuredClone(sampleVerificationPlan);
    const selected = input.commands[0];
    if (!selected) throw new Error('expected selected command');
    input.excludedCommands[0] = structuredClone(selected);

    expect(await invalidErrors(input)).toContain('/commands duplicate id package-script:build');
  });

  it('rejects invalid command categories', async () => {
    const input = structuredClone(sampleVerificationPlan) as unknown as Record<string, unknown>;
    const commands = Reflect.get(input, 'commands') as Array<Record<string, unknown>>;
    Reflect.set(commands[0] ?? {}, 'category', 'security-scan');

    expect((await invalidErrors(input)).join('\n')).toContain('/commands/0/category');
  });

  it.each([0, 3601])('rejects timeoutSeconds outside 1 through 3600: %s', async (timeoutSeconds) => {
    const input = structuredClone(sampleVerificationPlan);
    const command = input.commands[0];
    if (!command) throw new Error('expected selected command');
    command.timeoutSeconds = timeoutSeconds;

    expect((await invalidErrors(input)).join('\n')).toContain('/commands/0/timeoutSeconds');
  });

  it('rejects a plan ID that is not derived from the fingerprint', async () => {
    const input = structuredClone(sampleVerificationPlan);
    input.planId = 'pvp-bbbbbbbbbbbbbbbb';

    expect(await invalidErrors(input)).toContain('/planId must equal pvp-${fingerprint.slice(0, 16)}');
  });

  it('rejects duplicate input locations and non-sorted digest arrays', async () => {
    const duplicateInput = structuredClone(sampleVerificationPlan);
    duplicateInput.inputDigests[1] = structuredClone(duplicateInput.inputDigests[0]!);
    expect(await invalidErrors(duplicateInput)).toContain('/inputDigests duplicate location package.json');

    const unsortedSkills = structuredClone(sampleVerificationPlan);
    unsortedSkills.skillDigests.reverse();
    expect(await invalidErrors(unsortedSkills)).toContain('/skillDigests must be sorted by location');
  });

  it('rejects an excluded command without a matching coverage gap', async () => {
    const input = structuredClone(sampleVerificationPlan);
    input.coverageGaps = input.coverageGaps.filter(({ id }) => id !== 'command.package-script:lint');

    expect(await invalidErrors(input)).toContain('/excludedCommands/package-script:lint must have a matching coverage gap');
  });

  it('requires each command category assessment exactly once', async () => {
    const missing = structuredClone(sampleVerificationPlan);
    missing.categoryAssessments = missing.categoryAssessments.filter(({ category }) => category !== 'lint');
    expect(await invalidErrors(missing)).toContain('/categoryAssessments must contain each command category exactly once');

    const duplicate = structuredClone(sampleVerificationPlan);
    duplicate.categoryAssessments[3] = structuredClone(duplicate.categoryAssessments[0]!);
    expect(await invalidErrors(duplicate)).toContain('/categoryAssessments must contain each command category exactly once');
  });

  it('selects one package-local versioned schema path for source and compiled layouts', () => {
    const packageRoot = join('/opt', 'postvibe');
    const expected = join(packageRoot, 'schemas', 'verification-plan-0.1.schema.json');

    expect(planSchemaModule.resolveVerificationPlanSchemaPath(
      pathToFileURL(join(packageRoot, 'src', 'validation', 'verification-plan-schema.ts')),
    )).toBe(expected);
    expect(planSchemaModule.resolveVerificationPlanSchemaPath(
      pathToFileURL(join(packageRoot, 'dist', 'src', 'validation', 'verification-plan-schema.js')),
    )).toBe(expected);
  });
});
