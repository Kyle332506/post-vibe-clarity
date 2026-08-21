import { createOperationsCheck } from './create-check.js';
import {
  hasConcreteOwnerEvidence,
  hasEvidenceSubstance,
  hasNegatedEvidenceIntent,
  labeledTextValueMatcher,
  matchesAnyEvidence,
  normalizeEvidenceValue,
  proseLineValueMatcher,
  structuredFieldValueMatcher,
} from './document-evidence.js';
import type { EvidenceRequirement } from './types.js';

type ValuePredicate = (value: string) => boolean;

const supportRouteTerms = /\b(?:issues?|issue tracker|support portal|help desk|ticket|discussions?|contact|email)\b/iu;
const reviewTerms = /\b(?:dependency|dependencies|platform|operational|maintenance|runtime|review\w*|weekly|monthly|quarterly|annually|yearly)\b/iu;
const handoffTerms = /\b(?:update|transfer|reassign|document|replace|owner|ownership|maintainer|team|responsible|codeowners|change|transition)\b/iu;

const ownerValue: ValuePredicate = (value) => hasConcreteOwnerEvidence(value);

const supportRouteValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['support route', 'support', 'issue reporting', 'report an issue'],
    minimumWords: 2,
  }) && !hasNegatedEvidenceIntent(normalized, supportRouteTerms)
    && supportRouteTerms.test(normalized);
};

const reviewExpectationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['review cadence', 'review expectation', 'maintenance review'],
    minimumWords: 5,
  })
    && !hasNegatedEvidenceIntent(normalized, reviewTerms)
    && /\b(?:dependency|dependencies|platform|operational|maintenance|runtime)\b/iu.test(normalized)
    && /\b(?:review\w*|weekly|monthly|quarterly|annually|yearly|every (?:week|month|quarter|year))\b/iu.test(normalized);
};

const handoffValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['handoff', 'continuity', 'transition'],
    minimumWords: 6,
  })
    && !hasNegatedEvidenceIntent(normalized, handoffTerms)
    && /\b(?:update|transfer|reassign|document|replace)\b/iu.test(normalized)
    && /\b(?:owner|ownership|maintainer|team|responsible|codeowners|change|transition)\b/iu.test(normalized);
};

const maintenanceOwnershipRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'owner',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['owner', 'responsible', 'responsible role', 'maintainer', 'team'], ownerValue),
      proseLineValueMatcher((value) => /\b(?:owns?|maintainers?[\t ]+(?:own|are[\t ]+responsible)|responsible[\t ]+(?:person|role|team)[\t ]+(?:is|owns))\b/iu.test(value) && ownerValue(value)),
      structuredFieldValueMatcher(['owner', 'responsible', 'responsibleRole', 'responsible_role', 'maintainer', 'team'], ownerValue),
    ),
  },
  {
    id: 'support-route',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['support route', 'support', 'issue reporting', 'report an issue'], supportRouteValue),
      proseLineValueMatcher(supportRouteValue),
      structuredFieldValueMatcher(['supportRoute', 'support_route', 'support', 'issueReporting', 'issue_reporting'], supportRouteValue),
    ),
  },
  {
    id: 'review-expectation',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['review cadence', 'review expectation', 'maintenance review'], reviewExpectationValue),
      proseLineValueMatcher(reviewExpectationValue),
      structuredFieldValueMatcher(['reviewCadence', 'review_cadence', 'reviewExpectation', 'review_expectation', 'maintenanceReview', 'maintenance_review'], reviewExpectationValue),
    ),
  },
  {
    id: 'handoff',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['handoff', 'continuity', 'transition'], handoffValue),
      proseLineValueMatcher(handoffValue),
      structuredFieldValueMatcher(['handoff', 'continuity', 'transition'], handoffValue),
    ),
  },
];

const extensionlessOwnershipCandidatePaths = [
  /(?:^|\/)(?:CODEOWNERS|MAINTAINERS[^/]*|SUPPORT[^/]*)$/iu,
];

export const maintenanceOwnershipCheck = createOperationsCheck({
  id: 'launch-operations.maintenance-ownership',
  label: 'Maintenance ownership',
  domains: ['maintainability-change-safety'],
  actionLevel: 'plan-soon',
  profile: () => ({
    candidatePaths: [
      ...extensionlessOwnershipCandidatePaths,
      /(?:^|\/)[^/]*(?:operations?|ownership|maintainers?|support)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
    ],
    extensionlessCandidatePaths: extensionlessOwnershipCandidatePaths,
    requirements: maintenanceOwnershipRequirements,
    riskPatterns: [],
  }),
  recommendation: 'Document maintenance ownership, the support route, review expectations, and handoff responsibilities.',
  verification: 'Review the documented ownership, support, review, and handoff expectations with the maintainers.',
  liveBoundary: 'No live support route or maintenance process was queried.',
});
