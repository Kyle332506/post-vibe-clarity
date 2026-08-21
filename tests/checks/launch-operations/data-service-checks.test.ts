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

const structuredHealthEvidence = {
  probe: 'GET /health',
  healthyResult: 'HTTP 200 with status ok',
  coverage: 'process availability only; does not verify every dependency',
  failureHandling: 'monitoring notifies the on-call maintainer',
  owner: 'On-call Maintainer',
};

const structuredBackupRestoreEvidence = {
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
};

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
      'deploy/health.json': JSON.stringify(structuredHealthEvidence),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['slash comments', 'src/health.ts', `// app.get('/health', () => response.status(200).json({ status: 'ok' }));
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
`],
    ['hash comments', 'src/health.py', `# app.get('/health', lambda: response.status(200))
# Coverage: process availability only; this does not verify every dependency.
# Failure handling: monitoring notifies the on-call maintainer.
# Owner: On-call Maintainer.
`],
    ['closed block comments', 'src/health.go', `/*
app.get('/health', () => response.status(200).json({ status: 'ok' }));
Coverage: process availability only; this does not verify every dependency.
Failure handling: monitoring notifies the on-call maintainer.
Owner: On-call Maintainer.
*/
`],
    ['an unclosed block comment', 'src/health.ts', `/*
app.get('/health', () => response.status(200).json({ status: 'ok' }));
Coverage: process availability only; this does not verify every dependency.
Failure handling: monitoring notifies the on-call maintainer.
Owner: On-call Maintainer.
`],
  ])('keeps health evidence found only in %s unverified', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.health-check.unverified',
      outcome: 'unverified',
      evidenceConfidence: 'insufficient',
    });
  });

  it.each([
    ['an assigned string', 'src/health.ts', `const example = "app.get('/health', () => response.status(200).json({ status: 'ok' }))";
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
`],
    ['a standalone string', 'src/health.py', `'app.get("/health", lambda: response.status(200))'
# Coverage: process availability only; this does not verify every dependency.
# Failure handling: monitoring notifies the on-call maintainer.
# Owner: On-call Maintainer.
`],
    ['a template string', 'src/health.ts', 'const example = `app.get(\'/health\', () => response.status(200))`;\n'
      + '// Coverage: process availability only; this does not verify every dependency.\n'
      + '// Failure handling: monitoring notifies the on-call maintainer.\n'
      + '// Owner: On-call Maintainer.\n'],
  ])('keeps complete route and result text in %s unverified', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('keeps apparent health code in a JavaScript line-continuation string unverified', async () => {
    const root = await createRepository({
      'src/health.ts': 'const example = "\\\n'
        + "app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));\";\n"
        + '// Coverage: process availability only; this does not verify every dependency.\n'
        + '// Failure handling: monitoring notifies the on-call maintainer.\n'
        + '// Owner: On-call Maintainer.\n',
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('keeps a multiline JavaScript template containing complete apparent health evidence unverified', async () => {
    const root = await createRepository({
      'src/health.ts': `const documentation = \`
app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
Coverage: process availability only; this does not verify every dependency.
Failure handling: monitoring notifies the on-call maintainer.
Owner: On-call Maintainer.
\`;
`,
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('does not borrow descriptive health prose from a template beside a real route', async () => {
    const root = await createRepository({
      'src/health.ts': `const documentation = \`
Coverage: process availability only; this does not verify every dependency.
Failure handling: monitoring notifies the on-call maintainer.
Owner: On-call Maintainer.
\`;
app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
`,
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('keeps adjacent multiline JavaScript templates containing apparent health evidence unverified', async () => {
    const root = await createRepository({
      'src/health.ts': `const first = \`
unrelated prose
\`, documentation = \`
app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
\`;
const sentinel = \`closed\`;
`,
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['a Python module docstring', 'src/health.py', `"""Example syntax: app.get('/health') and response.status(200)."""
@app.get('/health')
def health():
    return {"status": "ok"}, 200
# Coverage: process availability only; this does not verify every dependency.
# Failure handling: monitoring notifies the on-call maintainer.
# Owner: On-call Maintainer.
`],
    ['a JavaScript regex literal containing quotes', 'src/readiness.js', `const quotePattern = /["']/u;
app.get('/readiness', (_request, response) => response.status(200).json({ status: 'ok' }));
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
`],
    ['a JavaScript regex literal containing a backtick', 'src/health.ts', 'const backtickPattern = /`/u;\n'
      + "app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));\n"
      + '// Coverage: process availability only; this does not verify every dependency.\n'
      + '// Failure handling: monitoring notifies the on-call maintainer.\n'
      + '// Owner: On-call Maintainer.\n'],
    ['a continued JavaScript division expression', 'src/health.ts', `const total = 10;
const count = 2;
const ratio = total
  / count;
app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
`],
    ['a JSX closing tag', 'src/health.tsx', `const element = <div>status</div>;
app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
`],
    ['a Ruby documentation block', 'src/health.rb', `=begin
Example only: get '/health' do response.status(200) end
=end
get '/health' do
  status 200
end
# Coverage: process availability only; this does not verify every dependency.
# Failure handling: monitoring notifies the on-call maintainer.
# Owner: On-call Maintainer.
`],
    ['a Java route line', 'src/liveness.java', `router.get("/liveness", request -> response.status(200));
// Coverage: process availability only; this does not verify every dependency.
// Failure handling: monitoring notifies the on-call maintainer.
// Owner: On-call Maintainer.
`],
  ])('accepts a real narrow source route following %s', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['probe', 'Probe: GET /health.', 'Probe: pending; GET /health.'],
    ['healthy result', 'Healthy result: HTTP 200 with status ok.', 'Healthy result: missing; HTTP 200 with status ok.'],
    ['coverage', 'Coverage: the probe checks process availability but does not verify every dependency.', 'Coverage: unavailable; process availability does not verify every dependency.'],
    ['failure handling', 'Failure handling: the monitoring system notifies the on-call maintainer.', 'Failure handling: pending; monitoring notifies the on-call maintainer.'],
    ['owner', 'Owner: On-call Maintainer.', 'Owner: missing; Database Administrator.'],
  ])('rejects a health %s placeholder even when useful evidence follows', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/health-check.md': healthEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['probe', { probe: 'pending; GET /health' }],
    ['healthy result', { healthyResult: 'missing; HTTP 200 with status ok' }],
    ['coverage', { coverage: 'unavailable; process availability does not verify every dependency' }],
    ['failure handling', { failureHandling: 'pending; monitoring notifies the on-call maintainer' }],
    ['owner', { owner: 'missing; Database Administrator' }],
  ])('rejects a structured health %s placeholder even when useful evidence follows', async (_field, override) => {
    const root = await createRepository({
      'deploy/health.json': JSON.stringify({ ...structuredHealthEvidence, ...override }),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['negative probe', 'Probe: GET /health.', 'Probe: no probe is assigned; GET /health.'],
    ['negative healthy result', 'Healthy result: HTTP 200 with status ok.', 'Healthy result: not ok.'],
    ['negative coverage', 'Coverage: the probe checks process availability but does not verify every dependency.', 'Coverage: no dependency scope is assigned; does not verify every dependency.'],
    ['disabled failure handling', 'Failure handling: the monitoring system notifies the on-call maintainer.', 'Failure handling: alerts disabled.'],
    ['unassigned owner', 'Owner: On-call Maintainer.', 'Owner: not assigned; On-call Maintainer.'],
  ])('rejects Markdown health evidence with %s', async (_description, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/health-check.md': healthEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['negative probe', { probe: 'no probe is assigned; GET /health' }],
    ['negative healthy result', { healthyResult: 'not ok' }],
    ['negative coverage', { coverage: 'no dependency scope is assigned; does not verify every dependency' }],
    ['disabled failure handling', { failureHandling: 'alerts disabled' }],
    ['unassigned owner', { owner: 'not assigned; On-call Maintainer' }],
  ])('rejects structured health evidence with %s', async (_description, override) => {
    const root = await createRepository({
      'deploy/health.json': JSON.stringify({ ...structuredHealthEvidence, ...override }),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['TBA probe', 'Probe: GET /health.', 'Probe: TBA; GET /health.'],
    ['TBA owner', 'Owner: On-call Maintainer.', 'Owner: TBA; On-call Maintainer.'],
    ['unassigned owner', 'Owner: On-call Maintainer.', 'Owner: unassigned; On-call Maintainer.'],
    ['deferred failure handling', 'Failure handling: the monitoring system notifies the on-call maintainer.', 'Failure handling: to be assigned; monitoring notifies the on-call maintainer.'],
    ['owner label echo', 'Owner: On-call Maintainer.', 'Owner: documented owner.'],
    ['decorated owner label echo', 'Owner: On-call Maintainer.', 'Owner: fully documented owner.'],
    ['assignment-only owner label echo', 'Owner: On-call Maintainer.', 'Owner: currently assigned owner.'],
    ['adverb-decorated owner label echo', 'Owner: On-call Maintainer.', 'Owner: clearly documented owner.'],
    ['hyphenated owner label echo', 'Owner: On-call Maintainer.', 'Owner: currently-assigned owner.'],
  ])('rejects Markdown health evidence with incomplete or echoed %s', async (_description, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/health-check.md': healthEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['TBA probe', { probe: 'TBA; GET /health' }],
    ['TBA owner', { owner: 'TBA; On-call Maintainer' }],
    ['unassigned owner', { owner: 'unassigned; On-call Maintainer' }],
    ['deferred failure handling', { failureHandling: 'awaiting assignment; monitoring notifies the on-call maintainer' }],
    ['owner label echo', { owner: 'documented owner' }],
    ['decorated owner label echo', { owner: 'fully documented owner' }],
    ['assignment-only owner label echo', { owner: 'currently assigned owner' }],
    ['adverb-decorated owner label echo', { owner: 'properly assigned owner' }],
  ])('rejects structured health evidence with incomplete or echoed %s', async (_description, override) => {
    const root = await createRepository({
      'deploy/health.json': JSON.stringify({ ...structuredHealthEvidence, ...override }),
    });

    const [finding] = await healthCheck.run({ root, manifest: manifest(['backend'], ['network-service']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
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
      'docs/operations/backup.json': JSON.stringify(structuredBackupRestoreEvidence),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['tautological data', /^Data:.*$/mu, 'Data: data.'],
    ['tautological mechanism', /^Backup mechanism:.*$/mu, 'Backup mechanism: backup.'],
    ['frequency without a quantity', /^Frequency:.*$/mu, 'Frequency: hours.'],
    ['retention without a quantity', /^Retention:.*$/mu, 'Retention: days.'],
    ['tautological restore procedure', /^1\..*\n2\..*$/mu, 'Restore procedure: restore.'],
    ['unknown recovery time', /^Recovery time expectation:.*$/mu, 'Recovery time expectation: no four hour target.'],
    ['placeholder owner', /^Owner:.*$/mu, 'Owner: none.'],
    ['disabled failure notification', /^Failure notification:.*$/mu, 'Failure notification: alerts disabled.'],
    ['testing without an environment', /^Restore testing:.*$/mu, 'Restore testing: quarterly.'],
    ['tautological boundary', /^Boundaries:.*$/mu, 'Boundaries: boundary.'],
  ])('rejects Markdown backup evidence with %s', async (_description, validPattern, invalidLine) => {
    const root = await createRepository({
      'docs/operations/backup-and-restore.md': backupRestoreEvidence.replace(validPattern, invalidLine),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['negative data', { data: 'no database is identified' }],
    ['disabled mechanism', { backupMechanism: 'backups are disabled' }],
    ['unknown frequency', { frequency: 'unknown 24 hours' }],
    ['placeholder retention', { retention: 'n/a 30 days' }],
    ['negative restore steps', { restoreSteps: ['do not restore the database'] }],
    ['negative recovery time', { recoveryTimeExpectation: 'no four hour target' }],
    ['placeholder owner', { owner: 'none; owner unknown' }],
    ['disabled notification', { failureNotification: 'alerts are disabled' }],
    ['disabled restoration test', { restoreTesting: 'never test quarterly in a recovery environment' }],
    ['unknown boundary', { boundaries: 'boundary unknown; credentials' }],
  ])('rejects structured backup evidence with %s', async (_description, override) => {
    const root = await createRepository({
      'docs/operations/backup.json': JSON.stringify({ ...structuredBackupRestoreEvidence, ...override }),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['generic data', /^Data:.*$/mu, 'Data: database.'],
    ['semantic negative data', /^Data:.*$/mu, 'Data: the provider has no database assigned; customer records.'],
    ['label-echo restore action', /^1\..*\n2\..*$/mu, 'Restore procedure: run the restore procedure.'],
    ['generic owner role', /^Owner:.*$/mu, 'Owner: owner.'],
    ['generic team role', /^Owner:.*$/mu, 'Owner: team.'],
    ['negated frequency', /^Frequency:.*$/mu, 'Frequency: not applicable; 24 hours.'],
    ['unperformed restoration test', /^Restore testing:.*$/mu, 'Restore testing: not performed quarterly in the recovery environment.'],
  ])('rejects normalized Markdown backup evidence with %s', async (_description, validPattern, invalidLine) => {
    const root = await createRepository({
      'docs/operations/backup-and-restore.md': backupRestoreEvidence.replace(validPattern, invalidLine),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['generic data', { data: 'database' }],
    ['semantic negative data', { data: 'the provider has no database assigned; customer records' }],
    ['label-echo restore action', { restoreSteps: ['run the restore procedure'] }],
    ['generic owner role', { owner: 'owner' }],
    ['generic team role', { owner: 'team' }],
    ['negated frequency', { frequency: 'not applicable; 24 hours' }],
    ['unperformed restoration test', { restoreTesting: 'not performed quarterly in the recovery environment' }],
  ])('rejects normalized structured backup evidence with %s', async (_description, override) => {
    const root = await createRepository({
      'docs/operations/backup.json': JSON.stringify({ ...structuredBackupRestoreEvidence, ...override }),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['data', /^Data:.*$/mu, 'Data: pending; the production PostgreSQL cluster.'],
    ['mechanism', /^Backup mechanism:.*$/mu, 'Backup mechanism: unavailable; provider-managed encrypted snapshots.'],
    ['frequency', /^Frequency:.*$/mu, 'Frequency: missing; every 24 hours.'],
    ['retention', /^Retention:.*$/mu, 'Retention: pending; 30 days.'],
    ['restore procedure', /^1\..*\n2\..*$/mu, 'Restore procedure: unavailable; execute the maintained provider recovery runbook.'],
    ['recovery time', /^Recovery time expectation:.*$/mu, 'Recovery time expectation: missing; four hours.'],
    ['owner', /^Owner:.*$/mu, 'Owner: pending; Database Administrator.'],
    ['failure notification', /^Failure notification:.*$/mu, 'Failure notification: unavailable; PagerDuty pages Database Operations.'],
    ['restore testing', /^Restore testing:.*$/mu, 'Restore testing: missing; test quarterly in staging.'],
    ['boundary', /^Boundaries:.*$/mu, 'Boundaries: pending; provider credentials remain outside this repository.'],
  ])('rejects a backup %s placeholder even when useful evidence follows', async (_field, validPattern, invalidLine) => {
    const root = await createRepository({
      'docs/operations/backup-and-restore.md': backupRestoreEvidence.replace(validPattern, invalidLine),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['data', { data: 'pending; the production PostgreSQL cluster' }],
    ['mechanism', { backupMechanism: 'unavailable; provider-managed encrypted snapshots' }],
    ['frequency', { frequency: 'missing; every 24 hours' }],
    ['retention', { retention: 'pending; 30 days' }],
    ['restore procedure', { restoreSteps: ['unavailable; execute the maintained provider recovery runbook'] }],
    ['recovery time', { recoveryTimeExpectation: 'missing; four hours' }],
    ['owner', { owner: 'pending; Database Administrator' }],
    ['failure notification', { failureNotification: 'unavailable; PagerDuty pages Database Operations' }],
    ['restore testing', { restoreTesting: 'missing; test quarterly in staging' }],
    ['boundary', { boundaries: 'pending; provider credentials remain outside this repository' }],
  ])('rejects a structured backup %s placeholder even when useful evidence follows', async (_field, override) => {
    const root = await createRepository({
      'docs/operations/backup.json': JSON.stringify({ ...structuredBackupRestoreEvidence, ...override }),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['TBA mechanism', /^Backup mechanism:.*$/mu, 'Backup mechanism: TBA; provider-managed encrypted snapshots.'],
    ['unassigned owner', /^Owner:.*$/mu, 'Owner: unassigned; Database Administrator.'],
    ['deferred notification', /^Failure notification:.*$/mu, 'Failure notification: awaiting assignment; PagerDuty pages Database Operations.'],
    ['mechanism label echo', /^Backup mechanism:.*$/mu, 'Backup mechanism: documented backup mechanism.'],
    ['decorated mechanism label echo', /^Backup mechanism:.*$/mu, 'Backup mechanism: fully documented backup mechanism.'],
    ['adverb-decorated mechanism label echo', /^Backup mechanism:.*$/mu, 'Backup mechanism: clearly documented backup mechanism.'],
  ])('rejects Markdown backup evidence with incomplete or echoed %s', async (_description, validPattern, invalidLine) => {
    const root = await createRepository({
      'docs/operations/backup-and-restore.md': backupRestoreEvidence.replace(validPattern, invalidLine),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['TBA mechanism', { backupMechanism: 'TBA; provider-managed encrypted snapshots' }],
    ['unassigned owner', { owner: 'unassigned; Database Administrator' }],
    ['deferred notification', { failureNotification: 'to be assigned; PagerDuty pages Database Operations' }],
    ['mechanism label echo', { backupMechanism: 'documented backup mechanism' }],
    ['decorated mechanism label echo', { backupMechanism: 'fully documented backup mechanism' }],
    ['adverb-decorated mechanism label echo', { backupMechanism: 'properly configured backup mechanism' }],
    ['hyphenated mechanism label echo', { backupMechanism: 'properly-configured backup mechanism' }],
  ])('rejects structured backup evidence with incomplete or echoed %s', async (_description, override) => {
    const root = await createRepository({
      'docs/operations/backup.json': JSON.stringify({ ...structuredBackupRestoreEvidence, ...override }),
    });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['Markdown', 'docs/operations/backup-and-restore.md', backupRestoreEvidence
      .replace('Frequency: every 24 hours; acceptable data loss is 24 hours.', 'Frequency: twice per day; acceptable data loss is 12 hours.')
      .replace(/^1\..*\n2\..*$/mu, 'Restore procedure: execute the maintained provider recovery runbook.')],
    ['structured JSON', 'docs/operations/backup.json', JSON.stringify({
      ...structuredBackupRestoreEvidence,
      frequency: 'twice per day',
      restoreSteps: ['execute the maintained provider recovery runbook'],
    })],
  ])('accepts flexible recovery action and cadence wording in %s', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['Markdown', 'docs/operations/backup-and-restore.md', `# Backup and restore

Data: the production PostgreSQL cluster.
Backup mechanism: automated Supabase point-in-time recovery.
Frequency: once per day; acceptable data loss is one day.
Retention: 30 days.
Restore procedure: follow the maintained Supabase recovery runbook.
Recovery time expectation: four hours.
Owner: Database Administrator.
Failure notification: the scheduled job pages Database Operations through PagerDuty.
Restore testing: test quarterly in staging.
Boundaries: provider credentials remain outside this repository.
`],
    ['structured JSON', 'docs/operations/backup.json', JSON.stringify({
      data: 'the production PostgreSQL cluster',
      backupMechanism: 'automated Supabase point-in-time recovery',
      frequency: 'once per day',
      retention: '30 days',
      restoreSteps: ['follow the maintained Supabase recovery runbook'],
      recoveryTimeExpectation: 'four hours',
      owner: 'Database Administrator',
      failureNotification: 'scheduled job pages Database Operations through PagerDuty',
      restoreTesting: 'test quarterly in staging',
      boundaries: 'provider credentials remain outside this repository',
    })],
  ])('accepts credible alternative backup evidence in %s', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

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

  it.each([
    ['a YAML discussion block', 'docs/operations/backup.yaml', `discussion: |
  Backups are disabled.
`],
    ['malformed structured input', 'docs/operations/backup.yaml', `discussion: [
Backups are disabled.
`],
    ['a Markdown fenced block', 'docs/operations/backup.md', `\`\`\`text
Backups are disabled.
\`\`\`
`],
    ['a Markdown blockquote', 'docs/operations/backup.md', '> Backups are disabled.\n'],
    ['indented quoted text', 'docs/operations/backup.md', '    Backups are disabled.\n'],
    ['an explicit quotation', 'docs/operations/backup.md', '“Backups are disabled.”\n'],
    ['a discussion', 'docs/operations/backup.md', 'The guide discusses whether backups are disabled.\n'],
    ['a question', 'docs/operations/backup.md', 'Are backups disabled?\n'],
    ['a tilde-fenced block', 'docs/operations/backup.md', '~~~text\nBackups are disabled.\n~~~\n'],
    ['mixed visual indentation', 'docs/operations/backup.md', ' \t Backups are disabled.\n'],
    ['a lazy blockquote continuation', 'docs/operations/backup.md', '> The runbook quotes an example:\nBackups are disabled.\n'],
    ['a multiline explicit quotation', 'docs/operations/backup.md', '“The vendor example says:\nBackups are disabled.\n”\n'],
    ['an HTML preformatted block', 'docs/operations/backup.md', '<pre>\nBackups are disabled.\n</pre>\n'],
    ['a Unicode quotation after introductory prose', 'docs/operations/backup.md', 'The guide says, “\nBackups are disabled.\n”\n'],
    ['an unpunctuated Unicode quotation after introductory prose', 'docs/operations/backup.md', 'The guide says “\nBackups are disabled.\n”\n'],
    ['an ASCII quotation after introductory prose', 'docs/operations/backup.md', 'The guide says, "\nThere is no restore path.\n"\n'],
    ['an ASCII single quotation after introductory prose', 'docs/operations/backup.md', "The guide says, '\nBackups are disabled.\n'\n"],
    ['a second multiline ASCII quotation after an inline quote', 'docs/operations/backup.md', 'The guide calls this "an example" and then says "\nThere is no restore path.\n"\n'],
  ])('keeps risky language in %s unverified', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.backup-restore.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
    });
  });

  it.each([
    ['leading whitespace in text', 'docs/operations/backup.txt', '    Backups are disabled.\n'],
    ['CRLF Markdown', 'docs/operations/backup.md', 'Backups are disabled.\r\n'],
    ['an apostrophe and contraction in Markdown prose', 'docs/operations/backup.md', "The project's warning isn't hypothetical.\nBackups are disabled.\n"],
    ['an apostrophe abbreviation in Markdown prose', 'docs/operations/backup.md', "The '24 launch remains active.\nBackups are disabled.\n"],
  ])('keeps a standalone affirmative risky statement with %s as a likely issue', async (_description, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await backupRestoreCheck.run({ root, manifest: manifest(['backend'], ['persistent-data']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.backup-restore.likely-issue',
      outcome: 'likely-issue',
      actionLevel: 'stop-before-launch',
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
