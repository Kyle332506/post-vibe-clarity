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

const proseMonitoringEvidence = `# Monitoring and incident response

Alerts for application errors and failed requests are reviewed in Grafana by SRE within 10 minutes.
The SRE triages affected failures first and investigates the incident.
`;

const jsonMonitoringEvidence = JSON.stringify({
  observedSignals: ['application errors', 'failed requests'],
  reviewLocation: 'Grafana monitoring dashboard',
  notificationExpectation: 'SRE reviews alerts within 10 minutes.',
  firstResponse: 'Triage the alert and investigate failures.',
  owner: 'SRE team',
}, null, 2);

const yamlMonitoringEvidence = `observed_signals: application errors and failed requests
review_location: Grafana monitoring dashboard
notification_expectation: SRE reviews alerts within 10 minutes
first_response: triage the alert and investigate failures
owner: SRE team
`;

const tomlMonitoringEvidence = `observed_signals = ["application errors", "failed requests"]
review_location = "Grafana monitoring dashboard"
notification_expectation = "SRE reviews alerts within 10 minutes"
first_response = "triage the alert and investigate failures"
owner = "SRE team"
`;

const multilineTomlMonitoringEvidence = `observed_signals = [
  "application errors # primary, [edge]",
  "failed requests",
]
review_location = "Grafana monitoring dashboard"
notification_expectation = "SRE reviews alerts within 10 minutes"
first_response = "triage the alert and investigate failures"
owner = "SRE team"
`;

const compactJsonAdjacentMonitoringEvidence = JSON.stringify({
  observedSignals: [],
  reviewLocation: '',
  notificationExpectation: 'TBD',
  firstResponse: 'none',
  owner: 'none',
  unrelated: [
    'application errors',
    'Grafana monitoring dashboard',
    'SRE reviews alerts within 10 minutes',
    'triage the alert and investigate failures',
    'SRE team',
  ],
});

const yamlAdjacentMonitoringEvidence = `observed_signals: []
review_location:
notification_expectation: TBD
first_response: none
owner: none
unrelated:
  - application errors
  - Grafana monitoring dashboard
  - SRE reviews alerts within 10 minutes
  - triage the alert and investigate failures
  - SRE team
`;

const tomlAdjacentMonitoringEvidence = `observed_signals = []
review_location = ""
notification_expectation = "TBD"
first_response = "none"
owner = "none"
unrelated = [
  "application errors",
  "Grafana monitoring dashboard",
  "SRE reviews alerts within 10 minutes",
  "triage the alert and investigate failures",
  "SRE team",
]
`;

const jsonNestedMonitoringEvidence = JSON.stringify({
  observedSignals: [],
  reviewLocation: '',
  notificationExpectation: 'TBD',
  firstResponse: 'none',
  owner: 'none',
  unrelated: {
    observedSignals: ['application errors', 'failed requests'],
    reviewLocation: 'Grafana monitoring dashboard',
    notificationExpectation: 'SRE reviews alerts within 10 minutes',
    firstResponse: 'triage the alert and investigate failures',
    owner: 'SRE team',
  },
});

const yamlNestedMonitoringEvidence = `observed_signals: []
review_location: ''
notification_expectation: TBD
first_response: none
owner: none
unrelated:
  observed_signals: [application errors, failed requests]
  review_location: Grafana monitoring dashboard
  notification_expectation: SRE reviews alerts within 10 minutes
  first_response: triage the alert and investigate failures
  owner: SRE team
`;

const jsonLookalikeOwnerMonitoringEvidence = JSON.stringify({
  observedSignals: ['application errors'],
  reviewLocation: 'Grafana monitoring dashboard',
  notificationExpectation: 'SRE reviews alerts within 10 minutes',
  firstResponse: 'triage the alert and investigate failures',
  owner: 'none',
  'o_w n-e_r': 'SRE team',
});

const tomlCommentBorrowingEvidence = `observed_signals = [] # application errors
review_location = "" # Grafana monitoring dashboard
notification_expectation = "" # SRE reviews alerts within 10 minutes
first_response = "" # triage the alert and investigate failures
owner = "" # SRE team
`;

const tomlMalformedMonitoringEvidence = `observed_signals = ["application errors"
review_location = "Grafana monitoring dashboard"
notification_expectation = "SRE reviews alerts within 10 minutes
first_response = "triage the alert and investigate failures"
owner = "SRE team"
`;

const tomlUnrelatedTableMonitoringEvidence = `observed_signals = []
review_location = ""
notification_expectation = "TBD"
first_response = "none"
owner = "none"

[unrelated]
observed_signals = ["application errors", "failed requests"]
review_location = "Grafana monitoring dashboard"
notification_expectation = "SRE reviews alerts within 10 minutes"
first_response = "triage the alert and investigate failures"
owner = "SRE team"
`;

