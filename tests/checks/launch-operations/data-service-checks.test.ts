import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { backupRestoreCheck } from '../../../src/checks/launch-operations/backup-restore.js';
import { healthCheck } from '../../../src/checks/launch-operations/health-check.js';
import type { ArtifactType, CapabilityManifest, Detection } from '../../../src/model/capability.js';

const commandSpies = vi.hoisted(() => ({
  exec: vi.fn(),
  execFile: vi.fn(),
  spawn: vi.fn(),
}));

vi.mock('node:child_process', async (importOriginal) => ({
  ...await importOriginal<typeof import('node:child_process')>(),
  ...commandSpies,
}));

const temporaryRoots: string[] = [];
const fetchSpy = vi.fn();

const healthEvidence = `# Health check

Probe: GET /health.
Healthy result: HTTP 200 with status ok.
Coverage: the probe checks process availability but does not verify every dependency.
Failure handling: the monitoring system notifies the on-call maintainer.
Owner: On-call Maintainer.
`;

const backupRestoreEvidence = `# Backup and restore

Data: the primary application database.
Backup mechanism: provider-managed encrypted snapshots.
Frequency: every 24 hours; acceptable data loss is 24 hours.
Retention: 30 days.
1. Select an approved snapshot in the recovery environment.
2. Restore it using the provider procedure referenced in the private operations system.
Recovery time expectation: four hours.
Owner: Data Recovery Maintainer.
Failure notification: backup-job failures notify the owner.
Restore testing: test quarterly in a non-production recovery environment.
Boundaries: live backup configuration and credentials are not stored here.
`;

