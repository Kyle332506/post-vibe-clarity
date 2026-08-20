import { randomUUID } from 'node:crypto';
import { link, lstat, open, rename, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

export class ArtifactFileCollisionError extends Error {}
export class ArtifactFileOwnershipError extends Error {}

interface FileIdentity {
  dev: bigint;
  ino: bigint;
}

export interface OwnedFile {
  path: string;
  handle: FileHandle;
  identity: FileIdentity;
}

export interface OwnedFileReleaseHooks {
  beforeQuarantine?: (path: string) => Promise<void>;
  afterOwnedQuarantine?: (path: string) => Promise<void>;
}

export interface ArtifactPublicationHooks {
  afterSourceQuarantine?: (sourcePath: string) => Promise<void>;
  afterFinalLink?: (path: string) => Promise<void>;
  beforeSourceCleanup?: () => Promise<void>;
}

const closedFiles = new WeakSet<OwnedFile>();
const releasedFiles = new WeakSet<OwnedFile>();

export function artifactTemporaryPath(path: string): string {
  return `${path}.tmp`;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownershipError(path: string, preservedPath?: string): ArtifactFileOwnershipError {
  const preservation = preservedPath === undefined ? '' : ` Foreign content was preserved at: ${preservedPath}`;
  return new ArtifactFileOwnershipError(
    `Artifact file ownership changed; no foreign file was removed or published: ${path}${preservation}`,
  );
}

async function identityAt(path: string): Promise<FileIdentity> {
  const details = await lstat(path, { bigint: true });
  return { dev: details.dev, ino: details.ino };
}

async function assertOwnedPath(file: OwnedFile, path = file.path): Promise<void> {
  let identity: FileIdentity;
  try {
    identity = await identityAt(path);
  } catch {
    throw ownershipError(path);
  }
  if (!sameIdentity(file.identity, identity)) throw ownershipError(path);
}

async function closeOwnedFile(file: OwnedFile): Promise<void> {
  if (closedFiles.has(file)) return;
  await file.handle.close();
  closedFiles.add(file);
}

function quarantinePath(path: string): string {
  return `${path}.quarantine-${randomUUID()}`;
}

async function restoreForeignEntry(quarantine: string, publicPath: string): Promise<never> {
  try {
    await link(quarantine, publicPath);
  } catch {
    throw ownershipError(publicPath, quarantine);
  }

  try {
    await unlink(quarantine);
  } catch {
    throw ownershipError(publicPath, quarantine);
  }

  throw ownershipError(publicPath);
}

async function quarantineOwnedPath(
  file: OwnedFile,
  path: string,
  beforeQuarantine?: (path: string) => Promise<void>,
): Promise<string> {
  await beforeQuarantine?.(path);
  const quarantine = quarantinePath(path);

  try {
    await rename(path, quarantine);
  } catch {
    throw ownershipError(path);
  }

  let movedIdentity: FileIdentity;
  try {
    movedIdentity = await identityAt(quarantine);
  } catch {
    throw ownershipError(path, quarantine);
  }

  if (!sameIdentity(file.identity, movedIdentity)) {
    await restoreForeignEntry(quarantine, path);
  }

  return quarantine;
}

async function removeOwnedQuarantine(file: OwnedFile, quarantine: string): Promise<void> {
  await assertOwnedPath(file, quarantine);
  await unlink(quarantine);
}

async function rollbackPublishedPath(file: OwnedFile, path: string): Promise<void> {
  const quarantine = quarantinePath(path);
  try {
    await rename(path, quarantine);
  } catch (error) {
    if (isMissingError(error)) return;
    throw error;
  }

  let movedIdentity: FileIdentity;
  try {
    movedIdentity = await identityAt(quarantine);
  } catch {
    throw ownershipError(path, quarantine);
  }

  if (!sameIdentity(file.identity, movedIdentity)) {
    await restoreForeignEntry(quarantine, path);
  }

  await unlink(quarantine);
}

function combineFailures(primaryError: unknown, cleanupError: unknown, message: string): unknown {
  if (primaryError instanceof ArtifactFileOwnershipError) return primaryError;
  if (cleanupError instanceof ArtifactFileOwnershipError) return cleanupError;
  return new AggregateError([primaryError, cleanupError], message);
}

export async function acquireOwnedFileExclusively(path: string): Promise<OwnedFile> {
  const handle = await open(path, 'wx');
  try {
    const details = await handle.stat({ bigint: true });
    const file: OwnedFile = {
      path,
      handle,
      identity: { dev: details.dev, ino: details.ino },
    };
    await assertOwnedPath(file);
    return file;
  } catch (error) {
    await handle.close().catch(() => undefined);
    throw error;
  }
}

export async function releaseOwnedFile(file: OwnedFile, hooks: OwnedFileReleaseHooks = {}): Promise<void> {
  let primaryError: unknown;

  if (!releasedFiles.has(file)) {
    try {
      const quarantine = await quarantineOwnedPath(file, file.path, hooks.beforeQuarantine);
      await hooks.afterOwnedQuarantine?.(file.path);
      await removeOwnedQuarantine(file, quarantine);
      releasedFiles.add(file);
    } catch (error) {
      primaryError = error;
    }
  }

  try {
    await closeOwnedFile(file);
  } catch (closeError) {
    if (primaryError !== undefined) {
      throw combineFailures(primaryError, closeError, 'Owned-file release and handle close both failed.');
    }
    throw closeError;
  }

  if (primaryError !== undefined) throw primaryError;
}

async function cleanupQuarantinedSource(file: OwnedFile, sourceQuarantine: string): Promise<void> {
  if (releasedFiles.has(file)) return;
  await removeOwnedQuarantine(file, sourceQuarantine);
  releasedFiles.add(file);
}

async function cleanupPublicationFailure(
  file: OwnedFile,
  path: string,
  sourceQuarantine: string | undefined,
  linked: boolean,
  primaryError: unknown,
): Promise<never> {
  let failure = primaryError;

  if (linked) {
    try {
      await rollbackPublishedPath(file, path);
    } catch (rollbackError) {
      failure = combineFailures(failure, rollbackError, 'Artifact publication and completed-file rollback both failed.');
    }
  }

  if (sourceQuarantine !== undefined && !releasedFiles.has(file)) {
    try {
      await cleanupQuarantinedSource(file, sourceQuarantine);
    } catch (cleanupError) {
      failure = combineFailures(failure, cleanupError, 'Artifact publication and owned-file cleanup both failed.');
    }
  } else if (!releasedFiles.has(file)) {
    try {
      await releaseOwnedFile(file);
    } catch (cleanupError) {
      failure = combineFailures(failure, cleanupError, 'Artifact publication and owned-file cleanup both failed.');
    }
  }

  try {
    await closeOwnedFile(file);
  } catch (closeError) {
    failure = combineFailures(failure, closeError, 'Artifact publication and handle close both failed.');
  }

  throw failure;
}

export async function publishOwnedFileExclusively(
  file: OwnedFile,
  path: string,
  hooks: ArtifactPublicationHooks = {},
): Promise<void> {
  let sourceQuarantine: string | undefined;
  let linked = false;

  try {
    sourceQuarantine = await quarantineOwnedPath(file, file.path);
    await hooks.afterSourceQuarantine?.(file.path);
    await link(sourceQuarantine, path);
    linked = true;
    await hooks.afterFinalLink?.(path);
    await assertOwnedPath(file, path);
    await closeOwnedFile(file);
    await hooks.beforeSourceCleanup?.();
    await cleanupQuarantinedSource(file, sourceQuarantine);
    // This final identity check is the commit point; no fallible cleanup follows it.
    await assertOwnedPath(file, path);
  } catch (error) {
    await cleanupPublicationFailure(file, path, sourceQuarantine, linked, error);
  }
}

export async function writeArtifactExclusively(path: string, contents: string): Promise<void> {
  const temporaryPath = artifactTemporaryPath(path);
  let temporaryFile: OwnedFile | undefined;

  try {
    temporaryFile = await acquireOwnedFileExclusively(temporaryPath);
    await temporaryFile.handle.writeFile(contents, 'utf8');
    await temporaryFile.handle.sync();
    await publishOwnedFileExclusively(temporaryFile, path);
  } catch (error) {
    if (temporaryFile !== undefined && !releasedFiles.has(temporaryFile)) {
      try {
        await releaseOwnedFile(temporaryFile);
      } catch (cleanupError) {
        throw combineFailures(error, cleanupError, 'Artifact write and owned-file cleanup both failed.');
      }
    }
    if (isAlreadyExistsError(error)) {
      throw new ArtifactFileCollisionError(`Artifact file already exists; no file was overwritten: ${path}`);
    }
    throw error;
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}

function isMissingError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT';
}
