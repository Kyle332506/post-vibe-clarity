import { selectOperationsApplicability } from './applicability.js';
import { createOperationsCheck } from './create-check.js';
import type { EvidenceRequirement } from './types.js';

const rollbackRequirements: readonly EvidenceRequirement[] = [
  { id: 'trigger', patterns: [/\b(?:trigger|recovery condition|when (?:the )?(?:release|health|verification))\b/iu] },
  { id: 'decision-owner', patterns: [/\b(?:decision owner|authorized (?:owner|role)|owner)\s*:/iu] },
  { id: 'procedure', patterns: [/^\s*(?:\d+[.)]|[-*]\s+\[[ xX]\])\s+\S/mu] },
  { id: 'verification', patterns: [/\b(?:verification|verify|confirm)\b/iu] },
];

const serviceRecovery = /\b(?:restore|redeploy|previous(?:ly approved)? version|roll back|rollback)\b/iu;
const mobileDesktopRecovery = /\b(?:stop (?:the )?rollout|phased release|corrective release|supported version|disable (?:the )?feature)\b/iu;
const packageRecovery = /\b(?:deprecate|unpublish|previous version|corrective release|version withdrawal)\b/iu;

const rollbackRiskPatterns = [
  /^\s*(?:there\s+is\s+no\s+rollback\s+path|rollback\s+is\s+impossible|we\s+do\s+not\s+have\s+a\s+recovery\s+path)\s*[.!;,]*\s*$/imu,
];

function recoveryMechanismEvidence(pattern: RegExp): RegExp {
  return new RegExp(
    String.raw`(?:^[\t ]*(?:\d+[.)]|[-*])[\t ]+[^\r\n]*${pattern.source}|^[\t ]*(?:rollback|recovery)(?:[\t ]+mechanism)?[\t ]*:[\t ]*[^\r\n]*${pattern.source})`,
    'imu',
  );
}

function recoveryRequirementForProfile(profile: ReturnType<typeof selectOperationsApplicability>['profile']): EvidenceRequirement {
  if (profile === 'mobile-desktop') {
    return { id: 'recovery-mechanism', patterns: [recoveryMechanismEvidence(mobileDesktopRecovery)] };
  }
  if (profile === 'cli' || profile === 'library') {
    return { id: 'recovery-mechanism', patterns: [recoveryMechanismEvidence(packageRecovery)] };
  }
  if (profile === 'ambiguous') {
    return {
      id: 'recovery-mechanism',
      patterns: [serviceRecovery, mobileDesktopRecovery, packageRecovery].map(recoveryMechanismEvidence),
    };
  }
  return { id: 'recovery-mechanism', patterns: [recoveryMechanismEvidence(serviceRecovery)] };
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
