import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  collectProjectInputDigests,
  digestInputLocations,
} from '../../src/verification/input-digests.js';

const temporaryDirectories: string[] = [];

async function temporaryProject(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-input-digests-'));
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

describe('input digests', () => {
  it('sorts the inventory and excludes generated trees plus only the selected output path', async () => {
    const root = await temporaryProject({
      'z.txt': 'z',
      'a.txt': 'a',
      '.git/config': 'git',
      '.postvibe/record.json': 'record',
      'node_modules/pkg/index.js': 'dependency',
      'coverage/report.json': 'coverage',
      'dist/index.js': 'generated',
      'reports/selected.json': 'selected output',
      'reports/keep.json': 'ordinary project input',
    });

    const digests = await collectProjectInputDigests(root, join(root, 'reports', 'selected.json'));

    expect(digests.map(({ location }) => location)).toEqual([
      'a.txt',
      'reports/keep.json',
      'z.txt',
    ]);
  });

  it('hashes exact bytes and fails when a recorded input disappears', async () => {
    const root = await temporaryProject({
      'src/index.ts': 'export const answer = 42;\n',
    });

    expect(await digestInputLocations(root, ['src/index.ts'])).toEqual([{
      location: 'src/index.ts',
      sha256: 'a2098bd92b10bf8b816d24b7556b1ce8c49a879d130489065ef1051c17e042f6',
    }]);

    await rm(join(root, 'src', 'index.ts'));
    await expect(digestInputLocations(root, ['src/index.ts'])).rejects.toThrow();
  });
});
