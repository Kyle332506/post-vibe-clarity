import { once } from 'node:events';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import type { Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import type { ReadinessReport } from '../../src/model/report.js';
import { runReview } from '../../src/orchestrator/run-review.js';
import { snapshotWorkingTree } from '../../src/verification/working-tree.js';

const exampleSource = (stage: 'before' | 'after') => fileURLToPath(
  new URL(`../../examples/launch-candidate/${stage}/`, import.meta.url),
);
const skillsRoot = fileURLToPath(new URL('../../skills/', import.meta.url));
const now = () => '2026-08-18T12:00:00.000Z';
const temporaryRoots: string[] = [];
const expectedBeforeCoverageGapIds = [
  'check.launch-operations.backup-restore',
  'check.launch-operations.health-check',
  'check.launch-operations.maintenance-ownership',
  'check.launch-operations.monitoring-response',
  'check.launch-operations.release-process',
  'check.launch-operations.rollback-process',
  'domain.performance-cost',
  'domain.product-ux',
];
type StartServer = (options?: { host?: string; port?: number }) => Server;

const operationsOutcomes = (report: ReadinessReport) => Object.fromEntries(
  report.findings
    .filter(({ checkId }) => checkId.startsWith('launch-operations.'))
    .map(({ checkId, outcome }) => [checkId, outcome]),
);

async function reviewExample(stage: 'before' | 'after'): Promise<ReadinessReport> {
  const root = await mkdtemp(join(tmpdir(), `postvibe-launch-candidate-${stage}-`));
  temporaryRoots.push(root);
  await cp(exampleSource(stage), root, { recursive: true });
  const before = await snapshotWorkingTree(root, []);

  const report = await runReview({ root, skillsRoot, now });

  await expect(snapshotWorkingTree(root, [])).resolves.toEqual(before);
  return report;
}

async function loadStartServer(stage: 'before' | 'after'): Promise<StartServer> {
  const moduleUrl = new URL(`../../examples/launch-candidate/${stage}/src/server.js`, import.meta.url);
  const exampleModule = await import(moduleUrl.href) as { startServer: StartServer };
  return exampleModule.startServer;
}

async function closeServer(server: Server): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => error ? reject(error) : resolve());
  });
}

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

describe('launch candidate example projects', () => {
  it('shows the credential and missing privacy notice in the before project', async () => {
    const report = await reviewExample('before');

    expect(report.manifest.artifacts.map(({ value }) => value)).toEqual(['web', 'backend']);
    expect(report.manifest.capabilities.map(({ value }) => value)).toEqual([
      'network-service',
      'persistent-data',
      'collects-personal-data',
    ]);
    expect(report.findings
      .filter(({ checkId }) => !checkId.startsWith('launch-operations.'))
      .map(({ checkId, outcome, actionLevel }) => ({
        checkId,
        outcome,
        actionLevel,
      }))).toEqual([
      {
        checkId: 'launch-essentials.privacy-notice',
        outcome: 'likely-issue',
        actionLevel: 'human-review-needed',
      },
      {
        checkId: 'secret-exposure.scan',
        outcome: 'failed',
        actionLevel: 'stop-before-launch',
      },
    ]);
    expect(operationsOutcomes(report)).toMatchObject({
      'launch-operations.release-process': 'unverified',
      'launch-operations.rollback-process': 'unverified',
      'launch-operations.monitoring-response': 'unverified',
      'launch-operations.health-check': 'unverified',
      'launch-operations.backup-restore': 'unverified',
      'launch-operations.maintenance-ownership': 'unverified',
    });
    expect(report.partial).toBe(true);
    expect(report.coverageGaps.map(({ id }) => id)).toEqual(expectedBeforeCoverageGapIds);
  });

  it('resolves the targeted example findings without hiding remaining coverage gaps', async () => {
    const report = await reviewExample('after');

    expect(report.manifest.artifacts.map(({ value }) => value)).toEqual(['web', 'backend']);
    expect(report.manifest.capabilities.map(({ value }) => value)).toEqual([
      'network-service',
      'persistent-data',
      'collects-personal-data',
    ]);
    expect(report.findings
      .filter(({ checkId }) => !checkId.startsWith('launch-operations.'))
      .map(({ checkId, outcome, actionLevel }) => ({
        checkId,
        outcome,
        actionLevel,
      }))).toEqual([
      {
        checkId: 'launch-essentials.privacy-notice',
        outcome: 'passed',
        actionLevel: 'human-review-needed',
      },
    ]);
    expect(operationsOutcomes(report)).toMatchObject({
      'launch-operations.release-process': 'passed',
      'launch-operations.rollback-process': 'passed',
      'launch-operations.monitoring-response': 'passed',
      'launch-operations.health-check': 'passed',
      'launch-operations.backup-restore': 'passed',
      'launch-operations.maintenance-ownership': 'passed',
    });
    expect(report.checkExecutions.find(({ checkId }) => checkId === 'secret-exposure.scan')).toMatchObject({
      status: 'completed',
      findingIds: [],
    });
    expect(report.partial).toBe(true);
    expect(report.coverageGaps.map(({ id }) => id)).toEqual([
      'domain.performance-cost',
      'domain.product-ux',
    ]);
  });

  it.each(['before', 'after'] as const)('%s server binds to loopback by default', async (stage) => {
    const startServer = await loadStartServer(stage);
    const server = startServer({ port: 0 });

    try {
      await once(server, 'listening');
      const address = server.address();
      expect(address).not.toBeNull();
      expect(typeof address === 'string' ? address : address?.address).toBe('127.0.0.1');
    } finally {
      await closeServer(server);
    }
  });
});
