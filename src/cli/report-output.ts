import { writeFile } from 'node:fs/promises';

export class ReportFileCollisionError extends Error {}

export async function writeReportExclusively(path: string, contents: string): Promise<void> {
  try {
    await writeFile(path, contents, { flag: 'wx' });
  } catch (error: unknown) {
    if (isAlreadyExistsError(error)) {
      throw new ReportFileCollisionError(`Report file already exists; no file was overwritten: ${path}`);
    }
    throw error;
  }
}

function isAlreadyExistsError(error: unknown): error is NodeJS.ErrnoException {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'EEXIST';
}
