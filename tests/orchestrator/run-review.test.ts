import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
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
    expect(report.runId).toBe('pvc-20260817120000000');
    expect(report.disclaimer).toContain('does not certify');

    const jsonContainsControlledValue = renderJson(report).includes(controlledFixtureValue);
    const markdownContainsControlledValue = renderMarkdown(report).includes(controlledFixtureValue);
    expect(jsonContainsControlledValue).toBe(false);
    expect(markdownContainsControlledValue).toBe(false);
  });

  it('reports a routed check without an implementation as unverified', async () => {
    const temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-unavailable-'));
    const unavailableSkill = join(temporaryRoot, 'unavailable-check');

    try {
      await mkdir(unavailableSkill);
      await writeFile(join(unavailableSkill, 'SKILL.md'), '# Unavailable check\n');
      await writeFile(join(unavailableSkill, 'readiness.yaml'), [
        'schemaVersion: "0.1"',
        'id: unavailable-check',
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
      expect(report.findings[0]).toMatchObject({
        id: 'unavailable-check.missing.unavailable',
        checkId: 'unavailable-check.missing',
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
});
