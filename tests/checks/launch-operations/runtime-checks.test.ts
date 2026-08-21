import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { monitoringResponseCheck } from '../../../src/checks/launch-operations/monitoring-response.js';
import { rollbackProcessCheck } from '../../../src/checks/launch-operations/rollback-process.js';
import type { ArtifactType, CapabilityManifest, Detection } from '../../../src/model/capability.js';

const temporaryRoots: string[] = [];

const rollbackEvidence = `# Rollback and recovery

Trigger: roll back when the release health verification fails.
Decision owner: Incident Lead.
1. Stop the rollout.
2. Restore the previously approved version.
Verification: repeat the health verification and confirm the expected version.
`;

const monitoringEvidence = `# Monitoring and incident response

Signals: application errors and failed requests.
Review location: the configured monitoring dashboard.
Notification expectation: the maintainer reviews a new high-severity alert promptly.
1. Triage the affected release and capture the failure time.
2. Follow the rollback guide when impact continues.
Owner: On-call Maintainer.
`;

const mobileMonitoringEvidence = `# Crash and incident response

Signals: crash reports and application exceptions.
Review location: the configured crash-reporting dashboard.
Notification expectation: the maintainer reviews a new high-severity alert promptly.
1. Triage the affected release and capture the failure time.
2. Ship a corrective release when impact continues.
Owner: Mobile Incident Maintainer.
`;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-runtime-operations-check-'));
  temporaryRoots.push(root);
  await Promise.all(Object.entries(files).map(async ([location, contents]) => {
    const path = join(root, location);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }));
  return root;
}

function manifest(artifacts: ArtifactType[] = []): CapabilityManifest {
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
    capabilities: [],
  };
}

describe('rollbackProcessCheck', () => {
  it('accepts service recovery evidence and records the repository-only boundary', async () => {
    const root = await createRepository({ 'docs/operations/rollback-and-recovery.md': rollbackEvidence });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.rollback-process.passed',
      outcome: 'passed',
      actionLevel: 'resolve-before-launch',
      domains: ['reliability-recovery', 'release-delivery'],
      evidenceConfidence: 'confirmed',
      humanReviewRequired: false,
      unverifiedBoundaries: ['No release was changed and no recovery procedure was run.'],
    });
  });

  it('accepts mobile rollout recovery without requiring an instant app-store rollback', async () => {
    const root = await createRepository({ 'docs/operations/rollback-and-recovery.md': rollbackEvidence });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['mobile']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.rollback-process.passed',
      outcome: 'passed',
      evidenceConfidence: 'confirmed',
    });
  });

  it.each([
    ['cli', ['cli'] as ArtifactType[], `# Rollback and recovery

Trigger: withdraw a release when verification fails.
Decision owner: Package Maintainer.
1. Deprecate the affected package version.
2. Publish a corrective release.
Verification: confirm the replacement version is available.
`],
    ['library', ['library'] as ArtifactType[], `# Rollback and recovery

Trigger: withdraw a release when verification fails.
Decision owner: Library Maintainer.
1. Deprecate the affected package version.
2. Publish a corrective release.
Verification: confirm the replacement version is available.
`],
  ])('accepts the package recovery mechanism for a %s', async (_shape, artifacts, evidence) => {
    const root = await createRepository({ 'docs/operations/rollback-and-recovery.md': evidence });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(artifacts) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    'There is no rollback path.',
    'Rollback is impossible.',
    'We do not have a recovery path.',
  ])('reports a likely issue for the affirmative risky statement %j', async (riskyStatement) => {
    const root = await createRepository({ 'docs/operations/rollback-and-recovery.md': riskyStatement });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.rollback-process.likely-issue',
      outcome: 'likely-issue',
      actionLevel: 'stop-before-launch',
      humanReviewRequired: true,
    });
  });

  it.each([
    'Rollback is impossible?',
    '"Rollback is impossible."',
    'The incident guide asks whether rollback is impossible.',
    'What happens if there is no rollback path?',
  ])('does not treat a question, quotation, or discussion as affirmative risky evidence: %j', async (statement) => {
    const root = await createRepository({ 'docs/operations/rollback-and-recovery.md': statement });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.rollback-process.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
    });
  });

  it('does not accept a service rollback heading and generic procedure without a recovery mechanism', async () => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': `# Rollback and recovery

Trigger: respond when release health verification fails.
Decision owner: Incident Lead.
1. Notify the incident lead.
Verification: confirm the response was recorded.
`,
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.rollback-process.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidenceConfidence: 'insufficient',
    });
  });

  it('keeps missing rollback evidence unverified instead of inferring a likely issue', async () => {
    const root = await createRepository({ 'README.md': 'Project overview.\n' });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.rollback-process.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidence: [],
      humanReviewRequired: true,
    });
  });
});

describe('monitoringResponseCheck', () => {
  it('accepts service monitoring and incident-response evidence with the live boundary', async () => {
    const root = await createRepository({ 'docs/operations/monitoring-and-incident-response.md': monitoringEvidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.passed',
      outcome: 'passed',
      actionLevel: 'resolve-before-launch',
      domains: ['operations-observability'],
      evidenceConfidence: 'confirmed',
      humanReviewRequired: false,
      unverifiedBoundaries: ['No provider was queried and no alert delivery or response was tested.'],
    });
  });

  it('accepts mobile crash-reporting and incident-response evidence', async () => {
    const root = await createRepository({ 'docs/operations/monitoring-and-incident-response.md': mobileMonitoringEvidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['mobile']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    `# Monitoring and incident response

Signals:
Review location:
Notification expectation:
1. Respond later.
Owner:
`,
    `# Monitoring and incident response

Signals: TBD.
Review location: TBD.
Notification expectation: TBD.
1. Read the documentation.
Owner: TBD.
`,
  ])('does not accept headings or vague placeholders as usable monitoring evidence', async (evidence) => {
    const root = await createRepository({ 'docs/operations/monitoring-and-incident-response.md': evidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidenceConfidence: 'insufficient',
    });
  });

  it.each([
    ['CLI', ['cli'] as ArtifactType[]],
    ['library', ['library'] as ArtifactType[]],
  ])('is not applicable to a %s without a runtime service', async (_shape, artifacts) => {
    const [finding] = await monitoringResponseCheck.run({
      root: '/path-that-does-not-exist',
      manifest: manifest(artifacts),
    });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.not-applicable',
      outcome: 'not-applicable',
      evidence: [],
      humanReviewRequired: false,
    });
  });

  it('keeps monitoring unverified when the project shape is ambiguous', async () => {
    const root = await createRepository({ 'docs/operations/monitoring-and-incident-response.md': monitoringEvidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest() });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.unverified',
      outcome: 'unverified',
      evidence: [],
      evidenceConfidence: 'insufficient',
      humanReviewRequired: true,
    });
  });
});
