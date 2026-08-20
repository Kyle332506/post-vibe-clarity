import { createHash } from 'node:crypto';
import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type { PackageScriptLauncher } from '../model/verification.js';

export interface ResolvedPackageScript {
  argv: string[];
  launcher: PackageScriptLauncher;
}

const unsupportedUnquoted = new Set(['&', '|', ';', '<', '>', '(', ')', '$', '`', '*', '?', '[', ']', '{', '}', '~', '#', '%', '^', '!']);
let runtimeDigest: Promise<string> | undefined;

function nodeRuntimeDigest(): Promise<string> {
  runtimeDigest ??= readFile(process.execPath).then((bytes) => createHash('sha256').update(bytes).digest('hex'));
  return runtimeDigest;
}

function normalizeLocation(location: string): string {
  return location.split(sep).join('/');
}

function isContained(root: string, target: string): boolean {
  const fromRoot = relative(root, target);
  return fromRoot === ''
    || (fromRoot !== '..' && !fromRoot.startsWith(`..${sep}`) && !isAbsolute(fromRoot));
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function declaredBins(manifest: Record<string, unknown>): Array<[string, string]> {
  if (typeof manifest.bin === 'string' && typeof manifest.name === 'string') {
    return [[manifest.name.split('/').at(-1) ?? manifest.name, manifest.bin]];
  }
  if (!isPlainRecord(manifest.bin)) return [];
  return Object.entries(manifest.bin).filter((entry): entry is [string, string] => (
    typeof entry[1] === 'string'
  ));
}

async function packageDirectories(root: string): Promise<string[]> {
  const nodeModules = join(root, 'node_modules');
  let entries;
  try {
    entries = await readdir(nodeModules, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const directories: string[] = [];
  for (const entry of entries) {
    if (entry.name === '.bin' || entry.name === '.pnpm') continue;
    const path = join(nodeModules, entry.name);
    if (entry.name.startsWith('@') && (entry.isDirectory() || entry.isSymbolicLink())) {
      let scopedEntries;
      try {
        scopedEntries = await readdir(path, { withFileTypes: true });
      } catch {
        continue;
      }
      for (const scoped of scopedEntries) {
        if (scoped.isDirectory() || scoped.isSymbolicLink()) directories.push(join(path, scoped.name));
      }
    } else if (entry.isDirectory() || entry.isSymbolicLink()) {
      directories.push(path);
    }
  }
  return directories;
}

async function resolveLocalNodeBin(
  root: string,
  name: string,
  argumentsAfterExecutable: string[],
): Promise<ResolvedPackageScript | undefined> {
  const resolvedRoot = await realpath(root);
  const matches: Array<{
    entrypointPath: string;
    entrypointLocation: string;
    entrypointSha256: string;
    manifestLocation: string;
    manifestSha256: string;
  }> = [];

  for (const packageDirectory of await packageDirectories(resolvedRoot)) {
    try {
      const manifestPath = await realpath(join(packageDirectory, 'package.json'));
      if (!isContained(resolvedRoot, manifestPath)) continue;
      const manifestBytes = await readFile(manifestPath);
      const manifest = JSON.parse(manifestBytes.toString('utf8')) as unknown;
      if (!isPlainRecord(manifest)) continue;
      for (const [binName, target] of declaredBins(manifest)) {
        if (binName !== name) continue;
        const entrypointPath = await realpath(join(dirname(manifestPath), target));
        if (!isContained(resolvedRoot, entrypointPath) || !(await stat(entrypointPath)).isFile()) continue;
        const entrypointBytes = await readFile(entrypointPath);
        const source = entrypointBytes.toString('utf8');
        if (!/\.(?:c?js|mjs)$/iu.test(entrypointPath) && !/^#![^\r\n]*\bnode\b/iu.test(source)) continue;
        matches.push({
          entrypointPath,
          entrypointLocation: normalizeLocation(relative(resolvedRoot, entrypointPath)),
          entrypointSha256: createHash('sha256').update(entrypointBytes).digest('hex'),
          manifestLocation: normalizeLocation(relative(resolvedRoot, manifestPath)),
          manifestSha256: createHash('sha256').update(manifestBytes).digest('hex'),
        });
      }
    } catch {
      // A missing, malformed, or escaping package cannot supply reviewed launcher evidence.
    }
  }
  if (matches.length !== 1) return undefined;
  const match = matches[0]!;
  return {
    argv: [process.execPath, match.entrypointPath, ...argumentsAfterExecutable],
    launcher: {
      policyVersion: 'package-script-launcher/0.1',
      kind: 'node-package-bin',
      executable: process.execPath,
      sha256: await nodeRuntimeDigest(),
      entrypointArgvIndex: 1,
      entrypoint: { location: match.entrypointLocation, sha256: match.entrypointSha256 },
      packageManifest: { location: match.manifestLocation, sha256: match.manifestSha256 },
    },
  };
}

function parseLiteralArgv(declaration: string): string[] | undefined {
  const argv: string[] = [];
  let current = '';
  let state: 'unquoted' | 'single' | 'double' = 'unquoted';
  let tokenStarted = false;

  const finishToken = (): void => {
    if (!tokenStarted) return;
    argv.push(current);
    current = '';
    tokenStarted = false;
  };

  for (let index = 0; index < declaration.length; index += 1) {
    const character = declaration[index]!;
    if (character === '\n' || character === '\r' || character === '\0') return undefined;

    if (state === 'single') {
      if (character === "'") state = 'unquoted';
      else current += character;
      tokenStarted = true;
      continue;
    }

    if (state === 'double') {
      if (character === '"') {
        state = 'unquoted';
        tokenStarted = true;
        continue;
      }
      if (character === '$' || character === '`' || character === '%' || character === '!') return undefined;
      if (character === '\\') {
        const next = declaration[index + 1];
        if (next === undefined) return undefined;
        if (next === '"' || next === '\\') {
          current += next;
          index += 1;
        } else {
          current += character;
        }
      } else {
        current += character;
      }
      tokenStarted = true;
      continue;
    }

    if (/\s/u.test(character)) {
      finishToken();
      continue;
    }
    if (character === "'") {
      state = 'single';
      tokenStarted = true;
      continue;
    }
    if (character === '"') {
      state = 'double';
      tokenStarted = true;
      continue;
    }
    if (unsupportedUnquoted.has(character)) return undefined;
    if (character === '\\') {
      const next = declaration[index + 1];
      if (next === undefined || next === '\n' || next === '\r') return undefined;
      current += next;
      tokenStarted = true;
      index += 1;
      continue;
    }
    current += character;
    tokenStarted = true;
  }

  if (state !== 'unquoted') return undefined;
  finishToken();
  return argv.length > 0 && argv.every((argument) => argument.length > 0) ? argv : undefined;
}

export async function resolvePackageScript(
  root: string,
  declaration: string,
): Promise<ResolvedPackageScript | undefined> {
  const parsed = parseLiteralArgv(declaration);
  const declaredExecutable = parsed?.[0];
  if (parsed === undefined || declaredExecutable === undefined) return undefined;
  if (!['node', 'node.exe'].includes(basename(declaredExecutable).toLowerCase())) {
    return resolveLocalNodeBin(root, declaredExecutable, parsed.slice(1));
  }

  const nodeArguments = parsed.slice(1);
  const firstArgument = nodeArguments[0];
  let entrypointArgvIndex: number | undefined;
  if (firstArgument !== undefined && !firstArgument.startsWith('-')) {
    entrypointArgvIndex = 1;
  } else if (firstArgument === '--check' || firstArgument === '-c') {
    if (nodeArguments.length !== 2) return undefined;
    entrypointArgvIndex = 2;
  } else if (firstArgument === '--eval' || firstArgument === '-e' || firstArgument === '--print' || firstArgument === '-p') {
    if (nodeArguments[1] === undefined) return undefined;
  } else if ((firstArgument === '--version' || firstArgument === '-v' || firstArgument === '--help' || firstArgument === '-h') && nodeArguments.length === 1) {
    // These informational forms do not load a project entrypoint.
  } else {
    return undefined;
  }

  let entrypoint: PackageScriptLauncher['entrypoint'];
  if (entrypointArgvIndex !== undefined) {
    const declaredEntrypoint = parsed[entrypointArgvIndex];
    if (declaredEntrypoint === undefined) return undefined;
    try {
      const resolvedRoot = await realpath(root);
      const entrypointPath = await realpath(resolve(resolvedRoot, declaredEntrypoint));
      if (!isContained(resolvedRoot, entrypointPath) || !(await stat(entrypointPath)).isFile()) return undefined;
      const bytes = await readFile(entrypointPath);
      parsed[entrypointArgvIndex] = entrypointPath;
      entrypoint = {
        location: normalizeLocation(relative(resolvedRoot, entrypointPath)),
        sha256: createHash('sha256').update(bytes).digest('hex'),
      };
    } catch {
      return undefined;
    }
  }

  const launcher: PackageScriptLauncher = {
    policyVersion: 'package-script-launcher/0.1',
    kind: 'node-runtime',
    executable: process.execPath,
    sha256: await nodeRuntimeDigest(),
  };
  if (entrypointArgvIndex !== undefined && entrypoint !== undefined) {
    launcher.entrypointArgvIndex = entrypointArgvIndex;
    launcher.entrypoint = entrypoint;
  }
  return { argv: [process.execPath, ...parsed.slice(1)], launcher };
}
