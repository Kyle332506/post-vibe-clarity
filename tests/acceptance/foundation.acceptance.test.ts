import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import { privacyNoticeCheck } from '../../src/checks/launch-essentials.js';
import { secretExposureCheck } from '../../src/checks/secret-exposure.js';
import {
  foundationCheckImplementations,
  runReview,
} from '../../src/orchestrator/run-review.js';
import { renderJson } from '../../src/report/render-json.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const skillsRoot = fileURLToPath(new URL('../../skills', import.meta.url));
const fixedTimestamp = '2026-08-17T12:00:00.000Z';
const disclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';

type ReviewReport = Awaited<ReturnType<typeof runReview>>;

function containsControlledFixtureSecret(rendered: string): boolean {
  return rendered.includes('fixture-secret-value-never-use');
}

interface OverallScoreInspection {
  hasTopLevelScoreOrReadinessScore: boolean;
  hasProhibitedNumericReadinessScore: boolean;
}

function isProhibitedReadinessScoreKey(key: string): boolean {
  const normalizedKey = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
  return normalizedKey === 'score' || normalizedKey === 'overallscore'
    || (normalizedKey.includes('score') && (
      normalizedKey.includes('readiness') || normalizedKey.includes('production')
    ));
}

function containsProhibitedNumericReadinessScore(value: unknown): boolean {
  if (Array.isArray(value)) return value.some(containsProhibitedNumericReadinessScore);
  if (typeof value !== 'object' || value === null) return false;

  return Object.keys(value).some((key) => {
    const fieldValue: unknown = Reflect.get(value, key);
    return (typeof fieldValue === 'number' && isProhibitedReadinessScoreKey(key))
      || containsProhibitedNumericReadinessScore(fieldValue);
  });
}

function inspectOverallScoreFields(value: unknown): OverallScoreInspection {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return {
      hasTopLevelScoreOrReadinessScore: false,
      hasProhibitedNumericReadinessScore: containsProhibitedNumericReadinessScore(value),
    };
  }

  const topLevelScoreKeys = new Set(['score', 'readinessScore']);

  return {
    hasTopLevelScoreOrReadinessScore: Object.keys(value).some((key) => topLevelScoreKeys.has(key)),
    hasProhibitedNumericReadinessScore: containsProhibitedNumericReadinessScore(value),
  };
}

async function writeUnknownWebCheckCatalog(root: string): Promise<void> {
  const skillRoot = join(root, 'web-unknown');
  await mkdir(skillRoot);
  await writeFile(join(skillRoot, 'SKILL.md'), [
    '---',
    'name: web-unknown',
    'description: Use when testing unavailable routed web checks.',
    'license: Apache-2.0',
    '---',
    '',
    '# Web unknown',
    '',
  ].join('\n'));
  await writeFile(join(skillRoot, 'readiness.yaml'), [
    'schemaVersion: "0.1"',
    'id: web-unknown',
    'domains:',
    '  - reliability-recovery',
    'appliesTo:',
    '  anyArtifacts:',
    '    - web',
    'modes:',
    '  - audit',
    'maxActionLevel: 0',
    'checks:',
    '  - web-unknown.missing',
    '',
  ].join('\n'));
}

function isReachableGraphFrozen(value: unknown, seen = new Set<object>()): boolean {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null) return true;
  if (seen.has(value)) return true;
  seen.add(value);
  if (!Object.isFrozen(value)) return false;

  return Reflect.ownKeys(value).every((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor) return true;
    if ('value' in descriptor && !isReachableGraphFrozen(descriptor.value, seen)) return false;
    return isReachableGraphFrozen(descriptor.get, seen) && isReachableGraphFrozen(descriptor.set, seen);
  });
}

