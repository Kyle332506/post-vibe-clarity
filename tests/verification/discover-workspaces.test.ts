import { mkdir, mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { discoverVerificationCommands } from '../../src/verification/discover-commands.js';
import { discoverWorkspaceRoots } from '../../src/verification/discover-workspaces.js';

const temporaryDirectories: string[] = [];

async function temporaryProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-workspace-discovery-'));
  temporaryDirectories.push(root);
  await Promise.all(Object.entries(files).map(async ([path, contents]) => {
    const destination = join(root, path);
    await mkdir(dirname(destination), { recursive: true });
    await writeFile(destination, contents);
  }));
  return root;
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('discoverWorkspaceRoots', () => {
  it('discovers and sorts package.json workspace roots', async () => {
    const root = await temporaryProject({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/web/package.json': '{}',
      'packages/admin/package.json': '{}',
    });

    expect(await discoverWorkspaceRoots(root)).toEqual({
      workspaceRoots: ['packages/admin', 'packages/web'],
      inputLocations: [
        'package.json',
        'packages/admin/package.json',
        'packages/web/package.json',
      ],
    });
  });

  it('discovers pnpm workspace roots and records the declaration source', async () => {
    const root = await temporaryProject({
      'pnpm-workspace.yaml': 'packages:\n  - "apps/*"\n',
      'apps/worker/package.json': '{}',
      'apps/api/package.json': '{}',
    });

    expect(await discoverWorkspaceRoots(root)).toEqual({
      workspaceRoots: ['apps/api', 'apps/worker'],
      inputLocations: [
        'apps/api/package.json',
        'apps/worker/package.json',
        'pnpm-workspace.yaml',
      ],
    });
  });

  it('records an existing pnpm workspace file even when its package list is empty', async () => {
    const root = await temporaryProject({ 'pnpm-workspace.yaml': 'packages: []\n' });

    expect(await discoverWorkspaceRoots(root)).toEqual({
      workspaceRoots: [],
      inputLocations: ['pnpm-workspace.yaml'],
    });
  });

  it('rejects a pnpm workspace declaration symlink whose target leaves the project', async () => {
    const root = await temporaryProject({ 'apps/api/package.json': '{}' });
    const outside = await mkdtemp(join(tmpdir(), 'postvibe-workspace-discovery-outside-'));
    temporaryDirectories.push(outside);
    const outsideWorkspace = join(outside, 'pnpm-workspace.yaml');
    await writeFile(outsideWorkspace, 'packages:\n  - "apps/*"\n');
    await symlink(outsideWorkspace, join(root, 'pnpm-workspace.yaml'));

    await expect(discoverWorkspaceRoots(root)).rejects.toThrow(/inside the project/i);
  });

  it('rejects a matched workspace package.json symlink whose target leaves the project', async () => {
    const root = await temporaryProject({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/api/placeholder': '',
    });
    const outside = await mkdtemp(join(tmpdir(), 'postvibe-workspace-manifest-outside-'));
    temporaryDirectories.push(outside);
    const outsideManifest = join(outside, 'package.json');
    await writeFile(outsideManifest, '{}');
    await symlink(outsideManifest, join(root, 'packages/api/package.json'));

    await expect(discoverWorkspaceRoots(root)).rejects.toThrow(/inside the project/i);
  });

  it('ignores dependency, VCS, artifact, coverage, and distribution directories', async () => {
    const root = await temporaryProject({
      'package.json': JSON.stringify({ workspaces: ['**'] }),
      'packages/kept/package.json': '{}',
      'node_modules/ignored/package.json': '{}',
      '.git/ignored/package.json': '{}',
      '.postvibe/ignored/package.json': '{}',
      'coverage/ignored/package.json': '{}',
      'dist/ignored/package.json': '{}',
    });

    expect((await discoverWorkspaceRoots(root)).workspaceRoots).toEqual(['packages/kept']);
  });
});

describe('workspace coverage gaps', () => {
  it('treats a selected portable command at a workspace root as direct coverage', async () => {
    const root = await temporaryProject({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/api/package.json': '{}',
      'packages/admin/package.json': '{}',
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: api-tests',
        '    category: test',
        '    argv: ["pnpm", "test"]',
        '    cwd: "packages/api"',
        '',
      ].join('\n'),
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.workspaceRoots).toEqual(['packages/admin', 'packages/api']);
    expect(result.coverageGaps).toContainEqual({
      id: 'workspace.packages.admin',
      reason: 'Detected workspace was not directly covered by an approved command.',
      workspace: 'packages/admin',
    });
    expect(result.coverageGaps.some(({ workspace }) => workspace === 'packages/api')).toBe(false);
  });

  it('does not treat a root aggregate script as direct child-workspace coverage', async () => {
    const root = await temporaryProject({
      'package.json': JSON.stringify({
        packageManager: 'pnpm@9.12.0',
        workspaces: ['packages/*'],
        scripts: { test: 'pnpm -r test' },
      }),
      'packages/api/package.json': '{}',
      'packages/admin/package.json': '{}',
    });

    const result = await discoverVerificationCommands(root, new Set());

    expect(result.coverageGaps.filter(({ id }) => id.startsWith('workspace.'))).toEqual([
      {
        id: 'workspace.packages.admin',
        reason: 'Detected workspace was not directly covered by an approved command.',
        workspace: 'packages/admin',
      },
      {
        id: 'workspace.packages.api',
        reason: 'Detected workspace was not directly covered by an approved command.',
        workspace: 'packages/api',
      },
    ]);
  });

  it('keeps an excluded workspace command visible as a command and workspace gap', async () => {
    const root = await temporaryProject({
      'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
      'packages/api/package.json': '{}',
      'postvibe.verification.yaml': [
        'schemaVersion: "0.1"',
        'commands:',
        '  - id: api-tests',
        '    category: test',
        '    argv: ["pnpm", "test"]',
        '    cwd: "packages/api"',
        '',
      ].join('\n'),
    });

    const result = await discoverVerificationCommands(root, new Set(['api-tests']));

    expect(result.excludedCommands.map(({ id }) => id)).toEqual(['api-tests']);
    expect(result.coverageGaps).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'command.api-tests', workspace: 'packages/api' }),
      expect.objectContaining({ id: 'workspace.packages.api', workspace: 'packages/api' }),
    ]));
  });
});
