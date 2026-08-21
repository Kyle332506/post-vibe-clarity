import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { maintenanceOwnershipCheck } from '../../../src/checks/launch-operations/maintenance-ownership.js';
import { releaseProcessCheck } from '../../../src/checks/launch-operations/release-process.js';
import type { ArtifactType, CapabilityManifest, Detection } from '../../../src/model/capability.js';

const temporaryRoots: string[] = [];

const releaseEvidence = `# Release and deployment

Target: production environment.
Prerequisites: obtain the approved release revision and required access through the documented credential process.
1. Build the release artifact.
2. Publish it to the production target.
Verification: run the documented smoke test and confirm the expected version.
Owner: Release Maintainer.
`;

const ownershipEvidence = `# Maintenance ownership

Owner: Project Maintainers.
Support route: repository issues.
Review cadence: dependency and platform updates are reviewed monthly.
Handoff: update this document and CODEOWNERS before ownership changes.
`;

const fieldLocalReleaseEvidence = `# Release and deployment

Artifact: web service container image.
Target: production environment.
Prerequisites: obtain the approved revision and required access through the documented credential process.
1. Build the selected output from the approved revision.
2. Publish the selected output to the documented destination.
Verification: run the documented smoke test and confirm the expected version.
Owner: Release Maintainer.
`;

const releaseStructuredValues = {
  artifact: 'web service container image',
  target: 'production environment',
  prerequisites: 'obtain the approved revision and required access through the documented credential process',
  procedure: ['build the selected deliverable from the approved revision', 'publish it to the documented destination'],
  verification: 'run the documented smoke test and confirm the expected version',
  owner: 'Release Maintainer',
} as const;

const fieldLocalOwnershipEvidence = `# Maintenance ownership

Owner: Project Maintainers.
Support route: report user problems through repository issues.
Review cadence: review dependency and platform updates every month.
Handoff: update this guide and CODEOWNERS before the responsible team changes.
`;

const ownershipStructuredValues = {
  owner: 'Project Maintainers',
  supportRoute: 'report user problems through repository issues',
  reviewCadence: 'review dependency and platform updates every month',
  handoff: 'update this guide and CODEOWNERS before the responsible team changes',
} as const;

afterEach(async () => {
  await Promise.all(temporaryRoots.splice(0).map((root) => rm(root, { force: true, recursive: true })));
});

async function createRepository(files: Record<string, string>): Promise<string> {
  const root = await mkdtemp(join(tmpdir(), 'postvibe-universal-operations-check-'));
  temporaryRoots.push(root);
  await Promise.all(Object.entries(files).map(async ([location, contents]) => {
    const path = join(root, location);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, contents);
  }));
  return root;
}

