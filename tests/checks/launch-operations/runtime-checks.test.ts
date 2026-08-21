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
    "The guide says: 'neath the canopy.\nRollback is impossible.\n",
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
    ['a content-bearing ASCII single quote after introductory prose', "The guide says, 'For example:\nRollback is impossible.\n'\n"],
    ['an unpunctuated content-bearing ASCII single quote', "The guide says 'Example follows\nRollback is impossible.\n'\n"],
    ['a plural possessive inside an ASCII single quote', "The guide says 'Teams' responsibilities:\nRollback is impossible.\n'\n"],
    ['a guillemet quote after introductory prose', 'The guide says, «For example:\nThere is no rollback path.\n»\n'],
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

  it('uses the ambiguous recovery profile for incompatible mixed artifacts', async () => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': `# Rollback and recovery

Trigger: withdraw a release when verification fails.
Decision owner: Package Maintainer.
1. Deprecate the affected package version.
2. Publish a corrective release.
Verification: confirm the replacement version is available.
`,
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['mobile', 'cli']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
    expect(finding?.applicability).toMatch(/every project shape/iu);
  });

  it.each([
    ['plain prose', 'docs/operations/rollback.txt', `Recovery starts when release health verification fails.
The Incident Lead is authorized to make the recovery decision.
The team stops traffic to the affected release and restores the previously approved version.
After recovery, the team repeats the health verification and confirms the expected version.
`],
    ['JSON', 'docs/operations/rollback.json', JSON.stringify({
      trigger: 'start recovery when release health verification fails',
      decisionOwner: 'Incident Lead',
      procedure: ['stop traffic to the affected release', 'restore the previously approved version'],
      recoveryMechanism: 'restore the previously approved version',
      verification: 'repeat the health verification and confirm the expected version',
    })],
    ['YAML', 'docs/operations/rollback.yaml', `trigger: start recovery when release health verification fails
decision_owner: Incident Lead
procedure:
  - stop traffic to the affected release
  - restore the previously approved version
recovery_mechanism: restore the previously approved version
verification: repeat the health verification and confirm the expected version
`],
    ['TOML', 'docs/operations/rollback.toml', `trigger = "start recovery when release health verification fails"
decision_owner = "Incident Lead"
procedure = ["stop traffic to the affected release", "restore the previously approved version"]
recovery_mechanism = "restore the previously approved version"
verification = "repeat the health verification and confirm the expected version"
`],
  ])('accepts credible %s rollback evidence', async (_format, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['trigger', 'Trigger: roll back when the release health verification fails.', 'Trigger: recovery condition TBD.'],
    ['decision owner', 'Decision owner: Incident Lead.', 'Decision owner: authorized owner unassigned.'],
    ['procedure', '1. Stop the rollout.\n2. Restore the previously approved version.', '1. TODO stop the rollout.\n2. TODO restore the previous version.'],
    ['mechanism', '2. Restore the previously approved version.', '2. Restore mechanism TBD.'],
    ['verification', 'Verification: repeat the health verification and confirm the expected version.', 'Verification: verify recovery TBD.'],
  ])('rejects a placeholder in the rollback %s field', async (_field, validLine, placeholderLine) => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': rollbackEvidence.replace(validLine, placeholderLine),
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['trigger', 'Trigger: roll back when the release health verification fails.', 'Trigger: ignore recovery when release health verification fails someday.'],
    ['decision owner', 'Decision owner: Incident Lead.', 'Decision owner: avoid the Incident Lead role someday.'],
    ['procedure', '1. Stop the rollout.\n2. Restore the previously approved version.', '1. Skip rollback actions someday.\n2. Avoid restore actions until a convenient time.'],
    ['mechanism', '2. Restore the previously approved version.', '2. Skip restore actions until a convenient time.'],
    ['verification', 'Verification: repeat the health verification and confirm the expected version.', 'Verification: skip the health check and confirm the expected recovery version someday.'],
  ])('rejects negative or vague rollback %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': rollbackEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['trigger', 'Trigger: roll back when the release health verification fails.', 'Trigger: we will ignore recovery when release health verification fails.'],
    ['decision owner', 'Decision owner: Incident Lead.', 'Decision owner: we cannot assign the Incident Lead.'],
    ['procedure', '1. Stop the rollout.\n2. Restore the previously approved version.', '1. Operators should skip rollback actions.\n2. The team will avoid restoring the previous version.'],
    ['mechanism', '2. Restore the previously approved version.', '2. The team will avoid restoring the previous version.'],
    ['verification', 'Verification: repeat the health verification and confirm the expected version.', 'Verification: we will ignore the health check and confirm the expected recovery version.'],
  ])('rejects subject-prefixed or modal-negative rollback %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': rollbackEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('accepts a recovery action that avoids impact by restoring the previous version', async () => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': rollbackEvidence.replace(
        '2. Restore the previously approved version.',
        '2. Avoid prolonged impact by restoring the previously approved version.',
      ),
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    '2. Cannot recover by restoring the previously approved version.',
    '2. Unable to recover by restoring the previously approved version.',
    '2. The team refuses to restore the previously approved version.',
    '2. The process fails to restore the previously approved version.',
    "2. The process doesn't restore the previously approved version.",
    "2. The process isn't able to restore the previously approved version.",
    "2. The team couldn't restore the previously approved version.",
    '2. Avoid using the restore action for the previously approved version.',
    '2. The process declines to restore the previously approved version.',
    '2. The process is incapable of restoring the previously approved version.',
    '2. It is impossible to restore the previously approved version.',
    '2. The process lacks the ability to restore the previously approved version.',
  ])('rejects structurally negative recovery evidence: %s', async (invalidLine) => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': rollbackEvidence.replace(
        '2. Restore the previously approved version.',
        invalidLine,
      ),
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    '2. The process is able to restore the previously approved version.',
    '2. Avoid prolonged impact using the documented step that restores the previously approved version.',
    '2. The process chooses to restore the previously approved version.',
    '2. The process is capable of restoring the previously approved version.',
    '2. It is possible to restore the previously approved version.',
    '2. The process has the ability to restore the previously approved version.',
  ])('accepts positive recovery wording: %s', async (validLine) => {
    const root = await createRepository({
      'docs/operations/rollback-and-recovery.md': rollbackEvidence.replace(
        '2. Restore the previously approved version.',
        validLine,
      ),
    });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['JSON', 'docs/operations/rollback.json', JSON.stringify({ trigger: 'recovery condition TBD', decisionOwner: 'authorized owner unassigned', procedure: ['TODO restore previous version'], recoveryMechanism: 'restore mechanism unknown', verification: 'verify recovery TBD' })],
    ['YAML', 'docs/operations/rollback.yaml', 'trigger: recovery condition TBD\ndecision_owner: authorized owner unassigned\nprocedure: [TODO restore previous version]\nrecovery_mechanism: restore mechanism unknown\nverification: verify recovery TBD\n'],
    ['TOML', 'docs/operations/rollback.toml', 'trigger = "recovery condition TBD"\ndecision_owner = "authorized owner unassigned"\nprocedure = ["TODO restore previous version"]\nrecovery_mechanism = "restore mechanism unknown"\nverification = "verify recovery TBD"\n'],
  ])('rejects placeholder-only rollback fields in %s', async (_format, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await rollbackProcessCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
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
    ['signals', 'Signals: application errors and failed requests.', 'Signals: application errors TODO.'],
    ['review location', 'Review location: the configured monitoring dashboard.', 'Review location: monitoring dashboard TBD.'],
    ['notification expectation', 'Notification expectation: the maintainer reviews a new high-severity alert promptly.', 'Notification expectation: maintainer reviews alert promptly TODO.'],
    ['first response', '1. Triage the affected release and capture the failure time.', '1. Triage the alert and investigate failures TODO.'],
    ['owner', 'Owner: On-call Maintainer.', 'Owner: On-call Maintainer TODO.'],
  ])('rejects a placeholder in the monitoring %s field', async (_field, validLine, placeholderLine) => {
    const root = await createRepository({
      'docs/operations/monitoring-and-incident-response.md': monitoringEvidence.replace(validLine, placeholderLine),
    });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('rejects a monitoring owner value that only decorates the maintainer label', async () => {
    const root = await createRepository({
      'docs/operations/monitoring-and-incident-response.md': monitoringEvidence.replace(
        'Owner: On-call Maintainer.',
        'Owner: documented maintainer.',
      ),
    });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['signals', 'Signals: application errors and failed requests.', 'Signals: ignore application errors and failed requests someday.'],
    ['review location', 'Review location: the configured monitoring dashboard.', 'Review location: avoid the monitoring dashboard someday.'],
    ['notification expectation', 'Notification expectation: the maintainer reviews a new high-severity alert promptly.', 'Notification expectation: skip reviewing alerts promptly someday.'],
    ['first response', '1. Triage the affected release and capture the failure time.', '1. Skip triage of alerts and investigate failures someday.'],
    ['owner', 'Owner: On-call Maintainer.', 'Owner: avoid the On-call Maintainer role someday.'],
  ])('rejects negative or vague monitoring %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/monitoring-and-incident-response.md': monitoringEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['signals', 'Signals: application errors and failed requests.', 'Signals: we ignore application errors and failed requests.'],
    ['review location', 'Review location: the configured monitoring dashboard.', 'Review location: the team will avoid the monitoring dashboard.'],
    ['notification expectation', 'Notification expectation: the maintainer reviews a new high-severity alert promptly.', 'Notification expectation: operators should skip reviewing alerts promptly.'],
    ['first response', '1. Triage the affected release and capture the failure time.', '1. We will bypass triage of alerts and investigation of failures.'],
    ['owner', 'Owner: On-call Maintainer.', 'Owner: we cannot assign the On-call Maintainer.'],
  ])('rejects subject-prefixed or modal-negative monitoring %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/monitoring-and-incident-response.md': monitoringEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('rejects a monitoring owner value that only repeats the incident-owner role label', async () => {
    const root = await createRepository({
      'docs/operations/monitoring-and-incident-response.md': monitoringEvidence.replace(
        'Owner: On-call Maintainer.',
        'Owner: incident owner.',
      ),
    });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['signals', { observedSignals: ['application errors TODO'] }],
    ['review location', { reviewLocation: 'Grafana monitoring dashboard TBD' }],
    ['notification expectation', { notificationExpectation: 'SRE reviews alerts within 10 minutes TODO' }],
    ['first response', { firstResponse: 'triage the alert and investigate failures TODO' }],
    ['owner', { owner: 'SRE team TODO' }],
  ])('rejects a decorated structured placeholder in the monitoring %s field', async (_field, override) => {
    const root = await createRepository({
      'docs/operations/monitoring.json': JSON.stringify({
        ...JSON.parse(jsonMonitoringEvidence),
        ...override,
      }),
    });

    const [finding] = await monitoringResponseCheck.run({ root, manifest: manifest(['backend']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
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

  it.each([
    ['CLI', ['cli'] as ArtifactType[]],
    ['library', ['library'] as ArtifactType[]],
  ])('is applicable to a %s with runtime-service evidence', async (_shape, artifacts) => {
    const root = await createRepository({ 'docs/operations/monitoring-and-incident-response.md': monitoringEvidence });

    const [finding] = await monitoringResponseCheck.run({
      root,
      manifest: manifest(artifacts, ['network-service']),
    });

    expect(finding).toMatchObject({
      id: 'launch-operations.monitoring-response.passed',
      outcome: 'passed',
      evidenceConfidence: 'confirmed',
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
