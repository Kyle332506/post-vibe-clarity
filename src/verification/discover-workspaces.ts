import { glob, readFile } from 'node:fs/promises';
import { dirname, relative, sep } from 'node:path';
import { parse } from 'yaml';
import { resolveExistingFileInsideProject, resolveInsideProject, resolveProjectRoot } from './project-path.js';

export interface WorkspaceDiscoveryResult {
  workspaceRoots: string[];
  inputLocations: string[];
}

const EXCLUDED_GLOBS = [
  'node_modules/**', '**/node_modules/**',
  '.git/**', '**/.git/**',
  '.postvibe/**', '**/.postvibe/**',
  'coverage/**', '**/coverage/**',
  'dist/**', '**/dist/**',
];

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function readOptional(root: string, path: string): Promise<string | undefined> {
  const resolved = await resolveExistingFileInsideProject(root, path);
  return resolved === undefined ? undefined : readFile(resolved, 'utf8');
}

function packageWorkspacePatterns(manifest: unknown): string[] {
  if (!isPlainRecord(manifest)) return [];
  if (Array.isArray(manifest.workspaces)) return manifest.workspaces.filter((value): value is string => typeof value === 'string');
  if (isPlainRecord(manifest.workspaces) && Array.isArray(manifest.workspaces.packages)) {
    return manifest.workspaces.packages.filter((value): value is string => typeof value === 'string');
  }
  return [];
}

function pnpmWorkspacePatterns(source: string): string[] {
  const input = parse(source) as unknown;
  if (!isPlainRecord(input) || !Array.isArray(input.packages)) return [];
  return input.packages.filter((value): value is string => typeof value === 'string');
}

export async function discoverWorkspaceRoots(root: string): Promise<WorkspaceDiscoveryResult> {
  const resolvedRoot = await resolveProjectRoot(root);
  const packageSource = await readOptional(resolvedRoot, 'package.json');
  const pnpmSource = await readOptional(resolvedRoot, 'pnpm-workspace.yaml');
  const patterns: string[] = [];
  const inputLocations: string[] = [];

  if (packageSource !== undefined) {
    inputLocations.push('package.json');
    let manifest: unknown;
    try {
      manifest = JSON.parse(packageSource) as unknown;
    } catch {
      throw new Error('package.json contains invalid JSON.');
    }
    const packagePatterns = packageWorkspacePatterns(manifest);
    if (packagePatterns.length > 0) {
      patterns.push(...packagePatterns);
    }
  }
  if (pnpmSource !== undefined) {
    inputLocations.push('pnpm-workspace.yaml');
    let pnpmPatterns: string[];
    try {
      pnpmPatterns = pnpmWorkspacePatterns(pnpmSource);
    } catch {
      throw new Error('pnpm-workspace.yaml contains invalid YAML.');
    }
    if (pnpmPatterns.length > 0) {
      patterns.push(...pnpmPatterns);
    }
  }

  const positivePatterns = patterns.filter((pattern) => pattern.length > 0 && !pattern.startsWith('!'));
  const workspaceExclusions = patterns
    .filter((pattern) => pattern.startsWith('!') && pattern.length > 1)
    .map((pattern) => `${pattern.slice(1).replace(/\/$/, '')}/**`);
  const manifestPatterns = positivePatterns.map((pattern) => `${pattern.replace(/\/$/, '')}/package.json`);
  const workspaceRoots = new Set<string>();

  if (manifestPatterns.length > 0) {
    for await (const manifestPath of glob(manifestPatterns, {
      cwd: resolvedRoot,
      exclude: [...EXCLUDED_GLOBS, ...workspaceExclusions],
      followSymlinks: false,
    })) {
      await resolveExistingFileInsideProject(resolvedRoot, manifestPath);
      const candidate = dirname(manifestPath);
      if (candidate === '.') continue;
      const resolvedWorkspace = await resolveInsideProject(resolvedRoot, candidate);
      const normalized = relative(resolvedRoot, resolvedWorkspace).split(sep).join('/');
      if (normalized.length > 0) {
        workspaceRoots.add(normalized);
        inputLocations.push(manifestPath.split(sep).join('/'));
      }
    }
  }

  return {
    workspaceRoots: [...workspaceRoots].sort(),
    inputLocations: [...new Set(inputLocations)].sort(),
  };
}