function manifest(artifacts: ArtifactType[]): CapabilityManifest {
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

describe('releaseProcessCheck', () => {
  it('returns resolve-before-launch when release evidence is missing', async () => {
    const root = await createRepository({ 'README.md': 'Project overview.\n' });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.release-process.unverified',
      outcome: 'unverified',
      actionLevel: 'resolve-before-launch',
      domains: ['release-delivery'],
      evidence: [],
      humanReviewRequired: true,
    });
  });

  it('does not accept a release filename without usable content', async () => {
    const root = await createRepository({ 'docs/operations/release-and-deployment.md': 'Project overview.\n' });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      outcome: 'unverified',
      evidence: [],
      evidenceConfidence: 'insufficient',
    });
  });

  it('accepts distributed release evidence and records the repository-only live boundary', async () => {
    const root = await createRepository({
      'docs/operations/release-and-deployment.md': releaseEvidence.slice(0, releaseEvidence.indexOf('1. Build')),
      'runbooks/release.md': releaseEvidence.slice(releaseEvidence.indexOf('1. Build')),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.release-process.passed',
      outcome: 'passed',
      actionLevel: 'resolve-before-launch',
      domains: ['release-delivery'],
      evidenceConfidence: 'confirmed',
      humanReviewRequired: false,
      unverifiedBoundaries: ['No deployment, registry, or store was queried.'],
    });
    expect(finding?.evidence.map(({ location }) => location)).toEqual([
      'docs/operations/release-and-deployment.md',
      'runbooks/release.md',
    ]);
  });

  it('does not use excluded release evidence', async () => {
    const root = await createRepository({ 'docs/operations/release-and-deployment.md': releaseEvidence });

    const [finding] = await releaseProcessCheck.run({
      root,
      manifest: manifest(['web']),
      excludedArtifactPaths: ['docs/operations/release-and-deployment.md'],
    });

    expect(finding).toMatchObject({ outcome: 'unverified', evidence: [] });
  });

  it('uses publishing language for CLI and library releases, and deployment language for services', async () => {
    const root = await createRepository({ 'docs/operations/release-and-deployment.md': releaseEvidence });

    const [cliFinding] = await releaseProcessCheck.run({ root, manifest: manifest(['cli']) });
    const [libraryFinding] = await releaseProcessCheck.run({ root, manifest: manifest(['library']) });
    const [serviceFinding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(cliFinding?.applicability).toMatch(/publishing/iu);
    expect(libraryFinding?.applicability).toMatch(/publishing/iu);
    expect(serviceFinding?.applicability).toMatch(/deployment/iu);
  });

  it.each([
    ['plain prose', 'docs/operations/release.txt', `We ship a web service container image.
It is sent to the production environment.
The maintainer obtains the approved revision and required access through the documented credential process.
The release maintainer builds the selected deliverable and then publishes it to the documented destination.
After release, the release maintainer runs the documented smoke test and confirms the expected version.
The Release Maintainer owns this procedure.
`],
    ['JSON', 'docs/operations/release.json', JSON.stringify(releaseStructuredValues)],
    ['YAML', 'docs/operations/release.yaml', `artifact: web service container image
target: production environment
prerequisites: obtain the approved revision and required access through the documented credential process
procedure:
  - build the selected deliverable from the approved revision
  - publish it to the documented destination
verification: run the documented smoke test and confirm the expected version
owner: Release Maintainer
`],
    ['TOML', 'docs/operations/release.toml', `artifact = "web service container image"
target = "production environment"
prerequisites = "obtain the approved revision and required access through the documented credential process"
procedure = ["build the selected deliverable from the approved revision", "publish it to the documented destination"]
verification = "run the documented smoke test and confirm the expected version"
owner = "Release Maintainer"
`],
  ])('accepts credible %s release evidence', async (_format, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['artifact', 'Artifact: web service container image.', 'Artifact: release artifact TODO.'],
    ['target', 'Target: production environment.', 'Target: production target TBD.'],
    ['prerequisites', 'Prerequisites: obtain the approved revision and required access through the documented credential process.', 'Prerequisites: required access TODO.'],
    ['procedure', '1. Build the selected output from the approved revision.\n2. Publish the selected output to the documented destination.', '1. TODO publish the selected output.\n2. TODO deploy the selected output.'],
    ['verification', 'Verification: run the documented smoke test and confirm the expected version.', 'Verification: verify expected version TBD.'],
    ['owner', 'Owner: Release Maintainer.', 'Owner: owner TBD.'],
  ])('rejects a placeholder in the release %s field', async (_field, validLine, placeholderLine) => {
    const root = await createRepository({
      'docs/operations/release-and-deployment.md': fieldLocalReleaseEvidence.replace(validLine, placeholderLine),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('rejects a release owner value that only decorates the maintainer label', async () => {
    const root = await createRepository({
      'docs/operations/release-and-deployment.md': fieldLocalReleaseEvidence.replace(
        'Owner: Release Maintainer.',
        'Owner: documented maintainer.',
      ),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['artifact', 'Artifact: web service container image.', 'Artifact: skip the web service artifact someday.'],
    ['target', 'Target: production environment.', 'Target: avoid the production environment someday.'],
    ['prerequisites', 'Prerequisites: obtain the approved revision and required access through the documented credential process.', 'Prerequisites: skip required access and use the approved revision someday.'],
    ['procedure', '1. Build the selected output from the approved revision.\n2. Publish the selected output to the documented destination.', '1. Skip deploy of the selected output someday.\n2. Avoid publishing the selected output someday.'],
    ['verification', 'Verification: run the documented smoke test and confirm the expected version.', 'Verification: avoid the smoke test and check the expected version someday.'],
    ['owner', 'Owner: Release Maintainer.', 'Owner: avoid the Release Maintainer role someday.'],
  ])('rejects negative or vague release %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/release-and-deployment.md': fieldLocalReleaseEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('rejects a release owner value that only repeats the release-owner role label', async () => {
    const root = await createRepository({
      'docs/operations/release-and-deployment.md': fieldLocalReleaseEvidence.replace(
        'Owner: Release Maintainer.',
        'Owner: release owner.',
      ),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('rejects a release owner value that only repeats the release-team label', async () => {
    const root = await createRepository({
      'docs/operations/release-and-deployment.md': fieldLocalReleaseEvidence.replace(
        'Owner: Release Maintainer.',
        'Owner: release team.',
      ),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['artifact', 'Artifact: web service container image.', 'Artifact: we cannot release the web service artifact.'],
    ['target', 'Target: production environment.', 'Target: the team will avoid the production environment.'],
    ['prerequisites', 'Prerequisites: obtain the approved revision and required access through the documented credential process.', 'Prerequisites: we cannot obtain the approved revision and required access.'],
    ['procedure', '1. Build the selected output from the approved revision.\n2. Publish the selected output to the documented destination.', '1. Operators should skip deploying the selected output.\n2. The team will avoid publishing the selected output.'],
    ['verification', 'Verification: run the documented smoke test and confirm the expected version.', 'Verification: we will ignore the smoke test and check the expected version.'],
    ['owner', 'Owner: Release Maintainer.', 'Owner: we cannot assign the Release Maintainer.'],
  ])('rejects subject-prefixed or modal-negative release %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/release-and-deployment.md': fieldLocalReleaseEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it('rejects uppercase lookalikes for exact structured release aliases', async () => {
    const root = await createRepository({
      'docs/operations/release.json': JSON.stringify({
        ARTIFACT: releaseStructuredValues.artifact,
        TARGET: releaseStructuredValues.target,
        PREREQUISITES: releaseStructuredValues.prerequisites,
        PROCEDURE: releaseStructuredValues.procedure,
        VERIFICATION: releaseStructuredValues.verification,
        OWNER: releaseStructuredValues.owner,
      }),
    });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['JSON', 'docs/operations/release.json', JSON.stringify({ artifact: 'release artifact TODO', target: 'production target TBD', prerequisites: 'required access unknown', procedure: ['TODO publish package'], verification: 'verify expected version TBD', owner: 'owner unassigned' })],
    ['YAML', 'docs/operations/release.yaml', 'artifact: release artifact TODO\ntarget: production target TBD\nprerequisites: required access unknown\nprocedure: [TODO publish package]\nverification: verify expected version TBD\nowner: owner unassigned\n'],
    ['TOML', 'docs/operations/release.toml', 'artifact = "release artifact TODO"\ntarget = "production target TBD"\nprerequisites = "required access unknown"\nprocedure = ["TODO publish package"]\nverification = "verify expected version TBD"\nowner = "owner unassigned"\n'],
  ])('rejects placeholder-only release fields in %s', async (_format, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await releaseProcessCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });
});

describe('maintenanceOwnershipCheck', () => {
  it('returns plan-soon when ownership evidence is missing', async () => {
    const root = await createRepository({ 'README.md': 'Project overview.\n' });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.maintenance-ownership.unverified',
      outcome: 'unverified',
      actionLevel: 'plan-soon',
      domains: ['maintainability-change-safety'],
      evidence: [],
      humanReviewRequired: true,
    });
  });

  it('does not accept an ownership filename without usable content', async () => {
    const root = await createRepository({ 'docs/operations/maintenance-ownership.md': 'Project overview.\n' });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      outcome: 'unverified',
      evidence: [],
      evidenceConfidence: 'insufficient',
    });
  });

  it('accepts distributed ownership evidence', async () => {
    const root = await createRepository({
      'docs/operations/maintenance-ownership.md': ownershipEvidence.slice(0, ownershipEvidence.indexOf('Review cadence')),
      'docs/ownership.md': ownershipEvidence.slice(ownershipEvidence.indexOf('Review cadence')),
    });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.maintenance-ownership.passed',
      outcome: 'passed',
      actionLevel: 'plan-soon',
      domains: ['maintainability-change-safety'],
      evidenceConfidence: 'confirmed',
      humanReviewRequired: false,
    });
    expect(finding?.evidence.map(({ location }) => location)).toEqual([
      'docs/operations/maintenance-ownership.md',
      'docs/ownership.md',
    ]);
  });

  it.each([
    '.github/CODEOWNERS',
    'MAINTAINERS',
  ])('accepts complete ownership evidence from the extensionless %s convention', async (location) => {
    const root = await createRepository({ [location]: ownershipEvidence });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({
      id: 'launch-operations.maintenance-ownership.passed',
      outcome: 'passed',
      evidenceConfidence: 'confirmed',
    });
    expect(finding?.evidence.map(({ location: evidenceLocation }) => evidenceLocation)).toEqual([location]);
  });

  it('does not use excluded ownership evidence', async () => {
    const root = await createRepository({ 'docs/operations/maintenance-ownership.md': ownershipEvidence });

    const [finding] = await maintenanceOwnershipCheck.run({
      root,
      manifest: manifest(['web']),
      excludedArtifactPaths: ['docs/operations/maintenance-ownership.md'],
    });

    expect(finding).toMatchObject({ outcome: 'unverified', evidence: [] });
  });

  it('does not use excluded extensionless ownership evidence', async () => {
    const root = await createRepository({ '.github/CODEOWNERS': ownershipEvidence });

    const [finding] = await maintenanceOwnershipCheck.run({
      root,
      manifest: manifest(['web']),
      excludedArtifactPaths: ['.github/CODEOWNERS'],
    });

    expect(finding).toMatchObject({ outcome: 'unverified', evidence: [] });
  });

  it.each([
    ['plain prose', 'docs/operations/ownership.txt', `The Project Maintainers own ongoing maintenance.
Users report problems through repository issues.
The maintainers review dependency and platform updates every month.
Before the responsible team changes, they update this guide and CODEOWNERS for handoff.
`],
    ['JSON', 'docs/operations/ownership.json', JSON.stringify(ownershipStructuredValues)],
    ['YAML', 'docs/operations/ownership.yaml', `owner: Project Maintainers
support_route: report user problems through repository issues
review_cadence: review dependency and platform updates every month
handoff: update this guide and CODEOWNERS before the responsible team changes
`],
    ['TOML', 'docs/operations/ownership.toml', `owner = "Project Maintainers"
support_route = "report user problems through repository issues"
review_cadence = "review dependency and platform updates every month"
handoff = "update this guide and CODEOWNERS before the responsible team changes"
`],
  ])('accepts credible %s maintenance ownership evidence', async (_format, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'passed', evidenceConfidence: 'confirmed' });
  });

  it.each([
    ['owner', 'Owner: Project Maintainers.', 'Owner: owner TBD.'],
    ['support route', 'Support route: report user problems through repository issues.', 'Support route: support route unknown.'],
    ['review cadence', 'Review cadence: review dependency and platform updates every month.', 'Review cadence: dependency review pending.'],
    ['handoff', 'Handoff: update this guide and CODEOWNERS before the responsible team changes.', 'Handoff: handoff TODO.'],
  ])('rejects a placeholder in the maintenance %s field', async (_field, validLine, placeholderLine) => {
    const root = await createRepository({
      'docs/operations/maintenance-ownership.md': fieldLocalOwnershipEvidence.replace(validLine, placeholderLine),
    });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['owner', 'Owner: Project Maintainers.', 'Owner: avoid Project Maintainers someday.'],
    ['support route', 'Support route: report user problems through repository issues.', 'Support route: avoid all contact through repository issues someday.'],
    ['review cadence', 'Review cadence: review dependency and platform updates every month.', 'Review cadence: skip dependency updates reviewed monthly someday.'],
    ['handoff', 'Handoff: update this guide and CODEOWNERS before the responsible team changes.', 'Handoff: skip update of CODEOWNERS when the owner changes someday.'],
  ])('rejects negative or vague maintenance %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/maintenance-ownership.md': fieldLocalOwnershipEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['owner', 'Owner: Project Maintainers.', 'Owner: we cannot assign the Project Maintainers.'],
    ['support route', 'Support route: report user problems through repository issues.', 'Support route: the team will avoid all contact through repository issues.'],
    ['review cadence', 'Review cadence: review dependency and platform updates every month.', 'Review cadence: operators should skip dependency updates reviewed monthly.'],
    ['handoff', 'Handoff: update this guide and CODEOWNERS before the responsible team changes.', 'Handoff: we will ignore the update of CODEOWNERS when the owner changes.'],
  ])('rejects subject-prefixed or modal-negative maintenance %s evidence', async (_field, validLine, invalidLine) => {
    const root = await createRepository({
      'docs/operations/maintenance-ownership.md': fieldLocalOwnershipEvidence.replace(validLine, invalidLine),
    });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });

  it.each([
    ['JSON', 'docs/operations/ownership.json', JSON.stringify({ owner: 'owner TBD', supportRoute: 'support unknown', reviewCadence: 'dependency review pending', handoff: 'handoff TODO' })],
    ['YAML', 'docs/operations/ownership.yaml', 'owner: owner TBD\nsupport_route: support unknown\nreview_cadence: dependency review pending\nhandoff: handoff TODO\n'],
    ['TOML', 'docs/operations/ownership.toml', 'owner = "owner TBD"\nsupport_route = "support unknown"\nreview_cadence = "dependency review pending"\nhandoff = "handoff TODO"\n'],
  ])('rejects placeholder-only maintenance fields in %s', async (_format, location, evidence) => {
    const root = await createRepository({ [location]: evidence });

    const [finding] = await maintenanceOwnershipCheck.run({ root, manifest: manifest(['web']) });

    expect(finding).toMatchObject({ outcome: 'unverified', evidenceConfidence: 'insufficient' });
  });
});
