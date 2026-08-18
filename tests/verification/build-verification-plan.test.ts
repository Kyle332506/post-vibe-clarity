import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { validateVerificationPlan } from '../../src/validation/verification-plan-schema.js';
import { buildVerificationPlan } from '../../src/verification/build-verification-plan.js';

const temporaryDirectories: string[] = [];

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }));
}

async function fixture(): Promise<{ root: string; skillsRoot: string }> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-plan-project-'));
  const skillsRoot = await mkdtemp(join(tmpdir(), 'postvibe-plan-skills-'));
  temporaryDirectories.push(root, skillsRoot);
  await writeFiles(root, {
    'package.json': `${JSON.stringify({ packageManager: 'npm@11.5.1', scripts: { build: 'compile', test: 'check' } }, null, 2)}\n`,
    'src/index.ts': 'export const answer = 42;\n',
  });
  await writeFiles(skillsRoot, {
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
      'domains: [release-delivery]',
      'modes: [verify]',
      'maxActionLevel: 1',
      'checks: [universal-verification.commands]',
      '',
    ].join('\n'),
  });
  return { root, skillsRoot };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('buildVerificationPlan', () => {
  it('builds schema-valid stable approvals independent of timestamps and output paths', async () => {
    const { root, skillsRoot } = await fixture();
    const first = await buildVerificationPlan({
      root,
      skillsRoot,
      excludedCommandIds: new Set(),
      outputPath: join(root, 'first-plan.json'),
      now: () => '2026-08-18T12:00:00.000Z',
    });
    const second = await buildVerificationPlan({
      root,
      skillsRoot,
      excludedCommandIds: new Set(),
      outputPath: join(root, 'different-plan.json'),
      now: () => '2026-08-19T12:00:00.000Z',
    });

    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.planId).toBe(first.planId);
    expect(second.generatedAt).not.toBe(first.generatedAt);
    expect(first.planId).toBe(`pvp-${first.fingerprint.slice(0, 16)}`);
    expect(first.executionPolicy).toEqual({
      environmentPolicyVersion: 'env-filter/0.1',
      outputLimitBytes: 262144,
      executor: 'local-process/0.1',
    });
    expect(await validateVerificationPlan(first)).toEqual({ ok: true });
    expect(first.skillDigests.map(({ location }) => location)).toEqual([
      'universal-verification/readiness.yaml',
      'universal-verification/SKILL.md',
    ]);
  });

  it('retains approved exclusions and matching gaps', async () => {
    const { root, skillsRoot } = await fixture();
    const plan = await buildVerificationPlan({
      root,
      skillsRoot,
      excludedCommandIds: new Set(['package-script:test']),
      outputPath: join(root, 'plan.json'),
      now: () => '2026-08-18T12:00:00.000Z',
    });

    expect(plan.commands.map(({ id }) => id)).toEqual(['package-script:build']);
    expect(plan.excludedCommands.map(({ id }) => id)).toEqual(['package-script:test']);
    expect(plan.coverageGaps).toContainEqual({
      id: 'command.package-script:test',
      category: 'test',
      reason: 'The declared test command was excluded from this plan.',
      workspace: '.',
    });
  });

  it('rejects an exclusion that discovery did not produce', async () => {
    const { root, skillsRoot } = await fixture();

    await expect(buildVerificationPlan({
      root,
      skillsRoot,
      excludedCommandIds: new Set(['unknown-command']),
      outputPath: join(root, 'plan.json'),
    })).rejects.toThrow(/unknown command id/i);
  });
});
