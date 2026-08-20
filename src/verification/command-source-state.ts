import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { VerificationCommand } from '../model/verification.js';
import { loadVerificationConfig } from './load-verification-config.js';
import { resolveExistingFileInsideProject } from './project-path.js';

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

async function packageScriptDeclaration(root: string, location: string): Promise<string | undefined> {
  const match = /^package\.json#scripts\.(build|test|typecheck|type-check|lint)$/u.exec(location);
  if (match?.[1] === undefined) return undefined;
  const packagePath = await resolveExistingFileInsideProject(root, 'package.json');
  if (packagePath === undefined) return undefined;
  const manifest = JSON.parse(await readFile(packagePath, 'utf8')) as unknown;
  if (!isPlainRecord(manifest) || !isPlainRecord(manifest.scripts)) return undefined;
  const declaration = manifest.scripts[match[1]];
  return typeof declaration === 'string' ? declaration : undefined;
}

async function portableDeclaration(root: string, location: string): Promise<string | undefined> {
  const match = /^postvibe\.verification\.yaml#commands\[([0-9]+)\]$/u.exec(location);
  if (match?.[1] === undefined) return undefined;
  const index = Number(match[1]);
  const config = await loadVerificationConfig(root);
  const command = config?.commands[index];
  return command === undefined ? undefined : JSON.stringify(command);
}

export async function commandSourceMatchesApproval(
  root: string,
  command: VerificationCommand,
): Promise<boolean> {
  try {
    if (sha256(command.source.declaration) !== command.source.sha256) return false;
    const declaration = command.source.kind === 'package-script'
      ? await packageScriptDeclaration(root, command.source.location)
      : await portableDeclaration(root, command.source.location);
    return declaration === command.source.declaration;
  } catch {
    return false;
  }
}

async function digestFile(path: string): Promise<string> {
  return createHash('sha256').update(await readFile(path)).digest('hex');
}

async function inputDigestMatches(root: string, location: string, expected: string): Promise<boolean> {
  const path = await resolveExistingFileInsideProject(root, location);
  return path !== undefined && await digestFile(path) === expected;
}

export async function commandLauncherMatchesApproval(
  root: string,
  command: VerificationCommand,
): Promise<boolean> {
  if (command.source.kind === 'portable-config') return command.launcher === undefined;
  const launcher = command.launcher;
  if (launcher === undefined || command.argv[0] !== launcher.executable) return false;
  try {
    if (await digestFile(launcher.executable) !== launcher.sha256) return false;
    if ((launcher.entrypoint === undefined) !== (launcher.entrypointArgvIndex === undefined)) return false;
    if (launcher.entrypoint !== undefined && launcher.entrypointArgvIndex !== undefined) {
      const entrypoint = await resolveExistingFileInsideProject(root, launcher.entrypoint.location);
      if (entrypoint === undefined || command.argv[launcher.entrypointArgvIndex] !== entrypoint) return false;
      if (!await inputDigestMatches(root, launcher.entrypoint.location, launcher.entrypoint.sha256)) return false;
    }
    if (launcher.kind === 'node-package-bin') {
      return launcher.entrypoint !== undefined
        && launcher.entrypointArgvIndex === 1
        && launcher.packageManifest !== undefined
        && await inputDigestMatches(root, launcher.packageManifest.location, launcher.packageManifest.sha256);
    }
    if (launcher.kind === 'direct-executable') {
      return launcher.entrypoint === undefined
        && launcher.entrypointArgvIndex === undefined
        && launcher.packageManifest === undefined;
    }
    return launcher.packageManifest === undefined;
  } catch {
    return false;
  }
}