beforeEach(() => {
  fetchSpy.mockReset();
  vi.stubGlobal('fetch', fetchSpy);
  Object.values(commandSpies).forEach((spy) => spy.mockReset());
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-data-service-check-'));
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

function expectNoLiveAction(): void {
  expect(fetchSpy).not.toHaveBeenCalled();
  for (const commandSpy of Object.values(commandSpies)) expect(commandSpy).not.toHaveBeenCalled();
}

describe('healthCheck', () => {
  it('accepts complete versioned health evidence for a network service without executing the probe', async () => {
    const root = await createRepository({ 'docs/operations/health-check.md': healthEvidence });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(healthCheck.requiredAccess).toEqual(['filesystem-read']);
    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.passed',
      outcome: 'passed',
      actionLevel: 'resolve-before-launch',
      domains: ['reliability-recovery', 'operations-observability'],
      evidenceConfidence: 'confirmed',
      humanReviewRequired: false,
      unverifiedBoundaries: ['No endpoint or probe was executed.'],
      evidence: [{
        kind: 'file',
        location: 'docs/operations/health-check.md',
        summary: 'Repository operations evidence matched the versioned content profile.',
      }],
    });
    expectNoLiveAction();
  });

  it('accepts a narrowly named health source candidate', async () => {
    const root = await createRepository({
      'src/health.ts': `export function registerHealth(app: { get: Function }): void {
  app.get('/health', (_request: unknown, response: { status: Function }) =>
    response.status(200).json({ status: 'ok' }));
}
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
`,
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it('accepts health evidence from approved top-level structured fields', async () => {
    const root = await createRepository({
      'deploy/health.json': JSON.stringify({
        probe: 'GET /health',
        healthyResult: 'HTTP 200 with status ok',
        coverage: 'process availability only; does not verify every dependency',
        failureHandling: 'monitoring notifies the on-call maintainer',
        owner: 'On-call Maintainer',
      }),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it('does not scan a generic source file whose basename merely contains live', async () => {
    const root = await createRepository({ 'src/live-chat.ts': healthEvidence });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.unverified',
      outcome: 'unverified',
      evidence: [],
      evidenceConfidence: 'insufficient',
    });
  });

  it('is not applicable without the network-service capability and does not scan files', async () => {
    const [finding] = await healthCheck.run({
      root: '/path-that-does-not-exist',
      manifest: manifest(['backend']),
    });

    expect(finding).toMatchObject({ outcome: 'not-applicable', evidence: [], humanReviewRequired: false });
    expectNoLiveAction();
  });

  it('keeps unknown capability applicability unverified', async () => {
    const [finding] = await healthCheck.run({
      root: '/path-that-does-not-exist',
      manifest: manifest(),
    });

    expect(finding).toMatchObject({ outcome: 'unverified', evidence: [], humanReviewRequired: true });
    expectNoLiveAction();
  });

  it('keeps missing health evidence unverified', async () => {
    const root = await createRepository({ 'README.md': 'Project overview.\n' });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidence: [],
      humanReviewRequired: true,
    });
  });
});

describe('backupRestoreCheck', () => {
  it('accepts complete versioned backup and restore evidence for persistent data without testing recovery', async () => {
    const root = await createRepository({ 'docs/operations/backup-and-restore.md': backupRestoreEvidence });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(backupRestoreCheck.requiredAccess).toEqual(['filesystem-read']);
    expect(finding).toMatchObject({
      id: 'launch-operations.backup-restore.passed',
      outcome: 'passed',
      actionLevel: 'resolve-before-launch',
      domains: ['data-correctness', 'reliability-recovery'],
      evidenceConfidence: 'confirmed',
      humanReviewRequired: false,
      unverifiedBoundaries: ['No backup or restoration was observed or tested.'],
    });
    expectNoLiveAction();
  });

  it('is not applicable without the persistent-data capability and does not scan files', async () => {
    const [finding] = await backupRestoreCheck.run({
      root: '/path-that-does-not-exist',
      manifest: manifest(['backend']),
    });

    expect(finding).toMatchObject({ outcome: 'not-applicable', evidence: [], humanReviewRequired: false });
    expectNoLiveAction();
  });

  it('accepts backup and restore evidence from approved top-level structured fields', async () => {
    const root = await createRepository({
      'docs/operations/backup.json': JSON.stringify({
        data: 'primary application database',
        backupMechanism: 'provider-managed encrypted snapshots',
        frequency: 'every 24 hours',
        retention: '30 days',
        restoreSteps: ['select an approved snapshot', 'restore using the provider procedure'],
        recoveryTimeExpectation: 'four hours',
        owner: 'Data Recovery Maintainer',
        failureNotification: 'backup-job failures notify the owner',
        restoreTesting: 'test quarterly in a recovery environment',
        boundaries: 'live configuration and credentials are not stored here',
      }),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it('keeps unknown capability applicability unverified', async () => {
    const [finding] = await backupRestoreCheck.run({
      root: '/path-that-does-not-exist',
      manifest: manifest(),
    });

    expect(finding).toMatchObject({ outcome: 'unverified', evidence: [], humanReviewRequired: true });
    expectNoLiveAction();
  });

  it.each([
    'Backups are disabled.',
    'We do not back up this data!',
    'There is no restore path;',
  ])('reports a likely issue only for the affirmative risky statement %j', async (statement) => {
    const root = await createRepository({ 'docs/operations/backup-and-restore.md': statement });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.backup-restore.likely-issue',
      outcome: 'likely-issue',
      actionLevel: 'stop-before-launch',
      humanReviewRequired: true,
    });
  });

  it.each([
    'Backups are disabled?',
    '"We do not back up this data."',
    'The runbook discusses the phrase there is no restore path.',
    'What happens if there is no restore path?',
  ])('does not treat a question, quotation, or discussion as affirmative risky evidence: %j', async (statement) => {
    const root = await createRepository({ 'docs/operations/backup-and-restore.md': statement });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.backup-restore.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
    });
  });

  it('keeps missing backup and restore evidence unverified', async () => {
    const root = await createRepository({ 'README.md': 'Project overview.\n' });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.backup-restore.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidence: [],
      humanReviewRequired: true,
    });
  });
});
