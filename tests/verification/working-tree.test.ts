import { mkdir, mkdtemp, realpath, rename, rm, stat, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  diffWorkingTrees,
  snapshotWorkingTree,
} from '../../src/verification/working-tree.js';

const temporaryDirectories: string[] = [];

async function temporaryProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-working-tree-'));
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

describe('working-tree snapshots', () => {
  it('returns sorted visible additions, modifications, and removals without changing files', async () => {
    const root = await temporaryProject({
      'modified.txt': 'before',
      'removed.txt': 'remove me',
      'unchanged.txt': 'same',
      '.git/config': 'before',
      '.postvibe/record.json': 'before',
      'node_modules/pkg/index.js': 'before',
      'coverage/report.json': 'before',
      'dist/index.js': 'before',
      'reports/execution.json': 'before',
      'reports/keep.json': 'before',
    });
    const excludedArtifact = join(root, 'reports', 'execution.json');
    const before = await snapshotWorkingTree(root, [excludedArtifact]);

    await Promise.all([
      writeFile(join(root, 'added.txt'), 'added'),
      writeFile(join(root, 'modified.txt'), 'after'),
      writeFile(join(root, '.git', 'config'), 'after'),
      writeFile(join(root, '.postvibe', 'record.json'), 'after'),
      writeFile(join(root, 'node_modules', 'pkg', 'index.js'), 'after'),
      writeFile(join(root, 'coverage', 'report.json'), 'after'),
      writeFile(join(root, 'dist', 'index.js'), 'after'),
      writeFile(excludedArtifact, 'after'),
      writeFile(join(root, 'reports', 'keep.json'), 'after'),
      rm(join(root, 'removed.txt')),
    ]);
    const after = await snapshotWorkingTree(root, [excludedArtifact]);

    expect(diffWorkingTrees(before, after)).toEqual([
      { path: 'added.txt', kind: 'added' },
      { path: 'modified.txt', kind: 'modified' },
      { path: 'removed.txt', kind: 'removed' },
      { path: 'reports/keep.json', kind: 'modified' },
    ]);
    await expect(snapshotWorkingTree(root, [excludedArtifact])).resolves.toEqual(after);
  });

  it('excludes only the exact selected artifact path even when it is created after the first snapshot', async () => {
    const root = await temporaryProject({
      'reports/keep.json': 'before',
    });
    const excludedArtifact = join(root, 'reports', 'execution.json');
    const before = await snapshotWorkingTree(root, [excludedArtifact]);

    await writeFile(excludedArtifact, 'artifact');
    await writeFile(join(root, 'reports', 'keep.json'), 'after');
    const after = await snapshotWorkingTree(root, [excludedArtifact]);

    expect(diffWorkingTrees(before, after)).toEqual([
      { path: 'reports/keep.json', kind: 'modified' },
    ]);
  });

  it('does not follow file or directory symlinks outside the project root', async () => {
    const root = await temporaryProject({ 'visible.txt': 'visible' });
    const outside = await temporaryProject({
      'outside.txt': 'outside',
      'nested/secret.txt': 'outside nested',
    });
    await symlink(join(outside, 'outside.txt'), join(root, 'outside-file.txt'));
    await symlink(join(outside, 'nested'), join(root, 'outside-directory'));

    const snapshot = await snapshotWorkingTree(root, []);

    expect([...snapshot.keys()]).toEqual(['visible.txt']);
  });

  it('refuses to traverse a path that was re-rooted after approval', async () => {
    const root = await temporaryProject({ 'approved.txt': 'approved' });
    const details = await stat(root, { bigint: true });
    const identity = {
      realPath: await realpath(root),
      device: details.dev.toString(),
      inode: details.ino.toString(),
    };
    const moved = `${root}-moved`;
    temporaryDirectories.push(moved);
    await rename(root, moved);
    await mkdir(root);
    await writeFile(join(root, 'replacement.txt'), 'must not be observed');

    await expect(snapshotWorkingTree(root, [], identity)).rejects.toThrow(/root identity changed/i);
  });
});
