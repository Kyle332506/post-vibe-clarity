import { cp, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Domain } from '../../src/model/finding.js';
import type { ReadinessReport } from '../../src/model/report.js';
import {
  foundationCheckImplementations,
  runReview,
} from '../../src/orchestrator/run-review.js';
import { renderJson } from '../../src/report/render-json.js';
import { renderMarkdown } from '../../src/report/render-markdown.js';

const fixture = (name: string) => fileURLToPath(new URL(`../../fixtures/${name}`, import.meta.url));
const skillsRoot = fileURLToPath(new URL('../../skills', import.meta.url));
const fixedTimestamp = '2026-08-20T12:00:00.000Z';
const disclaimer = 'This report reduces uncertainty by recording checks and evidence. It does not certify that the application is production ready, secure, compliant, or free of defects.';

const launchCheckIds = [
  'launch-operations.backup-restore',
  'launch-operations.health-check',
  'launch-operations.maintenance-ownership',
  'launch-operations.monitoring-response',
  'launch-operations.release-process',
  'launch-operations.rollback-process',
] as const;

const expectedDomains: Record<typeof launchCheckIds[number], readonly Domain[]> = {
  'launch-operations.backup-restore': ['data-correctness', 'reliability-recovery'],
  'launch-operations.health-check': ['reliability-recovery', 'operations-observability'],
  'launch-operations.maintenance-ownership': ['maintainability-change-safety'],
  'launch-operations.monitoring-response': ['operations-observability'],
  'launch-operations.release-process': ['release-delivery'],
  'launch-operations.rollback-process': ['reliability-recovery', 'release-delivery'],
};

const verifiedOperationsEvidence: Record<string, string> = {
  'release-and-deployment.md': `# Release and deployment

Artifact: the backend service.
Target: production environment.
Prerequisites: obtain the approved release revision and required access through the documented credential process.
1. Build the release artifact.
2. Publish it to the production target.
Verification: run the documented smoke test and confirm the expected version.
Owner: Release Maintainer.
`,
  'rollback-and-recovery.md': `# Rollback and recovery

Trigger: roll back when the release health verification fails.
Decision owner: Incident Lead.
1. Stop the rollout.
2. Restore the previously approved version.
Verification: repeat the health verification and confirm the expected version.
`,
  'monitoring-and-incident-response.md': `# Monitoring and incident response

Signals: application errors and failed requests.
Review location: the configured monitoring dashboard.
Notification expectation: the maintainer reviews a new high-severity alert promptly.
1. Triage the affected release and capture the failure time.
2. Follow the rollback guide when impact continues.
Owner: On-call Maintainer.
`,
  'health-check.md': `# Health check

Probe: GET /health.
Healthy result: HTTP 200 with status ok.
Coverage: the probe checks process availability but does not verify every dependency.
Failure handling: the monitoring system notifies the on-call maintainer.
Owner: On-call Maintainer.
`,
  'backup-and-restore.md': `# Backup and restore

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
`,
};

function launchExecutions(report: ReadinessReport) {
  return report.checkExecutions.filter(({ checkId }) => checkId.startsWith('launch-operations.'));
}

function launchFindings(report: ReadinessReport) {
  return report.findings.filter(({ checkId }) => checkId.startsWith('launch-operations.'));
}

