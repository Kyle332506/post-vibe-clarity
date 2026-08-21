import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

const monitoringRequirements: readonly EvidenceRequirement[] = [
  { id: 'signals', patterns: [/\b(?:signals?|application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?)\b/iu] },
  { id: 'review-location', patterns: [/\b(?:review location|monitoring dashboard|crash(?:[- ]reporting)? dashboard|configured monitoring)\b/iu] },
  { id: 'notification-expectation', patterns: [/\b(?:notification expectation|alerts?|notify|notification)\b/iu] },
  { id: 'first-response', patterns: [/^\s*(?:\d+[.)]|[-*]\s+\[[ xX]\])\s+\S/mu] },
  { id: 'owner', patterns: [/\b(?:owner|responsible|on-call maintainer|incident (?:lead|commander))\s*:?\s*\S/iu] },
];

export const monitoringResponseCheck = createOperationsCheck({
  id: 'launch-operations.monitoring-response',
  label: 'Monitoring and incident response',
  domains: ['operations-observability'],
  actionLevel: 'resolve-before-launch',
  profile: () => ({
    candidatePaths: [
      /(?:^|\/)[^/]*(?:monitoring|incident|crash|operations?|runbooks?)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
    ],
    requirements: monitoringRequirements,
    riskPatterns: [],
  }),
  recommendation: 'Document observed signals, the review location, notification expectations, first response steps, and ownership.',
  verification: 'Review the documented monitoring and incident response procedure with the responsible maintainer and test live behavior separately.',
  liveBoundary: 'No provider was queried and no alert delivery or response was tested.',
});
