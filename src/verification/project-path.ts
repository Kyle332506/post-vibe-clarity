import { lstat, realpath, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve, sep, win32 } from 'node:path';

async function requireDirectory(path: string, label: string): Promise<string> {
  let resolved: string;
  try {
    resolved = await realpath(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`${label} does not exist.`);
    }
    throw error;
  }

  if (!(await stat(resolved)).isDirectory()) throw new Error(`${label} must be a directory.`);
  return resolved;
}

function isContained(root: string, target: string): boolean {
  const pathFromRoot = relative(root, target);
  return pathFromRoot === '' || (!pathFromRoot.startsWith(`..${sep}`) && pathFromRoot !== '..' && !isAbsolute(pathFromRoot));
}

export async function resolveProjectRoot(path: string): Promise<string> {
  return requireDirectory(path, 'Project root');
}

export async function resolveInsideProject(root: string, relativePath: string): Promise<string> {
  if (relativePath.length === 0 || isAbsolute(relativePath) || win32.isAbsolute(relativePath)) {
    throw new Error('Working directory must be a relative path inside the project.');
  }

  const resolvedRoot = await resolveProjectRoot(root);
  const candidate = resolve(resolvedRoot, relativePath);
  if (!isContained(resolvedRoot, candidate)) throw new Error('Working directory must resolve inside the project.');

  const resolvedCandidate = await requireDirectory(candidate, 'Working directory');
  if (!isContained(resolvedRoot, resolvedCandidate)) throw new Error('Working directory must resolve inside the project.');
  return resolvedCandidate;
}

async function resolveExistingPathInsideProject(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  if (relativePath.length === 0 || isAbsolute(relativePath) || win32.isAbsolute(relativePath)) {
    throw new Error('File must be a relative path inside the project.');
  }

  const resolvedRoot = await resolveProjectRoot(root);
  const candidate = resolve(resolvedRoot, relativePath);
  if (!isContained(resolvedRoot, candidate)) throw new Error('File must resolve inside the project.');
  try {
    await lstat(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }

  let resolvedCandidate: string;
  try {
    resolvedCandidate = await realpath(candidate);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') throw new Error('File does not exist.');
    throw error;
  }
  if (!isContained(resolvedRoot, resolvedCandidate)) throw new Error('File must resolve inside the project.');
  return resolvedCandidate;
}

export async function resolveExistingFileInsideProject(
  root: string,
  relativePath: string,
): Promise<string | undefined> {
  const resolved = await resolveExistingPathInsideProject(root, relativePath);
  if (resolved === undefined) return undefined;
  if (!(await stat(resolved)).isFile()) throw new Error('File must be a regular file.');
  return resolved;
}

export async function isContainedRegularFile(root: string, relativePath: string): Promise<boolean> {
  const resolved = await resolveExistingPathInsideProject(root, relativePath);
  return resolved !== undefined && (await stat(resolved)).isFile();
}
