import { createOperationsCheck } from './create-check.js';
import {
  hasConcreteOwnerEvidence,
  hasEvidenceSubstance,
  hasNegatedEvidenceIntent,
  labeledTextValueMatcher,
  matchesAnyEvidence,
  normalizeEvidenceValue,
  orderedTextValueMatcher,
  proseLineValueMatcher,
  structuredFieldValueMatcher,
} from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

type ValuePredicate = (value: string) => boolean;

const monitoredSignal = /\b(?:application errors?|failed requests?|crash(?: reports?|[- ]reporting)|exceptions?|latency|availability)\b/iu;
const monitoringDestination = /\b(?:grafana|monitoring[\t ]+dashboard|crash[- ]reporting[\t ]+dashboard|observability[\t ]+(?:dashboard|console)|alert[\t ]+service)\b/iu;
const notificationAction = /\b(?:review\w*|notif(?:y|ies|ied|ication\w*)|page\w*|acknowledge\w*)\b/iu;
const responseTiming = /\b(?:within[\t ]+\d+[\t ]+(?:minutes?|hours?)|promptly|immediately)\b/iu;
const notificationTerms = /\b(?:alerts?|review\w*|notif(?:y|ies|ied|ication\w*)|page\w*|acknowledge\w*)\b/iu;
const firstResponseTerms = /\b(?:triag\w*|investigat\w*|assess\w*|captur\w*|escalat\w*|mitigat\w*|follow\w*|disabl\w*|rollback|roll back|notif\w*|pag\w*|alerts?|failures?|incidents?|affected release|failure time)\b/iu;

const signalsValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['signals', 'observed signals', 'observed failures', 'failure types'],
    minimumWords: 2,
  }) && !hasNegatedEvidenceIntent(normalized, monitoredSignal)
    && monitoredSignal.test(normalized);
};

const reviewLocationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['review location', 'monitoring location'],
    minimumWords: 2,
  }) && !hasNegatedEvidenceIntent(normalized, monitoringDestination)
    && monitoringDestination.test(normalized);
};

const notificationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['notification expectation', 'notification', 'alerting'],
    minimumWords: 5,
  })
    && !hasNegatedEvidenceIntent(normalized, notificationTerms)
    && /\balerts?\b/iu.test(normalized)
    && notificationAction.test(normalized)
    && responseTiming.test(normalized);
};

const firstResponseValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['first response', 'initial response'],
    minimumWords: 5,
  })
    && !hasNegatedEvidenceIntent(normalized, firstResponseTerms)
    && /\b(?:triag\w*|investigat\w*|assess\w*|captur\w*|escalat\w*|mitigat\w*|follow\w*|disabl\w*|rollback|roll back|notif\w*|pag\w*)\b/iu.test(normalized)
    && /\b(?:alerts?|failures?|incidents?|affected release|failure time)\b/iu.test(normalized);
};

const ownerValue: ValuePredicate = (value) => hasConcreteOwnerEvidence(value, ['incident owner', 'responder']);

const monitoringRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'signals',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['signals', 'observed signals', 'observed failures', 'failure types'], signalsValue),
      proseLineValueMatcher(signalsValue),
      structuredFieldValueMatcher(['signals', 'observedSignals', 'observed_signals', 'observedFailures', 'observed_failures', 'failureTypes', 'failure_types'], signalsValue),
    ),
  },
  {
    id: 'review-location',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['review location', 'monitoring location'], reviewLocationValue),
      proseLineValueMatcher(reviewLocationValue),
      structuredFieldValueMatcher(['reviewLocation', 'review_location', 'monitoringLocation', 'monitoring_location'], reviewLocationValue),
    ),
  },
  {
    id: 'notification-expectation',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['notification expectation', 'notification', 'alerting'], notificationValue),
      proseLineValueMatcher(notificationValue),
      structuredFieldValueMatcher(['notificationExpectation', 'notification_expectation', 'notification', 'alerting'], notificationValue),
    ),
  },
  {
    id: 'first-response',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAnyEvidence(
      orderedTextValueMatcher(firstResponseValue),
      labeledTextValueMatcher(['first response', 'initial response'], firstResponseValue),
      proseLineValueMatcher(firstResponseValue),
      structuredFieldValueMatcher(['firstResponse', 'first_response', 'initialResponse', 'initial_response'], firstResponseValue),
    ),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['owner', 'responsible role', 'incident owner'], ownerValue),
      proseLineValueMatcher((value) => /\bby[\t ]+(?:the[\t ]+)?(?:sre|maintainers?|on-call|[A-Z][a-z]+[\t ]+[A-Z][a-z]+)/iu.test(value) && ownerValue(value)),
      structuredFieldValueMatcher(['owner', 'responsibleRole', 'responsible_role', 'incidentOwner', 'incident_owner'], ownerValue),
    ),
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
