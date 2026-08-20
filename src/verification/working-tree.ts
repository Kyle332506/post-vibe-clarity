import { createHash } from 'node:crypto';
import { lstat, readFile, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep, win32 } from 'node:path';
import { listProjectFiles } from '../discovery/file-index.js';
import type { FileChange, ProjectRootIdentity } from '../model/verification.js';
import { compareOrdinal } from '../ordinal.js';
import { assertProjectRootIdentity } from './project-observation.js';
import { resolveProjectRoot } from './project-path.js';

export type WorkingTreeSnapshot = ReadonlyMap<string, string>;

function normalizePath(path: string): string {
  return path.split(sep).join('/');
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

async function excludedLocations(root: string, paths: readonly string[]): Promise<Set<string>> {
  const locations = await Promise.all(paths.map(async (path) => {
    const candidate = isAbsolute(path) || win32.isAbsolute(path) ? path : resolve(root, path);
    const resolved = await resolveThroughExistingAncestor(candidate);
    if (!isContained(root, resolved) || resolved === root) return undefined;
    return normalizePath(relative(root, resolved));
  }));
  return new Set(locations.filter((location): location is string => location !== undefined));
}

function sha256(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export async function snapshotWorkingTree(
  root: string,
  excludedPaths: readonly string[],
  expectedRootIdentity?: ProjectRootIdentity,
): Promise<WorkingTreeSnapshot> {
  if (expectedRootIdentity !== undefined) await assertProjectRootIdentity(root, expectedRootIdentity);
  const resolvedRoot = await resolveProjectRoot(root);
  if (expectedRootIdentity !== undefined && resolvedRoot !== expectedRootIdentity.realPath) {
    await assertProjectRootIdentity(root, expectedRootIdentity);
  }
  const excluded = await excludedLocations(resolvedRoot, excludedPaths);
  const snapshot = new Map<string, string>();

  for (const projectPath of await listProjectFiles(resolvedRoot)) {
    const normalizedPath = normalizePath(projectPath);
    if (excluded.has(normalizedPath)) continue;
    const absolutePath = join(resolvedRoot, projectPath);
    try {
      const details = await lstat(absolutePath);
      if (!details.isFile()) continue;
      const resolvedPath = await realpath(absolutePath);
      if (!isContained(resolvedRoot, resolvedPath)) continue;
      snapshot.set(normalizedPath, sha256(await readFile(resolvedPath)));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  return snapshot;
}

export function diffWorkingTrees(
  before: WorkingTreeSnapshot,
  after: WorkingTreeSnapshot,
): FileChange[] {
  const paths = [...new Set([...before.keys(), ...after.keys()])]
    .sort(compareOrdinal);

  return paths.flatMap((path): FileChange[] => {
    const beforeHash = before.get(path);
    const afterHash = after.get(path);
    if (beforeHash === undefined) return [{ path, kind: 'added' }];
    if (afterHash === undefined) return [{ path, kind: 'removed' }];
    if (beforeHash !== afterHash) return [{ path, kind: 'modified' }];
    return [];
  });
}
