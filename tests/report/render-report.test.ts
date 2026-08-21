import { describe, expect, it } from 'vitest';
import { renderJson } from '../../src/report/render-json.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';
import { sampleControlledCredential, sampleReadinessReport } from '../fixtures/sample-readiness-report.js';

describe('report renderers', () => {
  it('renders stable JSON data without readiness claims or credentials', () => {
    const json = renderJson(sampleReadinessReport);
    const containsFakeCredential = json.includes(sampleControlledCredential);
    const containsReadinessScore = json.toLowerCase().includes('readiness score');
    const containsCertificationClaim = json.toLowerCase().includes('certified production ready');

    expect(JSON.parse(json)).toMatchObject({ schemaVersion: '0.1', partial: true });
    expect(json).toBe(`${JSON.stringify(sampleReadinessReport, null, 2)}\n`);
    expect(containsFakeCredential).toBe(false);
    expect(containsReadinessScore).toBe(false);
    expect(containsCertificationClaim).toBe(false);
  });

  it('renders evidence-backed Markdown with counts, scope, and unverified boundaries', () => {
    const markdown = renderMarkdown(sampleReadinessReport);
    const containsFakeCredential = markdown.includes(sampleControlledCredential);
    const containsReadinessScore = markdown.toLowerCase().includes('readiness score');
    const containsCertificationClaim = markdown.toLowerCase().includes('certified production ready');
    const endsWithDisclaimer = markdown.endsWith(`${sampleReadinessReport.disclaimer}\n`);

    expect(markdown).toContain('# PostVibeClarity launch review');
    expect(markdown).toContain('## Summary');
    expect(markdown).toContain('Stop before launch: 1');
    expect(markdown).toContain('Unverified: 1');
    expect(markdown).toContain('## Findings');
    expect(markdown).toContain('### Stop before launch');
    expect(markdown).toContain('src/config.ts:2');
    expect(markdown).toContain('## Unverified areas');
    expect(markdown).toContain('Legal accuracy requires human review.');
    expect(markdown).toContain('## Checks performed');
    expect(markdown).toContain('secret-exposure.scan: completed');
    expect(markdown).toContain('launch-essentials.privacy-notice: unverified');
    expect(markdown).toContain('Check: secret-exposure.scan (check version 0.1.0; skill version 0.1.0)');
    expect(markdown).toContain('## Coverage gaps');
    expect(markdown).toContain('Product and user experience: No routed check covers this domain in the current review.');
    expect(markdown).toContain('## Scope');
    expect(markdown).toContain('/example/project');
    expect(markdown).toContain('## Important limitation');
    expect(endsWithDisclaimer).toBe(true);
    expect(containsFakeCredential).toBe(false);
    expect(containsReadinessScore).toBe(false);
    expect(containsCertificationClaim).toBe(false);
  });

  it('renders each explicit passed boundary once without adding not-applicable boundary noise', () => {
    const report = structuredClone(sampleReadinessReport);
    const sourceFinding = report.findings[1];
    if (!sourceFinding) throw new Error('Expected the sample unverified finding.');
    const passedBoundary = 'No endpoint or probe was executed.';
    const notApplicableBoundary = 'A not-applicable check must not add boundary noise.';
    report.findings.push(
      {
        ...sourceFinding,
        id: 'launch-operations.health-check.passed',
        checkId: 'launch-operations.health-check',
        outcome: 'passed',
        title: 'Health check evidence found',
        unverifiedBoundaries: [passedBoundary],
      },
      {
        ...sourceFinding,
        id: 'launch-operations.backup-restore.not-applicable',
        checkId: 'launch-operations.backup-restore',
        outcome: 'not-applicable',
        title: 'Backup and restore review not applicable',
        unverifiedBoundaries: [notApplicableBoundary],
      },
      {
        ...sourceFinding,
        id: 'launch-operations.release-process.passed',
        checkId: 'launch-operations.release-process',
        outcome: 'passed',
        title: 'Release and deployment evidence found',
        unverifiedBoundaries: [],
      },
    );

    const markdown = renderMarkdown(report);

    expect(markdown.split(passedBoundary)).toHaveLength(2);
    expect(markdown).not.toContain(notApplicableBoundary);
    expect(markdown).not.toContain('Unverified boundary: undefined');
    expect(markdown.endsWith(`${sampleReadinessReport.disclaimer}\n`)).toBe(true);
  });
});
