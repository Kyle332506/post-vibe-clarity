import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { loadVerificationConfig } from '../../src/verification/load-verification-config.js';

const temporaryDirectories: string[] = [];

async function projectWithConfig(contents: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-verification-config-'));
  temporaryDirectories.push(root);
  await mkdir(join(root, 'packages', 'api'), { recursive: true });
  await writeFile(join(root, 'postvibe.verification.yaml'), contents);
  return root;
}

async function writeProjectFile(root: string, path: string, contents: string): Promise<void> {
  const destination = join(root, path);
  await mkdir(dirname(destination), { recursive: true });
  await writeFile(destination, contents);
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('loadVerificationConfig', () => {
  it('returns undefined when the portable configuration is absent', async () => {
    const root = await mkdtemp(join(tmpdir(), 'postvibe-verification-config-'));
    temporaryDirectories.push(root);

    expect(await loadVerificationConfig(root)).toBeUndefined();
  });

  it('loads the exact portable command shape and normalizes working directories', async () => {
    const root = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "-q"]',
      '    cwd: "./packages/api/"',
      '    timeoutSeconds: 600',
      '',
    ].join('\n'));

    expect(await loadVerificationConfig(root)).toEqual({
      schemaVersion: '0.1',
      commands: [{
        id: 'backend-tests',
        category: 'test',
        argv: ['pytest', '-q'],
        cwd: 'packages/api',
        timeoutSeconds: 600,
      }],
    });
  });

  it('preserves metacharacters as literal argv entries without expansion', async () => {
    const root = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: literal-arguments',
      '    category: test',
      '    argv: ["printf", "$HOME", "&&", ">"]',
      '    cwd: "."',
      '',
    ].join('\n'));

    expect((await loadVerificationConfig(root))?.commands[0]?.argv).toEqual(['printf', '$HOME', '&&', '>']);
  });

  it.each([
    ['a shell command string', 'argv: "pytest -q"'],
    ['an empty argument array', 'argv: []'],
    ['an empty argument', 'argv: ["pytest", ""]'],
    ['an invalid category', 'category: security'],
    ['a per-command environment field', 'env: { CI: "1" }'],
    ['a zero timeout', 'timeoutSeconds: 0'],
    ['a timeout above the limit', 'timeoutSeconds: 3601'],
    ['an ID incompatible with plan artifacts', 'id: backend/tests'],
  ])('rejects %s', async (_label, replacement) => {
    const lines = [
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "-q"]',
      '    cwd: "."',
      '    timeoutSeconds: 600',
    ];
    const key = replacement.split(':', 1)[0];
    const index = lines.findIndex((line) => line.trimStart().startsWith(`${key}:`));
    if (index === -1) lines.push(`    ${replacement}`);
    else lines[index] = `    ${replacement}`;
    const root = await projectWithConfig(`${lines.join('\n')}\n`);

    await expect(loadVerificationConfig(root)).rejects.toThrow(/postvibe\.verification\.yaml/i);
  });

  it('rejects unknown top-level and command keys', async () => {
    const topLevel = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands: []',
      'approval: automatic',
      '',
    ].join('\n'));
    await expect(loadVerificationConfig(topLevel)).rejects.toThrow(/unknown key.*approval/i);

    const commandLevel = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "-q"]',
      '    cwd: "."',
      '    shell: true',
      '',
    ].join('\n'));
    await expect(loadVerificationConfig(commandLevel)).rejects.toThrow(/unknown key.*shell/i);
  });

  it('rejects duplicate command IDs', async () => {
    const root = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "-q"]',
      '    cwd: "."',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "tests/integration"]',
      '    cwd: "."',
      '',
    ].join('\n'));

    await expect(loadVerificationConfig(root)).rejects.toThrow(/duplicate command id.*backend-tests/i);
  });

  it('rejects a command working directory outside the project or not present', async () => {
    const outside = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "-q"]',
      '    cwd: "../outside"',
      '',
    ].join('\n'));
    await expect(loadVerificationConfig(outside)).rejects.toThrow(/inside the project/i);

    const missing = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "-q"]',
      '    cwd: "services/missing"',
      '',
    ].join('\n'));
    await expect(loadVerificationConfig(missing)).rejects.toThrow(/does not exist/i);
  });

  it('rejects a portable configuration symlink whose target leaves the project', async () => {
    const root = await mkdtemp(join(tmpdir(), 'postvibe-verification-config-'));
    const outside = await mkdtemp(join(tmpdir(), 'postvibe-verification-config-outside-'));
    temporaryDirectories.push(root, outside);
    const outsideConfig = join(outside, 'postvibe.verification.yaml');
    await writeFile(outsideConfig, [
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: external-tests',
      '    category: test',
      '    argv: ["external-runner"]',
      '    cwd: "."',
      '',
    ].join('\n'));
    await symlink(outsideConfig, join(root, 'postvibe.verification.yaml'));

    await expect(loadVerificationConfig(root)).rejects.toThrow(/inside the project/i);
  });

  it('rejects malformed YAML and invalid root shapes', async () => {
    const malformed = await projectWithConfig('schemaVersion: [\n');
    await expect(loadVerificationConfig(malformed)).rejects.toThrow(/postvibe\.verification\.yaml/i);

    const arrayRoot = await projectWithConfig('- schemaVersion\n- commands\n');
    await expect(loadVerificationConfig(arrayRoot)).rejects.toThrow(/plain object/i);
  });

  it('does not reinterpret a file path as a working directory', async () => {
    const root = await projectWithConfig([
      'schemaVersion: "0.1"',
      'commands:',
      '  - id: backend-tests',
      '    category: test',
      '    argv: ["pytest", "-q"]',
      '    cwd: "packages/api/package.json"',
      '',
    ].join('\n'));
    await writeProjectFile(root, 'packages/api/package.json', '{}');

    await expect(loadVerificationConfig(root)).rejects.toThrow(/directory/i);
  });
});
