import { describe, expect, it } from 'vitest';
import { selectOperationsApplicability } from '../../../src/checks/launch-operations/applicability.js';
import type { ArtifactType, CapabilityManifest, Detection } from '../../../src/model/capability.js';

function manifest(
  artifacts: ArtifactType[] = [],
  capabilities: string[] = [],
): CapabilityManifest {
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

describe('selectOperationsApplicability', () => {
  it('selects the documented shape-aware applicability matrix', () => {
    const expected = {
      webService: {
        release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
        health: 'applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      backendWithData: {
        release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
        health: 'applicable', backup: 'applicable', ownership: 'applicable',
      },
      mobile: {
        release: 'applicable', rollback: 'applicable', monitoring: 'applicable',
        health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      cli: {
        release: 'applicable', rollback: 'applicable', monitoring: 'not-applicable',
        health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      library: {
        release: 'applicable', rollback: 'applicable', monitoring: 'not-applicable',
        health: 'not-applicable', backup: 'not-applicable', ownership: 'applicable',
      },
      ambiguous: {
        release: 'applicable', rollback: 'applicable', monitoring: 'unverified',
        health: 'unverified', backup: 'unverified', ownership: 'applicable',
      },
    } as const;
    const manifests = {
      webService: manifest(['web'], ['network-service']),
      backendWithData: manifest(['backend'], ['network-service', 'persistent-data']),
      mobile: manifest(['mobile']),
      cli: manifest(['cli']),
      library: manifest(['library']),
      ambiguous: manifest(),
    } as const;
    const checkIds = {
      release: 'launch-operations.release-process',
      rollback: 'launch-operations.rollback-process',
      monitoring: 'launch-operations.monitoring-response',
      health: 'launch-operations.health-check',
      backup: 'launch-operations.backup-restore',
      ownership: 'launch-operations.maintenance-ownership',
    } as const;

    for (const [shape, expectedChecks] of Object.entries(expected)) {
      const selectedManifest = manifests[shape as keyof typeof manifests];
      for (const [check, status] of Object.entries(expectedChecks)) {
        expect(selectOperationsApplicability(
          checkIds[check as keyof typeof checkIds],
          selectedManifest,
        ).status).toBe(status);
      }
    }
  });

  it.each([
    ['web and backend', ['web', 'backend'] as ArtifactType[], 'service'],
    ['service and worker', ['backend', 'worker'] as ArtifactType[], 'service'],
    ['mobile and desktop', ['mobile', 'desktop'] as ArtifactType[], 'mobile-desktop'],
    ['CLI and library', ['cli', 'library'] as ArtifactType[], 'cli'],
  ])('keeps compatible %s artifacts in their shared profile', (_description, artifacts, profile) => {
    expect(selectOperationsApplicability(
      'launch-operations.rollback-process',
      manifest(artifacts),
    )).toMatchObject({ status: 'applicable', profile });
  });

  it.each([
    ['service and package', ['backend', 'library'] as ArtifactType[]],
    ['native app and CLI', ['mobile', 'cli'] as ArtifactType[]],
    ['worker and desktop app', ['worker', 'desktop'] as ArtifactType[]],
  ])('keeps incompatible mixed shape %s explicit', (_description, artifacts) => {
    const selectedManifest = manifest(artifacts);

    expect(selectOperationsApplicability(
      'launch-operations.release-process',
      selectedManifest,
    )).toMatchObject({ status: 'applicable', profile: 'ambiguous' });
    expect(selectOperationsApplicability(
      'launch-operations.rollback-process',
      selectedManifest,
    )).toMatchObject({ status: 'applicable', profile: 'ambiguous' });
    expect(selectOperationsApplicability(
      'launch-operations.maintenance-ownership',
      selectedManifest,
    )).toMatchObject({ status: 'applicable', profile: 'ambiguous' });

    for (const checkId of [
      'launch-operations.monitoring-response',
      'launch-operations.health-check',
      'launch-operations.backup-restore',
    ] as const) {
      expect(selectOperationsApplicability(checkId, selectedManifest)).toMatchObject({
        status: 'unverified',
        profile: 'ambiguous',
      });
    }
  });

  it.each([
    ['web', ['web'] as ArtifactType[]],
    ['backend', ['backend'] as ArtifactType[]],
    ['worker', ['worker'] as ArtifactType[]],
    ['mobile', ['mobile'] as ArtifactType[]],
    ['desktop', ['desktop'] as ArtifactType[]],
    ['cli', ['cli'] as ArtifactType[]],
    ['library', ['library'] as ArtifactType[]],
  ])('applies capability-gated checks consistently for a %s', (_description, artifacts) => {
    const networkOnly = manifest(artifacts, ['network-service']);
    const dataOnly = manifest(artifacts, ['persistent-data']);
    const both = manifest(artifacts, ['network-service', 'persistent-data']);

    expect(selectOperationsApplicability('launch-operations.health-check', networkOnly).status).toBe('applicable');
    expect(selectOperationsApplicability('launch-operations.backup-restore', dataOnly).status).toBe('applicable');
    expect(selectOperationsApplicability('launch-operations.health-check', both).status).toBe('applicable');
    expect(selectOperationsApplicability('launch-operations.backup-restore', both).status).toBe('applicable');
  });

  it.each([
    ['CLI', ['cli'] as ArtifactType[]],
    ['library', ['library'] as ArtifactType[]],
  ])('makes monitoring applicable to a %s with runtime-service evidence', (_description, artifacts) => {
    expect(selectOperationsApplicability(
      'launch-operations.monitoring-response',
      manifest(artifacts, ['network-service']),
    )).toMatchObject({ status: 'applicable' });
  });

  it.each([
    'extension',
    'ai-agent',
    'infrastructure',
    'monorepo',
  ] as const)('keeps the unsupported %s artifact shape ambiguous', (artifact) => {
    expect(selectOperationsApplicability(
      'launch-operations.monitoring-response',
      manifest([artifact]),
    )).toMatchObject({ status: 'unverified', profile: 'ambiguous' });
  });
});
