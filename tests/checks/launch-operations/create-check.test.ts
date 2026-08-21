import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createOperationsCheck, type OperationsCheckDefinition } from '../../../src/checks/launch-operations/create-check.js';
import { derivePartial, summarizeReport } from '../../../src/model/report.js';
import type { ArtifactType, CapabilityManifest, Detection } from '../../../src/model/capability.js';
import type { Finding } from '../../../src/model/finding.js';
import { validateReadinessReport } from '../../../src/validation/report-schema.js';
import { sampleReadinessReport } from '../../fixtures/sample-readiness-report.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-create-operations-check-'));
  temporaryRoots.push(root);
  await Promise.all(Object.entries(files).map(async ([location, contents]) => {
    const path = join(root, location);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }));
  return root;
}

function manifest(artifacts: ArtifactType[] = [], capabilities: string[] = []): CapabilityManifest {
  const detection = <T extends string>(value: T): Detection<T> => ({
    value,
    confidence: 'confirmed',
    evidence: [{ kind: 'file', location: 'package.json', summary: 'Fixture detection.' }],
  });
  return {
    schemaVersion: '0.1',
    projectRoot: '/fixture',
    generatedAt: '2026-08-20T00:00:00.000Z',
    artifacts: artifacts.map(detection),
    frameworks: [],
    services: [],
    capabilities: capabilities.map(detection),
  };
}

const definition: OperationsCheckDefinition = {
  id: 'launch-operations.health-check',
  label: 'Health check',
  domains: ['operations-observability'],
  actionLevel: 'resolve-before-launch',
  profile: () => ({
    candidatePaths: [/(?:^|\/)health\.md$/iu],
    requirements: [{ id: 'procedure', patterns: [/\bverify\b/iu] }],
    riskPatterns: [/\bno health check\b/iu],
  }),
  recommendation: 'Document a health-check procedure.',
  verification: 'Run the health-check procedure in the deployment environment.',
  liveBoundary: 'Confirm health checks remain available in the live environment.',
};

describe('createOperationsCheck', () => {
  it('returns not-applicable without scanning files', async () => {
    const check = createOperationsCheck(definition);
    const [finding] = await check.run({ root: '/path-that-does-not-exist', manifest: manifest(['cli']) });

    expect(check).toMatchObject({
      id: definition.id,
      version: '0.1.0',
      domains: ['operations-observability'],
      actionLevel: 0,
      requiredAccess: ['filesystem-read'],
    });
    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.not-applicable',
      outcome: 'not-applicable',
      evidence: [],
      humanReviewRequired: false,
    });
  });

  it('returns unverified when the project shape is ambiguous', async () => {
    const check = createOperationsCheck(definition);
    const [finding] = await check.run({ root: '/path-that-does-not-exist', manifest: manifest() });

    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidence: [],
      evidenceConfidence: 'insufficient',
      humanReviewRequired: true,
    });
  });

  it.each([
    ['missing', { 'README.md': 'No health evidence.' }],
    ['insufficient', { 'health.md': 'A health note without a procedure.' }],
  ])('returns unverified with resolve-before-launch for %s evidence', async (_status, files) => {
    const root = await createRepository(files);
    const check = createOperationsCheck(definition);

    const [finding] = await check.run({ root, manifest: manifest(['web'], ['network-service']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidenceConfidence: 'insufficient',
      humanReviewRequired: true,
    });
  });

  it('returns a repository-evidence pass with the live boundary', async () => {
    const root = await createRepository({ 'health.md': 'Verify the production health endpoint.' });
    const check = createOperationsCheck(definition);

    const [finding] = await check.run({ root, manifest: manifest(['web'], ['network-service']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.passed',
      checkId: definition.id,
      checkVersion: '0.1.0',
      skillVersion: '0.1.0',
      domains: ['operations-observability'],
      outcome: 'passed',
      actionLevel: definition.actionLevel,
      evidenceConfidence: 'confirmed',
      humanReviewRequired: false,
      unverifiedBoundaries: [definition.liveBoundary],
      evidence: [{
        kind: 'file',
        location: 'health.md',
        summary: 'Repository operations evidence matched the versioned content profile.',
      }],
    });
  });

  it('returns a likely issue for explicit risk evidence only when risk metadata exists', async () => {
    const root = await createRepository({ 'health.md': 'No health check is deployed.' });
    const withRisk = createOperationsCheck({
      ...definition,
      risk: {
        title: 'Health check is absent',
        impact: 'Incidents may not be detected promptly.',
        actionLevel: 'stop-before-launch',
      },
    });
    const withoutRisk = createOperationsCheck(definition);

    const [riskFinding] = await withRisk.run({ root, manifest: manifest(['web'], ['network-service']) });
    const [passFinding] = await withoutRisk.run({ root, manifest: manifest(['web'], ['network-service']) });

    expect(riskFinding).toMatchObject({
      id: 'launch-operations.health-check.likely-issue',
      outcome: 'likely-issue',
      title: 'Health check is absent',
      impact: 'Incidents may not be detected promptly.',
      actionLevel: 'stop-before-launch',
      humanReviewRequired: true,
    });
    expect(passFinding?.outcome).toBe('unverified');
  });

  it('keeps returned fields stable and never returns candidate file contents', async () => {
    const sourceContent = 'Verify the production health endpoint. confidential candidate file content';
    const root = await createRepository({ 'health.md': sourceContent });
    const check = createOperationsCheck(definition);

    const [finding] = await check.run({ root, manifest: manifest(['web'], ['network-service']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.passed',
      checkId: 'launch-operations.health-check',
      checkVersion: '0.1.0',
      skillVersion: '0.1.0',
      domains: ['operations-observability'],
      recommendation: 'Document a health-check procedure.',
      verification: 'Run the health-check procedure in the deployment environment.',
    });
    expect(JSON.stringify(finding)).not.toContain(sourceContent);
    expect(JSON.stringify(finding)).not.toContain('confidential candidate file content');
  });

  it('validates a passed finding that records its live boundary', async () => {
    const root = await createRepository({ 'health.md': 'Verify the production health endpoint.' });
    const [finding] = await createOperationsCheck(definition).run({
      root,
      manifest: manifest(['web'], ['network-service']),
    });
    if (!finding) throw new Error('expected a finding');
    const schemaFinding: Finding = { ...finding, domains: ['security-privacy'] };
    const report = structuredClone(sampleReadinessReport);
    report.findings[0] = schemaFinding;
    report.checkExecutions[1] = {
      ...report.checkExecutions[1]!,
      checkId: schemaFinding.checkId,
      checkVersion: schemaFinding.checkVersion,
      skillVersion: schemaFinding.skillVersion,
      domains: [...schemaFinding.domains],
      findingIds: [schemaFinding.id],
    };
    report.summary = summarizeReport(report.findings, report.checkExecutions, report.coverageGaps);
    report.partial = derivePartial(report.checkExecutions, report.coverageGaps);

    await expect(validateReadinessReport(report)).resolves.toEqual({ ok: true });
  });
});
