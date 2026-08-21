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

const artifactTerms = /\b(?:artifact|application|service|package|binary|mobile app|desktop app|container image|bundle|deliverable)\b/iu;
const targetTerms = /\b(?:production|staging|registry|app store|play store|distribution channel|deployment target|environment)\b/iu;
const prerequisiteTerms = /\b(?:obtain|confirm|ensure|require\w*|use|select|access|approved|revision|credential|permission|sign-off|environment)\b/iu;
const procedureTerms = /\b(?:build|publish|deploy|release|upload|distribute|submit|promote)\b/iu;
const verificationTerms = /\b(?:verify|verification|smoke test|confirm|check|expected|version|response|result|health|release|deployment)\b/iu;

const artifactValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['artifact', 'release artifact', 'deliverable'],
    minimumWords: 2,
  }) && !hasNegatedEvidenceIntent(normalized, artifactTerms)
    && artifactTerms.test(normalized);
};

const orderedArtifactValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, { fieldLabels: [], minimumWords: 3 })
    && !hasNegatedEvidenceIntent(normalized, artifactTerms)
    && /\b(?:build|package|publish|deploy|release|upload|distribute|submit)\b/iu.test(normalized)
    && artifactTerms.test(normalized);
};

const targetValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['target', 'release target', 'deployment target', 'distribution channel'],
    minimumWords: 2,
  }) && !hasNegatedEvidenceIntent(normalized, targetTerms)
    && targetTerms.test(normalized);
};

const prerequisiteValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['prerequisite', 'prerequisites'],
    minimumWords: 5,
  })
    && !hasNegatedEvidenceIntent(normalized, prerequisiteTerms)
    && /\b(?:obtain|confirm|ensure|require\w*|use|select)\b/iu.test(normalized)
    && /\b(?:access|approved|revision|credential|permission|sign-off|environment)\b/iu.test(normalized);
};

const procedureValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['procedure', 'release procedure', 'deployment procedure', 'steps'],
    minimumWords: 3,
  }) && !hasNegatedEvidenceIntent(normalized, procedureTerms)
    && procedureTerms.test(normalized);
};

const verificationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['post-release verification', 'post-deployment verification'],
    minimumWords: 5,
  })
    && !hasNegatedEvidenceIntent(normalized, verificationTerms)
    && /\b(?:verify|verification|smoke test|confirm|check)\b/iu.test(normalized)
    && /\b(?:expected|version|response|result|health|release|deployment)\b/iu.test(normalized);
};

const ownerValue: ValuePredicate = (value) => hasConcreteOwnerEvidence(value, ['release team']);

const releaseRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'artifact',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['artifact', 'release artifact', 'deliverable'], artifactValue),
      orderedTextValueMatcher(orderedArtifactValue),
      proseLineValueMatcher(artifactValue),
      structuredFieldValueMatcher(['artifact', 'releaseArtifact', 'release_artifact', 'deliverable'], artifactValue),
    ),
  },
  {
    id: 'target',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['target', 'release target', 'deployment target', 'distribution channel'], targetValue),
      proseLineValueMatcher(targetValue),
      structuredFieldValueMatcher(['target', 'releaseTarget', 'release_target', 'deploymentTarget', 'deployment_target', 'distributionChannel', 'distribution_channel'], targetValue),
    ),
  },
  {
    id: 'prerequisites',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['prerequisite', 'prerequisites', 'required access', 'before release', 'before deployment'], prerequisiteValue),
      proseLineValueMatcher(prerequisiteValue),
      structuredFieldValueMatcher(['prerequisite', 'prerequisites', 'requiredAccess', 'required_access'], prerequisiteValue),
    ),
  },
  {
    id: 'procedure',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      orderedTextValueMatcher(procedureValue),
      labeledTextValueMatcher(['procedure', 'release procedure', 'deployment procedure', 'steps'], procedureValue),
      proseLineValueMatcher(procedureValue),
      structuredFieldValueMatcher(['procedure', 'releaseProcedure', 'release_procedure', 'deploymentProcedure', 'deployment_procedure', 'steps'], procedureValue),
    ),
  },
  {
    id: 'verification',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['verification', 'post-release verification', 'post-deployment verification'], verificationValue),
      proseLineValueMatcher(verificationValue),
      structuredFieldValueMatcher(['verification', 'postReleaseVerification', 'post_release_verification', 'postDeploymentVerification', 'post_deployment_verification'], verificationValue),
    ),
  },
  {
    id: 'owner',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['owner', 'responsible', 'responsible role', 'maintainer', 'release team'], ownerValue),
      proseLineValueMatcher((value) => /\b(?:owns?|responsible|maintainer)\b/iu.test(value) && ownerValue(value)),
      structuredFieldValueMatcher(['owner', 'responsible', 'responsibleRole', 'responsible_role', 'maintainer', 'releaseTeam', 'release_team'], ownerValue),
    ),
  },
];

export const releaseProcessCheck = createOperationsCheck({
  id: 'launch-operations.release-process',
  label: 'Release and deployment',
  domains: ['release-delivery'],
  actionLevel: 'resolve-before-launch',
  profile: () => ({
    candidatePaths: [
      /(?:^|\/)[^/]*(?:deploy(?:ment)?|release|publish(?:ing)?|distribution|operations|runbooks?)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
      /(?:^|\/)\.github\/workflows\/[^/]+\.ya?ml$/iu,
    ],
    requirements: releaseRequirements,
    riskPatterns: [],
  }),
  recommendation: 'Document the release, deployment, publishing, or distribution procedure, including prerequisites, verification, and ownership.',
  verification: 'Review the versioned procedure with the responsible maintainer and confirm the live target separately.',
  liveBoundary: 'No deployment, registry, or store was queried.',
});
