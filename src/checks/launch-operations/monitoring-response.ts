import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

const monitoringRequirements: readonly EvidenceRequirement[] = [
  { id: 'signals', patterns: [/^[\t ]*(?:signals?|observed (?:signals?|failures)|failure types?)[\t ]*:[\t ]*[^\r\n]*\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b[^\r\n]*$/imu] },
  { id: 'review-location', patterns: [/^[\t ]*(?:review location|review (?:in|at)|monitoring location)[\t ]*:[\t ]*[^\r\n]*\b(?:monitoring|crash[- ]reporting|observability|alert)[\t ]+(?:dashboard|console|service)\b[^\r\n]*$/imu] },
  { id: 'notification-expectation', patterns: [/^[\t ]*(?:notification expectation|notification|alerting)[\t ]*:[\t ]*[^\r\n]*\b(?:alert|notify|review)\w*[^\r\n]*\b(?:maintainer|on-call|owner|promptly|within|immediately)\b[^\r\n]*$/imu] },
  { id: 'first-response', patterns: [/^[\t ]*(?:\d+[.)]|[-*])[\t ]+(?:triage|investigate|assess|capture|escalate|mitigate|follow|disable|rollback|roll back|notify|page)\b[^\r\n]*$/imu] },
  { id: 'owner', patterns: [/^[\t ]*(?:owner|responsible(?: role)?|incident owner)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)[^\r\n]*(?:\b(?:maintainer|team|lead|owner|on-call|engineer|operator|responder|support)\b|(?:[A-Z][a-z]+[\t ]+){1,3}[A-Z][a-z]+)[^\r\n]*$/imu] },
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