const tomlLookalikeOwnerMonitoringEvidence = `observed_signals = ["application errors"]
review_location = "Grafana monitoring dashboard"
notification_expectation = "SRE reviews alerts within 10 minutes"
first_response = "triage the alert and investigate failures"
owner = "none"
o_w n-e_r = "SRE team"
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
    "The '24 launch remains active.\nRollback is impossible.\n",
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

  it.each([
    ['an ASCII single quote after introductory prose', "The guide says, '\nRollback is impossible.\n'\n"],
    ['a second double quote after an earlier inline quote', 'The guide calls this "an example" and then says "\nThere is no rollback path.\n"\n'],
  ])('keeps rollback risk inside %s unverified', async (_description, evidence) => {
    const root = await createRepository({ 'docs/operations/rollback-and-recovery.md': evidence });

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
    ['concrete prose', 'docs/operations/monitoring-and-incident-response.md', proseMonitoringEvidence],
    ['populated JSON fields', 'docs/operations/monitoring.json', jsonMonitoringEvidence],
    ['populated YAML fields', 'docs/operations/monitoring.yaml', yamlMonitoringEvidence],
    ['populated TOML fields', 'docs/operations/monitoring.toml', tomlMonitoringEvidence],
    ['a populated multiline TOML array', 'docs/operations/monitoring.toml', multilineTomlMonitoringEvidence],
  ])('accepts %s monitoring evidence without relying on Markdown labels or lists', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.passed',
      outcome: 'passed',
      evidenceConfidence: 'confirmed',
    });
  });

  it.each([
    ['compact JSON', 'docs/operations/monitoring.json', compactJsonAdjacentMonitoringEvidence],
    ['multiline YAML', 'docs/operations/monitoring.yaml', yamlAdjacentMonitoringEvidence],
    ['multiline TOML', 'docs/operations/monitoring.toml', tomlAdjacentMonitoringEvidence],
  ])('does not borrow monitoring evidence from unrelated fields in %s', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidenceConfidence: 'insufficient',
    });
  });

  it.each([
    ['nested JSON aliases', 'docs/operations/monitoring.json', jsonNestedMonitoringEvidence],
    ['nested YAML aliases', 'docs/operations/monitoring.yaml', yamlNestedMonitoringEvidence],
    ['a look-alike JSON owner alias', 'docs/operations/monitoring.json', jsonLookalikeOwnerMonitoringEvidence],
    ['YAML syntax with a JSON extension', 'docs/operations/monitoring.json', yamlMonitoringEvidence],
    ['TOML comments', 'docs/operations/monitoring.toml', tomlCommentBorrowingEvidence],
    ['malformed TOML values', 'docs/operations/monitoring.toml', tomlMalformedMonitoringEvidence],
    ['an unrelated TOML table', 'docs/operations/monitoring.toml', tomlUnrelatedTableMonitoringEvidence],
    ['a look-alike TOML owner alias', 'docs/operations/monitoring.toml', tomlLookalikeOwnerMonitoringEvidence],
  ])('keeps hostile structured monitoring evidence unverified for %s', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidenceConfidence: 'insufficient',
    });
  });

  it.each([
    ['a leading empty TOML array element', tomlMonitoringEvidence.replace('["application errors", "failed requests"]', '[, "application errors"]')],
    ['a double empty TOML array element', tomlMonitoringEvidence.replace('["application errors", "failed requests"]', '["application errors",,]')],
    ['an unclosed TOML array', tomlMonitoringEvidence.replace('["application errors", "failed requests"]', '["application errors",')],
    ['an unclosed TOML string', tomlMonitoringEvidence.replace('owner = "SRE team"', 'owner = "SRE team')],
    ['an unknown TOML basic-string escape', tomlMonitoringEvidence.replace('SRE team', String.raw`SRE\q team`)],
    ['an incomplete TOML Unicode escape', tomlMonitoringEvidence.replace('SRE team', String.raw`SRE\u12 team`)],
    ['an invalid TOML Unicode scalar escape', tomlMonitoringEvidence.replace('SRE team', String.raw`SRE\uD800 team`)],
    ['a duplicate exact TOML key', `${tomlMonitoringEvidence}owner = "SRE team"\n`],
    ['a duplicate case-folded TOML key', `${tomlMonitoringEvidence}OWNER = "SRE team"\n`],
    ['a duplicate approved TOML alias', `${tomlMonitoringEvidence}observedSignals = ["application errors"]\n`],
  ])('keeps malformed or duplicate top-level TOML evidence unverified for %s', async (_description, evidence) => {
    const root = await createRepository({ 'docs/operations/monitoring.toml': evidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidenceConfidence: 'insufficient',
    });
  });

  it.each([
    ['an exact duplicate JSON key', 'docs/operations/monitoring.json', jsonMonitoringEvidence.replace('"owner": "SRE team"', '"owner": "none",\n  "owner": "SRE team"')],
    ['a case-folded duplicate JSON key', 'docs/operations/monitoring.json', jsonMonitoringEvidence.replace('"owner": "SRE team"', '"owner": "SRE team",\n  "OWNER": "SRE team"')],
    ['alternate approved JSON aliases', 'docs/operations/monitoring.json', jsonMonitoringEvidence.replace('"owner": "SRE team"', '"owner": "SRE team",\n  "incident_owner": "SRE team"')],
    ['an exact duplicate YAML key', 'docs/operations/monitoring.yaml', yamlMonitoringEvidence.replace('owner: SRE team', 'owner: none\nowner: SRE team')],
    ['a case-folded duplicate YAML key', 'docs/operations/monitoring.yaml', yamlMonitoringEvidence.replace('owner: SRE team', 'owner: SRE team\nOWNER: SRE team')],
    ['alternate approved YAML aliases', 'docs/operations/monitoring.yaml', yamlMonitoringEvidence.replace('owner: SRE team', 'owner: SRE team\nincident_owner: SRE team')],
  ])('keeps duplicate approved structured keys unverified for %s', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      evidenceConfidence: 'insufficient',
    });
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
    `# Monitoring and incident response

Signals: application errors.
Review location: Grafana monitoring dashboard.
Notification expectation: SRE reviews alerts within 10 minutes.
1. Review the situation.
Owner: SRE team.
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
