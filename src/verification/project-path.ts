import { realpath, stat } from 'node:fs/promises';
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
