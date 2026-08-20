import { realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import type {
  ObservationBoundary,
  ProjectRootIdentity,
} from '../model/verification.js';
import { compareOrdinal } from '../ordinal.js';

export const PROJECT_ROOT_DRIFT_ERROR = 'Approved project root identity changed; post-command observation was not performed.';

export async function captureProjectRootIdentity(root: string): Promise<ProjectRootIdentity> {
  const realPath = await realpath(root);
  const details = await stat(realPath, { bigint: true });
  if (!details.isDirectory()) throw new Error(PROJECT_ROOT_DRIFT_ERROR);
  return {
    realPath,
    device: details.dev.toString(),
    inode: details.ino.toString(),
  };
}

export async function assertProjectRootIdentity(
  root: string,
  expected: ProjectRootIdentity,
): Promise<void> {
  try {
    const current = await captureProjectRootIdentity(root);
    if (
      current.realPath !== expected.realPath
      || current.device !== expected.device
      || current.inode !== expected.inode
    ) {
      throw new Error(PROJECT_ROOT_DRIFT_ERROR);
    }
  } catch {
    throw new Error(PROJECT_ROOT_DRIFT_ERROR);
  }
}

export function buildObservationBoundary(
  rootIdentity: ProjectRootIdentity,
  excludedArtifactPaths: readonly string[],
): ObservationBoundary {
  return {
    policyVersion: 'project-observation/0.1',
    rootIdentity: { ...rootIdentity },
    versionControlDirectories: ['.git'],
    artifactDirectories: ['.postvibe'],
    coverageDirectories: ['coverage'],
    distributionDirectories: ['dist'],
    dependencyDirectories: ['node_modules'],
    exactArtifactExclusions: [...new Set(excludedArtifactPaths.map((path) => resolve(path)))].sort(compareOrdinal),
    symlinks: 'not-followed',
    nonRegularFiles: 'not-observed',
    inaccessiblePaths: 'observation-fails',
    metadata: 'content-sha256-only',
  };
}
