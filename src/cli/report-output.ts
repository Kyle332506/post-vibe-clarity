import { ArtifactFileCollisionError, writeArtifactExclusively } from './artifact-output.js';

export class ReportFileCollisionError extends Error {}

export async function writeReportExclusively(path: string, contents: string): Promise<void> {
  try {
    await writeArtifactExclusively(path, contents);
  } catch (error: unknown) {
    if (error instanceof ArtifactFileCollisionError) {
      throw new ReportFileCollisionError(`Report file already exists; no file was overwritten: ${path}`);
    }
    throw error;
  }
}