describe('PostVibeClarity v0.1 foundation acceptance', () => {
  let webReport: ReviewReport;
  let cliReport: ReviewReport;

  beforeAll(async () => {
    [webReport, cliReport] = await Promise.all([
      runReview({ root: fixture('web-missing-basics'), skillsRoot, now: () => fixedTimestamp }),
      runReview({ root: fixture('cli-clean'), skillsRoot, now: () => fixedTimestamp }),
    ]);
  });

  it('registers exactly the Level 0 implementations in the foundation slice', () => {
    expect(foundationCheckImplementations.map(({ id, actionLevel }) => ({ id, actionLevel }))).toEqual([
      { id: 'launch-essentials.privacy-notice', actionLevel: 0 },
      { id: 'secret-exposure.scan', actionLevel: 0 },
    ]);
  });

  it('keeps the runtime registration boundary deeply immutable', () => {
    const firstRegistration = foundationCheckImplementations[0];
    const secondRegistration = foundationCheckImplementations[1];
    if (!firstRegistration || !secondRegistration) throw new Error('Expected two foundation registrations.');

    const originalRun = firstRegistration.run;
    const originalActionLevel = firstRegistration.actionLevel;
    const originalAccess = firstRegistration.requiredAccess[0];
    const replacementRun = async () => [];
    let arrayMutationApplied = false;
    let actionLevelMutationApplied = false;
    let runMutationApplied = false;
    let accessMutationApplied = false;

    try {
      arrayMutationApplied = Reflect.set(foundationCheckImplementations, '0', secondRegistration)
        && foundationCheckImplementations[0] === secondRegistration;
      actionLevelMutationApplied = Reflect.set(firstRegistration, 'actionLevel', 4)
        && firstRegistration.actionLevel === 4;
      runMutationApplied = Reflect.set(firstRegistration, 'run', replacementRun)
        && firstRegistration.run === replacementRun;
      accessMutationApplied = Reflect.set(firstRegistration.requiredAccess, '0', 'network')
        && firstRegistration.requiredAccess[0] === 'network';
    } finally {
      if (arrayMutationApplied) Reflect.set(foundationCheckImplementations, '0', firstRegistration);
      if (actionLevelMutationApplied) Reflect.set(firstRegistration, 'actionLevel', originalActionLevel);
      if (runMutationApplied) Reflect.set(firstRegistration, 'run', originalRun);
      if (accessMutationApplied) Reflect.set(firstRegistration.requiredAccess, '0', originalAccess);
    }

    expect(Object.isFrozen(foundationCheckImplementations)).toBe(true);
    expect(foundationCheckImplementations.every((implementation) => Object.isFrozen(implementation))).toBe(true);
    expect(foundationCheckImplementations.every(({ requiredAccess }) => Object.isFrozen(requiredAccess))).toBe(true);
    expect(foundationCheckImplementations.every(({ run }) => Object.isFrozen(run))).toBe(true);
    expect(isReachableGraphFrozen(foundationCheckImplementations)).toBe(true);
    expect(firstRegistration.run).not.toBe(privacyNoticeCheck.run);
    expect(secondRegistration.run).not.toBe(secretExposureCheck.run);
    expect(arrayMutationApplied).toBe(false);
    expect(actionLevelMutationApplied).toBe(false);
    expect(runMutationApplied).toBe(false);
    expect(accessMutationApplied).toBe(false);
  });

  it('keeps running captured implementations after an imported check object is mutated', async () => {
    const originalRun = privacyNoticeCheck.run;
    const replacementRun = async () => [];
    const mutationApplied = Reflect.set(privacyNoticeCheck, 'run', replacementRun)
      && privacyNoticeCheck.run === replacementRun;

    try {
      const report = await runReview({
        root: fixture('web-missing-basics'),
        skillsRoot,
        now: () => fixedTimestamp,
      });
      const retainedPrivacyFinding = report.findings.some(
        ({ checkId }) => checkId === 'launch-essentials.privacy-notice',
      );

      expect({ mutationApplied, retainedPrivacyFinding }).toEqual({
        mutationApplied: true,
        retainedPrivacyFinding: true,
      });
    } finally {
      Reflect.set(privacyNoticeCheck, 'run', originalRun);
    }
  });

  it('routes real web and CLI fixtures to deterministic artifact-specific checks', () => {
    expect(webReport.manifest.artifacts.map(({ value }) => value)).toEqual(['web']);
    expect(webReport.findings.map(({ checkId }) => checkId)).toEqual([
      'launch-essentials.privacy-notice',
      'secret-exposure.scan',
    ]);
    expect(cliReport.manifest.artifacts.map(({ value }) => value)).toEqual(['cli']);
    expect(cliReport.findings).toEqual([]);
  });

  it('routes the privacy check only when its capability is detected', () => {
    expect(webReport.manifest.capabilities.map(({ value }) => value)).toEqual(['collects-personal-data']);
    expect(webReport.findings.find(({ checkId }) => checkId === 'launch-essentials.privacy-notice')).toMatchObject({
      outcome: 'likely-issue',
      humanReviewRequired: true,
    });
    expect(cliReport.manifest.capabilities).toEqual([]);
    expect(cliReport.findings.some(({ checkId }) => checkId === 'launch-essentials.privacy-notice')).toBe(false);
  });

  it('renders real reports without disclosing a controlled secret or numeric readiness score', () => {
    const json = renderJson(webReport);
    const markdown = renderMarkdown(webReport);
    const scoreInspection = inspectOverallScoreFields(JSON.parse(json) as unknown);
    const jsonContainsSecret = containsControlledFixtureSecret(json);
    const markdownContainsSecret = containsControlledFixtureSecret(markdown);
    const markdownContainsScoreLanguage = markdown.toLowerCase().includes('readiness score')
      || markdown.toLowerCase().includes('overall score');

    expect(jsonContainsSecret).toBe(false);
    expect(markdownContainsSecret).toBe(false);
    expect(scoreInspection.hasTopLevelScoreOrReadinessScore).toBe(false);
    expect(scoreInspection.hasProhibitedNumericReadinessScore).toBe(false);
    expect(markdownContainsScoreLanguage).toBe(false);
  });

  it('detects numeric readiness scores without rejecting domain-specific metrics', () => {
    expect(inspectOverallScoreFields(JSON.parse('{"score":90}') as unknown)).toEqual({
      hasTopLevelScoreOrReadinessScore: true,
      hasProhibitedNumericReadinessScore: true,
    });
    expect(inspectOverallScoreFields(JSON.parse('{"readinessScore":90}') as unknown)).toEqual({
      hasTopLevelScoreOrReadinessScore: true,
      hasProhibitedNumericReadinessScore: true,
    });
    expect(inspectOverallScoreFields(JSON.parse('{"overallReadinessScore":90}') as unknown)).toEqual({
      hasTopLevelScoreOrReadinessScore: false,
      hasProhibitedNumericReadinessScore: true,
    });
    expect(inspectOverallScoreFields(JSON.parse('{"summary":{"score":90}}') as unknown).hasProhibitedNumericReadinessScore).toBe(true);
    expect(inspectOverallScoreFields(JSON.parse('{"summary":{"readinessScore":90}}') as unknown).hasProhibitedNumericReadinessScore).toBe(true);
    expect(inspectOverallScoreFields(JSON.parse('{"summary":{"readiness_score":90}}') as unknown).hasProhibitedNumericReadinessScore).toBe(true);
    expect(inspectOverallScoreFields(JSON.parse('{"sections":[{"readiness-score":90}]}') as unknown).hasProhibitedNumericReadinessScore).toBe(true);
    expect(inspectOverallScoreFields(JSON.parse('{"productionReadinessScore":90}') as unknown).hasProhibitedNumericReadinessScore).toBe(true);
    expect(inspectOverallScoreFields(JSON.parse('{"overallScore":90}') as unknown).hasProhibitedNumericReadinessScore).toBe(true);
    expect(inspectOverallScoreFields(JSON.parse('{"summary":{"overall-score":90}}') as unknown).hasProhibitedNumericReadinessScore).toBe(true);
    expect(inspectOverallScoreFields(JSON.parse('{"security":{"cvssScore":9.8}}') as unknown).hasProhibitedNumericReadinessScore).toBe(false);
  });

  it('renders report timestamps, toolkit and check metadata, and the required disclaimer', () => {
    const json = renderJson(webReport);
    const markdown = renderMarkdown(webReport);
    const parsed = JSON.parse(json) as ReviewReport;

    expect(parsed.generatedAt).toBe(fixedTimestamp);
    expect(parsed.toolkitVersion).toBe('0.1.0');
    expect(parsed.findings.map(({ checkId, skillVersion }) => ({ checkId, skillVersion }))).toEqual([
      { checkId: 'launch-essentials.privacy-notice', skillVersion: '0.1.0' },
      { checkId: 'secret-exposure.scan', skillVersion: '0.1.0' },
    ]);
    expect(parsed.disclaimer).toBe(disclaimer);
    expect(markdown).toContain(`Generated at: ${fixedTimestamp}`);
    expect(markdown).toContain('Toolkit version: 0.1.0');
    expect(markdown).toContain('Check: launch-essentials.privacy-notice (skill version 0.1.0)');
    expect(markdown).toContain('Check: secret-exposure.scan (skill version 0.1.0)');
    expect(markdown.endsWith(`${disclaimer}\n`)).toBe(true);
  });

  it('reports a matching artifact check with no implementation as unverified', async () => {
    const temporaryCatalog = await mkdtemp(join(tmpdir(), 'postvibe-acceptance-catalog-'));

    try {
      await writeUnknownWebCheckCatalog(temporaryCatalog);
      const [webUnknownReport, cliUnknownReport] = await Promise.all([
        runReview({ root: fixture('web-missing-basics'), skillsRoot: temporaryCatalog, now: () => fixedTimestamp }),
        runReview({ root: fixture('cli-clean'), skillsRoot: temporaryCatalog, now: () => fixedTimestamp }),
      ]);

      expect(webUnknownReport.partial).toBe(true);
      expect(webUnknownReport.findings).toHaveLength(1);
      expect(webUnknownReport.findings[0]).toMatchObject({
        checkId: 'web-unknown.missing',
        skillVersion: 'unknown',
        outcome: 'unverified',
        unverifiedBoundaries: ['No check implementation is registered.'],
      });
      expect(cliUnknownReport.findings).toEqual([]);
    } finally {
      await rm(temporaryCatalog, { recursive: true, force: true });
    }
  });

  it('rejects a sidecar-bearing catalog directory whose Agent Skill is missing', async () => {
    const temporaryCatalog = await mkdtemp(join(tmpdir(), 'postvibe-acceptance-missing-skill-'));
    const incompleteSkillRoot = join(temporaryCatalog, 'incomplete');

    try {
      await mkdir(incompleteSkillRoot);
      await writeFile(join(incompleteSkillRoot, 'readiness.yaml'), [
        'schemaVersion: "0.1"',
        'id: incomplete',
        'domains:',
        '  - security-privacy',
        'modes:',
        '  - audit',
        'maxActionLevel: 0',
        'checks:',
        '  - incomplete.missing',
        '',
      ].join('\n'));

      await expect(runReview({
        root: fixture('cli-clean'),
        skillsRoot: temporaryCatalog,
        now: () => fixedTimestamp,
      })).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      await rm(temporaryCatalog, { recursive: true, force: true });
    }
  });
});
