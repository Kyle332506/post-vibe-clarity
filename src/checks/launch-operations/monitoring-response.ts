import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

const monitoringRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'signals',
    patterns: [
      /^[\t ]*(?:signals?|observed (?:signals?|failures)|failure types?)[\t ]*:[\t ]*[^\r\n]*\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b[^\r\n]*$/imu,
      /["']?(?:signals?|observed[_ -]?signals?|failure[_ -]?types?)["']?[\t ]*:[\t ]*[^\r\n]*\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b/iu,
      /["']?(?:signals?|observed[_ -]?signals?|failure[_ -]?types?)["']?[\t ]*:[\t ]*\[[\s\S]{0,240}?\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b[\s\S]{0,240}?\]/iu,
      /\balerts?[\t ]+for[\t ]+[^\r\n.!?]{0,120}\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b/iu,
    ],
  },
  {
    id: 'review-location',
    patterns: [
      /^[\t ]*(?:review location|review (?:in|at)|monitoring location)[\t ]*:[\t ]*[^\r\n]*\b(?:monitoring|crash[- ]reporting|observability|alert)[\t ]+(?:dashboard|console|service)\b[^\r\n]*$/imu,
      /["']?(?:review[_ -]?location|monitoring[_ -]?location)["']?[\t ]*:[\t ]*[^\r\n]*\b(?:grafana|monitoring[\t ]+dashboard|crash[- ]reporting[\t ]+dashboard|observability[\t ]+(?:dashboard|console)|alert[\t ]+service)\b/iu,
      /\b(?:alerts?|signals?|failures?)[\t ]+[^\r\n.!?]{0,120}\breview(?:ed|s)?[\t ]+(?:in|on|through|using)[\t ]+(?:Grafana|[^\r\n.!?]{0,80}\b(?:dashboard|console)\b)/iu,
    ],
  },
  {
    id: 'notification-expectation',
    patterns: [
      /^[\t ]*(?:notification expectation|notification|alerting)[\t ]*:[\t ]*[^\r\n]*\b(?:alert|notify|review)\w*[^\r\n]*\b(?:maintainer|on-call|owner|promptly|within|immediately)\b[^\r\n]*$/imu,
      /["']?notification[_ -]?expectation["']?[\t ]*:[\t ]*[^\r\n]*\b(?:review(?:ed|s)?|notify|page|acknowledge(?:d|s)?)[\t ]+[^\r\n.!?]{0,100}\balerts?\b[^\r\n.!?]{0,100}\b(?:within[\t ]+\d+[\t ]+(?:minutes?|hours?)|promptly|immediately)\b/iu,
      /\balerts?\b[^\r\n.!?]{0,160}\b(?:review(?:ed|s)?|notify|page|acknowledge(?:d|s)?)\b[^\r\n.!?]{0,160}\b(?:within[\t ]+\d+[\t ]+(?:minutes?|hours?)|promptly|immediately)\b/iu,
    ],
  },
  {
    id: 'first-response',
    patterns: [
      /^[\t ]*(?:\d+[.)]|[-*])[\t ]+(?:triage|investigate|assess|capture|escalate|mitigate|follow|disable|rollback|roll back|notify|page)\b[^\r\n]*$/imu,
      /["']?(?:first|initial)[_ -]?response["']?[\t ]*:[\t ]*[^\r\n]*\b(?:triage|investigate|assess|capture|escalate|mitigate|follow|disable|rollback|roll back|notify|page)\b[^\r\n]*\b(?:alerts?|failures?|incidents?)\b/iu,
      /\b(?:triage(?:s|d)?|investigate(?:s|d)?|assess(?:es|ed)?|capture(?:s|d)?|escalate(?:s|d)?|mitigate(?:s|d)?)\b[^\r\n.!?]{0,120}\b(?:alerts?|failures?|incidents?)\b[^\r\n.!?]{0,80}\b(?:first|initially)\b/iu,
    ],
  },
  {
    id: 'owner',
    patterns: [
      /^[\t ]*(?:owner|responsible(?: role)?|incident owner)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)[^\r\n]*(?:\b(?:maintainer|team|lead|owner|on-call|engineer|operator|responder|support)\b|(?:[A-Z][a-z]+[\t ]+){1,3}[A-Z][a-z]+)[^\r\n]*$/imu,
      /["']?(?:owner|responsible[_ -]?role|incident[_ -]?owner)["']?[\t ]*:[\t ]*(?!["']?[\t ]*(?:tbd|todo|unknown|n\/a)\b)[^\r\n]*\b(?:sre|maintainer|team|lead|owner|on-call|engineer|operator|responder|support)\b/iu,
      /\b(?:review(?:ed|s)?|own(?:ed|s)?|handle(?:d|s)?|triage(?:d|s)?)\b[^\r\n.!?]{0,160}\bby[\t ]+(?:the[\t ]+)?\b(?:SRE|maintainers?|on-call|[A-Z][a-z]+[\t ]+[A-Z][a-z]+)\b/iu,
    ],
  },
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
