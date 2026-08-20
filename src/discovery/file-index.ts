import { readdir, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { compareOrdinal } from '../ordinal.js';

const ignoredDirectories = new Set(['.git', '.postvibe', 'coverage', 'dist', 'node_modules']);

export function isProjectFileExcluded(path: string): boolean {
  const segments = sep === '\\' ? path.split(/[\\/]+/u) : path.split(/\/+/u);
  return segments.some((segment) => ignoredDirectories.has(segment));
}

export function normalizeProjectFileLocation(path: string, separator = sep): string {
  return path.split(separator).join('/');
}

function isContained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === ''
    || (pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot));
}

async function resolveThroughExistingAncestor(path: string): Promise<string> {
  let candidate = resolve(path);
  const missingSegments: string[] = [];

  while (true) {
    try {
      return resolve(await realpath(candidate), ...missingSegments);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      const parent = dirname(candidate);
      if (parent === candidate) throw error;
      missingSegments.unshift(basename(candidate));
      candidate = parent;
    }
  }
}

async function exactExcludedLocations(root: string, paths: readonly string[]): Promise<Set<string>> {
  if (paths.length === 0) return new Set();
  const resolvedRoot = await realpath(root);
  const locations = await Promise.all(paths.map(async (path) => {
    const candidate = isAbsolute(path) || win32.isAbsolute(path) ? path : resolve(resolvedRoot, path);
    const resolved = await resolveThroughExistingAncestor(candidate);
    if (resolved === resolvedRoot || !isContained(resolvedRoot, resolved)) return undefined;
    return normalizeProjectFileLocation(relative(resolvedRoot, resolved));
  }));
  return new Set(locations.filter((location): location is string => location !== undefined));
}

export async function listProjectFiles(root: string, excludedPaths: readonly string[] = []): Promise<string[]> {
  const files: string[] = [];
  const excludedLocations = await exactExcludedLocations(root, excludedPaths);

  async function walk(directory: string): Promise<void> {
    const entries = await readdir(directory, { withFileTypes: true });
    for (const entry of entries) {
      const absolute = join(directory, entry.name);
      if (entry.isDirectory() && isProjectFileExcluded(relative(root, absolute))) continue;
      if (entry.isDirectory()) await walk(absolute);
      if (entry.isFile()) {
        const location = relative(root, absolute);
        const normalizedLocation = normalizeProjectFileLocation(location);
        if (!excludedLocations.has(normalizedLocation)) files.push(normalizedLocation);
      }
    }
  }

  await walk(root);
  return files.sort(compareOrdinal);
}
