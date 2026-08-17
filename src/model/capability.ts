import type { Evidence } from './finding.js';

export type ArtifactType = 'web' | 'mobile' | 'desktop' | 'cli' | 'backend' | 'worker' | 'library' | 'extension' | 'ai-agent' | 'infrastructure' | 'monorepo';
export type DetectionConfidence = 'confirmed' | 'likely';

export interface Detection<T extends string> {
  value: T;
  confidence: DetectionConfidence;
  evidence: Evidence[];
}

export interface CapabilityManifest {
  schemaVersion: '0.1';
  projectRoot: string;
  generatedAt: string;
  artifacts: Detection<ArtifactType>[];
  frameworks: Detection<string>[];
  services: Detection<string>[];
  capabilities: Detection<string>[];
}
