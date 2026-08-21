import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { backupRestoreCheck } from '../../../src/checks/launch-operations/backup-restore.js';
import { healthCheck } from '../../../src/checks/launch-operations/health-check.js';
import { maintenanceOwnershipCheck } from '../../../src/checks/launch-operations/maintenance-ownership.js';
import { monitoringResponseCheck } from '../../../src/checks/launch-operations/monitoring-response.js';
import { releaseProcessCheck } from '../../../src/checks/launch-operations/release-process.js';
import { rollbackProcessCheck } from '../../../src/checks/launch-operations/rollback-process.js';
import type { ArtifactType, CapabilityManifest, Detection } from '../../../src/model/capability.js';

const temporaryRoots: string[] = [];

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createRepository(location: string, content: string): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-owner-evidence-'));
  temporaryRoots.push(root);
  const path = join(root, location);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, content);
  return root;
}

function manifest(artifacts: ArtifactType[], capabilities: string[] = []): CapabilityManifest {
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

type EvidenceDocument = { format: string; location: string; content: string };

function releaseDocuments(owner: string): EvidenceDocument[] {
  const values = {
    artifact: 'web service container image',
    target: 'production environment',
    prerequisites: 'obtain the approved revision and required access through the documented credential process',
    procedure: ['build the selected output from the approved revision', 'publish the selected output to the documented destination'],
    verification: 'run the documented smoke test and confirm the expected version',
    owner,
  };
  return [
    { format: 'Markdown', location: 'docs/operations/release.md', content: `Artifact: ${values.artifact}.\nTarget: ${values.target}.\nPrerequisites: ${values.prerequisites}.\n1. ${values.procedure[0]}.\n2. ${values.procedure[1]}.\nVerification: ${values.verification}.\nOwner: ${owner}.\n` },
    { format: 'JSON', location: 'docs/operations/release.json', content: JSON.stringify(values) },
    { format: 'YAML', location: 'docs/operations/release.yaml', content: `artifact: ${values.artifact}\ntarget: ${values.target}\nprerequisites: ${values.prerequisites}\nprocedure: [${values.procedure.join(', ')}]\nverification: ${values.verification}\nowner: ${owner}\n` },
    { format: 'TOML', location: 'docs/operations/release.toml', content: `artifact = ${JSON.stringify(values.artifact)}\ntarget = ${JSON.stringify(values.target)}\nprerequisites = ${JSON.stringify(values.prerequisites)}\nprocedure = [${values.procedure.map((value) => JSON.stringify(value)).join(', ')}]\nverification = ${JSON.stringify(values.verification)}\nowner = ${JSON.stringify(owner)}\n` },
  ];
}

function rollbackDocuments(owner: string): EvidenceDocument[] {
  const values = {
    trigger: 'roll back when the release health verification fails',
    decisionOwner: owner,
    procedure: ['stop traffic to the affected release', 'restore the previously approved version'],
    recoveryMechanism: 'restore the previously approved version',
    verification: 'repeat the health verification and confirm the expected version',
  };
  return [
    { format: 'Markdown', location: 'docs/operations/rollback.md', content: `Trigger: ${values.trigger}.\nDecision owner: ${owner}.\n1. ${values.procedure[0]}.\n2. ${values.procedure[1]}.\nVerification: ${values.verification}.\n` },
    { format: 'JSON', location: 'docs/operations/rollback.json', content: JSON.stringify(values) },
    { format: 'YAML', location: 'docs/operations/rollback.yaml', content: `trigger: ${values.trigger}\ndecision_owner: ${owner}\nprocedure: [${values.procedure.join(', ')}]\nrecovery_mechanism: ${values.recoveryMechanism}\nverification: ${values.verification}\n` },
    { format: 'TOML', location: 'docs/operations/rollback.toml', content: `trigger = ${JSON.stringify(values.trigger)}\ndecision_owner = ${JSON.stringify(owner)}\nprocedure = [${values.procedure.map((value) => JSON.stringify(value)).join(', ')}]\nrecovery_mechanism = ${JSON.stringify(values.recoveryMechanism)}\nverification = ${JSON.stringify(values.verification)}\n` },
  ];
}

function maintenanceDocuments(owner: string): EvidenceDocument[] {
  const values = {
    owner,
    supportRoute: 'report user problems through repository issues',
    reviewCadence: 'review dependency and platform updates every month',
    handoff: 'update this guide and CODEOWNERS before the responsible team changes',
  };
  return [
    { format: 'Markdown', location: 'docs/operations/ownership.md', content: `Owner: ${owner}.\nSupport route: ${values.supportRoute}.\nReview cadence: ${values.reviewCadence}.\nHandoff: ${values.handoff}.\n` },
    { format: 'JSON', location: 'docs/operations/ownership.json', content: JSON.stringify(values) },
    { format: 'YAML', location: 'docs/operations/ownership.yaml', content: `owner: ${owner}\nsupport_route: ${values.supportRoute}\nreview_cadence: ${values.reviewCadence}\nhandoff: ${values.handoff}\n` },
    { format: 'TOML', location: 'docs/operations/ownership.toml', content: `owner = ${JSON.stringify(owner)}\nsupport_route = ${JSON.stringify(values.supportRoute)}\nreview_cadence = ${JSON.stringify(values.reviewCadence)}\nhandoff = ${JSON.stringify(values.handoff)}\n` },
  ];
}

function monitoringDocuments(owner: string): EvidenceDocument[] {
  const values = {
    observedSignals: 'application errors and failed requests',
    reviewLocation: 'the configured monitoring dashboard',
    notificationExpectation: 'the maintainer reviews a new high-severity alert promptly',
    firstResponse: 'triage the affected release and capture the failure time',
    owner,
  };
  return [
    { format: 'Markdown', location: 'docs/operations/monitoring.md', content: `Signals: ${values.observedSignals}.\nReview location: ${values.reviewLocation}.\nNotification expectation: ${values.notificationExpectation}.\n1. ${values.firstResponse}.\nOwner: ${owner}.\n` },
    { format: 'JSON', location: 'docs/operations/monitoring.json', content: JSON.stringify(values) },
    { format: 'YAML', location: 'docs/operations/monitoring.yaml', content: `observed_signals: ${values.observedSignals}\nreview_location: ${values.reviewLocation}\nnotification_expectation: ${values.notificationExpectation}\nfirst_response: ${values.firstResponse}\nowner: ${owner}\n` },
    { format: 'TOML', location: 'docs/operations/monitoring.toml', content: `observed_signals = ${JSON.stringify(values.observedSignals)}\nreview_location = ${JSON.stringify(values.reviewLocation)}\nnotification_expectation = ${JSON.stringify(values.notificationExpectation)}\nfirst_response = ${JSON.stringify(values.firstResponse)}\nowner = ${JSON.stringify(owner)}\n` },
  ];
}

function healthDocuments(owner: string): EvidenceDocument[] {
  const values = {
    probe: 'GET /health',
    healthyResult: 'HTTP 200 with status ok',
    coverage: 'process availability only; does not verify every dependency',
    failureHandling: 'monitoring notifies the on-call maintainer',
    owner,
  };
  return [
    { format: 'Markdown', location: 'docs/operations/health-check.md', content: `Probe: ${values.probe}.\nHealthy result: ${values.healthyResult}.\nCoverage: ${values.coverage}.\nFailure handling: ${values.failureHandling}.\nOwner: ${owner}.\n` },
    { format: 'JSON', location: 'docs/operations/health-check.json', content: JSON.stringify(values) },
    { format: 'YAML', location: 'docs/operations/health-check.yaml', content: `probe: ${values.probe}\nhealthy_result: ${values.healthyResult}\ncoverage: ${values.coverage}\nfailure_handling: ${values.failureHandling}\nowner: ${owner}\n` },
    { format: 'TOML', location: 'docs/operations/health-check.toml', content: `probe = ${JSON.stringify(values.probe)}\nhealthy_result = ${JSON.stringify(values.healthyResult)}\ncoverage = ${JSON.stringify(values.coverage)}\nfailure_handling = ${JSON.stringify(values.failureHandling)}\nowner = ${JSON.stringify(owner)}\n` },
  ];
}

function backupDocuments(owner: string): EvidenceDocument[] {
  const values = {
    data: 'primary application database',
    backupMechanism: 'provider-managed encrypted snapshots',
    frequency: 'every 24 hours',
    retention: '30 days',
    restoreSteps: ['select an approved snapshot', 'restore using the provider procedure'],
    recoveryTimeExpectation: 'four hours',
    owner,
    failureNotification: 'backup-job failures notify the owner',
    restoreTesting: 'test quarterly in a recovery environment',
    boundaries: 'live configuration and credentials are not stored here',
  };
  return [
    { format: 'Markdown', location: 'docs/operations/backup-and-restore.md', content: `Data: ${values.data}.\nBackup mechanism: ${values.backupMechanism}.\nFrequency: ${values.frequency}.\nRetention: ${values.retention}.\n1. ${values.restoreSteps[0]}.\n2. ${values.restoreSteps[1]}.\nRecovery time expectation: ${values.recoveryTimeExpectation}.\nOwner: ${owner}.\nFailure notification: ${values.failureNotification}.\nRestore testing: ${values.restoreTesting}.\nBoundaries: ${values.boundaries}.\n` },
    { format: 'JSON', location: 'docs/operations/backup-and-restore.json', content: JSON.stringify(values) },
    { format: 'YAML', location: 'docs/operations/backup-and-restore.yaml', content: `data: ${values.data}\nbackup_mechanism: ${values.backupMechanism}\nfrequency: ${values.frequency}\nretention: ${values.retention}\nrestore_steps: [${values.restoreSteps.join(', ')}]\nrecovery_time_expectation: ${values.recoveryTimeExpectation}\nowner: ${owner}\nfailure_notification: ${values.failureNotification}\nrestore_testing: ${values.restoreTesting}\nboundaries: ${values.boundaries}\n` },
    { format: 'TOML', location: 'docs/operations/backup-and-restore.toml', content: `data = ${JSON.stringify(values.data)}\nbackup_mechanism = ${JSON.stringify(values.backupMechanism)}\nfrequency = ${JSON.stringify(values.frequency)}\nretention = ${JSON.stringify(values.retention)}\nrestore_steps = [${values.restoreSteps.map((value) => JSON.stringify(value)).join(', ')}]\nrecovery_time_expectation = ${JSON.stringify(values.recoveryTimeExpectation)}\nowner = ${JSON.stringify(owner)}\nfailure_notification = ${JSON.stringify(values.failureNotification)}\nrestore_testing = ${JSON.stringify(values.restoreTesting)}\nboundaries = ${JSON.stringify(values.boundaries)}\n` },
  ];
}

const ownerChecks = [
  { name: 'release', check: releaseProcessCheck, artifacts: ['web'] as ArtifactType[], capabilities: [], credibleOwner: 'Release Maintainer', documents: releaseDocuments },
  { name: 'rollback', check: rollbackProcessCheck, artifacts: ['backend'] as ArtifactType[], capabilities: [], credibleOwner: 'Incident Lead', documents: rollbackDocuments },
  { name: 'maintenance', check: maintenanceOwnershipCheck, artifacts: ['web'] as ArtifactType[], capabilities: [], credibleOwner: 'Project Maintainers', documents: maintenanceDocuments },
  { name: 'monitoring', check: monitoringResponseCheck, artifacts: ['backend'] as ArtifactType[], capabilities: [], credibleOwner: 'SRE team', documents: monitoringDocuments },
  { name: 'health', check: healthCheck, artifacts: ['backend'] as ArtifactType[], capabilities: ['network-service'], credibleOwner: 'On-call Maintainer', documents: healthDocuments },
  { name: 'backup', check: backupRestoreCheck, artifacts: ['backend'] as ArtifactType[], capabilities: ['persistent-data'], credibleOwner: 'Data Recovery Maintainer', documents: backupDocuments },
] as const;

describe('shared owner evidence semantics', () => {
  const negativeCases = ownerChecks.flatMap((ownerCheck) => ownerCheck.documents('someone later').map((document) => ({ ownerCheck, document })));
  const positiveCases = ownerChecks.flatMap((ownerCheck) => ownerCheck.documents(ownerCheck.credibleOwner).map((document) => ({ ownerCheck, document })));

  it.each(negativeCases)('rejects an indefinite future owner for $ownerCheck.name $document.format evidence', async ({ ownerCheck, document }) => {
    const root = await createRepository(document.location, document.content);

    const [finding] = await ownerCheck.check.run({
      root,
      manifest: manifest([...ownerCheck.artifacts], [...ownerCheck.capabilities]),
    });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each(positiveCases)('accepts a durable owner for $ownerCheck.name $document.format evidence', async ({ ownerCheck, document }) => {
    const root = await createRepository(document.location, document.content);

    const [finding] = await ownerCheck.check.run({
      root,
      manifest: manifest([...ownerCheck.artifacts], [...ownerCheck.capabilities]),
    });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });
});
