import { describe, expect, it } from 'vitest';
import {
  derivePartial,
  summarizeFindings,
  summarizeReport,
  type CheckExecution,
  type CoverageGap,
} from '../../src/model/report.js';
import type { Finding } from '../../src/model/finding.js';

const findings: Finding[] = [
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
  },
];

describe('summarizeFindings', () => {
  it('keeps failed and unverified outcomes separate', () => {
    expect(summarizeFindings(findings)).toEqual({
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
    });
  });

  it('does not expose a readiness score', () => {
    expect(summarizeFindings(findings)).not.toHaveProperty('score');
  });

  it('summarizes check completion and domain coverage independently from finding outcomes', () => {
    const checks: CheckExecution[] = [
      {
        checkId: 'secret-exposure.scan',
        checkVersion: '0.1.0',
        skillId: 'secret-exposure',
        skillVersion: '0.1.0',
        domains: ['security-privacy'],
        status: 'completed',
        findingIds: ['secret-exposure.fixture-secret'],
      },
      {
        checkId: 'reliability.fixture',
        checkVersion: '0.1.0',
        skillId: 'reliability-fixture',
        skillVersion: '0.1.0',
        domains: ['reliability-recovery'],
        status: 'failed',
        findingIds: ['reliability.fixture.execution-failed'],
      },
    ];
    const coverageGaps: CoverageGap[] = [
      {
        id: 'check.reliability.fixture',
        status: 'failed',
        domains: ['reliability-recovery'],
        checkId: 'reliability.fixture',
        skillId: 'reliability-fixture',
        reason: 'The check did not complete.',
      },
      {
        id: 'domain.product-ux',
        status: 'unverified',
        domains: ['product-ux'],
        reason: 'No routed check covers this domain.',
      },
    ];

    const summary = summarizeReport(findings, checks, coverageGaps);

    expect(summary.byCheckStatus).toEqual({
      completed: 1,
      unavailable: 0,
      failed: 1,
      unverified: 0,
    });
    expect(summary.byDomain['security-privacy']).toEqual({
      completed: 1,
      unavailable: 0,
      failed: 0,
      unverified: 0,
    });
    expect(summary.byDomain['reliability-recovery'].failed).toBe(1);
    expect(summary.byDomain['product-ux'].unverified).toBe(1);
    expect(derivePartial(checks, coverageGaps)).toBe(true);
  });
});
