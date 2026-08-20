import { readdir } from 'node:fs/promises';
import { join, relative } from 'node:path';

const ignoredDirectories = new Set(['.git', '.postvibe', 'coverage', 'dist', 'node_modules']);

export function isProjectFileExcluded(path: string): boolean {
  return path.split(/[\\/]+/u).some((segment) => ignoredDirectories.has(segment));
}

export async function listProjectFiles(root: string): Promise<string[]> {
  const files: string[] = [];

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory() && isProjectFileExcluded(relative(root, absolute))) continue;
      if (entry.isDirectory()) await walk(absolute);
      if (entry.isFile()) files.push(relative(root, absolute));
    }
  }

  await walk(root);
  return files.sort();
}
