import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { VerificationPlan } from '../../src/model/verification.js';
import { buildVerificationPlan } from '../../src/verification/build-verification-plan.js';
import { validatePlanState } from '../../src/verification/validate-plan-state.js';

const STALE_ERROR = 'Verification plan is stale; create and approve a new plan.';
const temporaryDirectories: string[] = [];

async function writeFiles(root: string, files: Record<string, string>): Promise<void> {
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }));
}

async function plannedFixture(files: Record<string, string> = {}): Promise<{
  plan: VerificationPlan;
  root: string;
  skillsRoot: string;
}> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-stale-project-'));
  const skillsRoot = await mkdtemp(join(tmpdir(), 'postvibe-stale-skills-'));
  temporaryDirectories.push(root, skillsRoot);
  await writeFiles(root, {
    'package.json': `${JSON.stringify({ packageManager: 'npm@11.5.1', scripts: { build: 'compile' } }, null, 2)}\n`,
    'src/index.ts': 'export const answer = 42;\n',
    ...files,
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
  const plan = await buildVerificationPlan({
    root,
    skillsRoot,
    excludedCommandIds: new Set(),
    outputPath: join(root, '.postvibe', 'plan.json'),
    now: () => '2026-08-18T12:00:00.000Z',
  });
  return { plan, root, skillsRoot };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('validatePlanState', () => {
  it('accepts an unchanged current plan', async () => {
    const { plan } = await plannedFixture();

    await expect(validatePlanState(plan)).resolves.toBeUndefined();
  });

  it.each([
    ['source input', async ({ root }: Awaited<ReturnType<typeof plannedFixture>>) => {
      await writeFile(join(root, 'src', 'index.ts'), 'export const answer = 43;\n');
    }],
    ['package manifest', async ({ root }: Awaited<ReturnType<typeof plannedFixture>>) => {
      await writeFile(join(root, 'package.json'), `${JSON.stringify({ packageManager: 'npm@11.5.1', scripts: { build: 'changed' } })}\n`);
    }],
    ['routed skill sidecar', async ({ skillsRoot }: Awaited<ReturnType<typeof plannedFixture>>) => {
      await writeFile(join(skillsRoot, 'universal-verification', 'readiness.yaml'), [
        'schemaVersion: "0.1"',
        'id: universal-verification',
        'skillVersion: "0.1.1"',
        'domains: [release-delivery]',
        'modes: [verify]',
        'maxActionLevel: 1',
        'checks: [universal-verification.commands]',
        '',
      ].join('\n'));
    }],
  ])('rejects changed %s with the stable stale error', async (_label, mutate) => {
    const fixture = await plannedFixture();
    await mutate(fixture);

    await expect(validatePlanState(fixture.plan)).rejects.toThrow(STALE_ERROR);
  });

  it('rejects changed portable configuration discovery', async () => {
    const fixture = await plannedFixture({
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: portable-test',
        '    category: test',
        '    argv: ["node", "test.mjs"]',
        '    cwd: "."',
        '',
      ].join('\n'),
    });
    await writeFile(join(fixture.root, 'postvibe.verification.yaml'), [
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: portable-test',
      '    category: test',
      '    argv: ["node", "changed.mjs"]',
      '    cwd: "."',
      '',
    ].join('\n'));

    await expect(validatePlanState(fixture.plan)).rejects.toThrow(STALE_ERROR);
  });

  it.each([
    ['a newly added lockfile', 'package-lock.json', '{}\n'],
    ['a newly added portable config', 'postvibe.verification.yaml', [
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: portable-test',
      '    category: test',
      '    argv: ["node", "test.mjs"]',
      '    cwd: "."',
      '',
    ].join('\n')],
  ])('rejects %s that changes negative discovery evidence', async (_label, location, contents) => {
    const fixture = await plannedFixture();
    await writeFile(join(fixture.root, location), contents);

    await expect(validatePlanState(fixture.plan)).rejects.toThrow(STALE_ERROR);
  });

  it('rejects a moved project root', async () => {
    const fixture = await plannedFixture();
    const movedRoot = `${fixture.root}-moved`;
    temporaryDirectories.push(movedRoot);
    await rename(fixture.root, movedRoot);

    await expect(validatePlanState(fixture.plan)).rejects.toThrow(STALE_ERROR);
  });

  it('rejects fingerprint tampering and malformed plan state with the same error', async () => {
    const { plan } = await plannedFixture();
    plan.fingerprint = 'f'.repeat(64);

    await expect(validatePlanState(plan)).rejects.toThrow(STALE_ERROR);
  });
});
