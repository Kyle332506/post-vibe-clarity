import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { privacyNoticeCheck } from '../../src/checks/launch-essentials.js';
import { runReview } from '../../src/orchestrator/run-review.js';
import { renderJson } from '../../src/report/render-json.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const skillsRoot = fileURLToPath(new URL('../fixtures/skills', import.meta.url));
const fixedTimestamp = '2026-08-17T12:00:00.000Z';
const controlledFixtureValue = 'fixture-secret-value-never-use';

describe('runReview', () => {
  it('runs routed checks into a deterministic evidence-backed report', async () => {
    const report = await runReview({
      root: fixture('web-missing-basics'),
      skillsRoot,
      now: () => fixedTimestamp,
    });

    expect(report.manifest.artifacts.map((item) => item.value)).toContain('web');
    expect(report.findings.map((item) => item.checkId)).toEqual([
      'launch-essentials.privacy-notice',
      'secret-exposure.scan',
    ]);
    expect(report.summary.byOutcome.failed).toBe(1);
    expect(report.summary.byOutcome['likely-issue']).toBe(1);
    expect(report.checkExecutions).toEqual([
      expect.objectContaining({
        checkId: 'launch-essentials.privacy-notice',
        skillId: 'launch-essentials',
        status: 'completed',
        findingIds: ['launch-essentials.privacy-notice-missing'],
      }),
      expect.objectContaining({
        checkId: 'secret-exposure.scan',
        skillId: 'secret-exposure',
        status: 'completed',
        findingIds: ['secret-exposure.src/config.ts:1.quoted-credential-assignment'],
      }),
    ]);
    expect(report.coverageGaps.map(({ id }) => id)).toEqual([
      'domain.data-correctness',
      'domain.maintainability-change-safety',
      'domain.operations-observability',
      'domain.performance-cost',
      'domain.product-ux',
      'domain.release-delivery',
      'domain.reliability-recovery',
    ]);
    expect(report.partial).toBe(true);
    expect(report.runId).toBe('pvc-20260817120000000');
    expect(report.disclaimer).toContain('does not certify');

    const jsonContainsControlledValue = renderJson(report).includes(controlledFixtureValue);
    const markdownContainsControlledValue = renderMarkdown(report).includes(controlledFixtureValue);
    expect(jsonContainsControlledValue).toBe(false);
    expect(markdownContainsControlledValue).toBe(false);
  });

  it('optionally excludes only exact artifact paths from discovery and check scans', async () => {
    const projectRoot = fixture('web-missing-basics');
    const secretPath = join(projectRoot, 'src', 'config.ts');

    const ordinary = await runReview({
      root: projectRoot,
      skillsRoot,
      now: () => fixedTimestamp,
    });
    const excludingArtifact = await runReview({
      root: projectRoot,
      skillsRoot,
      now: () => fixedTimestamp,
      excludedArtifactPaths: [secretPath],
    });

    expect(ordinary.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'secret-exposure.src/config.ts:1.quoted-credential-assignment' }),
    ]));
    expect(excludingArtifact.findings.some(({ id }) => id.includes('src/config.ts'))).toBe(false);
    expect(excludingArtifact.findings).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'launch-essentials.privacy-notice-missing' }),
    ]));
  });

  it('reports a routed check without an implementation as unverified', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-unavailable-'));
    const unavailableSkill = join(temporaryRoot, 'unavailable-check');

    try {
      await mkdir(unavailableSkill);
      await writeFile(join(unavailableSkill, 'SKILL.md'), [
        '---',
        'name: unavailable-check',
        'description: Use when testing unavailable routed checks.',
        'license: Apache-2.0',
        '---',
        '',
        '# Unavailable check',
        '',
      ].join('\n'));
      await writeFile(join(unavailableSkill, 'readiness.yaml'), [
        'schemaVersion: "0.1"',
        'id: unavailable-check',
        'skillVersion: "0.1.0"',
        'domains:',
        '  - reliability-recovery',
        'modes:',
        '  - audit',
        'maxActionLevel: 0',
        'checks:',
        '  - unavailable-check.missing',
        '',
      ].join('\n'));

      const report = await runReview({
        root: fixture('cli-clean'),
        skillsRoot: temporaryRoot,
        now: () => fixedTimestamp,
      });

      expect(report.partial).toBe(true);
      expect(report.summary.byOutcome.unverified).toBe(1);
      expect(report.checkExecutions).toEqual([
        expect.objectContaining({
          checkId: 'unavailable-check.missing',
          skillId: 'unavailable-check',
          status: 'unavailable',
          findingIds: ['unavailable-check.missing.unavailable'],
        }),
      ]);
      expect(report.coverageGaps).toContainEqual(expect.objectContaining({
        id: 'check.unavailable-check.missing',
        checkId: 'unavailable-check.missing',
        status: 'unavailable',
      }));
      expect(report.findings[0]).toMatchObject({
        id: 'unavailable-check.missing.unavailable',
        checkId: 'unavailable-check.missing',
        checkVersion: 'unknown',
        skillVersion: '0.1.0',
        domains: ['reliability-recovery'],
        actionLevel: 'human-review-needed',
        outcome: 'unverified',
        evidenceConfidence: 'insufficient',
        humanReviewRequired: true,
        unverifiedBoundaries: ['No check implementation is registered.'],
      });
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('uses the registered check domains in executions and check-specific coverage gaps', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-exact-domains-'));
    const exactDomainSkill = join(temporaryRoot, 'exact-domain-check');

    try {
      await mkdir(exactDomainSkill);
      await writeFile(join(exactDomainSkill, 'SKILL.md'), [
        '---',
        'name: exact-domain-check',
        'description: Use when testing exact registered check domains.',
        'license: Apache-2.0',
        '---',
        '',
        '# Exact domain check',
        '',
      ].join('\n'));
      await writeFile(join(exactDomainSkill, 'readiness.yaml'), [
        'schemaVersion: "0.1"',
        'id: exact-domain-check',
        'skillVersion: "0.1.0"',
        'domains:',
        '  - release-delivery',
        '  - operations-observability',
        'modes:',
        '  - audit',
        'maxActionLevel: 0',
        'checks:',
        '  - exact-domain-check.release',
        '',
      ].join('\n'));

      const report = await runReview({
        root: fixture('cli-clean'),
        skillsRoot: temporaryRoot,
        now: () => fixedTimestamp,
        checkImplementations: [{
          id: 'exact-domain-check.release',
          version: '0.1.0',
          domains: ['release-delivery'],
          actionLevel: 0,
          requiredAccess: ['filesystem-read'],
          async run() {
            return [{
              id: 'exact-domain-check.release.unverified',
              checkId: 'exact-domain-check.release',
              checkVersion: '0.1.0',
              skillVersion: '0.1.0',
              domains: ['release-delivery'],
              actionLevel: 'human-review-needed',
              outcome: 'unverified',
              title: 'Release evidence unavailable',
              impact: 'Release delivery remains unverified.',
              evidence: [],
              evidenceConfidence: 'insufficient',
              applicability: 'The exact-domain fixture check was routed.',
              recommendation: 'Provide release evidence.',
              verification: 'Run the fixture check again.',
              humanReviewRequired: true,
              unverifiedBoundaries: ['The fixture evidence was unavailable.'],
            }];
          },
        }],
      });

      expect(report.checkExecutions[0]).toMatchObject({
        checkId: 'exact-domain-check.release',
        domains: ['release-delivery'],
      });
      expect(report.coverageGaps).toContainEqual(expect.objectContaining({
        id: 'check.exact-domain-check.release',
        domains: ['release-delivery'],
      }));
    } finally {
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  });

  it('records a completed routed check even when it produces no findings', async () => {
    const report = await runReview({
      root: fixture('cli-clean'),
      skillsRoot,
      now: () => fixedTimestamp,
    });

    expect(report.findings).toEqual([]);
    expect(report.checkExecutions).toEqual([
      expect.objectContaining({
        checkId: 'secret-exposure.scan',
        skillId: 'secret-exposure',
        status: 'completed',
        findingIds: [],
      }),
    ]);
    expect(report.summary.byCheckStatus.completed).toBe(1);
    expect(report.coverageGaps).not.toContainEqual(expect.objectContaining({
      checkId: 'secret-exposure.scan',
    }));
    expect(report.partial).toBe(true);
  });

  it('isolates a thrown check, retains earlier evidence, and redacts the error', async () => {
    const controlledError = 'controlled-check-error-never-emit';
    const report = await runReview({
      root: fixture('web-missing-basics'),
      skillsRoot,
      now: () => fixedTimestamp,
      checkImplementations: [
        privacyNoticeCheck,
        {
          id: 'secret-exposure.scan',
          version: '0.1.0',
          domains: ['security-privacy'],
          actionLevel: 0,
          requiredAccess: ['filesystem-read'],
          async run() {
            throw new Error(controlledError);
          },
        },
      ],
    });

    expect(report.findings.map(({ id }) => id)).toEqual([
      'launch-essentials.privacy-notice-missing',
      'secret-exposure.scan.execution-failed',
    ]);
    expect(report.checkExecutions).toEqual([
      expect.objectContaining({
        checkId: 'launch-essentials.privacy-notice',
        status: 'completed',
      }),
      expect.objectContaining({
        checkId: 'secret-exposure.scan',
        status: 'failed',
        findingIds: ['secret-exposure.scan.execution-failed'],
      }),
    ]);
    expect(report.coverageGaps).toContainEqual(expect.objectContaining({
      id: 'check.secret-exposure.scan',
      status: 'failed',
      reason: 'The check failed before it could complete. Run it again after resolving the local execution problem.',
    }));
    expect(renderJson(report)).not.toContain(controlledError);
    expect(renderMarkdown(report)).not.toContain(controlledError);
    expect(report.partial).toBe(true);
  });

  it('records an unverified result as an unverified execution with a matching gap', async () => {
    const report = await runReview({
      root: fixture('cli-clean'),
      skillsRoot,
      now: () => fixedTimestamp,
      checkImplementations: [{
        id: 'secret-exposure.scan',
        version: '0.1.0',
        domains: ['security-privacy'],
        actionLevel: 0,
        requiredAccess: ['filesystem-read'],
        async run() {
          return [{
            id: 'secret-exposure.fixture-unverified',
            checkId: 'secret-exposure.scan',
            checkVersion: '0.1.0',
            skillVersion: '0.1.0',
            domains: ['security-privacy'],
            actionLevel: 'human-review-needed',
            outcome: 'unverified',
            title: 'Fixture boundary could not be inspected',
            impact: 'The fixture area remains unknown.',
            evidence: [],
            evidenceConfidence: 'insufficient',
            applicability: 'The fixture check was routed.',
            recommendation: 'Provide the missing local evidence.',
            verification: 'Run the fixture check again.',
            humanReviewRequired: true,
            unverifiedBoundaries: ['The fixture evidence was unavailable.'],
          }];
        },
      }],
    });

    expect(report.checkExecutions[0]).toMatchObject({
      checkId: 'secret-exposure.scan',
      status: 'unverified',
      findingIds: ['secret-exposure.fixture-unverified'],
    });
    expect(report.coverageGaps).toContainEqual(expect.objectContaining({
      id: 'check.secret-exposure.scan',
      status: 'unverified',
      reason: 'The fixture evidence was unavailable.',
    }));
  });

  it('fails closed when a check returns a report fragment that violates the versioned contract', async () => {
    await expect(runReview({
      root: fixture('cli-clean'),
      skillsRoot,
      now: () => fixedTimestamp,
      checkImplementations: [{
        id: 'secret-exposure.scan',
        version: '0.1.0',
        domains: ['security-privacy'],
        actionLevel: 0,
        requiredAccess: ['filesystem-read'],
        async run() {
          return [{
            id: 'secret-exposure.invalid-provenance',
            checkId: 'secret-exposure.scan',
            skillVersion: '0.1.0',
            domains: ['security-privacy'],
            actionLevel: 'stop-before-launch',
            outcome: 'failed',
            title: 'Invalid fixture finding',
            impact: 'This fixture intentionally omits check provenance.',
            evidence: [],
            evidenceConfidence: 'insufficient',
            applicability: 'Runtime report validation is under test.',
            recommendation: 'Reject the report.',
            verification: 'Run report validation.',
            humanReviewRequired: false,
          } as never];
        },
      }],
    })).rejects.toThrow('Generated report failed versioned runtime validation.');
  });
});
