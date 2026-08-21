import { extname } from 'node:path';
import { createOperationsCheck } from './create-check.js';
import {
  descriptiveSourceEvidence,
  executableSourceEvidence,
  hasEvidenceSubstance,
  normalizeEvidenceValue,
  structuredFieldValueMatcher,
} from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

type ContentMatcher = (content: string, location: string) => boolean;
type ValuePredicate = (value: string) => boolean;

const plainTextExtensions = new Set(['.md', '.mdx', '.txt']);

const probeExecutablePatterns = [
  /^[\t ]*(?:@?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.)?(?:get|head|route|handlefunc|mapget)[\t ]*\([\t ]*['"`][^'"`\r\n]*\/(?:health|readiness|liveness)(?:\/[^'"`\r\n]*)?['"`]/imu,
  /^[\t ]*@(?:getmapping|requestmapping)[\t ]*\([\t ]*['"`][^'"`\r\n]*\/(?:health|readiness|liveness)(?:\/[^'"`\r\n]*)?['"`]/imu,
  /^[\t ]*(?:get|head)[\t ]+['"`][^'"`\r\n]*\/(?:health|readiness|liveness)(?:\/[^'"`\r\n]*)?['"`]/imu,
] as const;
const expectedResultExecutablePatterns = [
  /^[\t ]*(?:@?[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*\.)?(?:get|head|route|handlefunc|mapget)[\t ]*\([^\r\n]*\.status[\t ]*\([\t ]*2\d\d[\t ]*\)/imu,
  /^[\t ]*(?:(?:return[\t ]+)?(?:response|res|reply|ctx)\b[^\r\n]*\.status[\t ]*\([\t ]*2\d\d[\t ]*\)|return\b[^\r\n]*(?:['"]status['"][\t ]*:[\t ]*['"]ok['"]|,[\t ]*2\d\d\b)|[^\r\n]*\bwriteheader[\t ]*\([\t ]*(?:http\.)?statusok[\t ]*\))/imu,
  /^[\t ]*status[\t ]+2\d\d\b/imu,
] as const;

const probeValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['probe', 'endpoint', 'health check'],
    minimumWords: 2,
  })
    && /\b(?:get|head)\b[\t ]+\/\S*|\/(?:health|readiness|liveness)\b/iu.test(normalized);
};

const expectedResultValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['healthy result', 'expected result', 'success response'],
    minimumWords: 2,
  })
    && /\bhttp[\t ]+2\d\d\b|\bstatus(?: code)?[\t ]+(?:is[\t ]+)?2\d\d\b|\bstatus[\t ]+ok\b/iu.test(normalized);
};

const coverageBoundaryValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['coverage', 'boundary', 'limitation', 'limitations', 'coverage boundary'],
    minimumWords: 6,
    allowedIncompleteAssertions: [/\bdoes[\t ]+not[\t ]+verify\b/giu],
  })
    && /\b(?:does[\t ]+not[\t ]+verify|doesn't[\t ]+verify|excludes?|excluding|outside|without|limited[\t ]+to|only)\b/iu.test(normalized);
};

const failureSurfacingValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['failure handling', 'failure surfacing', 'alerting', 'notification'],
    minimumWords: 4,
  })
    && /\b(?:alerts?|notifies?|notifications?|pages?|reports?|routes?|sends?|surfaces?)\b/iu.test(normalized);
};

const ownerValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['owner', 'team', 'maintainer', 'support', 'responsible role'],
    minimumWords: 2,
  });
};

function testPattern(pattern: RegExp, value: string): boolean {
  return new RegExp(pattern.source, pattern.flags).test(value);
}

function matchesAny(...matchers: ContentMatcher[]): ContentMatcher {
  return (content, location) => matchers.some((matcher) => matcher(content, location));
}

function labeledValueMatcher(labels: string, predicate: ValuePredicate, source: boolean): ContentMatcher {
  return (content, location) => {
    const extension = extname(location).toLowerCase();
    const evidenceContent = source ? descriptiveSourceEvidence(content, location) : content;
    if (evidenceContent === undefined || (!source && !plainTextExtensions.has(extension))) {
      return false;
    }
    const prefix = source ? String.raw`(?:(?:\/\/|#|\*)[\t ]*)?` : '';
    const fieldPattern = new RegExp(String.raw`^[\t ]*${prefix}(?:${labels})[\t ]*:[\t ]*(.+)$`, 'gimu');
    return [...evidenceContent.matchAll(fieldPattern)].some((match) => predicate(match[1] ?? ''));
  };
}

function sourceDescriptionMatcher(labels: string, predicate: ValuePredicate): ContentMatcher {
  const labeledMatcher = labeledValueMatcher(labels, predicate, true);
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
      structuredFieldValueMatcher(['probe', 'endpoint', 'healthCheck', 'health_check'], probeValue),
    ),
  },
  {
    id: 'expected-result',
    textOnlyPatterns: true,
    patterns: expectedResultExecutablePatterns,
    matches: matchesAny(
      labeledValueMatcher('healthy result|expected result|success response', expectedResultValue, false),
      structuredFieldValueMatcher(['healthyResult', 'healthy_result', 'expectedResult', 'expected_result', 'successResponse', 'success_response'], expectedResultValue),
    ),
  },
  {
    id: 'coverage-boundary',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('coverage|boundary|limitations?', coverageBoundaryValue, false),
      structuredFieldValueMatcher(['coverage', 'boundary', 'limitations', 'coverageBoundary', 'coverage_boundary'], coverageBoundaryValue),
      sourceDescriptionMatcher('coverage|boundary|limitations?', coverageBoundaryValue),
    ),
  },
  {
    id: 'failure-surfacing',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('failure handling|failure surfacing|alerting|notification', failureSurfacingValue, false),
      structuredFieldValueMatcher(['failureHandling', 'failure_handling', 'failureSurfacing', 'failure_surfacing', 'alerting', 'notification'], failureSurfacingValue),
      sourceDescriptionMatcher('failure handling|failure surfacing|alerting|notification', failureSurfacingValue),
    ),
  },
  {
    id: 'owner',
    textOnlyPatterns: true,
    patterns: [],
    matches: matchesAny(
      labeledValueMatcher('owner|responsible(?: role)?|maintainer', ownerValue, false),
      structuredFieldValueMatcher(['owner', 'responsibleRole', 'responsible_role', 'maintainer'], ownerValue),
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