describe('launch operations acceptance', () => {
  let webDataReport: ReadinessReport;
  let cliReport: ReadinessReport;
  let oneUnverifiedReport: ReadinessReport;
  let temporaryRoot: string;

  beforeAll(async () => {
    temporaryRoot = await mkdtemp(join(tmpdir(), 'postvibe-launch-operations-acceptance-'));
    await cp(fixture('operations-backend'), temporaryRoot, { recursive: true });
    const operationsRoot = join(temporaryRoot, 'docs', 'operations');
    await mkdir(operationsRoot, { recursive: true });
    await Promise.all(Object.entries(verifiedOperationsEvidence).map(([name, contents]) => (
      writeFile(join(operationsRoot, name), contents)
    )));

    [webDataReport, cliReport, oneUnverifiedReport] = await Promise.all([
      runReview({ root: fixture('operations-backend'), skillsRoot, now: () => fixedTimestamp }),
      runReview({ root: fixture('cli-clean'), skillsRoot, now: () => fixedTimestamp }),
      runReview({ root: temporaryRoot, skillsRoot, now: () => fixedTimestamp }),
    ]);
  });

  afterAll(async () => {
    await rm(temporaryRoot, { recursive: true, force: true });
  });

  it('registers the six checks in stable ordinal order with Level 0 filesystem-read-only access', () => {
    const launchRegistrations = foundationCheckImplementations.filter(
      ({ id }) => id.startsWith('launch-operations.'),
    );

    expect(launchRegistrations.map(({ id }) => id)).toEqual(launchCheckIds);
    expect(launchRegistrations.map(({ actionLevel, requiredAccess }) => ({ actionLevel, requiredAccess }))).toEqual(
      launchCheckIds.map(() => ({ actionLevel: 0, requiredAccess: ['filesystem-read'] })),
    );
  });

  it('runs every check with its exact implementation domains for a web data service', () => {
    expect(webDataReport.manifest.artifacts.map(({ value }) => value)).toContain('backend');
    expect(webDataReport.manifest.capabilities.map(({ value }) => value)).toEqual(
      expect.arrayContaining(['network-service', 'persistent-data']),
    );
    expect(launchExecutions(webDataReport).map(({ checkId, domains }) => ({ checkId, domains }))).toEqual(
      launchCheckIds.map((checkId) => ({ checkId, domains: expectedDomains[checkId] })),
    );
    expect(launchFindings(webDataReport).map(({ checkId, outcome }) => ({ checkId, outcome }))).toEqual(
      launchCheckIds.map((checkId) => ({ checkId, outcome: 'unverified' })),
    );
  });

  it('routes all six checks for a CLI and marks only the shape-dependent checks not applicable', () => {
    expect(cliReport.manifest.artifacts.map(({ value }) => value)).toEqual(['cli']);
    expect(launchFindings(cliReport).map(({ checkId, outcome }) => ({ checkId, outcome }))).toEqual([
      { checkId: 'launch-operations.backup-restore', outcome: 'not-applicable' },
      { checkId: 'launch-operations.health-check', outcome: 'not-applicable' },
      { checkId: 'launch-operations.maintenance-ownership', outcome: 'unverified' },
      { checkId: 'launch-operations.monitoring-response', outcome: 'not-applicable' },
      { checkId: 'launch-operations.release-process', outcome: 'unverified' },
      { checkId: 'launch-operations.rollback-process', outcome: 'unverified' },
    ]);
  });

  it('keeps one applicable unverified check partial without preventing the other checks from completing', () => {
    expect(launchExecutions(oneUnverifiedReport).map(({ checkId, status }) => ({ checkId, status }))).toEqual([
      { checkId: 'launch-operations.backup-restore', status: 'completed' },
      { checkId: 'launch-operations.health-check', status: 'completed' },
      { checkId: 'launch-operations.maintenance-ownership', status: 'unverified' },
      { checkId: 'launch-operations.monitoring-response', status: 'completed' },
      { checkId: 'launch-operations.release-process', status: 'completed' },
      { checkId: 'launch-operations.rollback-process', status: 'completed' },
    ]);
    expect(oneUnverifiedReport.coverageGaps).toContainEqual(expect.objectContaining({
      checkId: 'launch-operations.maintenance-ownership',
      status: 'unverified',
    }));
    expect(oneUnverifiedReport.partial).toBe(true);
  });

  it('renders repository-only evidence boundaries and the exact disclaimer in Markdown and JSON', () => {
    const markdown = renderMarkdown(oneUnverifiedReport);
    const json = renderJson(oneUnverifiedReport);
    const parsed = JSON.parse(json) as ReadinessReport;
    const repositoryBoundary = 'No matching versioned operations evidence was available.';

    expect(markdown).toContain(repositoryBoundary);
    expect(json).toContain(repositoryBoundary);
    expect(parsed.disclaimer).toBe(disclaimer);
    expect(markdown.endsWith(`${disclaimer}\n`)).toBe(true);
  });
});
