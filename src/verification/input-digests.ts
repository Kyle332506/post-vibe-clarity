import { createHash } from 'node:crypto';
import { readFile, realpath } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { listProjectFiles } from '../discovery/file-index.js';
import type { InputDigest } from '../model/verification.js';
import { resolveExistingFileInsideProject, resolveProjectRoot } from './project-path.js';

function normalizeLocation(location: string): string {
  return location.split(sep).join('/');
}

function digestBytes(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
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

export async function digestInputLocations(root: string, locations: readonly string[]): Promise<InputDigest[]> {
  const resolvedRoot = await realpath(root);
  const normalizedLocations = [...new Set(locations.map(normalizeLocation))].sort((left, right) => left.localeCompare(right));
  const digests: InputDigest[] = [];

  for (const location of normalizedLocations) {
    const inputPath = await resolveExistingFileInsideProject(resolvedRoot, location);
    if (inputPath === undefined) throw new Error(`Recorded input no longer exists: ${location}`);
    digests.push({ location, sha256: digestBytes(await readFile(inputPath)) });
  }
  return digests;
}

export async function collectProjectInputDigests(root: string, outputPath?: string): Promise<InputDigest[]> {
  const resolvedRoot = await resolveProjectRoot(root);
  const resolvedOutputPath = outputPath === undefined
    ? undefined
    : await resolveThroughExistingAncestor(resolve(root, outputPath));
  const outputRelative = resolvedOutputPath === undefined ? undefined : relative(resolvedRoot, resolvedOutputPath);
  const excludedLocation = outputRelative !== undefined
    && outputRelative !== ''
    && !outputRelative.startsWith(`..${sep}`)
    && outputRelative !== '..'
    && !isAbsolute(outputRelative)
    ? normalizeLocation(outputRelative)
    : undefined;
  const locations = (await listProjectFiles(resolvedRoot))
    .map(normalizeLocation)
    .filter((location) => location !== excludedLocation);

  return digestInputLocations(resolvedRoot, locations);
}
