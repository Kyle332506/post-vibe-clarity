import { describe, expect, it } from 'vitest';
import { renderJson } from '../../src/report/render-json.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';
import type { ReadinessReport } from '../../src/model/report.js';

const fakeCredential = 'pvc_fixture_credential_not_for_output';
const disclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';

const report: ReadinessReport = {
  schemaVersion: '0.1',
  runId: 'pvc-20260817',
  generatedAt: '2026-08-17T12:00:00.000Z',
  toolkitVersion: '0.1.0',
  partial: true,
  manifest: {
    schemaVersion: '0.1',
    projectRoot: '/project',
    generatedAt: '2026-08-17T12:00:00.000Z',
    artifacts: [{ value: 'web', confidence: 'confirmed', evidence: [{ kind: 'file', summary: 'Web manifest found', location: 'package.json' }] }],
    frameworks: [],
    services: [],
    capabilities: [],
  },
  findings: [
    {
      id: 'secret-exposure.fixture-secret',
      checkId: 'secret-exposure.scan',
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
  ],
  summary: {
    byActionLevel: {
      'stop-before-launch': 1,
      'resolve-before-launch': 0,
      'plan-soon': 0,
      'improve-when-appropriate': 0,
      'human-review-needed': 1,
    },
    byOutcome: {
      passed: 0,
      failed: 1,
      'likely-issue': 0,
      unverified: 1,
      'not-applicable': 0,
      'risk-accepted': 0,
      'resolved-and-rechecked': 0,
    },
  },
  disclaimer,
};

describe('report renderers', () => {
  it('renders stable JSON data without readiness claims or credentials', () => {
    const json = renderJson(report);
    const containsFakeCredential = json.includes(fakeCredential);
    const containsReadinessScore = json.toLowerCase().includes('readiness score');
    const containsCertificationClaim = json.toLowerCase().includes('certified production ready');

    expect(JSON.parse(json)).toMatchObject({ schemaVersion: '0.1', partial: true });
    expect(json).toBe(`${JSON.stringify(report, null, 2)}\n`);
    expect(containsFakeCredential).toBe(false);
    expect(containsReadinessScore).toBe(false);
    expect(containsCertificationClaim).toBe(false);
  });

  it('renders evidence-backed Markdown with counts, scope, and unverified boundaries', () => {
    const markdown = renderMarkdown(report);
    const containsFakeCredential = markdown.includes(fakeCredential);
    const containsReadinessScore = markdown.toLowerCase().includes('readiness score');
    const containsCertificationClaim = markdown.toLowerCase().includes('certified production ready');
    const endsWithDisclaimer = markdown.endsWith(`${disclaimer}\n`);

    expect(markdown).toContain('# PostVibeClarity launch review');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('Stop before launch: 1');
    expect(markdown).toContain('Unverified: 1');
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('### Stop before launch');
    expect(markdown).toContain('src/config.ts:2');
    expect(markdown).toContain('## Unverified areas');
    expect(markdown).toContain('Legal accuracy requires human review.');
    expect(markdown).toContain('## Scope');
    expect(markdown).toContain('/project');
    expect(markdown).toContain('## Important limitation');
    expect(endsWithDisclaimer).toBe(true);
    expect(containsFakeCredential).toBe(false);
    expect(containsReadinessScore).toBe(false);
    expect(containsCertificationClaim).toBe(false);
  });
});
