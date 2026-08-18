import type { Finding } from '../model/finding.js';
import { listProjectFiles } from '../discovery/file-index.js';
import type { CheckImplementation } from '../orchestrator/check-registry.js';

const checkId = 'launch-essentials.privacy-notice';

function notApplicableFinding(): Finding {
  return {
    id: 'launch-essentials.privacy-notice-not-applicable',
    checkId,
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['policy-business-essentials', 'security-privacy'],
    actionLevel: 'improve-when-appropriate',
    outcome: 'not-applicable',
    title: 'Privacy-notice review not triggered',
    impact: 'No account-related personal-data collection capability was detected for this project.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    applicability: 'This review is triggered only when account-related personal-data collection is detected.',
    recommendation: 'Re-run this review if the project adds account-related personal-data collection.',
    verification: 'Confirm any future collection capability is reflected in the project manifest.',
    humanReviewRequired: false,
  };
}

function policyCandidateFinding(policyFiles: string[]): Finding {
  return {
    id: 'launch-essentials.privacy-notice-candidate-found',
    checkId,
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['policy-business-essentials', 'security-privacy'],
    actionLevel: 'human-review-needed',
    outcome: 'passed',
    title: 'Privacy notice candidate found',
    impact: 'A file or route with a privacy-related name was found; legal accuracy was not verified.',
    evidence: policyFiles.map((location) => ({
      kind: 'file',
      location,
      summary: 'Privacy notice candidate found by file path.',
    })),
    evidenceConfidence: 'confirmed',
    applicability: 'Account-related personal-data collection was detected, and a privacy notice candidate was found; legal accuracy was not verified.',
    recommendation: 'Review the policy candidate against a factual data inventory before publishing or relying on it.',
    verification: 'Confirm reviewed policy text is published and linked wherever personal data is collected.',
    humanReviewRequired: true,
  };
}

function missingPolicyFinding(evidence: Finding['evidence']): Finding {
  return {
    id: 'launch-essentials.privacy-notice-missing',
    checkId,
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['policy-business-essentials', 'security-privacy'],
    actionLevel: 'human-review-needed',
    outcome: 'likely-issue',
    title: 'Privacy notice not found',
    impact: 'People may not be told what information is collected or how it is used.',
    evidence,
    evidenceConfidence: 'strong-indication',
    applicability: 'Account-related personal-data collection was detected, and no privacy policy file or route was found.',
    recommendation: 'Create a factual data inventory and obtain appropriate review before publishing a privacy notice.',
    verification: 'Confirm reviewed policy text is published and linked wherever personal data is collected.',
    humanReviewRequired: true,
  };
}

export const privacyNoticeCheck: CheckImplementation = {
  id: checkId,
  version: '0.1.0',
  actionLevel: 0,
  requiredAccess: ['filesystem-read'],
  async run({ root, manifest }) {
    const collectionCapability = manifest.capabilities.find((capability) => capability.value === 'collects-personal-data');
    if (!collectionCapability) return [notApplicableFinding()];

    const policyFiles = (await listProjectFiles(root)).filter((file) => file.toLowerCase().includes('privacy'));
    if (policyFiles.length > 0) return [policyCandidateFinding(policyFiles)];

    return [missingPolicyFinding(collectionCapability.evidence)];
  },
};
