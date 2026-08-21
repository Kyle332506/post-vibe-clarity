import type { CapabilityManifest } from '../model/capability.js';
import type { Domain, Finding } from '../model/finding.js';

export type RequiredAccess = 'filesystem-read' | 'local-command' | 'network' | 'test-account' | 'credential';

export interface CheckContext {
  root: string;
  manifest: CapabilityManifest;
  excludedArtifactPaths?: readonly string[];
}

export interface CheckImplementation {
  readonly id: string;
  readonly version: string;
  readonly domains: readonly Domain[];
  readonly actionLevel: 0 | 1 | 2 | 3 | 4;
  readonly requiredAccess: readonly RequiredAccess[];
  readonly run: (context: CheckContext) => Promise<Finding[]>;
}

export type CheckRegistry = ReadonlyMap<string, CheckImplementation>;
