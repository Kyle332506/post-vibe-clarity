import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverVerificationCommands } from '../../src/verification/discover-commands.js';

const temporaryDirectories: string[] = [];

async function temporaryProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-command-discovery-'));
  temporaryDirectories.push(root);
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }));
  return root;
}

function packageJson(input: Record<string, unknown>): string {
  return `${JSON.stringify(input, null, 2)}\n`;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('discoverVerificationCommands', () => {
  it('discovers exact package scripts in fixed order with declaration evidence', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({
        packageManager: 'pnpm@9.12.0',
        scripts: {
          test: 'vitest run',
          lint: 'eslint .',
          typecheck: 'tsc --noEmit',
          build: 'tsc -p tsconfig.json',
          deploy: 'deploy-production',
        },
      }),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.commands.map(({ id }) => id)).toEqual([
      'package-script:build',
      'package-script:type-check',
      'package-script:lint',
      'package-script:test',
    ]);
    expect(result.commands[0]).toMatchObject({
      argv: ['pnpm', 'run', 'build'],
      cwd: '.',
      timeoutSeconds: 600,
      requiredAccess: ['local-command'],
      source: {
        kind: 'package-script',
        location: 'package.json#scripts.build',
        declaration: 'tsc -p tsconfig.json',
        sha256: '7652c2428b2473a8218d6e2e2ed23badb397e208397717ed04463c66bbf64852',
      },
    });
    expect(result.commands.some(({ argv }) => argv.includes('deploy'))).toBe(false);
    expect(Object.fromEntries(result.categoryAssessments.map(({ category, state }) => [category, state]))).toEqual({
      build: 'applicable',
      'type-check': 'applicable',
      lint: 'applicable',
      test: 'applicable',
    });
    expect(result.coverageGaps).toEqual([]);
    expect(result.inputLocations).toEqual(['package.json']);
  });

  it.each([
    ['npm packageManager', { packageManager: 'npm@11.5.1' }, {}, 'npm'],
    ['npm lockfile', {}, { 'package-lock.json': '{}' }, 'npm'],
    ['npm shrinkwrap', {}, { 'npm-shrinkwrap.json': '{}' }, 'npm'],
    ['pnpm packageManager', { packageManager: 'pnpm@9.12.0' }, {}, 'pnpm'],
    ['pnpm lockfile', {}, { 'pnpm-lock.yaml': 'lockfileVersion: 9\n' }, 'pnpm'],
    ['Yarn packageManager', { packageManager: 'yarn@4.9.2' }, {}, 'yarn'],
    ['Yarn lockfile', {}, { 'yarn.lock': '' }, 'yarn'],
    ['Bun packageManager', { packageManager: 'bun@1.2.0' }, {}, 'bun'],
    ['Bun text lockfile', {}, { 'bun.lock': '{}' }, 'bun'],
    ['Bun binary lockfile', {}, { 'bun.lockb': '' }, 'bun'],
  ])('uses %s evidence', async (_label, manifestFields, evidenceFiles, executable) => {
    const root = await temporaryProject({
      'package.json': packageJson({ ...manifestFields, scripts: { test: 'run-tests' } }),
      ...evidenceFiles,
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.commands).toHaveLength(1);
    expect(result.commands[0]?.argv).toEqual([executable, 'run', 'test']);
  });

  it('accepts multiple lockfiles only when they identify the same manager', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({ scripts: { test: 'run-tests' } }),
      'package-lock.json': '{}',
      'npm-shrinkwrap.json': '{}',
    });

    expect((await discoverVerificationCommands(root, new Set())).commands[0]?.argv).toEqual(['npm', 'run', 'test']);
  });

  it('rejects a root package.json symlink whose target leaves the project', async () => {
    const root = await temporaryProject({});
    const outside = await mkdtemp(join(tmpdir(), 'postvibe-command-discovery-outside-'));
    temporaryDirectories.push(outside);
    const outsideManifest = join(outside, 'package.json');
    await writeFile(outsideManifest, packageJson({ packageManager: 'npm@11.5.1', scripts: { test: 'external-test' } }));
    await symlink(outsideManifest, join(root, 'package.json'));

    await expect(discoverVerificationCommands(root, new Set())).rejects.toThrow(/inside the project/i);
  });

  it.each([
    ['conflicting lockfiles', {}, { 'package-lock.json': '{}', 'pnpm-lock.yaml': 'lockfileVersion: 9\n' }, /conflicting package-manager evidence/i],
    ['unsupported packageManager', { packageManager: 'deno@2.0.0' }, { 'package-lock.json': '{}' }, /unsupported packageManager/i],
    ['declared manager conflicting with a lockfile', { packageManager: 'pnpm@9.12.0' }, { 'package-lock.json': '{}' }, /conflicting package-manager evidence/i],
    ['missing package-manager evidence', {}, {}, /no supported package-manager evidence/i],
  ])('leaves scripts unverified for %s', async (_label, manifestFields, evidenceFiles, reason) => {
    const root = await temporaryProject({
      'package.json': packageJson({ ...manifestFields, scripts: { build: 'build', test: 'test' } }),
      ...evidenceFiles,
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.commands).toEqual([]);
    expect(result.categoryAssessments.every(({ state }) => state === 'unverified')).toBe(true);
    expect(result.coverageGaps.map(({ reason: gapReason }) => gapReason).join('\n')).toMatch(reason);
  });

  it('reports type-check ambiguity without choosing either script', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({
        packageManager: 'pnpm@9.12.0',
        scripts: { build: 'build', typecheck: 'first', 'type-check': 'second', test: 'test' },
      }),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.commands.map(({ id }) => id)).toEqual(['package-script:build', 'package-script:test']);
    expect(result.categoryAssessments.find(({ category }) => category === 'type-check')).toMatchObject({
      state: 'unverified',
      reason: expect.stringMatching(/both typecheck and type-check/i),
    });
  });

  it('preserves type-check ambiguity as a gap when a portable type-check command is applicable', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({
        packageManager: 'pnpm@9.12.0',
        scripts: { typecheck: 'first', 'type-check': 'second' },
      }),
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: portable-type-check',
        '    category: type-check',
        '    argv: ["tsc", "--noEmit"]',
        '    cwd: "."',
        '',
      ].join('\n'),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.categoryAssessments.find(({ category }) => category === 'type-check')?.state).toBe('applicable');
    expect(result.coverageGaps).toContainEqual({
      id: 'category.type-check',
      category: 'type-check',
      reason: 'Both typecheck and type-check scripts are declared; neither was selected.',
    });
  });

  it('preserves a malformed package script gap when a portable command makes the category applicable', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({ packageManager: 'npm@11.5.1', scripts: { lint: 42 } }),
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: portable-lint',
        '    category: lint',
        '    argv: ["eslint", "."]',
        '    cwd: "."',
        '',
      ].join('\n'),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.categoryAssessments.find(({ category }) => category === 'lint')?.state).toBe('applicable');
    expect(result.coverageGaps).toContainEqual({
      id: 'category.lint',
      category: 'lint',
      reason: 'package.json#scripts.lint is not a non-empty string.',
    });
  });

  it('preserves conflicting package-manager evidence when a portable command makes the category applicable', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({ packageManager: 'pnpm@9.12.0', scripts: { test: 'package-test' } }),
      'package-lock.json': '{}',
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: portable-tests',
        '    category: test',
        '    argv: ["vitest", "run"]',
        '    cwd: "."',
        '',
      ].join('\n'),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.categoryAssessments.find(({ category }) => category === 'test')?.state).toBe('applicable');
    expect(result.coverageGaps).toContainEqual({
      id: 'category.test',
      category: 'test',
      reason: 'Conflicting package-manager evidence; use postvibe.verification.yaml.',
    });
  });

  it('does not turn non-string scripts into commands or passes', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({ packageManager: 'npm@11.5.1', scripts: { build: 42, lint: null } }),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.commands).toEqual([]);
    expect(result.categoryAssessments.find(({ category }) => category === 'build')?.state).toBe('unverified');
    expect(result.categoryAssessments.find(({ category }) => category === 'lint')?.state).toBe('unverified');
  });

  it('retains explicitly excluded commands and their coverage gaps', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({ packageManager: 'npm@11.5.1', scripts: { build: 'build', lint: 'lint' } }),
    });

    const result = await discoverVerificationCommands(root, new Set(['package-script:lint']));

    expect(result.commands.map(({ id }) => id)).toEqual(['package-script:build']);
    expect(result.excludedCommands.map(({ id }) => id)).toEqual(['package-script:lint']);
    expect(result.coverageGaps).toContainEqual({
      id: 'command.package-script:lint',
      category: 'lint',
      reason: 'The declared lint command was excluded from this plan.',
      workspace: '.',
    });
    expect(result.categoryAssessments.find(({ category }) => category === 'lint')?.state).toBe('applicable');
  });

  it('rejects unknown exclusions instead of silently dropping them', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({ packageManager: 'npm@11.5.1', scripts: { test: 'test' } }),
    });

    await expect(discoverVerificationCommands(root, new Set(['missing-command']))).rejects.toThrow(/unknown command id.*missing-command/i);
  });

  it('rejects duplicate IDs between automatic and portable declarations', async () => {
    const root = await temporaryProject({
      'package.json': packageJson({ packageManager: 'npm@11.5.1', scripts: { build: 'build' } }),
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: package-script:build',
        '    category: build',
        '    argv: ["make", "build"]',
        '    cwd: "."',
        '',
      ].join('\n'),
    });

    await expect(discoverVerificationCommands(root, new Set())).rejects.toThrow(/duplicate command id.*package-script:build/i);
  });

  it('keeps multiple portable commands in one category and declared file order', async () => {
    const root = await temporaryProject({
      'services/api/placeholder': '',
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: unit-tests',
        '    category: test',
        '    argv: ["pytest", "tests/unit"]',
        '    cwd: "."',
        '  - id: api-tests',
        '    category: test',
        '    argv: ["pytest", "tests/api"]',
        '    cwd: "services/api"',
        '    timeoutSeconds: 1200',
        '',
      ].join('\n'),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.commands.map(({ id }) => id)).toEqual(['unit-tests', 'api-tests']);
    expect(result.commands[1]).toMatchObject({ cwd: 'services/api', timeoutSeconds: 1200 });
    expect(result.commands[0]?.source).toMatchObject({
      kind: 'portable-config',
      location: 'postvibe.verification.yaml#commands[0]',
    });
    expect(result.categoryAssessments.find(({ category }) => category === 'test')?.state).toBe('applicable');
  });

  it('assesses a root static HTML project without a build system explicitly', async () => {
    const root = await temporaryProject({ 'index.html': '<!doctype html><title>Static</title>' });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.categoryAssessments).toHaveLength(4);
    expect(result.categoryAssessments.find(({ category }) => category === 'build')?.state).toBe('not-applicable');
    expect(result.categoryAssessments.find(({ category }) => category === 'test')?.state).toBe('unverified');
    expect(result.categoryAssessments.find(({ category }) => category === 'type-check')?.state).toBe('unverified');
    expect(result.categoryAssessments.find(({ category }) => category === 'lint')?.state).toBe('unverified');
    expect(result.coverageGaps.some(({ category }) => category === 'build')).toBe(false);
    expect(result.inputLocations).toEqual(['index.html']);
    expect(result.coverageGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'category.test', category: 'test' }),
      expect.objectContaining({ id: 'category.type-check', category: 'type-check' }),
      expect.objectContaining({ id: 'category.lint', category: 'lint' }),
    ]));
  });

  it('does not treat an index.html directory as evidence that build is not applicable', async () => {
    const root = await temporaryProject({ 'index.html/placeholder.txt': 'not an HTML file' });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.categoryAssessments.find(({ category }) => category === 'build')).toMatchObject({
      state: 'unverified',
      reason: 'No declared build command was discovered.',
    });
    expect(result.inputLocations).not.toContain('index.html');
  });

  it('rejects an index.html symlink whose target leaves the project', async () => {
    const root = await temporaryProject({});
    const outside = await mkdtemp(join(tmpdir(), 'postvibe-static-html-outside-'));
    temporaryDirectories.push(outside);
    const outsideIndex = join(outside, 'index.html');
    await writeFile(outsideIndex, '<!doctype html><title>Outside</title>');
    await symlink(outsideIndex, join(root, 'index.html'));

    await expect(discoverVerificationCommands(root, new Set())).rejects.toThrow(/inside the project/i);
  });
});
