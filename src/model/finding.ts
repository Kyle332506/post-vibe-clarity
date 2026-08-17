export type Domain = 'product-ux' | 'security-privacy' | 'data-correctness' | 'reliability-recovery' | 'operations-observability' | 'performance-cost' | 'maintainability-change-safety' | 'release-delivery' | 'policy-business-essentials';
export type ActionLevel = 'stop-before-launch' | 'resolve-before-launch' | 'plan-soon' | 'improve-when-appropriate' | 'human-review-needed';
export type Outcome = 'passed' | 'failed' | 'likely-issue' | 'unverified' | 'not-applicable' | 'risk-accepted' | 'resolved-and-rechecked';
export type EvidenceKind = 'file' | 'command' | 'behavior' | 'human';
export type EvidenceConfidence = 'confirmed' | 'strong-indication' | 'possible' | 'insufficient';

export interface Evidence {
  kind: EvidenceKind;
  summary: string;
  location?: string;
}

export interface Finding {
  id: string;
  checkId: string;
  skillVersion: string;
  domains: Domain[];
  actionLevel: ActionLevel;
  outcome: Outcome;
  title: string;
  impact: string;
  evidence: Evidence[];
  evidenceConfidence: EvidenceConfidence;
  applicability: string;
  recommendation: string;
  verification: string;
  humanReviewRequired: boolean;
  unverifiedBoundaries?: string[];
}
