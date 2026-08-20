import { link, open, unlink } from 'node:fs/promises';
import type { FileHandle } from 'node:fs/promises';

export class ArtifactFileCollisionError extends Error {}

export function artifactTemporaryPath(path: string): string {
  return `${path}.tmp`;
}

export async function writeArtifactExclusively(path: string, contents: string): Promise<void> {
  const temporaryPath = artifactTemporaryPath(path);
  let temporaryFile: FileHandle | undefined;
  let ownsTemporaryFile = false;

  try {
    temporaryFile = await open(temporaryPath, 'wx');
    ownsTemporaryFile = true;
    await temporaryFile.writeFile(contents, 'utf8');
    await temporaryFile.sync();
    await temporaryFile.close();
    temporaryFile = undefined;
    await link(temporaryPath, path);
    await unlink(temporaryPath);
    ownsTemporaryFile = false;
  } catch (error) {
    await temporaryFile?.close().catch(() => undefined);
    if (ownsTemporaryFile) await unlink(temporaryPath).catch(() => undefined);
    if (isAlreadyExistsError(error)) {
      throw new ArtifactFileCollisionError(`Artifact file already exists; no file was overwritten: ${path}`);
    }
    throw error;
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
