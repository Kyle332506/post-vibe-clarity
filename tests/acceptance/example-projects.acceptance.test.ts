import { once } from 'node:events';
import type { Server } from 'node:http';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { runReview } from '../../src/orchestrator/run-review.js';

const example = (stage: 'before' | 'after') => fileURLToPath(
  new URL(`../../examples/launch-candidate/${stage}/`, import.meta.url),
);
const skillsRoot = fileURLToPath(new URL('../../skills/', import.meta.url));
const now = () => '2026-08-18T12:00:00.000Z';
const expectedCoverageGapIds = [
  'domain.data-correctness',
  'domain.maintainability-change-safety',
  'domain.operations-observability',
  'domain.performance-cost',
  'domain.product-ux',
  'domain.release-delivery',
  'domain.reliability-recovery',
];
type StartServer = (options?: { host?: string; port?: number }) => Server;

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

describe('launch candidate example projects', () => {
  it('shows the credential and missing privacy notice in the before project', async () => {
    const report = await runReview({ root: example('before'), skillsRoot, now });

    expect(report.manifest.artifacts.map(({ value }) => value)).toEqual(['web']);
    expect(report.manifest.capabilities.map(({ value }) => value)).toEqual(['collects-personal-data']);
    expect(report.findings.map(({ checkId, outcome, actionLevel }) => ({
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
    expect(report.partial).toBe(true);
    expect(report.coverageGaps.map(({ id }) => id)).toEqual(expectedCoverageGapIds);
  });

  it('resolves the two example findings without hiding remaining coverage gaps', async () => {
    const report = await runReview({ root: example('after'), skillsRoot, now });

    expect(report.manifest.artifacts.map(({ value }) => value)).toEqual(['web']);
    expect(report.manifest.capabilities.map(({ value }) => value)).toEqual(['collects-personal-data']);
    expect(report.findings.map(({ checkId, outcome, actionLevel }) => ({
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
    expect(report.checkExecutions.find(({ checkId }) => checkId === 'secret-exposure.scan')).toMatchObject({
      status: 'completed',
      findingIds: [],
    });
    expect(report.partial).toBe(true);
    expect(report.coverageGaps.map(({ id }) => id)).toEqual(expectedCoverageGapIds);
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
