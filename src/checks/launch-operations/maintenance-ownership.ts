import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

const maintenanceOwnershipRequirements: readonly EvidenceRequirement[] = [
  { id: 'owner', patterns: [/\b(?:owner|responsible|maintainer|team)\s*:\s*\S/iu] },
  { id: 'support-route', patterns: [/\b(?:support route|support|issue[- ]reporting|repository issues|report (?:an )?issue)\b/iu] },
  { id: 'review-expectation', patterns: [/\b(?:dependency|platform|operational)\b.*\b(?:review(?:ed)?|monthly|weekly|quarterly)\b|\breview cadence\s*:\s*.*\b(?:monthly|weekly|quarterly|review(?:ed)?)\b/iu] },
  { id: 'handoff', patterns: [/\b(?:handoff|continuity|transition)\s*:\s*\S|\bCODEOWNERS\b/iu] },
];

export const maintenanceOwnershipCheck = createOperationsCheck({
  id: 'launch-operations.maintenance-ownership',
  label: 'Maintenance ownership',
  domains: ['maintainability-change-safety'],
  actionLevel: 'plan-soon',
  profile: () => ({
    candidatePaths: [
      /(?:^|\/)(?:CODEOWNERS|MAINTAINERS[^/]*|SUPPORT[^/]*)$/iu,
      /(?:^|\/)[^/]*(?:operations?|ownership|maintainers?|support)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
    ],
    requirements: maintenanceOwnershipRequirements,
    riskPatterns: [],
  }),
  recommendation: 'Document maintenance ownership, the support route, review expectations, and handoff responsibilities.',
  verification: 'Review the documented ownership, support, review, and handoff expectations with the maintainers.',
  liveBoundary: 'No live support route or maintenance process was queried.',
});
