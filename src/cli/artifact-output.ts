import { link, lstat, open, unlink } from 'node:fs/promises';
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

const closedFiles = new WeakSet<OwnedFile>();
const releasedFiles = new WeakSet<OwnedFile>();

export function artifactTemporaryPath(path: string): string {
  return `${path}.tmp`;
}

function sameIdentity(left: FileIdentity, right: FileIdentity): boolean {
  return left.dev === right.dev && left.ino === right.ino;
}

function ownershipError(path: string): ArtifactFileOwnershipError {
  return new ArtifactFileOwnershipError(
    `Artifact file ownership changed; no foreign file was removed or published: ${path}`,
  );
}

async function assertOwnedPath(file: OwnedFile, path = file.path): Promise<void> {
  let identity: FileIdentity;
  try {
    const details = await lstat(path, { bigint: true });
    identity = { dev: details.dev, ino: details.ino };
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

async function removeOwnedPath(file: OwnedFile): Promise<void> {
  if (releasedFiles.has(file)) return;
  await assertOwnedPath(file);
  await unlink(file.path);
  releasedFiles.add(file);
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

export async function releaseOwnedFile(file: OwnedFile): Promise<void> {
  let removalError: unknown;
  let closeError: unknown;
  if (!releasedFiles.has(file)) {
    try {
      await removeOwnedPath(file);
    } catch (error) {
      removalError = error;
    }
  }
  try {
    await closeOwnedFile(file);
  } catch (error) {
    closeError = error;
  }
  if (removalError !== undefined && closeError !== undefined) {
    throw new AggregateError([removalError, closeError], 'Owned-file removal and handle close both failed.');
  }
  if (removalError !== undefined) throw removalError;
  if (closeError !== undefined) throw closeError;
}

async function cleanupAfterFailure(file: OwnedFile, primaryError: unknown): Promise<never> {
  try {
    await releaseOwnedFile(file);
  } catch (cleanupError) {
    if (primaryError instanceof ArtifactFileOwnershipError) throw primaryError;
    if (cleanupError instanceof ArtifactFileOwnershipError) throw cleanupError;
    throw new AggregateError([primaryError, cleanupError], 'Artifact publication and owned-file cleanup both failed.');
  }
  throw primaryError;
}

export async function publishOwnedFileExclusively(file: OwnedFile, path: string): Promise<void> {
  try {
    await assertOwnedPath(file);
    await link(file.path, path);
    await assertOwnedPath(file, path);
    await releaseOwnedFile(file);
  } catch (error) {
    await cleanupAfterFailure(file, error);
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
      await cleanupAfterFailure(temporaryFile, error);
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
