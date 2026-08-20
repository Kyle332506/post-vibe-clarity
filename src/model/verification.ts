import type { ReadinessReport } from './report.js';

export type CommandCategory = 'build' | 'test' | 'type-check' | 'lint';
export type CommandSourceKind = 'package-script' | 'portable-config';
export type CommandResultStatus =
  | 'passed'
  | 'failed'
  | 'timed-out'
  | 'could-not-start'
  | 'interrupted'
  | 'unverified';

export interface VerificationCommandSource {
  kind: CommandSourceKind;
  location: string;
  declaration: string;
  sha256: string;
}

export interface PackageScriptLauncher {
  policyVersion: 'package-script-launcher/0.1';
  kind: 'node-runtime' | 'node-package-bin' | 'direct-executable';
  executable: string;
  sha256: string;
  entrypoint?: InputDigest;
  packageManifest?: InputDigest;
}

export interface VerificationCommand {
  id: string;
  category: CommandCategory;
  argv: string[];
  cwd: string;
  timeoutSeconds: number;
  requiredAccess: ['local-command'];
  source: VerificationCommandSource;
  launcher?: PackageScriptLauncher;
}

export interface InputDigest {
  location: string;
  sha256: string;
}

export interface VerificationCoverageGap {
  id: string;
  category?: CommandCategory;
  reason: string;
  workspace?: string;
}

export interface VerificationCategoryAssessment {
  category: CommandCategory;
  state: 'applicable' | 'not-applicable' | 'unverified';
  reason: string;
}

export interface ExecutionPolicy {
  environmentPolicyVersion: 'env-filter/0.1';
  outputLimitBytes: 262144;
  executor: 'local-process/0.1';
}

export interface VerificationPlan {
  schemaId: 'postvibe-verification-plan/0.1';
  schemaVersion: '0.1';
  planId: string;
  fingerprint: string;
  toolkitVersion: string;
  generatedAt: string;
  projectRoot: string;
  skillsRoot: string;
  planningReport: ReadinessReport;
  inputDigests: InputDigest[];
  skillDigests: InputDigest[];
  commands: VerificationCommand[];
  excludedCommands: VerificationCommand[];
  categoryAssessments: VerificationCategoryAssessment[];
  coverageGaps: VerificationCoverageGap[];
  executionPolicy: ExecutionPolicy;
  containmentWarning: string;
  disclaimer: string;
}

export interface FileChange {
  path: string;
  kind: 'added' | 'modified' | 'removed';
}

export interface ProjectRootIdentity {
  realPath: string;
  device: string;
  inode: string;
}

export interface ObservationBoundary {
  policyVersion: 'project-observation/0.1';
  rootIdentity: ProjectRootIdentity;
  versionControlDirectories: ['.git'];
  artifactDirectories: ['.postvibe'];
  coverageDirectories: ['coverage'];
  distributionDirectories: ['dist'];
  dependencyDirectories: ['node_modules'];
  exactArtifactExclusions: string[];
  symlinks: 'not-followed';
  nonRegularFiles: 'not-observed';
  inaccessiblePaths: 'observation-fails';
  metadata: 'content-sha256-only';
}

export interface VerificationCommandResult {
  commandId: string;
  status: CommandResultStatus;
  startedAt?: string;
  durationMs?: number;
  exitCode: number | null;
  signal: string | null;
  output: string;
  outputTruncated: boolean;
  fileChanges: FileChange[];
  unverifiedReason?: string;
}

export interface VerificationExecution {
  schemaId: 'postvibe-verification-execution/0.1';
  schemaVersion: '0.1';
  executionId: string;
  status: 'completed' | 'partial';
  planId: string;
  planFingerprint: string;
  toolkitVersion: string;
  projectRoot: string;
  startedAt: string;
  completedAt: string;
  removedEnvironmentVariables: string[];
  results: VerificationCommandResult[];
  coverageGaps: VerificationCoverageGap[];
  observationBoundary: ObservationBoundary;
  containmentWarning: string;
  disclaimer: string;
}
