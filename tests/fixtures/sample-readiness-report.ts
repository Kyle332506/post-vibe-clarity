import {
  derivePartial,
  summarizeReport,
  type CheckExecution,
  type CoverageGap,
  type ReadinessReport,
} from '../../src/model/report.js';

export const sampleControlledCredential = 'pvc_fixture_credential_not_for_output';

const findings: ReadinessReport['findings'] = [
  {
    id: 'secret-exposure.fixture-secret',
    checkId: 'secret-exposure.scan',
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['security-privacy'],
    actionLevel: 'stop-before-launch',
    outcome: 'failed',
    title: 'Potential credential in source',
    impact: 'A credential committed to source may be copied or abused.',
    evidence: [{ kind: 'file', summary: 'Private key marker detected', location: 'src/config.ts:2' }],
    evidenceConfidence: 'confirmed',
    applicability: 'The project contains source files.',
    recommendation: 'Remove and rotate the credential outside this review.',
    verification: 'Scan the repository again after removal.',
    humanReviewRequired: false,
  },
  {
    id: 'launch-essentials.privacy-unverified',
    checkId: 'launch-essentials.privacy-notice',
    checkVersion: '0.1.0',
    skillVersion: '0.1.0',
    domains: ['policy-business-essentials'],
    actionLevel: 'human-review-needed',
    outcome: 'unverified',
    title: 'Privacy notice could not be verified',
    impact: 'Users may not understand how their information is handled.',
    evidence: [],
    evidenceConfidence: 'insufficient',
    applicability: 'Personal-data collection was detected.',
    recommendation: 'Review the data inventory and applicable requirements.',
    verification: 'Provide reviewed policy text and confirm it is linked.',
    humanReviewRequired: true,
    unverifiedBoundaries: ['Legal accuracy requires human review.'],
  },
];

const checkExecutions: CheckExecution[] = [
  {
    checkId: 'launch-essentials.privacy-notice',
    checkVersion: '0.1.0',
    skillId: 'launch-essentials',
    skillVersion: '0.1.0',
    domains: ['policy-business-essentials'],
    status: 'unverified',
    findingIds: ['launch-essentials.privacy-unverified'],
  },
  {
    checkId: 'secret-exposure.scan',
    checkVersion: '0.1.0',
    skillId: 'secret-exposure',
    skillVersion: '0.1.0',
    domains: ['security-privacy'],
    status: 'completed',
    findingIds: ['secret-exposure.fixture-secret'],
  },
];

const coverageGaps: CoverageGap[] = [
  {
    id: 'check.launch-essentials.privacy-notice',
    checkId: 'launch-essentials.privacy-notice',
    skillId: 'launch-essentials',
    status: 'unverified',
    domains: ['policy-business-essentials'],
    reason: 'Legal accuracy requires human review.',
  },
  ...[
    'data-correctness',
    'maintainability-change-safety',
    'operations-observability',
    'performance-cost',
    'product-ux',
    'release-delivery',
    'reliability-recovery',
  ].map((domain) => ({
    id: `domain.${domain}`,
    status: 'unverified' as const,
    domains: [domain] as CoverageGap['domains'],
    reason: 'No routed check covers this domain in the current review.',
  })),
];

export const sampleReadinessReport: ReadinessReport = {
  schemaVersion: '0.1',
  runId: 'pvc-20260817',
  generatedAt: '2026-08-17T12:00:00.000Z',
  toolkitVersion: '0.1.0',
  manifest: {
    schemaVersion: '0.1',
    projectRoot: '/example/project',
    generatedAt: '2026-08-17T12:00:00.000Z',
    artifacts: [{
      value: 'web',
      confidence: 'confirmed',
      evidence: [{ kind: 'file', summary: 'Web manifest found', location: 'package.json' }],
    }],
    frameworks: [],
    services: [],
    capabilities: [{
      value: 'collects-personal-data',
      confidence: 'likely',
      evidence: [{ kind: 'file', summary: 'Account-related source references an email field', location: 'src/register.ts' }],
    }],
  },
  checkExecutions,
  coverageGaps,
  findings,
  summary: summarizeReport(findings, checkExecutions, coverageGaps),
  partial: derivePartial(checkExecutions, coverageGaps),
  disclaimer: 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.',
};
