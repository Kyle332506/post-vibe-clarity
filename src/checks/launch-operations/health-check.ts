import { createOperationsCheck } from './create-check.js';
import { structuredFieldMatcher } from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

const probeValue = /(?:\b(?:GET|HEAD)\b[\t ]+\/\S*|\/\b(?:health|readiness|liveness)\b)/iu;
const expectedResultValue = /(?:HTTP[\t ]+2\d\d|status(?: code)?[\t ]+(?:is[\t ]+)?2\d\d|\bok\b)/iu;
const coverageBoundaryValue = /\b(?:does not|doesn't|only|but not|excluding|without)\b/iu;
const failureSurfacingValue = /\b(?:alert\w*|notif(?:y|ies|ied|ication\w*)|pag(?:e|es|ed|ing)|surfac\w*|report\w*)\b/iu;
const ownerValue = /\b(?:maintainer|owner|on-call|team|lead|engineer|operator|responder|support|sre)\b/iu;

const healthRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'probe',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:probe|endpoint|health check)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b)[^\r\n]*(?:\b(?:GET|HEAD)\b[\t ]+\/\S*|\/\b(?:health|readiness|liveness)\b)[^\r\n]*$/imu,
      /\b(?:GET|HEAD)[\t ]+\/[^\s]*\b(?:health|readiness|liveness)\b/iu,
      /\b(?:get|head)[\t ]*\([\t ]*['"][^'"]*\b(?:health|readiness|liveness)\b[^'"]*['"]/iu,
    ],
    matches: structuredFieldMatcher(['probe', 'endpoint', 'healthCheck', 'health_check'], probeValue),
  },
  {
    id: 'expected-result',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:(?:\/\/|#|\*)[\t ]*)?(?:healthy result|expected result|success response)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b)[^\r\n]*(?:HTTP[\t ]+2\d\d|status(?: code)?[\t ]+(?:is[\t ]+)?2\d\d|\bok\b)[^\r\n]*$/imu,
      /(?:\.status[\t ]*\([\t ]*2\d\d[\t ]*\)|\bstatus[\t ]*:[\t ]*['"]ok['"])/iu,
    ],
    matches: structuredFieldMatcher(['healthyResult', 'healthy_result', 'expectedResult', 'expected_result', 'successResponse', 'success_response'], expectedResultValue),
  },
  {
    id: 'coverage-boundary',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:(?:\/\/|#|\*)[\t ]*)?(?:coverage|boundary|limitations?)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b)[^\r\n]*(?:does not|doesn't|only|but not|excluding|without)[^\r\n]*$/imu,
    ],
    matches: structuredFieldMatcher(['coverage', 'boundary', 'limitations', 'coverageBoundary', 'coverage_boundary'], coverageBoundaryValue),
  },
  {
    id: 'failure-surfacing',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:(?:\/\/|#|\*)[\t ]*)?(?:failure handling|failure surfacing|alerting|notification)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b)[^\r\n]*\b(?:alert\w*|notif(?:y|ies|ied|ication\w*)|pag(?:e|es|ed|ing)|surfac\w*|report\w*)\b[^\r\n]*$/imu,
    ],
    matches: structuredFieldMatcher(['failureHandling', 'failure_handling', 'failureSurfacing', 'failure_surfacing', 'alerting', 'notification'], failureSurfacingValue),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [
      /^[\t ]*(?:(?:\/\/|#|\*)[\t ]*)?(?:owner|responsible(?: role)?|maintainer)[\t ]*:[\t ]*(?!tbd\b|todo\b|unknown\b|n\/a\b)\S[^\r\n]*$/imu,
    ],
    matches: structuredFieldMatcher(['owner', 'responsibleRole', 'responsible_role', 'maintainer'], ownerValue),
  },
];

const evidenceExtensions = String.raw`(?:md|mdx|txt|json|ya?ml|toml)`;
const sourceExtensions = String.raw`(?:js|jsx|ts|tsx|py|rb|go|rs|java|kt|swift)`;
const healthName = String.raw`(?:health|readiness|liveness)`;

export const healthCheck = createOperationsCheck({
  id: 'launch-operations.health-check',
  label: 'Health check',
  domains: ['reliability-recovery', 'operations-observability'],
  actionLevel: 'resolve-before-launch',
  profile: () => ({
    candidatePaths: [
      new RegExp(String.raw`(?:^|/)(?:[^/]*[-_.])?${healthName}(?:[-_.][^/]*)?\.${evidenceExtensions}$`, 'iu'),
      new RegExp(String.raw`(?:^|/)(?:operations?|runbooks?)/[^/]+\.${evidenceExtensions}$`, 'iu'),
      new RegExp(String.raw`(?:^|/)[^/]*deploy(?:ment)?[^/]*\.(?:json|ya?ml|toml)$`, 'iu'),
      new RegExp(String.raw`(?:^|/)${healthName}/[^/]+\.${sourceExtensions}$`, 'iu'),
      new RegExp(String.raw`(?:^|/)(?:[^/]*[-_.])?${healthName}(?:[-_.][^/]*)?\.${sourceExtensions}$`, 'iu'),
    ],
    requirements: healthRequirements,
    riskPatterns: [],
  }),
  recommendation: 'Document the health probe, expected healthy result, coverage boundary, failure surfacing, and owner.',
  verification: 'Review the versioned health-check evidence with the owner and execute the endpoint or probe separately.',
  liveBoundary: 'No endpoint or probe was executed.',
});
