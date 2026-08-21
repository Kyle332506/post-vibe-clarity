import { selectOperationsApplicability } from './applicability.js';
import { createOperationsCheck } from './create-check.js';
import {
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

const triggerTerms = /\b(?:recovery|rollback|roll back|release|health|verification|fail\w*|degrad\w*|unhealthy|incident|error)\b/iu;
const decisionOwnerTerms = /\b(?:assign\w*|decision|authorized|owner|role|lead|maintainer|team)\b/iu;
const procedureTerms = /\b(?:stop\w*|restor\w*|redeploy\w*|deprecat\w*|unpublish\w*|publish\w*|disabl\w*|rout\w*|revert\w*|roll back|rollback|withdraw\w*)\b/iu;
const verificationTerms = /\b(?:verify|verification|confirm|repeat|check|expected|version|health|result|replacement|available|recovery|release)\b/iu;

const triggerValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['trigger', 'recovery condition', 'rollback condition'],
    minimumWords: 5,
  })
    && !hasNegatedEvidenceIntent(normalized, triggerTerms)
    && /\b(?:when|if|after|upon|starts?)\b/iu.test(normalized)
    && /\b(?:fail\w*|degrad\w*|unhealthy|incident|error|verification|health)\b/iu.test(normalized);
};

const decisionOwnerValue: ValuePredicate = (value) => !hasNegatedEvidenceIntent(value, decisionOwnerTerms)
  && hasEvidenceSubstance(value, {
    fieldLabels: ['decision owner', 'authorized owner', 'authorized role', 'owner'],
    minimumWords: 2,
  });

const procedureValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['procedure', 'recovery procedure', 'rollback procedure', 'steps'],
    minimumWords: 4,
  }) && !hasNegatedEvidenceIntent(normalized, procedureTerms)
    && procedureTerms.test(normalized);
};

const verificationValue: ValuePredicate = (value) => {
  const normalized = normalizeEvidenceValue(value);
  return hasEvidenceSubstance(normalized, {
    fieldLabels: ['recovery verification', 'rollback verification'],
    minimumWords: 5,
  })
    && !hasNegatedEvidenceIntent(normalized, verificationTerms)
    && /\b(?:verify|verification|confirm|repeat|check)\b/iu.test(normalized)
    && /\b(?:expected|version|health|result|replacement|available|recovery|release)\b/iu.test(normalized);
};

const rollbackRequirements: readonly EvidenceRequirement[] = [
  {
    id: 'trigger',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['trigger', 'recovery condition', 'rollback condition'], triggerValue),
      proseLineValueMatcher(triggerValue),
      structuredFieldValueMatcher(['trigger', 'recoveryCondition', 'recovery_condition', 'rollbackCondition', 'rollback_condition'], triggerValue),
    ),
  },
  {
    id: 'decision-owner',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['decision owner', 'authorized owner', 'authorized role', 'owner'], decisionOwnerValue),
      proseLineValueMatcher((value) => /\b(?:authorized|decision|decides?)\b/iu.test(value) && decisionOwnerValue(value)),
      structuredFieldValueMatcher(['decisionOwner', 'decision_owner', 'authorizedOwner', 'authorized_owner', 'authorizedRole', 'authorized_role', 'owner'], decisionOwnerValue),
    ),
  },
  {
    id: 'procedure',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      orderedTextValueMatcher(procedureValue),
      labeledTextValueMatcher(['procedure', 'recovery procedure', 'rollback procedure', 'steps'], procedureValue),
      proseLineValueMatcher(procedureValue),
      structuredFieldValueMatcher(['procedure', 'recoveryProcedure', 'recovery_procedure', 'rollbackProcedure', 'rollback_procedure', 'steps'], procedureValue),
    ),
  },
  {
    id: 'verification',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      labeledTextValueMatcher(['verification', 'recovery verification', 'rollback verification'], verificationValue),
      proseLineValueMatcher(verificationValue),
      structuredFieldValueMatcher(['verification', 'recoveryVerification', 'recovery_verification', 'rollbackVerification', 'rollback_verification'], verificationValue),
    ),
  },
];

const serviceRecovery = /\b(?:restore|redeploy|previous(?:ly approved)? version|roll back|rollback)\b/iu;
const mobileDesktopRecovery = /\b(?:stop (?:the )?rollout|phased release|corrective release|supported version|disable (?:the )?feature)\b/iu;
const packageRecovery = /\b(?:deprecate|unpublish|previous version|corrective release|version withdrawal)\b/iu;

const rollbackRiskPatterns = [
  /^\s*(?:there\s+is\s+no\s+rollback\s+path|rollback\s+is\s+impossible|we\s+do\s+not\s+have\s+a\s+recovery\s+path)\s*[.!;,]*\s*$/imu,
];

function recoveryMechanismValue(pattern: RegExp): ValuePredicate {
  return (value) => {
    const normalized = normalizeEvidenceValue(value);
    return hasEvidenceSubstance(normalized, {
      fieldLabels: ['recovery', 'rollback', 'recovery mechanism', 'rollback mechanism'],
      minimumWords: 3,
    })
      && !hasNegatedEvidenceIntent(normalized, pattern)
      && new RegExp(pattern.source, pattern.flags).test(normalized);
  };
}

function recoveryRequirementForProfile(profile: ReturnType<typeof selectOperationsApplicability>['profile']): EvidenceRequirement {
  const patterns = profile === 'mobile-desktop'
    ? [mobileDesktopRecovery]
    : profile === 'cli' || profile === 'library'
      ? [packageRecovery]
      : profile === 'ambiguous'
        ? [serviceRecovery, mobileDesktopRecovery, packageRecovery]
        : [serviceRecovery];
  const predicates = patterns.map(recoveryMechanismValue);
  const mechanismValue = (value: string): boolean => predicates.some((predicate) => predicate(value));
  return {
    id: 'recovery-mechanism',
    patterns: [],
    textOnlyPatterns: true,
    matches: matchesAnyEvidence(
      orderedTextValueMatcher(mechanismValue),
      labeledTextValueMatcher(['recovery', 'rollback', 'recovery mechanism', 'rollback mechanism'], mechanismValue),
      proseLineValueMatcher(mechanismValue),
      structuredFieldValueMatcher(['recoveryMechanism', 'recovery_mechanism', 'rollbackMechanism', 'rollback_mechanism'], mechanismValue),
      structuredFieldValueMatcher(['procedure', 'steps'], mechanismValue),
    ),
  };
}

export const rollbackProcessCheck = createOperationsCheck({
  id: 'launch-operations.rollback-process',
  label: 'Rollback and recovery',
  domains: ['reliability-recovery', 'release-delivery'],
  actionLevel: 'resolve-before-launch',
  profile: (manifest) => ({
    candidatePaths: [
      /(?:^|\/)[^/]*(?:rollback|recovery|operations?|runbooks?)[^/]*\.(?:md|mdx|txt|json|ya?ml|toml)$/iu,
    ],
    requirements: [
      ...rollbackRequirements,
      recoveryRequirementForProfile(selectOperationsApplicability('launch-operations.rollback-process', manifest).profile),
    ],
    riskPatterns: rollbackRiskPatterns,
  }),
  recommendation: 'Document the recovery trigger, shape-appropriate rollback mechanism, decision owner, ordered steps, and verification.',
  verification: 'Review the documented recovery procedure with the authorized owner and verify the live recovery path separately.',
  liveBoundary: 'No release was changed and no recovery procedure was run.',
  risk: {
    title: 'No rollback or recovery path is documented',
    impact: 'A release problem may not have a documented way to limit impact or recover.',
    actionLevel: 'stop-before-launch',
  },
});
