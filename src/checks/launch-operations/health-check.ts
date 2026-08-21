import { extname } from 'node:path';
import { createOperationsCheck } from './create-check.js';
import { executableSourceEvidence, structuredFieldMatcher } from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

type ContentMatcher = (content: string, location: string) => boolean;

const plainTextExtensions = new Set(['.md', '.mdx', '.txt']);
const probeValue = /^(?!.*\b(?:none|unknown|n\/a|tbd|todo|disabled|missing|unavailable)\b).*?(?:\b(?:GET|HEAD)\b[\t ]+\/\S*|\/\b(?:health|readiness|liveness)\b).*$/iu;
const expectedResultValue = /^(?!.*\b(?:not|no|none|unknown|n\/a|tbd|todo|disabled|missing|unavailable)\b).*?(?:HTTP[\t ]+2\d\d|status(?: code)?[\t ]+(?:is[\t ]+)?2\d\d|\bok\b).*$/iu;
const coverageBoundaryValue = /^(?=.{20,}$)(?=.*\b(?:process|availability|dependencies?|services?|components?|connectivity|database|downstream|upstream)\b)(?=.*\b(?:does not|doesn't|but not|excludes?|excluding|without|only)\b).+$/iu;
const failureSurfacingValue = /^(?!.*\b(?:not|no|none|unknown|n\/a|tbd|todo|disabled|never|missing|unavailable)\b)(?=.*\b(?:alert\w*|notif(?:y|ies|ied|ication\w*)|pag(?:e|es|ed|ing)|surfac\w*|report\w*)\b)(?=.*\b(?:maintainers?|owners?|on-call|teams?|services?|pager|email|slack|operators?|responders?|support|sre)\b).+$/iu;
const ownerValue = /^(?!.*\b(?:none|unknown|n\/a|tbd|todo|disabled|missing|unavailable)\b)(?=.*\b(?:maintainer|owner|on-call|team|lead|engineer|operator|responder|support|sre)\b).+$/iu;

const probeExecutablePatterns = [
  /\b(?:get|head)[\t ]*\([\t ]*['"][^'"]*\b(?:health|readiness|liveness)\b[^'"]*['"]/iu,
] as const;
const expectedResultExecutablePatterns = [
  /(?:\.status[\t ]*\([\t ]*2\d\d[\t ]*\)|\bstatus[\t ]*:[\t ]*['"]ok['"])/iu,
] as const;

function testPattern(pattern: RegExp, value: string): boolean {
  return new RegExp(pattern.source, pattern.flags).test(value);
}

function matchesAny(...matchers: ContentMatcher[]): ContentMatcher {
  return (content, location) => matchers.some((matcher) => matcher(content, location));
}

function labeledValueMatcher(labels: string, valuePattern: RegExp, source: boolean): ContentMatcher {
  return (content, location) => {
    const extension = extname(location).toLowerCase();
    if (source ? executableSourceEvidence(content, location) === undefined : !plainTextExtensions.has(extension)) {
      return false;
    }
    const prefix = source ? String.raw`(?:(?:\/\/|#|\*)[\t ]*)?` : '';
    const fieldPattern = new RegExp(String.raw`^[\t ]*${prefix}(?:${labels})[\t ]*:[\t ]*(.+)$`, 'gimu');
    return [...content.matchAll(fieldPattern)].some((match) => testPattern(valuePattern, match[1] ?? ''));
  };
}

function sourceDescriptionMatcher(labels: string, valuePattern: RegExp): ContentMatcher {
  const labeledMatcher = labeledValueMatcher(labels, valuePattern, true);
  return (content, location) => {
    const executable = executableSourceEvidence(content, location);
    if (executable === undefined) return false;
    const hasProbe = probeExecutablePatterns.some((pattern) => testPattern(pattern, executable));
    const hasExpectedResult = expectedResultExecutablePatterns.some((pattern) => testPattern(pattern, executable));
    return hasProbe && hasExpectedResult && labeledMatcher(content, location);
  };
}

const healthRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'probe',
    textOnlyPatterns: true,
    patterns: probeExecutablePatterns,
    matches: matchesAny(
      labeledValueMatcher('probe|endpoint|health check', probeValue, false),
      structuredFieldMatcher(['probe', 'endpoint', 'healthCheck', 'health_check'], probeValue),
    ),
  },
  {
    id: 'expected-result',
    textOnlyPatterns: true,
    patterns: expectedResultExecutablePatterns,
    matches: matchesAny(
      labeledValueMatcher('healthy result|expected result|success response', expectedResultValue, false),
      structuredFieldMatcher(['healthyResult', 'healthy_result', 'expectedResult', 'expected_result', 'successResponse', 'success_response'], expectedResultValue),
    ),
  },
  {
    id: 'coverage-boundary',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('coverage|boundary|limitations?', coverageBoundaryValue, false),
      structuredFieldMatcher(['coverage', 'boundary', 'limitations', 'coverageBoundary', 'coverage_boundary'], coverageBoundaryValue),
      sourceDescriptionMatcher('coverage|boundary|limitations?', coverageBoundaryValue),
    ),
  },
  {
    id: 'failure-surfacing',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('failure handling|failure surfacing|alerting|notification', failureSurfacingValue, false),
      structuredFieldMatcher(['failureHandling', 'failure_handling', 'failureSurfacing', 'failure_surfacing', 'alerting', 'notification'], failureSurfacingValue),
      sourceDescriptionMatcher('failure handling|failure surfacing|alerting|notification', failureSurfacingValue),
    ),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('owner|responsible(?: role)?|maintainer', ownerValue, false),
      structuredFieldMatcher(['owner', 'responsibleRole', 'responsible_role', 'maintainer'], ownerValue),
      sourceDescriptionMatcher('owner|responsible(?: role)?|maintainer', ownerValue),
    ),
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
