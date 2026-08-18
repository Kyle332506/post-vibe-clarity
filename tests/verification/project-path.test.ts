import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { resolveInsideProject, resolveProjectRoot } from '../../src/verification/project-path.js';

const temporaryDirectories: string[] = [];

async function temporaryProject(): Promise<{ container: string; root: string }> {
  const container = await mkdtemp(join(tmpdir(), 'postvibe-project-path-'));
  temporaryDirectories.push(container);
  const root = join(container, 'project');
  await mkdir(join(root, 'packages', 'api'), { recursive: true });
  return { container, root };
}

afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('project path resolution', () => {
  it('resolves the project root through the filesystem', async () => {
    const { root } = await temporaryProject();

    expect(await resolveProjectRoot(join(root, '.'))).toBe(await realpath(root));
  });

  it('accepts the root and existing directories inside it', async () => {
    const { root } = await temporaryProject();

    expect(await resolveInsideProject(root, '.')).toBe(await realpath(root));
    expect(await resolveInsideProject(root, 'packages/api')).toBe(await realpath(join(root, 'packages', 'api')));
  });

  it('rejects absolute, traversing, and nonexistent working directories', async () => {
    const { container, root } = await temporaryProject();

    await expect(resolveInsideProject(root, join(container, 'outside'))).rejects.toThrow(/relative path inside the project/i);
    await expect(resolveInsideProject(root, '../outside')).rejects.toThrow(/inside the project/i);
    await expect(resolveInsideProject(root, 'packages/missing')).rejects.toThrow(/does not exist/i);
  });

  it('rejects a symlink whose real target leaves the project', async () => {
    const { container, root } = await temporaryProject();
    const outside = join(container, 'outside');
    await mkdir(outside);
    await writeFile(join(outside, 'sentinel.txt'), 'outside');
    await symlink(outside, join(root, 'escape'));

    await expect(resolveInsideProject(root, 'escape')).rejects.toThrow(/inside the project/i);
  });
});
