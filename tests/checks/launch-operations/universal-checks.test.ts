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

  it('does not use excluded ownership evidence', async () => {
    const root = await createRepository({ 'docs/operations/maintenance-ownership.md': ownershipEvidence });

    const [finding] = await maintenanceOwnershipCheck.run({
      root,
      manifest: manifest(['web']),
      excludedArtifactPaths: ['docs/operations/maintenance-ownership.md'],
    });

    expect(finding).toMatchObject({ outcome: 'unverified', evidence: [] });
  });
});
